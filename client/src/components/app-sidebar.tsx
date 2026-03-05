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
  type LucideIcon,
} from "lucide-react";

interface MenuItem {
  titleAr: string;
  titleEn: string;
  icon: LucideIcon;
  path: string;
  roles: string[];
}

const menuItems: MenuItem[] = [
  { titleAr: "لوحة التحكم", titleEn: "Dashboard", icon: LayoutDashboard, path: "/", roles: ["owner", "assistant", "it"] },
  { titleAr: "العملاء", titleEn: "Customers", icon: Users, path: "/customers", roles: ["owner", "assistant", "sales", "customer_service"] },
  { titleAr: "عروض الأسعار", titleEn: "Quotations", icon: FileText, path: "/quotations", roles: ["owner", "assistant", "sales", "designer"] },
  { titleAr: "العقود", titleEn: "Contracts", icon: FolderOpen, path: "/contracts", roles: ["owner", "assistant", "sales", "accountant"] },
  { titleAr: "المدفوعات", titleEn: "Payments", icon: CreditCard, path: "/payments", roles: ["owner", "assistant", "sales", "accountant"] },
  { titleAr: "الفواتير", titleEn: "Invoices", icon: Receipt, path: "/invoices", roles: ["owner", "assistant", "accountant"] },
  { titleAr: "أوامر العمل", titleEn: "Work Orders", icon: ClipboardCheck, path: "/work-orders", roles: ["owner", "assistant", "production", "designer"] },
  { titleAr: "الإنتاج", titleEn: "Production", icon: Factory, path: "/production", roles: ["owner", "assistant", "production"] },
  { titleAr: "المخزون", titleEn: "Inventory", icon: Package, path: "/inventory", roles: ["owner", "assistant", "warehouse", "purchasing"] },
  { titleAr: "المشتريات", titleEn: "Purchase Orders", icon: ShoppingCart, path: "/purchases", roles: ["owner", "assistant", "purchasing"] },
  { titleAr: "التوصيل", titleEn: "Deliveries", icon: Truck, path: "/deliveries", roles: ["owner", "assistant", "delivery"] },
  { titleAr: "التركيب والصيانة", titleEn: "Installation & Maintenance", icon: Wrench, path: "/installations", roles: ["owner", "assistant", "installation"] },
  { titleAr: "الجودة", titleEn: "Quality", icon: Shield, path: "/quality", roles: ["owner", "assistant", "quality"] },
  { titleAr: "الموظفين", titleEn: "Employees", icon: UserCog, path: "/employees", roles: ["owner", "assistant", "hr"] },
  { titleAr: "الإعدادات", titleEn: "Settings", icon: Settings, path: "/settings", roles: ["owner", "it"] },
];

export function AppSidebar({ collapsed }: { collapsed: boolean }) {
  const { t, isRTL } = useLanguage();
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
      <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
        {filteredItems.map((item) => {
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
                data-testid={`link-sidebar-${item.path.split("/").pop()}`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {!collapsed && (
                  <span className="text-sm truncate">
                    {t(item.titleAr, item.titleEn)}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function MobileBottomNav() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [location] = useLocation();

  if (!user) return null;

  const mobileItems = menuItems
    .filter((item) => item.roles.includes(user.role) || user.role === "owner")
    .slice(0, 5);

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border"
      data-testid="mobile-bottom-nav"
    >
      <div className="flex items-center justify-around h-16 px-1">
        {mobileItems.map((item) => {
          const isActive = location === item.path || (item.path !== "/" && location.startsWith(item.path));
          const Icon = item.icon;

          return (
            <Link key={item.path} href={item.path}>
              <div
                className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-md transition-colors cursor-pointer ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
                data-testid={`link-mobile-${item.path.split("/").pop()}`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium truncate max-w-[60px]">
                  {t(item.titleAr, item.titleEn)}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
