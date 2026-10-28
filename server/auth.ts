import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import type { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";
import { storage } from "./storage";
import type { User } from "@shared/schema";
import { computeEffectivePermissions, isProtectedOwner } from "@shared/permissions";
import { HR_WORKSPACE_PERMISSIONS } from "../shared/hr-access";
import { enforceHrWorkspaceScope, hasManagerAssignment } from "./hr-access";
import { takeLimit } from "./employee-portal/database";
import { tokenHash } from "./employee-portal/security";
import { isDesignatedSystemAdmin, registerSystemAdminRoutes } from "./system-admin";
import { accountPermissionKeys, explicitAccess, hasHrAccess, hasWarehouseAccess, scopedAccount } from "../shared/account-access";
import { setLoginPersistence } from "./login-session";
import { enforceWarehouseWorkspaceScope } from "./warehouse-access";
import { WAREHOUSE_WORKSPACE_PERMISSIONS, WAREHOUSE_WORKSPACE_ROLES } from "../shared/warehouse-access";

const scryptAsync = promisify(scrypt);

export async function getEffectivePermissionsForUser(user: User): Promise<string[]> {
  const configured = accountPermissionKeys(user, HR_WORKSPACE_PERMISSIONS);
  if (configured) return configured;
  if (isProtectedOwner(user)) {
    return computeEffectivePermissions(user.role, [], true);
  }
  const exceptions = await storage.getUserPermissions(user.id);
  return computeEffectivePermissions(user.role, exceptions, false);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function comparePasswords(
  supplied: string,
  stored: string
): Promise<boolean> {
  const [hashedPassword, salt] = stored.split(".");
  const buf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(Buffer.from(hashedPassword, "hex"), buf);
}

declare module "express-session" {
  interface SessionData {
    userId: number;
    adminAuthenticated?: boolean;
    hrWorkspace?: boolean;
    managerWorkspace?: boolean;
    systemAdminWorkspace?: boolean;
    warehouseWorkspace?: boolean;
    rememberMe?: boolean;
  }
}

export function setupAuth(app: Express) {
  const PgSession = connectPgSimple(session);
  if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET is required");

  app.use(
    session({
      store: new PgSession({
        pool: pool,
        tableName: "user_sessions",
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      },
    })
  );
  app.use(enforceWarehouseWorkspaceScope);
  app.use(enforceHrWorkspaceScope);
  app.use(async (req, res, next) => {
    // Explicit workspace access must not fall back to an old unrestricted ERP session.
    if (!req.path.startsWith("/api/") || req.path.startsWith("/api/employee-portal/") ||
      !req.session.userId || req.session.hrWorkspace || req.session.warehouseWorkspace ||
      req.session.managerWorkspace || req.session.systemAdminWorkspace ||
      ["/api/auth/me", "/api/auth/logout", "/api/hr-access/login", "/api/warehouse-access/login",
        "/api/manager-access/login", "/api/system-admin/login"].includes(req.path)) return next();
    try {
      const user = await storage.getUser(req.session.userId);
      if (user && explicitAccess(user)) return res.status(403).json({ message: "استخدم مدخل البرنامج المصرّح لك: الموارد البشرية أو المستودعات." });
      next();
    } catch { res.status(500).json({ message: "تعذر التحقق من صلاحية الحساب." }); }
  });

  app.post(["/api/auth/login", "/api/hr-access/login", "/api/manager-access/login", "/api/system-admin/login", "/api/warehouse-access/login"], async (req: Request, res: Response) => {
    try {
      const hrLogin = req.path === "/api/hr-access/login";
      const managerLogin = req.path === "/api/manager-access/login";
      const systemAdminLogin = req.path === "/api/system-admin/login";
      const warehouseLogin = req.path === "/api/warehouse-access/login";
      const { username, password } = req.body;
      if (typeof username !== "string" || typeof password !== "string" ||
        !username.trim() || !password || username.length > 100 || password.length > 256) {
        return res.status(400).json({
          message: "اسم المستخدم وكلمة المرور مطلوبان",
          messageEn: "Username and password are required",
        });
      }
      if(req.body.rememberMe!==undefined&&typeof req.body.rememberMe!=="boolean")
        return res.status(400).json({message:"خيار تذكّر الدخول غير صالح."});
      if ((hrLogin || managerLogin || systemAdminLogin || warehouseLogin) && (!await takeLimit(`hr-login-ip:${tokenHash(req.ip || "unknown")}`, 30, 900) ||
        !await takeLimit(`hr-login-user:${tokenHash(username.trim().toLowerCase())}`, 10, 900)))
        return res.status(429).json({ message: "محاولات دخول متكررة. حاول بعد 15 دقيقة." });

      const user = await storage.getUserByUsername(username.trim());
      if (!user || !(await comparePasswords(password, user.password))) {
        return res.status(401).json({
          message: "اسم المستخدم أو كلمة المرور غير صحيحة",
          messageEn: "Invalid username or password",
        });
      }

      if (!user.active || user.archived) {
        return res.status(403).json({
          message: "الحساب معطل. يرجى التواصل مع المسؤول",
          messageEn: "Account is disabled. Please contact administrator",
        });
      }
      if (explicitAccess(user) && !hrLogin && !warehouseLogin && !managerLogin && !systemAdminLogin)
        return res.status(403).json({ message: "استخدم مدخل البرنامج المصرّح لك: الموارد البشرية أو المستودعات." });
      if (hrLogin && !hasHrAccess(user))
        return res.status(403).json({ message: "هذا المدخل مخصص لحسابات الموارد البشرية فقط." });
      if (managerLogin && !await hasManagerAssignment(user.id))
        return res.status(403).json({ message: "لا توجد علاقة مدير مباشر فعالة لهذا الحساب." });
      if (systemAdminLogin && !await isDesignatedSystemAdmin(user))
        return res.status(403).json({ message: "هذا المدخل مخصص لمدير النظام المعتمد فقط." });
      if (warehouseLogin && !hasWarehouseAccess(user))
        return res.status(403).json({ message: "هذا المدخل مخصص للمستودعات والمشتريات والإدارة." });

      // New session ID prevents fixation. Existing unmarked PIN-created
      // sessions must authenticate again using administrative credentials.
      await new Promise<void>((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
      req.session.userId = user.id;
      req.session.adminAuthenticated = true;
      req.session.hrWorkspace = hrLogin;
      req.session.managerWorkspace = managerLogin;
      req.session.systemAdminWorkspace = systemAdminLogin;
      req.session.warehouseWorkspace = warehouseLogin;
      setLoginPersistence(req.session,req.body.rememberMe===true);
      const { password: _, employeePin: _pin, financePin: _financePin, ...safeUser } = scopedAccount(user, hrLogin ? "hr" : warehouseLogin ? "warehouse" : undefined);
      const effective = await getEffectivePermissionsForUser(user);
      const permissions = (managerLogin || systemAdminLogin) ? [] : hrLogin ? HR_WORKSPACE_PERMISSIONS
        : warehouseLogin ? effective.filter(key => WAREHOUSE_WORKSPACE_PERMISSIONS.includes(key)) : effective;
      await new Promise<void>((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
      return res.json({ ...safeUser, permissions, ...(warehouseLogin ? { maintenanceScope: "warehouse" } : systemAdminLogin ? { maintenanceScope: "system-admin" } : hrLogin ? { maintenanceScope: "hr" } : managerLogin ? { maintenanceScope: "manager" } : {}) });
    } catch (error) {
      console.error("Login error:", error);
      return res.status(500).json({
        message: "حدث خطأ أثناء تسجيل الدخول",
        messageEn: "An error occurred during login",
      });
    }
  });

  registerSystemAdminRoutes(app, { hashPassword, comparePasswords });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({
          message: "حدث خطأ أثناء تسجيل الخروج",
          messageEn: "An error occurred during logout",
        });
      }
      res.clearCookie("connect.sid");
      return res.json({ message: "تم تسجيل الخروج بنجاح" });
    });
  });

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    if (!req.session.userId || !req.session.adminAuthenticated) {
      return res.status(401).json({
        message: "غير مسجل الدخول",
        messageEn: "Not authenticated",
      });
    }

    try {
      const user = await storage.getUser(req.session.userId);
      if (!user || !user.active) {
        return res.status(401).json({
          message: "المستخدم غير موجود",
          messageEn: "User not found",
        });
      }
      const { password: _, employeePin: _pin, financePin: _financePin, ...safeUser } = scopedAccount(user, req.session.hrWorkspace ? "hr" : req.session.warehouseWorkspace ? "warehouse" : undefined);
      const permissions = req.session.managerWorkspace ? [] : req.session.hrWorkspace ? HR_WORKSPACE_PERMISSIONS : await getEffectivePermissionsForUser(user);
      return res.json({ ...safeUser, permissions: req.session.warehouseWorkspace ? permissions.filter(key => WAREHOUSE_WORKSPACE_PERMISSIONS.includes(key)) : permissions,
        ...(req.session.warehouseWorkspace ? { maintenanceScope: "warehouse" } : req.session.hrWorkspace ? { maintenanceScope: "hr" } : req.session.managerWorkspace ? { maintenanceScope: "manager" } : {}) });
    } catch (error) {
      return res.status(500).json({
        message: "حدث خطأ",
        messageEn: "An error occurred",
      });
    }
  });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId || !req.session.adminAuthenticated) {
    return res.status(401).json({
      message: "يجب تسجيل الدخول أولاً",
      messageEn: "Authentication required",
    });
  }
  next();
}

