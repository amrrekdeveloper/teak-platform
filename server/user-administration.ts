import type { Express, RequestHandler } from "express";
import { z } from "zod";
import { pool } from "./db";
import { accountAccessSchema } from "../shared/account-access";
import { isValidHrPassword, HR_PASSWORD_MESSAGE } from "../shared/hr-password-policy";
import { isProtectedOwner } from "../shared/permissions";

const username = z.string().trim().min(3).max(80).regex(/^[a-zA-Z0-9._-]+$/);
const name = z.string().trim().min(1).max(150);
const create = z.object({
  username, fullNameAr: name, fullNameEn: name.optional(),
  password: z.string().refine(isValidHrPassword, HR_PASSWORD_MESSAGE),
  employeeId: z.number().int().positive().nullable().optional(),
  accessPolicy: accountAccessSchema,
}).strict();
const edit = create.omit({ password: true }).partial().extend({
  password: z.string().refine(isValidHrPassword, HR_PASSWORD_MESSAGE).optional(),
  active: z.boolean().optional(),
  expectedVersion: z.string().regex(/^\d+$/),
}).strict();
const accountSelect = `SELECT u.id,u.username,u.full_name_ar AS "fullNameAr",u.full_name_en AS "fullNameEn",
  u.role,u.active,u.created_at AS "createdAt",u.access_policy AS "accessPolicy",u.xmin::text AS version,
  COALESCE((SELECT json_agg(json_build_object('id',e.id,'employeeNumber',e.employee_number,
    'fullNameAr',e.full_name_ar,'fullNameEn',e.full_name_en,'status',e.status)) FROM employees e WHERE e.user_id=u.id),'[]') AS employees
  FROM users u WHERE u.archived=false`;

