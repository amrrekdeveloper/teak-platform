import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
const mocks = vi.hoisted(() => ({ query: vi.fn(), clientQuery: vi.fn(), release: vi.fn() }));
vi.mock("./db", () => ({ pool: {
  query: mocks.query,
  connect: vi.fn(async () => ({ query: mocks.clientQuery, release: mocks.release })),
} }));
import { initializeSystemAdmin, isDesignatedSystemAdmin, registerSystemAdminRoutes } from "./system-admin";

const tools = { hashPassword: vi.fn(async () => "test-only-hash"), comparePasswords: vi.fn(async () => true) };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("TEAK_SYSTEM_ADMIN_USERNAME", "unit_fixture_owner");
  vi.stubEnv("TEAK_SYSTEM_ADMIN_PASSWORD", "unit-fixture-password-not-real");
  mocks.query.mockResolvedValue({ rows: [], rowCount: 0 });
  mocks.clientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("HR account management HTTP contract", () => {
  let server: Server;
  let base: string;
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      // Synthetic sessions for the isolated HTTP fixture only, not app code.
      (req as any).session = req.get("X-Test-Owner") === "yes"
        ? { systemAdminWorkspace: true, adminAuthenticated: true, userId: 9001 } : {};
      next();
    });
    registerSystemAdminRoutes(app, tools);
    await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
  beforeEach(() => {
    mocks.query.mockImplementation(async (sql: string) => sql.startsWith("SELECT id,role")
      ? { rows: [{ id: 9001, role: "owner", active: true, archived: false }], rowCount: 1 }
      : { rows: [{ valid: true }], rowCount: 1 });
  });
  const call = (method: string, path: string, body?: object, owner = true) =>
    fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(owner ? { "X-Test-Owner": "yes" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
  it("rejects unauthenticated HR account access", async () => {
    expect((await call("GET", "/api/system-admin/hr-accounts", undefined, false)).status).toBe(401);
  });
  it("rejects privilege injection instead of creating an owner", async () => {
    const response = await call("POST", "/api/system-admin/hr-accounts",
      { username: "test_hr", password: "unit-test-only-password", fullNameAr: "اختبار", role: "owner" });
    expect(response.status).toBe(400);
    expect(mocks.clientQuery).not.toHaveBeenCalled();
  });
  it("creates HR only and returns no password, hash or PIN", async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => sql.startsWith("INSERT INTO users")
      ? { rows: [{ id: 9999, username: "unit_hr", full_name_ar: "اختبار", full_name_en: "Test", active: true, password: "test-only-hash", employee_pin: "never-return" }], rowCount: 1 }
      : { rows: [], rowCount: 0 });
    const response = await call("POST", "/api/system-admin/hr-accounts",
      { username: "unit_hr", password: "unit-test-only-password", fullNameAr: "اختبار" });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ id: 9999, username: "unit_hr" });
    const insertion = mocks.clientQuery.mock.calls.find(([sql]) => sql.startsWith("INSERT INTO users"))!;
    expect(insertion[0]).toContain("'hr'");
    expect(insertion[1]).not.toContain("unit-test-only-password");
    expect(mocks.clientQuery.mock.calls.some(([sql]) => sql === "COMMIT")).toBe(true);
  });
  it("never permits modifying existing owner accounts", async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => sql.startsWith("SELECT * FROM users")
      ? { rows: [{ id: 2, role: "owner", active: true }], rowCount: 1 } : { rows: [], rowCount: 0 });
    const response = await call("PATCH", "/api/system-admin/hr-accounts/2", { active: false });
    expect(response.status).toBe(403);
    expect(mocks.clientQuery.mock.calls.some(([sql]) => sql.startsWith("UPDATE users"))).toBe(false);
  });
  it("resets HR password and revokes existing administrative sessions atomically", async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => sql.startsWith("SELECT * FROM users")
      ? { rows: [{ id: 9999, role: "hr", username: "unit_hr", active: true, archived: false }], rowCount: 1 }
      : sql.startsWith("UPDATE users")
        ? { rows: [{ id: 9999, username: "unit_hr", full_name_ar: "اختبار", full_name_en: "Test", active: true }], rowCount: 1 }
        : { rows: [], rowCount: 0 });
    const response = await call("PATCH", "/api/system-admin/hr-accounts/9999", { password: "unit-new-only-password" });
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain("password");
    expect(mocks.clientQuery.mock.calls.some(([sql]) => sql.startsWith("DELETE FROM user_sessions"))).toBe(true);
    expect(mocks.clientQuery.mock.calls.some(([sql]) => sql === "COMMIT")).toBe(true);
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("one-time system administrator bootstrap", () => {
  it("never resets or recreates an already configured account on restart", async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => sql.startsWith("SELECT user_id")
      ? { rows: [{ user_id: 7 }], rowCount: 1 } : { rows: [], rowCount: 0 });
    expect(await initializeSystemAdmin(tools)).toBe("already_configured");
    expect(tools.hashPassword).not.toHaveBeenCalled();
    expect(mocks.clientQuery.mock.calls.some(([sql]) => /UPDATE users|INSERT INTO users/.test(sql))).toBe(false);
  });
  it("creates a designated owner only when the chosen identity is unused", async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => sql.startsWith("INSERT INTO users")
      ? { rows: [{ id: 99 }], rowCount: 1 } : { rows: [], rowCount: 0 });
    expect(await initializeSystemAdmin(tools)).toBe("configured");
    expect(tools.hashPassword).toHaveBeenCalledTimes(1);
    expect(mocks.clientQuery.mock.calls.some(([sql]) => sql.startsWith("INSERT INTO teak_system_admin("))).toBe(true);
  });
  it("never promotes or overwrites a conflicting HR/non-owner identity", async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => sql.startsWith("SELECT id,role")
      ? { rows: [{ id: 2, role: "hr", active: true }], rowCount: 1 } : { rows: [], rowCount: 0 });
    expect(await initializeSystemAdmin(tools)).toBe("username_conflict");
    expect(tools.hashPassword).not.toHaveBeenCalled();
  });
  it("never overwrites an existing owner with a different password", async () => {
    tools.comparePasswords.mockResolvedValueOnce(false);
    mocks.clientQuery.mockImplementation(async (sql: string) => sql.startsWith("SELECT id,role")
      ? { rows: [{ id: 2, role: "owner", active: true, archived: false, password: "test-only-hash" }], rowCount: 1 } : { rows: [], rowCount: 0 });
    expect(await initializeSystemAdmin(tools)).toBe("username_conflict");
    expect(mocks.clientQuery.mock.calls.some(([sql]) => /UPDATE users/.test(sql))).toBe(false);
  });
  it("fails closed without secrets or with weak credentials", async () => {
    vi.stubEnv("TEAK_SYSTEM_ADMIN_PASSWORD", "");
    expect(await initializeSystemAdmin(tools)).toBe("not_configured");
    vi.stubEnv("TEAK_SYSTEM_ADMIN_PASSWORD", "short");
    expect(await initializeSystemAdmin(tools)).toBe("invalid_configuration");
  });
  it("requires an active, non-archived, designated owner", async () => {
    expect(await isDesignatedSystemAdmin({ id: 1, role: "hr", active: true })).toBe(false);
    expect(await isDesignatedSystemAdmin({ id: 1, role: "owner", active: false })).toBe(false);
    expect(await isDesignatedSystemAdmin({ id: 1, role: "owner", active: true, archived: true })).toBe(false);
    mocks.query.mockResolvedValueOnce({ rows: [{ valid: true }], rowCount: 1 });
    expect(await isDesignatedSystemAdmin({ id: 1, role: "owner", active: true })).toBe(true);
  });
});
