import type { Express, RequestHandler } from "express";
import { z } from "zod";
import { pool } from "./db";
import { storage } from "./storage";
import { annualEntitlementAt, annualUsage, workflowError } from "./hr-workflow-support";
import { normalizeEmployeePhone } from "./employee-portal/security";
import { riyadhDateKey } from "../shared/attendance";
import { HR_WORKSPACE_PERMISSIONS } from "../shared/hr-access";
import type { InsertLeaveRequest } from "../shared/schema";

export async function createAdministrativeLeave(data: InsertLeaveRequest, userId:number) {
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(51701,$1)",[data.employeeId]);
    const {rows:[employee]}=await client.query("SELECT id,status,hire_date::text FROM employees WHERE id=$1",[data.employeeId]);
    if(!employee || employee.status!=="active") workflowError(409,"اختر موظفًا نشطًا.");
    if(employee.hire_date && data.startDate<employee.hire_date) workflowError(400,"الإجازة لا تسبق تاريخ التعيين.");
    if ((Date.parse(data.endDate)-Date.parse(data.startDate))/86400000 >=366)
      workflowError(400,"مدة الطلب لا تتجاوز 366 يومًا.");
    if((await client.query(`SELECT id FROM leave_requests WHERE employee_id=$1
      AND status::text NOT IN ('rejected','cancelled') AND start_date<=$3 AND end_date>=$2 LIMIT 1`,
      [data.employeeId,data.startDate,data.endDate])).rowCount) workflowError(409,"يوجد طلب إجازة يتداخل مع الفترة المختارة.");
    const {rows:[row]}=await client.query(`INSERT INTO leave_requests(employee_id,leave_type,start_date,end_date,days,reason,status,leave_form_data)
      VALUES($1,$2,$3,$4,$5,$6,'pending',$7) RETURNING id`,[data.employeeId,data.leaveType,data.startDate,data.endDate,data.days,data.reason||null,JSON.stringify(data.leaveFormData||{})]);
    await client.query(`INSERT INTO hr_request_history(kind,request_id,employee_id,actor_user_id,decision,previous_status,next_status,note)
      VALUES('leave',$1,$2,$3,'submit','new','pending',$4)`,[row.id,data.employeeId,userId,data.reason||null]);
    await client.query("COMMIT");
    return await storage.getLeaveRequest(row.id);
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}

export const reportInput = z.object({
  type: z.enum(["employees","leaves","permissions","payroll","advances","evaluations","actions","audit"]),
  from: z.string().date(), to: z.string().date(),
  employeeId: z.coerce.number().int().positive().optional(),
  status: z.string().max(60).optional(),
}).refine(x => x.from <= x.to && (Date.parse(x.to)-Date.parse(x.from))/86400000 < 366,
  "اختر فترة مرتبة لا تتجاوز 366 يومًا.");

export async function annualLeaveBalance(employeeId: number, year: number) {
  const employee = await storage.getEmployee(employeeId);
  if (!employee) workflowError(404, "الموظف غير موجود");
  const today = riyadhDateKey(new Date());
  const rows = await storage.getLeaveRequests(employeeId);
  const entitlement = annualEntitlementAt(employee.hireDate || employee.contractStart,
    year === Number(today.slice(0,4)) ? today : `${year}-12-31`);
  const used = annualUsage(rows,year);
  // Count pending reservations distinctly, never including approved days twice.
  const reservedRows = rows.filter(r => ["pending","manager_approved","clarification_requested"].includes(r.status))
    .map(r => ({...r,status:"approved"}));
  const pending = Math.max(0,annualUsage([...rows,...reservedRows],year)-used);
  const remaining = Math.max(0,entitlement-used);
  return {year:String(year),entitlement,used,remaining,pending,reserved:pending,available:Math.max(0,remaining-pending)};
}

