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
  type LucideIcon,
} from "lucide-react";
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
  { titleAr: "العملاء", titleEn: "Customers", icon: Users, path: "/customers", roles: ["owner", "assistant", "sales", "customer_service"], group: "crm" },
  { titleAr: "عروض الأسعار", titleEn: "Quotations", icon: FileText, path: "/quotations", roles: ["owner", "assistant", "sales", "designer"], group: "crm" },
  { titleAr: "العقود", titleEn: "Contracts", icon: FolderOpen, path: "/contracts", roles: ["owner", "assistant", "sales", "accountant"], group: "crm" },
  { titleAr: "المدفوعات", titleEn: "Payments", icon: CreditCard, path: "/payments", roles: ["owner", "assistant", "sales", "accountant"], group: "finance" },
  { titleAr: "الفواتير", titleEn: "Invoices", icon: Receipt, path: "/invoices", roles: ["owner", "assistant", "accountant"], group: "finance" },
  { titleAr: "لوحة المصمم", titleEn: "Designer Board", icon: Pencil, path: "/designer-board", roles: ["owner", "assistant", "designer"], group: "crm" },
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

function SidebarContent({ items, location, t, onItemClick }: {
  items: MenuItem[]; location: string; t: (ar: string, en: string) => string; onItemClick?: () => void;
}) {
  return (
    <nav className="flex-1 py-3 space-y-0.5 px-2 overflow-y-auto">
      {items.map((item) => {
        const isActive = location === item.path || (item.path !== "/" && location.startsWith(item.path));
        const Icon = item.icon;

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
              <span className="text-sm truncate">
                {t(item.titleAr, item.titleEn)}
              </span>
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
      <SidebarContent items={filteredItems} location={location} t={t} />
    </aside>
  );
}

export function MobileMenuButton() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [location] = useLocation();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const filteredItems = menuItems.filter(
    (item) => item.roles.includes(user.role) || user.role === "owner"
  );

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        className="md:hidden"
        onClick={() => setOpen(true)}
        data-testid="button-mobile-menu"
      >
        <Menu className="w-5 h-5" />
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
            <SidebarContent items={filteredItems} location={location} t={t} onItemClick={() => setOpen(false)} />
          </div>
        </>
      )}
    </>
  );
}
