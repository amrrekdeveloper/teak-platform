import type { Express, RequestHandler } from "express";
import { pool } from "./db";
import { storage } from "./storage";
import { HR_WORKFLOWS } from "../shared/hr-workflows";
import { permissionDocument } from "./hr-permission-document";

export function registerManagerWorkspace(app: Express, requireAuth: RequestHandler) {
  app.get("/api/hr-permissions/:id/document", requireAuth, async (req,res) => {
    try {
      const permitted = (await pool.query(`SELECT 1 FROM attendance_permissions p
        LEFT JOIN employees e ON e.id=p.employee_id LEFT JOIN employees m ON m.id=e.manager_id
        JOIN users u ON u.id=$2 WHERE p.id=$1 AND (u.role IN ('owner','assistant','hr') OR m.user_id=u.id)`,
        [Number(req.params.id),req.session.userId])).rowCount;
      if (!permitted) return res.status(403).json({message:"غير مصرح"});
      res.type("html").send(await permissionDocument(Number(req.params.id)));
    } catch { res.status(500).json({message:"تعذر إنشاء المستند"}); }
  });
  app.get("/api/manager/workspace", requireAuth, async (req,res) => {
    try {
      const ids = (await pool.query(`SELECT e.id FROM employees e JOIN employees m ON m.id=e.manager_id
        WHERE m.user_id=$1 AND e.id<>m.id`, [req.session.userId])).rows.map(r => r.id);
      // Do not expose salary, identity documents, or unrelated HR records.
      const employees = (await storage.getEmployees()).filter(e => ids.includes(e.id))
        .map(e => ({ id:e.id, name:e.fullNameAr, number:e.employeeNumber, department:e.department, position:e.position }));
      const leaves = (await storage.getLeaveRequests()).filter(r => ids.includes(r.employeeId));
      const permissions = (await storage.getAttendancePermissions()).filter(r => ids.includes(r.employeeId))
        .map(r=>({...r,returnDate:r.formDetails?.returnDate || r.date}));
      const actions = (await storage.getHrActions()).filter(a => ids.includes(a.employeeId) &&
        ["wf04","wf06b","wf10"].includes(a.workflow));
      const history = (await pool.query(`SELECT * FROM hr_request_history WHERE employee_id=ANY($1::int[]) ORDER BY id DESC`, [ids])).rows;
      res.json({ employees,leaves,permissions,actions,history });
    } catch { res.status(500).json({ message:"تعذر تحميل مساحة المدير" }); }
  });
  app.post("/api/manager/warnings", requireAuth, async (req,res) => {
    try {
      const employeeId = Number(req.body.employeeId);
      const authorized = (await pool.query(`SELECT 1 FROM employees e JOIN employees m ON m.id=e.manager_id
        WHERE e.id=$1 AND m.user_id=$2 AND e.id<>m.id`, [employeeId,req.session.userId])).rowCount;
      if (!authorized) return res.status(403).json({ message:"الموظف ليس ضمن فريقك" });
      const def = HR_WORKFLOWS.wf10;
      const formData = req.body.formData;
      if (!formData || def.fields.some(f => f.required && !String(formData[f.key] ?? "").trim()) ||
        def.fields.some(f => f.options && !f.options.some(o => o.value === formData[f.key])))
        return res.status(400).json({ message:"أكمل حقول المخالفة بقيم صحيحة" });
      const action = await storage.createHrAction({
        employeeId,workflow:"wf10",tab:"penalties",status:"in_progress",currentStep:1,formData,
        createdBy:req.session.userId!,timeline:[{ step:"manager_report",action:"رفع المخالفة",
          byUserId:req.session.userId,at:new Date().toISOString() }],
      });
      res.status(201).json(action);
    } catch { res.status(500).json({ message:"تعذر تسجيل المخالفة" }); }
  });
}
