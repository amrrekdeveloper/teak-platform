import type { Express, RequestHandler } from "express";
import type { PoolClient } from "pg";
import { createHash } from "node:crypto";
import { z } from "zod";
import { pool } from "./db";
import { validDate } from "./employee-portal/security";
import { riyadhDateKey, riyadhDayBounds, shiftAttendanceStatus, type AttendanceShift } from "../shared/attendance";
import { completeShiftEvidence, legacyRestDay, resolveWeekPolicy, workdayFor, type WeekPolicy } from "../shared/attendance-workweek";

type Executor = Pick<PoolClient,"query">;
const LOCK = 610284;
const policyColumns = `id,employee_id AS "employeeId",working_days AS "workingDays",
  effective_from AS "effectiveFrom",reason,created_at AS "createdAt"`;
export async function weekPolicies(executor: Executor = pool): Promise<WeekPolicy[]> {
  return (await executor.query(`SELECT ${policyColumns} FROM attendance_week_policies ORDER BY id`)).rows;
}
export interface DayCalendar {
  workingDay: boolean | null; source: string; policyId: number | null; verified: boolean;
}
/** A missing legacy calendar is NOT established policy. No automatic retrospective capture. */
export async function calendarForDay(employeeId:number, day:string, executor:Executor=pool, policies?:WeekPolicy[],
  savedDays?:Map<string,{workingDay:boolean;source:string;policyId:number|null}>):Promise<DayCalendar> {
  const saved=savedDays?savedDays.get(day):(await executor.query(`SELECT working_day AS "workingDay",source,policy_id AS "policyId"
    FROM attendance_day_calendars WHERE employee_id=$1 AND business_day=$2`,[employeeId,day])).rows[0];
  if(saved)return {...saved,verified:true};
  const policy=resolveWeekPolicy(policies??await weekPolicies(executor),employeeId,day);
  const workingDay=workdayFor(policy,day);
  if(workingDay===null)return {workingDay:null,source:"legacy",policyId:null,verified:false};
  if(day===riyadhDateKey(new Date())) {
    const {rows:[captured]}=await executor.query(`INSERT INTO attendance_day_calendars
      (employee_id,business_day,working_day,policy_id,source) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(employee_id,business_day) DO UPDATE SET working_day=attendance_day_calendars.working_day
      RETURNING working_day AS "workingDay",source,policy_id AS "policyId"`,
    [employeeId,day,workingDay,policy.policyId,policy.source]);
    return {...captured,verified:true};
  }
  return {workingDay,source:policy.source,policyId:policy.policyId,verified:true};
}

const inputSchema=z.object({
  mode:z.enum(["policy","review","bootstrap"]),scope:z.enum(["all","employees"]),
  employeeIds:z.array(z.number().int().positive()).max(500).default([]),
  workingDays:z.array(z.number().int().min(0).max(6)).max(7).nullable(),
  effectiveFrom:z.string().refine(validDate).optional(),businessDay:z.string().refine(validDate).optional(),
  includeOverrides:z.boolean().default(false),reason:z.string().trim().min(3).max(1000),
}).strict();
export type WorkweekInput=z.infer<typeof inputSchema>;
class WeekError extends Error {
  constructor(public status:number,message:string,public messageEn:string){super(message);}
}
export function parseWeekInput(body:unknown, today=riyadhDateKey(new Date())) {
  const parsed=inputSchema.safeParse(body);
  if(!parsed.success)throw new WeekError(400,"تحقق من الأيام والتاريخ والسبب والموظفين.","Check the weekdays, date, reason and employees.");
  const input=parsed.data;
  if(input.mode==="bootstrap" && (input.scope!=="all" || input.employeeIds.length ||
    input.effectiveFrom!==today || input.businessDay || input.includeOverrides || !input.workingDays?.length))
    throw new WeekError(400,"التفعيل الأول يتطلب جميع الموظفين وتاريخ اليوم وأيام العمل.","Initial activation requires all employees, today and working days.");
  if(input.mode==="policy"&&input.workingDays?.length===0)
    throw new WeekError(400,"اختر يوم عمل واحدًا على الأقل.","Choose at least one working day.");
  if(new Set(input.employeeIds).size!==input.employeeIds.length ||
    (input.workingDays&&new Set(input.workingDays).size!==input.workingDays.length))
    throw new WeekError(400,"لا يمكن تكرار الأيام أو الموظفين.","Duplicate days or employees are not allowed.");
  if(input.scope==="all" && (input.employeeIds.length||input.workingDays===null) ||
    input.scope==="employees"&&!input.employeeIds.length ||
    input.scope==="employees"&&input.includeOverrides)
    throw new WeekError(400,"اختر نطاق تطبيق صحيحًا.","Choose a valid scope.");
  if(input.mode==="policy" && (!input.effectiveFrom||input.effectiveFrom<=today||input.businessDay))
    throw new WeekError(400,"التعديل العام يسري غدًا أو لاحقًا. استخدم مراجعة يوم للتاريخ الجاري أو السابق.","Policies must start tomorrow or later. Use day review for today or earlier.");
  if(input.mode==="review" && (!input.businessDay||input.businessDay>today||input.effectiveFrom ||
    input.scope!=="employees"||input.workingDays===null))
    throw new WeekError(400,"مراجعة اليوم تتطلب موظفين محددين وتاريخًا غير مستقبلي.","Day review requires selected employees and a date no later than today.");
  return {...input,employeeIds:[...input.employeeIds].sort((a,b)=>a-b),
    workingDays:input.workingDays?[...input.workingDays].sort((a,b)=>a-b):null};
}

