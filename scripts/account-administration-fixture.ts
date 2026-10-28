/**
 * Development-only, disposable verification fixture. Never changes credentials
 * or the designated owner binding. The owner's temporary test session is removed
 * by exact SID; no other owner session is touched. No credentials are printed.
 */
import { randomBytes, createHmac } from "node:crypto";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { pool } from "../server/db";
import { hashPassword } from "../server/auth";
const file = "/tmp/teak-account-administration-fixture.json";
if (process.env.NODE_ENV === "production" || !process.env.REPLIT_DEV_DOMAIN?.endsWith(".replit.dev"))
  throw new Error("This fixture is restricted to the development preview.");
const mode = process.argv[2] ?? "prepare";
try {
  if (mode === "cleanup") {
    const fixture = JSON.parse(await readFile(file, "utf8"));
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const ids = (await client.query("SELECT id FROM users WHERE left(username,length($1))=$1", [fixture.marker])).rows.map(r => r.id);
      await client.query("DELETE FROM teak_system_admin_audit WHERE target_id=ANY($1::int[])", [ids]);
      await client.query("DELETE FROM user_sessions WHERE sid=$1 OR sess->>'userId'=ANY($2::text[])", [fixture.sid, ids.map(String)]);
      await client.query("DELETE FROM employees WHERE left(employee_number,length($1))=$1", [fixture.marker]);
      await client.query("DELETE FROM user_permissions WHERE user_id=ANY($1::int[])", [ids]);
      await client.query("DELETE FROM users WHERE id=ANY($1::int[])", [ids]);
      await client.query("COMMIT");
      await unlink(file);
      console.log("Disposable account fixtures and their exact sessions removed.");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  } else if (mode === "prepare") {
    try { await readFile(file); throw new Error("An account fixture already exists; clean it first."); }
    catch (error: any) { if (error.code !== "ENOENT") throw error; }
    const owner = (await pool.query(`SELECT a.user_id FROM teak_system_admin a JOIN users u ON u.id=a.user_id
      WHERE a.singleton=true AND u.active=true AND u.archived=false AND u.role='owner'`)).rows[0];
    if (!owner || !process.env.SESSION_SECRET) throw new Error("The development owner/session service is not ready.");
    const marker = "uatest_" + randomBytes(5).toString("hex");
    const password = "Ua" + randomBytes(9).toString("hex") + "9!";
    const sid = "account-verification-" + randomBytes(24).toString("hex");
    const signature = createHmac("sha256", process.env.SESSION_SECRET).update(sid).digest("base64").replace(/=+$/, "");
    const cookie = encodeURIComponent("s:" + sid + "." + signature);
    const client = await pool.connect();
    await client.query("BEGIN");
    try {
    await client.query("INSERT INTO user_sessions(sid,sess,expire) VALUES($1,$2,now()+interval '45 minutes')",
      [sid, { cookie: { originalMaxAge: 2700000, expires: new Date(Date.now() + 2700000).toISOString(), httpOnly: true, secure: false, sameSite: "lax" },
        userId: owner.user_id, adminAuthenticated: true, systemAdminWorkspace: true }]);
    const legacy = (await client.query(`INSERT INTO users(username,password,role,full_name_ar,full_name_en)
      VALUES($1,$2,'warehouse',$3,$3) RETURNING id`, [marker + "_legacy", await hashPassword(password), marker + " legacy"])).rows[0];
    const employees = [];
    for (let i = 0; i < 3; i++) {
      const result = await client.query(`INSERT INTO employees(employee_number,full_name_ar,full_name_en,nationality,position,department,monthly_salary,user_id,contract_start)
        VALUES($1,$2,$2,(SELECT nationality FROM employees ORDER BY id LIMIT 1),'اختبار',(SELECT department FROM employees ORDER BY id LIMIT 1),0,$3,CURRENT_DATE) RETURNING id`,
      [marker + "_employee_" + i, marker + " موظف " + i, i === 1 ? legacy.id : null]);
      employees.push(result.rows[0].id);
    }
    await writeFile(file, JSON.stringify({ marker, password, sid, ownerCookie: cookie, legacyId: legacy.id, employeeIds: employees }), { mode: 0o600 });
    await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
    console.log("Disposable account fixture prepared; private browser inputs are in " + file);
  } else throw new Error("Expected prepare or cleanup.");
} finally { await pool.end(); }
