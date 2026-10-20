import type { Router } from "express";
import { z } from "zod";
import { pool } from "../db";
import { storage } from "../storage";
import { asyncRoute, identity, portalError } from "./router";
import { employeePhone, publicEmployee, takeLimit, type PortalEmployee } from "./database";
import { permittedZone, riyadhDay, validDate } from "./security";

const dateInput = z.string().refine(validDate, "التاريخ غير صالح");
const reasonInput = z.string().trim().min(3).max(1000);
const leaveInput = z.object({
  leaveType: z.enum(["annual", "sick", "unpaid", "emergency", "maternity", "other"]),
  startDate: dateInput, endDate: dateInput, reason: reasonInput,
}).strict();
const permissionInput = z.object({
  type: z.enum(["late_arrival", "early_departure"]),
  date: dateInput,
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  reason: reasonInput,
}).strict();
const attendanceInput = z.object({
  type: z.enum(["check_in", "check_out"]),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().positive().max(50),
  locationTimestamp: z.number().finite(),
}).strict();

async function leaveBalance(employee: PortalEmployee) {
  const year = riyadhDay().slice(0, 4);
  const years = (Date.now() - new Date(employee.contract_start).getTime()) / (365.25 * 86400000);
  const entitlement = years >= 5 ? 30 : 21;
  const used = await storage.getApprovedAnnualLeaveDays(employee.id, year);
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
      records: records.slice(0, 180).map(r => ({ id: r.id, type: r.type, checkTime: r.checkTime, locationName: r.locationName })),
      leaves: leaves.slice(0, 100).map(r => ({
        id: r.id, leaveType: r.leaveType, startDate: r.startDate, endDate: r.endDate,
        days: r.days, status: r.status, reason: r.reason,
      })),
      permissions: permissions.slice(0, 100).map(r => ({
        id: r.id, type: r.type, date: r.date, startTime: r.startTime, endTime: r.endTime,
        status: r.status, reason: r.reason,
      })),
      sessions: devices.rows.map(d => ({ ...d, current: d.id === sessionId })),
    });
  }));

  router.post("/attendance", asyncRoute(async (req, res) => {
    const { employee, sessionId } = identity(res);
    if (!employee.attendance_enabled) portalError(403, "الحضور غير مفعّل لك. راجع الموارد البشرية.");
    const parsed = attendanceInput.safeParse(req.body);
    if (!parsed.success) portalError(400, "تعذّر التحقق من موقع دقيق. فعّل GPS واسمح بالموقع ثم أعد المحاولة.");
    const input = parsed.data!;
    const now = Date.now();
    if (now - input.locationTimestamp > 90000 || input.locationTimestamp - now > 10000)
      portalError(400, "قراءة الموقع قديمة أو غير قابلة للتحقق. حدّث وقت الجهاز وأعد تحديد الموقع.");
    if (!await takeLimit(`attendance:${employee.id}`, 20, 900))
      portalError(429, "محاولات متكررة. انتظر قليلًا ثم أعد المحاولة.");
    const zones = await storage.getLocationZones();
    const zone = permittedZone(zones, { lat: input.latitude, lng: input.longitude }, input.accuracy);
    if (!zone) portalError(403, "أنت خارج نطاق الحضور المسموح أو دقة الموقع غير كافية. انتقل إلى مقر العمل وأعد المحاولة.");
    const client = await pool.connect();
    let record;
    try {
      await client.query("BEGIN");
      // One transition at a time for this employee across all portal devices.
      await client.query("SELECT pg_advisory_xact_lock(51701,$1)", [employee.id]);
      const day = riyadhDay(new Date(now));
      const { rows } = await client.query(`SELECT type,check_time FROM attendance_records
        WHERE employee_id=$1 AND check_time>=($2::timestamptz AT TIME ZONE 'UTC')
        ORDER BY check_time DESC,id DESC LIMIT 1`, [employee.id, `${day}T00:00:00+03:00`]);
      const last = rows[0];
      if (input.type === "check_out" && (!last || last.type !== "check_in"))
        portalError(409, "لا يمكن تسجيل الانصراف دون حضور سابق مطابق اليوم.");
      if (input.type === "check_in" && last?.type === "check_in")
        portalError(409, "حضورك مسجل بالفعل. سجّل الانصراف أولًا.");
      if (last && now - new Date(last.check_time).getTime() < 60000)
        portalError(409, "تم تسجيل حركة للتو. انتظر دقيقة قبل الحركة التالية.");
      const inserted = await client.query(`INSERT INTO attendance_records
        (employee_id,employee_phone,employee_name_ar,type,check_time,location_name,
         latitude,longitude,is_out_of_zone,device_info,device_fingerprint,is_manual_edit)
        VALUES ($1,$2,$3,$4,now() AT TIME ZONE 'UTC',$5,$6,$7,false,$8,$9,false)
        RETURNING id,type,check_time AS "checkTime",location_name AS "locationName"`,
      [employee.id, employeePhone(employee), employee.full_name_ar, input.type, zone.nameAr,
        input.latitude, input.longitude,
        JSON.stringify({ source: "employee-self-service", accuracyMeters: input.accuracy }),
        `employee-device:${sessionId}`]);
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
    const existing = await storage.getLeaveRequests(employee.id);
    if (existing.some(r => !["rejected", "cancelled"].includes(r.status) &&
      r.startDate <= input.endDate && r.endDate >= input.startDate))
      portalError(409, "يوجد طلب إجازة يتداخل مع الفترة المختارة.");
    const created = await storage.createLeaveRequest({
      employeeId: employee.id, ...input, days, status: "pending",
    });
    await notifyApprovers(employee, "leave", created.id);
    res.status(201).json({ success: true, message: "تم إرسال طلب الإجازة للاعتماد." });
  }));

  router.post("/permissions", asyncRoute(async (req, res) => {
    const { employee } = identity(res);
    const input = permissionInput.parse(req.body);
    if (input.endTime <= input.startTime || input.date < riyadhDay())
      portalError(400, "اختر تاريخًا وفترة استئذان صحيحين.");
    if (!await takeLimit(`permission:${employee.id}`, 10, 900)) portalError(429, "طلبات متكررة. حاول لاحقًا.");
    const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    const existing = await storage.getAttendancePermissions({ employeeId: employee.id, date: input.date });
    if (existing.some(r => !["rejected", "cancelled"].includes(r.status) &&
      r.startTime && r.endTime && r.startTime < input.endTime && r.endTime > input.startTime))
      portalError(409, "يوجد طلب استئذان يتداخل مع الفترة المختارة.");
    const label = input.type === "late_arrival" ? "تأخر عن الحضور" : "انصراف مبكر";
    const created = await storage.createAttendancePermission({
      employeeId: employee.id, employeePhone: employeePhone(employee),
      date: input.date, type: "permission", startTime: input.startTime, endTime: input.endTime,
      hoursRequested: String((toMinutes(input.endTime) - toMinutes(input.startTime)) / 60),
      reason: `${label}: ${input.reason}`, status: "pending", reviewedBy: null,
    });
    await notifyApprovers(employee, "permission", created.id);
    res.status(201).json({ success: true, message: "تم إرسال طلب الاستئذان للاعتماد." });
  }));
}
