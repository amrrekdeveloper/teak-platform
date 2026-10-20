import type { Router } from "express";
import { z } from "zod";
import { pool } from "../db";
import { HR_WORKFLOWS } from "../../shared/hr-workflows";
import { acknowledgmentDocument, workflowClarification, assertTerminationDue } from "../hr-workflow-support";
import { permissionDocument } from "../hr-permission-document";
import { asyncRoute, identity, portalError } from "./router";

export function registerEmployeeAcknowledgments(router: Router) {
  router.post("/workflow-requests/:id/clarification", asyncRoute(async(req,res)=>{
    const input=z.object({note:z.string().trim().min(1).max(2000)}).strict().parse(req.body);
    res.json(await workflowClarification(Number(req.params.id),input.note,{employeeId:identity(res).employee.id}));
  }));
  router.patch("/acknowledgments/:id/commencement", asyncRoute(async (req,res) => {
    const { startDate } = z.object({ startDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().parse(req.body);
    if (!Number.isFinite(Date.parse(startDate)) || new Date(startDate).toISOString().slice(0,10) !== startDate)
      portalError(400, "تاريخ المباشرة غير صالح.");
    const updated = await pool.query(`UPDATE hr_actions SET
      form_data=COALESCE(form_data,'{}'::jsonb)||jsonb_build_object('startDate',$3::text),updated_at=now()
      WHERE id=$1 AND employee_id=$2 AND workflow='wf03' AND current_step=0 AND status IN ('pending','in_progress')
      RETURNING id`, [Number(req.params.id),identity(res).employee.id,startDate]);
    if (!updated.rowCount) portalError(409, "لا يمكن تعديل تاريخ المباشرة في هذه المرحلة.");
    res.json({success:true,message:"راجع النسخة الجديدة قبل الإقرار."});
  }));
  router.get("/permissions/:id/document", asyncRoute(async (req,res) => {
    const html = await permissionDocument(Number(req.params.id), identity(res).employee.id);
    if (!html) portalError(404, "الطلب غير موجود.");
    res.type("html").send(html);
  }));
  router.post("/workflow-requests", asyncRoute(async (req,res) => {
    const input = z.object({
      workflow:z.enum(["wf04","wf06b"]),
      formData:z.record(z.string(),z.string().max(2000)),
    }).strict().parse(req.body);
    const def = HR_WORKFLOWS[input.workflow];
    for (const field of def.fields) {
      const value = input.formData[field.key] || "";
      if (field.required && !value.trim()) portalError(400, `الحقل مطلوب: ${field.labelAr}`);
      if (value && field.type === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value))
        portalError(400, "التاريخ غير صالح.");
    }
    const employee = identity(res).employee;
    const row = (await pool.query(`INSERT INTO hr_actions
      (employee_id,workflow,tab,status,current_step,form_data,timeline,created_by_employee_id)
      VALUES($1,$2,$3,'pending',0,$4,$5,$1) RETURNING id`,
      [employee.id,input.workflow,def.tab,JSON.stringify(input.formData),
        JSON.stringify([{step:"created",action:"طلب من بوابة الموظف",byEmployeeId:employee.id,at:new Date().toISOString()}])])).rows[0];
    res.status(201).json({id:row.id,message:"تم إنشاء الطلب. راجع نسخته وأقر بها لإرسالها للمراجعة."});
  }));
  router.get("/acknowledgments", asyncRoute(async (_req, res) => {
    const { employee } = identity(res);
    const actions = (await pool.query(`SELECT * FROM hr_actions WHERE employee_id=$1 ORDER BY id DESC`, [employee.id])).rows;
    const evidence = (await pool.query(`SELECT action_id,step_key,document_hash,acknowledged_at,mechanism
      FROM hr_acknowledgment_evidence WHERE employee_id=$1 ORDER BY id DESC`, [employee.id])).rows;
    res.json({
      pending: actions.filter(a => ["pending","in_progress"].includes(a.status) &&
        HR_WORKFLOWS[a.workflow]?.steps[a.current_step]?.role === "employee")
        .map(a => ({ id: a.id, ...acknowledgmentDocument(a) })),
      evidence,
      clarifications:actions.filter(a=>["pending","in_progress"].includes(a.status) && a.timeline?.at(-1)?.action === "clarify")
        .map(a=>({id:a.id,title:HR_WORKFLOWS[a.workflow]?.nameAr,note:a.timeline.at(-1).note})),
    });
  }));
  router.post("/acknowledgments/:id", asyncRoute(async (req, res) => {
    const input = z.object({ version: z.string().regex(/^[a-f0-9]{64}$/), acknowledged: z.literal(true) }).strict().parse(req.body);
    const { employee, sessionId } = identity(res);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const action = (await client.query(`SELECT * FROM hr_actions WHERE id=$1 AND employee_id=$2 FOR UPDATE`,
        [Number(req.params.id),employee.id])).rows[0];
      if (!action) portalError(404, "الإجراء غير موجود.");
      const def = HR_WORKFLOWS[action.workflow], step = def?.steps[action.current_step];
      if (!["pending","in_progress"].includes(action.status) || step?.role !== "employee")
        portalError(409, "هذا الإجراء لا ينتظر إقرارك الآن.");
      if (action.workflow === "wf05" && action.linked_action_id) {
        const source = (await client.query("SELECT workflow,form_data FROM hr_actions WHERE id=$1",[action.linked_action_id])).rows[0];
        assertTerminationDue(action.workflow,source?.workflow,source?.form_data?.contractEnd);
      }
      const { document, version } = acknowledgmentDocument(action);
      if (version !== input.version) portalError(409, "تغير المستند. راجع النسخة الجديدة قبل الإقرار.");
      const missing = def.fields.filter(f => f.required && !String(action.form_data?.[f.key] ?? "").trim());
      if (missing.length) portalError(400, "الإجراء غير مكتمل؛ راجع الموارد البشرية لاستكمال الحقول.");
      await client.query(`INSERT INTO hr_acknowledgment_evidence
        (action_id,step_key,employee_id,session_id,document_hash,document_snapshot)
        VALUES($1,$2,$3,$4,$5,$6)`, [action.id,step.key,employee.id,sessionId,version,JSON.stringify(document)]);
      const at = new Date().toISOString();
      const timeline = [...(action.timeline || []), {
        step: step.key, action: "إقرار إلكتروني عادي (ليس توقيعاً رقمياً مؤهلاً)",
        byEmployeeId: employee.id, byName: employee.full_name_ar, at, documentHash: version, sessionId,
      }];
      const last = action.current_step + 1 >= def.steps.length;
      await client.query(`UPDATE hr_actions SET current_step=$2,status=$3,timeline=$4,updated_at=now() WHERE id=$1`,
        [action.id,last ? action.current_step : action.current_step + 1,last ? "completed" : "in_progress",JSON.stringify(timeline)]);
      // Same hr_actions engine and links; insertion and acknowledgment commit together.
      if (last && def.autoNext) {
        const next = HR_WORKFLOWS[def.autoNext];
        const fd = action.form_data || {};
        const form = def.autoNext === "wf03" ? { ...fd, startDate: fd.startDate || "" }
          : def.autoNext === "wf07" ? { amount: "", details: "" }
          : { reason: "other", lastWorkingDay: fd.contractEnd || "", notes: "مجدول عند انتهاء العقد" };
        await client.query(`INSERT INTO hr_actions
          (employee_id,workflow,tab,status,current_step,form_data,timeline,linked_action_id,created_by)
          SELECT $1,$2,$3,'pending',0,$4,$5,$6,$7
          WHERE NOT EXISTS (SELECT 1 FROM hr_actions WHERE linked_action_id=$6 AND workflow=$2)`,
          [employee.id,next.code,next.tab,JSON.stringify(form),
            JSON.stringify([{ step:"created",action:"إنشاء تلقائي بعد الإقرار",byEmployeeId:employee.id,at }]),action.id,action.created_by]);
      }
      await client.query("COMMIT");
      res.json({ success: true, message: "تم تسجيل إقرارك الإلكتروني ونسخة المستند. هذا ليس توقيعاً رقمياً مؤهلاً." });
    } catch (e) { await client.query("ROLLBACK"); throw e; }
    finally { client.release(); }
  }));
  router.get("/request-history", asyncRoute(async (_req,res) => {
    res.json((await pool.query(`SELECT kind,request_id,decision,previous_status,next_status,note,created_at
      FROM hr_request_history WHERE employee_id=$1 ORDER BY id DESC`, [identity(res).employee.id])).rows);
  }));
  router.post("/requests/:kind/:id/clarification", asyncRoute(async (req,res) => {
    const input = z.object({ note:z.string().trim().min(3).max(2000) }).strict().parse(req.body);
    const kind = z.enum(["leave","permission"]).parse(req.params.kind);
    const employeeId = identity(res).employee.id;
    const table = kind === "leave" ? "leave_requests" : "attendance_permissions";
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const row = (await client.query(`SELECT * FROM ${table} WHERE id=$1 AND employee_id=$2 FOR UPDATE`,
        [Number(req.params.id),employeeId])).rows[0];
      if (!row) portalError(404, "الطلب غير موجود.");
      if (row.status !== "clarification_requested") portalError(409, "الطلب لا ينتظر توضيحاً.");
      const previous = (await client.query(`SELECT previous_status FROM hr_request_history
        WHERE kind=$1 AND request_id=$2 AND decision='clarify' ORDER BY id DESC LIMIT 1`, [kind,row.id])).rows[0];
      const next = previous?.previous_status === "manager_approved" ? "manager_approved" : "pending";
      await client.query(`UPDATE ${table} SET status=$2 WHERE id=$1`, [row.id,next]);
      await client.query(`INSERT INTO hr_request_history
        (kind,request_id,employee_id,actor_employee_id,decision,previous_status,next_status,note)
        VALUES($1,$2,$3,$3,'clarification_response','clarification_requested',$4,$5)`, [kind,row.id,employeeId,next,input.note]);
      await client.query("COMMIT");
      res.json({ success:true });
    } catch(e) { await client.query("ROLLBACK"); throw e; }
    finally { client.release(); }
  }));
}
