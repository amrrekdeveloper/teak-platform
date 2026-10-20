import type { Employee, User } from "../shared/schema";
import { isRiyadhWeekend, RISK_POINTS, riskLevel } from "../shared/attendance";
import { employeeAttendanceReport } from "./attendance-support";
import { pool } from "./db";
import { storage } from "./storage";

/** Used by the monthly HTTP route; persisted totals contain verified evidence only. */
export async function employeeMonthlyAttendanceRisk(employee:Employee,period:string,to:string,now=new Date(),fallbackName?:string) {
  const report=await employeeAttendanceReport(employee.id,`${period}-01`,to,now);
  const leaves=(await storage.getLeaveRequests(employee.id)).filter(l=>l.status==="approved");
  const attempts=(await pool.query(`SELECT business_day,shift_key FROM attendance_violations
    WHERE employee_id=$1 AND violation_type='missing_checkin' AND business_day LIKE $2`,[employee.id,`${period}-%`])).rows;
  let late=0,absent=0,incomplete=0;
  const verified=new Set<string>(),unverified=new Set<string>();
  for(const row of report.rows) {
    if(row.day<employee.contractStart||isRiyadhWeekend(new Date(`${row.day}T12:00:00+03:00`))||
      leaves.some(l=>l.startDate<=row.day&&l.endDate>=row.day))continue;
    if(row.scheduleVerified!==true){unverified.add(row.day);continue;}
    verified.add(row.day);
    if(row.adminOverride)continue;
    const missing=attempts.some(v=>v.business_day===row.day&&v.shift_key===row.shiftId);
    if(row.late===true)late++;
    if(missing||row.status==="missing_checkin"||row.status==="missing_checkout")incomplete++;
    else if(row.status==="absent")absent++;
  }
  const score=late*RISK_POINTS.late+absent*RISK_POINTS.absent+incomplete*RISK_POINTS.incomplete;
  await pool.query(`INSERT INTO attendance_monthly_risk(employee_id,period,late,absent,incomplete,score)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(employee_id,period) DO UPDATE
    SET late=$3,absent=$4,incomplete=$5,score=$6,calculated_at=now()`,
  [employee.id,period,late,absent,incomplete,score]);
  return {employeeId:employee.id,employeeNumber:employee.employeeNumber,
    nameAr:employee.fullNameAr?.trim()||fallbackName||employee.phone||employee.employeeNumber,
    department:employee.department,late,absent,incomplete,score,level:riskLevel(score),
    verifiedDays:verified.size,unverifiedDays:unverified.size,assessmentAvailable:verified.size>0};
}
type Risk=Awaited<ReturnType<typeof employeeMonthlyAttendanceRisk>>;
export async function notifyMonthlyAttendanceRisk(results:Risk[],period:string,users:Pick<User,"id"|"role"|"active">[]) {
  const recipients=users.filter(u=>["owner","hr"].includes(u.role)&&u.active!==false);
  for(const r of results) {
    if(!r.assessmentAvailable||r.verifiedDays===0||r.level==="green")continue;
    if(!recipients.length)continue;
    try {
      if(!await storage.createRiskAlertIfNew(r.employeeId,period,r.level))continue;
      const level=r.level==="red"?"أحمر":"برتقالي";
      for(const u of recipients)await storage.createNotification({
        userId:u.id,titleAr:`مؤشر خطر ${level}: ${r.nameAr}`,titleEn:`Risk alert (${r.level}): ${r.nameAr}`,
        messageAr:`وصل الموظف ${r.nameAr} إلى مستوى ${level} (${r.score} نقطة) وفق الأيام الموثقة فقط — تأخير: ${r.late}، غياب: ${r.absent}، نقص حركة: ${r.incomplete}`,
        messageEn:`Employee ${r.nameAr}: ${r.level} risk (${r.score}), verified schedule days only`,
        type:"warning",relatedEntity:"employee",relatedId:r.employeeId,
      });
    }catch{console.error("Risk alert notification failed");}
  }
}