async function linkUnassignedEmployee(client: any, userId: number, employeeId?: number | null) {
  if (employeeId === undefined) return false;
  // User rows are already locked by the caller. Existing identity links must not
  // be moved here: that could move an employee's PIN/portal identity to another person.
  const existing = (await client.query("SELECT id FROM employees WHERE user_id=$1 ORDER BY id", [userId])).rows;
  if (existing.length && (existing.length !== 1 || existing[0].id !== employeeId))
    throw Object.assign(new Error("الارتباط الحالي محفوظ؛ لا يمكن نقل حساب موظف أو فكه من هذه الشاشة."), { status: 409 });
  if (employeeId == null || existing.length) return false;
  const target = (await client.query("SELECT id,user_id,status FROM employees WHERE id=$1 FOR UPDATE", [employeeId])).rows[0];
  if (!target || target.status !== "active")
    throw Object.assign(new Error("اختر موظفًا حاليًا نشطًا."), { status: 400 });
  if (target.user_id != null && target.user_id !== userId)
    throw Object.assign(new Error("هذا الموظف مرتبط بحساب بالفعل؛ عدّل حسابه الحالي بدل إنشاء ارتباط آخر."), { status: 409 });
  await client.query("UPDATE employees SET user_id=$2 WHERE id=$1", [employeeId, userId]);
  return true;
}
export function registerUserAdministration(app: Express, requireOwner: RequestHandler, tools: { hashPassword(p: string): Promise<string> }) {
  // The former ERP user editor must not remain an alternate IT/HR escalation path.
  app.use((req, res, next) => {
    if (!["GET", "HEAD"].includes(req.method) &&
      (/^\/api\/users(?:\/\d+(?:\/permissions)?)?$/.test(req.path) || /^\/api\/users\/reset-requests\/\d+\/resolve$/.test(req.path)))
      return res.status(403).json({ message: "إدارة الحسابات والصلاحيات متاحة للمالك فقط من شاشة المستخدمين." });
    next();
  });
  app.get("/api/system-admin/accounts", requireOwner, async (_req, res) => {
    try { res.json({ rows: (await pool.query(accountSelect + " ORDER BY u.created_at DESC,u.id DESC")).rows }); }
    catch { res.status(500).json({ message: "تعذر تحميل المستخدمين." }); }
  });
  app.get("/api/system-admin/employees", requireOwner, async (_req, res) => {
    try {
      res.json({ rows: (await pool.query(`SELECT id,employee_number AS "employeeNumber",full_name_ar AS "fullNameAr",
        full_name_en AS "fullNameEn",user_id AS "userId" FROM employees WHERE status='active' ORDER BY full_name_ar,id`)).rows });
    } catch { res.status(500).json({ message: "تعذر تحميل أسماء الموظفين." }); }
  });
  const save: RequestHandler = async (req, res) => {
    const creating = req.method === "POST";
    const parsed = creating ? create.safeParse(req.body) : edit.safeParse(req.body);
    const id = creating ? null : Number(req.params.id);
    if (!parsed.success || (!creating && (!Number.isSafeInteger(id) || Number(id) <= 0)))
      return res.status(400).json({ message: "راجع بيانات المستخدم والصلاحيات. كلمة المرور: " + HR_PASSWORD_MESSAGE });
    const data = parsed.data as z.infer<typeof create> & z.infer<typeof edit>;
    if (data.username && isProtectedOwner({ username: data.username }))
      return res.status(403).json({ message: "اسم المستخدم محجوز لحساب مالك محمي." });
    let client;
    try {
      const hash = data.password ? await tools.hashPassword(data.password) : null;
      client = await pool.connect();
      await client.query("BEGIN");
      const actor = (await client.query(`SELECT u.id FROM teak_system_admin a JOIN users u ON u.id=a.user_id
        WHERE a.singleton=true AND u.id=$1 AND u.active=true AND u.archived=false AND u.role='owner' FOR SHARE OF a,u`,
      [req.session.userId])).rows[0];
      if (!actor) throw Object.assign(new Error("انتهت صلاحية إدارة المستخدمين."), { status: 403 });
      if (data.username) {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["account-username:" + data.username.toLowerCase()]);
        const duplicate = await client.query("SELECT id FROM users WHERE lower(username)=lower($1) AND ($2::int IS NULL OR id<>$2)", [data.username, id]);
        if (duplicate.rowCount) throw Object.assign(new Error("اسم المستخدم مستخدم بالفعل، حتى مع اختلاف حالة الحروف."), { status: 409 });
      }
      let userId: number;
      let invalidateSessions = false;
      if (creating) {
        const role = data.accessPolicy.hr === "manage" ? "hr" : data.accessPolicy.warehouse !== "none" ? "warehouse"
          : data.accessPolicy.purchasing !== "none" ? "purchasing" : "customer";
        userId = (await client.query(`INSERT INTO users(username,password,full_name_ar,full_name_en,role,access_policy)
          VALUES($1,$2,$3,$4,$5,$6::jsonb) RETURNING id`,
        [data.username, hash, data.fullNameAr, data.fullNameEn || data.fullNameAr, role, JSON.stringify(data.accessPolicy)])).rows[0].id;
      } else {
        const target = (await client.query("SELECT *,xmin::text AS version FROM users WHERE id=$1 FOR UPDATE", [id])).rows[0];
        if (!target || target.archived) throw Object.assign(new Error("الحساب غير موجود."), { status: 404 });
        if (target.role === "owner" || isProtectedOwner(target) || target.id === req.session.userId)
          throw Object.assign(new Error("حسابات المالك محمية؛ تغيير كلمة مرور المالك من الإجراء المخصص فقط."), { status: 403 });
        if (target.version !== data.expectedVersion)
          throw Object.assign(new Error("تغير الحساب منذ فتحه؛ حدّث القائمة وافتحه من جديد."), { status: 409 });
        userId = target.id;
        invalidateSessions = !!hash || (data.username !== undefined && data.username !== target.username) ||
          (data.active !== undefined && data.active !== target.active) ||
          (!!data.accessPolicy && ["version", "hr", "warehouse", "purchasing"].some(
            key => (data.accessPolicy as any)[key] !== target.access_policy?.[key]));
        await client.query(`UPDATE users SET username=COALESCE($2,username),full_name_ar=COALESCE($3,full_name_ar),
          full_name_en=COALESCE($4,full_name_en),active=COALESCE($5,active),password=COALESCE($6,password),
          access_policy=COALESCE($7::jsonb,access_policy) WHERE id=$1`,
        [id, data.username ?? null, data.fullNameAr ?? null, data.fullNameEn ?? null, data.active ?? null, hash,
          data.accessPolicy ? JSON.stringify(data.accessPolicy) : null]);
      }
      const identityLinked = await linkUnassignedEmployee(client, userId, data.employeeId);
      if (!creating && (invalidateSessions || identityLinked))
        await client.query("DELETE FROM user_sessions WHERE sess->>'userId'=$1", [String(userId)]);
      await client.query("INSERT INTO teak_system_admin_audit(actor_id,target_id,action) VALUES($1,$2,$3)",
        [req.session.userId, userId, creating ? "create_user" : hash ? "reset_user_password" : data.accessPolicy ? "update_user_access" : "update_user"]);
      const row = (await client.query(accountSelect + " AND u.id=$1", [userId])).rows[0];
      await client.query("COMMIT");
      res.status(creating ? 201 : 200).json(row);
    } catch (error: any) {
      try { await client?.query("ROLLBACK"); } catch { /* No SQL or credentials in responses. */ }
      res.status(error.status || (error.code === "23505" ? 409 : 500)).json({
        message: error.status ? error.message : error.code === "23505" ? "اسم المستخدم مستخدم بالفعل." : "تعذر حفظ المستخدم؛ لم يتم اعتماد أي تغيير.",
      });
    } finally { client?.release(); }
  };
  app.post("/api/system-admin/accounts", requireOwner, save);
  app.patch("/api/system-admin/accounts/:id", requireOwner, save);
}
