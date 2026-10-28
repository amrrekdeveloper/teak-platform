import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { pool } from "./db";
import { toLatinEditableDigits } from "../shared/digits";

export class WarehouseError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function fail(status: number, message: string): never { throw new WarehouseError(status, message); }
export const idSchema = z.coerce.number().int().positive();
export const textSchema = z.string().trim().min(1).max(2000);
export const keySchema = z.string().uuid().optional();
export function amount(value: unknown, allowZero = false): string {
  const raw = toLatinEditableDigits(typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "");
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(raw)) return fail(400, "أدخل كمية صحيحة حتى منزلتين عشريتين، دون إشارة سالبة");
  const [whole, fraction = ""] = raw.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if ((!allowZero && cents === 0n) || cents > 999999999999n) return fail(400, "الكمية خارج الحدود المسموحة");
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}
export function cents(value: unknown) { return BigInt(amount(value, true).replace(".", "")); }
export function validateItemQuantity(item: any, quantity: string) {
  if (["piece", "sheet"].includes(item.unit) && cents(quantity) % 100n !== 0n)
    fail(400, "هذه الوحدة تُسجّل بأعداد صحيحة فقط؛ استخدم المتر أو المتر المربع للأجزاء");
  if (item.serial_number && cents(quantity) > 100n) fail(400, "الصنف ذو الرقم التسلسلي يُسجّل كوحدة واحدة");
}
export function camel(row: any): any {
  if (!row) return row;
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), value]));
}
export async function transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { await client.query("BEGIN"); const result = await run(client); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
/** A retry returns the original result, but reusing a key for different data is refused. */
export async function operation<T>(kind: string, actor: number, data: Record<string, any>, run: (client: PoolClient) => Promise<T>): Promise<T> {
  const { key: suppliedKey, ...payload } = data;
  const key = `${actor}:${keySchema.parse(suppliedKey) || randomUUID()}`;
  const hash = createHash("sha256").update(JSON.stringify({ kind, ...payload })).digest("hex");
  return transaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [key]);
    const existing = (await client.query("SELECT payload_hash,result FROM warehouse_operations WHERE key=$1", [key])).rows[0];
    if (existing) {
      if (existing.payload_hash !== hash) fail(409, "هذا المرجع استُخدم لعملية أخرى؛ حدّث النموذج قبل الإرسال");
      return { ...existing.result, replayed: true } as T;
    }
    const result = await run(client);
    await client.query("INSERT INTO warehouse_operations(key,payload_hash,result,performed_by) VALUES($1,$2,$3::jsonb,$4)",
      [key, hash, JSON.stringify(result), actor]);
    return result;
  });
}
export async function activeWarehouse(client: PoolClient, id: number) {
  const warehouse = (await client.query("SELECT * FROM warehouses WHERE id=$1 FOR SHARE", [id])).rows[0];
  if (!warehouse?.active) fail(400, "اختر مستودعًا نشطًا");
  return warehouse;
}
export async function lockedItem(client: PoolClient, id: number, allowUnassigned = false) {
  const item = (await client.query("SELECT * FROM inventory WHERE id=$1 FOR UPDATE", [id])).rows[0];
  if (!item) fail(404, "المادة غير موجودة");
  if (!item.active) fail(409, "الصنف مؤرشف؛ فعّله أولًا");
  if (!item.warehouse_id && !allowUnassigned) fail(409, "اربط الرصيد القديم بمستودع أولًا من تعديل الصنف");
  if (item.warehouse_id) await activeWarehouse(client, item.warehouse_id);
  return item;
}
export async function lockItemSerial(client: PoolClient, id: number) {
  const row = (await client.query("SELECT serial_number FROM inventory WHERE id=$1", [id])).rows[0];
  if (row?.serial_number) await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`serial:${row.serial_number}`]);
}
export async function verifySerializedBalance(client: PoolClient, item: any) {
  if (item.serial_number && cents(item.quantity) > 0n &&
    (await client.query("SELECT 1 FROM inventory WHERE serial_number=$1 AND id<>$2 AND quantity>0", [item.serial_number, item.id])).rowCount)
    fail(409, "الوحدة ذات الرقم التسلسلي موجودة في مستودع آخر؛ استخدم التحويل بدل تكرارها");
}
export async function recordMovement(client: PoolClient, item: any, actor: number, data: {
  type: string; quantity: string; reason: string; notes: string; receiverName?: string | null;
  reference?: string; purchaseOrderId?: number; contractId?: number | null; supplierId?: number | null; workOrderId?: number | null;
  balanceAfter: string;
}) {
  const row = (await client.query(`INSERT INTO inventory_transactions
    (inventory_id,type,quantity,reason,notes,warehouse_id,receiver_name,balance_after,reference,performed_by,purchase_order_id,contract_id,supplier_id,work_order_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
  [item.id, data.type, data.quantity, data.reason, data.notes, item.warehouse_id, data.receiverName || null,
    data.balanceAfter, data.reference || null, actor, data.purchaseOrderId || null, data.contractId || null,
    data.supplierId || null, data.workOrderId || null])).rows[0];
  return camel(row);
}