/** No physical deletion: approved cancellation releases balance and attendance leave status. */
export async function cancelLeave(id: number, reason: string, actor: {userId:number}|{employeeId:number}) {
  if (!Number.isSafeInteger(id) || id <= 0 || reason.trim().length < 3 || reason.length > 2000)
    workflowError(400, "أدخل سبب الإلغاء من 3 إلى 2000 حرف.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const {rows:[row]} = await client.query("SELECT * FROM leave_requests WHERE id=$1 FOR UPDATE",[id]);
    if (!row) workflowError(404,"الطلب غير موجود.");
    if ("employeeId" in actor) {
      if (actor.employeeId !== row.employee_id) workflowError(404,"الطلب غير موجود.");
      if (!["pending","clarification_requested"].includes(row.status))
        workflowError(409,"يمكن سحب الطلب قبل موافقة المدير فقط. تواصل مع الموارد البشرية.");
    } else {
      const {rows:[user]} = await client.query("SELECT role,active,archived FROM users WHERE id=$1",[actor.userId]);
      if (!user?.active || user.archived || !["owner","assistant","hr"].includes(user.role))
        workflowError(403,"إلغاء الإجازات للموارد البشرية فقط.");
    }
    if (["cancelled","rejected"].includes(row.status)) workflowError(409,"الطلب منتهٍ بالفعل.");
    await client.query("SELECT pg_advisory_xact_lock(51701,$1)",[row.employee_id]);
    await client.query("UPDATE leave_requests SET status='cancelled',notes=$2 WHERE id=$1",[id,reason.trim()]);
    await client.query(`INSERT INTO hr_request_history(kind,request_id,employee_id,actor_user_id,actor_employee_id,decision,previous_status,next_status,note)
      VALUES('leave',$1,$2,$3,$4,'cancel',$5,'cancelled',$6)`,
      [id,row.employee_id,"userId" in actor ? actor.userId : null,"employeeId" in actor ? actor.employeeId : null,row.status,reason.trim()]);
    await client.query(`INSERT INTO hr_audit_log(performed_by,employee_id,action,details)
      VALUES($1,$2,'leave_cancelled',$3)`,["userId" in actor ? actor.userId : null,row.employee_id,
      JSON.stringify({requestId:id,previousStatus:row.status,reason:reason.trim(),payrollChanged:false})]);
    await client.query("COMMIT");
    return {id,status:"cancelled",message:"تم إلغاء الطلب مع حفظ سجله. لا تُعدَّل الرواتب المصروفة تلقائيًا."};
  } catch(error) {await client.query("ROLLBACK");throw error;}
  finally {client.release();}
}

