import type { PoolClient } from "pg";
import { pool } from "./db";

const departmentNames: Record<string, string> = {
  sales: "المبيعات", design: "التصميم", production: "الإنتاج", warehouse: "المستودع",
  finance: "المالية", hr: "الموارد البشرية", it: "تقنية المعلومات", delivery: "التوصيل",
  installation: "التركيب", quality: "الجودة", management: "الإدارة",
  customer_service: "خدمة العملاء", purchasing: "المشتريات",
};

export const departmentCatalogTransitionMessage =
  "تحديث دليل الأقسام قيد الإكمال. إضافة الموظفين وتعديل أقسامهم وإدارة الأقسام متوقفة مؤقتًا حتى اكتمال مرحلة النشر الثانية.";

type CatalogConnection = Pick<PoolClient, "query">;

// Publish creates the table; application initialization supplies only missing referenced data.
// The caller holds a transaction and the exclusive catalog advisory lock.
export async function backfillDepartmentCatalog(client: CatalogConnection) {
  const missing = await client.query<{ code: string }>(`
    SELECT DISTINCT e.department::text AS code
    FROM employees e LEFT JOIN hr_departments d ON d.code=e.department
    WHERE d.code IS NULL ORDER BY code
  `);
  if (!missing.rows.length) return;
  const names = new Set((await client.query<{ name_ar: string }>(
    "SELECT name_ar FROM hr_departments",
  )).rows.map(row => row.name_ar));
  for (const { code } of missing.rows) {
    const base = departmentNames[code] || code;
    let name = base;
    let suffix = 1;
    while (names.has(name)) {
      name = `${base} (${code}${suffix > 1 ? `-${suffix}` : ""})`;
      suffix++;
    }
    await client.query(
      "INSERT INTO hr_departments(code,name_ar) VALUES($1,$2) ON CONFLICT(code) DO NOTHING",
      [code, name],
    );
    names.add(name);
  }
}

export async function bootstrapDepartmentCatalog() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(51804)");
    await client.query("LOCK TABLE employees IN SHARE MODE");
    await backfillDepartmentCatalog(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function requireDepartmentCatalogReady(client: CatalogConnection = pool) {
  const { rows: [state] } = await client.query<{ ready: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname='employee_department_catalog' AND contype='f' AND convalidated
        AND conrelid='employees'::regclass AND confrelid='hr_departments'::regclass
        AND confdeltype IN ('a','r')
    ) AS ready
  `);
  if (!state?.ready) {
    throw Object.assign(new Error(departmentCatalogTransitionMessage), { status: 503 });
  }
}

// A session lock spans the existing enum-add + insert commits. The dev-side constraint
// transition takes the exclusive counterpart, so no checked write can straddle it.
export async function withDepartmentCatalogWrite<T>(
  write: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let locked = false;
  let discard = false;
  try {
    await client.query("SELECT pg_advisory_lock_shared(51804)");
    locked = true;
    await requireDepartmentCatalogReady(client);
    return await write(client);
  } finally {
    if (locked) {
      try {
        await client.query("SELECT pg_advisory_unlock_shared(51804)");
      } catch {
        discard = true;
      }
    } else {
      discard = true;
    }
    client.release(discard);
  }
}
