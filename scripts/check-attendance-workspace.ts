/** Run against a disposable attendance-ui-fixture, never real employees or production. */
import fs from "node:fs";
import { randomBytes,randomUUID } from "node:crypto";
import { pool } from "../server/db";
import { tokenHash,normalizeEmployeePhone } from "../server/employee-portal/security";
import { DEVICE_COOKIE } from "../server/employee-portal/router";
import { riyadhDateKey } from "../shared/attendance";
if(process.env.NODE_ENV!=="development"||process.env.REPLIT_DEPLOYMENT==="1")throw Error("Development only");
const f=JSON.parse(fs.readFileSync(process.argv[2]||"/tmp/teak-attendance-ui.json","utf8"));
if(!String(f.marker).startsWith("ATT-UI-"))throw Error("Disposable fixture required");
const base=`https://${process.env.REPLIT_DEV_DOMAIN}`;
if(!new URL(base).hostname.endsWith(".replit.dev"))throw Error("Development host required");
const cookies:Record<string,string>={hr:"",employee:""};
const extra={zone:0,schedule:0,second:0,department:0},deviceId=randomUUID();
async function api(role:string,path:string,method="GET",body?:unknown,expected=200):Promise<any>{
  const r=await fetch(base+path,{method,headers:{"Content-Type":"application/json","X-Portal-Request":"1",Origin:base,Cookie:cookies[role]},
    body:body===undefined?undefined:JSON.stringify(body)});
  const values=r.headers.getSetCookie();
  if(values.length)cookies[role]=values.map(v=>v.split(";")[0]).join("; ");
  const data=await r.json().catch(()=>({}));
  if(r.status!==expected)throw Error(`${method} ${path}: expected ${expected}, got ${r.status}: ${data.message||""}`);
  return data;
}
try{
  if(!(await api("employee","/api/employee-portal/config")).developmentOtp)throw Error("Development OTP must be enabled; no SMS requests permitted");
  await api("hr","/api/hr-access/login","POST",{username:f.username,password:f.password});
  const raw=randomBytes(32).toString("hex");
  await pool.query(`INSERT INTO employee_portal_devices(id,employee_id,phone,token_hash,device_name,expires_at)
    VALUES($1,$2,$3,$4,'API fixture only',now()+interval '1 hour')`,[deviceId,f.employeeId,normalizeEmployeePhone(f.phone),tokenHash(raw)]);
  cookies.employee=`${DEVICE_COOKIE}=${raw}`;
  const summary=await api("employee","/api/employee-portal/summary");
  if(summary.employee.attendanceZoneId!==f.zoneId||summary.assignedZones[0]?.radiusMeters!==100)throw Error("Assigned zone mismatch");
  console.log("PASS assigned location/radius");
  await api("employee","/api/attendance/corrections","GET",undefined,401);
  await api("employee","/api/system-admin/me","GET",undefined,401);
  console.log("PASS employee/HR/owner session isolation");
  const gps=()=>({type:"check_out",latitude:24.7136,longitude:46.6753,accuracy:5,locationTimestamp:Date.now()});
  await api("employee","/api/employee-portal/attendance","POST",{...gps(),latitude:25.8},403);
  if(!summary.records.some((r:any)=>r.type==="check_out"&&riyadhDateKey(new Date(r.checkTime))===riyadhDateKey(new Date())))
    await api("employee","/api/employee-portal/attendance","POST",gps(),201);
  console.log("PASS outside-zone rejection and assigned-zone checkout");
  const dept=await api("hr","/api/hr/departments","POST",{nameAr:f.marker+" API"},201);extra.department=dept.id;
  await api("hr",`/api/employees/${f.employeeId}`,"PATCH",{department:dept.code});
  await api("hr",`/api/hr/departments/${dept.id}`,"DELETE",undefined,409);
  await api("hr",`/api/employees/${f.employeeId}`,"PATCH",{department:"hr"});
  await api("hr",`/api/hr/departments/${dept.id}`,"DELETE");extra.department=0;
  console.log("PASS dynamic departments and deletion protection");
  const zone=await api("hr","/api/attendance/zones","POST",{nameAr:f.marker+" API",nameEn:f.marker+" API",type:"other",
    centerLat:"24.7136",centerLng:"46.6753",radiusMeters:50,isActive:true});extra.zone=zone.id;
  await api("hr",`/api/attendance/zones/${zone.id}`,"PATCH",{radiusMeters:1500});
  await api("hr",`/api/attendance/zones/${zone.id}`,"PATCH",{radiusMeters:0},400);
  const single={scopeType:"location",locationZoneId:zone.id,labelAr:f.marker+" single",workStartTime:"07:30",graceMinutes:15,
    shifts:[{id:"first",label:"الأولى",start:"07:30",end:"14:30",graceMinutes:15}]};
  const s=await api("hr","/api/attendance/work-settings","POST",single,201);extra.schedule=s.id;
  await api("hr",`/api/attendance/work-settings/${s.id}`,"PATCH",{labelAr:f.marker+" split",shifts:[
    {id:"first",label:"الأولى",start:"09:00",end:"12:00",graceMinutes:15},
    {id:"second",label:"الثانية",start:"16:00",end:"22:00",graceMinutes:15}]});
  const second=await api("hr","/api/attendance/work-settings","POST",{...single,labelAr:f.marker+" alternative"},201);extra.second=second.id;
  await api("hr",`/api/employees/${f.employeeId}`,"PATCH",{attendanceZoneId:zone.id,attendanceScheduleId:s.id});
  await api("hr",`/api/attendance/work-settings/${s.id}`,"DELETE",undefined,409);
  await api("hr",`/api/employees/${f.employeeId}`,"PATCH",{attendanceZoneId:f.zoneId,attendanceScheduleId:s.id},400);
  await api("hr",`/api/employees/${f.employeeId}`,"PATCH",{attendanceZoneId:f.zoneId,attendanceScheduleId:f.scheduleId});
  console.log("PASS circle radius, single/split alternatives, assignment and deletion guards");
  const report=await api("employee",`/api/employee-portal/attendance/history?from=${f.day}&to=${f.day}`);
  if(!report.rows.some((r:any)=>r.status==="excused"&&r.lateMinutes===0&&r.earlyDepartureMinutes===0))throw Error("Approved deficiency not zero");
  console.log("PASS approved effective deficiency zero");
  const maintenance=await fetch(base+"/");
  if(maintenance.status!==200||!(await maintenance.text()).includes("service-links"))throw Error("Maintenance disabled");
  await api("employee","/api/orders","GET",undefined,503);
  console.log("PASS maintenance remains enabled and ERP blocked");
}finally{
  await pool.query("UPDATE employees SET department='hr',attendance_zone_id=$2,attendance_schedule_id=$3 WHERE id=$1",
    [f.employeeId,f.zoneId,f.scheduleId]);
  for(const id of [extra.schedule,extra.second].filter(Boolean))await pool.query("DELETE FROM work_schedule_settings WHERE id=$1",[id]);
  if(extra.zone)await pool.query("DELETE FROM location_zones WHERE id=$1",[extra.zone]);
  if(extra.department)await pool.query("DELETE FROM hr_departments WHERE id=$1",[extra.department]);
  await pool.query("DELETE FROM employee_portal_devices WHERE id=$1",[deviceId]);
  await pool.end();
}
