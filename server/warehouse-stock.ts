import { z } from "zod";
import { pool } from "./db";
import { activeWarehouse, amount, camel, cents, fail, idSchema, keySchema, lockedItem, operation,
  recordMovement, textSchema, transaction, validateItemQuantity, lockItemSerial, verifySerializedBalance } from "./warehouse-domain";

const optionalText = z.string().trim().max(2000).optional().nullable();
export const itemSchema = z.object({
  key: keySchema, materialNameAr: textSchema, materialNameEn: optionalText,
  warehouseId: idSchema, categoryId: idSchema.nullable().optional(), sku: optionalText,
  category: optionalText, color: optionalText, imageUrl: optionalText,
  unit: z.enum(["piece", "meter", "sqm", "kg", "liter", "sheet"]),
  itemKind: z.enum(["material", "equipment", "vehicle", "other"]).default("material"),
  serialNumber: optionalText, location: optionalText,
  quantity: z.unknown().default("0"), minQuantity: z.unknown().default("0"), costPerUnit: z.unknown().optional(),
});
async function validCategory(client: any, id: number | null | undefined) {
  if (id && !(await client.query("SELECT 1 FROM warehouse_categories WHERE id=$1 AND active=true", [id])).rowCount)
    fail(400, "التصنيف غير موجود أو مؤرشف");
}
export async function createWarehouseItem(input: unknown, actor: number) {
  const data = itemSchema.parse(input);
  const quantity = amount(data.quantity, true), minimum = amount(data.minQuantity, true);
  const cost = data.costPerUnit == null || data.costPerUnit === "" ? null : amount(data.costPerUnit, true);
  return operation("create_item", actor, data, async client => {
    await activeWarehouse(client, data.warehouseId);
    await validCategory(client, data.categoryId);
    if (data.serialNumber) {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`serial:${data.serialNumber}`]);
      if ((await client.query("SELECT 1 FROM inventory WHERE serial_number=$1 AND quantity>0", [data.serialNumber])).rowCount)
        fail(409, "الرقم التسلسلي موجود بالفعل في رصيد المستودعات");
    }
    const item = (await client.query(`INSERT INTO inventory(material_name_ar,material_name_en,warehouse_id,category_id,category,sku,color,
      unit,item_kind,serial_number,location,quantity,min_quantity,cost_per_unit,image_url)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [data.materialNameAr, data.materialNameEn || data.materialNameAr, data.warehouseId, data.categoryId || null, data.category || null,
      data.sku || null, data.color || null, data.unit, data.itemKind, data.serialNumber || null, data.location || null,
      quantity, minimum, cost, data.imageUrl || null])).rows[0];
    validateItemQuantity(item, quantity);
    if (cents(quantity) > 0n) await recordMovement(client, item, actor, {
      type: "stock_in", quantity, reason: "opening_balance", notes: "رصيد افتتاحي عند إنشاء الصنف", balanceAfter: quantity,
    });
    return camel(item);
  });
}
const editSchema = itemSchema.partial().extend({ active: z.boolean().optional(), assignmentReason: optionalText }).omit({ key: true });
export async function editWarehouseItem(id: number, input: unknown, actor: number) {
  const raw = input as Record<string, unknown>;
  if ("quantity" in raw) fail(400, "تغيير الرصيد يكون بسند حركة أو جرد، وليس بتعديل بيانات الصنف");
  const data = editSchema.parse(input);
  return transaction(async client => {
    const item = (await client.query("SELECT * FROM inventory WHERE id=$1 FOR UPDATE", [id])).rows[0];
    if (!item) fail(404, "الصنف غير موجود");
    if (data.unit && data.unit !== item.unit) fail(409, "لا يمكن تغيير وحدة سجل قائم؛ أنشئ صنفًا مستقلًا للوحدة الأخرى");
    if (data.itemKind && data.itemKind !== item.item_kind && cents(item.quantity) > 0n) fail(409, "لا تغيّر نوع صنف ذي رصيد قائم");
    if (data.serialNumber !== undefined && (data.serialNumber || null) !== item.serial_number)
      fail(409, "لا يمكن تغيير الرقم التسلسلي لسجل قائم؛ أنشئ سجلًا مستقلًا");
    if (data.active === false && cents(item.quantity) > 0n) fail(409, "لا يمكن أرشفة صنف له رصيد");
    if (data.warehouseId && data.warehouseId !== item.warehouse_id) {
      if (item.warehouse_id) fail(409, "نقل الرصيد يكون بسند تحويل بين المستودعات");
      if (!data.assignmentReason?.trim()) fail(400, "اكتب سبب ربط الرصيد القديم بهذا المستودع");
      await activeWarehouse(client, data.warehouseId);
      await client.query("UPDATE inventory SET warehouse_id=$2 WHERE id=$1", [id, data.warehouseId]);
      await recordMovement(client, { ...item, warehouse_id: data.warehouseId }, actor, {
        type: "adjustment", quantity: "0", reason: "warehouse_assignment", notes: data.assignmentReason, balanceAfter: item.quantity,
      });
    }
    await validCategory(client, data.categoryId);
    const columns: Record<string, string> = { materialNameAr: "material_name_ar", materialNameEn: "material_name_en",
      categoryId: "category_id", category: "category", sku: "sku", color: "color", imageUrl: "image_url",
      location: "location", itemKind: "item_kind", active: "active", minQuantity: "min_quantity", costPerUnit: "cost_per_unit" };
    const values: any[] = [id], sets: string[] = [];
    for (const [key, column] of Object.entries(columns)) if (data[key as keyof typeof data] !== undefined) {
      let value = data[key as keyof typeof data];
      if (key === "materialNameEn" && !value) value = data.materialNameAr || item.material_name_ar;
      if (["minQuantity", "costPerUnit"].includes(key)) value = value === null || value === "" ? null : amount(value, true);
      if (key === "minQuantity" && value === null) value = "0.00";
      values.push(value); sets.push(`${column}=$${values.length}`);
    }
    return camel((await client.query(`UPDATE inventory SET ${sets.length ? sets.join(",") + "," : ""}last_updated=now(),version=version+1 WHERE id=$1 RETURNING *`, values)).rows[0]);
  });
}
const movementSchema = z.object({
  key: keySchema, inventoryId: idSchema, type: z.enum(["stock_in", "stock_out", "adjustment"]), quantity: z.unknown(),
  reason: textSchema, notes: textSchema, receiverName: optionalText, expectedQuantity: z.unknown().optional(),
  expectedVersion: z.coerce.number().int().min(0).optional(),
  contractId: idSchema.nullable().optional(), supplierId: idSchema.nullable().optional(), workOrderId: idSchema.nullable().optional(),
});
export async function moveWarehouseStock(input: unknown, actor: number) {
  const data = movementSchema.parse(input), quantity = amount(data.quantity, data.type === "adjustment");
  if (data.type === "stock_out" && !data.receiverName) fail(400, "اسم المستلم أو الجهة المستلمة مطلوب للصرف");
  if (data.reason === "purchase") fail(400, "استلام أمر الشراء يتم من شاشة استلام المشتريات لمنع تكرار الإدخال");
  if (data.reason === "transfer") fail(400, "استخدم سند التحويل ليُسجّل الطرفان معًا");
  return operation("movement", actor, data, async client => {
    await lockItemSerial(client, data.inventoryId);
    const item = await lockedItem(client, data.inventoryId);
    validateItemQuantity(item, quantity);
    if (data.type === "stock_out" && cents(item.quantity) < cents(quantity)) fail(409, `الرصيد المتاح ${item.quantity} لا يكفي؛ أنشئ طلب احتياج للنقص`);
    if (data.type === "adjustment" && (data.expectedQuantity === undefined || cents(data.expectedQuantity) !== cents(item.quantity)))
      fail(409, "تغير الرصيد بعد فتح الجرد؛ حدّث البيانات وأعد العد قبل اعتماد التسوية");
    if (data.type === "adjustment" && data.expectedVersion !== item.version)
      fail(409, "حدثت حركة أو مراجعة للصنف بعد فتح الجرد؛ حدّث البيانات وأعد العد");
    if (data.reason === "supplier_return" && !data.supplierId) fail(400, "حدد المورد عند الإرجاع إليه");
    for (const [field, table] of [["supplierId", "suppliers"], ["contractId", "contracts"], ["workOrderId", "work_orders"]] as const) {
      if (data[field] && !(await client.query(`SELECT 1 FROM ${table} WHERE id=$1`, [data[field]])).rowCount)
        fail(400, "المرجع المرتبط بالحركة غير موجود");
    }
    const sign = data.type === "stock_out" ? "-" : "+";
    const updated = (await client.query(`UPDATE inventory SET quantity=${data.type === "adjustment" ? "$2::numeric" : `quantity${sign}$2::numeric`},
      last_updated=now(),version=version+1 WHERE id=$1 RETURNING *`, [item.id, quantity])).rows[0];
    validateItemQuantity(updated, updated.quantity);
    await verifySerializedBalance(client, updated);
    const deltaCents = cents(quantity) - cents(item.quantity);
    const abs = deltaCents < 0n ? -deltaCents : deltaCents;
    const delta = data.type === "adjustment" ? `${deltaCents < 0n ? "-" : ""}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}` : quantity;
    const movement = await recordMovement(client, item, actor, { ...data, quantity: delta, balanceAfter: updated.quantity });
    return { ...movement, item: camel(updated) };
  });
}
const transferSchema = z.object({ key: keySchema, inventoryId: idSchema, targetWarehouseId: idSchema, quantity: z.unknown(),
  receiverName: textSchema, notes: textSchema });
export async function transferWarehouseStock(input: unknown, actor: number) {
  const data = transferSchema.parse(input), quantity = amount(data.quantity);
  return operation("transfer", actor, data, async client => {
    // Transfers acquire a single transfer lock before item locks: opposite transfers cannot deadlock.
    await client.query("SELECT pg_advisory_xact_lock(884100)");
    await lockItemSerial(client, data.inventoryId);
    const source = await lockedItem(client, data.inventoryId);
    await activeWarehouse(client, data.targetWarehouseId);
    if (source.warehouse_id === data.targetWarehouseId) fail(400, "اختر مستودعًا مختلفًا للتحويل");
    validateItemQuantity(source, quantity);
    if (cents(source.quantity) < cents(quantity)) fail(409, "الرصيد غير كاف للتحويل");
    const matches = (await client.query(`SELECT * FROM inventory WHERE warehouse_id=$1 AND unit=$2 AND item_kind=$3 AND active=true
      AND material_name_ar=$4 AND sku IS NOT DISTINCT FROM $5 AND category_id IS NOT DISTINCT FROM $6
      AND serial_number IS NOT DISTINCT FROM $7 AND color IS NOT DISTINCT FROM $8 FOR UPDATE`,
    [data.targetWarehouseId, source.unit, source.item_kind, source.material_name_ar, source.sku, source.category_id, source.serial_number, source.color])).rows;
    if (matches.length > 1) fail(409, "يوجد أكثر من سجل مطابق في المستودع المستهدف؛ راجع تكرار الأصناف أولًا");
    let target = matches[0];
    if (!target) target = (await client.query(`INSERT INTO inventory(material_name_ar,material_name_en,sku,category,category_id,color,
      image_url,warehouse_id,unit,item_kind,serial_number,min_quantity,cost_per_unit,quantity)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,$12,0) RETURNING *`,
    [source.material_name_ar, source.material_name_en, source.sku, source.category, source.category_id, source.color,
      source.image_url, data.targetWarehouseId, source.unit, source.item_kind, source.serial_number, source.cost_per_unit])).rows[0];
    const out = (await client.query("UPDATE inventory SET quantity=quantity-$2::numeric,last_updated=now(),version=version+1 WHERE id=$1 RETURNING *", [source.id, quantity])).rows[0];
    const incoming = (await client.query(`UPDATE inventory SET cost_per_unit=CASE WHEN quantity+$2::numeric>0 THEN
      (quantity*COALESCE(cost_per_unit,0)+$2::numeric*$3::numeric)/(quantity+$2::numeric) ELSE cost_per_unit END,
      quantity=quantity+$2::numeric,last_updated=now(),version=version+1 WHERE id=$1 RETURNING *`, [target.id, quantity, source.cost_per_unit || 0])).rows[0];
    validateItemQuantity(incoming, incoming.quantity);
    await verifySerializedBalance(client, incoming);
    const reference = `TR-${source.id}-${target.id}-${Date.now()}`;
    const movement = await recordMovement(client, source, actor, { ...data, type: "stock_out", reason: "transfer", quantity, reference, balanceAfter: out.quantity });
    await recordMovement(client, target, actor, { ...data, type: "stock_in", reason: "transfer", quantity, reference, balanceAfter: incoming.quantity });
    return { movementId: movement.id, reference, source: camel(out), target: camel(incoming) };
  });
}
export async function archiveWarehouseItem(id: number, actor: number) {
  return editWarehouseItem(id, { active: false }, actor);
}
