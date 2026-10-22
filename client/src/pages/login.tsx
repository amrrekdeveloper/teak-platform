import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage, LanguageToggle } from "@/components/language-provider";
import { useLoadingTransition } from "@/components/loading-transition";
import { useTheme } from "@/components/theme-provider";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Sun, Moon, Eye, EyeOff, Loader2, Lock, CheckCircle2, HelpCircle,
  Globe, Monitor, MapPin, Shield, AlertTriangle, Clock
} from "lucide-react";
import teakLogo from "@assets/TEAK-LOGO_(1)_(1)_1772710617816.png";

const ERP_REMEMBER_KEY = "teak.auth.remember.erp";
function readRememberedErpLogin() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(ERP_REMEMBER_KEY) || "null");
    return { username: typeof saved?.username === "string" ? saved.username : "", rememberMe: saved?.rememberMe === true };
  } catch { return { username: "", rememberMe: false }; }
}
function saveRememberedErpLogin(username: string, rememberMe: boolean) {
  try { window.localStorage.setItem(ERP_REMEMBER_KEY, JSON.stringify({ username: rememberMe ? username : "", rememberMe })); } catch { /* Storage may be blocked; authentication still works. */ }
}

const lifecycleStages = [
  {
    icon: "📋",
    labelAr: "المبيعات",
    labelEn: "Sales",
    staff: ["mohannad", "hadi"],
  },
  {
    icon: "🎨",
    labelAr: "التصميم",
    labelEn: "Design",
    staff: ["mohsen"],
  },
  {
    icon: "🏭",
    labelAr: "الإنتاج",
    labelEn: "Production",
    staff: ["hamdi"],
  },
  {
    icon: "📦",
    labelAr: "المستودع",
    labelEn: "Warehouse",
    staff: ["abdullah", "bassam"],
  },
  {
    icon: "🛒",
    labelAr: "المشتريات",
    labelEn: "Purchasing",
    staff: ["ayman"],
  },
  {
    icon: "🚚",
    labelAr: "التوصيل",
    labelEn: "Delivery",
    staff: ["m.sobri"],
  },
  {
    icon: "🔧",
    labelAr: "التركيبات",
    labelEn: "Installation",
    staff: ["sedad"],
  },
];

const bottomStages = [
  {
    icon: "💼",
    labelAr: "الإدارة",
    labelEn: "Management",
    staff: ["jabran", "khaled"],
  },
  {
    icon: "🔐",
    labelAr: "IT",
    labelEn: "IT",
    staff: ["siham"],
  },
  {
    icon: "💰",
    labelAr: "المحاسبة",
    labelEn: "Accounting",
    staff: ["ismail", "sultan"],
  },
];

const staffAccounts = [
  { username: "jabran", roleAr: "المالك", roleEn: "Owner" },
  { username: "khaled", roleAr: "المساعد", roleEn: "Assistant" },
  { username: "siham", roleAr: "تقنية المعلومات", roleEn: "IT" },
  { username: "mohannad", roleAr: "المبيعات", roleEn: "Sales" },
  { username: "hadi", roleAr: "المبيعات", roleEn: "Sales" },
  { username: "hamdi", roleAr: "الإنتاج", roleEn: "Production" },
  { username: "ismail", roleAr: "المحاسبة", roleEn: "Accounting" },
  { username: "sultan", roleAr: "المحاسبة", roleEn: "Accounting" },
  { username: "mohsen", roleAr: "المصمم", roleEn: "Designer" },
  { username: "abdullah", roleAr: "المستودع", roleEn: "Warehouse" },
  { username: "bassam", roleAr: "المستودع", roleEn: "Warehouse" },
  { username: "ayman", roleAr: "المشتريات", roleEn: "Purchasing" },
  { username: "sedad", roleAr: "التركيبات", roleEn: "Installation" },
  { username: "m.sobri", roleAr: "التوصيل", roleEn: "Delivery" },
];

function getStaffAccount(username: string) {
  return staffAccounts.find((a) => a.username === username);
}

function getInitials(username: string) {
  return username.slice(0, 2).toUpperCase();
}

