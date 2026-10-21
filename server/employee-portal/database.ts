import { pool } from "../db";
import { normalizeEmployeePhone } from "./security";

export async function initializeEmployeePortal() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employee_portal_otps (
      id uuid PRIMARY KEY, employee_id integer NOT NULL REFERENCES employees(id),
      phone text NOT NULL, code_hash text NOT NULL, browser_hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
      attempts integer NOT NULL DEFAULT 0, used_at timestamptz, sent boolean NOT NULL DEFAULT false
    );
    CREATE INDEX IF NOT EXISTS employee_portal_otps_expiry ON employee_portal_otps(expires_at);
    CREATE TABLE IF NOT EXISTS employee_portal_devices (
      id uuid PRIMARY KEY, employee_id integer NOT NULL REFERENCES employees(id),
      phone text NOT NULL, token_hash text NOT NULL UNIQUE, device_name text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL, revoked_at timestamptz
    );
    CREATE INDEX IF NOT EXISTS employee_portal_devices_employee ON employee_portal_devices(employee_id);
    ALTER TABLE employee_portal_otps ADD COLUMN IF NOT EXISTS auth_mode text NOT NULL DEFAULT 'sms';
    ALTER TABLE employee_portal_devices ADD COLUMN IF NOT EXISTS auth_mode text NOT NULL DEFAULT 'sms';
    CREATE TABLE IF NOT EXISTS employee_portal_limits (
      key text PRIMARY KEY, count integer NOT NULL, resets_at timestamptz NOT NULL
    );
  `);
}

export type PortalEmployee = {
  id: number; user_id: number | null; employee_number: string;
  full_name_ar: string; department: string; position: string;
  phone: string | null;
  status: string; attendance_enabled: boolean;
  contract_start: string; manager_id: number | null;
  attendanceZoneId?: number | null; attendanceScheduleId?: number | null;
  department_name_ar?: string | null;
};
export async function employeeDirectory(): Promise<PortalEmployee[]> {
  const { rows } = await pool.query(`
    SELECT e.id,e.user_id,e.employee_number,e.full_name_ar,e.department,e.position,
      e.phone,e.status,e.attendance_enabled,
      e.contract_start::text,e.manager_id,e.attendance_zone_id AS "attendanceZoneId",
      e.attendance_schedule_id AS "attendanceScheduleId",d.name_ar AS department_name_ar
    FROM employees e LEFT JOIN hr_departments d ON d.code=e.department
  `);
  return rows;
}
export const employeePhone = (e: PortalEmployee) =>
  normalizeEmployeePhone(e.phone?.trim() || "");

export function resolveEligibleEmployee(directory: PortalEmployee[], phone: string) {
  const matches = directory.filter(e => employeePhone(e) === phone);
  return matches.length === 1 && matches[0].status === "active" ? matches[0] : null;
}

// Cross-instance atomic limits, including unknown/unregistered numbers.
export async function takeLimit(key: string, max: number, seconds: number): Promise<boolean> {
  const { rows } = await pool.query(`
    INSERT INTO employee_portal_limits(key,count,resets_at)
    VALUES ($1,1,now()+$2*interval '1 second')
    ON CONFLICT(key) DO UPDATE SET
      count=CASE WHEN employee_portal_limits.resets_at<=now() THEN 1 ELSE employee_portal_limits.count+1 END,
      resets_at=CASE WHEN employee_portal_limits.resets_at<=now() THEN now()+$2*interval '1 second' ELSE employee_portal_limits.resets_at END
    RETURNING count
  `, [key, seconds]);
  return rows[0].count <= max;
}
export function publicEmployee(e: PortalEmployee) {
  return {
    id: e.id, fullNameAr: e.full_name_ar, employeeNumber: e.employee_number,
    department: e.department, position: e.position, attendanceEnabled: e.attendance_enabled,
    departmentNameAr: e.department_name_ar || e.department,
    attendanceZoneId: e.attendanceZoneId ?? null, attendanceScheduleId: e.attendanceScheduleId ?? null,
  };
}
