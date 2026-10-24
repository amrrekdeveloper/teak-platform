/** API evidence, not a calculation against the viewer's current settings. */
export interface AttendanceReportRow {
  day:string;shiftId:string;shiftLabel:string;status:string;
  checkIn:string|Date|null;checkOut:string|Date|null;
  scheduleVerified:boolean;late:boolean|null;lateMinutes:number|null;earlyDepartureMinutes:number|null;
  adminOverride:boolean;outOfZone:boolean;recordId?:number|null;recordIds?:number[];
  workingDay?:boolean|null;calendarVerified?:boolean;calendarSource?:string;
}
export const attendanceStatusLabels:Record<string,string>={
  present:"حاضر",late:"متأخر",absent:"غائب",pending:"لم تنته الوردية",
  missing_checkin:"نقص دخول",missing_checkout:"نقص خروج",rest_day:"راحة أسبوعية",
  approved_leave:"إجازة معتمدة",not_started:"قبل المباشرة",out_of_zone:"خارج النطاق",
  admin_override:"مصحح إدارياً",unverified_schedule:"جدول تاريخي غير موثق",
  excused:"تمت معالجة التقصير",
};
export function attendanceMinutes(row:Pick<AttendanceReportRow,"scheduleVerified"|"lateMinutes"|"earlyDepartureMinutes">,
  key:"lateMinutes"|"earlyDepartureMinutes"):number|string {
  const value=row[key];
  return row.scheduleVerified===true && typeof value==="number" && Number.isFinite(value) ? value : "غير متاح";
}
export const attendanceTime=(value:string|Date|null)=>value
  ? new Date(value).toLocaleTimeString("ar-SA",{timeZone:"Asia/Riyadh",hour:"2-digit",minute:"2-digit"}) : "—";
/** Shared by individual/collective screens, PDF and Excel. Unknown is not zero. */
export function attendanceReportCells(row:AttendanceReportRow):(string|number)[] {
  return [row.day,row.shiftLabel,attendanceTime(row.checkIn),attendanceTime(row.checkOut),
    attendanceStatusLabels[row.status]||row.status,attendanceMinutes(row,"lateMinutes"),
    attendanceMinutes(row,"earlyDepartureMinutes"),row.adminOverride?"نعم":"—"];
}
