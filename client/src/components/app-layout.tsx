import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/components/language-provider";
import { useTheme } from "@/components/theme-provider";
import { AppSidebar, MobileMenuButton } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Sun, Moon, LogOut, Bell, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import logoEN from "@assets/logo_teak2_1772689894105.png";
import logoAR from "@assets/logo_teak1_1772689915503.png";

const roleLabels: Record<string, { ar: string; en: string }> = {
  owner: { ar: "المالك", en: "Owner" },
  assistant: { ar: "المساعد", en: "Assistant" },
  sales: { ar: "المبيعات", en: "Sales" },
  designer: { ar: "المصمم", en: "Designer" },
  production: { ar: "الإنتاج", en: "Production" },
  purchasing: { ar: "المشتريات", en: "Purchasing" },
  warehouse: { ar: "المستودع", en: "Warehouse" },
  accountant: { ar: "المحاسبة", en: "Accounting" },
  customer_service: { ar: "خدمة العملاء", en: "Customer Service" },
  delivery: { ar: "التوصيل", en: "Delivery" },
  installation: { ar: "التركيب", en: "Installation" },
  quality: { ar: "الجودة", en: "Quality" },
  hr: { ar: "الموارد البشرية", en: "HR" },
  it: { ar: "تقنية المعلومات", en: "IT" },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated, logout, isLoggingOut } = useAuth();
  const { lang, toggleLang, t, isRTL } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [, setLocation] = useLocation();

  const currentLogo = lang === "ar" ? logoAR : logoEN;

  const { data: notifications } = useQuery<any[]>({
    queryKey: ["/api/notifications"],
    enabled: isAuthenticated,
  });

  const unreadCount = notifications?.filter((n: any) => !n.isRead).length || 0;

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [isLoading, isAuthenticated, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated || !user) return null;

  const roleLabel = roleLabels[user.role] || { ar: user.role, en: user.role };

  return (
    <div className="min-h-screen bg-background flex">
      <AppSidebar collapsed={false} />

      <div className="flex-1 flex flex-col min-h-screen">
        <header
          className="h-14 border-b border-border bg-card/50 flex items-center justify-between px-4 shrink-0"
          data-testid="header"
        >
          <div className="flex items-center gap-3">
            <MobileMenuButton />
            <img
              src={currentLogo}
              alt="Teak"
              className="w-7 h-7 object-contain md:hidden"
              data-testid="img-header-logo"
            />
            <div className="hidden sm:flex items-center gap-2">
              <span className="text-sm font-medium" data-testid="text-user-name">
                {t(user.fullNameAr, user.fullNameEn)}
              </span>
              <span
                className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium"
                data-testid="badge-user-role"
              >
                {t(roleLabel.ar, roleLabel.en)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="relative"
              data-testid="button-notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -end-0.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleLang}
              data-testid="button-dashboard-lang"
            >
              <span className="text-xs font-bold">{lang === "ar" ? "EN" : "ع"}</span>
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleTheme}
              data-testid="button-dashboard-theme"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={async () => {
                await logout();
                setLocation("/login");
              }}
              disabled={isLoggingOut}
              data-testid="button-logout"
            >
              {isLoggingOut ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogOut className="w-4 h-4" />
              )}
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
