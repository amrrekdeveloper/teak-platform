// Development-only schema fixture. Copies definitions, never employee/account data.
// This is not a production schema compatibility check.
import { randomUUID } from "node:crypto";

export async function createIsolatedHrSchema(db) {
  if (process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production")
    throw new Error("Development fixtures only");
  const schema = `hr_fixture_${randomUUID().replaceAll("-", "")}`;
  const quote = value => `"${String(value).replaceAll('"', '""')}"`;
  await db.query(`CREATE SCHEMA ${quote(schema)}`);
  try {
    const tables = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows;
    for (const { tablename } of tables)
      await db.query(`CREATE TABLE ${quote(schema)}.${quote(tablename)} (LIKE public.${quote(tablename)} INCLUDING ALL)`);
    // LIKE copies nextval expressions: replace every serial default before fixtures.
    const defaults = (await db.query(`SELECT table_name,column_name FROM information_schema.columns
      WHERE table_schema=$1 AND column_default LIKE 'nextval(%'`, [schema])).rows;
    for (const [index, { table_name, column_name }] of defaults.entries()) {
      const sequence = `${schema}.fixture_sequence_${index}`;
      await db.query(`CREATE SEQUENCE ${sequence}`);
      await db.query(`ALTER TABLE ${quote(schema)}.${quote(table_name)}
        ALTER COLUMN ${quote(column_name)} SET DEFAULT nextval('${sequence}'::regclass)`);
    }
    await db.query(`SET search_path TO ${quote(schema)},public`);
    // LIKE omits foreign keys. Recreate them against the fixture tables, not public.
    const fks = (await db.query(`SELECT c.conname,t.relname,pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND c.contype='f'`)).rows;
    for (const fk of fks)
      await db.query(`ALTER TABLE ${quote(schema)}.${quote(fk.relname)} ADD CONSTRAINT ${quote(fk.conname)}
        ${fk.definition.replaceAll("public.", `${quote(schema)}.`)}`);
    // Keep real database guards. Only known, inspected, search-path-local guards
    // are permitted here; fail instead of silently losing a newly added trigger.
    const safeGuards = ["teak_guard_employee_phone", "teak_attendance_assignment_guard"];
    const triggers = (await db.query(`SELECT pg_get_triggerdef(t.oid) AS definition,p.proname
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid
      WHERE n.nspname='public' AND NOT t.tgisinternal`)).rows;
    for (const trigger of triggers) {
      if (!safeGuards.includes(trigger.proname)) throw new Error("Unreviewed fixture trigger; isolation needs review");
      await db.query(trigger.definition.replaceAll("public.", `${quote(schema)}.`)
        .replace(`${quote(schema)}.${trigger.proname}(`, `public.${trigger.proname}(`));
    }
    // Synthetic reference catalog only. Never copy production or development users.
    await db.query(`INSERT INTO hr_departments(code,name_ar) VALUES('hr','Synthetic HR')`);
    const connection = new URL(process.env.DATABASE_URL);
    connection.searchParams.set("options", `-c search_path=${schema},public`);
    return { schema, connectionString: connection.href };
  } catch (error) {
    await db.query(`DROP SCHEMA ${quote(schema)} CASCADE`);
    throw error;
  }
}

export async function dropIsolatedHrSchema(db, schema) {
  if (!/^hr_fixture_[a-f0-9]{32}$/.test(schema)) throw new Error("Invalid fixture schema");
  await db.query(`DROP SCHEMA "${schema}" CASCADE`);
}
