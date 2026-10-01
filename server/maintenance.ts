import type { RequestHandler } from "express";
import { readFileSync } from "node:fs";
import path from "node:path";

// Disable ONLY when the owner requests reopening, then republish.
// The deadline is fixed, not relative to server startup or a visitor's session.
export const maintenanceConfig = {
  enabled: true,
  startedAt: "2026-10-01T06:25:11.000Z",
  endsAt: "2026-10-04T06:25:11.000Z",
};

export function renderMaintenanceHtml(template: string, now = Date.now()) {
  const endsAt = Date.parse(maintenanceConfig.endsAt);
  return template
    .replaceAll("__MAINTENANCE_ENDS_AT_MS__", String(endsAt))
    .replaceAll("__MAINTENANCE_SERVER_NOW_MS__", String(now))
    .replaceAll(
      "__MAINTENANCE_INITIAL_MESSAGE__",
      now >= endsAt ? "لا زالت المنصة تحت التطوير" : "نعمل على تطوير المنصة لتجربة أفضل",
    );
}

export function createMaintenanceMiddleware(
  publicDir: string,
  enabled: boolean = maintenanceConfig.enabled,
  now: () => number = Date.now,
): RequestHandler {
  // When disabled there is no file dependency and the original app is unchanged.
  if (!enabled) return (_req, _res, next) => next();
  const template = readFileSync(path.join(publicDir, "maintenance.html"), "utf8");
  const logo = readFileSync(path.join(publicDir, "maintenance-logo.png"));

  return (req, res) => {
    res.set("Cache-Control", "no-store, max-age=0");
    res.set("X-Content-Type-Options", "nosniff");
    // A short retry hint is not an automatic reopening promise.
    res.set("Retry-After", "3600");
    if (req.method === "GET" || req.method === "HEAD") {
      if (req.path === "/__maintenance/logo.png") {
        res.type("png").send(logo);
        return;
      }
      if (!req.path.startsWith("/api/") && req.path !== "/api") {
        // Replit's deployment health check requests /. Keep it healthy while
        // serving only maintenance content; deep links return temporary 503.
        res.status(req.path === "/" ? 200 : 503);
        res.type("html").send(renderMaintenanceHtml(template, now()));
        return;
      }
    }
    // Block APIs and writes before sessions/body parsing/business handlers.
    res.status(503).json({
      error: "maintenance_mode",
      message: "المنصة متوقفة مؤقتًا للصيانة والتطوير",
    });
  };
}