import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage, LanguageToggle } from "@/components/language-provider";
import { useTheme } from "@/components/theme-provider";
import { AppSidebar, MobileMenuButton } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sun, Moon, LogOut, Bell, Loader2, Check, Info, AlertTriangle, Zap, CheckCircle2, Camera, Mail, Phone, Shield, Eye, EyeOff, User as UserIcon, KeyRound } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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

function UserAvatar({ user, size = "sm", onClick, className = "" }: { user: any; size?: "sm" | "lg"; onClick?: () => void; className?: string }) {
  const dim = size === "lg" ? "w-16 h-16 text-xl" : "w-8 h-8 text-xs";
  const initials = (user.fullNameAr || user.fullNameEn || "U").charAt(0);

  if (user.profileImage) {
    return (
      <button onClick={onClick} className={`${dim} rounded-full overflow-hidden ring-2 ring-border hover:ring-primary transition-all shrink-0 ${className}`} data-testid="button-user-avatar">
        <img src={user.profileImage} alt="" className="w-full h-full object-cover" />
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`${dim} rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center ring-2 ring-border hover:ring-primary transition-all shrink-0 ${className}`}
      data-testid="button-user-avatar"
    >
      {initials}
    </button>
  );
}

function ProfileEditDialog({ user, open, onClose, t }: { user: any; open: boolean; onClose: () => void; t: (ar: string, en: string) => string }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [profileImage, setProfileImage] = useState<string | undefined>(user.profileImage || undefined);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", "/api/users/profile/me", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: t("تم التحديث", "Profile Updated"), description: t("تم حفظ التغييرات بنجاح", "Changes saved successfully") });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onClose();
    },
    onError: (err: any) => {
      const msg = err?.message || t("حدث خطأ", "An error occurred");
      toast({ title: t("خطأ", "Error"), description: msg, variant: "destructive" });
    },
  });

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: t("خطأ", "Error"), description: t("الحجم الأقصى 2 ميجابايت", "Max size is 2MB"), variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setProfileImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    const data: any = {};
    if (profileImage !== (user.profileImage || undefined)) {
      data.profileImage = profileImage || null;
    }
    if (newPassword) {
      if (newPassword.length < 6) {
        toast({ title: t("خطأ", "Error"), description: t("كلمة المرور يجب أن تكون 6 أحرف على الأقل", "Password must be at least 6 characters"), variant: "destructive" });
        return;
      }
      if (newPassword !== confirmPassword) {
        toast({ title: t("خطأ", "Error"), description: t("كلمة المرور غير متطابقة", "Passwords don't match"), variant: "destructive" });
        return;
      }
      if (!currentPassword) {
        toast({ title: t("خطأ", "Error"), description: t("أدخل كلمة المرور الحالية", "Enter current password"), variant: "destructive" });
        return;
      }
      data.currentPassword = currentPassword;
      data.newPassword = newPassword;
    }
    if (Object.keys(data).length === 0) {
      onClose();
      return;
    }
    mutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserIcon className="w-5 h-5 text-primary" />
            {t("تعديل الملف الشخصي", "Edit Profile")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          <div className="flex flex-col items-center gap-3">
            <div className="relative group">
              {profileImage ? (
                <div className="w-20 h-20 rounded-full overflow-hidden ring-4 ring-primary/20">
                  <img src={profileImage} alt="" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-20 h-20 rounded-full bg-primary/10 text-primary font-bold text-2xl flex items-center justify-center ring-4 ring-primary/20">
                  {(user.fullNameAr || "U").charAt(0)}
                </div>
              )}
              <button
                onClick={() => fileRef.current?.click()}
                className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                data-testid="button-change-avatar"
              >
                <Camera className="w-5 h-5 text-white" />
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} data-testid="input-avatar-file" />
            </div>
            <p className="text-sm font-medium">{t(user.fullNameAr, user.fullNameEn)}</p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/40">
              <Shield className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground">{t("اسم المستخدم", "Username")}: </span>
              <span className="text-sm font-medium" dir="ltr">{user.username}</span>
            </div>
          </div>

          <div className="space-y-3 border-t pt-4">
            <p className="text-sm font-semibold flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-primary" />
              {t("تغيير كلمة المرور", "Change Password")}
            </p>
            <div className="space-y-2.5">
              <div>
                <Label className="text-xs">{t("كلمة المرور الحالية", "Current Password")}</Label>
                <div className="relative">
                  <Input
                    type={showCurrent ? "text" : "password"}
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    className="pe-9"
                    data-testid="input-current-password"
                  />
                  <button className="absolute top-1/2 -translate-y-1/2 end-2.5 text-muted-foreground" onClick={() => setShowCurrent(!showCurrent)}>
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label className="text-xs">{t("كلمة المرور الجديدة", "New Password")}</Label>
                <div className="relative">
                  <Input
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="pe-9"
                    data-testid="input-new-password"
                  />
                  <button className="absolute top-1/2 -translate-y-1/2 end-2.5 text-muted-foreground" onClick={() => setShowNew(!showNew)}>
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label className="text-xs">{t("تأكيد كلمة المرور", "Confirm Password")}</Label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  data-testid="input-confirm-password"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={mutation.isPending} className="flex-1" data-testid="button-save-profile">
              {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin me-1.5" /> : <Check className="w-4 h-4 me-1.5" />}
              {t("حفظ", "Save")}
            </Button>
            <Button variant="outline" onClick={onClose} className="flex-1" data-testid="button-cancel-profile">
              {t("إلغاء", "Cancel")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated, logout, isLoggingOut } = useAuth();
  const { lang, toggleLang, t, isRTL } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("teak-sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });
  const [location, setLocation] = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem("teak-sidebar-collapsed", String(next));
      } catch {
        // ignore storage failures
      }
      return next;
    });
  };

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [location]);

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
      window.location.href = /^\/dashboard\/(?:warehouses|purchases|suppliers|inventory)/.test(window.location.pathname) ? "/warehouse-login" : "/login";
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

  const warehouseViewer = user.maintenanceScope === "warehouse" && user.accessPolicy &&
    user.accessPolicy.warehouse !== "manage" && user.accessPolicy.purchasing !== "manage";
  const roleLabel = warehouseViewer
    ? user.accessPolicy?.purchasing !== "none"
      ? { ar: "اطلاع المستودعات والمشتريات", en: "Warehouse & purchasing viewer" }
      : { ar: "اطلاع المستودعات", en: "Warehouse viewer" }
    : roleLabels[user.role] || { ar: user.role, en: user.role };

  return (
    <div className="min-h-screen bg-background flex">
      <AppSidebar collapsed={sidebarCollapsed} onToggleCollapsed={toggleSidebarCollapsed} />

      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        <header
          className="h-14 border-b border-border bg-card/50 flex items-center justify-between px-3 md:px-4 shrink-0"
          data-testid="header"
        >
          <div className="flex items-center gap-2">
            <MobileMenuButton />
            <img
              src={teakLogo}
              alt="Teak"
              className="w-7 h-7 object-contain md:hidden logo-auto transition-all duration-300"
              data-testid="img-header-logo"
            />
            <div className="hidden sm:flex items-center gap-2 min-w-0">
              <span className="text-sm font-medium truncate max-w-[120px] md:max-w-none" data-testid="text-user-name">
                {t(user.fullNameAr, user.fullNameEn)}
              </span>
              <span
                className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium shrink-0"
                data-testid="badge-user-role"
              >
                {t(roleLabel.ar, roleLabel.en)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <div className="relative">
              <UserAvatar user={user} onClick={() => setProfileOpen(!profileOpen)} />
              {profileOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                  <div className="fixed md:absolute top-14 md:top-full end-0 md:end-0 md:mt-2 w-[min(18rem,calc(100vw-0.5rem))] md:w-72 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden" data-testid="profile-popover">
                    <div className="bg-primary/5 px-4 pt-5 pb-4 flex flex-col items-center gap-2 border-b border-border">
                      <UserAvatar user={user} size="lg" onClick={() => { setProfileOpen(false); setEditOpen(true); }} />
                      <div className="text-center">
                        <p className="font-semibold text-sm">{t(user.fullNameAr, user.fullNameEn)}</p>
                        <Badge variant="secondary" className="mt-1 text-[10px]">{t(roleLabel.ar, roleLabel.en)}</Badge>
                      </div>
                    </div>
                    <div className="p-3 space-y-1.5">
                      {user.email && (
                        <div className="flex items-center gap-2.5 text-xs text-muted-foreground px-1">
                          <Mail className="w-3.5 h-3.5 shrink-0" />
                          <span dir="ltr">{user.email}</span>
                        </div>
                      )}
                      {user.phone && (
                        <div className="flex items-center gap-2.5 text-xs text-muted-foreground px-1">
                          <Phone className="w-3.5 h-3.5 shrink-0" />
                          <span dir="ltr">{user.phone}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2.5 text-xs text-muted-foreground px-1">
                        <Shield className="w-3.5 h-3.5 shrink-0" />
                        <span dir="ltr">@{user.username}</span>
                      </div>
                    </div>
                    <div className="border-t border-border p-2 space-y-1">
                      <Button
                        variant="ghost"
                        className="w-full justify-start text-xs h-8 gap-2"
                        onClick={() => { setProfileOpen(false); setEditOpen(true); }}
                        data-testid="button-edit-profile"
                      >
                        <UserIcon className="w-3.5 h-3.5" />
                        {t("تعديل الملف الشخصي", "Edit Profile")}
                      </Button>
                      <Button
                        variant="ghost"
                        className="w-full justify-start text-xs h-8 gap-2 text-destructive hover:text-destructive"
                        onClick={async () => { setProfileOpen(false); await logout(); window.location.href = user.maintenanceScope === "warehouse" ? "/warehouse-login" : "/login"; }}
                        disabled={isLoggingOut}
                        data-testid="button-popover-logout"
                      >
                        {isLoggingOut ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                        {t("تسجيل الخروج", "Sign Out")}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
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
                  <div className="fixed md:absolute top-14 md:top-full end-0 md:end-0 md:mt-1 w-[min(22rem,calc(100vw-0.5rem))] md:w-80 max-h-[70vh] md:max-h-96 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden" data-testid="notifications-panel">
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
            <LanguageToggle testId="button-dashboard-lang" />
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleTheme}
              data-testid="button-dashboard-theme"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
          </div>
        </header>

        <ProfileEditDialog user={user} open={editOpen} onClose={() => setEditOpen(false)} t={t} />

        <main ref={mainRef} className="flex-1 p-4 md:p-6 overflow-y-auto scrollbar-thin">
          {children}
        </main>
      </div>
    </div>
  );
}
