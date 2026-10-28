import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Employee } from "../shared/schema";

const fixture = vi.hoisted(() => ({
  report: vi.fn(), query: vi.fn(), leaves: vi.fn(),
  alert: vi.fn(), notification: vi.fn(),
}));
vi.mock("./db", () => ({ pool: { query: fixture.query } }));
vi.mock("./attendance-support", () => ({ employeeAttendanceReport: fixture.report }));
vi.mock("./storage", () => ({ storage: {
  getLeaveRequests: fixture.leaves,
  createRiskAlertIfNew: fixture.alert,
  createNotification: fixture.notification,
} }));
import { employeeMonthlyAttendanceRisk } from "./attendance-risk";

const employee = {
  id: 1, employeeNumber: "SYNTHETIC", contractStart: "2026-01-01",
  fullNameAr: "Synthetic", department: "hr",
} as Employee;
describe("read-only attendance risk projection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    fixture.query.mockResolvedValue({ rows: [] });
    fixture.leaves.mockResolvedValue([]);
  });
  it("excludes undocumented days, discloses coverage and never writes on repeated reads", async () => {
    fixture.report.mockResolvedValue({ rows: [
      { day: "2026-10-01", calendarVerified: false, scheduleVerified: false, late: true, status: "absent" },
      { day: "2026-10-02", calendarVerified: true, scheduleVerified: false, late: true, status: "missing_checkout" },
      { day: "2026-10-03", calendarVerified: true, scheduleVerified: true, late: true, status: "late" },
      { day: "2026-10-04", calendarVerified: true, scheduleVerified: true, status: "excused", adminOverride: true },
    ] });
    for (let i = 0; i < 2; i++) {
      expect(await employeeMonthlyAttendanceRisk(employee, "2026-10", "2026-10-04"))
        .toMatchObject({ late: 1, absent: 0, incomplete: 0, verifiedDays: 2, unverifiedDays: 2, assessmentAvailable: true });
    }
    expect(fixture.query.mock.calls.every(([sql]) => /^\s*SELECT\b/.test(sql))).toBe(true);
    expect(fixture.alert).not.toHaveBeenCalled();
    expect(fixture.notification).not.toHaveBeenCalled();
  });
  it("does not turn entirely unknown coverage into an available assessment", async () => {
    fixture.report.mockResolvedValue({ rows: [
      { day: "2026-10-01", calendarVerified: false, scheduleVerified: false, status: "unverified_schedule" },
    ] });
    expect(await employeeMonthlyAttendanceRisk(employee, "2026-10", "2026-10-01"))
      .toMatchObject({ score: 0, verifiedDays: 0, unverifiedDays: 1, assessmentAvailable: false });
    expect(fixture.query.mock.calls.every(([sql]) => /^\s*SELECT\b/.test(sql))).toBe(true);
  });
});
