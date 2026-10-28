/** Real PostgreSQL, synthetic identities only. No SMS, no production mutations. */
import {beforeAll,afterAll,describe,it,expect} from "vitest";
import {randomUUID} from "node:crypto";
import {pool} from "./db";
import {buildWeekPreview,applyWeekChange,parseWeekInput,calendarForDay} from "./attendance-workweek";
import {employeeAttendanceReport} from "./attendance-support";
import {employeeMonthlyAttendanceRisk} from "./attendance-risk";
import {storage} from "./storage";
import {riyadhDateKey} from "../shared/attendance";
import {TEAK_WORKING_DAYS} from "../shared/attendance-workweek";
import express from "express";
import {registerWorkweek} from "./attendance-workweek";

let actor=0,employee=0,incomplete=0;
const day="2026-10-17"; // Saturday, deliberately retained frozen history.
const shift={id:"single",label:"اختبار",start:"08:00",end:"16:00",graceMinutes:0};
beforeAll(async()=>{
  if(process.env.NODE_ENV==="production"||process.env.REPLIT_DEPLOYMENT==="1")throw new Error("Development only");
  actor=(await pool.query(`INSERT INTO users(username,password,role,full_name_ar,full_name_en,active,archived)
    VALUES($1,'non-login-fixture','hr','تقويم اختباري','Calendar fixture',true,false) RETURNING id`,[`WK-TEST-${randomUUID()}`])).rows[0].id;
  for(let n=0;n<2;n++){
    const id=(await pool.query(`INSERT INTO employees(employee_number,full_name_ar,nationality,position,department,monthly_salary,contract_start,status,attendance_enabled)
      VALUES($1,'موظف تقويم اختباري','saudi','اختبار','hr',1,'2025-01-01','active',true) RETURNING id`,[`WK-TEST-${randomUUID()}`])).rows[0].id;
    if(n===0)employee=id;else incomplete=id;
    await pool.query(`INSERT INTO attendance_day_schedules(employee_id,business_day,shifts) VALUES($1,$2,$3::jsonb)`,
      [id,day,JSON.stringify([{...shift,end:n===0?shift.end:""}])]);
  }
  await pool.query(`INSERT INTO attendance_records(employee_id,type,check_time,shift_key) VALUES
    ($1,'check_in','2026-10-17 05:40:00','single'),($1,'check_out','2026-10-17 13:00:00','single')`,[employee]);
});
afterAll(async()=>{
  for(const id of [employee,incomplete].filter(Boolean)){
    for(const table of ["attendance_calendar_reviews","attendance_day_calendars","attendance_week_policies",
      "attendance_day_schedules","attendance_records","attendance_monthly_risk"])
      await pool.query(`DELETE FROM ${table} WHERE employee_id=$1`,[id]);
    await pool.query("DELETE FROM employees WHERE id=$1",[id]);
  }
  await pool.query("DELETE FROM hr_audit_log WHERE performed_by=$1",[actor]);
  await pool.query("DELETE FROM notifications WHERE user_id=$1",[actor]);
  await pool.query("DELETE FROM users WHERE id=$1",[actor]);
});
function policy(ids=[employee]){return parseWeekInput({mode:"policy",scope:"employees",employeeIds:ids,
  effectiveFrom:riyadhDateKey(new Date(Date.now()+86400000)),workingDays:TEAK_WORKING_DAYS,reason:"اعتماد أسبوع اختبار"});}
function review(id:number,workingDay=true){return parseWeekInput({mode:"review",scope:"employees",employeeIds:[id],
  businessDay:day,workingDays:workingDay?[6]:[],reason:"مراجعة يوم اختباري"});}