type ReportDef = {table:string;date:string;select:string;columns:[string,string,string][];status?:string;employee?:string};
const identityColumns: [string,string,string][] = [["employeeNumber","الرقم الوظيفي","Employee number"],["employee","الموظف","Employee"],["department","القسم","Department"]];
const defs: Record<z.infer<typeof reportInput>["type"],ReportDef> = {
  employees: {table:"employees r",employee:"r.id",date:"COALESCE(r.hire_date,r.contract_start)",status:"r.status",
    select:`r.phone,r.position,r.nationality,r.hire_date::text AS "hireDate",r.contract_start::text AS "contractStart",r.contract_end::text AS "contractEnd",r.status,r.attendance_enabled AS "attendanceEnabled"`,
    columns:[["position","المسمى","Position"],["phone","الجوال","Mobile"],["nationality","الجنسية","Nationality"],["hireDate","تاريخ التعيين","Hire date"],["contractStart","بداية العقد","Contract start"],["contractEnd","نهاية العقد","Contract end"],["status","الحالة","Status"],["attendanceEnabled","البصمة مفعلة","Attendance enabled"]]},
  leaves: {table:"leave_requests r",date:"r.start_date",status:"r.status",
    select:`r.id,r.leave_type AS type,r.start_date::text AS "startDate",r.end_date::text AS "endDate",r.days,r.status,r.reason,r.notes`,
    columns:[["id","رقم الطلب","Request"],["type","النوع","Type"],["startDate","من","From"],["endDate","إلى","To"],["days","أيام تقويمية","Calendar days"],["status","الحالة","Status"],["reason","السبب","Reason"],["notes","ملاحظات القرار","Decision notes"]]},
  permissions: {table:"attendance_permissions r",date:"r.date",status:"r.status",
    select:`r.id,r.type,r.date::text AS date,r.start_time AS "startTime",COALESCE(r.form_details->>'returnDate',r.date::text) AS "returnDate",r.end_time AS "endTime",r.hours_requested AS hours,r.status,r.reason`,
    columns:[["id","رقم الطلب","Request"],["type","النوع","Type"],["date","المغادرة","Departure"],["startTime","من الساعة","From time"],["returnDate","العودة","Return"],["endTime","إلى الساعة","To time"],["hours","الساعات","Hours"],["status","الحالة","Status"],["reason","السبب","Reason"]]},
  payroll: {table:"payroll_records r",date:"(r.period||'-01')::date",status:"r.status",
    select:`r.period,r.basic_salary AS basic,r.allowances,r.deductions,r.advance_deduction AS "advanceDeduction",r.net_salary AS net,r.status,r.paid_date::text AS "paidDate"`,
    columns:[["period","الشهر","Month"],["basic","الأساسي","Basic"],["allowances","البدلات","Allowances"],["deductions","الخصومات","Deductions"],["advanceDeduction","قسط السلفة","Advance installment"],["net","الصافي","Net"],["status","الحالة","Status"],["paidDate","تاريخ الصرف","Paid on"]]},
  advances: {table:"employee_advances r",date:"r.request_date",status:"r.status",
    select:`r.id,r.request_date::text AS date,r.amount,r.remaining_amount AS remaining,r.monthly_deduction AS "monthlyDeduction",r.installments,r.status,r.reason`,
    columns:[["id","الرقم","ID"],["date","التاريخ","Date"],["amount","المبلغ","Amount"],["remaining","المتبقي","Remaining"],["monthlyDeduction","القسط","Installment"],["installments","عدد الأقساط","Installments"],["status","الحالة","Status"],["reason","السبب","Reason"]]},
  evaluations: {table:"performance_evaluations r",date:"r.created_at::date",status:"r.status",
    select:`r.period,r.overall_score AS score,r.status,r.strengths,r.improvements`,
    columns:[["period","الفترة","Period"],["score","النتيجة","Score"],["status","الحالة","Status"],["strengths","نقاط القوة","Strengths"],["improvements","التحسينات","Improvements"]]},
  actions: {table:"hr_actions r",date:"r.created_at::date",status:"r.status",
    select:`r.id,r.workflow,r.status,r.current_step AS step,r.created_at::text AS date`,
    columns:[["id","الرقم","ID"],["workflow","الإجراء","Workflow"],["status","الحالة","Status"],["step","الخطوة","Step"],["date","تاريخ الإنشاء","Created"]]},
  audit: {table:`(SELECT id,employee_id,performed_by,action,details,created_at FROM hr_audit_log
    UNION ALL SELECT -id,employee_id,actor_user_id,kind||':'||decision,
      json_build_object('requestId',request_id,'before',previous_status,'after',next_status,'note',note)::text,created_at
      FROM hr_request_history WHERE decision<>'cancel') r`,date:"r.created_at::date",
    select:`r.id,r.action,r.created_at::text AS date,u.username AS actor,r.details`,
    columns:[["id","الرقم","ID"],["action","الإجراء","Action"],["date","التوقيت","Time"],["actor","الحساب المنفذ","Actor"],["details","التفاصيل","Details"]]},
};

