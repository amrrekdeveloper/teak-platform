import assert from "node:assert/strict";
import { pool } from "../server/db";
import {
  backfillDepartmentCatalog, requireDepartmentCatalogReady,
} from "../server/department-catalog";

// Development-only validation. All fixtures and test DDL are session-local TEMP objects,
// rolled back below; no real employee, department, attendance or leave record is changed.
if (process.env.NODE_ENV !== "development" || process.env.REPLIT_DEPLOYMENT === "1") {
  throw new Error("Run only in the development workspace.");
}

const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(`CREATE TEMP TABLE employees(id serial PRIMARY KEY,department public.department NOT NULL) ON COMMIT DROP`);
  await client.query(`CREATE TEMP TABLE hr_departments(
    id serial PRIMARY KEY,code public.department NOT NULL UNIQUE,name_ar text NOT NULL UNIQUE
  ) ON COMMIT DROP`);
  await client.query(`INSERT INTO pg_temp.employees(department) VALUES('sales'),('sales'),('hr'),('design')`);
  const before = (await client.query("SELECT id,department FROM pg_temp.employees ORDER BY id")).rows;
  await client.query("SAVEPOINT empty_catalog");
  await assert.rejects(
    client.query(`ALTER TABLE pg_temp.employees ADD CONSTRAINT employee_department_catalog
      FOREIGN KEY(department) REFERENCES pg_temp.hr_departments(code)`),
    (error: any) => error.code === "23503",
  );
  await client.query("ROLLBACK TO SAVEPOINT empty_catalog");
  await client.query("RELEASE SAVEPOINT empty_catalog");
  await assert.rejects(requireDepartmentCatalogReady(client), (error: any) => error.status === 503);
  console.log("PASS reproduced empty-catalog migration failure; unvalidated stage is blocked");

  await client.query("INSERT INTO pg_temp.hr_departments(code,name_ar) VALUES('production','المبيعات')");
  await backfillDepartmentCatalog(client);
  const catalog = (await client.query("SELECT code,name_ar FROM pg_temp.hr_departments ORDER BY code")).rows;
  assert.equal(catalog.length, 4);
  assert.equal(catalog.find(row => row.code === "production").name_ar, "المبيعات");
  assert.equal(catalog.find(row => row.code === "sales").name_ar, "المبيعات (sales)");
  await backfillDepartmentCatalog(client);
  assert.deepEqual((await client.query("SELECT code,name_ar FROM pg_temp.hr_departments ORDER BY code")).rows, catalog);
  assert.deepEqual((await client.query("SELECT id,department FROM pg_temp.employees ORDER BY id")).rows, before);
  console.log("PASS existing-table backfill, name preservation, idempotency, and unchanged employees");

  await client.query(`ALTER TABLE pg_temp.employees ADD CONSTRAINT employee_department_catalog
    FOREIGN KEY(department) REFERENCES pg_temp.hr_departments(code)`);
  await requireDepartmentCatalogReady(client);
  await client.query("SAVEPOINT valid_catalog");
  await assert.rejects(client.query("DELETE FROM pg_temp.hr_departments WHERE code='sales'"),
    (error: any) => error.code === "23503");
  await client.query("ROLLBACK TO SAVEPOINT valid_catalog");
  await assert.rejects(client.query("INSERT INTO pg_temp.employees(department) VALUES('it')"),
    (error: any) => error.code === "23503");
  await client.query("ROLLBACK TO SAVEPOINT valid_catalog");
  console.log("PASS phase-two FK validates and protects referenced departments and new assignments");
} finally {
  await client.query("ROLLBACK");
  client.release();
  await pool.end();
}