describe("audited workweek PostgreSQL integration",()=>{
  it("reads today's report and risk without freezing schedules or calendars or replacing saved risk",async()=>{
    const today=riyadhDateKey(new Date());
    const policyId=(await pool.query(`INSERT INTO attendance_week_policies
      (employee_id,working_days,effective_from,reason,created_by)
      VALUES($1,'[0,1,2,3,4,5,6]',$2,'Synthetic read-only check',$3) RETURNING id`,
      [employee,today,actor])).rows[0].id;
    try {
      for(let read=0;read<2;read++){
        await employeeAttendanceReport(employee,today,today);
        await employeeMonthlyAttendanceRisk((await storage.getEmployee(employee))!,today.slice(0,7),today);
      }
      for(const table of ["attendance_day_schedules","attendance_day_calendars"])
        expect((await pool.query(`SELECT 1 FROM ${table} WHERE employee_id=$1 AND business_day=$2`,[employee,today])).rows).toHaveLength(0);
      expect((await pool.query("SELECT 1 FROM attendance_monthly_risk WHERE employee_id=$1",[employee])).rows).toHaveLength(0);
    } finally {
      await pool.query("DELETE FROM attendance_week_policies WHERE id=$1",[policyId]);
    }
  });
  it("requires explicit valid scope/date/days without accepting accidental backdating or broad reviews",()=>{
    expect(()=>parseWeekInput({...policy(),effectiveFrom:riyadhDateKey(new Date())})).toThrow();
    expect(()=>parseWeekInput({...policy(),workingDays:[]})).toThrow();
    expect(()=>parseWeekInput({...policy(),workingDays:[6,6]})).toThrow();
    expect(()=>parseWeekInput({...policy(),employeeIds:[employee,employee]})).toThrow();
    expect(()=>parseWeekInput({...review(employee),scope:"all",employeeIds:[]})).toThrow();
    expect(()=>parseWeekInput({...review(employee),businessDay:"2035-01-01"})).toThrow();
    expect(()=>parseWeekInput({...policy(),effectiveFrom:"2026-02-30"})).toThrow();
    expect(review(employee,false).workingDays).toEqual([]);
  });
  it("retains the legacy Saturday display but never scores an unapproved calendar as lateness",async()=>{
    const report=await employeeAttendanceReport(employee,day,day);
    expect(report.rows[0]).toMatchObject({calendarVerified:false,scheduleVerified:false,lateMinutes:null});
    expect(report.rows[0].checkIn).toBeTruthy();
    const risk=await employeeMonthlyAttendanceRisk((await storage.getEmployee(employee))!,"2026-10",day);
    expect(risk.late).toBe(0);
    expect(risk.absent).toBe(0);
    expect(risk.verifiedDays).toBe(0);
  });
  it("previews without writing evidence, rejects stale data and audits explicit Saturday work approval without changing punches",async()=>{
    const input=review(employee);
    const snapshot=(await pool.query("SELECT * FROM attendance_records WHERE employee_id=$1 ORDER BY id",[employee])).rows;
    const preview=await buildWeekPreview(input);
    expect(preview.rows[0].after.statuses).toContain("late");
    expect((await pool.query("SELECT * FROM attendance_day_calendars WHERE employee_id=$1",[employee])).rows).toHaveLength(0);
    await pool.query("UPDATE attendance_records SET notes='Fixture evidence changed' WHERE employee_id=$1",[employee]);
    // notes are part of original evidence even though they do not change the computed time.
    await pool.query("UPDATE attendance_records SET check_time=check_time+interval '1 minute' WHERE employee_id=$1 AND type='check_in'",[employee]);
    await expect(applyWeekChange(input,preview.previewToken,actor)).rejects.toMatchObject({status:409});
    await pool.query("UPDATE attendance_records SET check_time=$2,notes=$3 WHERE id=$1",
      [snapshot[0].id,snapshot[0].check_time,snapshot[0].notes]);
    await pool.query("UPDATE attendance_records SET notes=$2 WHERE id=$1",[snapshot[1].id,snapshot[1].notes]);
    const fresh=await buildWeekPreview(input);
    await applyWeekChange(input,fresh.previewToken,actor);
    expect((await pool.query("SELECT * FROM attendance_records WHERE employee_id=$1 ORDER BY id",[employee])).rows).toEqual(snapshot);
    const report=await employeeAttendanceReport(employee,day,day);
    expect(report.rows[0]).toMatchObject({workingDay:true,calendarSource:"review",calendarVerified:true,scheduleVerified:true,status:"late",lateMinutes:40});
    const audit=(await pool.query("SELECT * FROM attendance_calendar_reviews WHERE employee_id=$1",[employee])).rows[0];
    expect(audit.created_by).toBe(actor);expect(audit.old_value.evidence.records).toHaveLength(2);
    expect(audit.new_value.statuses).toContain("late");
  });
  it("does not fabricate absence or risk from an incomplete saved shift, even after approving a working day",async()=>{
    const input=review(incomplete),preview=await buildWeekPreview(input);
    expect(preview.rows[0].after.statuses).toEqual(["unverified_schedule"]);
    await applyWeekChange(input,preview.previewToken,actor);
    const report=await employeeAttendanceReport(incomplete,day,day);
    expect(report.rows[0]).toMatchObject({workingDay:true,scheduleVerified:false,status:"unverified_schedule",lateMinutes:null});
    expect((await pool.query("SELECT * FROM attendance_violations WHERE employee_id=$1",[incomplete])).rows).toHaveLength(0);
  });
  it("saves only future policy, rejects duplicate submission and retains reviewed calendar/saved times",async()=>{
    const input=policy(),preview=await buildWeekPreview(input);
    expect(await applyWeekChange(input,preview.previewToken,actor)).toMatchObject({success:true,count:1});
    await expect(applyWeekChange(input,preview.previewToken,actor)).rejects.toMatchObject({status:409});
    expect(await calendarForDay(employee,day)).toMatchObject({workingDay:true,source:"review"});
    expect((await pool.query("SELECT shifts FROM attendance_day_schedules WHERE employee_id=$1 AND business_day=$2",[employee,day])).rows[0].shifts).toEqual([shift]);
  });
  it("an explicit rest-day correction preserves the prior approval and reduces deficiency metrics to zero",async()=>{
    const input=review(employee,false),preview=await buildWeekPreview(input);
    expect(preview.rows[0].before.workingDay).toBe(true);
    await applyWeekChange(input,preview.previewToken,actor);
    const report=await employeeAttendanceReport(employee,day,day);
    expect(report.rows[0]).toMatchObject({workingDay:false,status:"present",late:false,lateMinutes:0,earlyDepartureMinutes:0});
    expect((await pool.query("SELECT * FROM attendance_calendar_reviews WHERE employee_id=$1",[employee])).rows).toHaveLength(2);
  });
  it("attributes HTTP approvals to the session identity, without a nonexistent req.user property",async()=>{
    const app=express();app.use(express.json());
    registerWorkweek(app,(req,_res,next)=>{req.session={userId:actor} as any;next();});
    const server=app.listen(0,"127.0.0.1");
    await new Promise<void>(resolve=>server.once("listening",resolve));
    try{
      const origin=`http://127.0.0.1:${(server.address() as any).port}`;
      const body={...policy([incomplete]),workingDays:[0,1,2,3,4]};
      const preview=await (await fetch(`${origin}/api/attendance/workweek/preview`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})).json();
      const saved=await fetch(`${origin}/api/attendance/workweek/apply`,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({...body,previewToken:preview.previewToken,confirm:true})});
      expect(saved.status).toBe(200);
      expect((await pool.query("SELECT created_by FROM attendance_week_policies WHERE employee_id=$1",[incomplete])).rows[0].created_by).toBe(actor);
    }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
  });
});
