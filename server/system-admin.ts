import type { Express, RequestHandler } from "express";
import { z } from "zod";
import { pool } from "./db";
import { isProtectedOwner } from "../shared/permissions";
import { registerUserAdministration } from "./user-administration";
import { accountAuthority } from "./user-workspace";
import { HR_PASSWORD_MESSAGE,isValidHrPassword } from "../shared/hr-password-policy";
import { takeLimit } from "./employee-portal/database";

type PasswordTools = {
  hashPassword: (password: string) => Promise<string>;
  comparePasswords: (password: string, hash: string) => Promise<boolean>;
};

const username = z.string().trim().regex(/^[a-zA-Z0-9._-]{3,80}$/);
const password = z.string().min(12).max(256);
const hrPassword=z.string().refine(isValidHrPassword,{message:HR_PASSWORD_MESSAGE});
const name = z.string().trim().min(1).max(120);
const createSchema = z.object({
  username, password:hrPassword, fullNameAr: name, fullNameEn: name.optional(),
}).strict();
const editSchema = z.object({
  fullNameAr: name.optional(), fullNameEn: name.optional(),
  active: z.boolean().optional(), password: hrPassword.optional(),
}).strict().refine(value => Object.keys(value).length > 0);
const ownPasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: hrPassword,
}).strict();

