import type { Express, RequestHandler } from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import { pool } from "./db";
import { riyadhDateKey } from "../shared/attendance";
import { normalizeEmployeePhone } from "./employee-portal/security";
import { workflowError } from "./hr-workflow-support";
import type { HrAlert, HrAlertsResponse, HrAlertSettings } from "../shared/hr-alerts";

export type AlertEmployee = {
  id:number; employee_number:string; full_name_ar:string; full_name_en:string|null;
  status:string; nationality:string; contract_type:string|null; contract_end:string|null;
  iqama_expiry:string|null; insurance_expiry:string|null; national_id:string|null;
  iqama_number:string|null; hire_date:string|null; phone:string|null;
  manager_id:number|null; manager_usable:boolean;
};
export type AlertRequest = {id:number;employee_id:number;kind:"leave"|"permission"|"correction"|"action"|"advance"|"return";date:string;status:string};
const DEFAULTS:HrAlertSettings={leadDays:90,requestSlaDays:3,updatedAt:null};
const DAY=86400000;
const stamp=`to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const dayDistance=(from:string,to:string)=>Math.round((Date.parse(`${to}T00:00:00Z`)-Date.parse(`${from}T00:00:00Z`))/DAY);
const addDays=(day:string,days:number)=>new Date(Date.parse(`${day}T00:00:00Z`)+days*DAY).toISOString().slice(0,10);

export function generateHrAlerts(employees:AlertEmployee[],requests:AlertRequest[],settings:HrAlertSettings,asOf:string):HrAlert[] {
  const result:HrAlert[]=[];
  const phones=new Map<string,number>();
  for(const e of employees){const phone=normalizeEmployeePhone(e.phone||"");if(phone)phones.set(phone,(phones.get(phone)||0)+1);}
  const active=new Map(employees.filter(e=>e.status==="active").map(e=>[e.id,e]));
  function add(e:AlertEmployee,kind:string,category:HrAlert["category"],severity:HrAlert["severity"],ar:string,en:string,descriptionAr:string,descriptionEn:string,dueDate:string|null,href:string,fingerprint=""){
    result.push({key:`${kind}:${e.id}:${createHash("sha256").update(fingerprint||dueDate||"missing").digest("hex").slice(0,24)}`,
      kind,category,severity,employeeId:e.id,employeeNumber:e.employee_number,employeeNameAr:e.full_name_ar,
      employeeNameEn:e.full_name_en||e.full_name_ar,titleAr:ar,titleEn:en,descriptionAr,descriptionEn,dueDate,
      daysRemaining:dueDate?dayDistance(asOf,dueDate):null,href,readAt:null,snoozedUntil:null});
  }
  for(const e of active.values()){
    const href=`/hr/employees/${e.id}`;
    for(const [kind,date,ar,en] of [
      ["iqama_expiry",e.nationality==="saudi"?null:e.iqama_expiry,"الإقامة","Iqama"],
      ["insurance_expiry",e.insurance_expiry,"التأمين الطبي","Medical insurance"],
      ["contract_expiry",e.contract_type==="open"?null:e.contract_end,"العقد","Contract"],
    ] as const){
      if(!date)continue;
      const left=dayDistance(asOf,date);
      if(left>settings.leadDays)continue;
      add(e,kind,"compliance",left<0?"critical":left<=30?"warning":"info",
        `${ar}: ${left<0?"انتهى التاريخ المسجل":left===0?"ينتهي اليوم":"قرب الانتهاء"}`,
        `${en}: ${left<0?"recorded expiry passed":left===0?"expires today":"expiring soon"}`,
        `بحسب التاريخ المسجل ${date}. راجع المستند وحدّث الملف بعد التحقق؛ لا يغيّر التنبيه حالة الموظف أو راتبه.`,
        `Based on the recorded date ${date}. Verify the document and update the employee file; no employment or payroll change is made.`,
        date,href);
    }
    const missingAr:string[]=[],missingEn:string[]=[];
    function missing(test:boolean,ar:string,en:string){if(test){missingAr.push(ar);missingEn.push(en);}}
    missing(!e.hire_date,"تاريخ التعيين","hire date");
    missing(e.nationality==="saudi"?!e.national_id:!e.iqama_number,e.nationality==="saudi"?"رقم الهوية":"رقم الإقامة",e.nationality==="saudi"?"national ID":"iqama number");
    missing(e.nationality!=="saudi"&&!e.iqama_expiry,"انتهاء الإقامة","iqama expiry");
    missing(!e.insurance_expiry,"انتهاء التأمين","insurance expiry");
    missing(e.contract_type!=="open"&&!e.contract_end,"نهاية العقد أو توضيح نوعه","contract end or contract type");
    const phone=normalizeEmployeePhone(e.phone||"");
    missing(!phone,"جوال صالح للدخول","valid sign-in mobile");
    if(missingAr.length)add(e,"missing_employee_data","data","info","بيانات تحتاج استكمالًا","Employee data needs review",
      `غير مسجل: ${missingAr.join("، ")}. عدم وجود التاريخ لا يعني انتهاء المستند.`,
      `Not recorded: ${missingEn.join(", ")}. A missing date does not mean the document has expired.`,
      null,href,missingEn.join("|"));
    if(phone&&(phones.get(phone)||0)>1)add(e,"duplicate_phone","data","critical","جوال مكرر يعيق الدخول","Duplicate mobile can block sign-in",
      "تحقق من الجوال الحقيقي في ملف الموظف. لا تدمج الحسابات أو تغير الهوية تلقائيًا.",
      "Verify the employee's real mobile. Do not automatically merge identities or accounts.",null,"/hr/access",phone);
    if(e.manager_id&&!e.manager_usable)add(e,"manager_unavailable","data","warning","ربط المدير يحتاج مراجعة","Manager approval link needs review",
      "المدير المرتبط لا يملك حساب موافقات فعّالًا. صحح الربط أو احسم الطلب بتدخل إداري موثق.",
      "The assigned manager has no active approval account. Review the link or use a documented HR override.",null,href,String(e.manager_id));
  }
  for(const r of requests){
    const e=active.get(r.employee_id);if(!e)continue;
    if(r.kind==="return"){
      const due=addDays(r.date,1),left=dayDistance(asOf,due);
      if(left<0||left>7)continue;
      add(e,"leave_return","requests",left===0?"warning":"info","موعد عودة مخطط من الإجازة","Planned leave return",
        `العودة المخططة بعد الإجازة #${r.id}: ${due}. هذا تذكير وليس إثبات غياب.`,
        `Planned return after leave #${r.id}: ${due}. This is a reminder, not an absence finding.`,
        due,"/hr/actions?group=return",String(r.id)+":"+due);continue;
    }
    const due=addDays(r.date,settings.requestSlaDays),late=dayDistance(due,asOf);
    if(late<0)continue;
    const labels={leave:["إجازة","Leave"],permission:["استئذان","Permission"],correction:["تصحيح بصمة","Attendance correction"],action:["إجراء موارد بشرية","HR workflow"],advance:["طلب سلفة","Advance request"]};
    const [ar,en]=labels[r.kind];
    add(e,`pending_${r.kind}`,"requests",late>=7?"critical":"warning",`${ar} بانتظار المتابعة`,`${en} needs follow-up`,
      `الطلب #${r.id} بلا تغيير منذ ${r.date}. راجع المرحلة الحالية قبل اتخاذ القرار؛ قد ينتظر رد الموظف أو المدير.`,
      `Request #${r.id} has not changed since ${r.date}. Check its current stage; it may await the employee or manager.`,
      due,r.kind==="leave"?"/hr/leaves":r.kind==="permission"?"/hr/permissions":r.kind==="correction"?"/hr/attendance-monitor":r.kind==="advance"?"/hr/advances":`/hr/employees/${e.id}`,
      `${r.id}:${r.status}:${r.date}`);
  }
  const rank={critical:0,warning:1,info:2};
  return result.sort((a,b)=>rank[a.severity]-rank[b.severity]||(a.dueDate||"9999").localeCompare(b.dueDate||"9999")||a.employeeNumber.localeCompare(b.employeeNumber));
}

