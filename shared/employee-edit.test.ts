import { describe, expect, it } from "vitest";
import { changedEmployeeFields, attendanceAssignmentMatches } from "./employee-edit";
describe("Employee edit safety", () => {
  it("does not submit a stale assignment when only a profile field changed", () => {
    const initial = { position: "A", attendanceZoneId: "", attendanceScheduleId: "" };
    expect(changedEmployeeFields({ position: "B", attendanceZoneId: null, attendanceScheduleId: null },
      { ...initial, position: "B" }, initial)).toEqual({ position: "B" });
  });
  it("retains an intentional removal, and checks both original assignment values", () => {
    expect(changedEmployeeFields({ attendanceZoneId: null }, { attendanceZoneId: "" }, { attendanceZoneId: "5" }))
      .toEqual({ attendanceZoneId: null });
    const current = { attendanceZoneId: 5, attendanceScheduleId: null };
    expect(attendanceAssignmentMatches(undefined, current)).toBe(false);
    expect(attendanceAssignmentMatches({ attendanceZoneId: null, attendanceScheduleId: null }, current)).toBe(false);
    expect(attendanceAssignmentMatches(current, current)).toBe(true);
  });
});
