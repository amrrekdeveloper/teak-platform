import { Router, type Request, type Response, type NextFunction } from "express";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "../db";
import {
  employeeDirectory, employeePhone, resolveEligibleEmployee, takeLimit, publicEmployee,
  type PortalEmployee,
} from "./database";
import { equalHash, normalizeEmployeePhone, otpHash, tokenHash } from "./security";
import { sendEmployeeOtp } from "./sms";
import { registerEmployeeServices } from "./services";
import { developmentOtpEnabled } from "./mode";

const production = process.env.NODE_ENV === "production";
export const DEVICE_COOKIE = production ? "__Host-teak-employee" : "teak-employee";
const CHALLENGE_COOKIE = production ? "__Host-teak-otp-browser" : "teak-otp-browser";
const cookieOptions = { httpOnly: true, secure: production, sameSite: "strict" as const, path: "/" };

export function readCookie(req: Request, name: string) {
  const part = (req.headers.cookie ?? "").split(";").find(p => p.trim().startsWith(`${name}=`));
  if (!part) return "";
  const value = part.trim().slice(name.length + 1);
  return /^[a-f0-9]{64}$/.test(value) ? value : "";
}
export function asyncRoute(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => { Promise.resolve(fn(req, res, next)).catch(next); };
}
export function portalError(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}
export type PortalIdentity = { employee: PortalEmployee; sessionId: string };
export const identity = (res: Response) => res.locals.employeePortal as PortalIdentity;

