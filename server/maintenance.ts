import type { RequestHandler } from "express";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isHrWorkspaceApi, isHrWorkspacePage, isManagerApi, isSystemAdminApi } from "../shared/hr-access";

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
      "الخدمة الذاتية المتكاملة لموظفين تيك",
    );
}

export function createMaintenanceMiddleware(
  publicDir: string,
  enabled: boolean = maintenanceConfig.enabled,
  now: () => number = Date.now,
  reloadTemplates: boolean = process.env.NODE_ENV === "development",
): RequestHandler {
  // When disabled there is no file dependency and the original app is unchanged.
  if (!enabled) return (_req, _res, next) => next();
  const template = readFileSync(path.join(publicDir, "maintenance.html"), "utf8");
  const logo = readFileSync(path.join(publicDir, "maintenance-logo.png"));
  const employeeFiles = new Map([
    ["/employee-self-service", "employee-portal.html"],
    ["/technical-support", "technical-support.html"],
    ["/manager-portal", "manager-portal.html"],
    ["/system-admin", "system-admin.html"],
  ]);
  const employeePages = new Map(Array.from(employeeFiles).map(([url, file]) =>
    [url, readFileSync(path.join(publicDir, file), "utf8")]));

  return (req, res, next) => {
    res.set("Cache-Control", "no-store, max-age=0");
    res.set("X-Content-Type-Options", "nosniff");
    res.set("X-Frame-Options", "SAMEORIGIN");
    res.set("Referrer-Policy", "same-origin");
    // This isolated API is the ONLY application surface available during
    // maintenance. It never mounts administrative session middleware.
    if (req.path.startsWith("/api/employee-portal/")) return next();
    if (isHrWorkspaceApi(req.method, req.path) || isManagerApi(req.method, req.path) || isSystemAdminApi(req.method, req.path)) {
      res.locals.hrMaintenanceRequest = true;
      return next(); // Authentication + fresh role check follow session loading.
    }
    if (req.method === "GET" || req.method === "HEAD") {
      if (isHrWorkspacePage(req.path)) return next();
      // Only SPA assets needed to render the isolated HR shell. This does not
      // permit navigation to ERP pages or access to their APIs.
      const devAsset = reloadTemplates && /^\/(?:@vite\/client$|@react-refresh$|@replit\/vite-plugin-dev-banner\/banner-script\.js$|src\/|node_modules\/\.vite\/|@fs\/)/.test(req.path);
      if (devAsset || /^\/assets\/[^?]+\.(?:js|css|png|jpg|jpeg|svg|webp|woff2?|ttf)$/.test(req.path))
        return next();
    }
    // A short retry hint is not an automatic reopening promise.
    res.set("Retry-After", "3600");
    if (req.method === "GET" || req.method === "HEAD") {
      // These standalone pages bypass Vite. Reload their source in development
      // rather than holding an obsolete HTML snapshot until a server restart.
      const pageFile = employeeFiles.get(req.path);
      const page = pageFile && reloadTemplates
        ? readFileSync(path.join(publicDir, pageFile), "utf8")
        : employeePages.get(req.path);
      if (page) {
        res.type("html").send(page);
        return;
      }
      if (req.path === "/__maintenance/logo.png") {
        res.type("png").send(logo);
        return;
      }
      if (!req.path.startsWith("/api/") && req.path !== "/api") {
        // Replit's deployment health check requests /. Keep it healthy while
        // serving only maintenance content; deep links return temporary 503.
        res.status(req.path === "/" ? 200 : 503);
        const currentTemplate = reloadTemplates
          ? readFileSync(path.join(publicDir, "maintenance.html"), "utf8")
          : template;
        res.type("html").send(renderMaintenanceHtml(currentTemplate, now()));
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