function parseBrowserOS(ua: string): string {
  let browser = "Unknown";
  let os = "Unknown";
  if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Edg")) browser = "Edge";
  else if (ua.includes("OPR") || ua.includes("Opera")) browser = "Opera";
  else if (ua.includes("Chrome")) browser = "Chrome";
  else if (ua.includes("Safari")) browser = "Safari";

  if (ua.includes("Windows NT")) os = "Windows";
  else if (ua.includes("Mac OS X")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

  return `${browser} / ${os}`;
}

function CyberInfoPanel({ lang, failedAttempts }: { lang: string; failedAttempts: number }) {
  const [time, setTime] = useState(new Date());
  const [ip, setIp] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetch("https://api.ipify.org?format=json")
      .then((r) => r.json())
      .then((d) => setIp(d.ip))
      .catch(() => setIp("—"));
  }, []);

  const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const browserOS = parseBrowserOS(navigator.userAgent);
  const resolution = `${window.screen.width} × ${window.screen.height}`;

  const days = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const daysEn = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayName = lang === "ar" ? days[time.getDay()] : daysEn[time.getDay()];

  const timeStr = time.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const dateStr = time.toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div
      className="mt-4 rounded-xl border border-green-500/30 bg-black/90 dark:bg-black/95 text-green-400 font-mono text-[11px] overflow-hidden"
      style={{
        backgroundImage:
          "repeating-linear-gradient(0deg, transparent, transparent 22px, rgba(0,255,0,0.02) 22px, rgba(0,255,0,0.02) 23px)",
      }}
      data-testid="panel-cyber-info"
    >
      <div className="px-3 py-2 border-b border-green-500/20 bg-green-500/10 flex items-center gap-2">
        <Shield className="w-3 h-3 text-green-400" />
        <span className="text-green-300 font-semibold tracking-widest text-[10px]">
          {lang === "ar" ? "معلومات الأمان" : "SECURITY INFO"}
        </span>
        <div className="ms-auto flex gap-1">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <div className="w-2 h-2 rounded-full bg-yellow-500" />
          <div className="w-2 h-2 rounded-full bg-green-500" />
        </div>
      </div>

      <div className="p-3 space-y-1.5">
        <div className="flex items-center gap-2 text-green-300">
          <Clock className="w-3 h-3 shrink-0" />
          <span className="text-green-400 font-bold tracking-widest">{timeStr}</span>
          <span className="text-green-600 text-[10px]">{dayName} — {dateStr}</span>
        </div>

        <div className="flex items-center gap-2">
          <Globe className="w-3 h-3 shrink-0 text-green-500" />
          <span className="text-green-600">{lang === "ar" ? "عنوان IP:" : "IP:"}</span>
          <span className="text-green-300" data-testid="text-cyber-ip">
            {ip === null ? (lang === "ar" ? "جاري التحقق..." : "Checking...") : ip}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Monitor className="w-3 h-3 shrink-0 text-green-500" />
          <span className="text-green-600">{lang === "ar" ? "المتصفح:" : "Browser:"}</span>
          <span className="text-green-300">{browserOS}</span>
        </div>

        <div className="flex items-center gap-2">
          <MapPin className="w-3 h-3 shrink-0 text-green-500" />
          <span className="text-green-600">{lang === "ar" ? "المنطقة الزمنية:" : "Timezone:"}</span>
          <span className="text-green-300">{timezone}</span>
        </div>

        <div className="flex items-center gap-2">
          <Shield className="w-3 h-3 shrink-0 text-green-500" />
          <span className="text-green-600">{lang === "ar" ? "بروتوكول:" : "Protocol:"}</span>
          {isHttps ? (
            <span className="bg-green-500/20 text-green-300 px-1.5 py-0.5 rounded text-[10px] border border-green-500/30">
              🔒 {lang === "ar" ? "اتصال آمن HTTPS" : "Secure HTTPS"}
            </span>
          ) : (
            <span className="bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 rounded text-[10px] border border-yellow-500/30">
              ⚠ HTTP
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Monitor className="w-3 h-3 shrink-0 text-green-500" />
          <span className="text-green-600">{lang === "ar" ? "الدقة:" : "Resolution:"}</span>
          <span className="text-green-300">{resolution}</span>
        </div>

        {failedAttempts > 0 && (
          <div className="flex items-center gap-2 mt-1 pt-1 border-t border-green-500/20">
            <AlertTriangle className="w-3 h-3 shrink-0 text-yellow-400" />
            <span className="text-yellow-400">
              {lang === "ar"
                ? `محاولات فاشلة: ${failedAttempts}`
                : `Failed attempts: ${failedAttempts}`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  const { lang, toggleLang, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { login, isLoggingIn } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [savedLogin] = useState(readRememberedErpLogin);
  const usernameInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const [rememberMe, setRememberMe] = useState(savedLogin.rememberMe);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const loginBtnRef = useRef<HTMLButtonElement>(null);
  const { startTransition, TransitionComponent } = useLoadingTransition(1500);

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotUsername, setForgotUsername] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    const formData = new FormData(e.currentTarget);
    const submittedUsername = String(formData.get("username") || "").trim();
    const submittedPassword = String(formData.get("password") || "");
    const submittedRemember = formData.get("rememberMe") === "on";
    setRememberMe(submittedRemember);
    saveRememberedErpLogin(submittedUsername, submittedRemember);
    if (!submittedUsername || !submittedPassword) {
      setError(t("أدخل اسم المستخدم وكلمة المرور.", "Enter your username and password."));
      return;
    }
    try {
      await login({ username: submittedUsername, password: submittedPassword, rememberMe: submittedRemember });
      setFailedAttempts(0);
      await startTransition(
        t("جاري التحقق من البيانات...", "Verifying credentials..."),
        t("يتم تجهيز لوحة التحكم", "Preparing your dashboard")
      );
      setLocation("/dashboard");
    } catch (err: any) {
      setFailedAttempts((prev) => prev + 1);
      setSelectedUser(null);
      try {
        const errorData = JSON.parse(err.message.split(": ").slice(1).join(": "));
        setError(lang === "ar" ? errorData.message : errorData.messageEn);
      } catch {
        setError(t("حدث خطأ في تسجيل الدخول", "Login failed"));
      }
    }
  };

  const fillCredentials = (username: string) => {
    const account = getStaffAccount(username);
    if (!account) return;
    if(usernameInputRef.current)usernameInputRef.current.value=account.username;
    if(passwordInputRef.current)passwordInputRef.current.value="";
    saveRememberedErpLogin(account.username,rememberMe);
    setError("");
    setSelectedUser(account.username);
    setTimeout(() => {
      loginBtnRef.current?.focus();
    }, 50);
  };

  const handleForgotPassword = async () => {
    if (!forgotUsername.trim()) return;
    setForgotLoading(true);
    try {
      await apiRequest("POST", "/api/auth/forgot-password", { username: forgotUsername.trim() });
      setForgotSent(true);
    } catch (err: any) {
      try {
        const r = await err.json?.();
        toast({ title: r?.message || t("حدث خطأ", "Error"), variant: "destructive" });
      } catch {
        toast({ title: t("حدث خطأ", "Error"), variant: "destructive" });
      }
    } finally {
      setForgotLoading(false);
    }
  };

  const allStages = [...lifecycleStages, ...bottomStages];

  return (
    <div className="min-h-screen flex bg-background" dir={lang === "ar" ? "rtl" : "ltr"}>
      {TransitionComponent}

      <div className="absolute top-4 end-4 flex items-center gap-2 z-10">
        <Button size="icon" variant="ghost" onClick={toggleTheme} className="rounded-full" data-testid="button-login-theme">
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>
        <LanguageToggle testId="button-login-lang" />
      </div>

      {/* LEFT PANEL — desktop only */}
      <div
        className="hidden lg:flex lg:w-[420px] xl:w-[480px] flex-col relative overflow-hidden bg-primary"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 20% 50%, rgba(255,255,255,0.07) 0%, transparent 60%), " +
            "repeating-linear-gradient(135deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 40px), " +
            "repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 40px)",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-primary/80" />
        <div className="relative z-10 flex flex-col h-full p-8 overflow-y-auto">
          <div className="mb-8">
            <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center ring-1 ring-white/20 mb-4">
              <img src={teakLogo} alt="Teak" className="w-10 h-10 object-contain brightness-0 invert" />
            </div>
            <h2 className="text-white text-xl font-bold">
              {t("دورة حياة المصنع", "Factory Lifecycle")}
            </h2>
            <p className="text-white/60 text-xs mt-1">
              {t("اضغط على أي موظف للدخول السريع", "Click any staff member for quick login")}
            </p>
          </div>

          <div className="flex flex-col gap-0">
            {lifecycleStages.map((stage, si) => (
              <div key={stage.labelEn} className="flex flex-col">
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-9 h-9 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center text-base shrink-0">
                      {stage.icon}
                    </div>
                    {si < lifecycleStages.length - 1 && (
                      <div className="w-px h-6 bg-gradient-to-b from-white/30 to-white/10 mt-1" />
                    )}
                  </div>
                  <div className="flex-1 pb-1">
                    <p className="text-white/90 text-xs font-semibold mb-1.5">
                      {lang === "ar" ? stage.labelAr : stage.labelEn}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {stage.staff.map((uname) => {
                        const acc = getStaffAccount(uname);
                        const isSelected = selectedUser === uname;
                        return (
                          <button
                            key={uname}
                            type="button"
                            onClick={() => fillCredentials(uname)}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs transition-all ${
                              isSelected
                                ? "bg-white text-primary border-white font-semibold"
                                : "bg-white/10 border-white/25 text-white hover:bg-white/20 hover:border-white/40"
                            }`}
                            data-testid={`button-staff-${uname}`}
                          >
                            <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[9px] font-bold shrink-0">
                              {getInitials(uname)}
                            </span>
                            {uname}
                            {isSelected && <CheckCircle2 className="w-3 h-3 text-primary" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <div className="my-3 border-t border-white/15" />

            <div className="flex flex-col gap-2">
              {bottomStages.map((stage) => (
                <div key={stage.labelEn} className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-base shrink-0">
                    {stage.icon}
                  </div>
                  <div className="flex-1">
                    <p className="text-white/70 text-xs font-medium mb-1.5">
                      {lang === "ar" ? stage.labelAr : stage.labelEn}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {stage.staff.map((uname) => {
                        const isSelected = selectedUser === uname;
                        return (
                          <button
                            key={uname}
                            type="button"
                            onClick={() => fillCredentials(uname)}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs transition-all ${
                              isSelected
                                ? "bg-white text-primary border-white font-semibold"
                                : "bg-white/10 border-white/25 text-white hover:bg-white/20 hover:border-white/40"
                            }`}
                            data-testid={`button-staff-${uname}`}
                          >
                            <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[9px] font-bold shrink-0">
                              {getInitials(uname)}
                            </span>
                            {uname}
                            {isSelected && <CheckCircle2 className="w-3 h-3 text-primary" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL — form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-y-auto">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-primary/5 dark:bg-white/5 flex items-center justify-center ring-1 ring-border">
              <img
                src={teakLogo}
                alt="Teak"
                className="w-12 h-12 object-contain logo-auto transition-all duration-300"
                data-testid="img-login-logo"
              />
            </div>
            <h1 className="text-2xl font-bold mb-1" data-testid="text-login-title">
              {t("تسجيل الدخول", "Sign In")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("لوحة تحكم تيك للتصنيع", "Teak Manufacturing Dashboard")}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="on">
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm text-center" data-testid="text-login-error">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-xs font-medium text-muted-foreground">
                {t("اسم المستخدم", "Username")}
              </Label>
              <Input
                id="username"
                name="username"
                type="text"
                ref={usernameInputRef}
                defaultValue={savedLogin.username}
                onChange={(e) => { if (rememberMe) saveRememberedErpLogin(e.target.value, true); }}
                placeholder={t("أدخل اسم المستخدم", "Enter username")}
                required
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="h-11"
                data-testid="input-username"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-medium text-muted-foreground">
                {t("كلمة المرور", "Password")}
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  ref={passwordInputRef}
                  defaultValue=""
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder={t("أدخل كلمة المرور", "Enter password")}
                  required
                  autoComplete="current-password"
                  className="h-11 pe-11"
                  data-testid="input-password"
                />
                <button
                  type="button"
                  className="absolute top-1/2 -translate-y-1/2 end-3 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  data-testid="button-toggle-password"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="login-remember" className="flex items-center gap-2 text-sm cursor-pointer">
                <input id="login-remember" name="rememberMe" type="checkbox" checked={rememberMe} onChange={(e) => { setRememberMe(e.target.checked); saveRememberedErpLogin(e.target.checked ? usernameInputRef.current?.value || "" : "", e.target.checked); }} className="h-4 w-4 accent-primary" />
                <span>{t("تذكرني على هذا الجهاز", "Remember me on this device")}</span>
              </label>
              <p className="text-xs text-muted-foreground">{t("لا تفعّل التذكر على جهاز مشترك.", "Do not enable this on a shared device.")}</p>
            </div>

            <Button
              ref={loginBtnRef}
              type="submit"
              className="w-full h-11 text-sm font-semibold"
              disabled={isLoggingIn}
              data-testid="button-login-submit"
            >
              {isLoggingIn ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Lock className="w-4 h-4 me-2" />
                  {t("دخول", "Sign In")}
                </>
              )}
            </Button>

            <button
              type="button"
              onClick={() => {
                setForgotOpen(true);
                setForgotSent(false);
                setForgotUsername("");
              }}
              className="w-full text-center text-xs text-muted-foreground hover:text-primary transition-colors py-1"
              data-testid="link-forgot-password"
            >
              <HelpCircle className="w-3.5 h-3.5 inline me-1" />
              {t("نسيت كلمة المرور؟", "Forgot password?")}
            </button>
          </form>

          <CyberInfoPanel lang={lang} failedAttempts={failedAttempts} />

          {/* Mobile staff section */}
          <div className="lg:hidden mt-6">
            <p className="text-xs font-semibold text-primary mb-3 text-center" data-testid="text-staff-title">
              {t("فريق العمل — اضغط للدخول السريع", "Staff — Tap for quick login")}
            </p>
            <div className="space-y-2">
              {allStages.map((stage) => (
                <div key={stage.labelEn} className="rounded-xl border border-border bg-muted/30 p-2.5">
                  <p className="text-[10px] font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                    <span>{stage.icon}</span>
                    <span>{lang === "ar" ? stage.labelAr : stage.labelEn}</span>
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {stage.staff.map((uname) => {
                      const acc = getStaffAccount(uname);
                      const isSelected = selectedUser === uname;
                      return (
                        <button
                          key={uname}
                          type="button"
                          onClick={() => fillCredentials(uname)}
                          className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs transition-all text-start ${
                            isSelected
                              ? "bg-primary text-primary-foreground border-primary font-semibold"
                              : "bg-background border-border hover:bg-accent hover:border-primary/40"
                          }`}
                          data-testid={`button-staff-mobile-${uname}`}
                        >
                          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${isSelected ? "bg-white/20" : "bg-primary/10 text-primary"}`}>
                            {getInitials(uname)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{uname}</p>
                            {acc && (
                              <p className="text-[9px] opacity-60 truncate">
                                {lang === "ar" ? acc.roleAr : acc.roleEn}
                              </p>
                            )}
                          </div>
                          {isSelected && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 text-center">
            <a
              href="/"
              className="text-xs text-muted-foreground hover:text-primary transition-colors"
              data-testid="link-back-home"
            >
              {t("العودة للصفحة الرئيسية", "Back to Home")}
            </a>
          </div>
        </div>
      </div>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("نسيت كلمة المرور", "Forgot Password")}</DialogTitle>
          </DialogHeader>
          {forgotSent ? (
            <div className="text-center py-4 space-y-3">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
              <p className="text-sm font-medium" data-testid="text-forgot-success">
                {t("تم إرسال طلبك بنجاح", "Your request has been submitted")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("سيتم التواصل معك قريباً عبر مسؤول النظام", "The system admin will contact you soon")}
              </p>
              <Button variant="outline" className="w-full" onClick={() => setForgotOpen(false)} data-testid="button-forgot-close">
                {t("حسناً", "OK")}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t("أدخل اسم المستخدم الخاص بك وسيتم إبلاغ المسؤول", "Enter your username and the admin will be notified")}
              </p>
              <div className="space-y-1.5">
                <Label>{t("اسم المستخدم", "Username")}</Label>
                <Input
                  value={forgotUsername}
                  onChange={(e) => setForgotUsername(e.target.value)}
                  placeholder={t("أدخل اسم المستخدم", "Enter your username")}
                  data-testid="input-forgot-username"
                />
              </div>
              <Button
                className="w-full"
                disabled={!forgotUsername.trim() || forgotLoading}
                onClick={handleForgotPassword}
                data-testid="button-forgot-submit"
              >
                {forgotLoading ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : null}
                {t("إرسال الطلب", "Submit Request")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
