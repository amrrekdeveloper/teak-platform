import { pool } from "./db";

// Preserve legacy duplicates, but reject any NEW conflicting identity at DB level.
export async function initializeHrDataIntegrity() {
  await pool.query(`
    ALTER TABLE employees ADD COLUMN IF NOT EXISTS date_of_birth date;
    CREATE OR REPLACE FUNCTION teak_hr_phone(v text) RETURNS text
    LANGUAGE sql IMMUTABLE AS $$
      SELECT CASE
        WHEN n ~ '^05[0-9]{8}$' THEN '966' || substring(n from 2)
        WHEN n ~ '^9665[0-9]{8}$' THEN n
        WHEN n ~ '^009665[0-9]{8}$' THEN substring(n from 3)
        ELSE NULL END
      FROM (SELECT regexp_replace(translate(coalesce(v,''),'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'),'[^0-9]','','g') n) s
    $$;
    CREATE INDEX IF NOT EXISTS employees_normalized_phone_lookup ON employees(teak_hr_phone(phone));
    CREATE OR REPLACE FUNCTION teak_guard_employee_phone() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE normalized text;
    BEGIN
      IF TG_OP='UPDATE' AND NEW.phone IS NOT DISTINCT FROM OLD.phone THEN RETURN NEW; END IF;
      normalized := teak_hr_phone(NEW.phone);
      IF normalized IS NULL THEN RETURN NEW; END IF;
      PERFORM pg_advisory_xact_lock(hashtextextended(normalized,51803));
      IF EXISTS(SELECT 1 FROM employees WHERE id <> NEW.id AND teak_hr_phone(phone)=normalized) THEN
        RAISE EXCEPTION 'Employee mobile already registered' USING ERRCODE='23505';
      END IF;
      RETURN NEW;
    END $$;
    DROP TRIGGER IF EXISTS teak_employee_phone_guard ON employees;
    CREATE TRIGGER teak_employee_phone_guard BEFORE INSERT OR UPDATE OF phone ON employees
    FOR EACH ROW EXECUTE FUNCTION teak_guard_employee_phone();
  `);
}

// Lock the record and check all employee_id dependencies, including legacy
// tables without foreign keys. Never erase audits/assets as a side effect.
export async function deleteUnusedEmployee(id: number) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [employee] } = await client.query("SELECT * FROM employees WHERE id=$1 FOR UPDATE", [id]);
    if (!employee) throw Object.assign(new Error("الموظف غير موجود"), { status: 404 });
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
    const start = String(employee.contract_start instanceof Date ? employee.contract_start.toISOString().slice(0,10) : employee.contract_start);
    if (start <= today || employee.user_id || (employee.documents?.length ?? 0) > 0)
      throw Object.assign(new Error("لا يمكن حذف موظف باشر العمل أو له مستندات أو حساب مرتبط. استخدم إنهاء الخدمة أو تعطيل الموظف."), { status: 409 });
    const { rows: tables } = await client.query("SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='employee_id'");
    for (const { table_name } of tables) {
      if (!/^[a-z_][a-z0-9_]*$/.test(table_name)) throw new Error("Invalid table identifier");
      const result = await client.query(`SELECT 1 FROM "${table_name}" WHERE employee_id=$1 LIMIT 1`, [id]);
      if (result.rowCount) throw Object.assign(new Error("للموظف سجلات مرتبطة محفوظة؛ الحذف الدائم غير مسموح."), { status: 409 });
    }
    await client.query("DELETE FROM employees WHERE id=$1", [id]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
