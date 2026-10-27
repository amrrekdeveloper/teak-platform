import type { Router } from "express";
import { z } from "zod";
import { employeeAttendanceReport } from "../attendance-support";
import { attendanceCorrections } from "../attendance-corrections";
import { pool } from "../db";
import { storage } from "../storage";
import { captureLeaveForm } from "../hr-leave-form";
import { leaveFormInputSchema } from "../../shared/hr-leave-form";
import { asyncRoute, identity, portalError } from "./router";
import { employeePhone, publicEmployee, takeLimit, type PortalEmployee } from "./database";
import { permittedZone, riyadhDay, validDate } from "./security";
import { annualEntitlementAt, annualUsage } from "../hr-workflow-support";
import { attendanceSchedules, recordAttendanceViolation } from "../attendance-support";
import { activeMovementSql } from "../attendance-movement-state";
import { riyadhMinutesOfDay } from "../../shared/attendance";
import { scheduledShiftsForDay } from "../attendance-schedule-history";
import { calendarForDay, weekPolicies } from "../attendance-workweek";
import { resolveWeekPolicy } from "../../shared/attendance-workweek";
import { selectPunchShift, EARLY_CHECKIN_MINUTES } from "../../shared/attendance-shift-selection";

const dateInput = z.string().refine(validDate, "التاريخ غير صالح");
const reasonInput = z.string().trim().min(3).max(1000);
const leaveInput = z.object({
  leaveType: z.enum(["annual", "sick", "unpaid", "emergency", "maternity", "other"]),
  startDate: dateInput, endDate: dateInput, reason: reasonInput,
  leaveFormData: leaveFormInputSchema.optional(),
  medicalAttachmentId: z.number().int().positive().optional(),
}).strict();
const permissionInput = z.object({
  type: z.enum(["leave", "permission", "sick", "official", "remote", "late_arrival", "early_departure"]),
  date: dateInput,
  returnDate: dateInput,
  period: z.enum(["morning","evening"]),
  purpose: z.enum(["work","personal","emergency"]),
  notes: z.string().trim().max(2000).optional(),
  acknowledged: z.literal(true),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  reason: reasonInput,
}).strict();
const attendanceInput = z.object({
  type: z.enum(["check_in", "check_out"]),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().positive(),
  locationTimestamp: z.number().finite(),
  shiftId: z.string().max(30).optional(),
  requestId: z.string().uuid().optional(),
}).strict();

async function leaveBalance(employee: PortalEmployee) {
  const year = riyadhDay().slice(0, 4);
  const entitlement = annualEntitlementAt(employee.contract_start, riyadhDay());
  const used = annualUsage(await storage.getLeaveRequests(employee.id), Number(year));
  return { entitlement, used, remaining: Math.max(0, entitlement - used), year };
}
async function notifyApprovers(employee: PortalEmployee, kind: "leave" | "permission", requestId: number) {
  try {
    const manager = employee.manager_id ? await storage.getEmployee(employee.manager_id) : undefined;
    const users = await storage.getUsers();
    const ids = manager?.userId
      ? [manager.userId]
      : users.filter(u => u.active && ["owner", "hr"].includes(u.role)).map(u => u.id);
    for (const userId of ids) {
      await storage.createNotification({
        userId,
        titleAr: kind === "leave" ? "طلب إجازة جديد" : "طلب استئذان جديد",
        titleEn: kind === "leave" ? "New leave request" : "New permission request",
        messageAr: `${employee.full_name_ar} قدّم طلبًا عبر الخدمة الذاتية.`,
        messageEn: "Employee submitted a self-service request.",
        type: "info", relatedEntity: kind === "leave" ? "leave_request" : "attendance_permission",
        relatedId: requestId,
      });
    }
  } catch {
    // The request remains in existing HR queues even if notification fails.
    console.warn("Employee portal: approver notification could not be delivered");
  }
}

