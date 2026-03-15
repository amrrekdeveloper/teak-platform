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
  Pencil,
  Menu,
  X,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

interface MenuItem {
  titleAr: string;
  titleEn: string;
  icon: LucideIcon;
  path: string;
  roles: string[];
  group?: string;
}

const menuItems: MenuItem[] = [
  { titleAr: "لوحة التحكم", titleEn: "Dashboard", icon: LayoutDashboard, path: "/", roles: ["owner", "assistant", "it"], group: "main" },
  { titleAr: "مركز الطلبات", titleEn: "Order Center", icon: ClipboardList, path: "/order-center", roles: ["owner", "assistant"], group: "main" },
  { titleAr: "طلباتي", titleEn: "My Orders", icon: ClipboardCheck, path: "/my-orders", roles: ["sales"], group: "main" },
  { titleAr: "العملاء", titleEn: "Customers", icon: Users, path: "/customers", roles: ["owner", "assistant", "sales", "customer_service"], group: "crm" },
  { titleAr: "عروض الأسعار", titleEn: "Quotations", icon: FileText, path: "/quotations", roles: ["owner", "assistant", "sales", "designer"], group: "crm" },
  { titleAr: "العقود", titleEn: "Contracts", icon: FolderOpen, path: "/contracts", roles: ["owner", "assistant", "sales", "accountant"], group: "crm" },
  { titleAr: "المدفوعات", titleEn: "Payments", icon: CreditCard, path: "/payments", roles: ["owner", "assistant", "sales", "accountant"], group: "finance" },
  { titleAr: "الفواتير", titleEn: "Invoices", icon: Receipt, path: "/invoices", roles: ["owner", "assistant", "accountant"], group: "finance" },
  { titleAr: "أوامر العمل", titleEn: "Work Orders", icon: ClipboardCheck, path: "/work-orders", roles: ["owner", "assistant", "production", "designer"], group: "manufacturing" },
  { titleAr: "الإنتاج", titleEn: "Production", icon: Factory, path: "/production", roles: ["owner", "assistant", "production"], group: "manufacturing" },
  { titleAr: "المخزون", titleEn: "Inventory", icon: Package, path: "/inventory", roles: ["owner", "assistant", "warehouse", "purchasing"], group: "warehouse" },
  { titleAr: "الموردون", titleEn: "Suppliers", icon: Building2, path: "/suppliers", roles: ["owner", "assistant", "warehouse", "purchasing"], group: "warehouse" },
  { titleAr: "المشتريات", titleEn: "Purchase Orders", icon: ShoppingCart, path: "/purchases", roles: ["owner", "assistant", "purchasing"], group: "warehouse" },
  { titleAr: "التوصيل", titleEn: "Deliveries", icon: Truck, path: "/deliveries", roles: ["owner", "assistant", "delivery"], group: "services" },
  { titleAr: "التركيب والصيانة", titleEn: "Installation & Maintenance", icon: Wrench, path: "/installations", roles: ["owner", "assistant", "installation"], group: "services" },
  { titleAr: "الجودة", titleEn: "Quality", icon: Shield, path: "/quality", roles: ["owner", "assistant", "quality"], group: "services" },
  { titleAr: "الموظفين", titleEn: "Employees", icon: UserCog, path: "/employees", roles: ["owner", "assistant", "hr"], group: "admin" },
  { titleAr: "الإعدادات", titleEn: "Settings", icon: Settings, path: "/settings", roles: ["owner", "it"], group: "admin" },
];

function SidebarContent({ items, location, t, onItemClick, newOrderCount }: {
  items: MenuItem[]; location: string; t: (ar: string, en: string) => string; onItemClick?: () => void; newOrderCount?: number;
}) {
  return (
    <nav className="flex-1 py-3 space-y-0.5 px-2 overflow-y-auto">
      {items.map((item) => {
        const isActive = location === item.path || (item.path !== "/" && location.startsWith(item.path));
        const Icon = item.icon;
        const showBadge = (item.path === "/order-center" || item.path === "/my-orders") && (newOrderCount || 0) > 0;

        return (
          <Link key={item.path} href={item.path}>
            <div
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              onClick={onItemClick}
              data-testid={`link-sidebar-${item.path === "/" ? "" : item.path.split("/").pop()}`}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className="text-sm truncate flex-1">
                {t(item.titleAr, item.titleEn)}
              </span>
              {showBadge && (
                <span className="min-w-[20px] h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1" data-testid="badge-new-orders">
                  {newOrderCount}
                </span>
              )}
            </div>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppSidebar({ collapsed }: { collapsed: boolean }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [location] = useLocation();

  const { data: quotations = [] } = useQuery<any[]>({
    queryKey: ["/api/quotations"],
    refetchInterval: 30000,
  });
  const newOrderCount = quotations.filter((q: any) => q.status === "requested" || q.status === "open" || (q.status === "draft" && !q.assignedTo)).length;

  if (!user) return null;

  const filteredItems = menuItems.filter(
    (item) => item.roles.includes(user.role) || user.role === "owner"
  );

  return (
    <aside
      className={`hidden md:flex flex-col border-e border-border bg-card/50 transition-all duration-300 ${
        collapsed ? "w-16" : "w-64"
      }`}
      data-testid="sidebar"
    >
      <SidebarContent items={filteredItems} location={location} t={t} newOrderCount={newOrderCount} />
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
  const newOrderCount = quotations.filter((q: any) => q.status === "requested" || q.status === "open" || (q.status === "draft" && !q.assignedTo)).length;

  if (!user) return null;

  const filteredItems = menuItems.filter(
    (item) => item.roles.includes(user.role) || user.role === "owner"
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
            <div className="flex items-center justify-between p-4 border-b border-border">
              <span className="font-semibold text-sm">{t("القائمة", "Menu")}</span>
              <Button size="icon" variant="ghost" onClick={() => setOpen(false)} data-testid="button-close-mobile-menu">
                <X className="w-5 h-5" />
              </Button>
            </div>
            <SidebarContent items={filteredItems} location={location} t={t} onItemClick={() => setOpen(false)} newOrderCount={newOrderCount} />
          </div>
        </>
      )}
    </>
  );
}
