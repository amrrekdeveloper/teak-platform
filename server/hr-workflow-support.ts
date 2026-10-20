import { createHash } from "node:crypto";
import { pool, db } from "./db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { hrActions, employees, departmentEnum, type HrAction, type InsertHrAction } from "../shared/schema";
import { normalizeEmployeePhone } from "./employee-portal/security";
import { HR_WORKFLOWS, canPerformAdministrativeHrStep } from "../shared/hr-workflows";

export async function initHrWorkflowSupport() {
  await pool.query(`ALTER TYPE attendance_permission_status ADD VALUE IF NOT EXISTS 'manager_approved'`);
  await pool.query(`CREATE TABLE IF NOT EXISTS hr_request_history (
    id bigserial PRIMARY KEY, kind text NOT NULL, request_id integer NOT NULL,
    employee_id integer, actor_user_id integer, actor_employee_id integer,
    decision text NOT NULL, previous_status text NOT NULL, next_status text NOT NULL,
    note text, created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`ALTER TABLE hr_request_history ALTER COLUMN employee_id DROP NOT NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS hr_request_history_lookup ON hr_request_history(kind,request_id,id)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS hr_acknowledgment_evidence (
    id bigserial PRIMARY KEY, action_id integer NOT NULL REFERENCES hr_actions(id),
    step_key text NOT NULL, employee_id integer NOT NULL REFERENCES employees(id),
    session_id text NOT NULL, document_hash text NOT NULL, document_snapshot jsonb NOT NULL,
    mechanism text NOT NULL DEFAULT 'ordinary-electronic-acknowledgment',
    acknowledged_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(action_id,step_key)
  )`);
  // Employee-originated records have no administrative creator to impersonate.
  await pool.query(`ALTER TABLE hr_actions ALTER COLUMN created_by DROP NOT NULL`);
  await pool.query(`ALTER TABLE hr_actions ADD COLUMN IF NOT EXISTS created_by_employee_id integer REFERENCES employees(id)`);
  await pool.query(`ALTER TABLE attendance_permissions ADD COLUMN IF NOT EXISTS form_details jsonb`);
  await pool.query(`ALTER TABLE attendance_permissions ALTER COLUMN hours_requested TYPE numeric(8,2)`);
}

export function workflowError(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}

/** Stable serialization is independent of JSONB object key order. */
export function canonicalDocument(value: any): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalDocument).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalDocument(value[k])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export function acknowledgmentDocument(action: any) {
  const def = HR_WORKFLOWS[action.workflow];
  const document = {
    actionId: action.id, workflow: action.workflow,
    step: def?.steps[action.current_step]?.key, employeeId: action.employee_id,
    title: def?.nameAr, formData: action.form_data, updatedAt: action.updated_at,
    // This is an acknowledgment of the displayed record, not an unavailable official form.
    mechanism: "ordinary-electronic-acknowledgment", templateVersion: "hr-record-v1",
    scope: "displayed-hr-record-only",
  };
  return { document, version: createHash("sha256").update(canonicalDocument(document)).digest("hex") };
}

export function requestStage(status: string, hasManager: boolean, managerApproved: boolean) {
  return hasManager && status !== "manager_approved" && !managerApproved ? "manager" : "hr";
}

/** Same engine CAS, additionally guarding document and timeline against clarification races. */
export async function advanceHrActionVersioned(action: HrAction, data: Partial<InsertHrAction>) {
  return db.transaction(async tx => {
    const [updated] = await tx.update(hrActions).set({...data,updatedAt:new Date()}).where(and(
      eq(hrActions.id,action.id),eq(hrActions.currentStep,action.currentStep),
      inArray(hrActions.status,["pending","in_progress"]),
      sql`${hrActions.timeline} IS NOT DISTINCT FROM ${JSON.stringify(action.timeline)}::jsonb`,
      sql`${hrActions.formData} IS NOT DISTINCT FROM ${JSON.stringify(action.formData)}::jsonb`,
    )).returning();
    if (!updated) return undefined;
    if (data.status === "in_progress" || data.status === "completed") {
      const [source] = updated.linkedActionId ? await tx.select().from(hrActions).where(eq(hrActions.id,updated.linkedActionId)) : [];
      assertTerminationDue(updated.workflow,source?.workflow,(source?.formData as any)?.contractEnd);
    }
    const chained = updated.status === "completed" ? await finalizeHrActionInTransaction(tx,updated) : null;
    // Return persisted employee link, not the pre-finalization snapshot.
    const [persisted] = await tx.select().from(hrActions).where(eq(hrActions.id,updated.id));
    return {...persisted,chained};
  });
}

export function assertTerminationDue(workflow: string, sourceWorkflow?: string, contractEnd?: string, today = new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Riyadh"}).format(new Date())) {
  if (workflow !== "wf05" || !["wf06","wf06b"].includes(sourceWorkflow || "")) return;
  if (!contractEnd || !/^\d{4}-\d{2}-\d{2}$/.test(contractEnd) || !Number.isFinite(Date.parse(contractEnd)))
    workflowError(409,"تاريخ استحقاق الإنهاء غير صالح؛ يلزم تصحيح المصدر بواسطة إجراء معتمد");
  if (contractEnd > today) workflowError(409,`الإنهاء مجدول بتاريخ ${contractEnd}؛ لم يحِن موعد المراجعة`);
}

/** Side effects belong to the SAME transaction as the existing hr_actions CAS. */
export async function finalizeHrActionInTransaction(tx: any, action: HrAction) {
  const def = HR_WORKFLOWS[action.workflow];
  const fd = (action.formData || {}) as Record<string,any>;
  if (action.workflow === "wf03" && !action.employeeId) {
    const [source] = action.linkedActionId
      ? await tx.select().from(hrActions).where(eq(hrActions.id,action.linkedActionId)).for("update") : [];
    let employeeId = source?.employeeId;
    let createdEmployee = null;
    if (!employeeId) {
      const values = {...(source?.formData || {}),...fd};
      const phone = normalizeEmployeePhone(values.candidatePhone);
      if (!phone || !values.candidateName?.trim() || !values.position?.trim() ||
        !departmentEnum.enumValues.includes(values.department) ||
        !["saudi","resident"].includes(values.nationality) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(values.startDate || "") ||
        !Number.isFinite(Date.parse(values.startDate)) ||
        new Date(values.startDate).toISOString().slice(0,10)!==values.startDate ||
        !String(values.monthlySalary ?? "").trim() || !Number.isFinite(Number(values.monthlySalary)) || Number(values.monthlySalary)<0)
        workflowError(400,"بيانات العرض والمباشرة غير مكتملة أو غير صالحة لإنشاء ملف الموظف");
      [createdEmployee] = await tx.insert(employees).values({
        employeeNumber:`EMP-WF-${action.id}`,fullNameAr:values.candidateName.trim(),
        nationality:values.nationality,position:values.position.trim(),department:values.department,
        monthlySalary:Number(values.monthlySalary).toFixed(2),contractStart:values.startDate,
        phone:`0${phone.slice(3)}`,status:"active",
        ...(values.dateOfBirth ? {dateOfBirth:values.dateOfBirth} : {}),
      }).returning();
      employeeId = createdEmployee.id;
    }
    await tx.update(hrActions).set({employeeId,updatedAt:new Date()}).where(eq(hrActions.id,action.id));
    if (source) await tx.update(hrActions).set({employeeId,updatedAt:new Date()}).where(eq(hrActions.id,source.id));
    return {createdEmployee,employeeId};
  }
  if (!def.autoNext) return null;
  const next = HR_WORKFLOWS[def.autoNext];
  const formData = next.code === "wf03" ? {...fd,startDate:fd.startDate || ""}
    : next.code === "wf07" ? {amount:"",details:""}
    : {reason:"other",lastWorkingDay:fd.contractEnd || "",notes:"مجدول عند انتهاء العقد؛ يتطلب إعداد HR واعتماد الإدارة وإقرار الموظف"};
  const [existing] = await tx.select().from(hrActions).where(and(eq(hrActions.linkedActionId,action.id),eq(hrActions.workflow,next.code)));
  if (existing) return existing;
  const last = (action.timeline as any[])?.at(-1);
  const [child] = await tx.insert(hrActions).values({
    employeeId:action.employeeId,workflow:next.code,tab:next.tab,status:"pending",currentStep:0,
    formData,linkedActionId:action.id,createdBy:last?.byUserId || action.createdBy,
    timeline:[{step:"created",action:"إنشاء تلقائي للإجراء التالي (دون اعتماد أي خطوة)",byUserId:last?.byUserId,at:new Date().toISOString()}],
  }).returning();
  return child;
}

export async function decideHrRequest(kind: "leave" | "permission", id: number, userId: number, decision: string, note?: string | null) {
  if (!Number.isSafeInteger(id) || id <= 0) workflowError(400, "رقم الطلب غير صالح");
  if (!["approve", "reject", "clarify"].includes(decision)) workflowError(400, "قرار غير صالح");
  if (decision !== "approve" && !note?.trim()) workflowError(400, "السبب مطلوب");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const table = kind === "leave" ? "leave_requests" : "attendance_permissions";
    const row = (await client.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`, [id])).rows[0];
    if (!row) workflowError(404, "الطلب غير موجود");
    if (["approved", "rejected", "auto_approved", "cancelled"].includes(row.status)) workflowError(409, "تمت معالجة الطلب");
    const employee = (await client.query(`SELECT e.manager_id,m.user_id AS manager_user_id
      FROM employees e LEFT JOIN employees m ON m.id=e.manager_id AND m.id<>e.id WHERE e.id=$1`, [row.employee_id])).rows[0];
    const user = (await client.query("SELECT role FROM users WHERE id=$1", [userId])).rows[0];
    const managerApproved = (await client.query(`SELECT 1 FROM hr_request_history
      WHERE kind=$1 AND request_id=$2 AND next_status='manager_approved' LIMIT 1`, [kind, id])).rowCount! > 0;
    const stage = requestStage(row.status, !!employee?.manager_id, managerApproved || !!row.manager_approved_by);
    if (stage === "manager" ? employee?.manager_user_id !== userId : !["owner", "assistant", "hr"].includes(user?.role))
      workflowError(403, stage === "manager" ? "يلزم قرار المدير المباشر أولاً" : "القرار النهائي للموارد البشرية");
    const status = decision === "clarify" ? "clarification_requested" : decision === "reject" ? "rejected" : stage === "manager" ? "manager_approved" : "approved";
    if (kind === "leave") {
      await client.query(`UPDATE leave_requests SET status=$2,
        manager_approved_by=CASE WHEN $3 THEN $4 ELSE manager_approved_by END,
        manager_approved_date=CASE WHEN $3 THEN CURRENT_DATE ELSE manager_approved_date END,
        approved_by=CASE WHEN $5 THEN $4 ELSE approved_by END,
        approved_date=CASE WHEN $5 THEN CURRENT_DATE ELSE approved_date END, notes=COALESCE($6,notes)
        WHERE id=$1`, [id,status,status === "manager_approved",userId,["approved","rejected"].includes(status),note || null]);
    } else {
      await client.query(`UPDATE attendance_permissions SET status=$2,reviewed_by=$3 WHERE id=$1`, [id,status,userId]);
    }
    await client.query(`INSERT INTO hr_request_history(kind,request_id,employee_id,actor_user_id,decision,previous_status,next_status,note)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [kind,id,row.employee_id,userId,decision,row.status,status,note || null]);
    const updated = (await client.query(`SELECT * FROM ${table} WHERE id=$1`, [id])).rows[0];
    await client.query("COMMIT");
    return updated;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally { client.release(); }
}

/** Count distinct approved annual leave dates, clipping each interval to the requested year. */
export function annualUsage(rows: { startDate: string; endDate: string; status: string; leaveType: string }[], year: number) {
  const days = new Set<number>();
  const from = Date.UTC(year, 0, 1), to = Date.UTC(year + 1, 0, 1);
  for (const row of rows) {
    if (row.status !== "approved" || row.leaveType !== "annual") continue;
    for (let day = Math.max(Date.parse(row.startDate), from); day <= Date.parse(row.endDate) && day < to; day += 86400000) days.add(day);
  }
  return days.size;
}

export function annualEntitlementAt(contractStart: string | null, date: string) {
  if (!contractStart) return 21;
  const anniversary = new Date(`${contractStart}T00:00:00Z`);
  anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 5);
  return Date.parse(date) >= anniversary.getTime() ? 30 : 21;
}

export async function workflowClarification(id: number, note: string, actor: { userId: number } | { employeeId: number }) {
  if (!note?.trim() || note.length > 2000) workflowError(400,"التوضيح مطلوب (حتى 2000 حرف)");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const row = (await client.query("SELECT * FROM hr_actions WHERE id=$1 FOR UPDATE",[id])).rows[0];
    if (!row) workflowError(404,"الإجراء غير موجود");
    if (!["pending","in_progress"].includes(row.status)) workflowError(409,"الإجراء منتهٍ");
    const step = HR_WORKFLOWS[row.workflow]?.steps[row.current_step];
    if (!step || !["manager","hr"].includes(step.role)) workflowError(409,"التوضيح متاح في مرحلة المراجعة");
    const timeline = row.timeline || [];
    let entry;
    if ("employeeId" in actor) {
      if (row.employee_id !== actor.employeeId) workflowError(404,"الإجراء غير موجود");
      if (timeline.at(-1)?.action !== "clarify") workflowError(409,"لا يوجد توضيح مطلوب");
      entry = {step:step.key,action:"clarification_response",byEmployeeId:actor.employeeId,note,at:new Date().toISOString()};
    } else {
      const user = (await client.query("SELECT role FROM users WHERE id=$1",[actor.userId])).rows[0];
      const employee = (await client.query(`SELECT e.id,e.manager_id,m.user_id FROM employees e
        LEFT JOIN employees m ON m.id=e.manager_id AND m.id<>e.id WHERE e.id=$1`,[row.employee_id])).rows[0];
      if (!user || !canPerformAdministrativeHrStep(user.role,step.role,!!employee,!!employee?.manager_id,employee?.user_id === actor.userId))
        workflowError(403,"غير مصرح بهذه الخطوة");
      entry = {step:step.key,action:"clarify",byUserId:actor.userId,note,at:new Date().toISOString()};
    }
    await client.query("UPDATE hr_actions SET timeline=$2,updated_at=now() WHERE id=$1",[id,JSON.stringify([...timeline,entry])]);
    await client.query("COMMIT");
    return {success:true};
  } catch(e) {await client.query("ROLLBACK");throw e;} finally {client.release();}
}
