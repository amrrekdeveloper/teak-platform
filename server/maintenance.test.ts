import { describe, expect, it } from "vitest";
import { createMaintenanceMiddleware, maintenanceConfig, renderMaintenanceHtml } from "./maintenance";
import path from "node:path";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { runInNewContext } from "node:vm";

const publicDir = path.resolve("client/public");
const start = Date.parse(maintenanceConfig.startedAt);
const end = Date.parse(maintenanceConfig.endsAt);

function request(url: string, method = "GET", enabled = true, now = start) {
  const headers: Record<string, string> = {};
  const result = { status: 200, body: undefined as unknown, passed: false, headers };
  const res = {
    locals: {},
    set(key: string, value: string) { headers[key] = value; return this; },
    status(code: number) { result.status = code; return this; },
    type(value: string) { headers.type = value; return this; },
    send(body: unknown) { result.body = body; return this; },
    json(body: unknown) { result.body = body; return this; },
  };
  createMaintenanceMiddleware(publicDir, enabled, () => now)(
    { path: url, method } as any,
    res as any,
    () => { result.passed = true; },
  );
  return result;
}

describe("maintenance mode", () => {
  it("uses a fixed 72-hour deadline, unchanged across visitors/restarts", () => {
    expect(end - start).toBe(72 * 60 * 60 * 1000);
    expect(renderMaintenanceHtml("__MAINTENANCE_ENDS_AT_MS__", start)).toBe(String(end));
    expect(renderMaintenanceHtml("__MAINTENANCE_ENDS_AT_MS__", start + 60000)).toBe(String(end));
  });
  it("serves the page at home and intercepts all direct app routes", () => {
    for (const url of ["/", "/login", "/dashboard", "/kitchen-designer-v2/studio"]) {
      const result = request(url);
      expect(result.passed).toBe(false);
      expect(result.headers.type).toBe("html");
      expect(result.headers["Cache-Control"]).toContain("no-store");
      expect(String(result.body)).not.toContain("__MAINTENANCE_");
    }
    expect(request("/").status).toBe(200);
    expect(request("/dashboard").status).toBe(503);
  });
  it("blocks API reads and writes, including already signed-in sessions", () => {
    for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
      const result = request("/api/customers", method);
      expect(result.status).toBe(503);
      expect(result.body).toMatchObject({ error: "maintenance_mode" });
      expect(result.passed).toBe(false);
    }
    expect(request("/", "POST").status).toBe(503);
  });
  it("serves the actual logo without opening a static-file bypass", () => {
    expect(request("/__maintenance/logo.png").headers.type).toBe("png");
    expect(request("/assets/app.js").passed).toBe(true);
  });
  it("allows only isolated employee pages/API, never administrative application paths", () => {
    expect(request("/employee-self-service").headers.type).toBe("html");
    expect(String(request("/employee-self-service").body)).toContain("otp-code");
    expect(request("/technical-support").status).toBe(200);
    expect(request("/api/employee-portal/me").passed).toBe(true);
    expect(request("/api/employee-portal/otp/request", "POST").passed).toBe(true);
    expect(request("/api/employees", "POST").passed).toBe(true); // Guarded after admin session middleware.
    expect(request("/hr/login").passed).toBe(true);
    for (const url of ["/api/auth/login", "/api/employee-auth/verify-pin"]) {
      expect(request(url, "POST").status).toBe(503);
      expect(request(url, "POST").passed).toBe(false);
    }
    expect(request("/system-admin").status).toBe(200);
    expect(request("/api/system-admin/hr-accounts").passed).toBe(true);
  });
  it("keeps maintenance active after expiry with the requested exact message", () => {
    const result = request("/", "GET", true, end + 1);
    expect(result.passed).toBe(false);
    expect(String(result.body)).toContain("الخدمة الذاتية المتكاملة لموظفين تيك");
    expect(renderMaintenanceHtml("__MAINTENANCE_INITIAL_MESSAGE__", end)).toBe("الخدمة الذاتية المتكاملة لموظفين تيك");
  });
  it("restores original routing only when explicitly disabled", () => {
    expect(request("/", "GET", false).passed).toBe(true);
    expect(request("/api/customers", "POST", false).passed).toBe(true);
  });
  it("loads current development HTML without recreating the middleware", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "teak-maintenance-"));
    try {
      for (const file of ["maintenance.html", "employee-portal.html", "technical-support.html", "manager-portal.html", "system-admin.html", "maintenance-logo.png"])
        writeFileSync(path.join(dir, file), "original");
      const handler = createMaintenanceMiddleware(dir, true, () => start, true);
      for (const [url, file] of [["/", "maintenance.html"], ["/employee-self-service", "employee-portal.html"]]) {
        writeFileSync(path.join(dir, file), "updated-html");
        let body = "";
        const res = { set() { return this; }, status() { return this; }, type() { return this; }, send(value: string) { body = value; } };
        handler({ path: url, method: "GET" } as any, res as any, () => {});
        expect(body).toBe("updated-html");
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("browser countdown", () => {
  function countdownAt(serverNow: number) {
    const elements = Object.fromEntries(
      ["countdown", "maintenance-message", "hours", "minutes", "seconds"]
        .map(id => [id, { hidden: true, textContent: "" }]),
    );
    const html = renderMaintenanceHtml(readFileSync(path.join(publicDir, "maintenance.html"), "utf8"), serverNow);
    const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
    let clientNow = 1_000_000; // Deliberately incorrect local clock.
    let tick = () => {};
    runInNewContext(script, {
      Date: { now: () => clientNow },
      document: { getElementById: (id: string) => elements[id], addEventListener: () => {} },
      setInterval: (fn: () => void) => { tick = fn; return 1; },
      clearInterval: () => {},
    });
    return {
      elements,
      advance(ms: number) { clientNow += ms; tick(); },
    };
  }

  it("starts at 72 hours using server time despite the visitor's clock", () => {
    const timer = countdownAt(start);
    expect(timer.elements.hours.textContent).toBe("72");
    timer.advance(1_000);
    expect(timer.elements.hours.textContent).toBe("71");
    expect(timer.elements.minutes.textContent).toBe("59");
    expect(timer.elements.seconds.textContent).toBe("59");
    expect(countdownAt(start + 3600000).elements.hours.textContent).toBe("71");
  });
  it("changes to the exact requested message at expiry and never reopens", () => {
    const timer = countdownAt(end - 1000);
    expect(timer.elements.countdown.hidden).toBe(false);
    timer.advance(1000);
    expect(timer.elements.countdown.hidden).toBe(true);
    expect(timer.elements["maintenance-message"].textContent).toBe("الخدمة الذاتية المتكاملة لموظفين تيك");
    timer.advance(-10000);
    expect(timer.elements.countdown.hidden).toBe(true);
    expect(countdownAt(end + 1).elements.countdown.hidden).toBe(true);
  });
});