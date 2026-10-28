// Single source of truth for the per-account permission system.
// Keys mirror sidebar route paths (see client/src/components/app-sidebar.tsx).
// Role defaults are derived from the same role lists used by the sidebar, so
// upgrading to per-account permissions never removes a user's existing access.

export interface PermissionModule {
  key: string; // = sidebar route path
  titleAr: string;
  titleEn: string;
  group: string;
  roles: string[]; // role defaults
  strictRoles?: boolean;
  base?: boolean; // always granted, not toggleable (e.g. dashboard, profile)
}

export const PERMISSION_GROUPS: Record<string, { ar: string; en: string }> = {
  main: { ar: "الرئيسية", en: "Main" },
  crm: { ar: "إدارة العملاء", en: "CRM" },
  finance: { ar: "المالية", en: "Finance" },
  accounting: { ar: "المحاسبة", en: "Accounting" },
  financial_reports: { ar: "التقارير المالية", en: "Financial Reports" },
  manufacturing: { ar: "التصنيع", en: "Manufacturing" },
  warehouse: { ar: "المستودع والمشتريات", en: "Warehouse" },
  services: { ar: "الخدمات الميدانية", en: "Field Services" },
  hr: { ar: "الموارد البشرية", en: "HR" },
  admin: { ar: "الإدارة", en: "Admin" },
};

export const PERMISSION_MODULES: PermissionModule[] = [
  { key: "/", titleAr: "لوحة التحكم", titleEn: "Dashboard", group: "main", roles: ["owner", "assistant", "it", "sales", "designer", "production", "accountant", "warehouse", "purchasing", "delivery", "installation", "quality", "hr", "customer_service"], base: true },
  { key: "/order-center", titleAr: "مركز الطلبات", titleEn: "Order Center", group: "main", roles: ["owner", "assistant", "it"] },
  { key: "/my-orders", titleAr: "طلباتي", titleEn: "My Orders", group: "main", roles: ["sales"] },
  { key: "/my-calendar", titleAr: "تقويمي", titleEn: "My Calendar", group: "main", roles: ["owner", "assistant", "it"] },
  { key: "/sales-performance", titleAr: "متابعة الأداء التسويقي", titleEn: "Marketing Performance", group: "main", roles: ["owner", "assistant", "it"] },
  { key: "/sales-map", titleAr: "خريطة المبيعات", titleEn: "Sales Map", group: "main", roles: ["owner", "assistant", "it"] },
  { key: "/daily-performance", titleAr: "أداء اليوم", titleEn: "Today's Performance", group: "main", roles: ["sales"], strictRoles: true },
  { key: "/my-map", titleAr: "خريطتي التسويقية", titleEn: "My Marketing Map", group: "main", roles: ["sales"], strictRoles: true },
  { key: "/customers", titleAr: "العملاء", titleEn: "Customers", group: "crm", roles: ["owner", "assistant", "it", "sales", "customer_service"] },
  { key: "/quotations", titleAr: "عروض الأسعار", titleEn: "Quotations", group: "crm", roles: ["owner", "assistant", "it", "sales", "designer"] },
  { key: "/contracts", titleAr: "العقود", titleEn: "Contracts", group: "crm", roles: ["owner", "assistant", "it", "sales", "accountant"] },
  { key: "/payments", titleAr: "المدفوعات", titleEn: "Payments", group: "finance", roles: ["owner", "assistant", "it", "accountant"] },
  { key: "/invoices", titleAr: "الفواتير", titleEn: "Invoices", group: "finance", roles: ["owner", "assistant", "it", "accountant"] },
  { key: "/finance", titleAr: "لوحة المالي", titleEn: "Finance Dashboard", group: "finance", roles: ["owner", "assistant", "it", "accountant"] },
  { key: "/finance/accounts", titleAr: "شجرة الحسابات", titleEn: "Chart of Accounts", group: "accounting", roles: ["accountant"] },
  { key: "/finance/journal", titleAr: "القيود اليومية", titleEn: "Journal Entries", group: "accounting", roles: ["accountant"] },
  { key: "/finance/opening-balances", titleAr: "الأرصدة الافتتاحية", titleEn: "Opening Balances", group: "accounting", roles: ["accountant"] },
  { key: "/finance/fiscal-years", titleAr: "السنوات المالية", titleEn: "Fiscal Years", group: "accounting", roles: ["accountant"] },
  { key: "/finance/settings", titleAr: "تغيير كلمة المرور (المالية)", titleEn: "Finance Password", group: "accounting", roles: ["accountant"] },
  { key: "/finance/trial-balance", titleAr: "ميزان المراجعة", titleEn: "Trial Balance", group: "financial_reports", roles: ["accountant"] },
  { key: "/finance/balance-sheet", titleAr: "الميزانية العمومية", titleEn: "Balance Sheet", group: "financial_reports", roles: ["accountant"] },
  { key: "/finance/income-statement", titleAr: "قائمة الدخل", titleEn: "Income Statement", group: "financial_reports", roles: ["accountant"] },
  { key: "/finance/cash-flow", titleAr: "التدفق النقدي", titleEn: "Cash Flow", group: "financial_reports", roles: ["accountant"] },
  { key: "/finance/ledger", titleAr: "دفتر الأستاذ", titleEn: "General Ledger", group: "financial_reports", roles: ["accountant"] },
  { key: "/finance/vat-report", titleAr: "تقرير الضريبة", titleEn: "VAT Report", group: "financial_reports", roles: ["accountant"] },
  { key: "/finance/bank-reconciliation", titleAr: "مطابقة البنك", titleEn: "Bank Reconciliation", group: "financial_reports", roles: ["accountant"] },
  { key: "/work-orders", titleAr: "أوامر العمل", titleEn: "Work Orders", group: "manufacturing", roles: ["owner", "assistant", "it", "production", "designer"] },
  { key: "/production", titleAr: "الإنتاج", titleEn: "Production", group: "manufacturing", roles: ["owner", "assistant", "it", "production"] },
  { key: "/inventory", titleAr: "المخزون", titleEn: "Inventory", group: "warehouse", roles: ["owner", "assistant", "it", "warehouse", "purchasing"] },
  { key: "/warehouses", titleAr: "المستودعات", titleEn: "Warehouses", group: "warehouse", roles: ["owner", "assistant", "it", "warehouse", "purchasing"] },
  { key: "/suppliers", titleAr: "الموردون", titleEn: "Suppliers", group: "warehouse", roles: ["owner", "assistant", "it", "warehouse", "purchasing", "accountant"] },
  { key: "/purchases", titleAr: "المشتريات", titleEn: "Purchase Orders", group: "warehouse", roles: ["owner", "assistant", "it", "purchasing"] },
  { key: "/deliveries", titleAr: "التوصيل", titleEn: "Deliveries", group: "services", roles: ["owner", "assistant", "it", "delivery"] },
  { key: "/installations", titleAr: "التركيب والصيانة", titleEn: "Installation & Maintenance", group: "services", roles: ["owner", "assistant", "it", "installation"] },
  { key: "/quality", titleAr: "الجودة", titleEn: "Quality", group: "services", roles: ["owner", "assistant", "it", "quality"] },
  { key: "/employees", titleAr: "الموارد البشرية", titleEn: "Human Resources", group: "hr", roles: ["owner", "it", "hr"] },
  { key: "/payroll", titleAr: "مسيّر الرواتب", titleEn: "Payroll", group: "hr", roles: ["owner", "assistant", "hr", "accountant"] },
  { key: "/advances", titleAr: "سلف الموظفين", titleEn: "Advances", group: "hr", roles: ["owner", "assistant", "hr", "accountant"] },
  { key: "/leaves", titleAr: "الإجازات", titleEn: "Leaves", group: "hr", roles: ["owner", "assistant", "hr"] },
  { key: "/evaluations", titleAr: "تقييم الأداء", titleEn: "Evaluations", group: "hr", roles: ["owner", "assistant", "hr"] },
  { key: "/attendance-monitor", titleAr: "مراقبة الدوام", titleEn: "Attendance Monitor", group: "hr", roles: ["owner", "it"] },
  { key: "/attendance-monitor/approvals", titleAr: "موافقات الحضور والانصراف", titleEn: "Attendance Approvals", group: "hr", roles: ["owner", "hr"] },
  { key: "/settings", titleAr: "الإعدادات", titleEn: "Settings", group: "admin", roles: ["owner", "it"] },
  { key: "/my-profile", titleAr: "ملفي الشخصي", titleEn: "My Profile", group: "admin", roles: ["owner", "assistant", "sales", "designer", "production", "purchasing", "warehouse", "accountant", "customer_service", "delivery", "installation", "quality", "hr", "it"], base: true },
];

