import type { Express, RequestHandler } from "express";
import { z } from "zod";
import { pool } from "./db";
import { storage } from "./storage";
import { resolveAttendanceShifts, riyadhDateKey, riyadhDayBounds, shiftAttendanceStatus, validateShifts, type WorkScheduleLike } from "../shared/attendance";
import { completeShiftEvidence, legacyRestDay } from "../shared/attendance-workweek";
import { calendarForDay, weekPolicies, registerWorkweek } from "./attendance-workweek";
import { validDate } from "./employee-portal/security";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { saveObjectFile, streamObjectFile, deleteObjectFile } from "./objectFileStore";
import { initMedicalDocuments, registerHrMedicalDocuments, medicalDocumentRole } from "./employee-portal/medical-documents";
import { initAttendanceScheduleHistory, scheduledShiftsForDay, freezeCurrentAttendanceSchedules } from "./attendance-schedule-history";
import { applyAttendanceCorrection, attendanceCorrections, registerHrCorrections } from "./attendance-corrections";
import type { AttendanceReportRow } from "../shared/attendance-report";
import type { Employee } from "../shared/schema";
import type { WeekPolicy } from "../shared/attendance-workweek";
import { activeMovementSql } from "./attendance-movement-state";
import { saveAttendanceSchedule } from "./attendance-settings-edit";

/** Additive only. Call during startup after existing attendance tables have been initialized. */
export async function ensureAttendanceExtensions() {
  await pool.query(`
    ALTER TABLE work_schedule_settings ADD COLUMN IF NOT EXISTS work_end_time text;
    ALTER TABLE work_schedule_settings ADD COLUMN IF NOT EXISTS shifts jsonb;
    ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS shift_key text;
    ALTER TABLE attendance_violations ADD COLUMN IF NOT EXISTS business_day text;
    ALTER TABLE attendance_violations ADD COLUMN IF NOT EXISTS shift_key text;
    CREATE UNIQUE INDEX IF NOT EXISTS attendance_violation_shift_once
      ON attendance_violations(employee_id,business_day,shift_key,violation_type)
      WHERE business_day IS NOT NULL AND shift_key IS NOT NULL;
    CREATE TABLE IF NOT EXISTS attendance_medical_attachments (
      id serial PRIMARY KEY, record_id integer NOT NULL REFERENCES attendance_records(id),
      uploaded_by integer NOT NULL REFERENCES users(id), mime_type text NOT NULL,
      content bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (octet_length(content) <= 5242880)
    );
    CREATE TABLE IF NOT EXISTS attendance_monthly_risk (
      employee_id integer NOT NULL REFERENCES employees(id), period text NOT NULL,
      late integer NOT NULL, absent integer NOT NULL, incomplete integer NOT NULL, score integer NOT NULL,
      calculated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(employee_id,period)
    );
  `);
  await pool.query(`ALTER TABLE attendance_medical_attachments ADD COLUMN IF NOT EXISTS object_key text;
    ALTER TABLE attendance_medical_attachments ALTER COLUMN content DROP NOT NULL`);
  const { initAttendanceWorkspace } = await import("./attendance-workspace");
  await initAttendanceWorkspace();
  await initMedicalDocuments();
  await initAttendanceScheduleHistory();
}

export async function attendanceSchedules(): Promise<WorkScheduleLike[]> {
  const result = await pool.query(`SELECT id,scope_type AS "scopeType",department,employee_id AS "employeeId",
    work_start_time AS "workStartTime",grace_minutes AS "graceMinutes",work_end_time AS "workEndTime",shifts,
    location_zone_id AS "locationZoneId",label_ar AS "labelAr"
    FROM work_schedule_settings ORDER BY id`);
  return result.rows;
}