// Maps API path prefixes to the sidebar module permission key that governs them.
// When a role check fails, a per-account "grant" for the mapped module key allows access —
// so granting a module in the permissions editor actually works at the API level,
// not just for sidebar visibility.
const API_PERMISSION_BYPASS: { prefix: string; key: string; exclude?: string[]; readOnly?: boolean }[] = [
  { prefix: "/api/attendance/monitor", key: "/attendance-monitor" },
  // Settings-level surfaces stay read-only via grant: mutations remain role-gated
  { prefix: "/api/attendance/zones", key: "/attendance-monitor", readOnly: true },
  { prefix: "/api/attendance/work-settings", key: "/attendance-monitor", readOnly: true },
  { prefix: "/api/attendance/device-report", key: "/attendance-monitor" },
  { prefix: "/api/attendance/violations", key: "/attendance-monitor" },
  { prefix: "/api/attendance/risk-scores", key: "/attendance-monitor" },
  // Core monitor workflow includes correcting records / overrides
  { prefix: "/api/attendance/record", key: "/attendance-monitor" },
  { prefix: "/api/attendance/movements", key: "/attendance-monitor" },
  { prefix: "/api/attendance/audit-log", key: "/attendance-monitor" },
  { prefix: "/api/inventory-transactions", key: "/inventory" },
  { prefix: "/api/warehouse-center", key: "/warehouses", readOnly: true },
  { prefix: "/api/inventory", key: "/inventory" },
  { prefix: "/api/warehouses", key: "/inventory", readOnly: true },
  { prefix: "/api/suppliers", key: "/suppliers", exclude: ["/approval"] },
  { prefix: "/api/purchase-orders", key: "/purchases" },
];

