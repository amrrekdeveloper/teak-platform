import { z } from "zod";
import { pool } from "./db";
import { activeWarehouse, camel, fail, idSchema, textSchema, transaction } from "./warehouse-domain";

const warehouseSchema = z.object({ nameAr: textSchema, nameEn: z.string().trim().max(2000).optional(),
  warehouseType: z.enum(["main", "sub"]).default("main"), parentWarehouseId: idSchema.nullable().optional(),
  address: z.string().trim().max(2000).default(""), description: z.string().trim().max(4000).default(""),
  sections: z.union([z.string().trim().max(4000), z.array(z.string().trim().max(500)).max(30)])
    .transform(value => Array.isArray(value) ? value.filter(Boolean).join("، ") : value).default(""),
  active: z.boolean().default(true) });
export async function saveWarehouse(id: number | null, input: unknown) {
  const data = warehouseSchema.parse(input);
  return transaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(884101)");
    if (id && !(await client.query("SELECT 1 FROM warehouses WHERE id=$1 FOR UPDATE", [id])).rowCount) fail(404, "المستودع غير موجود");
    if ((await client.query("SELECT 1 FROM warehouses WHERE lower(name_ar)=lower($1) AND id<>$2", [data.nameAr, id || 0])).rowCount)
      fail(409, "اسم المستودع مستخدم بالفعل");
    let parent: number | null = null;
    if (data.warehouseType === "sub") {
      if (!data.parentWarehouseId || data.parentWarehouseId === id) fail(400, "اختر مستودعًا رئيسيًا مختلفًا");
      const warehouse = await activeWarehouse(client, data.parentWarehouseId);
      if (warehouse.warehouse_type !== "main") fail(400, "المستودع الفرعي يتبع مستودعًا رئيسيًا");
      parent = data.parentWarehouseId;
    }
    if (id && (data.warehouseType !== "main" || !data.active) &&
      (await client.query("SELECT 1 FROM warehouses WHERE parent_warehouse_id=$1 AND active=true", [id])).rowCount)
      fail(409, "يوجد مستودع فرعي نشط؛ عدّل تبعيته أو أرشفه أولًا");
    if (id && !data.active && (await client.query("SELECT 1 FROM inventory WHERE warehouse_id=$1 AND quantity<>0", [id])).rowCount)
      fail(409, "لا يمكن أرشفة مستودع فيه أرصدة؛ انقلها أو صفّها أولًا");
    const values = [data.nameAr, data.nameEn || data.nameAr, data.warehouseType, parent, data.address, data.description, data.sections, data.active];
    const row = id
      ? (await client.query(`UPDATE warehouses SET name_ar=$1,name_en=$2,warehouse_type=$3,parent_warehouse_id=$4,
          address=$5,description=$6,sections=$7,active=$8 WHERE id=$9 RETURNING *`, [...values, id])).rows[0]
      : (await client.query(`INSERT INTO warehouses(name_ar,name_en,warehouse_type,parent_warehouse_id,address,description,sections,active)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, values)).rows[0];
    return camel(row);
  });
}
const categorySchema = z.object({ nameAr: textSchema, nameEn: z.string().trim().max(2000).optional(),
  parentId: idSchema.nullable().optional(), active: z.boolean().default(true) });
export async function saveWarehouseCategory(id: number | null, input: unknown) {
  const data = categorySchema.parse(input), parentId = data.parentId || null;
  return transaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(884101)");
    const categories = (await client.query("SELECT * FROM warehouse_categories")).rows;
    if (id && !categories.some(row => row.id === id)) fail(404, "التصنيف غير موجود");
    if (categories.some(row => row.id !== id && row.parent_id === parentId && row.name_ar.trim().toLowerCase() === data.nameAr.toLowerCase()))
      fail(409, "اسم التصنيف موجود تحت المستوى نفسه");
    let parent = parentId, seen = new Set<number>();
    while (parent) {
      if (parent === id || seen.has(parent)) fail(400, "لا يجوز إنشاء حلقة في التصنيفات");
      seen.add(parent);
      const row = categories.find(category => category.id === parent);
      if (!row?.active) fail(400, "اختر تصنيفًا نشطًا موجودًا");
      parent = row.parent_id;
      if (seen.size > 20) fail(400, "التصنيف أعمق من الحد المسموح");
    }
    if (id && !data.active && (categories.some(row => row.parent_id === id && row.active) ||
      (await client.query("SELECT 1 FROM inventory WHERE category_id=$1 AND active=true", [id])).rowCount))
      fail(409, "انقل الأصناف والتصنيفات الفرعية النشطة قبل أرشفة هذا التصنيف");
    const values = [data.nameAr, data.nameEn || data.nameAr, parentId, data.active];
    return camel(id ? (await client.query("UPDATE warehouse_categories SET name_ar=$1,name_en=$2,parent_id=$3,active=$4 WHERE id=$5 RETURNING *", [...values, id])).rows[0]
      : (await client.query("INSERT INTO warehouse_categories(name_ar,name_en,parent_id,active) VALUES($1,$2,$3,$4) RETURNING *", values)).rows[0]);
  });
}
export async function warehouseSummary() {
  const [warehouses, categories, items, pending] = await Promise.all([
    pool.query("SELECT * FROM warehouses ORDER BY active DESC,id"), pool.query("SELECT * FROM warehouse_categories ORDER BY id"),
    pool.query("SELECT * FROM inventory ORDER BY active DESC,material_name_ar,id"),
    pool.query("SELECT count(*)::int AS n FROM warehouse_requisitions WHERE status='pending'"),
  ]);
  return { warehouses: warehouses.rows.map(camel), categories: categories.rows.map(camel), items: items.rows.map(camel),
    stats: { warehouses: warehouses.rows.filter(row => row.active).length, items: items.rows.filter(row => row.active).length,
      lowStock: items.rows.filter(row => row.active && Number(row.quantity) <= Number(row.min_quantity)).length,
      unassigned: items.rows.filter(row => row.active && !row.warehouse_id).length, pendingRequests: pending.rows[0].n } };
}
