import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { pool } from "./db";
import { registerAttendanceMovements } from "./attendance-movements";
import { registerAttendanceOverride } from "./attendance-override";
import { employeeAttendanceReport } from "./attendance-support";
import { activeMovementSql } from "./attendance-movement-state";
import { requireRole } from "./auth";

let employee = 0, actor = 0, server: Server, base = "", entry = 0, exit = 0;
const day = "2026-10-01", tag = `MOVEMENT-TEST-${randomUUID()}`;
const headers = { "Content-Type": "application/json", "X-Test-User": "hr" };
async function call(path: string, body?: object, authorized = true) {
  const response = await fetch(base + path, { method: body ? "POST" : "GET",
    headers: authorized ? headers : { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json() };
}
beforeAll(async () => {
  if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT === "1")
    throw new Error("Development tests only");
  actor = (await pool.query(`INSERT INTO users(username,password,role,full_name_ar,full_name_en,active)
    VALUES($1,'non-login-test','hr','اختبار','Test',true) RETURNING id`, [tag])).rows[0].id;
  employee = (await pool.query(`INSERT INTO employees
    (employee_number,full_name_ar,nationality,position,department,monthly_salary,contract_start,status,attendance_enabled)
    VALUES($1,'اختبار تصحيح الحركات','saudi','اختبار','hr',1,'2025-01-01','active',true) RETURNING id`, [tag])).rows[0].id;
  await pool.query(`INSERT INTO attendance_day_schedules(employee_id,business_day,shifts) VALUES($1,$2,$3)`,
    [employee, day, JSON.stringify([{ id: "single", label: "الدوام", start: "07:00", end: "16:00", graceMinutes: 15 }])]);
  entry = (await pool.query(`INSERT INTO attendance_records(employee_id,employee_name_ar,type,check_time,shift_key)
    VALUES($1,'اختبار','check_in','2026-10-01 04:32:00','single') RETURNING id`, [employee])).rows[0].id;
  exit = (await pool.query(`INSERT INTO attendance_records(employee_id,employee_name_ar,type,check_time,shift_key)
    VALUES($1,'اختبار','check_out','2026-10-01 04:45:00','single') RETURNING id`, [employee])).rows[0].id;
  const app = express(); app.use(express.json());
  // Test-only session adapter; the exact production role/identity middleware
  // still loads the real account. Do not inject req.user (the original bug).
  app.use((req, _res, next) => {
    (req as any).session = req.get("X-Test-User") === "hr" ? { userId: actor, adminAuthenticated: true } : {};
    next();
  });
  const authorize = requireRole("owner", "hr");
  registerAttendanceMovements(app, authorize); registerAttendanceOverride(app, authorize);
  await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async () => {
  if (server) await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
  if (employee) {
    await pool.query("DELETE FROM attendance_audit_log WHERE employee_id=$1", [employee]);
    await pool.query("DELETE FROM attendance_records WHERE employee_id=$1", [employee]);
    await pool.query("DELETE FROM attendance_day_schedules WHERE employee_id=$1", [employee]);
    await pool.query("DELETE FROM attendance_day_calendars WHERE employee_id=$1", [employee]);
    await pool.query("DELETE FROM employees WHERE id=$1", [employee]);
  }
  if (actor) {
    await pool.query("DELETE FROM notifications WHERE user_id=$1", [actor]);
    await pool.query("DELETE FROM users WHERE id=$1", [actor]);
  }
});
describe("PostgreSQL attendance movement corrections", () => {
  it("saves the real administrative override with an optional time", async () => {
    const result = await call(`/api/attendance/record/${exit}/override`, {
      newCheckTime: "2026-10-01T07:45:00+03:00", note: "تكرار بصمة اختباري", excuseType: "forgot_fingerprint",
    });
    expect(result).toMatchObject({ status: 200, data: { success: true } });
  });
  it("keeps both punches inspectable and excludes only the mistaken checkout", async () => {
    const list = await call(`/api/attendance/movements?employeeId=${employee}&day=${day}`);
    expect(list.data.records).toHaveLength(2);
    const record = list.data.records.find((r: any) => r.id === exit);
    const corrected = await call(`/api/attendance/record/${exit}/correction`, {
      action: "void", reason: "استبعاد خروج بالخطأ", expectedVersion: record.version,
    });
    expect(corrected).toMatchObject({ status: 200 });
    const active = await pool.query(`SELECT id FROM attendance_records WHERE employee_id=$1 AND ${activeMovementSql()}`, [employee]);
    expect(active.rows.map(r => r.id)).toEqual([entry]);
    expect((await call(`/api/attendance/movements?employeeId=${employee}&day=${day}`)).data.records).toHaveLength(2);
    const report = await employeeAttendanceReport(employee, day, day);
    expect(report.rows[0].checkOut).toBeNull();
    expect(report.rows[0].recordIds).toEqual([entry]);
  });
  it("rejects stale decisions and a checkout-to-checkin duplicate", async () => {
    expect((await call(`/api/attendance/record/${exit}/correction`, {
      action: "restore", reason: "قرار قديم لا يطبق", expectedVersion: 0,
    })).status).toBe(409);
    const { data } = await call(`/api/attendance/movements?employeeId=${employee}&day=${day}`);
    const record = data.records.find((r: any) => r.id === exit);
    expect((await call(`/api/attendance/record/${exit}/correction`, {
      action: "restore", reason: "إعادة خروج اختباري", expectedVersion: record.version,
    })).status).toBe(200);
    const latest = (await call(`/api/attendance/movements?employeeId=${employee}&day=${day}`)).data.records.find((r: any) => r.id === exit);
    expect((await call(`/api/attendance/record/${exit}/correction`, {
      action: "edit", newType: "check_in", reason: "تغيير غير متسلسل", expectedVersion: latest.version,
    })).status).toBe(409);
  });
  it("does not remove a valid entry leaving an orphan checkout", async () => {
    expect((await call(`/api/attendance/record/${entry}/correction`, {
      action: "void", reason: "سيترك خروج بلا دخول", expectedVersion: 0,
    })).status).toBe(409);
  });
  it("requires authentication and a reason, and protects the business day", async () => {
    expect((await call(`/api/attendance/movements?employeeId=${employee}&day=${day}`, undefined, false)).status).toBe(401);
    const record = (await call(`/api/attendance/movements?employeeId=${employee}&day=${day}`)).data.records.find((r: any) => r.id === exit);
    expect((await call(`/api/attendance/record/${exit}/correction`, {
      action: "void", expectedVersion: record.version, reason: "",
    })).status).toBe(400);
    expect((await call(`/api/attendance/record/${exit}/correction`, {
      action: "edit", expectedVersion: record.version, reason: "تاريخ آخر", newCheckTime: "2026-10-02T08:00:00+03:00",
    })).status).toBe(400);
  });
  it("serializes two managers and allows a missing manual checkout after exclusion", async () => {
    const record = (await call(`/api/attendance/movements?employeeId=${employee}&day=${day}`)).data.records.find((r: any) => r.id === exit);
    const results = await Promise.all([1, 2].map(() => call(`/api/attendance/record/${exit}/correction`, {
      action: "void", expectedVersion: record.version, reason: "قرار مدير متزامن",
    })));
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    const added = await call("/api/attendance/movements", {
      employeeId: employee, day, shiftKey: "single", type: "check_out",
      checkTime: `${day}T16:00:00+03:00`, reason: "إضافة خروج صحيح",
    });
    expect(added.status).toBe(201);
    const after = await call(`/api/attendance/movements?employeeId=${employee}&day=${day}`);
    expect(after.data.records).toHaveLength(3);
    expect(after.data.records.find((r: any) => r.id === exit).excluded).toBe(true);
    const report = await employeeAttendanceReport(employee, day, day);
    expect(new Date(report.rows[0].checkOut!).toISOString()).toBe("2026-10-01T13:00:00.000Z");
    const duplicate = await call("/api/attendance/movements", {
      employeeId: employee, day, shiftKey: "single", type: "check_out",
      checkTime: `${day}T16:00:00+03:00`, reason: "إعادة إرسال طلب",
    });
    expect(duplicate.status).toBe(409);
  });
});
