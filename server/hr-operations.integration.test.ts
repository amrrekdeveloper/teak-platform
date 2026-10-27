import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import express from "express";
import type { Server } from "node:http";
import { pool } from "./db";
import { annualLeaveBalance, cancelLeave, createAdministrativeLeave, hrReport, registerHrOperations, reportInput } from "./hr-operations";
import { decideHrRequest } from "./hr-workflow-support";
import { isHrWorkspaceApi, isHrWorkspacePage, isManagerApi, isSystemAdminApi } from "../shared/hr-access";

const marker="HR-OPS-"+randomUUID().slice(0,12);
const employees:number[]=[],users:number[]=[];
let employeeId:number,hrId:number,managerId:number,server:Server,base:string;
beforeAll(async()=>{
  if(process.env.NODE_ENV==="production"||process.env.REPLIT_DEPLOYMENT==="1")throw new Error("Development fixtures only");
  const {rows:[hr]}=await pool.query(`INSERT INTO users(username,password,role,full_name_ar,full_name_en,active)
    VALUES($1,'invalid-fixture-hash','hr',$1,$1,true) RETURNING id`,[marker]);
  hrId=hr.id;users.push(hr.id);
  const {rows:[manager]}=await pool.query(`INSERT INTO users(username,password,role,full_name_ar,full_name_en,active)
    VALUES($1,'invalid-fixture-hash','hr',$1,$1,true) RETURNING id`,[marker+"-manager"]);
  managerId=manager.id;users.push(manager.id);
  const {rows:[dept]}=await pool.query("SELECT code FROM hr_departments ORDER BY id LIMIT 1");
  for(let i=0;i<2;i++){
    const {rows:[e]}=await pool.query(`INSERT INTO employees(employee_number,full_name_ar,nationality,position,department,monthly_salary,contract_start,hire_date,status,user_id)
      VALUES($1,$1,'saudi','Fixture',$2,1000,'2026-01-01','2020-01-01','active',$3) RETURNING id`,[marker+"-"+i,dept.code,i===0?managerId:null]);
    employees.push(e.id);
  }
  employeeId=employees[1];
  await pool.query("UPDATE employees SET manager_id=$2 WHERE id=$1",[employeeId,employees[0]]);
  const app=express();app.use(express.json());
  app.use((req,_res,next)=>{(req as any).session={userId:hrId};next();});
  registerHrOperations(app,(_req,_res,next)=>next());
  server=await new Promise<Server>(resolve=>{const s=app.listen(0,"127.0.0.1",()=>resolve(s));});
  base="http://127.0.0.1:"+(server.address() as any).port;
});
afterAll(async()=>{
  if(server)await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  await pool.query("DELETE FROM hr_request_history WHERE employee_id=ANY($1::int[])",[employees]);
  await pool.query("DELETE FROM hr_audit_log WHERE employee_id=ANY($1::int[]) OR performed_by=ANY($2::int[])",[employees,users]);
  await pool.query("DELETE FROM leave_requests WHERE employee_id=ANY($1::int[])",[employees]);
  await pool.query("DELETE FROM notifications WHERE user_id=ANY($1::int[])",[users]);
  await pool.query("DELETE FROM employees WHERE id=ANY($1::int[])",[employees]);
  await pool.query("DELETE FROM users WHERE id=ANY($1::int[])",[users]);
});
const leave=(startDate:string,endDate=startDate)=>({employeeId,leaveType:"annual" as const,startDate,endDate,days:Math.round((Date.parse(endDate)-Date.parse(startDate))/86400000)+1,reason:"Fixture"});
describe("HR leave safeguards using PostgreSQL",()=>{
  it("serializes conflicting administrative requests rather than creating duplicates",async()=>{
    const result=await Promise.allSettled([createAdministrativeLeave(leave("2026-11-10","2026-11-12"),hrId),createAdministrativeLeave(leave("2026-11-10","2026-11-12"),hrId)]);
    expect(result.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    expect(result.find(r=>r.status==="rejected")).toMatchObject({reason:{status:409}});
  });
  it("keeps manager stage unless HR explicitly records an override and retains a cancellation audit",async()=>{
    const created=await createAdministrativeLeave(leave("2026-11-15","2026-11-16"),hrId);
    expect(created).toBeDefined();
    await expect(decideHrRequest("leave",created!.id,hrId,"approve")).rejects.toMatchObject({status:403});
    await decideHrRequest("leave",created!.id,hrId,"approve","قرار الموارد البشرية الموثق",{overrideManager:true});
    expect((await annualLeaveBalance(employeeId,2026))).toMatchObject({entitlement:30,used:2,pending:3});
    await expect(cancelLeave(created!.id,"سحب الطلب",{employeeId})).rejects.toMatchObject({status:409});
    await cancelLeave(created!.id,"إلغاء إداري موثق",{userId:hrId});
    expect((await annualLeaveBalance(employeeId,2026))).toMatchObject({used:0,pending:3,available:27});
    const {rows}=await pool.query("SELECT decision,previous_status,next_status FROM hr_request_history WHERE kind='leave' AND request_id=$1 ORDER BY id",[created!.id]);
    expect(rows.map(r=>r.decision)).toEqual(["submit","administrative_approve","cancel"]);
    expect(rows.at(-1)).toMatchObject({previous_status:"approved",next_status:"cancelled"});
    const {rows:[kept]}=await pool.query("SELECT count(*)::int AS n FROM leave_requests WHERE id=$1",[created!.id]);
    expect(kept.n).toBe(1);
    await expect(cancelLeave(created!.id,"مرة أخرى",{userId:hrId})).rejects.toMatchObject({status:409});
  });
  it("derives employee withdrawal ownership from the session identity",async()=>{
    const created=await createAdministrativeLeave(leave("2026-11-20"),hrId);
    await expect(cancelLeave(created!.id,"سحب تجريبي",{employeeId:employees[0]})).rejects.toMatchObject({status:404});
    await cancelLeave(created!.id,"سحب تجريبي",{employeeId});
    expect((await pool.query("SELECT status FROM leave_requests WHERE id=$1",[created!.id])).rows[0].status).toBe("cancelled");
  });
  it("runs each allowlisted report against real tables without changing them",async()=>{
    for(const type of ["employees","leaves","permissions","payroll","advances","evaluations","actions","audit"] as const){
      const report=await hrReport({type,from:"2026-01-01",to:"2026-12-31",employeeId});
      expect(report.columns.length).toBeGreaterThan(3);
      expect(Array.isArray(report.rows)).toBe(true);
      expect(report.truncated).toBe(false);
    }
  });
  it("compares the current attendance grant before writing and audits the successful change",async()=>{
    const enabled=(await pool.query("SELECT attendance_enabled FROM employees WHERE id=$1",[employeeId])).rows[0].attendance_enabled;
    const update=(expectedAttendanceEnabled:boolean)=>fetch(base+"/api/hr/access/employees/"+employeeId,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({attendanceEnabled:!enabled,expectedAttendanceEnabled,reason:"تعديل تجريبي موثق"})});
    expect((await update(!enabled)).status).toBe(409);
    expect((await update(enabled)).status).toBe(200);
    expect((await update(enabled)).status).toBe(409);
    const {rows:[audit]}=await pool.query("SELECT count(*)::int AS n FROM hr_audit_log WHERE employee_id=$1 AND action='employee_attendance_access_changed'",[employeeId]);
    expect(audit.n).toBe(1);
  });
  it("rejects invalid report dates/ranges/types and keeps maintenance boundaries narrow",()=>{
    expect(reportInput.safeParse({type:"users",from:"2026-01-01",to:"2026-01-02"}).success).toBe(false);
    expect(reportInput.safeParse({type:"leaves",from:"2026-02-30",to:"2026-03-01"}).success).toBe(false);
    expect(reportInput.safeParse({type:"leaves",from:"2025-01-01",to:"2026-12-31"}).success).toBe(false);
    for(const path of ["/hr/leaves","/hr/permissions","/hr/reports","/hr/access","/hr/actions"])expect(isHrWorkspacePage(path)).toBe(true);
    expect(isHrWorkspaceApi("POST","/api/leaves/3/cancel")).toBe(true);
    expect(isManagerApi("POST","/api/leaves/3/cancel")).toBe(false);
    expect(isSystemAdminApi("GET","/api/hr/reports")).toBe(false);
    expect(isHrWorkspaceApi("POST","/api/users")).toBe(false);
  });
});
