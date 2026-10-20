/**
 * Development-database protocol tests. SMS transport is mocked ONLY by Vitest;
 * verification, hashing, locks, expiry and sessions use the real implementation.
 * No demo code or authentication bypass is present in the running application.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import { randomBytes, randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { pool } from "../db";
import { initializeEmployeePortal, employeeDirectory, employeePhone } from "./database";
import { tokenHash } from "./security";
import { createEmployeePortalRouter, DEVICE_COOKIE } from "./router";
import { sendEmployeeOtp } from "./sms";

vi.mock("./sms", () => ({ sendEmployeeOtp: vi.fn(async () => {}) }));

let server: Server, base = "", employeeId = 0, secondId = 0;
let registeredPhone = "", browserCookie = "", deviceCookie = "", sessionId = "";
const originalSender = process.env.TAQNYAT_API_KEY;
const originalSecret = process.env.SESSION_SECRET;
const sent = vi.mocked(sendEmployeeOtp);

async function call(path: string, method = "GET", body?: object, cookie = deviceCookie, headers = {}) {
  const response = await fetch(base + path, {
    method, headers: { "Content-Type": "application/json", "X-Portal-Request": "1", Cookie: cookie, ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json(), cookies: response.headers.getSetCookie() };
}
beforeAll(async () => {
  if (process.env.NODE_ENV === "production") throw new Error("Never run fixture tests in production");
  // Test-only transport sentinel; never use real secrets or transmit SMS.
  process.env.TAQNYAT_API_KEY = "vitest-transport-disabled";
  process.env.SESSION_SECRET ||= randomBytes(32).toString("hex");
  await initializeEmployeePortal();
  const existing = new Set((await employeeDirectory()).map(employeePhone));
  do { registeredPhone = `96650${String(Math.floor(Math.random() * 10000000)).padStart(7, "0")}`; }
  while (existing.has(registeredPhone));
  for (let i = 0; i < 2; i++) {
    const inserted = await pool.query(`INSERT INTO employees
      (employee_number,full_name_ar,nationality,position,department,monthly_salary,contract_start,status,phone,attendance_enabled)
      VALUES($1,'موظف اختبار آلي','saudi','اختبار','hr',1,'2025-01-01','active',$2,true) RETURNING id`,
    [`ESS-TEST-${randomUUID()}`, i === 0 ? registeredPhone : null]);
    if (i === 0) employeeId = inserted.rows[0].id;
    else secondId = inserted.rows[0].id;
  }
  const app = express();
  app.use(express.json({ limit: "8kb" }), createEmployeePortalRouter());
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  const address = server.address() as { port: number };
  base = `http://127.0.0.1:${address.port}`;
}, 30000);

afterAll(async () => {
  if (server) await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
  for (const id of [employeeId, secondId].filter(Boolean)) {
    await pool.query("DELETE FROM employee_portal_otps WHERE employee_id=$1", [id]);
    await pool.query("DELETE FROM employee_portal_devices WHERE employee_id=$1", [id]);
    await pool.query(`DELETE FROM notifications WHERE related_entity='leave_request' AND related_id IN
      (SELECT id FROM leave_requests WHERE employee_id=$1)`, [id]);
    await pool.query(`DELETE FROM notifications WHERE related_entity='attendance_permission' AND related_id IN
      (SELECT id FROM attendance_permissions WHERE employee_id=$1)`, [id]);
    await pool.query("DELETE FROM attendance_records WHERE employee_id=$1", [id]);
    await pool.query("DELETE FROM leave_requests WHERE employee_id=$1", [id]);
    await pool.query("DELETE FROM attendance_permissions WHERE employee_id=$1", [id]);
    await pool.query("DELETE FROM employees WHERE id=$1", [id]);
  }
  if (registeredPhone) {
    await pool.query("DELETE FROM employee_portal_limits WHERE key IN ($1,$2)",
      [`otp-phone:${tokenHash(registeredPhone)}`, `otp-cooldown:${tokenHash(registeredPhone)}`]);
  }
  if (originalSender === undefined) delete process.env.TAQNYAT_API_KEY;
  else process.env.TAQNYAT_API_KEY = originalSender;
  if (originalSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSecret;
}, 30000);

describe.sequential("isolated employee protocol", () => {
  it("requires a device session and rejects cross-origin state changes", async () => {
    expect((await call("/me", "GET", undefined, "")).status).toBe(401);
    expect((await call("/otp/request", "POST", { phone: registeredPhone }, "", { Origin: "https://malicious.invalid" })).status).toBe(403);
    expect((await call("/otp/request", "POST", { phone: registeredPhone }, "", { "X-Portal-Request": "" })).status).toBe(403);
  });
  it("issues a challenge, not a session, and never returns the OTP", async () => {
    const response = await call("/otp/request", "POST", { phone: registeredPhone }, "");
    expect(response.status).toBe(200);
    expect(response.data.challengeId).toBeTruthy();
    expect(response.data.code).toBeUndefined();
    expect(sent).toHaveBeenCalledTimes(1);
    browserCookie = response.cookies[0].split(";")[0];
    const [{ rows }] = await Promise.all([pool.query("SELECT code_hash FROM employee_portal_otps WHERE id=$1", [response.data.challengeId])]);
    const code = sent.mock.calls[0][1];
    expect(rows[0].code_hash).not.toContain(code);
    expect((await call("/otp/verify", "POST", { challengeId: response.data.challengeId, code }, "")).status).toBe(401);
    // Retain fixture challenge only in the test closure, never application logs.
    (globalThis as any).__essTestChallenge = { challengeId: response.data.challengeId, code };
  });
  it("requires the correct OTP, binds the session and consumes the challenge once", async () => {
    const { challengeId, code } = (globalThis as any).__essTestChallenge;
    const wrongCode = code === "123456" ? "654321" : "123456";
    expect((await call("/otp/verify", "POST", { challengeId, code: wrongCode }, browserCookie)).status).toBe(401);
    const verified = await call("/otp/verify", "POST", { challengeId, code, deviceName: "جهاز اختبار آلي" }, browserCookie);
    expect(verified.status).toBe(200);
    const cookie = verified.cookies.find(c => c.startsWith(DEVICE_COOKIE + "="))!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    deviceCookie = cookie.split(";")[0];
    expect((await call("/otp/verify", "POST", { challengeId, code }, browserCookie)).status).toBe(401);
    delete (globalThis as any).__essTestChallenge;
    const me = await call("/me");
    expect(me.data.employee.id).toBe(employeeId);
    sessionId = me.data.sessionId;
    expect((await call("/summary")).data.employee.id).toBe(employeeId);
  });
  it("rejects employee ID spoofing and unverifiable GPS without saving attendance", async () => {
    const valid = { type: "check_in", latitude: 0, longitude: 0, accuracy: 10, locationTimestamp: Date.now() };
    expect((await call("/attendance", "POST", { ...valid, employeeId: secondId })).status).toBe(400);
    expect((await call("/attendance", "POST", { ...valid, accuracy: 1000 })).status).toBe(400);
    expect((await call("/attendance", "POST", { ...valid, locationTimestamp: Date.now() - 300000 })).status).toBe(400);
    expect((await call("/attendance", "POST", valid)).status).toBe(403);
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM attendance_records WHERE employee_id=$1", [employeeId]);
    expect(rows[0].n).toBe(0);
  });
  it("cannot revoke another employee's device or query their private records", async () => {
    const foreignId = randomUUID();
    await pool.query(`INSERT INTO employee_portal_devices(id,employee_id,phone,token_hash,device_name,expires_at)
      VALUES($1,$2,'unregistered-test',$3,'test',now()+interval '1 hour')`, [foreignId, secondId, tokenHash(randomBytes(32).toString("hex"))]);
    await call("/sessions/revoke", "POST", { sessionId: foreignId });
    const { rows } = await pool.query("SELECT revoked_at FROM employee_portal_devices WHERE id=$1", [foreignId]);
    expect(rows[0].revoked_at).toBeNull();
    const response = await call(`/summary?employeeId=${secondId}`);
    expect(response.data.employee.id).toBe(employeeId);
    expect(response.data.sessions.every((d: any) => d.id !== foreignId)).toBe(true);
  });
  it("revokes a valid session on duplicated HR phone records", async () => {
    await pool.query("UPDATE employees SET phone=$1 WHERE id=$2", [registeredPhone, secondId]);
    expect((await call("/me")).status).toBe(401);
    const { rows } = await pool.query("SELECT revoked_at FROM employee_portal_devices WHERE id=$1", [sessionId]);
    expect(rows[0].revoked_at).not.toBeNull();
    await pool.query("UPDATE employees SET phone=NULL WHERE id=$1", [secondId]);
  });
});
