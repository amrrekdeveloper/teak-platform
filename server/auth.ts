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
  }
}

export function setupAuth(app: Express) {
  const PgSession = connectPgSimple(session);

  app.use(
    session({
      store: new PgSession({
        pool: pool,
        tableName: "user_sessions",
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET || "teak-manufacturing-secret-key",
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

      req.session.userId = user.id;
      const { password: _, ...safeUser } = user;
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
    if (!req.session.userId) {
      return res.status(401).json({
        message: "غير مسجل الدخول",
        messageEn: "Not authenticated",
      });
    }

    try {
      const user = await storage.getUser(req.session.userId);
      if (!user) {
        return res.status(401).json({
          message: "المستخدم غير موجود",
          messageEn: "User not found",
        });
      }
      const { password: _, ...safeUser } = user;
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
  if (!req.session.userId) {
    return res.status(401).json({
      message: "يجب تسجيل الدخول أولاً",
      messageEn: "Authentication required",
    });
  }
  next();
}

export function requireRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId) {
      return res.status(401).json({
        message: "يجب تسجيل الدخول أولاً",
        messageEn: "Authentication required",
      });
    }

    try {
      const user = await storage.getUser(req.session.userId);
      if (!user) {
        return res.status(401).json({
          message: "المستخدم غير موجود",
          messageEn: "User not found",
        });
      }

      if (!roles.includes(user.role) && user.role !== "owner" && user.role !== "it") {
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
