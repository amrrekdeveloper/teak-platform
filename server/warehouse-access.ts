import type { RequestHandler } from "express";
import { storage } from "./storage";
import { isWarehouseWorkspaceApi, WAREHOUSE_WORKSPACE_ROLES, canManageWarehouse, canDecideWarehousePurchase } from "../shared/warehouse-access";

export const enforceWarehouseWorkspaceScope: RequestHandler = async (req, res, next) => {
  if (req.path.startsWith("/api/employee-portal/")) return next();
  const login = req.method === "POST" && req.path === "/api/warehouse-access/login";
  if (!login && !req.session.warehouseWorkspace && !res.locals.warehouseMaintenanceRequest) return next();
  if (!req.path.startsWith("/api/")) return next();
  if (!isWarehouseWorkspaceApi(req.method, req.path)) return res.status(403).json({ message: "هذه الجلسة مخصصة للمستودعات والمشتريات فقط" });
  if (!["GET", "HEAD"].includes(req.method) && req.get("Origin")) {
    try { if (new URL(req.get("Origin")!).host !== req.get("host")) return res.status(403).json({ message: "مصدر الطلب غير مسموح" }); }
    catch { return res.status(403).json({ message: "مصدر الطلب غير صالح" }); }
  }
  if (login) { res.locals.warehouseAccessGranted = true; return next(); }
  if (!req.session.warehouseWorkspace || !req.session.adminAuthenticated || !req.session.userId)
    return res.status(401).json({ message: "سجّل الدخول إلى مساحة المستودعات أولًا" });
  try {
    const user = await storage.getUser(req.session.userId);
    if (!user?.active || user.archived || !WAREHOUSE_WORKSPACE_ROLES.includes(user.role))
      return res.status(403).json({ message: "الحساب غير مخوّل للعمل في المستودعات" });
    if (!["GET", "HEAD"].includes(req.method) && !/^\/api\/(?:auth\/|notifications(?:\/|$))/.test(req.path)) {
      const buying = /^\/api\/(?:purchase-orders|suppliers)(?:\/|$)/.test(req.path) || /\/requisitions\/\d+\/decision$/.test(req.path);
      if (buying ? !canDecideWarehousePurchase(user.role) : !canManageWarehouse(user.role))
        return res.status(403).json({ message: buying ? "قرار المشتريات من صلاحية مسؤول المشتريات والإدارة" : "حركات المخزون من صلاحية أمين المستودع والإدارة" });
    }
    res.locals.warehouseAccessGranted = true;
    next();
  } catch { res.status(500).json({ message: "تعذر التحقق من صلاحية الحساب" }); }
};
