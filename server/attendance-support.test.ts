import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  keys: new Set<string>(), notifications: 0, transactions: [] as string[],
  failNotification: false, staged: "",
}));
vi.mock("./db", () => ({
  pool: {
    connect: async () => ({
      release: vi.fn(),
      query: async (sql: string, params: unknown[] = []) => {
        fixture.transactions.push(sql);
        if (sql === "COMMIT" && fixture.staged) { fixture.keys.add(fixture.staged); fixture.staged = ""; }
        if (sql === "ROLLBACK") fixture.staged = "";
        if (sql.includes("INSERT INTO attendance_violations")) {
          expect(sql).toContain("ON CONFLICT");
          const key = params.slice(0,4).join(":");
          if (fixture.keys.has(key)) return {rowCount:0,rows:[]};
          fixture.staged = key;
          return {rowCount:1,rows:[{id:1}]};
        }
        if (sql.includes("INSERT INTO notifications")) {
          if (fixture.failNotification) throw new Error("fixture failure");
          fixture.notifications++;
        }
        return {rowCount:0,rows:[]};
      },
    }),
  },
}));
vi.mock("./storage", () => ({ storage: {} }));
import { recordAttendanceViolation } from "./attendance-support";

describe("violation reconciliation transaction contract (isolated DB adapter)", () => {
  beforeEach(() => {
    fixture.keys.clear(); fixture.notifications = 0; fixture.transactions = [];
    fixture.failNotification = false; fixture.staged = "";
  });
  it("retries the same employee/day/shift/type without duplicate notification", async () => {
    await recordAttendanceViolation(17,"2026-06-01","morning","missing_checkout");
    await recordAttendanceViolation(17,"2026-06-01","morning","missing_checkout");
    expect(fixture.notifications).toBe(1);
    expect(fixture.keys.size).toBe(1);
  });
  it("keeps independent shifts and violation types", async () => {
    await recordAttendanceViolation(17,"2026-06-01","morning","missing_checkout");
    await recordAttendanceViolation(17,"2026-06-01","evening","missing_checkout");
    await recordAttendanceViolation(17,"2026-06-01","evening","missing_checkin");
    expect(fixture.notifications).toBe(3);
  });
  it("rolls back the deduplication key when notification persistence fails so retries recover", async () => {
    fixture.failNotification = true;
    await expect(recordAttendanceViolation(17,"2026-06-01","morning","missing_checkout")).rejects.toThrow("fixture failure");
    expect(fixture.transactions).toContain("ROLLBACK");
    expect(fixture.keys.size).toBe(0);
    fixture.failNotification = false;
    await recordAttendanceViolation(17,"2026-06-01","morning","missing_checkout");
    expect(fixture.notifications).toBe(1);
  });
});
