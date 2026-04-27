import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useLanguage } from "@/components/language-provider";
import { useAuth } from "@/hooks/use-auth";
import {
  LayoutDashboard,
  Users,
  FileText,
  FolderOpen,
  CreditCard,
  Factory,
  Package,
  Truck,
  Wrench,
  Shield,
  UserCog,
  Settings,
  Receipt,
  ShoppingCart,
  ClipboardCheck,
  Building2,
  Menu,
  X,
  ClipboardList,
  Calendar,
  MapPin,
  Box,
  BarChart3,
  UserCircle,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Clock,
  BookOpen,
  Scale,
  TrendingDown,
  Landmark,
  FileBarChart,
  RefreshCcw,
  DollarSign,
  BookText,
  type LucideIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import teakLogo from "@assets/TEAK-LOGO_(1)_(1)_1772710617816.png";

interface MenuItem {
  titleAr: string;
  titleEn: string;
  icon: LucideIcon;
  path: string;
  roles: string[];
  group?: string;
  strictRoles?: boolean;
}

const menuItems: MenuItem[] = [
  { titleAr: "لوحة التحكم", titleEn: "Dashboard", icon: LayoutDashboard, path: "/", roles: ["owner", "assistant", "it", "sales", "designer", "production", "accountant", "warehouse", "purchasing", "delivery", "installation", "quality", "hr", "customer_service"], group: "main" },
  { titleAr: "مركز الطلبات", titleEn: "Order Center", icon: ClipboardList, path: "/order-center", roles: ["owner", "assistant", "it"], group: "main" },
  { titleAr: "طلباتي", titleEn: "My Orders", icon: ClipboardCheck, path: "/my-orders", roles: ["sales"], group: "main" },
  { titleAr: "تقويمي", titleEn: "My Calendar", icon: Calendar, path: "/my-calendar", roles: ["owner", "assistant", "it"], group: "main" },
  { titleAr: "العملاء", titleEn: "Customers", icon: Users, path: "/customers", roles: ["owner", "assistant", "it", "sales", "customer_service"], group: "crm" },
  { titleAr: "عروض الأسعار", titleEn: "Quotations", icon: FileText, path: "/quotations", roles: ["owner", "assistant", "it", "sales", "designer"], group: "crm" },
  { titleAr: "العقود", titleEn: "Contracts", icon: FolderOpen, path: "/contracts", roles: ["owner", "assistant", "it", "sales", "accountant"], group: "crm" },
  { titleAr: "المدفوعات", titleEn: "Payments", icon: CreditCard, path: "/payments", roles: ["owner", "assistant", "it", "accountant"], group: "finance" },
  { titleAr: "الفواتير", titleEn: "Invoices", icon: Receipt, path: "/invoices", roles: ["owner", "assistant", "it", "accountant"], group: "finance" },
  { titleAr: "لوحة المالي", titleEn: "Finance Dashboard", icon: BarChart3, path: "/finance", roles: ["owner", "assistant", "it", "accountant"], group: "finance" },
  { titleAr: "شجرة الحسابات", titleEn: "Chart of Accounts", icon: BookOpen, path: "/finance/accounts", roles: ["accountant"], group: "accounting" },
  { titleAr: "القيود اليومية", titleEn: "Journal Entries", icon: FileText, path: "/finance/journal", roles: ["accountant"], group: "accounting" },
  { titleAr: "الأرصدة الافتتاحية", titleEn: "Opening Balances", icon: DollarSign, path: "/finance/opening-balances", roles: ["accountant"], group: "accounting" },
  { titleAr: "السنوات المالية", titleEn: "Fiscal Years", icon: Calendar, path: "/finance/fiscal-years", roles: ["accountant"], group: "accounting" },
  { titleAr: "ميزان المراجعة", titleEn: "Trial Balance", icon: Scale, path: "/finance/trial-balance", roles: ["accountant"], group: "financial_reports" },
  { titleAr: "الميزانية العمومية", titleEn: "Balance Sheet", icon: BookOpen, path: "/finance/balance-sheet", roles: ["accountant"], group: "financial_reports" },
  { titleAr: "قائمة الدخل", titleEn: "Income Statement", icon: TrendingDown, path: "/finance/income-statement", roles: ["accountant"], group: "financial_reports" },
  { titleAr: "التدفق النقدي", titleEn: "Cash Flow", icon: TrendingUp, path: "/finance/cash-flow", roles: ["accountant"], group: "financial_reports" },
  { titleAr: "دفتر الأستاذ", titleEn: "General Ledger", icon: FileBarChart, path: "/finance/ledger", roles: ["accountant"], group: "financial_reports" },
  { titleAr: "تقرير الضريبة", titleEn: "VAT Report", icon: Landmark, path: "/finance/vat-report", roles: ["accountant"], group: "financial_reports" },
  { titleAr: "مطابقة البنك", titleEn: "Bank Reconciliation", icon: RefreshCcw, path: "/finance/bank-reconciliation", roles: ["accountant"], group: "financial_reports" },
  { titleAr: "أوامر العمل", titleEn: "Work Orders", icon: ClipboardCheck, path: "/work-orders", roles: ["owner", "assistant", "it", "production", "designer"], group: "manufacturing" },
  { titleAr: "الإنتاج", titleEn: "Production", icon: Factory, path: "/production", roles: ["owner", "assistant", "it", "production"], group: "manufacturing" },
  { titleAr: "المخزون", titleEn: "Inventory", icon: Package, path: "/inventory", roles: ["owner", "assistant", "it", "warehouse", "purchasing"], group: "warehouse" },
  { titleAr: "الموردون", titleEn: "Suppliers", icon: Building2, path: "/suppliers", roles: ["owner", "assistant", "it", "warehouse", "purchasing"], group: "warehouse" },
  { titleAr: "المشتريات", titleEn: "Purchase Orders", icon: ShoppingCart, path: "/purchases", roles: ["owner", "assistant", "it", "purchasing"], group: "warehouse" },
  { titleAr: "التوصيل", titleEn: "Deliveries", icon: Truck, path: "/deliveries", roles: ["owner", "assistant", "it", "delivery"], group: "services" },
  { titleAr: "التركيب والصيانة", titleEn: "Installation & Maintenance", icon: Wrench, path: "/installations", roles: ["owner", "assistant", "it", "installation"], group: "services" },
  { titleAr: "الجودة", titleEn: "Quality", icon: Shield, path: "/quality", roles: ["owner", "assistant", "it", "quality"], group: "services" },
  { titleAr: "الموارد البشرية", titleEn: "Human Resources", icon: UserCog, path: "/employees", roles: ["owner", "it", "hr"], group: "hr" },
  { titleAr: "مراقبة الدوام", titleEn: "Attendance Monitor", icon: Clock, path: "/attendance-monitor", roles: ["owner", "it"], group: "hr" },
  { titleAr: "الإعدادات", titleEn: "Settings", icon: Settings, path: "/settings", roles: ["owner", "it"], group: "admin" },
  { titleAr: "ملفي الشخصي", titleEn: "My Profile", icon: UserCircle, path: "/my-profile", roles: ["owner", "assistant", "sales", "designer", "production", "purchasing", "warehouse", "accountant", "customer_service", "delivery", "installation", "quality", "hr", "it"], group: "admin" },
  { titleAr: "أداء اليوم", titleEn: "Today's Performance", icon: TrendingUp, path: "/daily-performance", roles: ["sales"], group: "main", strictRoles: true },
  { titleAr: "خريطتي التسويقية", titleEn: "My Marketing Map", icon: MapPin, path: "/my-map", roles: ["sales"], group: "main", strictRoles: true },
  { titleAr: "متابعة الأداء التسويقي", titleEn: "Marketing Performance", icon: TrendingUp, path: "/sales-performance", roles: ["owner", "assistant", "it"], group: "main" },
  { titleAr: "خريطة المبيعات", titleEn: "Sales Map", icon: MapPin, path: "/sales-map", roles: ["owner", "assistant", "it"], group: "main" },
];

const GROUP_LABELS: Record<string, { ar: string; en: string }> = {
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

function SidebarContent({
  items, location, t, onItemClick, newOrderCount, collapsed,
}: {
  items: MenuItem[];
  location: string;
  t: (ar: string, en: string) => string;
  onItemClick?: () => void;
  newOrderCount?: number;
  collapsed?: boolean;
}) {
  const groups: { groupKey: string; groupItems: MenuItem[] }[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const gk = item.group || "main";
    if (!seen.has(gk)) { seen.add(gk); groups.push({ groupKey: gk, groupItems: [] }); }
    groups.find(g => g.groupKey === gk)!.groupItems.push(item);
  }

  return (
    <nav className="flex-1 py-2 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
      <div className={collapsed ? "px-1" : "px-2"}>
        {groups.map(({ groupKey, groupItems }) => (
          <div key={groupKey} className="mb-1">
            {!collapsed && GROUP_LABELS[groupKey] && (
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-3 pt-3 pb-1 select-none">
                {t(GROUP_LABELS[groupKey].ar, GROUP_LABELS[groupKey].en)}
              </p>
            )}
            {groupItems.map((item) => {
              const isActive = location === item.path || (item.path !== "/" && location.startsWith(item.path));
              const Icon = item.icon;
              const showBadge = (item.path === "/order-center" || item.path === "/my-orders") && (newOrderCount || 0) > 0;
              return (
                <Link key={item.path} href={item.path}>
                  <div
                    className={`flex items-center gap-3 rounded-lg cursor-pointer transition-colors mb-0.5 ${
                      collapsed ? "px-2 py-2.5 justify-center" : "px-3 py-2.5"
                    } ${
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                    onClick={onItemClick}
                    title={collapsed ? t(item.titleAr, item.titleEn) : undefined}
                    data-testid={`link-sidebar-${item.path === "/" ? "" : item.path.split("/").pop()}`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    {!collapsed && (
                      <span className="text-sm truncate flex-1">
                        {t(item.titleAr, item.titleEn)}
                      </span>
                    )}
                    {showBadge && (
                      <span
                        className={`min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-1 ${collapsed ? "absolute -top-1 -end-1" : ""}`}
                        data-testid="badge-new-orders"
                      >
                        {newOrderCount}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}

export function AppSidebar({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const { t, isRTL } = useLanguage();
  const { user } = useAuth();
  const [location] = useLocation();

  const { data: quotations = [] } = useQuery<any[]>({
    queryKey: ["/api/quotations"],
    refetchInterval: 30000,
  });
  const newOrderCount = quotations.filter((q: any) =>
    q.status === "requested" || q.status === "open" || (q.status === "draft" && !q.assignedTo)
  ).length;

  if (!user) return null;

  const filteredItems = menuItems.filter(
    (item) => item.roles.includes(user.role) || (user.role === "owner" && !item.strictRoles)
  );

  const CollapseIcon = collapsed
    ? (isRTL ? ChevronLeft : ChevronRight)
    : (isRTL ? ChevronRight : ChevronLeft);

  return (
    <aside
      className={`hidden md:flex flex-col border-e border-border bg-card/50 transition-all duration-300 ${
        collapsed ? "w-16" : "w-60"
      }`}
      data-testid="sidebar"
    >
      {/* Sidebar Header with Logo */}
      <div className={`flex items-center border-b border-border shrink-0 ${collapsed ? "justify-center px-2 py-3" : "gap-2.5 px-4 py-3"}`}>
        <img
          src={teakLogo}
          alt="Teak"
          className={`object-contain logo-auto transition-all duration-300 ${collapsed ? "w-8 h-8" : "w-9 h-9"}`}
        />
        {!collapsed && (
          <div className="min-w-0">
            <p className="font-bold text-sm text-foreground tracking-tight leading-none">تيك</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">للتصنيع والتجهيز</p>
          </div>
        )}
      </div>

      <SidebarContent
        items={filteredItems}
        location={location}
        t={t}
        newOrderCount={newOrderCount}
        collapsed={collapsed}
      />

      {/* Collapse Toggle Button */}
      <div className={`border-t border-border py-2 ${collapsed ? "px-1" : "px-2"}`}>
        <button
          onClick={onToggleCollapsed}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors text-xs"
          title={collapsed ? t("توسيع القائمة", "Expand sidebar") : t("طي القائمة", "Collapse sidebar")}
          data-testid="button-toggle-sidebar"
        >
          <CollapseIcon className="w-4 h-4 shrink-0" />
          {!collapsed && <span>{t("طي القائمة", "Collapse")}</span>}
        </button>
      </div>
    </aside>
  );
}

export function MobileMenuButton() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [location] = useLocation();
  const [open, setOpen] = useState(false);

  const { data: quotations = [] } = useQuery<any[]>({
    queryKey: ["/api/quotations"],
    refetchInterval: 30000,
  });
  const newOrderCount = quotations.filter((q: any) =>
    q.status === "requested" || q.status === "open" || (q.status === "draft" && !q.assignedTo)
  ).length;

  if (!user) return null;

  const filteredItems = menuItems.filter(
    (item) => item.roles.includes(user.role) || (user.role === "owner" && !item.strictRoles)
  );

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        className="md:hidden relative"
        onClick={() => setOpen(true)}
        data-testid="button-mobile-menu"
      >
        <Menu className="w-5 h-5" />
        {newOrderCount > 0 && (
          <span className="absolute -top-0.5 -end-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
            {newOrderCount}
          </span>
        )}
      </Button>

      {open && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-50 md:hidden"
            onClick={() => setOpen(false)}
            data-testid="mobile-menu-overlay"
          />
          <div
            className="fixed top-0 start-0 bottom-0 w-72 bg-card z-50 md:hidden shadow-2xl flex flex-col animate-in slide-in-from-left rtl:slide-in-from-right duration-200"
            data-testid="mobile-menu-drawer"
          >
            {/* Mobile drawer header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2.5">
                <img src={teakLogo} alt="Teak" className="w-8 h-8 object-contain logo-auto" />
                <div>
                  <p className="font-bold text-sm leading-none">تيك</p>
                  <p className="text-[10px] text-muted-foreground">للتصنيع والتجهيز</p>
                </div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setOpen(false)} data-testid="button-close-mobile-menu">
                <X className="w-5 h-5" />
              </Button>
            </div>
            <SidebarContent
              items={filteredItems}
              location={location}
              t={t}
              onItemClick={() => setOpen(false)}
              newOrderCount={newOrderCount}
            />
          </div>
        </>
      )}
    </>
  );
}
