// Narrow maintenance workspace. These are HR modules, not a grant of ERP access.
export const HR_WORKSPACE_PERMISSIONS = [
  "/employees", "/attendance-monitor", "/attendance-settings", "/leaves", "/payroll", "/advances", "/evaluations",
];

const rules: [string[], RegExp][] = [
  [["GET"], /^\/api\/attendance\/workweek\/settings$/],
  [["POST"], /^\/api\/attendance\/workweek\/(?:preview|apply)$/],
  [["GET"], /^\/api\/attendance\/events$/],
  [["GET","POST"], /^\/api\/hr\/departments$/],
  [["DELETE"], /^\/api\/hr\/departments\/\d+$/],
  [["GET"], /^\/api\/attendance\/corrections(?:\/\d+\/attachment)?$/],
  [["POST"], /^\/api\/attendance\/corrections\/\d+\/decision$/],
  [["GET"], /^\/uploads\/hr-documents\/[a-zA-Z0-9._-]+$/],
  [["POST"], /^\/api\/hr-access\/login$/],
  [["GET"], /^\/api\/auth\/me$/],
  [["POST"], /^\/api\/auth\/logout$/],
  [["GET"], /^\/api\/users$/], // Sanitized lookup for optional employee linkage.
  [["GET", "POST"], /^\/api\/employees$/],
  [["GET", "PATCH", "DELETE"], /^\/api\/employees\/\d+$/],
  [["POST"], /^\/api\/employees\/\d+\/documents$/],
  [["DELETE"], /^\/api\/employees\/\d+\/documents\/[^/]+$/],
  [["GET", "POST"], /^\/api\/employees\/\d+\/assets$/],
  [["PATCH"], /^\/api\/employee-assets\/\d+$/],
  [["GET", "POST"], /^\/api\/job-titles$/],
  [["PATCH", "DELETE"], /^\/api\/job-titles\/\d+$/],
  [["GET"], /^\/api\/hr-audit-log$/],
  [["GET", "POST"], /^\/api\/(?:leaves|hr-actions|evaluations|advances)$/],
  [["GET"], /^\/api\/leaves\/balance\/\d+$/],
  [["POST"], /^\/api\/leaves\/\d+\/decision$/],
  [["POST"], /^\/api\/hr-actions\/\d+\/step$/],
  [["POST"], /^\/api\/advances\/\d+\/(?:approve|reject)$/],
  [["GET"], /^\/api\/(?:pending-requests|requests-report)$/],
  [["GET"], /^\/api\/payroll$/],
  [["POST"], /^\/api\/payroll\/generate$/],
  [["POST"], /^\/api\/payroll\/bulk$/],
  [["POST"], /^\/api\/payroll\/\d+\/approve$/],
  [["GET"], /^\/api\/hr-permissions\/\d+\/document$/],
  [["PATCH"], /^\/api\/payroll\/\d+$/],
  [["POST"], /^\/api\/payroll\/\d+\/pay$/],
  [["GET"], /^\/api\/attendance\/(?:monitor|device-report|violations|risk-scores|audit-log)$/],
  [["GET"], /^\/api\/attendance\/(?:period-report|shift-monitor|shift-settings|employees\/\d+\/report|medical-attachments\/\d+)$/],
  [["GET"], /^\/api\/attendance\/medical-documents(?:\/\d+\/download)?$/],
  [["PUT"], /^\/api\/attendance\/work-settings\/\d+\/shifts$/],
  [["POST"], /^\/api\/attendance\/record\/\d+\/medical-attachment$/],
  [["PATCH"], /^\/api\/attendance\/record\/\d+$/],
  [["POST"], /^\/api\/attendance\/record\/\d+\/override$/],
  [["POST"], /^\/api\/attendance\/record\/\d+\/correction$/],
  [["GET", "POST"], /^\/api\/attendance\/movements$/],
  [["POST"], /^\/api\/attendance\/permission\/\d+\/decision$/],
  [["GET", "POST"], /^\/api\/attendance\/(?:zones|work-settings)$/],
  [["PATCH", "DELETE"], /^\/api\/attendance\/(?:zones|work-settings)\/\d+$/],
  [["GET"], /^\/api\/notifications$/],
  [["PATCH"], /^\/api\/notifications\/(?:read-all|\d+\/read)$/],
];

export function isHrWorkspaceApi(method: string, path: string) {
  return rules.some(([methods, pattern]) => methods.includes(method) && pattern.test(path));
}
export function isHrWorkspacePage(path: string) {
  return /^\/hr(?:\/(?:login|employees(?:\/\d+)?|attendance-monitor|attendance-settings|leaves|payroll|advances|evaluations))?\/?$/.test(path);
}

export function isManagerApi(method: string, path: string) {
  return (method === "GET" && /^\/api\/(?:auth\/me|manager\/workspace|hr-permissions\/\d+\/document)$/.test(path)) ||
    (method === "POST" && /^\/api\/(?:manager-access\/login|auth\/logout|manager\/warnings|leaves\/\d+\/decision|attendance\/permission\/\d+\/decision|hr-actions\/\d+\/step)$/.test(path));
}

export function isSystemAdminApi(method: string, path: string) {
  return (method === "POST" && /^\/api\/system-admin\/(?:login|logout|password|hr-accounts)$/.test(path)) ||
    (method === "GET" && /^\/api\/system-admin\/(?:me|hr-accounts)$/.test(path)) ||
    (method === "PATCH" && /^\/api\/system-admin\/hr-accounts\/\d+$/.test(path));
}

export function isHrWorkspaceIdentity(
  user: { role: string; active: boolean; archived?: boolean } | undefined,
  session: { userId?: number; adminAuthenticated?: boolean; hrWorkspace?: boolean },
) {
  return !!session.userId && session.adminAuthenticated === true &&
    session.hrWorkspace === true && user?.active === true && !user.archived && user.role === "hr";
}