export async function correctAttendanceRecord(id: number, actor: number, input: {
  checkTime?: string; notes: string; reason: string; excuse?: string;
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const initial = await client.query("SELECT employee_id FROM attendance_records WHERE id=$1", [id]);
    if (!initial.rowCount) throw Object.assign(new Error("السجل غير موجود"),{status:404});
    // Same employee lock as portal; serialize leave creation across different records.
    await client.query("SELECT pg_advisory_xact_lock(51701,$1)", [initial.rows[0].employee_id || 0]);
    const before = (await client.query("SELECT *,check_time AT TIME ZONE 'UTC' AS check_time FROM attendance_records WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (input.excuse === "medical_excuse" && !(await client.query(
      `SELECT id FROM attendance_medical_attachments WHERE record_id=$1
        UNION ALL SELECT id FROM hr_medical_documents WHERE record_id=$1 AND employee_id=$2 AND kind='attendance' LIMIT 1`,
      [id,before.employee_id])).rowCount)
      throw Object.assign(new Error("التقرير الطبي مطلوب قبل اعتماد العذر"),{status:400});
    const changed = await client.query(`UPDATE attendance_records SET
      check_time=COALESCE($2::timestamptz AT TIME ZONE 'UTC',check_time),
      notes=$3,is_manual_edit=true,edited_by=$4,
      override_excuse=COALESCE($5,override_excuse),override_note=CASE WHEN $5 IS NULL THEN override_note ELSE $3 END,
      override_by=CASE WHEN $5 IS NULL THEN override_by ELSE $4 END,
      override_at=CASE WHEN $5 IS NULL THEN override_at ELSE now() AT TIME ZONE 'UTC' END
      WHERE id=$1 RETURNING *`, [id,input.checkTime || null,input.notes,actor,input.excuse || null]);
    const after = changed.rows[0];
    await client.query(`INSERT INTO attendance_audit_log
      (record_id,employee_id,action,excuse_type,old_value,new_value,reason,edited_by)
      VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8)`,
    [id,before.employee_id,input.excuse ? "admin_override" : "manual_edit",input.excuse || null,
      JSON.stringify(before),JSON.stringify(after),input.reason,actor]);
    if (before.employee_id && ["medical_excuse","emergency_leave"].includes(input.excuse || "")) {
      const day = riyadhDateKey(new Date(before.check_time));
      await client.query(`INSERT INTO leave_requests
        (employee_id,leave_type,start_date,end_date,days,reason,status,approved_by,approved_date)
        SELECT $1,$2,$3,$3,1,$4,'approved',$5,$6
        WHERE NOT EXISTS (SELECT 1 FROM leave_requests WHERE employee_id=$1
          AND status::text NOT IN ('rejected','cancelled') AND start_date<=$3::date AND end_date>=$3::date)`,
      [before.employee_id,input.excuse === "medical_excuse" ? "sick" : "emergency",day,input.notes,actor,riyadhDateKey(new Date())]);
    }
    await client.query("COMMIT");
    return { id, success: true };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

// Existing violation table is the durable idempotency key, not a second attendance ledger.
export async function recordAttendanceViolation(employeeId: number, day: string, shift: string, type: string, attemptedType = "check_out") {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(`INSERT INTO attendance_violations
      (employee_id,employee_name_ar,violation_type,attempted_type,details,business_day,shift_key)
      SELECT id,full_name_ar,$4,$6,$5,$2,$3 FROM employees WHERE id=$1
      ON CONFLICT (employee_id,business_day,shift_key,violation_type)
      WHERE business_day IS NOT NULL AND shift_key IS NOT NULL DO NOTHING RETURNING id`,
    [employeeId, day, shift, type, `${day} / ${shift}: ${type}`, attemptedType]);
    if (inserted.rowCount) {
      // Durable notification insertion in the same transaction as the deduplication key.
      await client.query(`INSERT INTO notifications
        (user_id,title_ar,title_en,message_ar,message_en,type,related_entity,related_id)
        SELECT DISTINCT u.id,'تنبيه حضور','Attendance exception',$2,$2,'warning'::notification_type,'employee',$1::integer
        FROM users u WHERE u.active=true AND
        (u.role IN ('owner','hr') OR u.id IN (
          SELECT user_id FROM employees WHERE id=$1 OR id=(SELECT manager_id FROM employees WHERE id=$1)
        ))`, [employeeId, `${day} / ${shift}: ${type === "missing_checkin" ? "نقص دخول" : type === "out_of_zone" ? "محاولة خارج النطاق" : "نقص خروج"}`]);
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function employeeAttendanceReport(employeeId: number, from: string, to: string, now = new Date(),
  context?: { employee: Employee; settings: WorkScheduleLike[]; policies: WeekPolicy[] }) {
  const employee = context?.employee ?? await storage.getEmployee(employeeId);
  if (!employee) throw new Error("الموظف غير موجود");
  const settings = context?.settings ?? await attendanceSchedules();
  const currentShifts = resolveAttendanceShifts(settings, employee);
  const result = await pool.query(`SELECT id,type,check_time AT TIME ZONE 'UTC' AS "checkTime",shift_key AS "shiftKey",
    is_manual_edit AS "isManualEdit",location_name AS "locationName",is_out_of_zone AS "isOutOfZone"
    FROM attendance_records WHERE ${activeMovementSql()} AND employee_id=$1 AND check_time >= $2::timestamptz AT TIME ZONE 'UTC'
    AND check_time <= $3::timestamptz AT TIME ZONE 'UTC' ORDER BY check_time,id`,
  [employeeId, riyadhDayBounds(from).from, riyadhDayBounds(to).to]);
  const rows = [];
  const savedSchedules = new Map<string,import("../shared/attendance").AttendanceShift[]>(
    (await pool.query("SELECT business_day,shifts FROM attendance_day_schedules WHERE employee_id=$1 AND business_day BETWEEN $2 AND $3",
    [employeeId,from,to])).rows.map(r => [r.business_day,r.shifts]));
  const savedDays = new Set(savedSchedules.keys());
  const leaves = (await storage.getLeaveRequests(employeeId)).filter(l => l.status === "approved");
  const violations = await pool.query(`SELECT business_day,shift_key,violation_type FROM attendance_violations
    WHERE employee_id=$1 AND business_day BETWEEN $2 AND $3`, [employeeId,from,to]);
  const corrections = await attendanceCorrections(employeeId,from,to);
  const policies=context?.policies ?? await weekPolicies();
  const calendars=new Map<string,{workingDay:boolean;source:string;policyId:number|null}>(
    (await pool.query(`SELECT business_day,working_day AS "workingDay",source,policy_id AS "policyId"
      FROM attendance_day_calendars WHERE employee_id=$1 AND business_day BETWEEN $2 AND $3`,
    [employeeId,from,to])).rows.map(r=>[r.business_day,r]));
  for (let time = +new Date(riyadhDayBounds(from).from); time <= +new Date(riyadhDayBounds(to).to); time += 86400000) {
    const day = riyadhDateKey(new Date(time));
    const shifts = savedSchedules.get(day) ?? (day===riyadhDateKey(new Date())
      ? await scheduledShiftsForDay(settings,employee,day) : currentShifts);
    const calendar=await calendarForDay(employeeId,day,pool,policies,calendars);
    for (const shift of shifts) {
      // Legacy unassigned records are safe only for a single shift; never guess morning/evening.
      const events = result.rows.filter(r => riyadhDateKey(new Date(r.checkTime)) === day &&
        (r.shiftKey === shift.id || (!r.shiftKey && shifts.length === 1)));
      const state = shiftAttendanceStatus(day, shift, events, now);
      const attempts = violations.rows.filter(v => v.business_day === day && v.shift_key === shift.id);
      const leave = leaves.some(l => l.startDate <= day && l.endDate >= day);
      const rest=calendar.workingDay===false||(!calendar.verified&&legacyRestDay(day));
      let status = events.length ? (rest?"present":state.status) : day < (employee.hireDate || employee.contractStart) ? "not_started"
        : leave ? "approved_leave" : rest ? "rest_day"
        : attempts.some(v => v.violation_type === "missing_checkin") ? "missing_checkin" : state.status;
      const scheduleVerified = calendar.verified && completeShiftEvidence(shifts) &&
        (savedDays.has(day) || day === riyadhDateKey(new Date()));
      const operationalStatus = state.checkIn
        ? (state.checkOut ? "completed" : "working")
        : status === "approved_leave" || status === "not_started" || status === "rest_day" ? status
        : scheduleVerified ? (state.ended ? "absent" :
          now.getTime() < +new Date(`${day}T${shift.start}:00+03:00`) ? "future" : "pending") : "unknown";
      if (!scheduleVerified && !["not_started","approved_leave","rest_day"].includes(status)) status="unverified_schedule";
      const correction=corrections.find(c=>c.businessDay===day&&c.shiftKey===shift.id);
      rows.push(applyAttendanceCorrection({ day, shiftId: shift.id, shiftLabel: shift.label, ...state, status, operationalStatus,
        // Use documented shift timing when available, separately from weekday verification.
        periodEnded: (scheduleVerified || (savedDays.has(day) && completeShiftEvidence(shifts)))
          ? state.ended : day < riyadhDateKey(now),
        // Current settings cannot establish historical schedule-dependent facts.
        late: scheduleVerified ? (rest?false:state.late) : null,
        lateMinutes: scheduleVerified ? (rest?0:state.lateMinutes) : null,
        earlyDepartureMinutes: scheduleVerified ? (rest?0:state.earlyDepartureMinutes) : null,
        ended: scheduleVerified ? state.ended : null,
        recordId: events[0]?.id ?? null,
        recordIds: events.map(event=>event.id),
        scheduleVerified,
        workingDay:calendar.workingDay,calendarVerified:calendar.verified,calendarSource:calendar.source,
        locationNames: Array.from(new Set(events.map(r => r.locationName).filter(Boolean))),
        outOfZone: events.some(r => r.isOutOfZone) || attempts.some(v => v.violation_type === "out_of_zone") },correction));
    }
  }
  return { employeeId, employeeName: employee.fullNameAr, from, to, rows,
    configurationWarnings: [
      ...(rows.some(r=>!r.calendarVerified)?["أيام العمل والراحة غير معتمدة لبعض الأيام. راجع إعدادات الدوام؛ لا تُحتسب مخالفات تلقائية لهذه الأيام."]:[]),
      ...(currentShifts.some(s => !s.end) ? ["لم يُضبط وقت نهاية الدوام؛ لا يُحتسب نقص الخروج أو الغياب حتى ضبطه."] : []),
      ...((await pool.query(`SELECT 1 FROM generate_series($2::date,$3::date,'1 day') d
        WHERE d::date< (now() AT TIME ZONE 'Asia/Riyadh')::date AND NOT EXISTS(
          SELECT 1 FROM attendance_day_schedules WHERE employee_id=$1 AND business_day=to_char(d,'YYYY-MM-DD')) LIMIT 1`,
      [employeeId,from,to])).rowCount ? ["أيام تاريخية بلا نسخة معتمدة من جدولها: لا تُعتمد حالة الحضور أو دقائق التأخير دون مراجعة HR."] : []),
    ],
    unassignedLegacyRecords: currentShifts.length > 1 ? result.rows.filter(r => !r.shiftKey).length : 0 };
}

/** Retry-safe worker. Host should invoke every five minutes; reports also reconcile explicitly. */
export async function reconcileAttendance(day = riyadhDateKey(new Date())) {
  if (!validDate(day) || day > riyadhDateKey(new Date())) throw new Error("Invalid reconciliation date");
  for (const employee of await storage.getEmployees()) {
    if (employee.status !== "active" || !employee.attendanceEnabled) continue;
    const report = await employeeAttendanceReport(employee.id, day, day);
    for (const row of report.rows) if (row.scheduleVerified && row.status === "missing_checkout")
      await recordAttendanceViolation(employee.id, day, row.shiftId, "missing_checkout");
  }
}

export function registerAttendanceSupport(app: Express, authorize: RequestHandler) {
  registerWorkweek(app,authorize);
  registerHrCorrections(app,authorize);
  registerHrMedicalDocuments(app, authorize);
  app.get("/api/attendance/shift-monitor", authorize, async (req, res) => {
    const from = String(req.query.from || riyadhDateKey(new Date()));
    const to = String(req.query.to || from);
    if (!validDate(from) || !validDate(to) || from > to || Date.parse(to) - Date.parse(from) > 366 * 86400000)
      return res.status(400).json({ message: "اختر فترة صحيحة لا تتجاوز سنة." });
    try {
      const [allEmployees,zones,settings,policies]=await Promise.all([
        storage.getEmployees(),storage.getLocationZones(),attendanceSchedules(),weekPolicies(),
      ]);
      const employees=allEmployees.filter(e=>e.attendanceEnabled&&e.status==="active"),now=new Date();
      const rows = [];
      const warnings: string[] = [];
      for(let offset=0;offset<employees.length;offset+=4) {
        const group=employees.slice(offset,offset+4);
        const reports=await Promise.all(group.map(employee=>employeeAttendanceReport(employee.id,from,to,now,{employee,settings,policies})));
        for(let i=0;i<group.length;i++){
        const employee=group[i],report=reports[i];
        for (const row of report.rows) rows.push({ ...row, employeeId: employee.id,
          employeeName: employee.fullNameAr || employee.employeeNumber, department: employee.department,
          employeeNumber:employee.employeeNumber,
          homeLocation: zones.find(z=>z.id===employee.attendanceZoneId)?.nameAr || employee.fingerprintLocation || employee.fingerScanLocation || "غير محدد" });
        if (report.configurationWarnings.length) warnings.push(`${report.employeeName}: ${report.configurationWarnings.join(" ")}`);
        if (report.unassignedLegacyRecords) warnings.push(`${report.employeeName}: ${report.unassignedLegacyRecords} حركة تاريخية تحتاج نسبة لوردية.`);
        }
      }
      res.json({ rows, warnings });
    } catch { res.status(500).json({ message: "تعذّر تحميل مراقبة الورديات." }); }
  });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
  app.post("/api/attendance/record/:id/medical-attachment", authorize, medicalDocumentRole, (req, res, next) => {
    upload.single("file")(req, res, error => error ? res.status(400).json({ message: "ملف واحد فقط، بحد أقصى 5 ميغابايت." }) : next());
  }, async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ message: "التقرير الطبي مطلوب." });
    const png = file.buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpeg = file.buffer[0] === 255 && file.buffer[1] === 216 && file.buffer[2] === 255;
    const pdf = file.buffer.subarray(0, 5).toString() === "%PDF-";
    const mime = pdf ? "application/pdf" : png ? "image/png" : jpeg ? "image/jpeg" : "";
    if (!mime || mime !== file.mimetype) return res.status(400).json({ message: "يسمح فقط بملف PDF أو صورة PNG/JPEG أصلية." });
    try {
      const record = await storage.getAttendanceRecord(Number(req.params.id));
      if (!record) return res.status(404).json({ message: "السجل غير موجود." });
      const key = randomUUID();
      await saveObjectFile("hr-medical-private",key,file.buffer,mime);
      let result;
      try {
        result = await pool.query(`INSERT INTO attendance_medical_attachments(record_id,uploaded_by,mime_type,object_key)
          VALUES($1,$2,$3,$4) RETURNING id`, [record.id, (req as any).user.id, mime, key]);
      } catch(error) { await deleteObjectFile("hr-medical-private",key); throw error; }
      res.status(201).json({ id: result.rows[0].id });
    } catch { res.status(500).json({ message: "تعذّر حفظ التقرير الطبي." }); }
  });
  app.get("/api/attendance/medical-attachments/:id", authorize, medicalDocumentRole, async (req, res) => {
    try {
      const result = await pool.query("SELECT mime_type,content,object_key FROM attendance_medical_attachments WHERE id=$1", [Number(req.params.id)]);
      const file = result.rows[0];
      if (!file) return res.status(404).json({ message: "المرفق غير موجود." });
      res.set({ "Content-Type": file.mime_type, "Content-Disposition": 'attachment; filename="medical-report"',
        "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" });
      if (file.object_key) {
        if(!await streamObjectFile("hr-medical-private",file.object_key,res,{
          contentType:file.mime_type,disposition:'attachment; filename="medical-report"',
        })) res.status(404).json({message:"المرفق غير موجود."});
      } else res.send(file.content);
    } catch { res.status(500).json({ message: "تعذّر قراءة التقرير الطبي." }); }
  });
  app.get("/api/attendance/employees/:employeeId/report", authorize, async (req, res) => {
    try {
      const id = Number(req.params.employeeId);
      const from = String(req.query.from || riyadhDateKey(new Date()));
      const to = String(req.query.to || from);
      if (!Number.isSafeInteger(id) || id <= 0 || !validDate(from) || !validDate(to) || from > to ||
        Date.parse(to) - Date.parse(from) > 366 * 86400000) return res.status(400).json({ message: "اختر موظفًا وفترة صحيحة لا تتجاوز سنة." });
      res.json(await employeeAttendanceReport(id, from, to));
    } catch { res.status(500).json({ message: "تعذّر إعداد تقرير الحضور." }); }
  });
  app.get("/api/attendance/period-report", authorize, async (req, res) => {
    const from = typeof req.query.from === "string" ? req.query.from : "";
    const to = typeof req.query.to === "string" ? req.query.to : "";
    const employeeId = req.query.employeeId === undefined ? undefined : Number(req.query.employeeId);
    if (!validDate(from) || !validDate(to) || from > to || Date.parse(to) - Date.parse(from) >= 366 * 86400000
      || (employeeId !== undefined && (!Number.isSafeInteger(employeeId) || employeeId <= 0))) {
      return res.status(400).json({ message: "اختر فترة صحيحة لا تتجاوز 366 يومًا شاملة البداية والنهاية.", messageEn: "Choose a valid range of at most 366 days inclusive." });
    }
    try {
      const allEmployees = await storage.getEmployees();
      const selected = employeeId === undefined ? allEmployees : allEmployees.filter(e => e.id === employeeId);
      if (employeeId !== undefined && !selected.length)
        return res.status(404).json({ message: "الموظف غير موجود.", messageEn: "Employee not found." });
      const rows: (AttendanceReportRow & {employeeId:number;employeeNumber:string;employeeNameAr:string;employeeNameEn:string|null})[] = [];
      const warnings = new Set<string>();
      const [settings, policies] = await Promise.all([attendanceSchedules(), weekPolicies()]);
      const now = new Date();
      // At most four employees in flight; leave pool capacity for live attendance.
      for (let offset = 0; offset < selected.length; offset += 4) {
        const batch = await Promise.all(selected.slice(offset, offset + 4).map(async employee => {
          const report = await employeeAttendanceReport(employee.id, from, to, now, { employee, settings, policies });
          return { employee, report };
        }));
        for (const { employee, report } of batch) {
          report.configurationWarnings.forEach(w => warnings.add(w));
          rows.push(...report.rows.map(row => ({ ...row, employeeId: employee.id,
            employeeNumber: employee.employeeNumber, employeeNameAr: employee.fullNameAr || employee.employeeNumber,
            employeeNameEn: employee.fullNameEn })));
        }
      }
      // Keep every original punch, even when an old shift key no longer has a schedule.
      const raw = await pool.query(`SELECT id,employee_id,type,check_time AT TIME ZONE 'UTC' AS time,
        is_manual_edit,is_out_of_zone FROM attendance_records WHERE ${activeMovementSql()} AND employee_id=ANY($1::integer[])
        AND check_time >= $2::timestamptz AT TIME ZONE 'UTC' AND check_time <= $3::timestamptz AT TIME ZONE 'UTC'
        ORDER BY check_time,id`, [selected.map(e => e.id), riyadhDayBounds(from).from, riyadhDayBounds(to).to]);
      const represented = new Set(rows.flatMap(row => row.recordIds || []));
      for (const event of raw.rows) {
        if (represented.has(event.id)) continue;
        const employee = selected.find(e => e.id === event.employee_id)!;
        rows.push({ employeeId: employee.id, employeeNumber: employee.employeeNumber,
          employeeNameAr: employee.fullNameAr || employee.employeeNumber, employeeNameEn: employee.fullNameEn,
          day: riyadhDateKey(new Date(event.time)), shiftId: `unassigned-${event.id}`,
          shiftLabel: "حركة غير مرتبطة بجدول موثق", status: "unverified_schedule",
          checkIn: event.type === "check_in" ? event.time : null,
          checkOut: event.type === "check_out" ? event.time : null,
          scheduleVerified: false, calendarVerified: false, late: null, lateMinutes: null,
          earlyDepartureMinutes: null, adminOverride: event.is_manual_edit, outOfZone: event.is_out_of_zone,
          recordId: event.id, recordIds: [event.id] });
        warnings.add("يشمل التقرير حركات قديمة غير مرتبطة بجدول؛ لم تُحذف ولم تُحسب لها مخالفات تقديرية.");
      }
      rows.sort((a, b) => a.employeeNumber.localeCompare(b.employeeNumber, "en", { numeric: true }) || a.day.localeCompare(b.day));
      res.set("Cache-Control", "private, no-store").json({ rows, warnings: Array.from(warnings) });
    } catch (error) {
      console.error("Attendance period report failed", error instanceof Error ? error.message : "unknown");
      res.status(500).json({ message: "تعذّر إعداد التقرير الكامل؛ لم يتم إرجاع نتيجة جزئية.", messageEn: "Could not prepare the complete report; no partial result was returned." });
    }
  });
  app.get("/api/attendance/shift-settings", authorize, async (_req, res) => {
    try { res.json(await attendanceSchedules()); }
    catch { res.status(500).json({ message: "تعذّر تحميل الورديات." }); }
  });
  app.put("/api/attendance/work-settings/:id/shifts", authorize, async (req, res) => {
    const schema = z.array(z.object({ id: z.string(), label: z.string(), start: z.string(), end: z.string(), graceMinutes: z.number() }).strict());
    const parsed = schema.safeParse(req.body.shifts);
    if (!parsed.success || !validateShifts(parsed.data)) return res.status(400).json({ message: "حدد وردية أو ورديتين بلا تداخل. الدوام العابر لمنتصف الليل يحتاج سياسة معتمدة." });
    try {
      const result = await saveAttendanceSchedule(Number(req.params.id), {
        shifts: parsed.data, workStartTime: parsed.data[0].start,
        workEndTime: parsed.data[0].end, graceMinutes: parsed.data[0].graceMinutes,
      }, req.session.userId!);
      if (!result) return res.status(404).json({ message: "إعداد الدوام غير موجود." });
      res.json({ success: true });
    } catch { res.status(500).json({ message: "تعذّر حفظ الورديات." }); }
  });
}
