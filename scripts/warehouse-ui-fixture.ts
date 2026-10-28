/** Synthetic development-only browser fixture. Never operates on production. */
import { randomUUID, randomBytes } from "node:crypto";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { pool } from "../server/db";
import { hashPassword } from "../server/auth";
const file = "/tmp/teak-warehouse-ui-fixture.json";
if (process.env.NODE_ENV !== "development" || process.env.REPLIT_DEPLOYMENT === "1") throw new Error("Development only");
try {
  if (process.argv[2] === "create") {
    const marker = `WH-UI-${randomUUID().slice(0, 8)}`, users: Record<string, any> = {};
    for (const role of ["warehouse", "purchasing", "owner"]) {
      const username = `${marker}_${role}`, password = randomBytes(18).toString("hex");
      const hash = await hashPassword(password);
      const id = (await pool.query(`INSERT INTO users(username,password,role,full_name_ar,full_name_en,active)
        VALUES($1,$2,$3,$1,$1,true) RETURNING id`, [username, hash, role])).rows[0].id;
      users[role] = { id, username, password };
    }
    const supplierId = (await pool.query("INSERT INTO suppliers(name,approval_status,active) VALUES($1,'approved',true) RETURNING id", [marker])).rows[0].id;
    await writeFile(file, JSON.stringify({ marker, users, supplierId }), { mode: 0o600 });
    console.log("Synthetic browser fixture ready; credentials remain in the private temporary file.");
  } else if (process.argv[2] === "cleanup") {
    const fixture = JSON.parse(await readFile(file, "utf8")), ids = Object.values(fixture.users).map((user: any) => user.id);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const verified = await client.query("SELECT id FROM users WHERE id=ANY($1::int[]) AND username LIKE $2", [ids, `${fixture.marker}_%`]);
      if (verified.rowCount !== ids.length) throw new Error("Fixture identity mismatch");
      // Posted entries here belong only to this isolated development test.
      await client.query("DELETE FROM journal_entry_lines WHERE entry_id IN(SELECT id FROM journal_entries WHERE created_by=ANY($1::int[]))", [ids]);
      await client.query("DELETE FROM journal_entries WHERE created_by=ANY($1::int[])", [ids]);
      await client.query("DELETE FROM warehouse_purchase_receipts WHERE purchase_order_id IN(SELECT id FROM purchase_orders WHERE created_by=ANY($1::int[]))", [ids]);
      await client.query("DELETE FROM warehouse_requisitions WHERE created_by=ANY($1::int[])", [ids]);
      await client.query("DELETE FROM inventory_transactions WHERE performed_by=ANY($1::int[])", [ids]);
      await client.query("DELETE FROM purchase_orders WHERE created_by=ANY($1::int[])", [ids]);
      await client.query("DELETE FROM inventory WHERE warehouse_id IN(SELECT id FROM warehouses WHERE name_ar LIKE $1)", [`${fixture.marker}%`]);
      await client.query("DELETE FROM warehouse_categories WHERE name_ar LIKE $1", [`${fixture.marker}%`]);
      await client.query("DELETE FROM warehouses WHERE name_ar LIKE $1", [`${fixture.marker}%`]);
      await client.query("DELETE FROM warehouse_operations WHERE performed_by=ANY($1::int[])", [ids]);
      await client.query("DELETE FROM notifications WHERE user_id=ANY($1::int[])", [ids]);
      await client.query("DELETE FROM user_sessions WHERE sess->>'userId'=ANY($1::text[])", [ids.map(String)]);
      await client.query("DELETE FROM suppliers WHERE id=$1 AND name=$2", [fixture.supplierId, fixture.marker]);
      await client.query("DELETE FROM users WHERE id=ANY($1::int[])", [ids]);
      await client.query("COMMIT");
      await unlink(file);
      console.log("Synthetic warehouse records, sessions and journal evidence removed.");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  } else throw new Error("Use create or cleanup");
} finally { await pool.end(); }
