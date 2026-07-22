// حساب موحّد لحالة «متأخر» بين الواجهة والـ backend — توقيت السعودية UTC+3

export interface WorkScheduleLike {
  scopeType: string; // default | department | employee
  department?: string | null;
  employeeId?: number | null;
  workStartTime: string; // HH:mm
  graceMinutes: number;
}

// أولوية التخصيص: موظف > قسم > افتراضي
export function resolveWorkSchedule(
  settings: WorkScheduleLike[],
  employee: { id: number; department?: string | null },
): { workStartTime: string; graceMinutes: number } {
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

// عطلة نهاية الأسبوع السعودية: الجمعة والسبت (بتوقيت الرياض)
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
