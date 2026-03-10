import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/components/language-provider";
import { useTheme } from "@/components/theme-provider";
import { AppSidebar, MobileMenuButton } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sun, Moon, LogOut, Bell, Loader2, Check, Info, AlertTriangle, Zap, CheckCircle2 } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import type { Notification } from "@shared/schema";
import teakLogo from "@assets/TEAK-LOGO_(1)_(1)_1772710617816.png";

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

const notifTypeIcons: Record<string, any> = {
  info: Info,
  warning: AlertTriangle,
  action: Zap,
  success: CheckCircle2,
};

const notifTypeColors: Record<string, string> = {
  info: "text-blue-500",
  warning: "text-orange-500",
  action: "text-primary",
  success: "text-green-500",
};

const entityRouteMap: Record<string, string> = {
  customer: "/customers",
  quotation: "/quotations",
  contract: "/contracts",
  payment: "/payments",
  invoice: "/invoices",
  work_order: "/work-orders",
  design_assignment: "/designer-board",
  delivery: "/deliveries",
  installation: "/installations",
  maintenance: "/installations",
  warranty: "/settings",
};

function getNotificationRoute(n: Notification): string | null {
  if (n.relatedEntity && entityRouteMap[n.relatedEntity]) {
    const base = entityRouteMap[n.relatedEntity];
    if (n.relatedId && ["customer", "quotation", "contract", "work_order", "invoice"].includes(n.relatedEntity)) {
      return `${base}/${n.relatedId}`;
    }
    return base;
  }
  const titleLower = (n.titleEn || "").toLowerCase();
  if (titleLower.includes("design")) return "/designer-board";
  if (titleLower.includes("quotation") || titleLower.includes("quote")) return "/quotations";
  if (titleLower.includes("payment") || titleLower.includes("receipt")) return "/payments";
  if (titleLower.includes("maintenance")) return "/installations";
  return null;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated, logout, isLoggingOut } = useAuth();
  const { lang, toggleLang, t, isRTL } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [notifOpen, setNotifOpen] = useState(false);
  const [, setLocation] = useLocation();


  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    enabled: isAuthenticated,
    refetchInterval: 30000,
  });

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const markReadMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/notifications/${id}/read`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", "/api/notifications/read-all", {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      window.location.href = "/login";
    }
  }, [isLoading, isAuthenticated]);

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
              src={teakLogo}
              alt="Teak"
              className="w-7 h-7 object-contain md:hidden logo-auto transition-all duration-300"
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
            <div className="relative">
              <Button
                size="icon"
                variant="ghost"
                className="relative"
                onClick={() => setNotifOpen(!notifOpen)}
                data-testid="button-notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -end-0.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Button>
              {notifOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                  <div className="absolute top-full end-0 mt-1 w-80 max-h-96 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden" data-testid="notifications-panel">
                    <div className="flex items-center justify-between p-3 border-b border-border">
                      <span className="font-semibold text-sm">{t("الإشعارات", "Notifications")}</span>
                      {unreadCount > 0 && (
                        <Button size="sm" variant="ghost" className="text-xs" onClick={() => markAllReadMutation.mutate()} data-testid="button-mark-all-read">
                          <Check className="w-3 h-3 me-1" />{t("قراءة الكل", "Read All")}
                        </Button>
                      )}
                    </div>
                    <div className="overflow-y-auto max-h-72">
                      {notifications.length === 0 ? (
                        <p className="p-4 text-center text-sm text-muted-foreground">{t("لا توجد إشعارات", "No notifications")}</p>
                      ) : (
                        notifications.slice(0, 20).map(n => {
                          const NIcon = notifTypeIcons[n.type] || Info;
                          const color = notifTypeColors[n.type] || "text-blue-500";
                          const route = getNotificationRoute(n);
                          return (
                            <div
                              key={n.id}
                              className={`p-3 border-b border-border last:border-0 cursor-pointer transition-colors ${!n.isRead ? "bg-primary/5" : ""}`}
                              onClick={() => {
                                if (!n.isRead) markReadMutation.mutate(n.id);
                                if (route) {
                                  setNotifOpen(false);
                                  setLocation(route);
                                }
                              }}
                              data-testid={`notif-${n.id}`}
                            >
                              <div className="flex items-start gap-2">
                                <NIcon className={`w-4 h-4 mt-0.5 shrink-0 ${color}`} />
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium">{t(n.titleAr, n.titleEn)}</p>
                                  <p className="text-xs text-muted-foreground truncate">{t(n.messageAr, n.messageEn)}</p>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    {n.createdAt && new Date(n.createdAt).toLocaleString(t("ar-SA", "en-US"))}
                                  </p>
                                </div>
                                {!n.isRead && <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
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
                window.location.href = "/login";
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
