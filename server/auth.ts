import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import type { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";
import { storage } from "./storage";
import type { User } from "@shared/schema";
import { computeEffectivePermissions, isProtectedOwner } from "@shared/permissions";

const scryptAsync = promisify(scrypt);

export async function getEffectivePermissionsForUser(user: User): Promise<string[]> {
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

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({
          message: "اسم المستخدم وكلمة المرور مطلوبان",
          messageEn: "Username and password are required",
        });
      }

      const user = await storage.getUserByUsername(username);
      if (!user || !(await comparePasswords(password, user.password))) {
        return res.status(401).json({
          message: "اسم المستخدم أو كلمة المرور غير صحيحة",
          messageEn: "Invalid username or password",
        });
      }

      if (!user.active) {
        return res.status(403).json({
          message: "الحساب معطل. يرجى التواصل مع المسؤول",
          messageEn: "Account is disabled. Please contact administrator",
        });
      }

      // New session ID prevents fixation. Existing unmarked PIN-created
      // sessions must authenticate again using administrative credentials.
      await new Promise<void>((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
      req.session.userId = user.id;
      req.session.adminAuthenticated = true;
      const { password: _, employeePin: _pin, financePin: _financePin, ...safeUser } = user;
      const permissions = await getEffectivePermissionsForUser(user);
      return res.json({ ...safeUser, permissions });
    } catch (error) {
      console.error("Login error:", error);
      return res.status(500).json({
        message: "حدث خطأ أثناء تسجيل الدخول",
        messageEn: "An error occurred during login",
      });
    }
  });

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
      const { password: _, employeePin: _pin, financePin: _financePin, ...safeUser } = user;
      const permissions = await getEffectivePermissionsForUser(user);
      return res.json({ ...safeUser, permissions });
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
  { prefix: "/api/attendance/audit-log", key: "/attendance-monitor" },
  { prefix: "/api/inventory-transactions", key: "/inventory" },
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
      const user = await storage.getUser(req.session.userId);
      if (!user || !user.active) {
        return res.status(401).json({
          message: "المستخدم غير موجود",
          messageEn: "User not found",
        });
      }

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
