import { z } from "zod";
import { pool } from "./db";
import { amount, camel, cents, fail, idSchema, keySchema, lockedItem, operation, recordMovement, textSchema, transaction, validateItemQuantity, lockItemSerial, verifySerializedBalance } from "./warehouse-domain";

const requestSchema = z.object({ key: keySchema, inventoryId: idSchema, quantity: z.unknown(), reason: textSchema, requestedFor: textSchema });
export async function createWarehouseRequisition(input: unknown, actor: number) {
  const data = requestSchema.parse(input), quantity = amount(data.quantity);
  return operation("requisition", actor, data, async client => {
    const item = await lockedItem(client, data.inventoryId);
    validateItemQuantity(item, quantity);
    return camel((await client.query(`INSERT INTO warehouse_requisitions
      (inventory_id,warehouse_id,quantity,reason,requested_for,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
    [item.id, item.warehouse_id, quantity, data.reason, data.requestedFor, actor])).rows[0]);
  });
}
export async function listWarehouseRequisitions() {
  return { rows: (await pool.query(`SELECT r.*,i.material_name_ar AS item_name,i.material_name_en AS item_name_en,
    i.unit,w.name_ar AS warehouse_name,w.name_en AS warehouse_name_en,p.status AS purchase_status
    FROM warehouse_requisitions r JOIN inventory i ON i.id=r.inventory_id JOIN warehouses w ON w.id=r.warehouse_id
    LEFT JOIN purchase_orders p ON p.id=r.purchase_order_id ORDER BY r.created_at DESC,r.id DESC`)).rows.map(camel) };
}
const decisionSchema = z.object({ key: keySchema, decision: z.enum(["approved", "rejected"]), note: textSchema,
  supplierId: idSchema.optional(), unitPrice: z.unknown().optional() });
export async function decideWarehouseRequisition(id: number, input: unknown, actor: number) {
  const data = decisionSchema.parse(input);
  return operation(`requisition_decision:${id}`, actor, data, async client => {
    const request = (await client.query("SELECT * FROM warehouse_requisitions WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (!request) fail(404, "طلب الاحتياج غير موجود");
    if (request.status !== "pending") fail(409, "تم اتخاذ قرار سابق على هذا الطلب؛ حدّث القائمة");
    let poId: number | null = null;
    if (data.decision === "approved") {
      if (!data.supplierId) fail(400, "اختر المورد المعتمد لإنشاء أمر الشراء");
      if (!(await client.query("SELECT 1 FROM suppliers WHERE id=$1 AND active=true AND approval_status='approved'", [data.supplierId])).rowCount)
        fail(400, "المورد غير موجود أو غير معتمد أو غير نشط");
      const price = amount(data.unitPrice);
      const totalCents = (cents(request.quantity) * cents(price) + 50n) / 100n;
      if (totalCents > 999999999999n) fail(400, "قيمة أمر الشراء تتجاوز الحد المسموح");
      const total = `${totalCents / 100n}.${String(totalCents % 100n).padStart(2, "0")}`;
      const item = await lockedItem(client, request.inventory_id);
      const lines = [{ inventoryId: item.id, warehouseId: item.warehouse_id, requisitionId: id,
        materialNameAr: item.material_name_ar, materialNameEn: item.material_name_en, quantity: request.quantity,
        unit: item.unit, unitPrice: price, total: Number(total), receivedQuantity: "0.00" }];
      poId = (await client.query(`INSERT INTO purchase_orders(supplier_id,items,total_amount,status,created_by)
        VALUES($1,$2::jsonb,$3,'draft',$4) RETURNING id`, [data.supplierId, JSON.stringify(lines), total, actor])).rows[0].id;
    }
    return camel((await client.query(`UPDATE warehouse_requisitions SET status=$2,decision_note=$3,purchase_order_id=$4,
      decided_by=$5,decided_at=now() WHERE id=$1 RETURNING *`, [id, data.decision, data.note, poId, actor])).rows[0]);
  });
}
export async function listWarehouseReceipts() {
  const rows = (await pool.query(`SELECT p.*,s.name AS supplier_name,r.id AS requisition_id
    FROM purchase_orders p JOIN suppliers s ON s.id=p.supplier_id LEFT JOIN warehouse_requisitions r ON r.purchase_order_id=p.id
    WHERE p.status IN('approved','ordered','partially_received') ORDER BY p.id DESC`)).rows;
  return { rows: rows.map(row => ({ ...camel(row), items: Array.isArray(row.items) ? row.items.map((item: any, index: number) => ({
    ...item, lineIndex: index, receivedQuantity: item.receivedQuantity || "0.00",
  })) : [] })) };
}
const receiptSchema = z.object({ key: keySchema, purchaseOrderId: idSchema, lineIndex: z.coerce.number().int().min(0),
  inventoryId: idSchema, quantity: z.unknown(), notes: textSchema });
export async function receiveWarehousePurchase(input: unknown, actor: number) {
  const data = receiptSchema.parse(input), quantity = amount(data.quantity);
  return operation("purchase_receipt", actor, data, async client => {
    const po = (await client.query("SELECT * FROM purchase_orders WHERE id=$1 FOR UPDATE", [data.purchaseOrderId])).rows[0];
    if (!po) fail(404, "أمر الشراء غير موجود");
    if (!["approved", "ordered", "partially_received"].includes(po.status)) fail(409, "الاستلام متاح فقط لأمر شراء معتمد لم يكتمل استلامه");
    const lines: any[] = Array.isArray(po.items) ? po.items.map((line: any) => ({ ...line })) : [];
    const line = lines[data.lineIndex];
    if (!line) fail(400, "سطر أمر الشراء غير موجود");
    if (line.inventoryId && Number(line.inventoryId) !== data.inventoryId) fail(409, "سطر الشراء مرتبط بصنف مختلف؛ لا يجوز استبداله أثناء الاستلام");
    await lockItemSerial(client, data.inventoryId);
    const item = await lockedItem(client, data.inventoryId);
    if (line.warehouseId && Number(line.warehouseId) !== item.warehouse_id) fail(409, "المستودع لا يطابق وجهة أمر الشراء");
    if (line.unit && line.unit !== item.unit) fail(409, "وحدة الشراء لا تطابق وحدة الصنف؛ يلزم تصحيح الشراء قبل الاستلام");
    const previousMapping = (await client.query(`SELECT inventory_id FROM warehouse_purchase_receipts
      WHERE purchase_order_id=$1 AND line_index=$2 LIMIT 1`, [po.id, data.lineIndex])).rows[0];
    if (previousMapping && previousMapping.inventory_id !== item.id) fail(409, "تم ربط هذا السطر بصنف آخر في استلام سابق");
    validateItemQuantity(item, quantity);
    const ordered = cents(line.quantity), received = cents(line.receivedQuantity || "0");
    if (received + cents(quantity) > ordered) fail(409, "الكمية المستلمة تتجاوز المتبقي في أمر الشراء");
    const price = amount(line.unitPrice, true);
    const updated = (await client.query(`UPDATE inventory SET cost_per_unit=
      (quantity*COALESCE(cost_per_unit,0)+$2::numeric*$3::numeric)/(quantity+$2::numeric),
      quantity=quantity+$2::numeric,last_updated=now(),version=version+1 WHERE id=$1 RETURNING *`, [item.id, quantity, price])).rows[0];
    validateItemQuantity(updated, updated.quantity);
    await verifySerializedBalance(client, updated);
    const movement = await recordMovement(client, item, actor, { type: "stock_in", quantity, reason: "purchase",
      notes: data.notes, reference: `PO-${po.order_number}/${data.lineIndex + 1}`, purchaseOrderId: po.id, balanceAfter: updated.quantity });
    await client.query(`INSERT INTO warehouse_purchase_receipts(purchase_order_id,line_index,inventory_id,quantity,transaction_id)
      VALUES($1,$2,$3,$4,$5)`, [po.id, data.lineIndex, item.id, quantity, movement.id]);
    const newReceived = received + cents(quantity);
    Object.assign(line, { inventoryId: item.id, warehouseId: item.warehouse_id, unit: item.unit,
      receivedQuantity: `${newReceived / 100n}.${String(newReceived % 100n).padStart(2, "0")}` });
    const completed = lines.every(part => cents(part.receivedQuantity || "0") === cents(part.quantity));
    await client.query("UPDATE purchase_orders SET items=$2::jsonb,status=$3 WHERE id=$1",
      [po.id, JSON.stringify(lines), completed ? "received" : "partially_received"]);
    return { movement, item: camel(updated), purchaseOrderId: po.id, completed, totalAmount: po.total_amount, orderNumber: po.order_number };
  });
}

/** Same row lock as receipts: a late status save cannot overwrite a completed receipt. */
export async function updateWarehousePurchaseOrder(id: number, input: any, actor: number) {
  return transaction(async client => {
    const po = (await client.query("SELECT * FROM purchase_orders WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (!po) fail(404, "أمر الشراء غير موجود");
    const linked = (await client.query("SELECT 1 FROM warehouse_requisitions WHERE purchase_order_id=$1", [id])).rowCount;
    const received = (await client.query("SELECT 1 FROM warehouse_purchase_receipts WHERE purchase_order_id=$1", [id])).rowCount;
    if (input.items !== undefined && (linked || received)) fail(409, "بنود أمر مرتبط بطلب أو استلام محفوظة؛ لا تُعدّلها بأثر رجعي");
    if (input.totalAmount !== undefined && input.items === undefined) fail(400, "قيمة الأمر تُحسب من بنوده، ولا تُعدّل منفردة");
    if (received && (input.supplierId !== undefined || input.items !== undefined)) fail(409, "لا يمكن تعديل أمر له استلام فعلي");
    const status = input.status === undefined ? po.status : z.enum(["draft", "pending_approval", "approved", "ordered", "cancelled"]).parse(input.status);
    const transitions: Record<string, string[]> = { draft: ["draft", "pending_approval", "approved", "cancelled"],
      pending_approval: ["pending_approval", "draft", "approved", "cancelled"], approved: ["approved", "ordered", "cancelled"],
      ordered: ["ordered", "cancelled"], partially_received: ["partially_received"], received: ["received"], cancelled: ["cancelled"] };
    if (!transitions[po.status]?.includes(status)) fail(409, "هذا الانتقال غير متاح؛ تسجيل الاستلام يتم من المستودعات");
    const supplierId = input.supplierId === undefined ? po.supplier_id : idSchema.parse(input.supplierId);
    if (!(await client.query("SELECT 1 FROM suppliers WHERE id=$1 AND active=true AND approval_status='approved'", [supplierId])).rowCount)
      fail(400, "اختر موردًا نشطًا ومعتمدًا");
    let items = po.items, total = po.total_amount;
    if (input.items !== undefined) {
      if (!Array.isArray(input.items) || !input.items.length) fail(400, "أضف بنود أمر الشراء");
      let totalCents = 0n;
      items = input.items.map((line: any) => {
        const quantity = amount(line.quantity), price = amount(line.unitPrice, true);
        const lineCents = (cents(quantity) * cents(price) + 50n) / 100n;
        totalCents += lineCents;
        return { ...line, materialNameAr: textSchema.parse(line.materialNameAr), quantity, unitPrice: price, total: Number(lineCents) / 100, receivedQuantity: "0.00" };
      });
      if (totalCents > 999999999999n) fail(400, "قيمة الأمر تتجاوز الحد المسموح");
      total = `${totalCents / 100n}.${String(totalCents % 100n).padStart(2, "0")}`;
    }
    return camel((await client.query(`UPDATE purchase_orders SET status=$2::po_status,supplier_id=$3,items=$4::jsonb,total_amount=$5,
      approved_by=CASE WHEN $2::po_status='approved'::po_status THEN $6::integer ELSE approved_by END WHERE id=$1 RETURNING *`,
    [id, status, supplierId, JSON.stringify(items), total, actor])).rows[0]);
  });
}
