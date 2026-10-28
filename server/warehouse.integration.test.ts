import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { pool } from "./db";
import { saveWarehouse, saveWarehouseCategory } from "./warehouse-catalog";
import { amount } from "./warehouse-domain";
import { createWarehouseItem, editWarehouseItem, moveWarehouseStock, transferWarehouseStock } from "./warehouse-stock";
import { createWarehouseRequisition, decideWarehouseRequisition, receiveWarehousePurchase, updateWarehousePurchaseOrder } from "./warehouse-procurement";

const marker = `wh_test_${randomUUID().slice(0, 8)}`;
let actor: number, main: any, sub: any, category: any, child: any, supplier: number;
const key = () => randomUUID();
const item = (quantity = "30", extras: any = {}) => createWarehouseItem({ key: key(), materialNameAr: `${marker} خشب`,
  warehouseId: main.id, categoryId: category.id, unit: "meter", quantity, minQuantity: "3", ...extras }, actor);
const move = (id: number, quantity: string, extras: any = {}) => moveWarehouseStock({
  key: key(), inventoryId: id, type: "stock_out", quantity, reason: "production_use",
  notes: "استخدام اختباري معزول", receiverName: "مستلم اختباري", ...extras }, actor);
beforeAll(async () => {
  actor = (await pool.query(`INSERT INTO users(username,password,role,full_name_ar,full_name_en,active) VALUES($1,'synthetic-not-a-login','warehouse',$1,$1,true) RETURNING id`, [marker])).rows[0].id;
  main = await saveWarehouse(null, { nameAr: marker, warehouseType: "main", sections: "غرفتان وساحة تسليم" });
  sub = await saveWarehouse(null, { nameAr: `${marker}_sub`, warehouseType: "sub", parentWarehouseId: main.id });
  category = await saveWarehouseCategory(null, { nameAr: marker });
  child = await saveWarehouseCategory(null, { nameAr: `${marker}_child`, parentId: category.id });
  supplier = (await pool.query("INSERT INTO suppliers(name,approval_status,active) VALUES($1,'approved',true) RETURNING id", [marker])).rows[0].id;
});
afterAll(async () => {
  if (!actor) return;
  // Only rows in this random, isolated fixture are removed. No production access.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM warehouse_purchase_receipts WHERE purchase_order_id IN(SELECT id FROM purchase_orders WHERE created_by=$1)", [actor]);
    await client.query("DELETE FROM warehouse_requisitions WHERE created_by=$1", [actor]);
    await client.query("DELETE FROM inventory_transactions WHERE performed_by=$1", [actor]);
    await client.query("DELETE FROM purchase_orders WHERE created_by=$1", [actor]);
    await client.query("DELETE FROM inventory WHERE warehouse_id IN(SELECT id FROM warehouses WHERE name_ar LIKE $1)", [`${marker}%`]);
    await client.query("DELETE FROM warehouse_categories WHERE name_ar LIKE $1", [`${marker}%`]);
    await client.query("DELETE FROM warehouses WHERE name_ar LIKE $1", [`${marker}%`]);
    await client.query("DELETE FROM warehouse_operations WHERE performed_by=$1", [actor]);
    await client.query("DELETE FROM suppliers WHERE id=$1", [supplier]);
    await client.query("DELETE FROM users WHERE id=$1", [actor]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
});
describe("warehouse quantities and immutable stock evidence (real PostgreSQL)", () => {
  it("normalizes Arabic/Persian quantities and rejects malformed/negative/NaN/overprecision", () => {
    expect(amount("٣٠٫٥")).toBe("30.50");
    expect(amount("۱۲.۲۵")).toBe("12.25");
    for (const value of ["NaN", "Infinity", "-1", "1.111", "١٬٢", "", "0"])
      expect(() => amount(value)).toThrow();
    expect(amount("0", true)).toBe("0.00");
  });
  it("records 30 - 5 - 6 = 19, including recipient and after-balance", async () => {
    const wood = await item();
    const a = await move(wood.id, "٥"), b = await move(wood.id, "6");
    expect(a.balanceAfter).toBe("25.00");
    expect(b.balanceAfter).toBe("19.00");
    expect(b.receiverName).toBe("مستلم اختباري");
    await expect(move(wood.id, "20")).rejects.toMatchObject({ status: 409 });
    expect((await pool.query("SELECT quantity FROM inventory WHERE id=$1", [wood.id])).rows[0].quantity).toBe("19.00");
  });
  it("serializes competing issues and never records a failed movement", async () => {
    const wood = await item();
    const results = await Promise.allSettled([move(wood.id, "20"), move(wood.id, "20")]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect((await pool.query("SELECT quantity FROM inventory WHERE id=$1", [wood.id])).rows[0].quantity).toBe("10.00");
    expect((await pool.query("SELECT count(*)::int AS n FROM inventory_transactions WHERE inventory_id=$1", [wood.id])).rows[0].n).toBe(2);
  });
  it("returns the same result for retries and rejects key reuse with different content", async () => {
    const wood = await item(), requestKey = key();
    const a = await move(wood.id, "5", { key: requestKey }), b = await move(wood.id, "5", { key: requestKey });
    expect(a.id).toBe(b.id);
    expect((b as any).replayed).toBe(true);
    await expect(move(wood.id, "6", { key: requestKey })).rejects.toMatchObject({ status: 409 });
    expect((await pool.query("SELECT quantity FROM inventory WHERE id=$1", [wood.id])).rows[0].quantity).toBe("25.00");
  });
  it("rejects an old count even when intervening issues and returns restore the same balance", async () => {
    const wood = await item();
    await move(wood.id, "5");
    await move(wood.id, "5", { type: "stock_in", reason: "production_return" });
    await expect(move(wood.id, "0", { type: "adjustment", reason: "inventory_count", expectedQuantity: "30", expectedVersion: 0 }))
      .rejects.toMatchObject({ status: 409 });
    expect((await pool.query("SELECT quantity,version FROM inventory WHERE id=$1", [wood.id])).rows[0]).toMatchObject({ quantity: "30.00", version: 2 });
  });
  it("transfers with paired evidence and conserved balances", async () => {
    const wood = await item("30", { sku: `${marker}-transfer` });
    const transfer = await transferWarehouseStock({ key: key(), inventoryId: wood.id, targetWarehouseId: sub.id,
      quantity: "6.25", receiverName: "مستلم تجريبي", notes: "تحويل معزول" }, actor);
    expect(transfer.source.quantity).toBe("23.75");
    expect(transfer.target.quantity).toBe("6.25");
    const rows = (await pool.query("SELECT * FROM inventory_transactions WHERE reference=$1", [transfer.reference])).rows;
    expect(rows).toHaveLength(2);
    expect(rows.map(row => row.type).sort()).toEqual(["stock_in", "stock_out"]);
  });
  it("requires fresh count evidence and permits an actual count of zero", async () => {
    const wood = await item();
    await move(wood.id, "5");
    await expect(move(wood.id, "0", { type: "adjustment", reason: "inventory_count", expectedQuantity: "30" })).rejects.toMatchObject({ status: 409 });
    const count = await move(wood.id, "0", { type: "adjustment", reason: "inventory_count", expectedQuantity: "25", expectedVersion: 1 });
    expect(count.balanceAfter).toBe("0.00");
    expect(count.quantity).toBe("-25.00");
  });
  it("refuses direct balance edits and archiving occupied warehouses", async () => {
    const wood = await item();
    await expect(editWarehouseItem(wood.id, { quantity: "90" }, actor)).rejects.toMatchObject({ status: 400 });
    await expect(saveWarehouse(main.id, { nameAr: marker, warehouseType: "main", active: false })).rejects.toMatchObject({ status: 409 });
  });
  it("supports direct parent-category items and children but refuses cycles", async () => {
    expect((await item("0")).categoryId).toBe(category.id);
    expect((await item("0", { categoryId: child.id })).categoryId).toBe(child.id);
    await expect(saveWarehouseCategory(category.id, { nameAr: marker, parentId: child.id })).rejects.toMatchObject({ status: 400 });
  });
  it("distinguishes whole equipment from fractional materials", async () => {
    await expect(item("1.5", { unit: "piece", itemKind: "equipment" })).rejects.toMatchObject({ status: 400 });
    const equipment = await item("1", { unit: "piece", itemKind: "equipment", serialNumber: `${marker}-machine` });
    expect(equipment.itemKind).toBe("equipment");
    await expect(item("1", { unit: "piece", itemKind: "equipment", serialNumber: `${marker}-machine` })).rejects.toMatchObject({ status: 409 });
  });
});
describe("canonical procurement requests and physical receipts", () => {
  it("rejects a request with reason, without increasing stock or creating an order", async () => {
    const wood = await item("0");
    const request = await createWarehouseRequisition({ key: key(), inventoryId: wood.id, quantity: "10", reason: "نقص", requestedFor: "فريق تجريبي" }, actor);
    const result = await decideWarehouseRequisition(request.id, { key: key(), decision: "rejected", note: "طلب غير مطلوب في الاختبار" }, actor);
    expect(result.status).toBe("rejected");
    expect(result.purchaseOrderId).toBeNull();
    expect((await pool.query("SELECT quantity FROM inventory WHERE id=$1", [wood.id])).rows[0].quantity).toBe("0.00");
  });
  it("approves once, creates an existing-style PO, receives partially, and blocks over-receipt/replay", async () => {
    const wood = await item("0");
    const request = await createWarehouseRequisition({ key: key(), inventoryId: wood.id, quantity: "10", reason: "نفاد الخشب", requestedFor: "عامل تجريبي" }, actor);
    const approved = await decideWarehouseRequisition(request.id, { key: key(), decision: "approved", note: "شراء اختبار", supplierId: supplier, unitPrice: "2.50" }, actor);
    const id = approved.purchaseOrderId, receiveKey = key();
    expect(id).toBeTruthy();
    await expect(decideWarehouseRequisition(request.id, { key: key(), decision: "rejected", note: "قرار ثان" }, actor)).rejects.toMatchObject({ status: 409 });
    await expect(receiveWarehousePurchase({ key: receiveKey, purchaseOrderId: id, lineIndex: 0, inventoryId: wood.id, quantity: "4", notes: "استلام أول" }, actor)).rejects.toMatchObject({ status: 409 });
    await updateWarehousePurchaseOrder(id, { status: "approved" }, actor);
    const payload = { key: receiveKey, purchaseOrderId: id, lineIndex: 0, inventoryId: wood.id, quantity: "4", notes: "استلام أول" };
    const first = await receiveWarehousePurchase(payload, actor), retry = await receiveWarehousePurchase(payload, actor);
    expect(first.movement.id).toBe(retry.movement.id);
    expect(first.item.quantity).toBe("4.00");
    expect(first.completed).toBe(false);
    await expect(receiveWarehousePurchase({ ...payload, key: key(), quantity: "7" }, actor)).rejects.toMatchObject({ status: 409 });
    await expect(updateWarehousePurchaseOrder(id, { status: "cancelled" }, actor)).rejects.toMatchObject({ status: 409 });
    const final = await receiveWarehousePurchase({ ...payload, key: key(), quantity: "6", notes: "تكملة الاستلام" }, actor);
    expect(final.completed).toBe(true);
    expect(final.item.quantity).toBe("10.00");
    expect(final.item.costPerUnit).toBe("2.50");
    expect((await pool.query("SELECT status FROM purchase_orders WHERE id=$1", [id])).rows[0].status).toBe("received");
    await expect(updateWarehousePurchaseOrder(id, { status: "ordered" }, actor)).rejects.toMatchObject({ status: 409 });
  });
});