// A durable one-time binding, NOT a recurring password/role reset. Only the
// application reads these secrets; credentials are never returned or logged.
export async function initializeSystemAdmin(tools: PasswordTools) {
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false");
  await pool.query(`CREATE TABLE IF NOT EXISTS teak_system_admin (
    singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
    user_id integer NOT NULL UNIQUE REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS teak_system_admin_audit (
    id bigserial PRIMARY KEY, actor_id integer NOT NULL REFERENCES users(id),
    target_id integer NOT NULL REFERENCES users(id), action text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  const configuredUsername = process.env.TEAK_SYSTEM_ADMIN_USERNAME;
  const configuredPassword = process.env.TEAK_SYSTEM_ADMIN_PASSWORD;
  if (!configuredUsername || !configuredPassword) return "not_configured";
  if (!username.safeParse(configuredUsername).success || !password.safeParse(configuredPassword).success)
    return "invalid_configuration";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(610281940)");
    const bound = await client.query("SELECT user_id FROM teak_system_admin WHERE singleton=true");
    if (bound.rowCount) { await client.query("COMMIT"); return "already_configured"; }
    const existing = await client.query("SELECT id,role,active,archived,password FROM users WHERE username=$1 FOR UPDATE", [configuredUsername.trim()]);
    let id: number;
    if (existing.rowCount) {
      const account = existing.rows[0];
      if (account.role !== "owner" || !account.active || account.archived ||
          !await tools.comparePasswords(configuredPassword, account.password)) {
        await client.query("ROLLBACK");
        return "username_conflict";
      }
      id = account.id;
    } else {
      const hash = await tools.hashPassword(configuredPassword);
      const inserted = await client.query(`INSERT INTO users(username,password,role,full_name_ar,full_name_en,active,archived)
        VALUES($1,$2,'owner','مدير النظام','System administrator',true,false) RETURNING id`, [configuredUsername.trim(), hash]);
      id = inserted.rows[0].id;
    }
    await client.query("INSERT INTO teak_system_admin(singleton,user_id) VALUES(true,$1)", [id]);
    await client.query("COMMIT");
    return "configured";
  } catch {
    await client.query("ROLLBACK");
    // Never log database errors/parameters from provisioning credentials.
    return "configuration_failed";
  } finally { client.release(); }
}

export async function isDesignatedSystemAdmin(user: { id: number; role: string; active: boolean; archived?: boolean } | undefined) {
  if (!user || user.role !== "owner" || !user.active || user.archived) return false;
  const result = await pool.query("SELECT 1 FROM teak_system_admin WHERE singleton=true AND user_id=$1", [user.id]);
  return result.rowCount === 1;
}

const publicAccount = (row: any) => ({
  id: row.id, username: row.username, fullNameAr: row.full_name_ar,
  fullNameEn: row.full_name_en, active: row.active, createdAt: row.created_at,
});

export function registerSystemAdminRoutes(app: Express, tools: PasswordTools) {
  // Scope middleware already validates this session and re-reads its owner.
  // Defense in depth here keeps the endpoints secure if maintenance is removed.
  const requireOwner: RequestHandler = async (req, res, next) => {
    if (!req.session.systemAdminWorkspace || !req.session.adminAuthenticated || !req.session.userId)
      return res.status(401).json({ message: "سجّل الدخول من مدخل مدير النظام." });
    const { rows } = await pool.query("SELECT id,role,active,archived FROM users WHERE id=$1", [req.session.userId]);
    if (!await isDesignatedSystemAdmin(rows[0]))
      return res.status(403).json({ message: "هذا الإجراء متاح لمدير النظام المعتمد فقط." });
    next();
  };
  const requireAccountAdmin: RequestHandler = async (req, res, next) => {
    if (!req.session.systemAdminWorkspace || !req.session.adminAuthenticated || !req.session.userId)
      return res.status(401).json({ message: "سجّل الدخول إلى إدارة المستخدمين." });
    try {
      const user = res.locals.authenticatedWorkspaceUser || (await pool.query('SELECT id,role,active,archived,access_policy AS "accessPolicy" FROM users WHERE id=$1', [req.session.userId])).rows[0];
      const authority = await accountAuthority(user);
      if (!authority.canManageAccounts) return res.status(403).json({ message: "إدارة المستخدمين تتطلب تفويضًا صريحًا من المالك." });
      res.locals.accountAuthority = authority;
      next();
    } catch { res.status(500).json({ message: "تعذر التحقق من صلاحية إدارة المستخدمين." }); }
  };
  app.get("/api/system-admin/me", requireAccountAdmin, async (req, res) => {
    const { rows: [user] } = await pool.query("SELECT id,username,full_name_ar FROM users WHERE id=$1", [req.session.userId]);
    res.json({ id: user.id, username: user.username, fullNameAr: user.full_name_ar, maintenanceScope: "system-admin",
      ...res.locals.accountAuthority, userWorkspace: !!req.session.userWorkspace });
  });
  registerUserAdministration(app, requireAccountAdmin, tools);
  app.post("/api/system-admin/logout", requireAccountAdmin, (req, res) => {
    req.session.destroy(error => {
      if (error) return res.status(500).json({ message: "تعذّر تسجيل الخروج. حاول مجددًا." });
      res.clearCookie("connect.sid");
      res.json({ message: "تم تسجيل الخروج." });
    });
  });
  app.post("/api/system-admin/password", requireOwner, async (req, res) => {
    const input = ownPasswordSchema.safeParse(req.body);
    if (!input.success)
      return res.status(400).json({ message: "أدخل كلمة المرور الحالية. الجديدة: " + HR_PASSWORD_MESSAGE });
    const ownerId = req.session.userId;
    let client;
    try {
      if (!await takeLimit(`system-admin-password:${ownerId}`, 8, 900))
        return res.status(429).json({ message: "محاولات متكررة. حاول تغيير كلمة المرور بعد 15 دقيقة." });
      client = await pool.connect();
      await client.query("BEGIN");
      // Lock and revalidate the designated actor; no client-supplied account ID.
      const { rows: [owner] } = await client.query(`SELECT u.id,u.password,u.role,u.active,u.archived
        FROM teak_system_admin a JOIN users u ON u.id=a.user_id
        WHERE a.singleton=true AND u.id=$1 FOR UPDATE OF a,u`, [ownerId]);
      if (!owner || owner.role !== "owner" || !owner.active || owner.archived) {
        await client.query("ROLLBACK");
        return res.status(403).json({ message: "هذا الإجراء متاح لمدير النظام المعتمد فقط." });
      }
      if (!await tools.comparePasswords(input.data.currentPassword, owner.password)) {
        await client.query("ROLLBACK");
        return res.status(403).json({ message: "كلمة المرور الحالية غير صحيحة." });
      }
      const hash = await tools.hashPassword(input.data.newPassword);
      const changed = await client.query(`UPDATE users SET password=$2
        WHERE id=$1 AND role='owner' AND active=true AND archived=false RETURNING id`, [ownerId, hash]);
      if (changed.rowCount !== 1) throw new Error("Owner changed");
      await client.query("DELETE FROM user_sessions WHERE sess->>'userId'=$1", [String(ownerId)]);
      await client.query("INSERT INTO teak_system_admin_audit(actor_id,target_id,action) VALUES($1,$1,'change_own_password')", [ownerId]);
      await client.query("COMMIT");
    } catch {
      try { await client?.query("ROLLBACK"); } catch { /* Never expose credentials or SQL parameters. */ }
      return res.status(500).json({ message: "تعذّر تأكيد تغيير كلمة المرور. أعد تسجيل الدخول إذا انتهت جلستك." });
    } finally {
      client?.release();
    }
    // All persisted sessions were deleted in the same transaction as the hash.
    // Destroy this request's session too, so response middleware cannot re-save it.
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ message: "تم تغيير كلمة المرور. سجّل الدخول بالكلمة الجديدة.", reloginRequired: true });
    });
  });
  app.get("/api/system-admin/hr-accounts", requireOwner, async (_req, res) => {
    const { rows } = await pool.query("SELECT id,username,full_name_ar,full_name_en,active,created_at FROM users WHERE role='hr' AND archived=false ORDER BY id");
    res.json(rows.map(publicAccount));
  });
  app.post("/api/system-admin/hr-accounts", requireOwner, async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "أدخل الاسم واسم مستخدم صحيحًا (3–80 حرفًا إنجليزيًا أو رقمًا أو . _ -). كلمة المرور: "+HR_PASSWORD_MESSAGE });
    const data = parsed.data;
    const client = await pool.connect();
    try {
      const hash = await tools.hashPassword(data.password);
      await client.query("BEGIN");
      const { rows: [created] } = await client.query(`INSERT INTO users(username,password,role,full_name_ar,full_name_en,active,archived)
        VALUES($1,$2,'hr',$3,$4,true,false) RETURNING id,username,full_name_ar,full_name_en,active,created_at`,
      [data.username, hash, data.fullNameAr, data.fullNameEn || data.fullNameAr]);
      await client.query("INSERT INTO teak_system_admin_audit(actor_id,target_id,action) VALUES($1,$2,'create_hr')", [req.session.userId, created.id]);
      await client.query("COMMIT");
      res.status(201).json(publicAccount(created));
    } catch (error: any) {
      await client.query("ROLLBACK");
      res.status(error.code === "23505" ? 409 : 500).json({ message: error.code === "23505" ? "اسم المستخدم مستخدم بالفعل؛ اختر اسمًا آخر." : "تعذّر إنشاء حساب الموارد البشرية." });
    } finally { client.release(); }
  });
  app.patch("/api/system-admin/hr-accounts/:id", requireOwner, async (req, res) => {
    const id = Number(req.params.id);
    const parsed = editSchema.safeParse(req.body);
    if (!Number.isSafeInteger(id) || id <= 0 || !parsed.success)
      return res.status(400).json({ message: "بيانات غير صالحة. كلمة المرور: "+HR_PASSWORD_MESSAGE });
    const data = parsed.data;
    const client = await pool.connect();
    try {
      const hash = data.password ? await tools.hashPassword(data.password) : null;
      await client.query("BEGIN");
      const { rows: [target] } = await client.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [id]);
      if (!target || target.role !== "hr" || target.archived || isProtectedOwner(target)) {
        await client.query("ROLLBACK");
        return res.status(403).json({ message: "يمكن إدارة حسابات الموارد البشرية فقط؛ حسابات المالكين والأدوار الأخرى محمية." });
      }
      const { rows: [updated] } = await client.query(`UPDATE users SET
        full_name_ar=coalesce($2,full_name_ar),full_name_en=coalesce($3,full_name_en),
        active=coalesce($4,active),password=coalesce($5,password)
        WHERE id=$1 AND role='hr' RETURNING id,username,full_name_ar,full_name_en,active,created_at`,
      [id, data.fullNameAr ?? null, data.fullNameEn ?? null, data.active ?? null, hash]);
      if (hash || data.active === false)
        await client.query("DELETE FROM user_sessions WHERE sess->>'userId'=$1", [String(id)]);
      await client.query("INSERT INTO teak_system_admin_audit(actor_id,target_id,action) VALUES($1,$2,$3)",
        [req.session.userId, id, hash ? "reset_hr_password" : data.active === false ? "disable_hr" : "update_hr"]);
      await client.query("COMMIT");
      res.json(publicAccount(updated));
    } catch {
      await client.query("ROLLBACK");
      res.status(500).json({ message: "تعذّر تحديث حساب الموارد البشرية." });
    } finally { client.release(); }
  });
}