async function hasModuleGrantForPath(user: User, method: string, path: string): Promise<boolean> {
  const entry = API_PERMISSION_BYPASS.find(
    (e) =>
      (path === e.prefix || path.startsWith(e.prefix + "/")) &&
      !(e.exclude || []).some((suffix) => path.endsWith(suffix)),
  );
  if (!entry) return false;
  if (entry.readOnly && method !== "GET") return false;
  const effective = await getEffectivePermissionsForUser(user);
  return effective.includes(entry.key);
}

export function requireRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId || !req.session.adminAuthenticated) {
      return res.status(401).json({
        message: "يجب تسجيل الدخول أولاً",
        messageEn: "Authentication required",
      });
    }

    try {
      const storedUser = await storage.getUser(req.session.userId);
      const user = storedUser && scopedAccount(storedUser, req.session.hrWorkspace ? "hr" : req.session.warehouseWorkspace ? "warehouse" : undefined);
      if (!user || !user.active) {
        return res.status(401).json({
          message: "المستخدم غير موجود",
          messageEn: "User not found",
        });
      }

      // Downstream audited operations need the identity loaded from this
      // authenticated session, never an identity supplied in the request body.
      (req as any).user = user;
      if (!roles.includes(user.role) && user.role !== "owner" && user.role !== "it") {
        // Per-account module grant can open API access for the granted module
        const granted = await hasModuleGrantForPath(user, req.method, req.path);
        if (granted) return next();
        return res.status(403).json({
          message: "ليس لديك صلاحية للوصول لهذا المورد",
          messageEn: "You do not have permission to access this resource",
        });
      }

      next();
    } catch (error) {
      return res.status(500).json({
        message: "حدث خطأ في التحقق من الصلاحيات",
        messageEn: "An error occurred while checking permissions",
      });
    }
  };
}
