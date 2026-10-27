import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, it, expect } from "vitest";
import { pool } from "./db";
import { saveAttendanceSchedule } from "./attendance-settings-edit";
import { employeeAttendanceReport } from "./attendance-support";
import { riyadhDateKey } from "../shared/attendance";
let employee=0, actor=0, setting=0;
const day=riyadhDateKey(new Date());
const first={id:"first",label:"الأولى",start:"09:00",end:"12:00",graceMinutes:5};
const second={id:"second",label:"الثانية",start:"16:00",end:"22:00",graceMinutes:5};
beforeAll(async()=>{
  if(process.env.NODE_ENV==="production"||process.env.REPLIT_DEPLOYMENT==="1")throw new Error("Development only");
  const marker=`SCHEDULE-TEST-${randomUUID()}`;
  actor=(await pool.query(`INSERT INTO users(username,password,role,full_name_ar,full_name_en,active,archived)
    VALUES($1,'not-a-login','hr',$1,$1,true,false) RETURNING id`,[marker])).rows[0].id;
  employee=(await pool.query(`INSERT INTO employees(employee_number,full_name_ar,nationality,position,department,monthly_salary,contract_start,status)
    VALUES($1,$1,'saudi','اختبار','hr',1,'2025-01-01','active') RETURNING id`,[marker])).rows[0].id;
  setting=(await pool.query(`INSERT INTO work_schedule_settings(scope_type,employee_id,work_start_time,work_end_time,grace_minutes,shifts)
    VALUES('employee',$1,'09:00','12:00',5,$2) RETURNING id`,[employee,JSON.stringify([first])])).rows[0].id;
  for(const d of [day,"2026-10-25"])await pool.query(`INSERT INTO attendance_day_schedules(employee_id,business_day,shifts)
    VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[employee,d,JSON.stringify([first])]);
  await pool.query(`INSERT INTO attendance_records(employee_id,type,check_time,shift_key)
    VALUES($1,'check_in',($2||'T09:00:00+03:00')::timestamptz AT TIME ZONE 'UTC','first')`,[employee,day]);
});
afterAll(async()=>{
  for(const table of ["attendance_audit_log","attendance_records","attendance_day_calendars","attendance_day_schedules","hr_audit_log"])
    await pool.query(`DELETE FROM ${table} WHERE employee_id=$1`,[employee]);
  await pool.query("DELETE FROM hr_audit_log WHERE performed_by=$1",[actor]);
  await pool.query("DELETE FROM work_schedule_settings WHERE id=$1",[setting]);
  await pool.query("DELETE FROM employees WHERE id=$1",[employee]);
  await pool.query("DELETE FROM notifications WHERE user_id=$1",[actor]);
  await pool.query("DELETE FROM users WHERE id=$1",[actor]);
});
it("adds an unused second period immediately without rewriting punched morning or prior days",async()=>{
  await saveAttendanceSchedule(setting,{shifts:[{...first,start:"08:30"},second]},actor);
  const saved=(await pool.query("SELECT business_day,shifts FROM attendance_day_schedules WHERE employee_id=$1",[employee])).rows;
  expect(saved.find(r=>r.business_day===day).shifts).toEqual([first,second]);
  expect(saved.find(r=>r.business_day==="2026-10-25").shifts).toEqual([first]);
  expect((await pool.query("SELECT count(*)::int AS count FROM attendance_records WHERE employee_id=$1",[employee])).rows[0].count).toBe(1);
  const report=await employeeAttendanceReport(employee,day,day);
  expect(report.rows.find(r=>r.shiftId==="first")).toMatchObject({operationalStatus:"working"});
  expect(report.rows.find(r=>r.shiftId==="second")).toBeTruthy();
});
