import { randomUUID, scryptSync, randomBytes } from "node:crypto";
import pg from "pg";
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest";
import { tokenHash } from "./employee-portal/security";

const state = vi.hoisted(() => ({ pool: undefined as unknown as pg.Pool }));
vi.mock("./db", () => ({ get pool() { return state.pool; } }));
import { recoverSystemAdminPassword } from "./system-admin-recovery";

// Opt-in integration test. Minimal synthetic schema, no public tables/data,
// independent sequences, no production connection or real credentials.
const enabled = process.env.OWNER_RECOVERY_POSTGRES_TEST === "1";
const schema = `owner_recovery_fixture_${randomUUID().replaceAll("-", "")}`;
const newPassword = "Aa1!xx";
const hash = async (value: string) => {
  const salt = randomBytes(16).toString("hex");
  return `${scryptSync(value, salt, 64).toString("hex")}.${salt}`;
};
let admin: pg.Client;
describe.skipIf(!enabled)("owner recovery with real PostgreSQL transactions", () => {
  beforeAll(async () => {
    if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT === "1")
      throw new Error("Development-only isolated tests");
    admin = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await admin.connect();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    state.pool = new pg.Pool({ connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema}` });
    await state.pool.query(`
      CREATE TABLE users(id integer PRIMARY KEY, username text, password text,
        role text, active boolean, archived boolean);
      CREATE TABLE teak_system_admin(singleton boolean PRIMARY KEY, user_id integer REFERENCES users);
      CREATE TABLE teak_system_admin_audit(id bigserial PRIMARY KEY,
        actor_id integer REFERENCES users,target_id integer REFERENCES users,action text NOT NULL);
      CREATE TABLE user_sessions(sid text PRIMARY KEY,sess json,expire timestamptz);
      CREATE TABLE employee_portal_limits(key text PRIMARY KEY,count integer);
    `);
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await state.pool?.end();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  });
  beforeEach(async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("TEAK_SYSTEM_ADMIN_USERNAME", "khalid90");
    vi.stubEnv("TEAK_SYSTEM_ADMIN_RECOVERY_PASSWORD", newPassword);
    const request = randomUUID();
    for (const environment of ["development", "production"]) {
      vi.stubEnv(`TEAK_SYSTEM_ADMIN_RECOVERY_${environment.toUpperCase()}_ID`, request);
      vi.stubEnv(`TEAK_SYSTEM_ADMIN_RECOVERY_${environment.toUpperCase()}_ENABLED`, environment);
    }
    await state.pool.query("TRUNCATE teak_system_admin_audit,teak_system_admin,users,user_sessions,employee_portal_limits");
    await state.pool.query(`INSERT INTO users VALUES
      (1,'khalid90','old-hash','owner',true,false),
      (2,'synthetic_hr','hr-hash','hr',true,false),
      (3,'synthetic_employee','employee-hash','employee',true,false);
      INSERT INTO teak_system_admin VALUES(true,1);
      INSERT INTO user_sessions VALUES
        ('owner','{"userId":1}',now()+interval '1 day'),
        ('hr','{"userId":2}',now()+interval '1 day'),
        ('employee','{"userId":3}',now()+interval '1 day');
      INSERT INTO employee_portal_limits VALUES('shared-ip',30),('other-user',10);`);
    await state.pool.query("INSERT INTO employee_portal_limits VALUES($1,10)",
      [`hr-login-user:${tokenHash("khalid90")}`]);
  });
  it.each(["development", "production"])("serializes concurrent %s requests and never replays after a later change", async environment => {
    vi.stubEnv("NODE_ENV", environment);
    vi.stubEnv("REPLIT_DEPLOYMENT", environment === "production" ? "1" : "0");
    const outcomes = await Promise.all([
      recoverSystemAdminPassword({ hashPassword: hash }),
      recoverSystemAdminPassword({ hashPassword: hash }),
    ]);
    expect(outcomes.sort()).toEqual(["already_applied", "applied"]);
    expect((await state.pool.query("SELECT action FROM teak_system_admin_audit")).rowCount).toBe(1);
    expect((await state.pool.query("SELECT sid FROM user_sessions ORDER BY sid")).rows)
      .toEqual([{ sid: "employee" }, { sid: "hr" }]);
    expect((await state.pool.query("SELECT key FROM employee_portal_limits ORDER BY key")).rows)
      .toEqual([{ key: "other-user" }, { key: "shared-ip" }]);
    expect((await state.pool.query("SELECT password,role,active,archived FROM users WHERE id=2")).rows[0])
      .toEqual({ password: "hr-hash", role: "hr", active: true, archived: false });
    await state.pool.query("UPDATE users SET password='later-hash' WHERE id=1");
    expect(await recoverSystemAdminPassword({ hashPassword: hash })).toBe("already_applied");
    expect((await state.pool.query("SELECT password FROM users WHERE id=1")).rows[0].password).toBe("later-hash");
  });
  it.each(["development", "production"])("rolls back password, sessions and counters when %s audit fails", async environment => {
    vi.stubEnv("NODE_ENV", environment);
    vi.stubEnv("REPLIT_DEPLOYMENT", environment === "production" ? "1" : "0");
    await state.pool.query(`ALTER TABLE teak_system_admin_audit ADD CONSTRAINT synthetic_failure CHECK(false)`);
    try {
      expect(await recoverSystemAdminPassword({ hashPassword: hash })).toBe("failed");
      expect((await state.pool.query("SELECT password FROM users WHERE id=1")).rows[0].password).toBe("old-hash");
      expect((await state.pool.query("SELECT * FROM user_sessions")).rowCount).toBe(3);
      expect((await state.pool.query("SELECT * FROM employee_portal_limits")).rowCount).toBe(3);
      expect((await state.pool.query("SELECT * FROM teak_system_admin_audit")).rowCount).toBe(0);
    } finally {
      await state.pool.query("ALTER TABLE teak_system_admin_audit DROP CONSTRAINT synthetic_failure");
    }
    expect(await recoverSystemAdminPassword({ hashPassword: hash })).toBe("applied");
  });
});