export const PERMISSION_EFFECTS = ["grant", "revoke"] as const;
export type PermissionEffect = (typeof PERMISSION_EFFECTS)[number];

// Protected owner accounts: always full access, never reduced/disabled/deleted.
export const PROTECTED_OWNER_USERNAMES = [
  "khaled",
  "خالد",
  "د.خالد",
  "jabran",
  "k.asiri",
  "siham",
  "khaled_admin",
];
export const PROTECTED_OWNER_PHONES = ["0553053995"];

function normalizePhone(p?: string | null): string {
  if (!p) return "";
  return p.replace(/[\s\-().]/g, "").replace(/^(\+966|00966|966)/, "0");
}

export function isProtectedOwner(u: { username?: string | null; phone?: string | null }): boolean {
  if (u.username && PROTECTED_OWNER_USERNAMES.includes(u.username)) return true;
  const np = normalizePhone(u.phone);
  return !!np && PROTECTED_OWNER_PHONES.some((p) => normalizePhone(p) === np);
}

export function getAllPermissionKeys(): string[] {
  return PERMISSION_MODULES.map((m) => m.key);
}

export function isValidPermissionKey(key: string): boolean {
  return PERMISSION_MODULES.some((m) => m.key === key);
}

export function getRoleDefaultPermissions(role: string): string[] {
  if (role === "owner") {
    return PERMISSION_MODULES.filter((m) => !m.strictRoles).map((m) => m.key);
  }
  return PERMISSION_MODULES.filter((m) => m.base || m.roles.includes(role)).map((m) => m.key);
}

export function computeEffectivePermissions(
  role: string,
  exceptions: { permissionKey: string; effect: string }[],
  unrestricted: boolean,
): string[] {
  if (unrestricted) return getAllPermissionKeys();
  const set = new Set(getRoleDefaultPermissions(role));
  for (const ex of exceptions) {
    if (ex.effect === "grant") set.add(ex.permissionKey);
    else if (ex.effect === "revoke") set.delete(ex.permissionKey);
  }
  // Base modules are always granted regardless of exceptions.
  for (const m of PERMISSION_MODULES) if (m.base) set.add(m.key);
  return Array.from(set);
}

// Resolve which module permission governs a given route location.
// Returns null for the dashboard root and for routes not tied to a module
// (those remain accessible; the backend still enforces RBAC on the APIs).
export function getPermissionKeyForLocation(loc: string): string | null {
  if (!loc || loc === "/") return null;
  let best: string | null = null;
  for (const m of PERMISSION_MODULES) {
    if (m.key === "/") continue;
    if (loc === m.key || loc.startsWith(m.key + "/")) {
      if (!best || m.key.length > best.length) best = m.key;
    }
  }
  return best;
}
