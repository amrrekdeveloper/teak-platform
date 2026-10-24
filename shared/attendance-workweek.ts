/** Weekday policy is independent from workplace/shift selection. Sunday=0. */
export const TEAK_WORKING_DAYS = [0, 1, 2, 3, 4, 6];
export interface WeekPolicy {
  id: number; employeeId: number | null; workingDays: number[] | null;
  effectiveFrom: string; reason?: string; createdAt?: string | Date;
}
export interface WeekResolution {
  workingDays: number[] | null; source: "employee" | "default" | "legacy";
  policyId: number | null; effectiveFrom: string | null;
}
export function resolveWeekPolicy(policies: WeekPolicy[], employeeId: number, day: string): WeekResolution {
  const applicable = policies.filter(p => p.effectiveFrom <= day)
    .sort((a,b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.id-a.id);
  const own = applicable.find(p => p.employeeId === employeeId);
  const selected = own?.workingDays ? own : applicable.find(p => p.employeeId === null);
  return selected ? { workingDays: selected.workingDays, source: selected === own ? "employee" : "default",
    policyId: selected.id, effectiveFrom: selected.effectiveFrom }
    : { workingDays: null, source: "legacy", policyId: null, effectiveFrom: null };
}
export function weekdayOf(day: string) { return new Date(`${day}T12:00:00+03:00`).getUTCDay(); }
export function workdayFor(policy: WeekResolution, day: string): boolean | null {
  return policy.workingDays ? policy.workingDays.includes(weekdayOf(day)) : null;
}
/** Legacy fallback is display-only, never evidence for sanctions or scores. */
export function legacyRestDay(day: string) { return [5,6].includes(weekdayOf(day)); }
export function completeShiftEvidence(shifts: {start:string;end:string}[]) {
  return shifts.length > 0 && shifts.every(s => /^([01]\d|2[0-3]):[0-5]\d$/.test(s.start)
    && /^([01]\d|2[0-3]):[0-5]\d$/.test(s.end) && s.end > s.start);
}
