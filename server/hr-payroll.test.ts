import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(), release: vi.fn(), connect: vi.fn(), getUser: vi.fn(),
}));
vi.mock("./db", () => ({ pool: { connect: mocks.connect, query: mocks.query } }));
vi.mock("./storage", () => ({ storage: { getUser: mocks.getUser } }));
import { cents, payrollAmounts, payrollTransaction, payrollAction, approveAdvance, payrollRole, nextAdvanceInstallment } from "./hr-payroll";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
  mocks.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

const record = { id: 7, employee_id: 3, period: "2026-05", status: "approved", basic_salary: "5000.00",
  allowances: "300.00", deductions: "100.00", advance_deduction: "200.00", net_salary: "5000.00", advance_id: 9 };

describe("payroll money", () => {
  it("collects the rounding remainder in the final scheduled installment", async () => {
    expect(await nextAdvanceInstallment({ id: 1, amount: "100.00", remainingAmount: "33.34", monthlyDeduction: "33.33", installments: 3 })).toBe("33.34");
  });
  it("calculates base + allowances - manual deductions - installment exactly", () => {
    expect(payrollAmounts(record)).toEqual({ net: 500000, advance: 20000, expense: 520000 });
  });
  it.each(["1x", "-1", "Infinity", "", "1.001"])("rejects malformed money %s", value => {
    expect(() => cents(value)).toThrow();
  });
  it("rejects clamped or inconsistent net values", () => {
    expect(() => payrollAmounts({ ...record, net_salary: "0.00" })).toThrow();
  });
});

describe("transaction boundaries", () => {
  it("commits and releases after success", async () => {
    await payrollTransaction(async () => 1);
    expect(mocks.query.mock.calls.map(c => c[0])).toEqual(["BEGIN", "COMMIT"]);
    expect(mocks.release).toHaveBeenCalledOnce();
  });
  it("rolls back and releases on a posting failure", async () => {
    await expect(payrollTransaction(async () => { throw new Error("line failed"); })).rejects.toThrow("line failed");
    expect(mocks.query.mock.calls.map(c => c[0])).toEqual(["BEGIN", "ROLLBACK"]);
    expect(mocks.release).toHaveBeenCalledOnce();
  });
  it("refuses already paid payroll without a posting", async () => {
    mocks.query.mockImplementation(async (sql: string) => ({
      rows: sql.startsWith("SELECT * FROM payroll_records") ? [{ ...record, status: "paid" }] : [], rowCount: 0,
    }));
    await expect(payrollAction(7, "pay", 1)).rejects.toThrow();
    expect(mocks.query.mock.calls.some(c => c[0].includes("INSERT"))).toBe(false);
  });
  it("refuses payment of a draft", async () => {
    mocks.query.mockImplementation(async (sql: string) => ({
      rows: sql.startsWith("SELECT * FROM payroll_records") ? [{ ...record, status: "draft" }] : [], rowCount: 0,
    }));
    await expect(payrollAction(7, "pay", 1)).rejects.toThrow();
  });
  it("rolls back journal, recovery and paid state when recovery insert fails", async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT * FROM payroll_records")) return { rows: [record] };
      if (sql.startsWith("SELECT * FROM employee_advances")) return { rows: [{ id: 9, remaining_amount: "1000.00" }] };
      if (sql.includes("FROM chart_of_accounts a")) return { rows: [{ code: "REAL-CHART-CODE", name_ar: "حساب" }] };
      if (sql.includes("INSERT INTO journal_entries")) return { rows: [{ id: 100 }] };
      if (sql.includes("INSERT INTO payroll_advance_repayments")) throw new Error("recovery failed");
      return { rows: [], rowCount: 0 };
    });
    await expect(payrollAction(7, "pay", 1)).rejects.toThrow("recovery failed");
    expect(mocks.query.mock.calls.some(c => c[0] === "ROLLBACK")).toBe(true);
    expect(mocks.query.mock.calls.some(c => c[0] === "COMMIT")).toBe(false);
    expect(mocks.query.mock.calls.some(c => c[0].includes("SET status='paid'"))).toBe(false);
  });
  it("blocks approval when another active advance exists", async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT employee_id")) return { rows: [{ employee_id: 3 }] };
      if (sql.startsWith("SELECT * FROM employee_advances")) return { rows: [{ employee_id: 3, status: "pending" }] };
      if (sql.startsWith("SELECT id FROM employee_advances")) return { rows: [{ id: 9 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    await expect(approveAdvance(8, 1)).rejects.toThrow();
    expect(mocks.query.mock.calls.some(c => c[0].includes("INSERT"))).toBe(false);
  });
});

describe("explicit financial role isolation", () => {
  it.each(["hr", "it", "assistant", "sales"])("denies %s payment regardless of permissions", async role => {
    mocks.getUser.mockResolvedValue({ role, active: true, archived: false });
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    await payrollRole("owner", "accountant")({ session: { userId: 1 } } as any, res as any, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
  it.each(["owner", "accountant"])("allows active %s payment", async role => {
    mocks.getUser.mockResolvedValue({ role, active: true, archived: false });
    const next = vi.fn();
    await payrollRole("owner", "accountant")({ session: { userId: 1 } } as any, {} as any, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
