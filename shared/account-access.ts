import { z } from "zod";

export const administrationSystemSchema = z.enum(["hr", "warehouse", "purchasing"]);
export type AdministrationSystem = z.infer<typeof administrationSystemSchema>;
// Explicit per-account workspace access. null/absent preserves legacy accounts.
export const accountAccessSchema = z.object({
  version: z.literal(1),
  hr: z.enum(["none", "manage"]),
  warehouse: z.enum(["none", "view", "manage"]),
  purchasing: z.enum(["none", "view", "manage"]),
  administration: z.object({ systems: z.array(administrationSystemSchema).min(1).max(3) }).strict().optional(),
}).strict();
export type AccountAccessPolicy = z.infer<typeof accountAccessSchema>;
export interface AccessIdentity { role: string; accessPolicy?: AccountAccessPolicy | null }
export function administrationSystems(user: AccessIdentity): AdministrationSystem[] {
  return [...new Set(explicitAccess(user)?.administration?.systems ?? [])];
}
export function policyWithinDelegation(policy: AccountAccessPolicy, systems: readonly string[]) {
  return !policy.administration && (["hr", "warehouse", "purchasing"] as const)
    .every(key => policy[key] === "none" || systems.includes(key));
}
/** Do not let a limited administrator reset credentials for unrelated ERP roles. */
export function delegateMayManage(user: AccessIdentity & { employees?: unknown[] }, systems: readonly string[]) {
  if (user.role === "owner") return false;
  if (user.accessPolicy != null) {
    const parsed = accountAccessSchema.safeParse(user.accessPolicy);
    return parsed.success && policyWithinDelegation(parsed.data, systems);
  }
  return (user.role === "hr" && systems.includes("hr")) ||
    (user.role === "warehouse" && systems.includes("warehouse")) ||
    (user.role === "purchasing" && systems.includes("purchasing")) ||
    (user.role === "customer" && !!user.employees?.length);
}
export function isUserWorkspaceApi(method: string, path: string) {
  return (method === "GET" && path === "/api/user-access/me") ||
    (method === "POST" && /^\/api\/user-access\/(?:login|workspace|password)$/.test(path));
}
export const EMPTY_ACCOUNT_ACCESS: AccountAccessPolicy = { version: 1, hr: "none", warehouse: "none", purchasing: "none" };
export function explicitAccess(user: AccessIdentity): AccountAccessPolicy | null {
  if (user.accessPolicy == null) return null;
  const parsed = accountAccessSchema.safeParse(user.accessPolicy);
  return parsed.success ? parsed.data : EMPTY_ACCOUNT_ACCESS; // Corrupt policies fail closed.
}
export function hasHrAccess(user: AccessIdentity) {
  const policy = explicitAccess(user);
  return policy ? policy.hr === "manage" : user.role === "hr";
}
export function hrWriteAccess(user: AccessIdentity, allowAssistant = true) {
  const policy = explicitAccess(user);
  return policy ? policy.hr === "manage" : ["owner", "hr", ...(allowAssistant ? ["assistant"] : [])].includes(user.role);
}
export function hasWarehouseAccess(user: AccessIdentity) {
  const policy = explicitAccess(user);
  return policy ? policy.warehouse !== "none" || policy.purchasing !== "none"
    : ["owner", "assistant", "warehouse", "purchasing", "it"].includes(user.role);
}
export function stockWriteAccess(user: AccessIdentity) {
  const policy = explicitAccess(user);
  return policy ? policy.warehouse === "manage" : ["owner", "assistant", "warehouse"].includes(user.role);
}
export function buyingWriteAccess(user: AccessIdentity) {
  const policy = explicitAccess(user);
  return policy ? policy.purchasing === "manage" : ["owner", "assistant", "purchasing"].includes(user.role);
}
export function scopedAccount<T extends AccessIdentity>(user: T, scope?: "hr" | "warehouse"): T {
  if (!explicitAccess(user)) return user;
  if (scope === "hr") return { ...user, role: hasHrAccess(user) ? "hr" : "customer" };
  if (scope === "warehouse")
    return { ...user, role: stockWriteAccess(user) ? "warehouse" : buyingWriteAccess(user) ? "purchasing" : hasWarehouseAccess(user) ? "warehouse" : "customer" };
  return user;
}
export function accountPermissionKeys(user: AccessIdentity, hrKeys: readonly string[]) {
  const policy = explicitAccess(user);
  if (!policy) return null;
  return [...new Set([
    ...(policy.hr === "manage" ? hrKeys : []),
    ...(hasWarehouseAccess(user) ? ["/warehouses"] : []),
    ...(policy.purchasing !== "none" ? ["/purchases", "/suppliers"] : []),
  ])];
}
