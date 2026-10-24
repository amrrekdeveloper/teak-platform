// حساب موحّد لحالة «متأخر» بين الواجهة والـ backend — توقيت السعودية UTC+3

export interface WorkScheduleLike {
  id?: number;
  locationZoneId?: number | null;
  labelAr?: string | null;
  scopeType: string; // default | department | employee
  department?: string | null;
  employeeId?: number | null;
  workStartTime: string; // HH:mm
  graceMinutes: number;
  workEndTime?: string | null;
  shifts?: AttendanceShift[] | null;
}

export interface AttendanceShift { id: string; label: string; start: string; end: string; graceMinutes: number }

export interface AttendanceEmployeeAssignment {
  id: number; department?: string | null; attendanceZoneId?: number | null; attendanceScheduleId?: number | null;
}
export function resolveAttendanceShifts(settings: WorkScheduleLike[], employee: AttendanceEmployeeAssignment): AttendanceShift[] {
  const selected = (employee.attendanceScheduleId
    ? settings.find(s => s.id === employee.attendanceScheduleId && s.locationZoneId === employee.attendanceZoneId)
    : undefined)
    || settings.find(s => s.scopeType === "employee" && s.employeeId === employee.id)
    || settings.find(s => s.scopeType === "department" && !!employee.department && s.department === employee.department)
    || settings.find(s => s.scopeType === "default");
  if (selected?.shifts?.length) return selected.shifts;
  // No invented closing time: HR must explicitly configure it before reconciliation.
  return [{ id: "single", label: "الدوام", start: selected?.workStartTime || "08:00", end: selected?.workEndTime || "", graceMinutes: selected?.graceMinutes ?? 15 }];
}

export function riyadhDayBounds(day: string) {
  const start = new Date(`${day}T00:00:00+03:00`);
  return { from: start.toISOString(), to: new Date(start.getTime() + 86400000 - 1).toISOString() };
}

export function shiftEnded(day: string, shift: AttendanceShift, now = new Date()): boolean {
  return !!shift.end && shift.end > shift.start && now.getTime() > new Date(`${day}T${shift.end}:00+03:00`).getTime();
}

export function validateShifts(shifts: AttendanceShift[]): boolean {
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  return shifts.length >= 1 && shifts.length <= 2 && new Set(shifts.map(s => s.id)).size === shifts.length &&
    shifts.every((s, i) => /^[a-z0-9_-]{1,30}$/.test(s.id) && typeof s.label === "string" && s.label.length > 0 &&
      s.label.length <= 80 && time.test(s.start) && time.test(s.end) && s.end > s.start &&
      Number.isInteger(s.graceMinutes) && s.graceMinutes >= 0 && s.graceMinutes <= 240 &&
      (!i || shifts[i - 1].end < s.start));
}

export function shiftAttendanceStatus(
  day: string, shift: AttendanceShift,
  events: { type: string; checkTime: string | Date; isManualEdit?: boolean }[], now = new Date(),
) {
  const ordered = [...events].sort((a, b) => +new Date(a.checkTime) - +new Date(b.checkTime));
  const checkIn = ordered.find(r => r.type === "check_in");
  const checkOut = ordered.find(r => r.type === "check_out" && (!checkIn || +new Date(r.checkTime) > +new Date(checkIn.checkTime)));
  const ended = shiftEnded(day, shift, now);
  const lateMinutes = checkIn ? Math.max(0, Math.floor((+new Date(checkIn.checkTime) - +new Date(`${day}T${shift.start}:00+03:00`)) / 60000)) : 0;
  const late = !!checkIn && isLateCheckIn(new Date(checkIn.checkTime), { workStartTime: shift.start, graceMinutes: shift.graceMinutes });
  const status = !checkIn ? (checkOut ? "missing_checkin" : ended ? "absent" : "pending")
    : !checkOut && ended ? "missing_checkout" : late ? "late" : "present";
  return { status, checkIn: checkIn?.checkTime ?? null, checkOut: checkOut?.checkTime ?? null, late, lateMinutes,
    earlyDepartureMinutes: checkOut && shift.end ? Math.max(0, Math.floor((+new Date(`${day}T${shift.end}:00+03:00`) - +new Date(checkOut.checkTime)) / 60000)) : 0,
    adminOverride: events.some(r => r.isManualEdit), ended };
}

// أولوية التخصيص: موظف > قسم > افتراضي
export function resolveWorkSchedule(
  settings: WorkScheduleLike[],
  employee: AttendanceEmployeeAssignment,
): { workStartTime: string; graceMinutes: number } {
  const assigned = employee.attendanceScheduleId && settings.find(s => s.id === employee.attendanceScheduleId && s.locationZoneId === employee.attendanceZoneId);
  if (assigned) return { workStartTime: assigned.shifts?.[0]?.start || assigned.workStartTime, graceMinutes: assigned.shifts?.[0]?.graceMinutes ?? assigned.graceMinutes };
  const byEmployee = settings.find(s => s.scopeType === "employee" && s.employeeId === employee.id);
  if (byEmployee) return { workStartTime: byEmployee.workStartTime, graceMinutes: byEmployee.graceMinutes };
  if (employee.department) {
    const byDept = settings.find(s => s.scopeType === "department" && s.department === employee.department);
    if (byDept) return { workStartTime: byDept.workStartTime, graceMinutes: byDept.graceMinutes };
  }
  const def = settings.find(s => s.scopeType === "default");
  return {
    workStartTime: def?.workStartTime || "08:00",
    graceMinutes: def?.graceMinutes ?? 15,
  };
}

// دقائق اليوم بتوقيت السعودية (UTC+3 ثابت بلا توقيت صيفي)
export function riyadhMinutesOfDay(date: Date): number {
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  return (utcMinutes + 3 * 60) % (24 * 60);
}

// مؤشر الخطر: تأخيرة=1، غياب=2، نقص حركة=1
export const RISK_POINTS = { late: 1, absent: 2, incomplete: 1 } as const;

export function riskLevel(score: number): "green" | "orange" | "red" {
  if (score >= 6) return "red";
  if (score >= 3) return "orange";
  return "green";
}

// تاريخ اليوم بتوقيت الرياض YYYY-MM-DD
export function riyadhDateKey(date: Date): string {
  const shifted = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  return shifted.toISOString().split("T")[0];
}

// Legacy compatibility only. Operational attendance uses effective-dated workweek policies.
export function isRiyadhWeekend(date: Date): boolean {
  const shifted = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  const dow = shifted.getUTCDay(); // 5 = الجمعة، 6 = السبت
  return dow === 5 || dow === 6;
}

export function isLateCheckIn(
  checkTime: Date,
  schedule: { workStartTime: string; graceMinutes: number },
): boolean {
  const [h, m] = schedule.workStartTime.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return false;
  const threshold = h * 60 + m + (schedule.graceMinutes || 0);
  return riyadhMinutesOfDay(checkTime) > threshold;
}