export function registerEmployeeServices(router: Router) {
  router.get("/summary", asyncRoute(async (_req, res) => {
    const { employee, sessionId } = identity(res);
    const [records, leaves, permissions, balance, devices] = await Promise.all([
      storage.getAttendanceRecords({ employeeId: employee.id, from: new Date(Date.now() - 90 * 86400000).toISOString() }),
      storage.getLeaveRequests(employee.id),
      storage.getAttendancePermissions({ employeeId: employee.id }),
      leaveBalance(employee),
      pool.query(`SELECT id,device_name AS "deviceName",created_at AS "createdAt",
        last_seen_at AS "lastSeenAt",expires_at AS "expiresAt"
        FROM employee_portal_devices WHERE employee_id=$1 AND revoked_at IS NULL
        AND expires_at>now() ORDER BY created_at DESC`, [employee.id]),
    ]);
    res.json({
      employee: publicEmployee(employee), balance,
      attendanceLocationMode: employee.attendanceLocationMode ?? "assigned",
      earlyCheckinMinutes: EARLY_CHECKIN_MINUTES,
      workweek:{...resolveWeekPolicy(await weekPolicies(),employee.id,riyadhDay()),
        todayCalendar:await calendarForDay(employee.id,riyadhDay())},
      assignedZones: (await storage.getLocationZones()).filter(z=>z.isActive&&z.id===employee.attendanceZoneId)
        .map(z=>({id:z.id,nameAr:z.nameAr,radiusMeters:z.radiusMeters})),
      attendanceReport: await employeeAttendanceReport(employee.id,riyadhDay(new Date(Date.now()-29*86400000)),riyadhDay()),
      corrections: await attendanceCorrections(employee.id),
      shifts: await scheduledShiftsForDay(await attendanceSchedules(), employee),
      records: records.slice(0, 180).map(r => ({ id: r.id, type: r.type, checkTime: r.checkTime, locationName: r.locationName })),
      leaves: leaves.map(r => ({
        id: r.id, leaveType: r.leaveType, startDate: r.startDate, endDate: r.endDate,
        days: r.days, status: r.status, reason: r.reason,
      })),
      permissions: permissions.map(r => ({
        id: r.id, type: r.type, date: r.date, startTime: r.startTime, endTime: r.endTime,
        returnDate: r.formDetails?.returnDate || r.date,
        status: r.status, reason: r.reason, hoursRequested: r.hoursRequested,
      })),
      sessions: devices.rows.map(d => ({ ...d, current: d.id === sessionId })),
      requestHistory: (await pool.query(`SELECT kind,request_id AS "requestId",decision,previous_status AS "previousStatus",
        next_status AS "nextStatus",note,created_at AS "createdAt" FROM hr_request_history
        WHERE employee_id=$1 ORDER BY id DESC LIMIT 100`, [employee.id])).rows,
    });
  }));

  router.post("/requests/:kind/:id/clarification", asyncRoute(async (req, res) => {
    const { employee } = identity(res);
    const kind = req.params.kind;
    if (!["leave","permission"].includes(String(kind))) portalError(400, "نوع طلب غير صالح.");
    const input = z.object({note:z.string().trim().min(3).max(2000)}).strict().parse(req.body);
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) portalError(400, "طلب غير صالح.");
    const table = kind === "leave" ? "leave_requests" : "attendance_permissions";
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const {rows:[row]} = await client.query(`SELECT id,status FROM ${table} WHERE id=$1 AND employee_id=$2 FOR UPDATE`, [id,employee.id]);
      if (!row) portalError(404, "الطلب غير موجود.");
      if (row.status !== "clarification_requested") portalError(409, "لا يوجد توضيح مطلوب لهذا الطلب.");
      const managerApproved = (await client.query(`SELECT 1 FROM hr_request_history WHERE kind=$1 AND request_id=$2
        AND next_status='manager_approved' LIMIT 1`, [kind,id])).rowCount;
      const status = managerApproved ? "manager_approved" : "pending";
      await client.query(`UPDATE ${table} SET status=$2 WHERE id=$1`, [id,status]);
      await client.query(`INSERT INTO hr_request_history(kind,request_id,employee_id,actor_employee_id,decision,previous_status,next_status,note)
        VALUES($1,$2,$3,$3,'clarification_response','clarification_requested',$4,$5)`, [kind,id,employee.id,status,input.note]);
      await client.query("COMMIT");
      res.json({success:true,message:"تم إرسال التوضيح للمراجعة."});
    } catch(error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }));

  router.post("/attendance", asyncRoute(async (req, res) => {
    const { employee, sessionId } = identity(res);
    if (!employee.attendance_enabled) portalError(403, "الحضور غير مفعّل لك. راجع الموارد البشرية.");
    const parsed = attendanceInput.safeParse(req.body);
    if (!parsed.success) portalError(400, "تعذّر قراءة بيانات الموقع. أعد تحديد موقع الجوال ثم حاول مجددًا.");
    const input = parsed.data!;
    if(input.accuracy>50)portalError(400,`دقة موقع الجوال الحالية نحو ${Math.ceil(input.accuracy)} متر، والمطلوب 50 متر أو أقل. اسمح باستخدام «الموقع الدقيق» ثم أعد المحاولة.`);
    const now = Date.now();
    if (now - input.locationTimestamp > 90000 || input.locationTimestamp - now > 10000)
      portalError(400, "قراءة الموقع قديمة أو غير قابلة للتحقق. حدّث وقت الجهاز وأعد تحديد الموقع.");
    const unrestricted = employee.attendanceLocationMode === "unrestricted";
    if (!unrestricted && !employee.attendanceZoneId) portalError(403, "لم يحدد موقع بصمتك. راجع الموارد البشرية لتحديد موقع البصمة أو تصريح العمل خارج المقر.");
    const shifts = await scheduledShiftsForDay(await attendanceSchedules(), employee);
    const minute = riyadhMinutesOfDay(new Date(now));
    const shift = selectPunchShift(shifts, minute, input.type, input.shiftId);
    if (!shift) portalError(400, "لا توجد فترة متاحة الآن. يُسمح بالحضور قبل بداية كل فترة بساعة؛ تحقق من فترات دوامك أو راجع الموارد البشرية.");
    if (!await takeLimit(`attendance:${employee.id}`, 20, 900))
      portalError(429, "محاولات متكررة. انتظر قليلًا ثم أعد المحاولة.");
    const zones = await storage.getLocationZones();
    const zone = permittedZone(zones.filter(z=>z.id===employee.attendanceZoneId), { lat: input.latitude, lng: input.longitude }, input.accuracy);
    if (!zone && !unrestricted) {
      await recordAttendanceViolation(employee.id, riyadhDay(new Date(now)), shift!.id, "out_of_zone", input.type);
      portalError(403, "أنت خارج نطاق الحضور المسموح أو دقة الموقع غير كافية. انتقل إلى مقر العمل وأعد المحاولة.");
    }
    const client = await pool.connect();
    let record;
    try {
      await client.query("BEGIN");
      // One transition at a time for this employee across all portal devices.
      await client.query("SELECT pg_advisory_xact_lock(51701,$1)", [employee.id]);
      if (input.requestId) {
        const replay = (await client.query(`SELECT id,type,check_time AT TIME ZONE 'UTC' AS "checkTime",
          location_name AS "locationName",${activeMovementSql()} AS active FROM attendance_records
          WHERE employee_id=$1 AND device_info->>'requestId'=$2 ORDER BY id DESC LIMIT 1`,
        [employee.id, input.requestId])).rows[0];
        if (replay) {
          if (replay.type !== input.type || !replay.active)
            portalError(409, "تغيرت حالة هذه الحركة. حدّث سجل الحضور قبل المحاولة.");
          await client.query("COMMIT");
          return res.json({ record: replay, replayed: true, message: "هذه الحركة مسجلة بالفعل؛ لم تسجل بصمة إضافية." });
        }
      }
      const day = riyadhDay(new Date(now));
      const { rows } = await client.query(`SELECT type,check_time AT TIME ZONE 'UTC' AS check_time FROM attendance_records
        WHERE ${activeMovementSql()} AND employee_id=$1 AND check_time>=($2::timestamptz AT TIME ZONE 'UTC')
        AND check_time<($2::timestamptz AT TIME ZONE 'UTC') + interval '1 day'
        AND (shift_key=$3 OR (shift_key IS NULL AND $4))
        ORDER BY check_time DESC,id DESC LIMIT 1`, [employee.id, `${day}T00:00:00+03:00`, shift!.id, shifts.length === 1]);
      const last = rows[0];
      if (input.type === "check_out" && last?.type === "check_out")
        portalError(409, "انصرافك مسجل بالفعل لهذه الوردية.");
      if (input.type === "check_out" && (!last || last.type !== "check_in")) {
        await recordAttendanceViolation(employee.id, day, shift!.id, "missing_checkin");
        portalError(409, "لا يمكن تسجيل الانصراف دون حضور سابق مطابق اليوم.");
      }
      if (input.type === "check_in" && last?.type === "check_out")
        portalError(409, "اكتملت حركة هذه الوردية. راجع الموارد البشرية لأي تصحيح.");
      if (input.type === "check_in" && last?.type === "check_in")
        portalError(409, "حضورك مسجل بالفعل. سجّل الانصراف أولًا.");
      if (last && now - new Date(last.check_time).getTime() < 60000)
        portalError(409, "تم تسجيل حركة للتو. انتظر دقيقة قبل الحركة التالية.");
      const inserted = await client.query(`INSERT INTO attendance_records
        (employee_id,employee_phone,employee_name_ar,type,check_time,location_name,
         latitude,longitude,is_out_of_zone,device_info,device_fingerprint,is_manual_edit,shift_key)
        VALUES ($1,$2,$3,$4,now() AT TIME ZONE 'UTC',$5,$6,$7,false,$8,$9,false,$10)
        RETURNING id,type,check_time AT TIME ZONE 'UTC' AS "checkTime",location_name AS "locationName"`,
      [employee.id, employeePhone(employee), employee.full_name_ar, input.type, unrestricted ? "عمل خارج المقر — مصرح" : zone!.nameAr,
        input.latitude, input.longitude,
        JSON.stringify({ source: "employee-self-service", accuracyMeters: input.accuracy, requestId: input.requestId,
          locationMode: unrestricted ? "unrestricted" : "assigned" }),
        `employee-device:${sessionId}`, shift!.id]);
      record = inserted.rows[0];
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
    res.status(201).json({ record, message: input.type === "check_in" ? "تم تسجيل حضورك بنجاح." : "تم تسجيل انصرافك بنجاح." });
  }));

  router.post("/leaves", asyncRoute(async (req, res) => {
    const { employee } = identity(res);
    const input = leaveInput.parse(req.body);
    if (input.endDate < input.startDate || input.startDate < riyadhDay())
      portalError(400, "اختر فترة إجازة صحيحة تبدأ من اليوم أو بعده.");
    const days = Math.round((Date.parse(input.endDate) - Date.parse(input.startDate)) / 86400000) + 1;
    if (days > 366) portalError(400, "مدة الإجازة طويلة جدًا. راجع الموارد البشرية.");
    if (!await takeLimit(`leave:${employee.id}`, 10, 900)) portalError(429, "طلبات متكررة. حاول لاحقًا.");
    // Reuse existing HR records and their manager/HR decision endpoints.
    if (input.leaveType === "sick" && !input.medicalAttachmentId)
      portalError(400, "التقرير الطبي مطلوب للإجازة المرضية.");
    const form = await captureLeaveForm(employee.id, input.leaveFormData, { kind: "employee", employeeId: employee.id }, input.startDate);
    const client = await pool.connect();
    let created: {id: number};
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(51701,$1)", [employee.id]);
      if ((await client.query(`SELECT id FROM leave_requests WHERE employee_id=$1
        AND status::text NOT IN ('rejected','cancelled') AND start_date<=$3 AND end_date>=$2 LIMIT 1`,
      [employee.id, input.startDate, input.endDate])).rowCount) portalError(409, "يوجد طلب إجازة يتداخل مع الفترة المختارة.");
      if (input.medicalAttachmentId && !(await client.query(`SELECT id FROM hr_medical_documents
        WHERE id=$1 AND employee_id=$2 AND kind='leave' AND leave_id IS NULL FOR UPDATE`,
      [input.medicalAttachmentId, employee.id])).rowCount) portalError(400, "المرفق غير صالح أو مرتبط بطلب آخر.");
      created = (await client.query(`INSERT INTO leave_requests(employee_id,leave_type,start_date,end_date,days,reason,status,leave_form_data)
        VALUES($1,$2,$3,$4,$5,$6,'pending',$7) RETURNING id`,
      [employee.id,input.leaveType,input.startDate,input.endDate,days,input.reason,JSON.stringify(form)])).rows[0];
      if (input.medicalAttachmentId) await client.query("UPDATE hr_medical_documents SET leave_id=$2 WHERE id=$1", [input.medicalAttachmentId,created.id]);
      await client.query("COMMIT");
    } catch(error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    await notifyApprovers(employee, "leave", created.id);
    res.status(201).json({ success: true, id: created.id, message: "تم إرسال طلب الإجازة للاعتماد." });
  }));

  router.post("/permissions", asyncRoute(async (req, res) => {
    const { employee, sessionId } = identity(res);
    const input = permissionInput.parse(req.body);
    const start = Date.parse(`${input.date}T${input.startTime}:00+03:00`);
    const end = Date.parse(`${input.returnDate}T${input.endTime}:00+03:00`);
    if (end <= start || input.date < riyadhDay())
      portalError(400, "اختر تاريخًا وفترة استئذان صحيحين.");
    if ((end-start)/3600000 > 99.99)
      portalError(400,"مدة الطلب تتجاوز الحد المتاح للاستئذان (أقل من 100 ساعة). راجع الموارد البشرية للمدد الأطول.");
    if (!await takeLimit(`permission:${employee.id}`, 10, 900)) portalError(429, "طلبات متكررة. حاول لاحقًا.");
    const legacy = input.type === "late_arrival" || input.type === "early_departure";
    const label = input.type === "late_arrival" ? "تأخر عن الحضور" : "انصراف مبكر";
    const profile = await storage.getEmployee(employee.id);
    const formDetails = {
      employeeName:profile?.fullNameAr,employeeNumber:profile?.employeeNumber,position:profile?.position,department:profile?.department,
      departureDate:input.date,returnDate:input.returnDate,period:input.period,purpose:input.purpose,notes:input.notes || "",
      type:input.type,reason:input.reason,startTime:input.startTime,endTime:input.endTime,hoursRequested:((end-start)/3600000).toFixed(2),
      acknowledgedAt:new Date().toISOString(),sessionId,mechanism:"ordinary-electronic-acknowledgment",
    };
    const client = await pool.connect();
    let created;
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(51703,$1)",[employee.id]);
      const overlap = await client.query(`SELECT 1 FROM attendance_permissions
        WHERE employee_id=$1 AND status NOT IN ('rejected')
        AND (date::text || 'T' || start_time)::timestamp < $3::timestamp
        AND (COALESCE(form_details->>'returnDate',date::text) || 'T' || end_time)::timestamp > $2::timestamp LIMIT 1`,
        [employee.id,`${input.date}T${input.startTime}`,`${input.returnDate}T${input.endTime}`]);
      if (overlap.rowCount) portalError(409, "يوجد طلب استئذان يتداخل مع الفترة المختارة.");
      created = (await client.query(`INSERT INTO attendance_permissions
        (employee_id,employee_phone,date,type,start_time,end_time,hours_requested,reason,status,form_details)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9) RETURNING id`,
        [employee.id,employeePhone(employee),input.date,legacy ? "permission" : input.type,input.startTime,input.endTime,
          ((end-start)/3600000).toFixed(2),legacy ? `${label}: ${input.reason}` : input.reason,JSON.stringify(formDetails)])).rows[0];
      await client.query("COMMIT");
    } catch(e) { await client.query("ROLLBACK"); throw e; }
    finally { client.release(); }
    await notifyApprovers(employee, "permission", created.id);
    res.status(201).json({ success: true, id:created.id, message: "تم إرسال طلب الاستئذان للاعتماد." });
  }));
}
