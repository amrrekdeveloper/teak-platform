import type { Express, RequestHandler } from "express";
import type { PoolClient } from "pg";
import { z } from "zod";
import { pool } from "./db";
import { riyadhDateKey, riyadhDayBounds } from "../shared/attendance";
import { activeMovementSql, movementVersionSql } from "./attendance-movement-state";
import { storage } from "./storage";

const fail = (status: number, message: string): never => { throw Object.assign(new Error(message), { status }); };
const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
});
const reasonSchema = z.string().trim().min(3).max(1000);
const typeSchema = z.enum(["check_in", "check_out"]);
const editSchema = z.object({
  action: z.enum(["void", "restore", "edit"]),
  expectedVersion: z.number().int().nonnegative(),
  reason: reasonSchema,
  newType: typeSchema.optional(),
  newCheckTime: z.string().datetime({ offset: true }).optional(),
}).strict();
const addSchema = z.object({
  employeeId: z.number().int().positive(), day: daySchema,
  shiftKey: z.string().min(1).max(100), type: typeSchema,
  checkTime: z.string().datetime({ offset: true }), reason: reasonSchema,
}).strict();

async function movements(client: Pick<PoolClient, "query">, employeeId: number, day: string) {
  const bounds = riyadhDayBounds(day);
  return (await client.query(`SELECT r.id,r.employee_id AS "employeeId",r.employee_name_ar AS "employeeNameAr",
    r.type,r.check_time AT TIME ZONE 'UTC' AS "checkTime",r.shift_key AS "shiftKey",
    r.is_manual_edit AS "isManualEdit",NOT (${activeMovementSql("r")}) AS excluded,
    ${movementVersionSql("r")} AS version,
    (SELECT a.reason FROM attendance_audit_log a WHERE a.record_id=r.id AND a.action='movement_void'
      ORDER BY a.id DESC LIMIT 1) AS "exclusionReason"
    FROM attendance_records r WHERE r.employee_id=$1
    AND r.check_time >= $2::timestamptz AT TIME ZONE 'UTC'
    AND r.check_time <= $3::timestamptz AT TIME ZONE 'UTC' ORDER BY r.check_time,r.id`,
  [employeeId, bounds.from, bounds.to])).rows;
}

/** Existing legacy anomalies may be repaired one at a time, not made worse. */
function sequenceErrors(records: any[]) {
  const errors = new Set<string>();
  const previous = new Map<string, any>();
  for (const record of [...records].filter(r => !r.excluded).sort((a, b) =>
    +new Date(a.checkTime) - +new Date(b.checkTime) || a.id - b.id)) {
    const key = record.shiftKey || "__legacy";
    const last = previous.get(key);
    if (!last && record.type === "check_out") errors.add(`orphan:${record.id}`);
    if (last?.type === record.type) errors.add(`repeat:${last.id}:${record.id}`);
    if (last && record.type === "check_out" && +new Date(record.checkTime) <= +new Date(last.checkTime))
      errors.add(`not_after:${last.id}:${record.id}`);
    previous.set(key, record);
  }
  return errors;
}
function validateSequence(before: any[], after: any[]) {
  const oldErrors = sequenceErrors(before);
  if ([...sequenceErrors(after)].some(error => !oldErrors.has(error)))
    fail(409, "التصحيح سيترك خروجًا بلا دخول أو حركات متتالية من النوع نفسه. راجع الحركات المرتبطة أولًا.");
}
async function audit(client: PoolClient, record: any, actor: number, action: string, reason: string, after: any) {
  await client.query(`INSERT INTO attendance_audit_log
    (record_id,employee_id,action,old_value,new_value,reason,edited_by)
    VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7)`,
  [record.id, record.employeeId, action, JSON.stringify(record), JSON.stringify(after), reason, actor]);
}

