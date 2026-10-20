/**
 * Development-database protocol tests. SMS transport is mocked ONLY by Vitest;
 * verification, hashing, locks, expiry and sessions use the real implementation.
 * Development-only authentication is explicitly isolated from live SMS.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import { randomBytes, randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { pool } from "../db";
import { initializeEmployeePortal, employeeDirectory, employeePhone } from "./database";
import { tokenHash } from "./security";
import { createEmployeePortalRouter, DEVICE_COOKIE } from "./router";
import { sendEmployeeOtp } from "./sms";
import { ensureAttendanceExtensions, registerAttendanceSupport, employeeAttendanceReport } from "../attendance-support";
import { employeeMonthlyAttendanceRisk, notifyMonthlyAttendanceRisk } from "../attendance-risk";
import { storage } from "../storage";
import { riyadhDateKey, isRiyadhWeekend } from "../../shared/attendance";
import { registerAttendanceOverride } from "../attendance-override";
import { initHrLeaveForm } from "../hr-leave-form";
import { initHrWorkflowSupport, decideHrRequest } from "../hr-workflow-support";

vi.mock("./sms", () => ({ sendEmployeeOtp: vi.fn(async () => {}) }));
vi.mock("../objectFileStore", () => ({
  saveObjectFile: vi.fn(async () => {}),
  deleteObjectFile: vi.fn(async () => {}),
  streamObjectFile: vi.fn(async (_folder, _key, response) => { response.type("application/pdf").send("%PDF-1.7 test"); return true; }),
}));

let server: Server, base = "", employeeId = 0, secondId = 0;
let registeredPhone = "", browserCookie = "", deviceCookie = "", sessionId = "", medicalLeaveId = 0;
const temporaryUsers: number[] = [];
const originalSender = process.env.TAQNYAT_API_KEY;
const originalSecret = process.env.SESSION_SECRET;
const sent = vi.mocked(sendEmployeeOtp);
const fixtureIp = `198.19.${randomBytes(1)[0]}.${randomBytes(1)[0]}`;
const fixtureBrowserHashes = new Set<string>();
const medicalReviewers:Record<string,number>={};
let attendanceMedicalId=0,attendanceRecordId=0;

async function call(path: string, method = "GET", body?: object, cookie = deviceCookie, headers = {}) {
  const response = await fetch(base + path, {
    method, headers: { "Content-Type": "application/json", "X-Portal-Request": "1", "X-Forwarded-For":fixtureIp, Cookie: cookie, ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const cookies=response.headers.getSetCookie();
  for(const cookie of cookies) {
    const match=cookie.match(/teak-otp-browser=([a-f0-9]{64})/);
    if(match)fixtureBrowserHashes.add(tokenHash(match[1]));
  }
  return { status: response.status, data: await response.json(), cookies, retryAfter:response.headers.get("Retry-After") };
}
beforeAll(async () => {
  if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT === "1")
    throw new Error("Never run fixture tests in production");
  // Test-only transport sentinel; never use real secrets or transmit SMS.
  process.env.TAQNYAT_API_KEY = "vitest-transport-disabled";
  process.env.SESSION_SECRET ||= randomBytes(32).toString("hex");
  await initializeEmployeePortal();
  await ensureAttendanceExtensions();
  await initHrLeaveForm();
  await initHrWorkflowSupport();
  const existing = new Set((await employeeDirectory()).map(employeePhone));
  do { registeredPhone = `96650${String(Math.floor(Math.random() * 10000000)).padStart(7, "0")}`; }
  while (existing.has(registeredPhone));
  for (let i = 0; i < 2; i++) {
    const inserted = await pool.query(`INSERT INTO employees
      (employee_number,full_name_ar,nationality,position,department,monthly_salary,contract_start,status,phone,attendance_enabled)
      VALUES($1,'موظف اختبار آلي','saudi','اختبار','hr',1,'2025-01-01','active',$2,true) RETURNING id`,
    [`ESS-TEST-${randomUUID()}`, i === 0 ? registeredPhone : null]);
    if (i === 0) employeeId = inserted.rows[0].id;
    else secondId = inserted.rows[0].id;
  }
  for(const role of ["hr","it"]) {
    const {rows:[user]}=await pool.query(`INSERT INTO users(username,password,role,full_name_ar,full_name_en,active,archived)
      VALUES($1,'non-login-fixture',$2,'اختبار صلاحية','Test only',true,false) RETURNING id`,
    [`ESS-TEST-${randomUUID()}`,role]);
    medicalReviewers[role]=user.id;temporaryUsers.push(user.id);
  }
  const app = express();
  // This in-process server is test-only; use an isolated rate-limit identity.
  app.set("trust proxy",true);
  app.use(express.json({ limit: "8kb" }));
  // Test-only auth adapter loads the real fixture role; never installed in the app.
  const fixtureAdmin=async(req:any,res:any,next:any)=>{
    const id=medicalReviewers[req.get("X-Fixture-Role")];
    if(!id)return res.status(401).json({message:"Fixture authentication required"});
    req.user=(await pool.query("SELECT id,role FROM users WHERE id=$1 AND active=true",[id])).rows[0];
    if(!req.user)return res.status(401).json({message:"Fixture disabled"});
    next();
  };
  registerAttendanceSupport(app,fixtureAdmin);
  registerAttendanceOverride(app,fixtureAdmin);
  app.use(createEmployeePortalRouter());
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  const address = server.address() as { port: number };
  base = `http://127.0.0.1:${address.port}`;
  // A saturated obsolete shared-IP bucket must not lock a new valid browser.
  await pool.query(`INSERT INTO employee_portal_limits(key,count,resets_at) VALUES($1,32,now()+interval '15 minutes')
    ON CONFLICT(key) DO UPDATE SET count=32,resets_at=excluded.resets_at`,[`verify-ip:${tokenHash(fixtureIp)}`]);
}, 30000);

afterAll(async () => {
  if (server) await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
  for (const id of [employeeId, secondId].filter(Boolean)) {
    await pool.query("DELETE FROM employee_portal_otps WHERE employee_id=$1", [id]);
    await pool.query("DELETE FROM employee_portal_devices WHERE employee_id=$1", [id]);
    await pool.query(`DELETE FROM notifications WHERE related_entity='leave_request' AND related_id IN
      (SELECT id FROM leave_requests WHERE employee_id=$1)`, [id]);
    await pool.query(`DELETE FROM notifications WHERE related_entity='attendance_permission' AND related_id IN
      (SELECT id FROM attendance_permissions WHERE employee_id=$1)`, [id]);
    await pool.query(`DELETE FROM notifications WHERE related_entity='attendance_record' AND related_id IN
      (SELECT id FROM attendance_records WHERE employee_id=$1)`,[id]);
    await pool.query("DELETE FROM attendance_audit_log WHERE employee_id=$1",[id]);
    await pool.query("DELETE FROM hr_medical_documents WHERE employee_id=$1", [id]);
    await pool.query("DELETE FROM attendance_records WHERE employee_id=$1", [id]);
    await pool.query("DELETE FROM attendance_day_schedules WHERE employee_id=$1", [id]);
    await pool.query("DELETE FROM attendance_violations WHERE employee_id=$1", [id]);
    await pool.query("DELETE FROM attendance_monthly_risk WHERE employee_id=$1", [id]);
    await pool.query("DELETE FROM risk_alerts WHERE employee_id=$1",[id]);
    await pool.query("DELETE FROM work_schedule_settings WHERE employee_id=$1",[id]);
    await pool.query("DELETE FROM hr_request_history WHERE employee_id=$1", [id]);
    await pool.query("DELETE FROM notifications WHERE related_entity='employee' AND related_id=$1", [id]);
    await pool.query("DELETE FROM leave_requests WHERE employee_id=$1", [id]);
    await pool.query("DELETE FROM attendance_permissions WHERE employee_id=$1", [id]);
    await pool.query("DELETE FROM employees WHERE id=$1", [id]);
  }
  if (registeredPhone) {
    await pool.query("DELETE FROM employee_portal_limits WHERE key IN ($1,$2)",
      [`otp-phone:${tokenHash(registeredPhone)}`, `otp-cooldown:${tokenHash(registeredPhone)}`]);
  }
  await pool.query("DELETE FROM employee_portal_limits WHERE key IN ($1,$2,$3,$4,$5,$6,$7)",[
    `otp-ip-v2:${tokenHash(fixtureIp)}`,`verify-ip-v2:${tokenHash(fixtureIp)}`,
    `medical-upload:${employeeId}`,`attendance:${employeeId}`,`leave:${employeeId}`,`permission:${employeeId}`,`medical-upload:${secondId}`,
  ]);
  for(const hash of fixtureBrowserHashes) await pool.query("DELETE FROM employee_portal_limits WHERE key=$1",[`verify-browser:${hash}`]);
  await pool.query("DELETE FROM employee_portal_limits WHERE key=$1",[`verify-ip:${tokenHash(fixtureIp)}`]);
  for (const id of temporaryUsers) {
    await pool.query("DELETE FROM notifications WHERE user_id=$1",[id]);
    await pool.query("DELETE FROM users WHERE id=$1",[id]);
  }
  if (originalSender === undefined) delete process.env.TAQNYAT_API_KEY;
  else process.env.TAQNYAT_API_KEY = originalSender;
  if (originalSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSecret;
}, 30000);

describe.sequential("isolated employee protocol", () => {
  it("excludes unsnapshotted history after schedule changes from persisted risk and alerts, but retains verified history",async()=>{
    const now=new Date(),today=riyadhDateKey(now);
    const [y,m]=today.split("-").map(Number);
    const period=riyadhDateKey(new Date(Date.UTC(y,m-2,1,12))).slice(0,7);
    const days=Array.from({length:7},(_,i)=>`${period}-${String(i+1).padStart(2,"0")}`)
      .filter(d=>!isRiyadhWeekend(new Date(`${d}T12:00:00+03:00`))).slice(0,3);
    const snapshot=[{id:"single",label:"الدوام",start:"08:00",end:"16:00",graceMinutes:0}];
    const {rows:[setting]}=await pool.query(`INSERT INTO work_schedule_settings(scope_type,employee_id,work_start_time,work_end_time,grace_minutes,shifts)
      VALUES('employee',$1,'08:00','16:00',0,$2) RETURNING id`,[employeeId,JSON.stringify(snapshot)]);
    for(const day of days)for(const [type,time] of [["check_in","09:00"],["check_out","15:00"]])
      await pool.query(`INSERT INTO attendance_records(employee_id,type,check_time,shift_key)
        VALUES($1,$2,$3::timestamptz AT TIME ZONE 'UTC','single')`,[employeeId,type,`${day}T${time}:00+03:00`]);
    const before=await employeeAttendanceReport(employeeId,days[0],days[2]);
    for(const row of before.rows.filter(r=>days.includes(r.day)))expect(row).toMatchObject({
      scheduleVerified:false,late:null,lateMinutes:null,earlyDepartureMinutes:null,status:"unverified_schedule",
    });
    await pool.query(`UPDATE work_schedule_settings SET work_start_time='07:00',work_end_time='17:00',shifts=$2 WHERE id=$1`,
      [setting.id,JSON.stringify([{...snapshot[0],start:"07:00",end:"17:00"}])]);
    const changed=await employeeAttendanceReport(employeeId,days[0],days[2]);
    expect(changed.rows.map(r=>[r.late,r.lateMinutes,r.earlyDepartureMinutes])).toEqual(before.rows.map(r=>[r.late,r.lateMinutes,r.earlyDepartureMinutes]));
    expect(changed.rows.filter(r=>r.checkIn)).toHaveLength(3);
    await pool.query(`INSERT INTO attendance_violations(employee_id,violation_type,attempted_type,details,business_day,shift_key)
      VALUES($1,'missing_checkin','check_out','Isolated risk fixture',$2,'single')`,[employeeId,days[0]]);
    await pool.query(`INSERT INTO attendance_monthly_risk(employee_id,period,late,absent,incomplete,score)
      VALUES($1,$2,3,0,0,3)`,[employeeId,period]);
    const employee=(await storage.getEmployee(employeeId))!;
    const risk=await employeeMonthlyAttendanceRisk(employee,period,days[2],now);
    expect(risk).toMatchObject({late:0,absent:0,incomplete:0,score:0,verifiedDays:0,assessmentAvailable:false});
    expect(risk.unverifiedDays).toBeGreaterThanOrEqual(3);
    expect((await pool.query("SELECT late,absent,incomplete,score FROM attendance_monthly_risk WHERE employee_id=$1 AND period=$2",[employeeId,period])).rows[0])
      .toEqual({late:0,absent:0,incomplete:0,score:0});
    const recipients=[{id:medicalReviewers.hr,role:"hr" as const,active:true}];
    // Even a stale positive score cannot alert when its evidence is unavailable.
    await notifyMonthlyAttendanceRisk([risk,{...risk,score:6,level:"red"}],period,recipients);
    expect((await pool.query("SELECT 1 FROM risk_alerts WHERE employee_id=$1",[employeeId])).rowCount).toBe(0);
    expect((await pool.query("SELECT 1 FROM notifications WHERE related_entity='employee' AND related_id=$1",[employeeId])).rowCount).toBe(0);
    await pool.query("DELETE FROM attendance_violations WHERE employee_id=$1 AND business_day=$2",[employeeId,days[0]]);
    // Fixture-only past snapshots model real evidence; never backfill actual employees.
    for(const day of days)await pool.query("INSERT INTO attendance_day_schedules(employee_id,business_day,shifts) VALUES($1,$2,$3)",
      [employeeId,day,JSON.stringify(snapshot)]);
    const verified=await employeeAttendanceReport(employeeId,days[0],days[0]);
    expect(verified.rows[0]).toMatchObject({scheduleVerified:true,late:true,lateMinutes:60,earlyDepartureMinutes:60});
    const verifiedRisk=await employeeMonthlyAttendanceRisk(employee,period,days[2],now);
    expect(verifiedRisk).toMatchObject({late:3,score:3,level:"orange",verifiedDays:3,assessmentAvailable:true});
    await notifyMonthlyAttendanceRisk([verifiedRisk],period,recipients);
    await notifyMonthlyAttendanceRisk([verifiedRisk],period,recipients);
    expect((await pool.query("SELECT 1 FROM risk_alerts WHERE employee_id=$1",[employeeId])).rowCount).toBe(1);
    expect((await pool.query("SELECT 1 FROM notifications WHERE related_entity='employee' AND related_id=$1",[employeeId])).rowCount).toBe(1);
  });
  it("requires a device session and rejects cross-origin state changes", async () => {
    expect((await call("/me", "GET", undefined, "")).status).toBe(401);
    expect((await call("/otp/request", "POST", { phone: registeredPhone }, "", { Origin: "https://malicious.invalid" })).status).toBe(403);
    expect((await call("/otp/request", "POST", { phone: registeredPhone }, "", { "X-Portal-Request": "" })).status).toBe(403);
  });
  it("issues a challenge, not a session, and never returns the OTP", async () => {
    const response = await call("/otp/request", "POST", { phone: registeredPhone }, "");
    expect(response.status).toBe(200);
    expect(response.data.challengeId).toBeTruthy();
    expect(response.data.code).toBeUndefined();
    expect(sent).toHaveBeenCalledTimes(1);
    browserCookie = response.cookies[0].split(";")[0];
    const cooldown = await call("/otp/request","POST",{phone:registeredPhone},"");
    expect(cooldown.status).toBe(429);
    expect(cooldown.retryAfter).toBe("60");
    const [{ rows }] = await Promise.all([pool.query("SELECT code_hash FROM employee_portal_otps WHERE id=$1", [response.data.challengeId])]);
    const code = sent.mock.calls[0][1];
    expect(rows[0].code_hash).not.toContain(code);
    expect((await call("/otp/verify", "POST", { challengeId: response.data.challengeId, code }, "")).status).toBe(401);
    // Retain fixture challenge only in the test closure, never application logs.
    (globalThis as any).__essTestChallenge = { challengeId: response.data.challengeId, code };
  });
  it("requires the correct OTP, binds the session and consumes the challenge once", async () => {
    const { challengeId, code } = (globalThis as any).__essTestChallenge;
    const wrongCode = code === "123456" ? "654321" : "123456";
    expect((await call("/otp/verify", "POST", { challengeId, code: wrongCode }, browserCookie)).status).toBe(401);
    const verified = await call("/otp/verify", "POST", { challengeId, code, deviceName: "جهاز اختبار آلي" }, browserCookie);
    expect(verified.status).toBe(200);
    const cookie = verified.cookies.find(c => c.startsWith(DEVICE_COOKIE + "="))!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    deviceCookie = cookie.split(";")[0];
    expect((await call("/otp/verify", "POST", { challengeId, code }, browserCookie)).status).toBe(401);
    delete (globalThis as any).__essTestChallenge;
    const me = await call("/me");
    expect(me.data.employee.id).toBe(employeeId);
    sessionId = me.data.sessionId;
    expect((await call("/summary")).data.employee.id).toBe(employeeId);
  });
  it("rejects employee ID spoofing and unverifiable GPS without saving attendance", async () => {
    const baseline=(await pool.query("SELECT count(*)::int AS n FROM attendance_records WHERE employee_id=$1",[employeeId])).rows[0].n;
    const valid = { type: "check_in", latitude: 0, longitude: 0, accuracy: 10, locationTimestamp: Date.now() };
    expect((await call("/attendance", "POST", { ...valid, employeeId: secondId })).status).toBe(400);
    expect((await call("/attendance", "POST", { ...valid, accuracy: 1000 })).status).toBe(400);
    expect((await call("/attendance", "POST", { ...valid, locationTimestamp: Date.now() - 300000 })).status).toBe(400);
    expect((await call("/attendance", "POST", valid)).status).toBe(403);
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM attendance_records WHERE employee_id=$1", [employeeId]);
    expect(rows[0].n).toBe(baseline);
  });
  it("cannot revoke another employee's device or query their private records", async () => {
    const foreignId = randomUUID();
    await pool.query(`INSERT INTO employee_portal_devices(id,employee_id,phone,token_hash,device_name,expires_at)
      VALUES($1,$2,'unregistered-test',$3,'test',now()+interval '1 hour')`, [foreignId, secondId, tokenHash(randomBytes(32).toString("hex"))]);
    await call("/sessions/revoke", "POST", { sessionId: foreignId });
    const { rows } = await pool.query("SELECT revoked_at FROM employee_portal_devices WHERE id=$1", [foreignId]);
    expect(rows[0].revoked_at).toBeNull();
    const response = await call(`/summary?employeeId=${secondId}`);
    expect(response.data.employee.id).toBe(employeeId);
    expect(response.data.sessions.every((d: any) => d.id !== foreignId)).toBe(true);
  });
  it("binds medical reports to the session employee and sick request, never a browser employee ID", async () => {
    const upload = async (data: Record<string,string>) => {
      const form = new FormData();
      form.append("file", new Blob(["%PDF-1.7 fixture only"],{type:"application/pdf"}), "test-medical.pdf");
      for (const [key,value] of Object.entries(data)) form.append(key,value);
      return fetch(base+"/medical-documents",{method:"POST",headers:{"X-Portal-Request":"1",Cookie:deviceCookie},body:form});
    };
    const rejected = await upload({kind:"attendance",recordId:"2147483646",reason:"isolated test"});
    expect(rejected.status).toBe(404);
    const day = new Date(Date.now()+7*86400000).toISOString().slice(0,10);
    const leave = {leaveType:"sick",startDate:day,endDate:day,reason:"اختبار تقرير طبي"};
    expect((await call("/leaves","POST",leave)).status).toBe(400);
    const uploaded = await upload({kind:"leave",employeeId:String(secondId)});
    expect(uploaded.status).toBe(201);
    const {id:medicalAttachmentId} = await uploaded.json();
    const saved=(await pool.query("SELECT employee_id FROM hr_medical_documents WHERE id=$1",[medicalAttachmentId])).rows[0];
    expect(saved.employee_id).toBe(employeeId);
    const created=await call("/leaves","POST",{...leave,medicalAttachmentId});
    expect(created.status).toBe(201);
    medicalLeaveId=created.data.id;
    expect((await pool.query("SELECT leave_id FROM hr_medical_documents WHERE id=$1",[medicalAttachmentId])).rows[0].leave_id).toBe(created.data.id);
    const list=await call("/medical-documents");
    expect(list.data.some((d:any)=>d.id===medicalAttachmentId)).toBe(true);
    expect(JSON.stringify(list.data)).not.toContain("object_key");
    const next=new Date(Date.now()+8*86400000).toISOString().slice(0,10);
    expect((await call("/leaves","POST",{...leave,startDate:next,endDate:next,medicalAttachmentId})).status).toBe(400);
  });
  it("approves an employee-uploaded attendance medical excuse through the exact production override handler",async()=>{
    const {rows:[record]}=await pool.query(`INSERT INTO attendance_records(employee_id,employee_name_ar,type,check_time)
      VALUES($1,'اختبار طبي','check_in',now() AT TIME ZONE 'UTC') RETURNING id`,[employeeId]);
    attendanceRecordId=record.id;
    const path=`/api/attendance/record/${record.id}/override`;
    const input={excuseType:"medical_excuse",note:"عذر طبي اختباري معتمد"};
    expect((await call(path,"POST",input,"",{"X-Fixture-Role":"hr"})).status).toBe(400);
    const form=new FormData();
    form.append("file",new Blob(["%PDF-1.7 synthetic"],{type:"application/pdf"}),"test.pdf");
    form.append("kind","attendance");form.append("recordId",String(record.id));form.append("reason","عذر طبي اختباري");
    const uploaded=await fetch(base+"/medical-documents",{method:"POST",headers:{Cookie:deviceCookie,"X-Portal-Request":"1"},body:form});
    expect(uploaded.status).toBe(201);attendanceMedicalId=(await uploaded.json()).id;
    expect((await pool.query("SELECT id FROM attendance_medical_attachments WHERE record_id=$1",[record.id])).rowCount).toBe(0);
    const accepted=await call(path,"POST",input,"",{"X-Fixture-Role":"hr"});
    expect(accepted.status).toBe(200);
    const {rows:[updated]}=await pool.query("SELECT override_excuse,is_manual_edit FROM attendance_records WHERE id=$1",[record.id]);
    expect(updated).toMatchObject({override_excuse:"medical_excuse",is_manual_edit:true});
    expect((await pool.query("SELECT id FROM attendance_audit_log WHERE record_id=$1 AND action='admin_override'",[record.id])).rowCount).toBe(1);
  });
  it("denies IT every new medical listing/download and legacy upload/download while HR can read the document",async()=>{
    const headers={"X-Fixture-Role":"it"};
    for(const path of [
      `/api/attendance/medical-documents?recordId=${attendanceRecordId}`,
      `/api/attendance/medical-documents?leaveId=${medicalLeaveId}`,
      `/api/attendance/medical-documents/${attendanceMedicalId}/download`,
      `/api/attendance/medical-attachments/${attendanceMedicalId}`,
    ])expect((await call(path,"GET",undefined,"",headers)).status).toBe(403);
    expect((await call(`/api/attendance/record/${attendanceRecordId}/medical-attachment`,"POST",{},"",headers)).status).toBe(403);
    expect((await call(`/api/attendance/record/${attendanceRecordId}/override`,"POST",{
      excuseType:"medical_excuse",note:"محاولة حساب تقني",
    },"",headers)).status).toBe(403);
    const list=await call(`/api/attendance/medical-documents?recordId=${attendanceRecordId}`,"GET",undefined,"",{"X-Fixture-Role":"hr"});
    expect(list.status).toBe(200);expect(list.data.some((d:any)=>d.id===attendanceMedicalId)).toBe(true);
    const download=await fetch(base+`/api/attendance/medical-documents/${attendanceMedicalId}/download`,{headers:{"X-Fixture-Role":"hr"}});
    expect(download.status).toBe(200);expect(download.headers.get("content-type")).toContain("application/pdf");
    expect(await download.text()).toContain("%PDF-");
  });
  it("returns clarification to HR with an immutable employee reply and rejects duplicate responses", async () => {
    const day = new Date(Date.now()+9*86400000).toISOString().slice(0,10);
    const {rows:[request]}=await pool.query(`INSERT INTO attendance_permissions(employee_id,date,type,start_time,end_time,reason,status)
      VALUES($1,$2,'permission','10:00','11:00','fixture','clarification_requested') RETURNING id`,[employeeId,day]);
    const path=`/requests/permission/${request.id}/clarification`;
    expect((await call(path,"POST",{note:"توضيح اختبار مستقل"})).status).toBe(200);
    expect((await call(path,"POST",{note:"تكرار غير مسموح"})).status).toBe(409);
    const summary=await call("/summary");
    expect(summary.data.requestHistory.some((r:any)=>r.requestId===request.id && r.decision==="clarification_response")).toBe(true);
  });
  it("keeps both permission dates and computes same-day, cross-day and midnight durations",async()=>{
    for(const [offset,returnOffset,startTime,endTime,hours] of [
      [20,20,"13:00","14:00",1],
      [21,22,"13:00","14:00",25],
      [22,23,"23:30","00:30",1],
    ] as const) {
      const day=(n:number)=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
      const input={type:"permission",date:day(offset),returnDate:day(returnOffset),period:"morning",purpose:"personal",
        acknowledged:true,startTime,endTime,reason:"اختبار مدة الاستئذان"};
      const created=await call("/permissions","POST",input);
      expect(created.status).toBe(201);
      const summary=await call("/summary");
      const saved=summary.data.permissions.find((p:any)=>p.id===created.data.id);
      expect(saved.returnDate).toBe(input.returnDate);
      expect(Number(saved.hoursRequested)).toBe(hours);
    }
    const day=(n:number)=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
    expect((await call("/permissions","POST",{
      type:"permission",date:day(25),returnDate:day(30),period:"morning",purpose:"personal",
      acknowledged:true,startTime:"13:00",endTime:"14:00",reason:"اختبار تجاوز سعة الساعات",
    })).status).toBe(400);
  });
  it("serializes competing annual approvals in PostgreSQL and never consumes more than the balance", async () => {
    const {rows:[actor]}=await pool.query(`INSERT INTO users(username,password,role,full_name_ar,full_name_en,active,archived)
      VALUES($1,'non-login-fixture','hr','اختبار آلي','Test only',true,false) RETURNING id`,[`ESS-TEST-${randomUUID()}`]);
    temporaryUsers.push(actor.id);
    await decideHrRequest("leave",medicalLeaveId,actor.id,"approve");
    expect((await call("/summary")).data.leaves.find((l:any)=>l.id===medicalLeaveId).status).toBe("approved");
    const year=new Date().getUTCFullYear();
    // Five years completes at year-end, not at these January/February starts.
    await pool.query("UPDATE employees SET contract_start=$2 WHERE id=$1",[employeeId,`${year-5}-12-31`]);
    const requests=[];
    for(const month of ["01","02"]) requests.push((await pool.query(`INSERT INTO leave_requests
      (employee_id,leave_type,start_date,end_date,days,reason,status)
      VALUES($1,'annual',$2,$3,12,'isolated concurrency fixture','manager_approved') RETURNING id`,
    [employeeId,`${year}-${month}-01`,`${year}-${month}-12`])).rows[0].id);
    const results=await Promise.allSettled(requests.map(id=>decideHrRequest("leave",id,actor.id,"approve")));
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    expect(results.filter(r=>r.status==="rejected")).toHaveLength(1);
    const approved=(await pool.query("SELECT id FROM leave_requests WHERE employee_id=$1 AND status='approved' AND leave_type='annual'",[employeeId])).rows[0].id;
    await expect(decideHrRequest("leave",approved,actor.id,"approve")).rejects.toMatchObject({status:409});
    const summary=await call("/summary");
    expect(summary.data.balance.used).toBe(12);
  });
  it("rejects duplicate HR phones and revokes the old session after an authorized phone change", async () => {
    await expect(pool.query("UPDATE employees SET phone=$1 WHERE id=$2", [registeredPhone, secondId]))
      .rejects.toMatchObject({ code: "23505" });
    await pool.query("UPDATE employees SET phone=NULL WHERE id=$1", [employeeId]);
    expect((await call("/me")).status).toBe(401);
    const { rows } = await pool.query("SELECT revoked_at FROM employee_portal_devices WHERE id=$1", [sessionId]);
    expect(rows[0].revoked_at).not.toBeNull();
    await pool.query("UPDATE employees SET phone=$1 WHERE id=$2", [registeredPhone, employeeId]);
  });
  it("uses 1111 only in opted-in development, without SMS, and rejects that session outside development", async () => {
    const env = { node: process.env.NODE_ENV, flag: process.env.EMPLOYEE_PORTAL_DEV_OTP, deployment: process.env.REPLIT_DEPLOYMENT };
    try {
      process.env.NODE_ENV = "development";
      process.env.EMPLOYEE_PORTAL_DEV_OTP = "true";
      delete process.env.REPLIT_DEPLOYMENT;
      await pool.query("DELETE FROM employee_portal_limits WHERE key=$1", [`otp-cooldown:${tokenHash(registeredPhone)}`]);
      expect((await call("/config", "GET", undefined, "")).data.developmentOtp).toBe(true);
      const sentBefore = sent.mock.calls.length;
      const challenge = await call("/otp/request", "POST", { phone: registeredPhone }, "");
      expect(challenge.status).toBe(200);
      expect(sent.mock.calls.length).toBe(sentBefore);
      const cookie = challenge.cookies[0].split(";")[0];
      expect((await call("/otp/verify", "POST", { challengeId: challenge.data.challengeId, code: "2222" }, cookie)).status).toBe(401);
      const verified = await call("/otp/verify", "POST", { challengeId: challenge.data.challengeId, code: "١١١١" }, cookie);
      expect(verified.status).toBe(200);
      const devCookie = verified.cookies.find(c => c.startsWith(DEVICE_COOKIE + "="))!.split(";")[0];
      expect((await call("/me", "GET", undefined, devCookie)).status).toBe(200);
      process.env.NODE_ENV = "production";
      expect((await call("/config", "GET", undefined, "")).data.developmentOtp).toBe(false);
      expect((await call("/otp/verify", "POST", { challengeId: challenge.data.challengeId, code: "1111" }, cookie)).status).toBe(400);
      expect((await call("/me", "GET", undefined, devCookie)).status).toBe(401);
    } finally {
      for (const [key, value] of [["NODE_ENV", env.node], ["EMPLOYEE_PORTAL_DEV_OTP", env.flag], ["REPLIT_DEPLOYMENT", env.deployment]] as const) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  });
});
