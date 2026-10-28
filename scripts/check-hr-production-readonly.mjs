/**
 * Explicit, one-attempt production HR verification.
 * Business requests are an audited GET allowlist. Login/logout necessarily
 * create/destroy this test's session; no business mutations or OTP are sent.
 * Never print/persist response bodies, passwords, cookies or entity identifiers.
 */
const args = process.argv.slice(2);
const originIndex = args.indexOf("--origin");
const originValue = originIndex >= 0 ? args[originIndex + 1] : "";
if (!args.includes("--confirm-production-readonly") || !originValue) {
  console.error("Explicit --confirm-production-readonly and --origin from deployment metadata are required.");
  process.exit(1);
}
const origin = new URL(originValue);
if (origin.protocol !== "https:" || origin.username || origin.password ||
    origin.pathname !== "/" || origin.search || origin.hash) {
  console.error("An HTTPS origin without credentials, path, query or fragment is required.");
  process.exit(1);
}
if (!process.env.HR_READINESS_PASSWORD) {
  console.error("The secure HR_READINESS_PASSWORD secret is not available.");
  process.exit(1);
}
const expectedPermissions = [
  "/overview", "/requests", "/settings", "/employees", "/attendance-monitor",
  "/attendance-monitor/approvals", "/attendance-settings", "/leaves",
  "/permissions", "/reports", "/access", "/actions", "/alerts",
  "/payroll", "/advances", "/evaluations",
];
const month = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit",
}).formatToParts(new Date());
const period = `${month.find(p => p.type === "year").value}-${month.find(p => p.type === "month").value}`;
const readPaths = [
  "/api/employees", "/api/job-titles", "/api/hr/requests",
  "/api/hr/request-settings", "/api/hr/access", "/api/hr/alerts",
  "/api/hr/departments", "/api/leaves", "/api/attendance/permissions",
  "/api/hr-actions", `/api/payroll?period=${period}`, "/api/advances",
  "/api/evaluations",
];
const report = { checkedAt: new Date().toISOString(), origin: origin.origin, checks: [] };
let cookie = "";
let failure = false;
function record(path, status, ok, detail = {}) {
  report.checks.push({ path, status, ok, ...detail });
  if (!ok) failure = true;
}
async function request(path, method = "GET", body) {
  return fetch(new URL(path, origin), {
    method, redirect: "error", signal: AbortSignal.timeout(20000),
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(method === "POST" ? { Origin: origin.origin, "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function jsonOrNull(response) {
  try { return await response.json(); } catch { return null; }
}
try {
  // This is deliberately the only login attempt. Never retry a bad credential.
  const response = await request("/api/hr-access/login", "POST", {
    username: "huda", password: process.env.HR_READINESS_PASSWORD, rememberMe: false,
  });
  const setCookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie() : [response.headers.get("set-cookie") || ""];
  cookie = setCookies.filter(Boolean).map(value => value.split(";")[0]).join("; ");
  const login = await jsonOrNull(response);
  const identityMatches = login?.username === "huda" && login?.role === "hr" &&
    login?.active === true && login?.archived !== true && login?.maintenanceScope === "hr";
  record("/api/hr-access/login", response.status,
    response.status === 200 && identityMatches && Boolean(cookie), { identityMatches });
  if (failure) throw new Error("Login could not be verified; no retries.");

  const meResponse = await request("/api/auth/me");
  const me = await jsonOrNull(meResponse);
  const permissions = Array.isArray(me?.permissions) ? me.permissions : [];
  const scopeMatches = me?.username === "huda" && me?.role === "hr" &&
    me?.active === true && me?.archived !== true && me?.maintenanceScope === "hr";
  const permissionMatch = permissions.length === expectedPermissions.length &&
    expectedPermissions.every(key => permissions.includes(key));
  record("/api/auth/me", meResponse.status,
    meResponse.status === 200 && scopeMatches && permissionMatch, {
      scopeMatches, permissionMatch,
      // Only known route keys, never arbitrary strings from a response.
      permissions: expectedPermissions.filter(key => permissions.includes(key)),
    });
  if (failure) throw new Error("The authenticated scope differs; stopping.");

  for (const path of readPaths) {
    const result = await request(path);
    const data = await jsonOrNull(result);
    const validJson = data !== null && typeof data === "object";
    record(path, result.status, result.status === 200 && validJson, {
      shape: Array.isArray(data) ? "array" : validJson ? "object" : "invalid",
    });
  }
  // Static HTML is fetched, not executed: this proves refresh routing only,
  // not successful rendering or all component requests.
  for (const permission of expectedPermissions) {
    const path = `/hr${permission}`;
    const result = await request(path);
    record(path, result.status,
      result.status === 200 && (result.headers.get("content-type") || "").includes("text/html"),
      { check: "html-navigation-only" });
    await result.body?.cancel();
  }
  for (const path of ["/api/contracts", "/api/finance/accounts", "/api/system-admin/me"]) {
    const result = await request(path);
    record(path, result.status, [401, 403, 503].includes(result.status), { check: "scope-denied" });
    await result.body?.cancel();
  }
} catch {
  failure = true;
  // No raw error/response body: providers may include sensitive request data.
  report.error = "Verification stopped; inspect redacted check statuses, not credentials or response bodies.";
} finally {
  if (cookie) {
    try {
      const logout = await request("/api/auth/logout", "POST", {});
      record("/api/auth/logout", logout.status, logout.status === 200);
      await logout.body?.cancel();
      const revoked = await request("/api/auth/me");
      record("/api/auth/me", revoked.status, revoked.status === 401, { check: "after-logout-old-cookie" });
      await revoked.body?.cancel();
    } catch {
      failure = true;
      report.sessionCleanupUnconfirmed = true;
    }
  }
  cookie = "";
}
report.ok = !failure;
console.log(JSON.stringify(report, null, 2));
process.exitCode = failure ? 1 : 0;
