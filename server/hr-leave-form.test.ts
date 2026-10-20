import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getEmployee: vi.fn(), getLeaveRequests: vi.fn(), query: vi.fn() }));
vi.mock("./db", () => ({ pool: { query: mocks.query } }));
vi.mock("./storage", () => ({ storage: { getEmployee: mocks.getEmployee, getLeaveRequests: mocks.getLeaveRequests } }));
vi.mock("./hr-workflow-support", () => ({ annualEntitlementAt: () => 21, annualUsage: () => 3 }));
import { captureLeaveForm, initHrLeaveForm } from "./hr-leave-form";
import { leaveFormInputSchema } from "../shared/hr-leave-form";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockResolvedValue({ rows: [{ date: "2026-01-01" }] });
  mocks.getLeaveRequests.mockResolvedValue([{ status: "approved", endDate: "2025-12-31", leaveType: "annual" }]);
  mocks.getEmployee.mockImplementation(async (id: number) => ({ id, employeeNumber: `E${id}`, fullNameAr: `موظف ${id}`, department: "hr", position: "HR", nationality: "saudi", iqamaNumber: "123", phone: "0500000000", contractStart: "2025-01-01", status: "active" }));
});
describe("official leave capture", () => {
  it("uses additive nullable migration without rewriting legacy records", async () => {
    await initHrLeaveForm();
    expect(mocks.query).toHaveBeenCalledWith("ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS leave_form_data jsonb");
  });
  it("captures authoritative identities, balance snapshot and ordinary ESS acknowledgment", async () => {
    const snapshot = await captureLeaveForm(1, { destination: "الرياض", substituteEmployeeId: 2, employeeAcknowledged: true }, { kind: "employee", employeeId: 1 }, "2026-05-01");
    expect(snapshot.employee.employeeNumber).toBe("E1");
    expect(snapshot.substitute?.employeeNumber).toBe("E2");
    expect(snapshot.hr.leaveBalance).toBe(18);
    expect(snapshot.hr.lastReturnDate).toBe("2026-01-01");
    expect(snapshot.acknowledgment?.employeeId).toBe(1);
    expect(snapshot.acknowledgment?.kind).toBe("ordinary_electronic_acknowledgment");
  });
  it("does not let HR acknowledge for employee or employee supply HR-only evidence", async () => {
    await expect(captureLeaveForm(1, { employeeAcknowledged: true }, { kind: "admin", userId: 9 }, "2026-05-01")).rejects.toMatchObject({ status: 403 });
    await expect(captureLeaveForm(1, { hrReview: { entitlementDate: "2026-01-01" } }, { kind: "employee", employeeId: 1 }, "2026-05-01")).rejects.toMatchObject({ status: 403 });
    await expect(captureLeaveForm(1, {}, { kind: "employee", employeeId: 2 }, "2026-05-01")).rejects.toMatchObject({ status: 403 });
  });
  it("rejects forged approval/snapshot properties and invalid dates", () => {
    expect(leaveFormInputSchema.safeParse({ leaveBalance: 999, employeeSignature: "HR" }).success).toBe(false);
    expect(leaveFormInputSchema.safeParse({ actualReturnDate: "2026-02-30" }).success).toBe(false);
    expect(leaveFormInputSchema.safeParse({ actualDepartureDate: "2026-03-10", actualReturnDate: "2026-03-01" }).success).toBe(false);
  });
  it("preserves legacy simple requests while recording a server snapshot", async () => {
    const snapshot = await captureLeaveForm(1, undefined, { kind: "admin", userId: 9 }, "2026-05-01");
    expect(snapshot.acknowledgment).toBeNull();
    expect(snapshot.submitted).toEqual({});
    expect(snapshot.capturedBy).toEqual({ kind: "admin", userId: 9 });
  });
});
