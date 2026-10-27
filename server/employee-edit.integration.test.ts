import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { pool } from "./db";
import { saveEmployeeEdit } from "./employee-edit";
import express from "express";
import { registerAttendanceSupport } from "./attendance-support";
let employeeId: number, actorId: number, zoneId: number;
beforeAll(async () => {
  if (process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production") throw new Error("Development only");
  const marker = `EDIT-TEST-${randomUUID()}`;
  actorId = (await pool.query(`INSERT INTO users(username,password,role,full_name_ar,full_name_en,active,archived)
    VALUES($1,'not-a-login','hr',$1,$1,true,false) RETURNING id`, [marker])).rows[0].id;
  zoneId = (await pool.query(`INSERT INTO location_zones(name_ar,name_en,type,center_lat,center_lng,radius_meters,is_active)
    VALUES($1,$1,'factory',24,46,100,true) RETURNING id`, [marker])).rows[0].id;
  employeeId = (await pool.query(`INSERT INTO employees(employee_number,full_name_ar,nationality,position,department,
    monthly_salary,contract_start,status) VALUES($1,$1,'saudi','اختبار','hr',1,'2026-01-01','active') RETURNING id`, [marker])).rows[0].id;
});
afterAll(async () => {
  if (employeeId) {
    await pool.query("DELETE FROM hr_audit_log WHERE employee_id=$1", [employeeId]);
    await pool.query("DELETE FROM attendance_records WHERE employee_id=$1", [employeeId]);
    await pool.query("DELETE FROM attendance_day_calendars WHERE employee_id=$1", [employeeId]);
    await pool.query("DELETE FROM attendance_day_schedules WHERE employee_id=$1", [employeeId]);
    await pool.query("DELETE FROM employees WHERE id=$1", [employeeId]);
  }
  if (zoneId) await pool.query("DELETE FROM location_zones WHERE id=$1", [zoneId]);
  if (actorId) {
    await pool.query("DELETE FROM notifications WHERE user_id=$1", [actorId]);
    await pool.query("DELETE FROM users WHERE id=$1", [actorId]);
  }
});
it("returns the full selected range and unmatched original punches, and rejects invalid ranges", async () => {
  const recordId = (await pool.query(`INSERT INTO attendance_records(employee_id,type,check_time,shift_key)
    VALUES($1,'check_in','2026-01-02 05:30:00','removed-historical-shift') RETURNING id`, [employeeId])).rows[0].id;
  const app = express();
  app.use(express.json());
  registerAttendanceSupport(app, (_req, _res, next) => next());
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const url = `http://127.0.0.1:${(server.address() as {port:number}).port}/api/attendance/period-report`;
  try {
    const response = await fetch(`${url}?employeeId=${employeeId}&from=2026-01-01&to=2026-12-31`);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.rows.length).toBeGreaterThanOrEqual(365);
    expect(new Set(result.rows.map((row: any) => row.day)).size).toBe(365);
    expect(result.rows.every((row: any) => row.employeeId === employeeId)).toBe(true);
    expect(result.rows.some((row: any) => row.recordIds?.includes(recordId) && row.checkIn)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
    for (const query of ["from=2026-02-30&to=2026-03-01", "from=2026-02-02&to=2026-02-01",
      "from=2025-01-01&to=2026-01-02", "from=2026-01-01&to=2026-01-02&employeeId=bad"]) {
      expect((await fetch(`${url}?${query}`)).status).toBe(400);
    }
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}, 20000);
it("persists assignments, audits them, preserves unrelated edits, and rejects stale clears atomically", async () => {
  const expected = { attendanceZoneId: null, attendanceScheduleId: null };
  await saveEmployeeEdit(employeeId, { attendanceZoneId: zoneId, expectedAttendanceAssignment: expected }, actorId);
  const afterProfile = await saveEmployeeEdit(employeeId, { position: "تعديل وظيفي فقط" }, actorId);
  expect(afterProfile?.attendanceZoneId).toBe(zoneId);
  await expect(saveEmployeeEdit(employeeId, { attendanceZoneId: null, expectedAttendanceAssignment: expected }, actorId))
    .rejects.toMatchObject({ status: 409 });
  const { rows: [current] } = await pool.query("SELECT attendance_zone_id FROM employees WHERE id=$1", [employeeId]);
  expect(current.attendance_zone_id).toBe(zoneId);
  expect((await pool.query("SELECT id FROM hr_audit_log WHERE employee_id=$1 AND action='attendance_assignment_changed'", [employeeId])).rowCount).toBe(1);
  await saveEmployeeEdit(employeeId, { attendanceZoneId: null,
    expectedAttendanceAssignment: { attendanceZoneId: zoneId, attendanceScheduleId: null } }, actorId);
  expect((await pool.query("SELECT id FROM hr_audit_log WHERE employee_id=$1 AND action='attendance_assignment_changed'", [employeeId])).rowCount).toBe(2);
});
it("saves identity and hire date, audits offsite permission, and rejects stale permission edits", async () => {
  const saved = await saveEmployeeEdit(employeeId, { nationalId: "1234567890", hireDate: "2025-06-01",
    attendanceLocationMode: "unrestricted", expectedAttendanceLocationMode: "assigned" }, actorId);
  expect(saved).toMatchObject({ nationalId: "1234567890", hireDate: "2025-06-01", attendanceLocationMode: "unrestricted" });
  await expect(saveEmployeeEdit(employeeId, {attendanceLocationMode:"assigned",expectedAttendanceLocationMode:"assigned"},actorId))
    .rejects.toMatchObject({status:409});
  expect((await pool.query("SELECT id FROM hr_audit_log WHERE employee_id=$1 AND action='attendance_location_permission_changed'",[employeeId])).rowCount).toBe(1);
  await expect(saveEmployeeEdit(employeeId,{nationalId:"short"},actorId)).rejects.toThrow();
});
