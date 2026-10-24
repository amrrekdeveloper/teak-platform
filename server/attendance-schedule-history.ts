import { pool } from "./db";
import { resolveAttendanceShifts, riyadhDateKey, type AttendanceShift, type WorkScheduleLike, type AttendanceEmployeeAssignment } from "../shared/attendance";
import { calendarForDay } from "./attendance-workweek";

export async function initAttendanceScheduleHistory() {
  await pool.query(`CREATE TABLE IF NOT EXISTS attendance_day_schedules(
    employee_id integer NOT NULL REFERENCES employees(id),
    business_day text NOT NULL, shifts jsonb NOT NULL,
    captured_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(employee_id,business_day)
  )`);
}

/** Freeze a business day's schedule when first used. Never recalculate a frozen day. */
export async function scheduledShiftsForDay(settings: WorkScheduleLike[], employee: AttendanceEmployeeAssignment,
  day = riyadhDateKey(new Date())): Promise<AttendanceShift[]> {
  if(day===riyadhDateKey(new Date()))await calendarForDay(employee.id,day);
  const { rows: [saved] } = await pool.query("SELECT shifts FROM attendance_day_schedules WHERE employee_id=$1 AND business_day=$2", [employee.id, day]);
  if (saved) return saved.shifts;
  const shifts = resolveAttendanceShifts(settings, employee);
  // Never guess the configuration of a day that predates this deployment.
  if (day !== riyadhDateKey(new Date())) return shifts;
  const {rows: [snapshot]} = await pool.query(`INSERT INTO attendance_day_schedules(employee_id,business_day,shifts)
    VALUES($1,$2,$3) ON CONFLICT(employee_id,business_day) DO UPDATE
    SET shifts=attendance_day_schedules.shifts RETURNING shifts`, [employee.id, day, JSON.stringify(shifts)]);
  return snapshot.shifts;
}

/** Before a settings mutation freeze today's configuration, including employees who have not checked in. */
export async function freezeCurrentAttendanceSchedules(executor:{query:(sql:string)=>Promise<unknown>}=pool) {
  await executor.query(`INSERT INTO attendance_day_schedules(employee_id,business_day,shifts)
    SELECT e.id,to_char(now() AT TIME ZONE 'Asia/Riyadh','YYYY-MM-DD'),
      COALESCE(NULLIF(w.shifts,'[]'::jsonb), jsonb_build_array(jsonb_build_object(
        'id','single','label','الدوام','start',COALESCE(w.work_start_time,'08:00'),
        'end',COALESCE(w.work_end_time,''),'graceMinutes',COALESCE(w.grace_minutes,15))))
    FROM employees e LEFT JOIN LATERAL (
      SELECT * FROM work_schedule_settings s WHERE
        (s.id=e.attendance_schedule_id AND s.location_zone_id=e.attendance_zone_id) OR
        (s.scope_type='employee' AND s.employee_id=e.id) OR
        (s.scope_type='department' AND s.department=e.department::text) OR s.scope_type='default'
      ORDER BY CASE WHEN s.id=e.attendance_schedule_id AND s.location_zone_id=e.attendance_zone_id THEN -1
        WHEN s.scope_type='employee' THEN 0 WHEN s.scope_type='department' THEN 1 ELSE 2 END,s.id LIMIT 1
    ) w ON true WHERE e.status='active' AND (
      e.created_at < date_trunc('day',now() AT TIME ZONE 'Asia/Riyadh') AT TIME ZONE 'Asia/Riyadh'
      OR EXISTS(SELECT 1 FROM attendance_records r WHERE r.employee_id=e.id
        AND r.check_time >= date_trunc('day',now() AT TIME ZONE 'Asia/Riyadh') - interval '3 hours'))
    ON CONFLICT(employee_id,business_day) DO NOTHING`);
  await executor.query(`INSERT INTO attendance_day_calendars(employee_id,business_day,working_day,policy_id,source)
    SELECT e.id,to_char(now() AT TIME ZONE 'Asia/Riyadh','YYYY-MM-DD'),
      p.working_days @> to_jsonb(extract(dow FROM now() AT TIME ZONE 'Asia/Riyadh')::integer),
      p.id,CASE WHEN p.employee_id IS NULL THEN 'default' ELSE 'employee' END
    FROM employees e
    LEFT JOIN LATERAL (
      SELECT * FROM attendance_week_policies WHERE employee_id=e.id
        AND effective_from<=to_char(now() AT TIME ZONE 'Asia/Riyadh','YYYY-MM-DD')
      ORDER BY effective_from DESC,id DESC LIMIT 1
    ) own ON true
    JOIN LATERAL (
      SELECT * FROM attendance_week_policies WHERE
        ((own.working_days IS NOT NULL AND id=own.id) OR (own.working_days IS NULL AND employee_id IS NULL))
        AND effective_from<=to_char(now() AT TIME ZONE 'Asia/Riyadh','YYYY-MM-DD')
      ORDER BY effective_from DESC,id DESC LIMIT 1
    ) p ON true WHERE e.status='active'
    ON CONFLICT(employee_id,business_day) DO NOTHING`);
}
