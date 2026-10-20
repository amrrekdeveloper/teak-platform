import type { RequestHandler } from "express";
import { storage } from "./storage";
import { isHrWorkspaceApi, isHrWorkspaceIdentity, isManagerApi } from "../shared/hr-access";
import { pool } from "./db";

export async function hasManagerAssignment(userId: number) {
  const { rows } = await pool.query("SELECT 1 FROM employees manager JOIN employees report ON report.manager_id=manager.id WHERE manager.user_id=$1 AND manager.status='active' LIMIT 1", [userId]);
  return rows.length > 0;
}

// Runs AFTER administrative sessions, BEFORE any business route handler.
export const enforceHrWorkspaceScope: RequestHandler = async (req, res, next) => {
  if (!req.path.startsWith("/api/") && !req.path.startsWith("/uploads/hr-documents/")) return next();
  const restricted = res.locals.hrMaintenanceRequest || req.session.hrWorkspace || req.session.managerWorkspace;
  if (!restricted) return next();
  const manager = req.session.managerWorkspace === true || req.path === "/api/manager-access/login";
  if (!(manager ? isManagerApi(req.method, req.path) : isHrWorkspaceApi(req.method, req.path))) {
    return res.status(403).json({ message: "هذه الجلسة مخصصة للموارد البشرية فقط." });
  }
  if (!["GET", "HEAD"].includes(req.method)) {
    const origin = req.get("Origin");
    if (origin) {
      try {
        if (new URL(origin).host !== req.get("host"))
          return res.status(403).json({ message: "مصدر الطلب غير مسموح." });
      } catch { return res.status(403).json({ message: "مصدر الطلب غير صالح." }); }
    }
  }
  if (["/api/hr-access/login", "/api/manager-access/login"].includes(req.path) && req.method === "POST") return next();
  if (!req.session.userId || !req.session.adminAuthenticated || (!req.session.hrWorkspace && !manager))
    return res.status(401).json({ message: "سجّل الدخول إلى إدارة الموارد البشرية أولًا." });
  try {
    const user = await storage.getUser(req.session.userId);
    if (manager ? (!user?.active || user.archived || !await hasManagerAssignment(user.id)) : !isHrWorkspaceIdentity(user, req.session))
      return res.status(403).json({ message: "الدخول متاح لحساب موارد بشرية فعّال فقط." });
    next();
  } catch { res.status(500).json({ message: "تعذّر التحقق من صلاحية الحساب." }); }
};
