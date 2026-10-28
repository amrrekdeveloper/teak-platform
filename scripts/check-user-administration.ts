import { readFile } from "node:fs/promises";
import { strict as assert } from "node:assert";
import { randomBytes } from "node:crypto";
const f = JSON.parse(await readFile("/tmp/teak-account-administration-fixture.json", "utf8"));
const base = "https://" + process.env.REPLIT_DEV_DOMAIN;
const owner = "connect.sid=" + f.ownerCookie;
async function call(path: string, method = "GET", body?: any, cookie = owner) {
  const res = await fetch(base + path, { method, headers: { Cookie: cookie, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = await res.json().catch(() => null);
  return { status: res.status, json, cookie: res.headers.get("set-cookie")?.split(";")[0] || cookie };
}
async function expectStatus(expected: number, path: string, method = "GET", body?: any, cookie = owner) {
  const result = await call(path, method, body, cookie);
  assert.equal(result.status, expected, path + ": " + JSON.stringify(result.json?.message));
  return result;
}
const initial = await expectStatus(200, "/api/system-admin/accounts");
assert(initial.json.rows.every((r: any) => !("password" in r) && !("employeePin" in r) && !("financePin" in r)));
await expectStatus(401, "/api/system-admin/accounts", "GET", undefined, "");
const policy = { version: 1, hr: "none", warehouse: "view", purchasing: "none" };
const created = (await expectStatus(201, "/api/system-admin/accounts", "POST", {
  username: f.marker + "_api_" + randomBytes(3).toString("hex"), fullNameAr: f.marker + " API", password: f.password, accessPolicy: policy,
})).json;
assert.equal(created.employees.length, 0);
const warehouse = await expectStatus(200, "/api/warehouse-access/login", "POST", { username: created.username, password: f.password }, "");
await expectStatus(200, "/api/warehouse-center/summary", "GET", undefined, warehouse.cookie);
await expectStatus(403, "/api/warehouse-center/warehouses", "POST", { nameAr: "Forbidden fixture" }, warehouse.cookie);
await expectStatus(403, "/api/hr-access/login", "POST", { username: created.username, password: f.password }, warehouse.cookie);
await expectStatus(403, "/api/system-admin/accounts", "GET", undefined, warehouse.cookie);
assert([403, 503].includes((await call("/api/auth/login", "POST", { username: created.username, password: f.password }, "")).status));
await expectStatus(409, "/api/system-admin/accounts", "POST", {
  username: f.marker + "_duplicate_link", fullNameAr: "Disposable duplicate", password: f.password, employeeId: f.employeeIds[1], accessPolicy: policy,
});
const changed = (await expectStatus(200, "/api/system-admin/accounts/" + created.id, "PATCH", {
  expectedVersion: created.version, accessPolicy: { ...policy, hr: "manage", warehouse: "none", purchasing: "manage" },
})).json;
await expectStatus(401, "/api/warehouse-center/summary", "GET", undefined, warehouse.cookie);
const hr = await expectStatus(200, "/api/hr-access/login", "POST", { username: created.username, password: f.password }, "");
assert.equal(hr.json.role, "hr");
await expectStatus(200, "/api/hr/overview", "GET", undefined, hr.cookie);
assert([401, 403].includes((await call("/api/system-admin/accounts", "GET", undefined, hr.cookie)).status));
assert([401, 403, 503].includes((await call("/api/users", "POST", { username: f.marker + "_forbidden" }, hr.cookie)).status));
const buying = await expectStatus(200, "/api/warehouse-access/login", "POST", { username: created.username, password: f.password }, "");
assert.equal(buying.json.role, "purchasing");
await expectStatus(403, "/api/warehouse-center/warehouses", "POST", { nameAr: "Forbidden fixture" }, buying.cookie);
await expectStatus(409, "/api/system-admin/accounts/" + created.id, "PATCH", { expectedVersion: created.version, fullNameAr: "Stale edit" });
const disabled = (await expectStatus(200, "/api/system-admin/accounts/" + created.id, "PATCH", { expectedVersion: changed.version, active: false })).json;
await expectStatus(401, "/api/hr/overview", "GET", undefined, hr.cookie);
await expectStatus(401, "/api/warehouse-center/summary", "GET", undefined, buying.cookie);
await expectStatus(403, "/api/hr-access/login", "POST", { username: created.username, password: f.password }, "");
await expectStatus(200, "/api/system-admin/accounts/" + created.id, "PATCH", { expectedVersion: disabled.version, active: true });
const legacy = initial.json.rows.find((r: any) => r.id === f.legacyId);
const legacyEdit = (await expectStatus(200, "/api/system-admin/accounts/" + legacy.id, "PATCH", {
  expectedVersion: legacy.version, fullNameAr: f.marker + " legacy edited",
})).json;
assert.equal(legacyEdit.accessPolicy, null);
const protectedOwner = initial.json.rows.find((r: any) => r.role === "owner");
if (protectedOwner) await expectStatus(403, "/api/system-admin/accounts/" + protectedOwner.id, "PATCH", {
  expectedVersion: protectedOwner.version, active: false,
});
console.log("Account API checks passed: optional linkage, duplicate rollback, workspace isolation, view-only writes denied, mixed access, revocation, inactive login, stale edit, legacy preservation and owner protection.");
