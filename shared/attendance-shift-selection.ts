import type { AttendanceShift } from "./attendance";

/** Early arrival is allowed for one hour; it is not a late-arrival grace period. */
export const EARLY_CHECKIN_MINUTES = 60;
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export function selectPunchShift(
  shifts: AttendanceShift[], minute: number, type: "check_in" | "check_out", requestedId?: string,
) {
  const ordered = [...shifts].sort((a, b) => a.start.localeCompare(b.start));
  const eligible = ordered.filter((shift, index) => {
    const from = minutes(shift.start) - EARLY_CHECKIN_MINUTES;
    // Departure remains available after the end, until the following period opens.
    const until = type === "check_out"
      ? (ordered[index + 1] ? minutes(ordered[index + 1].start) - EARLY_CHECKIN_MINUTES : 1440)
      : (shift.end ? minutes(shift.end) : 1440);
    return minute >= from && minute < until;
  });
  return requestedId ? eligible.find(s => s.id === requestedId) : eligible[eligible.length - 1];
}