async function reviewEvidence(executor:Executor, employeeId:number, day:string) {
  const bounds=riyadhDayBounds(day);
  const schedules=(await executor.query(`SELECT shifts FROM attendance_day_schedules WHERE employee_id=$1 AND business_day=$2`,[employeeId,day])).rows;
  const records=(await executor.query(`SELECT id,type,check_time AT TIME ZONE 'UTC' AS "checkTime",shift_key AS "shiftKey",
    is_manual_edit AS "isManualEdit",is_out_of_zone AS "isOutOfZone",notes,override_excuse,override_note,override_by,edited_by
    FROM attendance_records WHERE employee_id=$1
    AND check_time >= $2::timestamptz AT TIME ZONE 'UTC' AND check_time <= $3::timestamptz AT TIME ZONE 'UTC' ORDER BY id`,
  [employeeId,bounds.from,bounds.to])).rows;
  const leaves=(await executor.query(`SELECT id,status FROM leave_requests WHERE employee_id=$1 AND start_date<=$2::date AND end_date>=$2::date ORDER BY id`,[employeeId,day])).rows;
  const corrections=(await executor.query(`SELECT id,status,shift_key FROM attendance_corrections WHERE employee_id=$1 AND business_day=$2 ORDER BY id`,[employeeId,day])).rows;
  const shifts:AttendanceShift[]=schedules[0]?.shifts??[];
  return {shifts,records,leaves,corrections,complete:completeShiftEvidence(shifts)};
}
function expectedStatuses(workingDay:boolean|null, evidence:Awaited<ReturnType<typeof reviewEvidence>>, day:string, contractStart:string) {
  if(!evidence.records.length&&day<contractStart)return ["not_started"];
  if(!evidence.records.length&&evidence.leaves.some(l=>l.status==="approved"))return ["approved_leave"];
  if(workingDay===null&&!evidence.records.length&&legacyRestDay(day))return ["rest_day"];
  if(workingDay===false)return [evidence.records.length?"present":"rest_day"];
  if(workingDay===null||!evidence.complete)return ["unverified_schedule"];
  return evidence.shifts.map(shift=>{
    const events=evidence.records.filter(r=>r.shiftKey===shift.id||(!r.shiftKey&&evidence.shifts.length===1));
    if(evidence.corrections.some(c=>c.shift_key===shift.id&&c.status==="approved"))return "excused";
    return shiftAttendanceStatus(day,shift,events).status;
  });
}
export async function buildWeekPreview(input:WorkweekInput, executor:Executor=pool) {
  const day=(input.mode==="review"?input.businessDay:input.effectiveFrom)!;
  const policies=await weekPolicies(executor);
  if(input.mode==="bootstrap" && policies.length)
    throw new WeekError(409,"سبق اعتماد أسبوع العمل. حدّث الشاشة واستخدم تعديل السياسة.","A workweek policy already exists. Refresh and use policy changes.");
  const employees=(await executor.query(`SELECT id,employee_number AS "employeeNumber",full_name_ar AS name,status,
    COALESCE(hire_date,contract_start) AS "contractStart" FROM employees ORDER BY id`)).rows;
  const chosen=employees.filter(e=>input.scope==="all"?e.status==="active":input.employeeIds.includes(e.id));
  if(input.scope==="employees"&&chosen.length!==input.employeeIds.length)
    throw new WeekError(404,"تعذر العثور على أحد الموظفين. أعد المعاينة.","An employee was not found. Refresh the preview.");
    if(input.mode!=="review"&&chosen.some(e=>e.status!=="active"))
    throw new WeekError(400,"اختر موظفين نشطين لتعديل أسبوع العمل.","Select active employees for a workweek policy.");
  const rows:any[]=[]; let excludedCount=0;
  for(const employee of chosen) {
    const before=resolveWeekPolicy(policies,employee.id,day);
    if(input.mode==="policy"&&input.scope==="all"&&!input.includeOverrides&&before.source==="employee"){excludedCount++;continue;}
    const after=input.workingDays===null?resolveWeekPolicy(policies.filter(p=>p.employeeId!==employee.id),employee.id,day)
      :{workingDays:input.workingDays,source:input.scope==="all"?"default":"employee"};
    if(input.mode==="policy"&&input.workingDays===null&&after.workingDays===null)
      throw new WeekError(400,"لا توجد قاعدة عامة معتمدة في تاريخ السريان. اعتمد القاعدة العامة قبل إلغاء تخصيص الموظف.",
        "No general policy is approved for that date. Approve a general policy before resetting the employee exception.");
    const row:any={employeeId:employee.id,employeeNumber:employee.employeeNumber,name:employee.name,
      before:{...before,workingDay:workdayFor(before,day)},after:{...after,workingDay:after.workingDays?.includes(new Date(`${day}T12:00:00+03:00`).getUTCDay())??null}};
    if(input.mode==="review"){
      const saved=(await executor.query(`SELECT * FROM attendance_day_calendars WHERE employee_id=$1 AND business_day=$2`,[employee.id,day])).rows[0];
      const evidence=await reviewEvidence(executor,employee.id,day);
      row.before={...row.before,workingDay:saved?.working_day??workdayFor(before,day),source:saved?.source??before.source};
      row.before.statuses=expectedStatuses(row.before.workingDay,evidence,day,employee.contractStart);
      row.after.source="review";
      row.after.statuses=expectedStatuses(row.after.workingDay,evidence,day,employee.contractStart);
      row.evidence=evidence;row.previousCalendar=saved??null;
      if(!evidence.complete)row.warning="لا يوجد جدول يومي مكتمل محفوظ؛ سيُصحح تصنيف اليوم فقط دون احتساب غياب أو تأخير. / No complete frozen schedule: classification only, no automatic absence or lateness.";
      if(row.after.statuses.some((s:string)=>["absent","missing_checkin","missing_checkout","late"].includes(s)))
        row.warning="قد تظهر حالة تقصير وفق الجدول اليومي المحفوظ. راجع النتيجة والبصمات قبل الاعتماد. / A deficiency may appear from the frozen schedule. Review the outcome before approval.";
    }
    rows.push(row);
  }
  const warnings=[
    "لن تتغير البصمات أو ساعات الدوام أو مواقع العمل. / Punches, shift times and workplaces remain unchanged.",
    ...(input.mode==="review"?["هذه مراجعة ليوم محدد وليست تعديلًا عامًا للتاريخ؛ الأصل والسبب وهوية المعتمد تحفظ في السجل. / This reviews one day only and preserves the original evidence and audit trail."]:[]),
    ...(input.scope==="all"?["القاعدة العامة تشمل الموظفين الجدد أيضًا. التخصيصات المؤجلة بعد تاريخ السريان تبقى محفوظة. / The general policy also covers new employees. Later scheduled employee overrides are preserved."]:[]),
    ...(input.workingDays?.length===7?["لم تحدد يوم راحة أسبوعية. تأكد من السياسة المعتمدة قبل المتابعة. / No weekly rest day selected. Confirm your approved policy."]:[]),
  ];
  const relevantPolicies=policies.filter(p=>p.employeeId===null||chosen.some(e=>e.id===p.employeeId));
  const previewToken=createHash("sha256").update(JSON.stringify({input,policies:relevantPolicies,employees:chosen,rows})).digest("hex");
  return {previewToken,rows,affectedCount:rows.length,excludedCount,warnings,mode:input.mode,
    effectiveFrom:input.effectiveFrom,businessDay:input.businessDay};
}
export async function applyWeekChange(input:WorkweekInput, token:string, actor:number) {
  if(!Number.isSafeInteger(actor)||actor<=0)throw new WeekError(401,"يلزم تسجيل الدخول للاعتماد.","Sign in before approving changes.");
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)",[LOCK]);
    await client.query("LOCK TABLE employees IN SHARE MODE");
    // Prevent a punch, schedule change or leave approval from racing a reviewed preview.
    if(input.mode==="review")await client.query(`LOCK TABLE attendance_records,attendance_day_schedules,
      attendance_day_calendars,leave_requests,attendance_corrections IN SHARE ROW EXCLUSIVE MODE`);
    const preview=await buildWeekPreview(input,client);
    if(token!==preview.previewToken)throw new WeekError(409,"تغيرت البيانات منذ المعاينة. أعد المعاينة قبل الاعتماد.","Data changed since preview. Preview again before confirming.");
    if(!preview.rows.length)throw new WeekError(400,"لا يوجد موظفون متأثرون بهذا الاختيار.","No employees are affected by this selection.");
    if(input.mode!=="review"){
      if(input.scope==="all"){
        await client.query(`INSERT INTO attendance_week_policies(employee_id,working_days,effective_from,reason,created_by)
          VALUES(NULL,$1::jsonb,$2,$3,$4)`,[JSON.stringify(input.workingDays),input.effectiveFrom,input.reason,actor]);
        if(input.includeOverrides)for(const row of preview.rows.filter(r=>r.before.source==="employee"))
          await client.query(`INSERT INTO attendance_week_policies(employee_id,working_days,effective_from,reason,created_by)
            VALUES($1,NULL,$2,$3,$4)`,[row.employeeId,input.effectiveFrom,input.reason,actor]);
      }else for(const row of preview.rows)
        await client.query(`INSERT INTO attendance_week_policies(employee_id,working_days,effective_from,reason,created_by)
          VALUES($1,$2::jsonb,$3,$4,$5)`,[row.employeeId,input.workingDays===null?null:JSON.stringify(input.workingDays),input.effectiveFrom,input.reason,actor]);
    }else for(const row of preview.rows){
      await client.query(`INSERT INTO attendance_calendar_reviews(employee_id,business_day,working_day,old_value,new_value,reason,created_by)
        VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7)`,[row.employeeId,input.businessDay,row.after.workingDay,
        JSON.stringify({calendar:row.previousCalendar,classification:row.before,evidence:row.evidence}),
        JSON.stringify(row.after),input.reason,actor]);
      await client.query(`INSERT INTO attendance_day_calendars(employee_id,business_day,working_day,source)
        VALUES($1,$2,$3,'review') ON CONFLICT(employee_id,business_day) DO UPDATE
        SET working_day=$3,source='review',policy_id=NULL,captured_at=now()`,[row.employeeId,input.businessDay,row.after.workingDay]);
    }
    await client.query(`INSERT INTO hr_audit_log(performed_by,action,details) VALUES($1,$2,$3)`,
      [actor,input.mode==="policy"?"workweek_policy":"workweek_day_review",JSON.stringify({input,count:preview.rows.length,previewToken:token})]);
    await client.query("COMMIT");
    return {success:true,count:preview.rows.length,message:"تم اعتماد التعديل وحفظ سجل المراجعة.",messageEn:"Change approved and audit trail saved."};
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}