export async function getHrAlertSettings():Promise<HrAlertSettings>{
  const {rows:[row]}=await pool.query(`SELECT lead_days AS "leadDays",request_sla_days AS "requestSlaDays",${stamp} AS "updatedAt" FROM hr_alert_settings WHERE id=1`);
  return row||{...DEFAULTS};
}
async function alertEmployees(employeeId?:number):Promise<AlertEmployee[]>{
  const {rows}=await pool.query(`SELECT e.id,e.employee_number,e.full_name_ar,e.full_name_en,e.status,e.nationality,
    e.contract_type,e.contract_end::text,e.iqama_expiry::text,e.insurance_expiry::text,e.national_id,e.iqama_number,
    e.hire_date::text,e.phone,e.manager_id,(u.active IS TRUE AND u.archived IS NOT TRUE) AS manager_usable
    FROM employees e LEFT JOIN employees m ON m.id=e.manager_id LEFT JOIN users u ON u.id=m.user_id
    ${employeeId?"WHERE e.id=$1":""}`,employeeId?[employeeId]:[]);
  return rows;
}
async function pendingSources():Promise<AlertRequest[]>{
  const {rows}=await pool.query(`SELECT l.id,l.employee_id,'leave' AS kind,l.status::text,
      ((COALESCE((SELECT max(h.created_at) FROM hr_request_history h WHERE h.kind='leave' AND h.request_id=l.id),
       l.created_at AT TIME ZONE 'UTC')) AT TIME ZONE 'Asia/Riyadh')::date::text AS date
      FROM leave_requests l WHERE l.status::text IN ('pending','manager_approved','clarification_requested')
    UNION ALL SELECT p.id,p.employee_id,'permission',p.status::text,
      ((COALESCE((SELECT max(h.created_at) FROM hr_request_history h WHERE h.kind='permission' AND h.request_id=p.id),
       p.created_at AT TIME ZONE 'UTC')) AT TIME ZONE 'Asia/Riyadh')::date::text
      FROM attendance_permissions p WHERE p.status::text IN ('pending','manager_approved','clarification_requested')
    UNION ALL SELECT id,employee_id,'correction',status,(created_at AT TIME ZONE 'Asia/Riyadh')::date::text
      FROM attendance_corrections WHERE status='pending'
    UNION ALL SELECT id,employee_id,'action',status,((updated_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Riyadh')::date::text
      FROM hr_actions WHERE status IN ('pending','in_progress','clarification_requested')
    UNION ALL SELECT id,employee_id,'advance',status::text,((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Riyadh')::date::text
      FROM employee_advances WHERE status::text='pending'
    UNION ALL SELECT id,employee_id,'return',status::text,end_date::text FROM leave_requests
      WHERE status::text='approved' AND end_date BETWEEN (now() AT TIME ZONE 'Asia/Riyadh')::date-1 AND (now() AT TIME ZONE 'Asia/Riyadh')::date+6`);
  return rows;
}
export async function listHrAlerts(userId:number):Promise<HrAlertsResponse>{
  const [employees,requests,settings,states]=await Promise.all([alertEmployees(),pendingSources(),getHrAlertSettings(),
    pool.query(`SELECT alert_key,read_at,snoozed_until FROM hr_alert_states WHERE user_id=$1`,[userId])]);
  const asOf=riyadhDateKey(new Date()),byKey=new Map(states.rows.map(r=>[r.alert_key,r]));
  const items=generateHrAlerts(employees,requests,settings,asOf).map(alert=>{
    const state=byKey.get(alert.key);
    return {...alert,readAt:state?.read_at?.toISOString()||null,
      snoozedUntil:state?.snoozed_until && state.snoozed_until.getTime()>Date.now() ? state.snoozed_until.toISOString():null};
  });
  return {asOf,generatedAt:new Date().toISOString(),settings,items};
}
export async function employeeComplianceAlerts(employeeId:number){
  const [employees,settings]=await Promise.all([alertEmployees(employeeId),getHrAlertSettings()]);
  const asOf=riyadhDateKey(new Date());
  return {asOf,items:generateHrAlerts(employees,[],settings,asOf).filter(a=>a.category==="compliance").map(a=>({...a,href:"",
    descriptionAr:`الموعد المسجل: ${a.dueDate}. راجع الموارد البشرية للتحقق والتحديث. هذا التنبيه لا يغير راتبك أو حالة عملك.`,
    descriptionEn:`Recorded date: ${a.dueDate}. Contact HR to verify and update it. This alert does not change your pay or employment status.`}))};
}
export const alertStateInput=z.object({
  key:z.string().min(3).max(180),action:z.enum(["read","unread","snooze","unsnooze"]),
  days:z.union([z.literal(1),z.literal(3),z.literal(7),z.literal(14)]).optional(),note:z.string().trim().max(500).optional(),
}).strict().superRefine((v,c)=>{if(v.action==="snooze"&&(!v.days||(v.note?.length||0)<3))c.addIssue({code:z.ZodIssueCode.custom,message:"سبب التأجيل مطلوب مع مدة محددة."});});
export async function updateAlertState(userId:number,input:z.infer<typeof alertStateInput>){
  const data=alertStateInput.parse(input);
  if(!(await listHrAlerts(userId)).items.some(a=>a.key===data.key))workflowError(409,"تغير مصدر التنبيه. حدّث القائمة.");
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const read=data.action==="read",unread=data.action==="unread",snooze=data.action==="snooze",unsnooze=data.action==="unsnooze";
    await client.query(`INSERT INTO hr_alert_states(user_id,alert_key,read_at,snoozed_until,note) VALUES($1,$2,
      CASE WHEN $3 THEN now() ELSE NULL END,CASE WHEN $4 THEN now()+($5::int*interval '1 day') ELSE NULL END,$6)
      ON CONFLICT(user_id,alert_key) DO UPDATE SET
      read_at=CASE WHEN $3 THEN now() WHEN $7 THEN NULL ELSE hr_alert_states.read_at END,
      snoozed_until=CASE WHEN $4 THEN now()+($5::int*interval '1 day') WHEN $8 THEN NULL ELSE hr_alert_states.snoozed_until END,
      note=CASE WHEN $4 THEN $6 ELSE hr_alert_states.note END,updated_at=now()`,
      [userId,data.key,read,snooze,data.days||null,data.note||null,unread,unsnooze]);
    await client.query(`INSERT INTO hr_audit_log(performed_by,action,details) VALUES($1,'alert_state_changed',$2)`,
      [userId,JSON.stringify({key:data.key,action:data.action,days:data.days,note:data.note,personal:true})]);
    await client.query("COMMIT");
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
  return {ok:true};
}
export const alertSettingsInput=z.object({leadDays:z.number().int().min(7).max(180),requestSlaDays:z.number().int().min(1).max(30),expectedUpdatedAt:z.string().max(80).nullable()}).strict();
export async function saveAlertSettings(userId:number,input:z.infer<typeof alertSettingsInput>){
  const data=alertSettingsInput.parse(input),client=await pool.connect();
  try{
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(51709,1)");
    const {rows:[current]}=await client.query(`SELECT lead_days,request_sla_days,${stamp} AS version FROM hr_alert_settings WHERE id=1 FOR UPDATE`);
    if((current?.version||null)!==data.expectedUpdatedAt)workflowError(409,"عدّل مستخدم آخر إعدادات التنبيهات. حدّثها قبل الحفظ.");
    await client.query(`INSERT INTO hr_alert_settings(id,lead_days,request_sla_days,updated_by) VALUES(1,$1,$2,$3)
      ON CONFLICT(id) DO UPDATE SET lead_days=$1,request_sla_days=$2,updated_by=$3,updated_at=now()`,[data.leadDays,data.requestSlaDays,userId]);
    await client.query(`INSERT INTO hr_audit_log(performed_by,action,details) VALUES($1,'alert_settings_changed',$2)`,
      [userId,JSON.stringify({before:current||DEFAULTS,after:{leadDays:data.leadDays,requestSlaDays:data.requestSlaDays}})]);
    await client.query("COMMIT");
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
  return getHrAlertSettings();
}
export function registerHrAlerts(app:Express,authorize:RequestHandler){
  const endpoint=(handler:(req:any,res:any)=>Promise<unknown>):RequestHandler=>async(req,res)=>{
    try{await handler(req,res);}catch(error:any){
      if(error instanceof z.ZodError){res.status(400).json({message:"تحقق من إعدادات التنبيه وسبب التأجيل."});return;}
      if(!error.status)console.error("HR alerts failed",{code:error.code||"INTERNAL"});
      res.status(error.status||500).json({message:error.status?error.message:"تعذر تحميل أو تحديث التنبيهات."});
    }
  };
  app.get("/api/hr/alerts",authorize,endpoint(async(req,res)=>res.json(await listHrAlerts(req.user.id))));
  app.patch("/api/hr/alerts/state",authorize,endpoint(async(req,res)=>res.json(await updateAlertState(req.user.id,req.body))));
  app.put("/api/hr/alerts/settings",authorize,endpoint(async(req,res)=>res.json(await saveAlertSettings(req.user.id,req.body))));
}
