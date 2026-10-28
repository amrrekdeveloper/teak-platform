import type { Express, RequestHandler, Request } from "express";
import { z } from "zod";
import { storage } from "./storage";
import { pool } from "./db";
import { explicitAccess, administrationSystems, isUserWorkspaceApi } from "../shared/account-access";
import { hasHrAccess } from "../shared/account-access";
import type { User } from "../shared/schema";
import { isDesignatedSystemAdmin } from "./system-admin";
import { hasManagerAssignment } from "./hr-access";
import { tokenHash } from "./employee-portal/security";
import { isValidHrPassword, HR_PASSWORD_MESSAGE } from "../shared/hr-password-policy";

export async function accountAuthority(user: User | undefined, executor?: any) {
  if (!user?.active || user.archived) return { isOwner: false, delegatedSystems: [] as string[], canManageAccounts: false };
  const isOwner = executor ? user.role === "owner" &&
    !!(await executor.query("SELECT 1 FROM teak_system_admin WHERE singleton=true AND user_id=$1 FOR SHARE", [user.id])).rowCount
    : await isDesignatedSystemAdmin(user);
  const delegatedSystems = isOwner ? ["hr", "warehouse", "purchasing"] : administrationSystems(user);
  return { isOwner, delegatedSystems, canManageAccounts: isOwner || delegatedSystems.length > 0 };
}
export type UserWorkspace = "hr" | "warehouse" | "purchasing" | "accounts" | "manager";
export async function workspaceIdentity(user: User) {
  const authority = await accountAuthority(user);
  const policy = explicitAccess(user);
  const permissions = {
    hr: authority.isOwner || hasHrAccess(user),
    warehouse: authority.isOwner || (policy ? policy.warehouse !== "none" : ["owner", "assistant", "warehouse", "it"].includes(user.role)),
    purchasing: authority.isOwner || (policy ? policy.purchasing !== "none" : ["owner", "assistant", "purchasing", "it"].includes(user.role)),
    accounts: authority.canManageAccounts,
    manager: await hasManagerAssignment(user.id),
  };
  const entries = [
    { id: "hr", titleAr: "الموارد البشرية", titleEn: "Human resources", path: "/hr/overview" },
    { id: "warehouse", titleAr: "المستودعات", titleEn: "Warehouses", path: "/dashboard/warehouses" },
    { id: "purchasing", titleAr: "المشتريات", titleEn: "Purchasing", path: "/dashboard/purchases" },
    { id: "accounts", titleAr: "المستخدمون والصلاحيات", titleEn: "Users & access", path: "/system-admin" },
    { id: "manager", titleAr: "فريق العمل والموافقات", titleEn: "Team & approvals", path: "/manager-portal" },
  ] as const;
  return { id: user.id, username: user.username, fullNameAr: user.fullNameAr, fullNameEn: user.fullNameEn,
    ...authority, workspaces: entries.filter(entry => permissions[entry.id]) };
}
export function activateWorkspace(req: Request, workspace: UserWorkspace | null) {
  req.session.hrWorkspace = workspace === "hr";
  req.session.warehouseWorkspace = workspace === "warehouse" || workspace === "purchasing";
  req.session.systemAdminWorkspace = workspace === "accounts";
  req.session.managerWorkspace = workspace === "manager";
  req.session.activeWorkspace = workspace;
}
function sameOrigin(req: Request) {
  try { return !req.get("Origin") || new URL(req.get("Origin")!).host === req.get("host"); } catch { return false; }
}
/** Reuses administrative sessions, with a current-password stamp and no parallel identity store. */
export const enforceUserWorkspace: RequestHandler = async (req, res, next) => {
  if (!req.path.startsWith("/api/") || req.path.startsWith("/api/employee-portal/")) return next();
  const control = isUserWorkspaceApi(req.method, req.path);
  if (!req.session.userWorkspace && !req.session.credentialStamp && !control) return next();
  if (req.method === "POST" && !sameOrigin(req)) return res.status(403).json({ message: "مصدر الطلب غير مسموح." });
  if (req.method === "POST" && req.path === "/api/user-access/login") return next();
  if (!req.session.userId || !req.session.adminAuthenticated) return res.status(401).json({ message: "سجّل دخول المستخدمين أولًا." });
  try {
    const user = await storage.getUser(req.session.userId);
    if (!user?.active || user.archived || (req.session.credentialStamp && req.session.credentialStamp !== tokenHash(user.password))) {
      req.session.destroy(() => {});
      res.clearCookie("connect.sid");
      return res.status(401).json({ message: "انتهت صلاحية الجلسة؛ سجّل الدخول مجددًا." });
    }
    res.locals.authenticatedWorkspaceUser = user;
    if (control || ["/api/auth/me", "/api/auth/logout"].includes(req.path)) return next();
    if (req.session.userWorkspace && !req.session.hrWorkspace && !req.session.warehouseWorkspace && !req.session.systemAdminWorkspace && !req.session.managerWorkspace)
      return res.status(403).json({ message: "اختر أحد الأنظمة المصرّح لك بها من لوحة أنظمتي." });
    next();
  } catch { res.status(500).json({ message: "تعذر التحقق من جلسة المستخدم." }); }
};
export function registerUserWorkspace(app: Express, tools: { hashPassword(p: string): Promise<string>; comparePasswords(p: string, h: string): Promise<boolean>;
  takeLimit(key: string, limit: number, seconds: number): Promise<boolean> }) {
  app.get("/api/user-access/me", async (req, res) => {
    try {
      const user = res.locals.authenticatedWorkspaceUser as User;
      const identity = await workspaceIdentity(user);
      // Existing authenticated HR/warehouse/owner bookmarks may enter the shared dashboard.
      req.session.userWorkspace = true;
      req.session.credentialStamp = tokenHash(user.password);
      res.json({ ...identity, activeWorkspace: req.session.activeWorkspace ??
        (req.session.hrWorkspace ? "hr" : req.session.systemAdminWorkspace ? "accounts" : req.session.warehouseWorkspace ? "warehouse" : req.session.managerWorkspace ? "manager" : null) });
    } catch { res.status(500).json({ message: "تعذر تحميل أنظمتك." }); }
  });
  app.post("/api/user-access/workspace", async (req, res) => {
    try {
      const identity = await workspaceIdentity(res.locals.authenticatedWorkspaceUser);
      const destination = identity.workspaces.find(entry => entry.id === req.body?.workspace);
      if (!destination) return res.status(403).json({ message: "ليس لديك صلاحية لهذا النظام." });
      req.session.userWorkspace = true;
      req.session.credentialStamp = tokenHash(res.locals.authenticatedWorkspaceUser.password);
      activateWorkspace(req, destination.id);
      await new Promise<void>((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
      res.json({ redirectTo: destination.path });
    } catch { res.status(500).json({ message: "تعذر الانتقال إلى النظام." }); }
  });
  app.post("/api/user-access/password", async (req, res) => {
    if (!await tools.takeLimit(`user-password-change:${req.session.userId}`, 5, 900))
      return res.status(429).json({ message: "محاولات متكررة؛ حاول بعد 15 دقيقة." });
    const parsed = z.object({ currentPassword: z.string().min(1).max(256),
      newPassword: z.string().max(256).refine(isValidHrPassword, HR_PASSWORD_MESSAGE) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: HR_PASSWORD_MESSAGE });
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      const user = (await client.query("SELECT password,active,archived FROM users WHERE id=$1 FOR UPDATE", [req.session.userId])).rows[0];
      if (!user?.active || user.archived || !await tools.comparePasswords(parsed.data.currentPassword, user.password)) {
        await client.query("ROLLBACK"); return res.status(403).json({ message: "كلمة المرور الحالية غير صحيحة." });
      }
      await client.query("UPDATE users SET password=$2 WHERE id=$1", [req.session.userId, await tools.hashPassword(parsed.data.newPassword)]);
      await client.query("DELETE FROM user_sessions WHERE sess->>'userId'=$1", [String(req.session.userId)]);
      await client.query("INSERT INTO teak_system_admin_audit(actor_id,target_id,action) VALUES($1,$1,'change_own_password')", [req.session.userId]);
      await client.query("COMMIT");
      req.session.destroy(() => {});
      res.clearCookie("connect.sid"); res.json({ redirectTo: "/user-login" });
    } catch { await client?.query("ROLLBACK"); res.status(500).json({ message: "تعذر تغيير كلمة المرور." }); }
    finally { client?.release(); }
  });
}