export async function hrReport(input: z.infer<typeof reportInput>) {
  const def = defs[input.type];
  const values: (string|number)[] = [input.from,input.to];
  const filters: string[] = ["$1::date<=$2::date"];
  if (input.type === "employees") filters.push(`(${def.date}<=$2::date OR ${def.date} IS NULL)`);
  else if (input.type === "leaves") filters.push("r.start_date<=$2::date AND r.end_date>=$1::date");
  else if (input.type === "payroll") filters.push("r.period BETWEEN left($1::text,7) AND left($2::text,7)");
  else filters.push(`${def.date} BETWEEN $1::date AND $2::date`);
  if(input.employeeId) {values.push(input.employeeId);filters.push(`${def.employee || "r.employee_id"}=$${values.length}`);}
  if(input.status && input.status !== "all" && def.status) {values.push(input.status);filters.push(`${def.status}::text=$${values.length}`);}
  // Fixed allowlisted SQL only. User values are always bound.
  const result = await pool.query(`SELECT e.employee_number AS "employeeNumber",COALESCE(NULLIF(e.full_name_ar,''),e.full_name_en) AS employee,
    COALESCE(d.name_ar,e.department::text) AS department,${def.select}
    FROM ${def.table} ${input.type === "employees" ? "JOIN employees e ON e.id=r.id" : "LEFT JOIN employees e ON e.id=r.employee_id"}
    LEFT JOIN hr_departments d ON d.code=e.department
    ${input.type === "audit" ? "LEFT JOIN users u ON u.id=r.performed_by" : ""}
    WHERE ${filters.join(" AND ")} ORDER BY ${input.type === "employees" ? "e.employee_number" : def.date+" DESC"},r.id DESC LIMIT 5001`,values);
  return {...input,columns:[...identityColumns,...def.columns].map(([key,ar,en])=>({key,ar,en})),rows:result.rows.slice(0,5000),truncated:result.rows.length>5000};
}

