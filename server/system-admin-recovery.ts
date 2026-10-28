import { z } from "zod";
import { pool } from "./db";
import { tokenHash } from "./employee-portal/security";
import { isValidHrPassword } from "../shared/hr-password-policy";

const recoveryId = z.string().uuid();
const password = z.string().refine(isValidHrPassword);
const approvedUsername = "khalid90";

/** Explicit environment-operator recovery, never a login fallback or recurring seed. */
export async function recoverSystemAdminPassword(tools: { hashPassword(value: string): Promise<string> }) {
  const environment = systemAdminRecoveryEnvironment();
  if (!environment) return "disabled";
  // Distinct keys AND exact environment-valued consent: copying development
  // settings to a deployment cannot authorize production (or vice versa).
  const prefix = `TEAK_SYSTEM_ADMIN_RECOVERY_${environment.toUpperCase()}`;
  if (process.env[`${prefix}_ENABLED`] !== environment) return "disabled";
  const requestId = process.env[`${prefix}_ID`];
  if (!requestId) return "disabled";
  const newPassword = password.safeParse(process.env.TEAK_SYSTEM_ADMIN_RECOVERY_PASSWORD);
  if (!recoveryId.safeParse(requestId).success || !newPassword.success)
    return "invalid_configuration";
  if (process.env.TEAK_SYSTEM_ADMIN_USERNAME !== approvedUsername) return "account_mismatch";

  // No additional production schema or public recovery endpoint is required.
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(610281940)");
    const { rows: [owner] } = await client.query(`SELECT u.id,u.username,u.role,u.active,u.archived
      FROM teak_system_admin a JOIN users u ON u.id=a.user_id WHERE a.singleton=true FOR UPDATE OF a,u`);
    if (!owner || owner.username !== approvedUsername || owner.role !== "owner" || !owner.active || owner.archived) {
      await client.query("ROLLBACK");
      return "account_mismatch";
    }
    const action = `owner_password_recovery:${requestId}`;
    const consumed = await client.query("SELECT 1 FROM teak_system_admin_audit WHERE target_id=$1 AND action=$2",
      [owner.id, action]);
    if (consumed.rowCount) {
      await client.query("COMMIT");
      return "already_applied";
    }
    const hash = await tools.hashPassword(newPassword.data);
    const changed = await client.query(`UPDATE users SET password=$2
      WHERE id=$1 AND role='owner' AND active=true AND archived=false RETURNING id`, [owner.id, hash]);
    if (changed.rowCount !== 1) throw new Error("Recovery target changed");
    const { rows: [tables] } = await client.query(`SELECT to_regclass('user_sessions') AS sessions,
      to_regclass('employee_portal_limits') AS limits`);
    if (tables.sessions)
      await client.query("DELETE FROM user_sessions WHERE sess->>'userId'=$1", [String(owner.id)]);
    if (tables.limits)
      await client.query("DELETE FROM employee_portal_limits WHERE key=$1",
         [`hr-login-user:${tokenHash(approvedUsername)}`]);
    await client.query("INSERT INTO teak_system_admin_audit(actor_id,target_id,action) VALUES($1,$1,$2)",
      [owner.id, action]);
    await client.query("COMMIT");
    return "applied";
  } catch {
    // Never log credentials, hashes, query parameters or underlying DB errors.
    try { await client?.query("ROLLBACK"); } catch { /* Preserve fail-closed result. */ }
    return "failed";
  } finally {
    client?.release();
  }
}

export function systemAdminRecoveryEnvironment(): "production" | "development" | undefined {
  if (process.env.NODE_ENV === "production" && process.env.REPLIT_DEPLOYMENT === "1") return "production";
  if (process.env.NODE_ENV === "development" &&
      (!process.env.REPLIT_DEPLOYMENT || process.env.REPLIT_DEPLOYMENT === "0")) return "development";
  return undefined;
}