export function createEmployeePortalRouter() {
  const router = Router();
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");
    if (!["GET", "HEAD"].includes(req.method)) {
      // Custom header prevents cross-site form POSTs. No CORS is enabled.
      if (req.get("X-Portal-Request") !== "1") return res.status(403).json({ message: "طلب غير موثوق، أعد تحميل الصفحة." });
      const origin = req.get("Origin");
      if (origin) {
        try {
          const url = new URL(origin);
          if (url.host !== req.get("host") || !["https:", "http:"].includes(url.protocol))
            return res.status(403).json({ message: "مصدر الطلب غير مسموح." });
        } catch { return res.status(403).json({ message: "مصدر الطلب غير صالح." }); }
      }
    }
    next();
  });
  router.get("/config", (_req, res) => res.json({ developmentOtp: developmentOtpEnabled() }));
  router.post("/otp/request", asyncRoute(async (req, res) => {
    const developmentOtp = developmentOtpEnabled();
    const phone = normalizeEmployeePhone(req.body?.phone);
    if (!phone) portalError(400, "أدخل رقم جوال سعودي صحيحًا.");
    if ((!developmentOtp && !process.env.TAQNYAT_API_KEY) || !process.env.SESSION_SECRET)
      portalError(503, "خدمة الدخول غير متاحة حاليًا. تواصل مع الدعم الفني.");
    const ipKey = tokenHash(req.ip || "unknown");
    if (!await takeLimit(`otp-ip:${ipKey}`, 20, 900) ||
      !await takeLimit(`otp-phone:${tokenHash(phone!)}`, 5, 900) ||
      !await takeLimit(`otp-cooldown:${tokenHash(phone!)}`, 1, 60))
      portalError(429, "يرجى الانتظار دقيقة قبل طلب رمز آخر. المحاولات المتكررة تتطلب الانتظار 15 دقيقة.");
    const employee = resolveEligibleEmployee(await employeeDirectory(), phone!);
    const challengeId = randomUUID();
    const browserToken = readCookie(req, CHALLENGE_COOKIE) || randomBytes(32).toString("hex");
    res.cookie(CHALLENGE_COOKIE, browserToken, { ...cookieOptions, maxAge: 600000 });
    if (employee) {
      const code = developmentOtp ? "1111" : String(randomInt(100000, 1000000));
      await pool.query("UPDATE employee_portal_otps SET used_at=now() WHERE employee_id=$1 AND used_at IS NULL", [employee.id]);
      await pool.query(`INSERT INTO employee_portal_otps
        (id,employee_id,phone,code_hash,browser_hash,auth_mode,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,now()+interval '5 minutes')`,
      [challengeId, employee.id, phone, otpHash(challengeId, code), tokenHash(browserToken), developmentOtp ? "development" : "sms"]);
      try {
        if (!developmentOtp) await sendEmployeeOtp(phone!, code);
        await pool.query("UPDATE employee_portal_otps SET sent=true WHERE id=$1", [challengeId]);
      } catch {
        await pool.query("UPDATE employee_portal_otps SET used_at=now() WHERE id=$1", [challengeId]);
        // No recipient, OTP, token, or provider error body is ever logged.
        portalError(503, "تعذّر إرسال رسالة التحقق. حاول لاحقًا أو تواصل مع الدعم الفني.");
      }
    }
    // Uniform response avoids exposing employee registration or duplicate phones.
    res.json({
      challengeId, expiresIn: 300, resendAfter: 60,
      message: developmentOtp
        ? "وضع التطوير فقط: استخدم الرمز 1111 للرقم المسجل لموظف مؤهل. لا تُرسل رسائل SMS."
        : "إذا كان الرقم مسجلًا لموظف مؤهل فستصلك رسالة تحقق. عند عدم وصولها راجع رقمك لدى الموارد البشرية.",
    });
  }));

  router.post("/otp/verify", asyncRoute(async (req, res) => {
    const developmentOtp = developmentOtpEnabled();
    const input = z.object({
      challengeId: z.string().uuid(), code: z.string().regex(developmentOtp ? /^\d{4}$/ : /^\d{6}$/),
      deviceName: z.string().trim().min(1).max(80).default("جهاز الموظف"),
    }).strict().safeParse(req.body);
    if (!input.success) portalError(400, developmentOtp ? "أدخل رمز التطوير المكوّن من أربعة أرقام." : "أدخل رمز التحقق المكوّن من ستة أرقام.");
    const { challengeId, code, deviceName } = input.data!;
    if (!await takeLimit(`verify-ip:${tokenHash(req.ip || "unknown")}`, 30, 900))
      portalError(429, "تجاوزت محاولات التحقق. حاول بعد 15 دقيقة.");
    const browserToken = readCookie(req, CHALLENGE_COOKIE);
    const client = await pool.connect();
    let deviceToken = "";
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(`SELECT *,expires_at>now() AS valid_time
        FROM employee_portal_otps WHERE id=$1 FOR UPDATE`, [challengeId]);
      const challenge = rows[0];
      const deny = async (message: string) => {
        await client.query("COMMIT");
        portalError(401, message);
      };
      if (!challenge || challenge.auth_mode !== (developmentOtp ? "development" : "sms") ||
        !challenge.sent || challenge.used_at || !challenge.valid_time ||
        challenge.attempts >= 5 || !browserToken || !equalHash(challenge.browser_hash, tokenHash(browserToken))) {
        await deny("الرمز غير صالح أو انتهت صلاحيته. اطلب رمزًا جديدًا.");
      }
      await client.query("UPDATE employee_portal_otps SET attempts=attempts+1 WHERE id=$1", [challengeId]);
      if (!equalHash(challenge.code_hash, otpHash(challengeId, code))) {
        await deny("رمز التحقق غير صحيح أو انتهت صلاحيته.");
      }
      const employee = resolveEligibleEmployee(await employeeDirectory(), challenge.phone);
      if (!employee || employee.id !== challenge.employee_id) {
        await deny("تعذّر تأكيد أهلية الموظف. راجع الموارد البشرية.");
      }
      deviceToken = randomBytes(32).toString("hex");
      // Bound active device count; the oldest device is automatically revoked.
      await client.query(`UPDATE employee_portal_devices SET revoked_at=now()
        WHERE employee_id=$1 AND revoked_at IS NULL AND id IN (
          SELECT id FROM employee_portal_devices WHERE employee_id=$1 AND revoked_at IS NULL
          ORDER BY created_at DESC OFFSET 9)`, [employee!.id]);
      await client.query(`INSERT INTO employee_portal_devices
        (id,employee_id,phone,token_hash,device_name,auth_mode,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,now()+interval '30 days')`,
      [randomUUID(), employee!.id, challenge.phone, tokenHash(deviceToken), deviceName, challenge.auth_mode]);
      await client.query("UPDATE employee_portal_otps SET used_at=now() WHERE id=$1", [challengeId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client.release(); }
    res.clearCookie(CHALLENGE_COOKIE, cookieOptions);
    res.cookie(DEVICE_COOKIE, deviceToken, { ...cookieOptions, maxAge: 30 * 86400000 });
    res.json({ success: true });
  }));

  router.use(asyncRoute(async (req, res, next) => {
    const token = readCookie(req, DEVICE_COOKIE);
    if (!token) portalError(401, "سجّل الدخول برقم جوالك أولًا.");
    const { rows } = await pool.query(`SELECT id,employee_id,phone,auth_mode FROM employee_portal_devices
      WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()`, [tokenHash(token)]);
    const device = rows[0];
    if (!device) portalError(401, "انتهت جلسة الجهاز أو أُلغيت. سجّل الدخول مجددًا.");
    if (device.auth_mode !== "sms" && !(device.auth_mode === "development" && developmentOtpEnabled())) {
      await pool.query("UPDATE employee_portal_devices SET revoked_at=now() WHERE id=$1", [device.id]);
      portalError(401, "جلسة التطوير غير متاحة في هذه البيئة. سجّل الدخول مجددًا.");
    }
    const employee = resolveEligibleEmployee(await employeeDirectory(), device.phone);
    if (!employee || employee.id !== device.employee_id) {
      await pool.query("UPDATE employee_portal_devices SET revoked_at=now() WHERE id=$1", [device.id]);
      portalError(401, "تغيّرت بيانات أهلية الموظف. راجع الموارد البشرية وسجّل الدخول مجددًا.");
    }
    await pool.query("UPDATE employee_portal_devices SET last_seen_at=now() WHERE id=$1 AND last_seen_at<now()-interval '1 minute'", [device.id]);
    res.locals.employeePortal = { employee, sessionId: device.id } satisfies PortalIdentity;
    next();
  }));
  router.get("/me", (_req, res) => {
    const current = identity(res);
    res.json({ employee: publicEmployee(current.employee), sessionId: current.sessionId });
  });
  router.post("/logout", asyncRoute(async (_req, res) => {
    await pool.query("UPDATE employee_portal_devices SET revoked_at=now() WHERE id=$1", [identity(res).sessionId]);
    res.clearCookie(DEVICE_COOKIE, cookieOptions);
    res.json({ success: true });
  }));
  router.post("/sessions/revoke", asyncRoute(async (req, res) => {
    const input = z.union([
      z.object({ sessionId: z.string().uuid() }).strict(),
      z.object({ all: z.literal(true) }).strict(),
    ]).safeParse(req.body);
    if (!input.success) portalError(400, "اختر الجلسة المطلوب إلغاؤها.");
    const { employee, sessionId } = identity(res);
    if ("all" in input.data!) {
      await pool.query("UPDATE employee_portal_devices SET revoked_at=now() WHERE employee_id=$1 AND revoked_at IS NULL", [employee.id]);
      res.clearCookie(DEVICE_COOKIE, cookieOptions);
    } else {
      await pool.query("UPDATE employee_portal_devices SET revoked_at=now() WHERE employee_id=$1 AND id=$2", [employee.id, input.data!.sessionId]);
      if (input.data!.sessionId === sessionId) res.clearCookie(DEVICE_COOKIE, cookieOptions);
    }
    res.json({ success: true });
  }));
  registerEmployeeServices(router);
  router.use((_req, res) => res.status(404).json({ message: "الخدمة غير موجودة." }));
  router.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err instanceof z.ZodError ? 400 : (err.status || 500);
    res.status(status).json({ message: status < 500 ? (err instanceof z.ZodError ? "تحقق من البيانات المدخلة." : err.message) : "تعذّر إتمام العملية. حاول لاحقًا أو تواصل مع الدعم الفني." });
  });
  return router;
}