export function registerHrOperations(app:Express, authorize:RequestHandler) {
  const endpoint = (handler:(req:any,res:any)=>Promise<any>):RequestHandler => async(req,res)=>{
    try {await handler(req,res);} catch(error:any) {
      if(error instanceof z.ZodError) {res.status(400).json({message:"تحقق من الحقول والفترة المحددة.",errors:error.flatten()});return;}
      if (!error.status) console.error("HR operations failed:",error);
      res.status(error.status || 500).json({message:error.status ? error.message : "تعذّر إتمام العملية. حاول مجددًا."});
    }
  };
  app.get("/api/hr/reports",authorize,endpoint(async(req,res)=>res.json(await hrReport(reportInput.parse(req.query)))));
  app.get("/api/attendance/permissions",authorize,endpoint(async(_req,res)=>res.json(await storage.getAttendancePermissions())));
  app.get("/api/hr/requests/:kind/:id/history",authorize,endpoint(async(req,res)=>{
    const kind=z.enum(["leave","permission"]).parse(req.params.kind);
    const id=z.coerce.number().int().positive().parse(req.params.id);
    const request=kind==="leave"?await storage.getLeaveRequest(id):(await storage.getAttendancePermissions()).find(p=>p.id===id);
    if(!request) workflowError(404,"الطلب غير موجود.");
    const employee=request.employeeId ? await storage.getEmployee(request.employeeId) : null;
    const manager=employee?.managerId ? await storage.getEmployee(employee.managerId) : null;
    const {rows:history}=await pool.query(`SELECT h.id,h.decision,h.previous_status AS "previousStatus",h.next_status AS "nextStatus",
      h.note,h.created_at AS "createdAt",COALESCE(u.full_name_ar,u.username,e.full_name_ar,'—') AS "actorName"
      FROM hr_request_history h LEFT JOIN users u ON u.id=h.actor_user_id LEFT JOIN employees e ON e.id=h.actor_employee_id
      WHERE h.kind=$1 AND h.request_id=$2 ORDER BY h.id`,[kind,id]);
    const managerApproved=kind==="leave" && (request as any).managerApprovedBy ||
      history.some(h=>h.nextStatus==="manager_approved");
    const reviewerStage=["approved","rejected","cancelled","auto_approved"].includes(request.status) ? "closed" :
      request.status==="manager_approved" || managerApproved || !employee?.managerId ? "hr" : "manager";
    res.json({request:{...request,reviewerStage},history,managerName:manager?.fullNameAr || manager?.fullNameEn || null});
  }));
  app.post("/api/leaves/:id/cancel",authorize,endpoint(async(req,res)=>{
    const reason=z.string().trim().min(3).max(2000).parse(req.body.reason);
    res.json(await cancelLeave(Number(req.params.id),reason,{userId:req.session.userId}));
  }));
  app.get("/api/hr/access",authorize,endpoint(async(_req,res)=>{
    const {rows:employees} = await pool.query(`SELECT e.id,e.employee_number AS "employeeNumber",e.full_name_ar AS "fullNameAr",
      e.full_name_en AS "fullNameEn",e.phone,e.status,e.attendance_enabled AS "attendanceEnabled",
      u.username,u.active AS "accountActive",m.full_name_ar AS "managerName"
      FROM employees e LEFT JOIN users u ON u.id=e.user_id LEFT JOIN employees m ON m.id=e.manager_id ORDER BY e.employee_number,e.id`);
    const counts=new Map<string,number>();
    for(const e of employees){const phone=normalizeEmployeePhone(e.phone || "");if(phone)counts.set(phone,(counts.get(phone)||0)+1);}
    const {rows:hrAccounts}=await pool.query(`SELECT id,username,full_name_ar AS "fullNameAr",full_name_en AS "fullNameEn",active
      FROM users WHERE role='hr' AND archived=false ORDER BY id`);
    res.json({employees:employees.map(e=>({...e,phoneValid:!!normalizeEmployeePhone(e.phone||""),duplicatePhone:(counts.get(normalizeEmployeePhone(e.phone||"")||"")||0)>1})),
      hrAccounts,modules:HR_WORKSPACE_PERMISSIONS.map(key=>{
        const labels:Record<string,[string,string]>={"/employees":["الموظفون","Employees"],"/attendance-monitor":["مراقبة الدوام","Attendance"],"/attendance-settings":["إعدادات الدوام","Attendance settings"],"/leaves":["الإجازات","Leave"],"/permissions":["الاستئذانات","Permissions"],"/reports":["مركز التقارير","Reports"],"/access":["الحسابات والصلاحيات","Accounts & access"],"/actions":["المعاملات والقرارات","HR actions"],"/payroll":["مسير الرواتب","Payroll"],"/advances":["السلف","Advances"],"/evaluations":["التقييمات","Evaluations"]};
        return {key,ar:labels[key]?.[0]||key,en:labels[key]?.[1]||key};
      })});
  }));
  app.patch("/api/hr/access/employees/:id",authorize,endpoint(async(req,res)=>{
    const id=z.coerce.number().int().positive().parse(req.params.id);
    const data=z.object({attendanceEnabled:z.boolean(),expectedAttendanceEnabled:z.boolean(),reason:z.string().trim().min(3).max(1000)}).strict().parse(req.body);
    const client=await pool.connect();
    try {
      await client.query("BEGIN");
      const {rows:[old]}=await client.query("SELECT attendance_enabled FROM employees WHERE id=$1 FOR UPDATE",[id]);
      if(!old) workflowError(404,"الموظف غير موجود.");
      if(old.attendance_enabled!==data.expectedAttendanceEnabled) workflowError(409,"تغيرت الصلاحية بواسطة مستخدم آخر؛ حدّث الصفحة.");
      const {rows:[updated]}=await client.query(`UPDATE employees SET attendance_enabled=$2 WHERE id=$1 RETURNING id,attendance_enabled AS "attendanceEnabled"`,[id,data.attendanceEnabled]);
      await client.query(`INSERT INTO hr_audit_log(performed_by,employee_id,action,details) VALUES($1,$2,'employee_attendance_access_changed',$3)`,
        [req.session.userId,id,JSON.stringify({before:old.attendance_enabled,after:data.attendanceEnabled,reason:data.reason})]);
      await client.query("COMMIT");res.json(updated);
    }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  }));
}
