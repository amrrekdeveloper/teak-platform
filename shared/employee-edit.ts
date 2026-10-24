/** Send only intentionally edited fields; a stale profile must not reset assignments. */
export function changedEmployeeFields(
  payload: Record<string, unknown>,
  form: object,
  baseline: object,
) {
  const next = form as Record<string, unknown>;
  const initial = baseline as Record<string, unknown>;
  return Object.fromEntries(Object.entries(payload).filter(([key]) => next[key] !== initial[key]));
}

export function attendanceAssignmentMatches(
  expected: unknown,
  current: { attendanceZoneId: number | null; attendanceScheduleId: number | null },
) {
  if (!expected || typeof expected !== "object" || Array.isArray(expected)) return false;
  const value = expected as Record<string, unknown>;
  return Object.hasOwn(value, "attendanceZoneId") && Object.hasOwn(value, "attendanceScheduleId")
    && value.attendanceZoneId === current.attendanceZoneId
    && value.attendanceScheduleId === current.attendanceScheduleId;
}
