import { describe, it, expect } from "vitest";
import { selectPunchShift } from "./attendance-shift-selection";
const shifts = [
  { id: "morning", label: "الأولى", start: "09:00", end: "12:00", graceMinutes: 5 },
  { id: "evening", label: "الثانية", start: "16:00", end: "22:00", graceMinutes: 5 },
];
describe("punch period selection", () => {
  it("allows early morning arrival, but not unlimited backdating", () => {
    expect(selectPunchShift(shifts, 8 * 60 + 40, "check_in")?.id).toBe("morning");
    expect(selectPunchShift(shifts, 7 * 60 + 59, "check_in")).toBeUndefined();
  });
  it("selects evening independently from completed morning", () => {
    expect(selectPunchShift(shifts, 15 * 60 + 30, "check_in")?.id).toBe("evening");
    expect(selectPunchShift(shifts, 16 * 60 + 15, "check_in")?.id).toBe("evening");
    expect(selectPunchShift(shifts, 16 * 60 + 15, "check_in", "morning")).toBeUndefined();
  });
  it("allows real departure after scheduled end and blocks gap checkin", () => {
    expect(selectPunchShift(shifts, 12 * 60 + 20, "check_out")?.id).toBe("morning");
    expect(selectPunchShift(shifts, 22 * 60 + 1, "check_out")?.id).toBe("evening");
    expect(selectPunchShift(shifts, 14 * 60, "check_in")).toBeUndefined();
  });
});
