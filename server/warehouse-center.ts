import type { Express, RequestHandler, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { pool } from "./db";
import { canManageWarehouse, canDecideWarehousePurchase } from "../shared/warehouse-access";
import { requireRole } from "./auth";
import { camel, fail, idSchema, WarehouseError } from "./warehouse-domain";
import { saveWarehouse, saveWarehouseCategory, warehouseSummary } from "./warehouse-catalog";
import { archiveWarehouseItem, createWarehouseItem, editWarehouseItem, transferWarehouseStock } from "./warehouse-stock";
import { createWarehouseRequisition, decideWarehouseRequisition, listWarehouseReceipts, listWarehouseRequisitions, receiveWarehousePurchase, updateWarehousePurchaseOrder } from "./warehouse-procurement";

export const warehouseEndpoint = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler => (req, res, next) => {
  fn(req, res, next).catch(error => {
    if (res.headersSent) return next(error);
    const status = error instanceof WarehouseError ? error.status : error instanceof z.ZodError ? 400
      : ["23503", "23505", "22003", "22008", "22007", "22P02"].includes(error.code) ? 400 : 500;
    res.status(status).json({ message: error instanceof WarehouseError ? error.message
      : status === 400 ? "تحقق من البيانات والمراجع والحدود الرقمية المدخلة" : "تعذر إتمام العملية؛ لم تُحفظ حركة جزئية. أعد المحاولة." });
  });
};
const read = requireRole("owner", "assistant", "warehouse", "purchasing", "production");
const write: RequestHandler = (req, res, next) => canManageWarehouse((req as any).user?.role, (req as any).user?.accessPolicy)
  ? next() : res.status(403).json({ message: "التعديل والصرف والاستلام من صلاحية أمين المستودع والإدارة" });
const purchasing: RequestHandler = (req, res, next) => canDecideWarehousePurchase((req as any).user?.role, (req as any).user?.accessPolicy)
  ? next() : res.status(403).json({ message: "قرار طلب الشراء من صلاحية مسؤول المشتريات والإدارة فقط" });

const filterSchema = z.object({
  warehouseId: idSchema.optional(), itemId: idSchema.optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export async function warehouseMovements(query: any, exportAll = false) {
  const f = filterSchema.parse(Object.fromEntries(Object.entries(query).filter(([, value]) => value !== "")));
  if (f.from && f.to && f.from > f.to) fail(400, "تاريخ البداية يجب ألا يتجاوز النهاية");
  const values = [f.warehouseId || null, f.itemId || null, f.from || null, f.to || null];
  const where = `($1::int IS NULL OR t.warehouse_id=$1) AND ($2::int IS NULL OR t.inventory_id=$2)
    AND ($3::date IS NULL OR t.created_at>=($3::date::timestamp AT TIME ZONE 'Asia/Riyadh'))
    AND ($4::date IS NULL OR t.created_at<(($4::date+1)::timestamp AT TIME ZONE 'Asia/Riyadh'))`;
  const total = (await pool.query(`SELECT count(*)::int AS n FROM inventory_transactions t WHERE ${where}`, values)).rows[0].n;
  if (exportAll && total > 10000) fail(400, "عدد الحركات كبير للتصدير؛ ضيّق المدة أو اختر مستودعًا محددًا");
  const rows = (await pool.query(`SELECT t.*,i.material_name_ar AS item_name,i.material_name_en AS item_name_en,i.unit,
    w.name_ar AS warehouse_name,w.name_en AS warehouse_name_en,u.full_name_ar AS performed_by_name
    FROM inventory_transactions t JOIN inventory i ON i.id=t.inventory_id
    LEFT JOIN warehouses w ON w.id=t.warehouse_id LEFT JOIN users u ON u.id=t.performed_by
    WHERE ${where} ORDER BY t.created_at DESC,t.id DESC LIMIT $5 OFFSET $6`,
  [...values, exportAll ? 10000 : f.pageSize, exportAll ? 0 : (f.page - 1) * f.pageSize])).rows.map(camel);
  return { rows, total, page: f.page };
}
function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
export function registerWarehouseCenter(app: Express, onPurchaseReceived: (result: any, actor: number) => Promise<void>) {
  app.get("/api/warehouse-center/summary", read, warehouseEndpoint(async (_req, res) => res.json(await warehouseSummary())));
  app.post("/api/warehouse-center/warehouses", read, write, warehouseEndpoint(async (req, res) => res.status(201).json(await saveWarehouse(null, req.body))));
  app.patch("/api/warehouse-center/warehouses/:id", read, write, warehouseEndpoint(async (req, res) => res.json(await saveWarehouse(idSchema.parse(req.params.id), req.body))));
  app.post("/api/warehouse-center/categories", read, write, warehouseEndpoint(async (req, res) => res.status(201).json(await saveWarehouseCategory(null, req.body))));
  app.patch("/api/warehouse-center/categories/:id", read, write, warehouseEndpoint(async (req, res) => res.json(await saveWarehouseCategory(idSchema.parse(req.params.id), req.body))));
  app.post("/api/warehouse-center/items", read, write, warehouseEndpoint(async (req, res) => res.status(201).json(await createWarehouseItem(req.body, req.session.userId!))));
  app.patch("/api/warehouse-center/items/:id", read, write, warehouseEndpoint(async (req, res) => res.json(await editWarehouseItem(idSchema.parse(req.params.id), req.body, req.session.userId!))));
  app.delete("/api/warehouse-center/items/:id", read, write, warehouseEndpoint(async (req, res) => res.json(await archiveWarehouseItem(idSchema.parse(req.params.id), req.session.userId!))));
  app.get("/api/warehouse-center/movements", read, warehouseEndpoint(async (req, res) => res.json(await warehouseMovements(req.query))));
  app.post("/api/warehouse-center/transfers", read, write, warehouseEndpoint(async (req, res) => res.status(201).json(await transferWarehouseStock(req.body, req.session.userId!))));
  app.get("/api/warehouse-center/requisitions", read, warehouseEndpoint(async (_req, res) => res.json(await listWarehouseRequisitions())));
  app.post("/api/warehouse-center/requisitions", read, write, warehouseEndpoint(async (req, res) => res.status(201).json(await createWarehouseRequisition(req.body, req.session.userId!))));
  app.post("/api/warehouse-center/requisitions/:id/decision", read, purchasing, warehouseEndpoint(async (req, res) =>
    res.json(await decideWarehouseRequisition(idSchema.parse(req.params.id), req.body, req.session.userId!))));
  app.get("/api/warehouse-center/receipts", read, warehouseEndpoint(async (_req, res) => res.json(await listWarehouseReceipts())));
  app.post("/api/warehouse-center/receipts", read, write, warehouseEndpoint(async (req, res) => {
    const result = await receiveWarehousePurchase(req.body, req.session.userId!);
    if (result.completed) await onPurchaseReceived(result, req.session.userId!);
    res.status(201).json(result);
  }));
  app.patch("/api/purchase-orders/:id", requireRole("owner", "assistant", "purchasing"), purchasing, warehouseEndpoint(async (req, res) =>
    res.json(await updateWarehousePurchaseOrder(idSchema.parse(req.params.id), req.body, req.session.userId!))));
  // Physical receipts cannot be fabricated by changing a PO's status or JSON counter.
  app.use("/api/purchase-orders", requireRole("owner", "assistant", "purchasing", "warehouse", "accountant"), warehouseEndpoint(async (req, res, next) => {
    if (req.method === "PATCH") {
      if (["received", "partially_received"].includes(req.body?.status)) {
        res.status(409).json({ message: "سجّل الاستلام الفعلي من المستودعات ← استلام المشتريات، وليس بتغيير الحالة" }); return;
      }
      const match = req.path.match(/^\/(\d+)$/);
      if (match && (req.body?.items !== undefined || req.body?.supplierId !== undefined || req.body?.totalAmount !== undefined || req.body?.status !== undefined)) {
        const id = Number(match[1]);
        const locked = (await pool.query(`SELECT p.status,
          EXISTS(SELECT 1 FROM warehouse_requisitions r WHERE r.purchase_order_id=p.id) AS linked,
          EXISTS(SELECT 1 FROM warehouse_purchase_receipts r WHERE r.purchase_order_id=p.id) AS received
          FROM purchase_orders p WHERE p.id=$1`, [id])).rows[0];
        if (locked && ((locked.linked && req.body.items !== undefined) ||
          (locked.received && (req.body.items !== undefined || req.body.supplierId !== undefined || req.body.totalAmount !== undefined ||
            (req.body.status !== undefined && req.body.status !== locked.status))))) {
          res.status(409).json({ message: "لا يمكن تغيير بنود أو حالة أمر مرتبط بطلب احتياج أو استلام فعلي؛ أنشئ إجراءً تصحيحيًا مستقلًا" }); return;
        }
      }
    }
    if ((req.method === "POST" || req.method === "PATCH") && Array.isArray(req.body?.items))
      req.body.items = req.body.items.map((line: any) => ({ ...line, receivedQuantity: "0.00" }));
    if (req.method === "POST" && req.body?.status && req.body.status !== "draft")
      fail(400, "أمر الشراء الجديد يبدأ مسودة ثم يُعتمد من المشتريات");
    next();
  }));
  app.get("/api/warehouse-center/reports.csv", read, warehouseEndpoint(async (req, res) => {
    const kind = z.enum(["balances", "movements", "low_stock"]).parse(req.query.kind || "balances");
    let rows: unknown[][];
    if (kind === "movements") {
      const report = await warehouseMovements(req.query, true);
      rows = [["رقم السند", "التاريخ", "المستودع", "الصنف", "الوحدة", "الحركة", "الكمية", "الرصيد بعد الحركة", "المستلم", "السبب", "التفاصيل", "المنفذ", "المرجع"],
        ...report.rows.map((row: any) => [row.id, row.createdAt, row.warehouseName || "موقع قديم غير موثق", row.itemName,
          row.unit, row.type, row.quantity, row.balanceAfter, row.receiverName, row.reason, row.notes, row.performedByName, row.reference])];
    } else {
      const warehouseId = req.query.warehouseId ? idSchema.parse(req.query.warehouseId) : null;
      const items = (await pool.query(`SELECT i.*,w.name_ar AS warehouse_name,c.name_ar AS category_name FROM inventory i
        LEFT JOIN warehouses w ON w.id=i.warehouse_id LEFT JOIN warehouse_categories c ON c.id=i.category_id
        WHERE i.active=true AND ($1::int IS NULL OR i.warehouse_id=$1) AND ($2::boolean=false OR i.quantity<=i.min_quantity)
        ORDER BY w.id,i.material_name_ar,i.id`, [warehouseId, kind === "low_stock"])).rows;
      rows = [["رقم الصنف", "المستودع", "الصنف", "التصنيف", "النوع", "الرمز", "الرقم التسلسلي", "الوحدة", "الرصيد الدفتري", "الحد الأدنى", "الموقع الداخلي", "العد الفعلي", "فرق الجرد"],
        ...items.map(item => [item.id, item.warehouse_name || "غير مربوط بمستودع", item.material_name_ar,
          item.category_name || item.category, item.item_kind, item.sku, item.serial_number, item.unit,
          item.quantity, item.min_quantity, item.location, "", ""])];
    }
    res.type("text/csv; charset=utf-8").setHeader("Content-Disposition", `attachment; filename="warehouse-${kind}.csv"`);
    res.send("\ufeff" + rows.map(row => row.map(csvCell).join(",")).join("\r\n"));
  }));
  app.get("/api/warehouse-center/reports/print", read, warehouseEndpoint(async (req, res) => {
    const kind = z.enum(["balances", "movements", "low_stock"]).parse(req.query.kind || "balances");
    const warehouseId = req.query.warehouseId ? idSchema.parse(req.query.warehouseId) : null;
    let headers: string[], rows: unknown[][];
    if (kind === "movements") {
      const data = await warehouseMovements(req.query, true);
      headers = ["السند", "التاريخ بتوقيت الرياض", "المستودع", "الصنف", "الوحدة", "الحركة", "الكمية", "الرصيد اللاحق", "المستلم", "السبب والتفاصيل"];
      rows = data.rows.map((row: any) => [row.id, new Date(row.createdAt).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", calendar: "gregory" }),
        row.warehouseName || "موقع قديم غير موثق", row.itemName, row.unit, row.type, row.quantity, row.balanceAfter ?? "غير موثق",
        row.receiverName || "—", `${row.reason || ""} — ${row.notes || ""}`]);
    } else {
      headers = ["الصنف", "المستودع", "التصنيف", "الوحدة", "الرصيد الدفتري", "الحد الأدنى", "الموقع", "العد الفعلي", "فرق الجرد"];
      const items = (await pool.query(`SELECT i.*,w.name_ar AS warehouse_name,c.name_ar AS category_name FROM inventory i
        LEFT JOIN warehouses w ON w.id=i.warehouse_id LEFT JOIN warehouse_categories c ON c.id=i.category_id
        WHERE i.active=true AND ($1::int IS NULL OR i.warehouse_id=$1) AND ($2::boolean=false OR i.quantity<=i.min_quantity)
        ORDER BY w.id,i.material_name_ar,i.id LIMIT 10001`, [warehouseId, kind === "low_stock"])).rows;
      if (items.length > 10000) fail(400, "ضيّق نطاق المستودعات قبل طباعة هذا العدد من الأصناف");
      rows = items.map(item => [item.material_name_ar, item.warehouse_name || "غير مربوط", item.category_name || item.category,
        item.unit, item.quantity, item.min_quantity, item.location, "", ""]);
    }
    const labels: Record<string, string> = { piece: "قطعة", meter: "متر", sqm: "م²", kg: "كجم", liter: "لتر", sheet: "لوح",
      stock_in: "إدخال", stock_out: "صرف", adjustment: "تسوية جرد", transfer: "تحويل" };
    const escape = (value: unknown) => String(value == null ? "" : labels[String(value)] || value).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
    const title = kind === "movements" ? "سجل حركات المستودعات" : kind === "low_stock" ? "تقرير النواقص" : "كشف الجرد والأرصدة";
    res.type("html").setHeader("Cache-Control", "private, no-store");
    res.send(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>${title}</title>
      <style>body{font:13px Tahoma,Arial;color:#171717;background:white;margin:20px}h1{font-size:23px}table{border-collapse:collapse;width:100%}
      th,td{border:1px solid #bbb;padding:7px;text-align:right;overflow-wrap:anywhere}th{background:#eee}thead{display:table-header-group}tr{break-inside:avoid}
      button{padding:10px 20px;margin-bottom:15px}@page{size:A4 landscape;margin:12mm}@media print{button{display:none}body{margin:0;font-size:11px}}</style>
      <button onclick="window.print()">طباعة / حفظ PDF</button><h1>TEAK — ${title}</h1><p>الصفوف: ${rows.length} — التاريخ: ${escape(new Date().toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", calendar: "gregory" }))}</p>
      ${kind === "movements" ? `<p>الفترة: ${escape(req.query.from || "جميع التواريخ")} — ${escape(req.query.to || "حتى الآن")}</p>` : "<p>هذا كشف بالأرصدة الدفترية. سجّل نتائج العد الفعلي بسند جرد مستقل؛ لا يُعد هذا الكشف اعتمادًا للعد.</p>"}
      <table><thead><tr>${headers.map(label => `<th>${label}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(value => `<td>${escape(value)}</td>`).join("")}</tr>`).join("")}</tbody></table></html>`);
  }));
}