export function registerAttendanceMovements(app: Express, authorize: RequestHandler) {
  const respond = (res: any, error: any) => {
    const status = [400, 404, 409].includes(error.status) ? error.status : 500;
    if (status === 500) console.error("[attendance-movement]", { code: error.code, message: error.message });
    return res.status(status).json({ message: status === 500 ? "تعذر حفظ التصحيح. لم تتغير الحركة؛ أعد المحاولة." : error.message });
  };
  app.get("/api/attendance/movements", authorize, async (req, res) => {
    const input = z.object({ employeeId: z.coerce.number().int().positive(), day: daySchema }).safeParse(req.query);
    if (!input.success) return res.status(400).json({ message: "اختر الموظف وتاريخًا صحيحًا." });
    try {
      const { employeeId, day } = input.data;
      const employee = await storage.getEmployee(employeeId);
      if (!employee) fail(404, "الموظف غير موجود.");
      const saved = (await pool.query("SELECT shifts FROM attendance_day_schedules WHERE employee_id=$1 AND business_day=$2",
        [employeeId, day])).rows[0];
      // Reading history must not invent a missing historical schedule.
      const shifts = saved?.shifts ?? [];
      res.json({ employeeId, day, shifts, records: await movements(pool, employeeId, day) });
    } catch (error) { respond(res, error); }
  });
  app.post("/api/attendance/record/:id/correction", authorize, async (req, res) => {
    const input = editSchema.safeParse(req.body), id = Number(req.params.id);
    if (!input.success || !Number.isSafeInteger(id) || id <= 0)
      return res.status(400).json({ message: "حدد الإجراء وسبب التصحيح وحدّث قائمة الحركات." });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const initial = (await client.query("SELECT employee_id FROM attendance_records WHERE id=$1", [id])).rows[0];
      if (!initial?.employee_id) fail(404, "السجل غير موجود أو غير مرتبط بموظف.");
      await client.query("SELECT pg_advisory_xact_lock(51701,$1)", [initial.employee_id]);
      const raw = (await client.query("SELECT check_time AT TIME ZONE 'UTC' AS time FROM attendance_records WHERE id=$1 FOR UPDATE", [id])).rows[0];
      const day = riyadhDateKey(new Date(raw.time));
      const records = await movements(client, initial.employee_id, day);
      const before = records.find(r => r.id === id)!;
      if (before.version !== input.data.expectedVersion) fail(409, "عُدلت الحركة من جلسة أخرى. حدّث القائمة وراجعها قبل الحفظ.");
      const { action, reason, newCheckTime, newType } = input.data;
      if (action === "void" && before.excluded || action === "restore" && !before.excluded)
        fail(409, "حالة الحركة تغيرت بالفعل. حدّث القائمة.");
      if (action === "edit" && before.excluded) fail(409, "أعد الحركة المستبعدة أولًا قبل تعديلها.");
      if (action === "edit" && !newCheckTime && !newType) fail(400, "حدد الوقت أو نوع الحركة المطلوب تعديله.");
      if (newCheckTime && (riyadhDateKey(new Date(newCheckTime)) !== day || +new Date(newCheckTime) > Date.now()))
        fail(400, "يجب أن يكون الوقت داخل اليوم نفسه وألا يكون في المستقبل.");
      const after = { ...before, excluded: action === "void" ? true : action === "restore" ? false : before.excluded,
        ...(action === "edit" ? { type: newType || before.type, checkTime: newCheckTime || before.checkTime } : {}) };
      validateSequence(records, records.map(r => r.id === id ? after : r));
      if (action === "edit") await client.query(`UPDATE attendance_records SET
        type=$2,check_time=$3::timestamptz AT TIME ZONE 'UTC',is_manual_edit=true,edited_by=$4 WHERE id=$1`,
      [id, after.type, new Date(after.checkTime).toISOString(), (req as any).user.id]);
      await audit(client, before, (req as any).user.id, `movement_${action}`, reason, after);
      await client.query("COMMIT");
      res.json({ success: true, id });
    } catch (error) { await client.query("ROLLBACK"); respond(res, error); }
    finally { client.release(); }
  });
  app.post("/api/attendance/movements", authorize, async (req, res) => {
    const input = addSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ message: "حدد الموظف والوردية والوقت وسبب إضافة الحركة." });
    const client = await pool.connect();
    try {
      const data = input.data;
      if (riyadhDateKey(new Date(data.checkTime)) !== data.day || +new Date(data.checkTime) > Date.now())
        fail(400, "يجب أن يكون الوقت داخل اليوم المحدد وألا يكون في المستقبل.");
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(51701,$1)", [data.employeeId]);
      const employee = (await client.query("SELECT full_name_ar,phone FROM employees WHERE id=$1", [data.employeeId])).rows[0];
      if (!employee) fail(404, "الموظف غير موجود.");
      // Historical additions must reference actual captured shift evidence.
      const saved = (await client.query("SELECT shifts FROM attendance_day_schedules WHERE employee_id=$1 AND business_day=$2",
        [data.employeeId, data.day])).rows[0];
      if (!saved?.shifts?.some((s: any) => s.id === data.shiftKey))
        fail(409, "لا يوجد جدول محفوظ لهذه الوردية في هذا اليوم. راجع إعدادات الدوام قبل إضافة حركة.");
      const before = await movements(client, data.employeeId, data.day);
      const candidate = { id: Number.MAX_SAFE_INTEGER, type: data.type, checkTime: data.checkTime, shiftKey: data.shiftKey };
      if (before.some(r => !r.excluded && r.type === data.type && r.shiftKey === data.shiftKey &&
        +new Date(r.checkTime) === +new Date(data.checkTime))) fail(409, "هذه الحركة موجودة بالفعل.");
      validateSequence(before, [...before, candidate]);
      const record = (await client.query(`INSERT INTO attendance_records
        (employee_id,employee_name_ar,employee_phone,type,check_time,shift_key,is_manual_edit,edited_by,notes)
        VALUES($1,$2,$3,$4,$5::timestamptz AT TIME ZONE 'UTC',$6,true,$7,$8) RETURNING id`,
      [data.employeeId, employee.full_name_ar, employee.phone, data.type, data.checkTime, data.shiftKey, (req as any).user.id, data.reason])).rows[0];
      await audit(client, { id: record.id, employeeId: data.employeeId }, (req as any).user.id, "movement_add", data.reason,
        { ...candidate, id: record.id, employeeId: data.employeeId });
      await client.query("COMMIT");
      res.status(201).json({ success: true, id: record.id });
    } catch (error) { await client.query("ROLLBACK"); respond(res, error); }
    finally { client.release(); }
  });
}