export function registerWorkweek(app:Express,authorize:RequestHandler){
  const failure=(res:any,error:any)=>{
    const missing=error?.code==="42P01";
    if(!(error instanceof WeekError))console.error("Workweek operation failed",{name:error?.name,code:error?.code??"application_error"});
    res.status(error.status??(missing?503:500)).json({
      message:error instanceof WeekError?error.message:missing?"يلزم نشر تحديث قاعدة البيانات أولًا.":"تعذر حفظ أو تحميل إعداد أيام العمل.",
      messageEn:error instanceof WeekError?error.messageEn:missing?"Publish the database update first.":"Unable to load or save the workweek settings."});
  };
  app.get("/api/attendance/workweek/settings",authorize,async(req,res)=>{
    try{
      const today=riyadhDateKey(new Date()),day=typeof req.query.day==="string"?req.query.day:today;
      if(!validDate(day))throw new WeekError(400,"اختر تاريخًا صحيحًا.","Choose a valid date.");
      const policies=await weekPolicies();
      const employees=(await pool.query(`SELECT id,employee_number AS "employeeNumber",full_name_ar AS name,status FROM employees ORDER BY employee_number,id`)).rows;
      const reviews=(await pool.query(`SELECT id,employee_id AS "employeeId",business_day AS "businessDay",working_day AS "workingDay",
        reason,created_at AS "createdAt" FROM attendance_calendar_reviews ORDER BY id DESC LIMIT 100`)).rows;
      res.json({today,tomorrow:riyadhDateKey(new Date(Date.now()+86400000)),employees:employees.map(e=>({...e,...resolveWeekPolicy(policies,e.id,day)})),policies,reviews});
    }catch(error){failure(res,error);}
  });
  app.post("/api/attendance/workweek/preview",authorize,async(req,res)=>{
    try{res.json(await buildWeekPreview(parseWeekInput(req.body)));}catch(error){failure(res,error);}
  });
  app.post("/api/attendance/workweek/apply",authorize,async(req,res)=>{
    try{
      const {previewToken,confirm,...body}=req.body??{};
      if(confirm!==true||typeof previewToken!=="string"||!/^[a-f0-9]{64}$/.test(previewToken))
        throw new WeekError(400,"المعاينة والتأكيد مطلوبان قبل الاعتماد.","Preview and confirmation are required.");
      res.json(await applyWeekChange(parseWeekInput(body),previewToken,req.session.userId!));
    }catch(error){failure(res,error);}
  });
}
