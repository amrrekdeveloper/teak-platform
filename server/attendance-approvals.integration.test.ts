/** Development-only fixture identities. Never edits an existing employee or production. */
import {beforeAll,afterAll,describe,it,expect,vi} from "vitest";
import {randomUUID} from "node:crypto";
import express from "express";
import {pool} from "./db";
import {employeeAttendanceReport} from "./attendance-support";
import {attendanceCorrectionReview,decideAttendanceCorrection,registerHrCorrections} from "./attendance-corrections";
import {riyadhDateKey} from "../shared/attendance";

const marker=`APPROVAL-TEST-${randomUUID()}`;
const day="2026-10-21";
let actor=0,employee=0;
const ids:number[]=[];
const shift={id:"single",label:"وردية اختبار",start:"00:00",end:"23:59",graceMinutes:0};
async function request(businessDay=day) {
  const {rows:[row]}=await pool.query(`INSERT INTO attendance_corrections(employee_id,business_day,shift_key,reason)
    VALUES($1,$2,'single',$3) RETURNING id`,[employee,businessDay,marker]);
  ids.push(row.id);
  return row.id as number;
}
beforeAll(async()=>{
  if(process.env.NODE_ENV==="production"||process.env.REPLIT_DEPLOYMENT==="1")throw new Error("Development only");
  actor=(await pool.query(`INSERT INTO users(username,password,role,full_name_ar,full_name_en,active,archived)
    VALUES($1,'non-login-fixture','hr',$1,$1,true,false) RETURNING id`,[marker])).rows[0].id;
  employee=(await pool.query(`INSERT INTO employees(employee_number,full_name_ar,nationality,position,department,
    monthly_salary,contract_start,status,attendance_enabled)
    VALUES($1,$1,'saudi','اختبار','hr',1,'2025-01-01','active',true) RETURNING id`,[marker])).rows[0].id;
  for(const date of [day,"2026-10-22",riyadhDateKey(new Date())])
    await pool.query(`INSERT INTO attendance_day_schedules(employee_id,business_day,shifts) VALUES($1,$2,$3::jsonb)`,
      [employee,date,JSON.stringify([date===riyadhDateKey(new Date())?shift:{...shift,start:"08:00",end:"16:00"}])]);
  await pool.query(`INSERT INTO attendance_day_calendars(employee_id,business_day,working_day,source)
    VALUES($1,'2026-10-22',true,'review')`,[employee]);
  await pool.query(`INSERT INTO attendance_records(employee_id,type,check_time,shift_key) VALUES
    ($1,'check_in','2026-10-21 05:40:00','single'),($1,'check_out','2026-10-21 13:00:00','single'),
    ($1,'check_in','2026-10-22 05:40:00','single'),($1,'check_out','2026-10-22 13:00:00','single')`,[employee]);
});
afterAll(async()=>{
  if(employee){
    await pool.query("DELETE FROM attendance_correction_history WHERE correction_id=ANY($1::int[])",[ids]);
    await pool.query("DELETE FROM attendance_corrections WHERE employee_id=$1",[employee]);
    for(const table of ["attendance_day_calendars","attendance_calendar_reviews","attendance_day_schedules","attendance_records"])
      await pool.query(`DELETE FROM ${table} WHERE employee_id=$1`,[employee]);
    await pool.query("DELETE FROM employees WHERE id=$1",[employee]);
  }
  if(actor)await pool.query("DELETE FROM users WHERE id=$1",[actor]);
});
describe("attendance approvals use period closure, not missing weekday approval",()=>{
  it("approves a closed historical request lacking weekday evidence without changing punches or inventing metrics",async()=>{
    const id=await request();
    const before=(await pool.query("SELECT id,type,check_time FROM attendance_records WHERE employee_id=$1 ORDER BY id",[employee])).rows;
    const review=await attendanceCorrectionReview({employeeId:employee,businessDay:day,shiftKey:"single",status:"pending"});
    expect(review).toMatchObject({canApprove:true,periodEnded:true,scheduleVerified:false});
    await expect(decideAttendanceCorrection(id,actor,"approved","قبول عذر تاريخي موثق بالمراجعة")).resolves.toEqual({success:true});
    const after=(await pool.query("SELECT id,type,check_time FROM attendance_records WHERE employee_id=$1 ORDER BY id",[employee])).rows;
    expect(after).toEqual(before);
    const result=await employeeAttendanceReport(employee,day,day);
    expect(result.rows[0]).toMatchObject({status:"unverified_schedule",scheduleVerified:false,
      lateMinutes:null,correctionStatus:"approved",excused:false,explanationAccepted:true});
    expect((await pool.query("SELECT actor_id,decision,note FROM attendance_correction_history WHERE correction_id=$1",[id])).rows[0])
      .toMatchObject({actor_id:actor,decision:"approved",note:"قبول عذر تاريخي موثق بالمراجعة"});
    await expect(decideAttendanceCorrection(id,actor,"rejected","محاولة قرار ثان")).rejects.toMatchObject({status:409});
  });
  it("never forgives an unfinished shift, but allows rejection with a retained reason",async()=>{
    const today=riyadhDateKey(new Date());
    const id=await request(today);
    expect(await attendanceCorrectionReview({employeeId:employee,businessDay:today,shiftKey:"single",status:"pending"}))
      .toMatchObject({canApprove:false,waitingForPeriodEnd:true});
    await expect(decideAttendanceCorrection(id,actor,"approved","اعتماد قبل اكتمال الوردية")).rejects.toMatchObject({status:409});
    await expect(decideAttendanceCorrection(id,actor,"rejected","سبب رفض واضح")).resolves.toEqual({success:true});
    expect((await pool.query("SELECT status,review_note,reviewed_by FROM attendance_corrections WHERE id=$1",[id])).rows[0])
      .toMatchObject({status:"rejected",review_note:"سبب رفض واضح",reviewed_by:actor});
  });
  it("retains the exact documented lateness after HR rejects the explanation",async()=>{
    const date="2026-10-22";
    const before=(await employeeAttendanceReport(employee,date,date)).rows[0];
    expect(before).toMatchObject({scheduleVerified:true,lateMinutes:40,late:true});
    const id=await request(date);
    await decideAttendanceCorrection(id,actor,"rejected","العذر غير مقبول بعد المراجعة");
    const after=(await employeeAttendanceReport(employee,date,date)).rows[0];
    expect(after).toMatchObject({status:before.status,lateMinutes:40,late:true,
      checkIn:before.checkIn,checkOut:before.checkOut,correctionStatus:"rejected",excused:false});
  });
  it("serves paginated filtered queues and review details through authenticated HR routes",async()=>{
    const app=express();app.use(express.json());
    registerHrCorrections(app,(req,_res,next)=>{(req as any).session={userId:actor};(req as any).user={role:"hr"};next();});
    // The medical-document guard consumes the actual HR session and stored user.
    const server=app.listen(0);
    try{
      const address=server.address() as {port:number};
      const base=`http://127.0.0.1:${address.port}`;
      const response=await fetch(`${base}/api/attendance/approvals?status=all&search=${encodeURIComponent(marker)}&pageSize=1`);
      expect(response.status).toBe(200);
      const data=await response.json();
      expect(data).toMatchObject({total:3,page:1,pageSize:1,counts:{pending:0,approved:1,rejected:2}});
      expect(data.items).toHaveLength(1);
      const detail=await fetch(`${base}/api/attendance/corrections/${ids[0]}/review`);
      expect(detail.status).toBe(200);
      expect((await detail.json()).review.scheduleVerified).toBe(false);
    }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
  });
  it("keeps a late shift pending before its actual end and allows review after midnight",async()=>{
    const today=riyadhDateKey(new Date());
    const yesterday=riyadhDateKey(new Date(Date.parse(`${today}T00:00:00+03:00`)-86400000));
    await pool.query(`INSERT INTO attendance_day_schedules(employee_id,business_day,shifts)
      VALUES($1,$2,$3::jsonb) ON CONFLICT(employee_id,business_day) DO UPDATE SET shifts=EXCLUDED.shifts`,
      [employee,yesterday,JSON.stringify([{...shift,start:"23:00",end:"23:59"}])]);
    await pool.query(`INSERT INTO attendance_day_calendars(employee_id,business_day,working_day,source)
      VALUES($1,$2,true,'review') ON CONFLICT(employee_id,business_day) DO UPDATE SET working_day=true,source='review'`,
      [employee,yesterday]);
    const id=await request(yesterday);
    vi.useFakeTimers({toFake:["Date"]});
    vi.setSystemTime(new Date(`${yesterday}T23:30:00+03:00`));
    try{
      const review=await attendanceCorrectionReview({employeeId:employee,businessDay:yesterday,shiftKey:"single",status:"pending"});
      expect(review).toMatchObject({canApprove:false,periodEnded:false,waitingForPeriodEnd:true});
      await expect(decideAttendanceCorrection(id,actor,"approved","محاولة اعتماد وردية لم تنته"))
        .rejects.toMatchObject({status:409});
      vi.setSystemTime(new Date(`${today}T00:01:00+03:00`));
      expect(await attendanceCorrectionReview({employeeId:employee,businessDay:yesterday,shiftKey:"single",status:"pending"}))
        .toMatchObject({canApprove:true,periodEnded:true,waitingForPeriodEnd:false});
    }finally{vi.useRealTimers();}
  });
});
