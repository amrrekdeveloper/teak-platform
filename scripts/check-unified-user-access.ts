/** Disposable development verification. Uses only the private fixture, never owner credentials. */
import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { strict as assert } from "node:assert";
if (process.env.NODE_ENV === "production" || !process.env.REPLIT_DEV_DOMAIN?.endsWith(".replit.dev")) throw new Error("Development only");
const fixture = JSON.parse(await readFile("/tmp/teak-account-administration-fixture.json", "utf8"));
const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const owner = `connect.sid=${fixture.ownerCookie}`;
const password = `Test-${randomBytes(16).toString("hex")}`;
const marker = fixture.marker + "_unified_" + randomBytes(3).toString("hex");
const empty = { version: 1, hr: "none", warehouse: "none", purchasing: "none" };
async function call(path: string, method = "GET", body?: any, cookie = owner) {
  const response = await fetch(base + path, { method, headers: { Cookie: cookie, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = await response.json().catch(() => null);
  return { status: response.status, json, cookie: response.headers.get("set-cookie")?.split(";")[0] || cookie };
}
async function expect(status: number, path: string, method = "GET", body?: any, cookie = owner) {
  const result = await call(path, method, body, cookie);
  assert.equal(result.status, status, `${method} ${path}: ${result.json?.message || ""}`);
  return result;
}
async function create(suffix: string, accessPolicy: any) {
  return (await expect(201, "/api/system-admin/accounts", "POST", {
    username: marker + suffix, fullNameAr: "اختبار دخول موحد", password, accessPolicy,
  })).json;
}
async function login(username: string, pass = password) {
  return expect(200, "/api/user-access/login", "POST", { username, password: pass }, "");
}
const root = await expect(200, "/api/user-access/me");
assert.equal(root.json.isOwner, true);
assert(root.json.workspaces.some((w: any) => w.id === "accounts"));
const mixed = await create("_mixed", { ...empty, hr: "manage", warehouse: "view", purchasing: "view" });
const mixedLogin = await login(mixed.username);
assert.equal(mixedLogin.json.redirectTo, "/workspace");
const mixedCookie = mixedLogin.cookie;
assert.deepEqual((await expect(200, "/api/user-access/me", "GET", undefined, mixedCookie)).json.workspaces.map((w: any) => w.id), ["hr", "warehouse", "purchasing"]);
await expect(403, "/api/warehouses", "POST", {}, mixedCookie);
await expect(200, "/api/user-access/workspace", "POST", { workspace: "hr" }, mixedCookie);
assert.equal((await expect(200, "/api/auth/me", "GET", undefined, mixedCookie)).json.maintenanceScope, "hr");
await expect(200, "/api/user-access/workspace", "POST", { workspace: "warehouse" }, mixedCookie);
assert.equal((await expect(200, "/api/auth/me", "GET", undefined, mixedCookie)).json.maintenanceScope, "warehouse");
await expect(403, "/api/warehouses", "POST", {}, mixedCookie);
await expect(200, "/api/user-access/workspace", "POST", { workspace: "purchasing" }, mixedCookie);
await expect(403, "/api/purchase-orders", "POST", {}, mixedCookie);
await expect(403, "/api/user-access/workspace", "POST", { workspace: "accounts" }, mixedCookie);
await expect(200, "/api/user-access/me", "GET", undefined, mixedCookie);

const delegate = await create("_delegate", { ...empty, administration: { systems: ["warehouse"] } });
const delegatedLogin = await login(delegate.username);
assert.equal(delegatedLogin.json.redirectTo, "/system-admin");
const delegatedCookie = delegatedLogin.cookie;
const delegatedIdentity = (await expect(200, "/api/system-admin/me", "GET", undefined, delegatedCookie)).json;
assert.equal(delegatedIdentity.isOwner, false);
assert.deepEqual(delegatedIdentity.delegatedSystems, ["warehouse"]);
assert.deepEqual((await expect(200, "/api/user-access/me", "GET", undefined, delegatedCookie)).json.workspaces.map((w: any) => w.id), ["accounts"]);
await expect(403, "/api/user-access/workspace", "POST", { workspace: "warehouse" }, delegatedCookie);
await expect(403, `/api/system-admin/accounts/${root.json.id}`, "PATCH", { expectedVersion: "0", active: false }, delegatedCookie);
await expect(403, `/api/system-admin/accounts/${delegate.id}`, "PATCH", { expectedVersion: delegate.version, fullNameAr: "اختبار" }, delegatedCookie);
await expect(403, "/api/system-admin/accounts", "POST", { username: marker + "_forbidden", fullNameAr: "اختبار",
  password, accessPolicy: { ...empty, hr: "manage" } }, delegatedCookie);
await expect(403, "/api/system-admin/accounts", "POST", { username: marker + "_forbidden_admin", fullNameAr: "اختبار",
  password, accessPolicy: { ...empty, administration: { systems: ["warehouse"] } } }, delegatedCookie);
const ordinary = (await expect(201, "/api/system-admin/accounts", "POST", { username: marker + "_worker",
  fullNameAr: "اختبار موظف", password, accessPolicy: { ...empty, warehouse: "view" } }, delegatedCookie)).json;
const visible = (await expect(200, "/api/system-admin/accounts", "GET", undefined, delegatedCookie)).json.rows;
assert(visible.some((row: any) => row.id === ordinary.id));
assert(!visible.some((row: any) => [root.json.id, delegate.id, mixed.id].includes(row.id)));
const broadened = (await expect(200, `/api/system-admin/accounts/${ordinary.id}`, "PATCH", {
  expectedVersion: ordinary.version, accessPolicy: { ...empty, warehouse: "view", hr: "manage" },
})).json;
await expect(403, `/api/system-admin/accounts/${ordinary.id}`, "PATCH", {
  expectedVersion: broadened.version, active: false,
}, delegatedCookie);
const changedPassword = password + "-changed";
await expect(200, "/api/user-access/password", "POST", { currentPassword: password, newPassword: changedPassword }, delegatedCookie);
await expect(401, "/api/user-access/me", "GET", undefined, delegatedCookie);
await expect(401, "/api/user-access/login", "POST", { username: delegate.username, password }, "");
const newLogin = await login(delegate.username, changedPassword);
const latest = (await expect(200, "/api/system-admin/accounts")).json.rows.find((row: any) => row.id === delegate.id);
await expect(200, `/api/system-admin/accounts/${delegate.id}`, "PATCH", { expectedVersion: latest.version, accessPolicy: empty });
await expect(401, "/api/system-admin/accounts", "GET", undefined, newLogin.cookie);
const noAccess = await login(delegate.username, changedPassword);
assert.equal(noAccess.json.redirectTo, "/workspace");
assert.equal((await expect(200, "/api/user-access/me", "GET", undefined, noAccess.cookie)).json.workspaces.length, 0);
await expect(403, "/api/system-admin/accounts", "GET", undefined, noAccess.cookie);
// Browser-only test identities remain staged until that pass completes.
const browserAdmin = await create("_ui_it", empty);
await writeFile("/tmp/teak-unified-access-fixture.json", JSON.stringify({ baseUrl: base, marker,
  ownerCookie: fixture.ownerCookie, password, adminUsername: browserAdmin.username, mixedUsername: mixed.username,
  workerUsername: marker + "_ui_worker",
}), { mode: 0o600 });
console.log("Unified-access HTTP checks passed: current owner, automatic routing, shared session switching, bounded delegation, protected admins, current-password change and revocation.");
