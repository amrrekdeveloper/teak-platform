import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Route, Switch, useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import EmployeesPage from "@/pages/employees";
import EmployeeDetailPage from "@/pages/employee-detail";
import AttendanceMonitorPage from "@/pages/attendance-monitor";
import AttendanceApprovalsPage from "@/pages/attendance-approvals";
import AttendanceSettingsPage from "@/pages/attendance-settings";
import LeavesPage from "@/pages/leaves";
import HrReportsPage from "@/pages/hr-reports";
import HrAccessManagementPage from "@/pages/hr-access-management";
import HrActionsPage from "@/pages/hr-actions";
import PayrollPage from "@/pages/payroll";
import AdvancesPage from "@/pages/advances";
import EvaluationsPage from "@/pages/evaluations";
import HrAlertsPage from "@/pages/hr-alerts";
import HrOverviewPage from "@/pages/hr-overview";
import HrSystemSettingsPage from "@/pages/hr-system-settings";
import HrRequestsCenterPage from "@/pages/hr-requests-center";
import HrHelp from "@/components/hr-help";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import HrThemeToggle from "@/components/hr-theme-toggle";
import "@/styles/hr-theme.css";
import {
  ArrowLeft, CalendarDays, ChevronLeft, CircleDollarSign, Eye, EyeOff, BriefcaseBusiness,
  ClipboardCheck, Clock3, DoorOpen, LoaderCircle, LockKeyhole, Menu,
  ShieldCheck, UsersRound, X, Settings, FileBarChart2, KeyRound, Bell, LayoutDashboard, Inbox, PanelsTopLeft,
} from "lucide-react";

type HrUser = { role?: string; maintenanceScope?: string; userWorkspace?: boolean; permissions?: string[]; fullNameAr?: string; fullNameEn?: string; username?: string };
type UserWorkspace = { id: "hr" | "warehouse" | "purchasing" | "accounts" | "manager"; titleAr: string; titleEn: string; path: string };
type UserAccess = HrUser & { id?: number; isOwner?: boolean; canManageAccounts?: boolean; delegatedSystems?: string[]; activeWorkspace?: string | null; workspaces?: UserWorkspace[]; redirectTo?: string; userWorkspace?: boolean };
type HrPage = "overview" | "requests" | "settings" | "employees" | "attendance-monitor" | "attendance-settings" | "leaves" | "permissions" | "reports" | "access" | "actions" | "payroll" | "advances" | "evaluations" | "alerts";
type RememberedLogin = { username: string; rememberMe: boolean };
const HR_REMEMBER_KEY = "teak.auth.remember.hr";
function readRememberedHrLogin(): RememberedLogin {
  try {
    const saved = JSON.parse(window.localStorage.getItem(HR_REMEMBER_KEY) || "null");
    return { username: typeof saved?.username === "string" ? saved.username : "", rememberMe: saved?.rememberMe === true };
  } catch { return { username: "", rememberMe: false }; }
}
function saveRememberedHrLogin(username: string, rememberMe: boolean) {
  try { window.localStorage.setItem(HR_REMEMBER_KEY, JSON.stringify({ username: rememberMe ? username : "", rememberMe })); } catch { /* Storage may be blocked; authentication still works. */ }
}

const navItems: { href: string; key: HrPage; group: "workspace" | "people" | "requests" | "operations"; icon: typeof UsersRound }[] = [
  { href: "/overview", key: "overview", group: "workspace", icon: LayoutDashboard },
  { href: "/requests", key: "requests", group: "workspace", icon: Inbox },
  { href: "/settings", key: "settings", group: "workspace", icon: Settings },
  { href: "/employees", key: "employees", group: "people", icon: UsersRound },
  { href: "/attendance-monitor", key: "attendance-monitor", group: "people", icon: Clock3 },
  { href: "/attendance-settings", key: "attendance-settings", group: "people", icon: Settings },
  { href: "/leaves", key: "leaves", group: "requests", icon: CalendarDays },
  { href: "/alerts", key: "alerts", group: "requests", icon: Bell },
  { href: "/permissions", key: "permissions", group: "requests", icon: Clock3 },
  { href: "/reports", key: "reports", group: "requests", icon: FileBarChart2 },
  { href: "/payroll", key: "payroll", group: "operations", icon: CircleDollarSign },
  { href: "/advances", key: "advances", group: "operations", icon: DoorOpen },
  { href: "/evaluations", key: "evaluations", group: "operations", icon: ClipboardCheck },
  { href: "/access", key: "access", group: "operations", icon: KeyRound },
  { href: "/actions", key: "actions", group: "operations", icon: BriefcaseBusiness },
];

function WorkspaceLoading() {
  return (
    <div className="hr-loading" role="status" aria-label="جارٍ تحميل مساحة الموارد البشرية">
      <div className="hr-loading-mark" />
      <div className="hr-loading-lines"><i /><i /><i /></div>
    </div>
  );
}

function UserWorkspacePage() {
  const { t, isRTL } = useLanguage();
  const [message, setMessage] = useState("");
  const { data: access, isLoading, isError, refetch } = useQuery<UserAccess>({
    queryKey: ["/api/user-access/me"],
    queryFn: async () => {
      const response = await fetch("/api/user-access/me", { credentials: "include" });
      if (response.status === 401) {
        window.location.assign("/user-login");
        throw new Error("session");
      }
      if (!response.ok) throw new Error("access");
      return response.json();
    },
    retry: false,
  });
  const changeWorkspace = async (workspace: UserWorkspace) => {
    setMessage("");
    try {
      const response = await apiRequest("POST", "/api/user-access/workspace", { workspace: workspace.id });
      const result = await response.json() as { redirectTo: string };
      await queryClient.cancelQueries();
      queryClient.clear();
      window.location.assign(result.redirectTo);
    } catch (error: any) {
      setMessage(error?.message || t("تعذّر فتح مساحة العمل. حاول مرة أخرى.", "Could not open this workspace. Try again."));
    }
  };
  if (isLoading) return <WorkspaceLoading />;
  if (isError || !access) return <main className="user-workspace-page" dir={isRTL ? "rtl" : "ltr"}>
    <section className="user-workspace-panel"><ShieldCheck size={30} /><h1>{t("تعذّر تحميل أنظمتك", "We couldn’t load your systems")}</h1><p>{t("تحقق من اتصالك ثم أعد المحاولة.", "Check your connection and try again.")}</p><Button onClick={() => void refetch()}>{t("إعادة المحاولة", "Try again")}</Button></section>
  </main>;
  const systems = access.workspaces || [];
  return <main className="user-workspace-page" dir={isRTL ? "rtl" : "ltr"}>
    <header className="user-workspace-heading">
      <div className="hr-wordmark"><img src="/__maintenance/logo.png" alt="TEAK" /><span>{t("أنظمتي", "My systems")}</span><HrThemeToggle /><LanguageToggle /></div>
      <p className="hr-kicker">{t("مساحة العمل", "WORKSPACE")}</p>
      <h1>{t("مرحباً، ", "Welcome, ")}{access.fullNameAr || access.fullNameEn || access.username}</h1>
      <p>{t("اختر النظام الذي تريد العمل فيه. تظهر هنا الأنظمة المصرّح بها لحسابك فقط.", "Choose a system to continue. Only systems authorized for your account appear here.")}</p>
    </header>
    {message && <p className="hr-login-error" role="alert">{message}</p>}
    {systems.length ? <section className="user-system-list" aria-label={t("الأنظمة المتاحة", "Available systems")}>
      {systems.map((system, index) => <button key={system.id} className="user-system-card" type="button" onClick={() => void changeWorkspace(system)}>
        <span className="user-system-number">0{index + 1}</span><span className="user-system-title">{t(system.titleAr, system.titleEn)}</span><span className="user-system-arrow" aria-hidden="true">{isRTL ? "←" : "→"}</span>
      </button>)}
    </section> : <section className="user-no-access">
      <ShieldCheck size={28} strokeWidth={1.6} /><h2>{t("لا توجد أنظمة متاحة حالياً", "No systems available yet")}</h2>
      <p>{t("لا يملك حسابك صلاحية لأي مساحة عمل حالياً. تواصل مع مسؤول النظام للمساعدة.", "Your account is not currently assigned to a workspace. Contact your system administrator for help.")}</p>
    </section>}
    <button className="user-workspace-signout" type="button" onClick={async () => { try { await apiRequest("POST", "/api/auth/logout", {}); await queryClient.cancelQueries(); queryClient.clear(); window.location.assign("/user-login"); } catch { setMessage(t("تعذّر تسجيل الخروج. حاول مرة أخرى.", "Could not sign out. Try again.")); } }}>
      <DoorOpen size={16} />{t("تسجيل الخروج", "Sign out")}
    </button>
  </main>;
}

function HrLogin({ sessionUser }: { sessionUser: HrUser | null }) {
  const { t, isRTL } = useLanguage();
  const [, setLocation] = useLocation();
  const [savedLogin] = useState(readRememberedHrLogin);
  const [rememberMe, setRememberMe] = useState(savedLogin.rememberMe);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setError("");
    const formData = new FormData(event.currentTarget);
    const submittedUsername = String(formData.get("username") || "").trim();
    const submittedPassword = String(formData.get("password") || "");
    const submittedRemember = formData.get("rememberMe") === "on";
    setRememberMe(submittedRemember);
    saveRememberedHrLogin(submittedUsername, submittedRemember);
    if (!submittedUsername || !submittedPassword) {
      setError("أدخل اسم المستخدم وكلمة المرور.");
      return;
    }
    setPending(true);
    try {
      await queryClient.cancelQueries();
      queryClient.setQueryData(["/api/auth/me"], null);
      queryClient.clear();
      const response = await apiRequest("POST", "/api/user-access/login", { username: submittedUsername, password: submittedPassword, rememberMe: submittedRemember });
      const user = await response.json() as UserAccess;
      await queryClient.cancelQueries();
      queryClient.clear();
      // A new entry bundle and fresh scoped auth query are needed across workspaces.
      // Publishing the login response to the old router races its authenticated redirect.
      window.location.assign(user.redirectTo || "/workspace");
    } catch (cause: any) {
      let message = typeof cause?.message==="string" ? cause.message : "تعذّر تسجيل الدخول. تحقق من البيانات وحاول مرة أخرى.";
      try {
        const body = await cause?.json?.();
        if (body?.message) message = body.message;
      } catch { /* Keep the accessible generic message. */ }
      setError(message);
    } finally {
      setPending(false);
    }
  };

  const wrongRole = !!sessionUser && sessionUser.maintenanceScope !== "user" && sessionUser.maintenanceScope !== "hr" && sessionUser.maintenanceScope !== "warehouse" && !(sessionUser as UserAccess).userWorkspace;
  return (
    <main className="hr-login-page" dir={isRTL ? "rtl" : "ltr"}>
      <div className="hr-login-frame">
        <section className="hr-login-copy">
          <div className="hr-wordmark"><img src="/__maintenance/logo.png" alt="TEAK" /><span>{t("دخول المستخدمين", "User login")}</span><HrThemeToggle /><LanguageToggle /></div>
          <div className="hr-login-title">
            <span className="hr-kicker">{t("دخول المستخدمين", "User login")}</span>
            <h1>{t("تسجيل الدخول", "Sign in")}</h1>
            <p>{t("استخدم حسابك المعتمد للوصول إلى أنظمتك.", "Use your authorized account to access your systems.")}</p>
          </div>
          <form className="hr-login-form" onSubmit={submit} noValidate autoComplete="on">
            <div className="hr-field">
              <Label htmlFor="hr-username">{t("اسم المستخدم", "Username")}</Label>
              <Input id="hr-username" name="username" type="text" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} defaultValue={savedLogin.username} onChange={e => { if (rememberMe) saveRememberedHrLogin(e.target.value, true); }} required disabled={pending} />
            </div>
            <div className="hr-field">
              <Label htmlFor="hr-password">{t("كلمة المرور", "Password")}</Label>
              <div className="hr-password-wrap">
                <Input id="hr-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} defaultValue="" required disabled={pending} />
                <button type="button" className="hr-password-toggle" aria-label={showPassword ? t("إخفاء كلمة المرور", "Hide password") : t("إظهار كلمة المرور", "Show password")} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)} disabled={pending}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </div>
            </div>
            <div className="hr-remember">
              <label><input type="checkbox" name="rememberMe" checked={rememberMe} onChange={e => { setRememberMe(e.target.checked); const form=e.currentTarget.form; saveRememberedHrLogin(e.target.checked && form ? String(new FormData(form).get("username") || "") : "", e.target.checked); }} disabled={pending} /> {t("تذكرني على هذا الجهاز", "Remember me on this device")}</label>
              <p>{t("لا تفعّل التذكر على جهاز مشترك.", "Do not use this on a shared device.")}</p>
            </div>
            {(error || wrongRole) && (
              <p className="hr-login-error" role="alert">
                {error || t("هذا الحساب لا يملك صلاحية الدخول إلى أنظمة تيك.", "This account cannot access TEAK systems.")}
              </p>
            )}
            <Button type="submit" disabled={pending} className="hr-login-submit">
              {pending ? <LoaderCircle size={17} className="hr-spinning" /> : <LockKeyhole size={17} />}
              <span>{pending ? t("جارٍ التحقق…", "Verifying…") : t("دخول آمن", "Secure sign in")}</span>
              <ArrowLeft size={17} className={isRTL ? "" : "rotate-180"} />
            </Button>
          </form>
          <p className="hr-login-footnote"><LockKeyhole size={14} /> {t("دخول آمن إلى أنظمة تيك", "Secure access to TEAK systems")}</p>
        </section>
        <aside className="hr-login-aside" aria-label={t("أنظمة تيك", "TEAK systems")}>
          <div className="hr-aside-top"><span>TEAK / SYSTEMS</span><span className="hr-status-dot" /> {t("بيئة داخلية", "Private access")}</div>
          <div className="hr-aside-art">
            <div className="hr-art-ring hr-art-ring-one" /><div className="hr-art-ring hr-art-ring-two" />
            <div className="hr-art-core"><UsersRound size={49} strokeWidth={1.15} /></div>
            <span className="hr-art-index">01 — 06</span>
          </div>
          <div className="hr-aside-caption"><span>{t("مساحة عمل موحدة", "One trusted entry")}</span><strong>{t("أنظمتك،", "Your systems,")}<br />{t("في مكان واحد.", "in one place.")}</strong></div>
          <div className="hr-aside-bottom"><span>{t("دخول المستخدمين", "User access")}</span><span>TEAK / 2026</span></div>
        </aside>
      </div>
    </main>
  );
}

function HrLayout() {
  const { t, isRTL } = useLanguage();
  const navLabel = (key: HrPage) => ({
    overview: t("نظرة عامة", "Overview"),
    requests: t("الطلبات والموافقات", "Requests & approvals"),
    settings: t("إعدادات الموارد البشرية", "HR settings"),
    employees: t("الموظفون", "Employees"),
    "attendance-monitor": t("مراقبة الدوام", "Attendance"),
    "attendance-settings": t("إعدادات الدوام", "Attendance settings"),
    leaves: t("الإجازات", "Leaves"),
    permissions: t("الاستئذانات", "Permissions"),
    reports: t("التقارير", "Reports"),
    access: t("الحسابات والصلاحيات", "Accounts & access"),
    actions: t("الإجراءات", "Actions"),
    payroll: t("مسير الرواتب", "Payroll"),
    advances: t("السلف", "Advances"),
    evaluations: t("التقييمات", "Evaluations"),
    alerts: t("التنبيهات", "Alerts"),
  })[key];
  const [location, setLocation] = useLocation();
  const { user, isLoading, logout, isLoggingOut } = useAuth();
  const { data: alertSnapshot } = useQuery<{ items: { severity: string; readAt: string | null }[] }>({
    queryKey: ["/api/hr/alerts"],
    queryFn: async () => {
      const response = await fetch("/api/hr/alerts", { credentials: "include" });
      if (!response.ok) throw new Error("alerts");
      return response.json();
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const currentPath = location.replace(/^\/hr/, "").split(/[?#]/)[0] || "/";
  const active = navItems.find(item => item.href !== "/requests" && item.href !== "/settings" && (currentPath === item.href || (item.href !== "/attendance-monitor" && currentPath.startsWith(`${item.href}/`))))
    || (currentPath === "/requests" ? navItems.find(item => item.key === "requests") : undefined)
    || (currentPath === "/settings" ? navItems.find(item => item.key === "settings") : undefined);
  const hrUser = user as HrUser | null;
  const authorized = (hrUser?.role === "hr" || hrUser?.userWorkspace === true) && hrUser?.maintenanceScope === "hr";

  useEffect(() => {
    if (!isLoading && !authorized) window.location.assign(hrUser?.userWorkspace ? "/workspace" : "/user-login");
  }, [isLoading, authorized, setLocation]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  if (isLoading) return <WorkspaceLoading />;
  if (!hrUser || !authorized) return <WorkspaceLoading />;

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setLogoutError("");
    try {
      await logout();
      await queryClient.cancelQueries();
      queryClient.clear();
      queryClient.setQueryData(["/api/auth/me"], null);
      window.location.assign("/user-login");
    } catch {
      setLogoutError("تعذّر تسجيل الخروج. تحقق من الاتصال وحاول مرة أخرى.");
    }
  };

  return (
    <div className="hr-workspace hr-help-reserve" dir={isRTL ? "rtl" : "ltr"}>
       <header className="hr-mobile-header">
        <button type="button" className="hr-icon-button" aria-label={menuOpen ? "إغلاق القائمة" : "فتح القائمة"} aria-expanded={menuOpen} aria-controls="hr-primary-navigation" onClick={() => setMenuOpen(v => !v)}>
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
         <div className="hr-mobile-brand"><img src="/__maintenance/logo.png" alt="TEAK" /><span>{t("تيك", "TEAK")}</span></div>
         <button type="button" className="hr-alert-bell" aria-label={t("فتح التنبيهات", "Open alerts")} onClick={() => setLocation("/alerts")}><Bell size={19} />{(alertSnapshot?.items || []).filter(item => item.severity === "critical" && !item.readAt).length > 0 && <span>{Math.min(99, (alertSnapshot?.items || []).filter(item => item.severity === "critical" && !item.readAt).length)}</span>}</button>
         <HrThemeToggle compact />
        <LanguageToggle testId="button-hr-mobile-language" />
        <span className="hr-avatar">{(hrUser.fullNameAr || hrUser.username || "HR").slice(0, 1)}</span>
      </header>
      {menuOpen && <button type="button" className="hr-mobile-scrim" aria-label="إغلاق القائمة" onClick={() => setMenuOpen(false)} />}
      <aside className={`hr-sidebar ${menuOpen ? "is-open" : ""}`}>
        <div className="hr-brand-lockup">
          <img src="/__maintenance/logo.png" alt="TEAK" />
          <div><strong>{t("تيك", "TEAK")}</strong><small>{t("إدارة الموارد البشرية", "Human Resources")}</small></div>
        </div>
        <nav id="hr-primary-navigation" className="hr-nav" aria-label={t("التنقل في الموارد البشرية", "HR navigation")}>
          <button type="button" className="hr-nav-link" onClick={() => { setMenuOpen(false); window.location.assign("/workspace"); }}>
            <PanelsTopLeft size={18} strokeWidth={1.8} /><span>{t("أنظمتي", "My systems")}</span>
          </button>
          {(["workspace", "people", "requests", "operations"] as const).map(group => <div key={group} className="hr-nav-group">
            <div className="hr-nav-group-label">{group === "workspace" ? t("مساحة العمل", "Workspace") : group === "people" ? t("الفريق والحضور", "People & attendance") : group === "requests" ? t("الطلبات", "Requests") : t("الإدارة", "Operations")}</div>
            {navItems.filter(item => item.group === group).map(({ href, key, icon: Icon }) => (
              <div key={key}>
              <button type="button" className={`hr-nav-link ${active?.key === key ? "is-active" : ""}`} aria-current={active?.key === key ? "page" : undefined} onClick={() => { setLocation(href); setMenuOpen(false); }}>
                <Icon size={18} strokeWidth={1.8} /><span>{navLabel(key)}</span>{active?.key === key && <ChevronLeft size={15} className={`hr-nav-chevron ${isRTL ? "" : "rotate-180"}`} />}
              </button>
              {key === "attendance-monitor" && <button type="button" className={`hr-nav-link hr-nav-subitem ${currentPath === "/attendance-monitor/approvals" ? "is-active" : ""}`} aria-current={currentPath === "/attendance-monitor/approvals" ? "page" : undefined} onClick={() => { setLocation("/attendance-monitor/approvals"); setMenuOpen(false); }}>
                <ClipboardCheck size={17} strokeWidth={1.8} /><span>{t("الموافقات", "Approvals")}</span>{currentPath === "/attendance-monitor/approvals" && <ChevronLeft size={15} className={`hr-nav-chevron ${isRTL ? "" : "rotate-180"}`} />}
              </button>}
              </div>
            ))}
          </div>)}
        </nav>
        <div className="hr-sidebar-bottom">
          <div className="hr-user-summary"><span className="hr-avatar">{(hrUser.fullNameAr || hrUser.username || "HR").slice(0, 1)}</span><span className="hr-user-details"><strong>{hrUser.fullNameAr || hrUser.fullNameEn || "إدارة الموارد البشرية"}</strong><small>مسؤول الموارد البشرية</small></span></div>
          <button type="button" className="hr-logout" onClick={handleLogout} disabled={isLoggingOut}>
            {isLoggingOut ? <LoaderCircle size={17} className="hr-spinning" /> : <DoorOpen size={17} />}<span>{t("تسجيل الخروج", "Sign out")}</span>
          </button>
          {logoutError && <p className="hr-session-error" role="alert">{logoutError}</p>}
        </div>
      </aside>
      <section className="hr-main-column">
        <header className="hr-topbar" data-page={active?.key}>
          <div><span className="hr-breadcrumb-root">{t("تيك", "TEAK")}</span><span className="hr-breadcrumb-slash">/</span><span>{currentPath === "/attendance-monitor/approvals" ? t("الموافقات", "Approvals") : active ? navLabel(active.key) : t("الموظف", "Employee")}</span></div>
          <div className="hr-topbar-actions">
             <button type="button" className="hr-alert-bell" aria-label={t("فتح التنبيهات", "Open alerts")} onClick={() => setLocation("/alerts")}><Bell size={18} />{(alertSnapshot?.items || []).filter(item => item.severity === "critical" && !item.readAt).length > 0 && <span>{Math.min(99, (alertSnapshot?.items || []).filter(item => item.severity === "critical" && !item.readAt).length)}</span>}</button>
            <div className="hr-topbar-state"><span className="hr-topbar-dot" /> {t("مساحة الموارد البشرية", "HR workspace")}</div>
             <HrThemeToggle />
            <LanguageToggle testId="button-hr-desktop-language" />
          </div>
        </header>
        <main className="hr-content">
          {isLoggingOut ? <WorkspaceLoading /> : <Switch>
            <Route path="/workspace" component={UserWorkspacePage} />
            <Route path="/user-login" component={HrLoginRoute} />
            <Route path="/hr/login" component={HrLoginRoute} />
            <Route path="/warehouse-login" component={HrLoginRoute} />
            <Route path="/login" component={HrLoginRoute} />
            <Route path="/"><RedirectToOverview /></Route>
            <Route path="/overview" component={HrOverviewPage} />
            <Route path="/requests" component={HrRequestsCenterPage} />
            <Route path="/settings" component={HrSystemSettingsPage} />
            <Route path="/employees/:id" component={EmployeeDetailPage} />
            <Route path="/employees" component={EmployeesPage} />
            <Route path="/attendance-monitor/approvals" component={AttendanceApprovalsPage} />
            <Route path="/attendance-monitor" component={HrAttendanceMonitorRoute} />
            <Route path="/attendance-settings" component={AttendanceSettingsPage} />
            <Route path="/leaves"><LeavesPage /></Route>
             <Route path="/alerts" component={HrAlertsPage} />
            <Route path="/permissions">{() => <LeavesPage section="permissions" />}</Route>
            <Route path="/reports/attendance-records">{() => <AttendanceMonitorPage recordsOnly />}</Route>
            <Route path="/reports" component={HrReportsPage} />
            <Route path="/access" component={HrAccessManagementPage} />
            <Route path="/actions" component={HrActionsPage} />
            <Route path="/payroll" component={PayrollPage} />
            <Route path="/advances" component={AdvancesPage} />
            <Route path="/evaluations" component={EvaluationsPage} />
            <Route><RedirectToOverview /></Route>
          </Switch>}
        </main>
      </section>
      <HrHelp user={hrUser} menuOpen={menuOpen} />
    </div>
  );
}

function RedirectToOverview() {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation("/overview"); }, [setLocation]);
  return <WorkspaceLoading />;
}

function HrAttendanceMonitorRoute() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const legacyRecords = new URLSearchParams(search).get("tab") === "records";
  useEffect(() => {
    if (legacyRecords) setLocation("/reports/attendance-records");
  }, [legacyRecords, setLocation]);
  return legacyRecords ? <WorkspaceLoading /> : <AttendanceMonitorPage />;
}

function HrLoginRoute() {
  const { user } = useAuth();
  const hrUser = user as UserAccess | null;
  useEffect(() => {
    if (hrUser?.userWorkspace) window.location.replace("/workspace");
    else if (hrUser?.maintenanceScope === "hr" && hrUser.role === "hr") window.location.replace("/hr/overview");
  }, [hrUser?.role, hrUser?.maintenanceScope, hrUser?.userWorkspace]);
  return <HrLogin sessionUser={hrUser} />;
}

export default function HrWorkspace() {
  useEffect(()=>{
    document.documentElement.classList.add("teak-hr-surface");
    return ()=>document.documentElement.classList.remove("teak-hr-surface");
  },[]);
  return (
    <>
      <style>{`
        html.teak-hr-surface { overflow-x:clip; }
        html.teak-hr-surface body { overflow-x:clip;overflow-y:visible;min-width:0;max-width:100%; }
        .hr-workspace, .hr-login-page { color:var(--hr-ink); font-family:"Zain",Tahoma,sans-serif; }
        .hr-workspace { min-height:100dvh; width:100%;max-width:100%;overflow-x:clip;display:flex; background:var(--hr-paper); }
        @media(max-width:767px) {
          .hr-workspace table.hr-responsive,.hr-workspace .hr-responsive tbody { display:block;width:100%;min-width:0; }
          .hr-workspace .hr-responsive thead { display:none; }
           .hr-workspace .hr-responsive tbody tr { display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;margin:10px 0;padding:14px;border:1px solid var(--hr-line);border-radius:10px;background:var(--hr-ivory); }
          .hr-workspace .hr-responsive td { display:block;min-width:0;max-width:none;padding:0;border:0;white-space:normal;overflow:visible;text-overflow:clip;overflow-wrap:anywhere;text-align:start; }
          .hr-workspace .hr-responsive td:before { display:block;content:attr(data-label);font-size:12px;font-weight:400;color:var(--hr-muted);margin-bottom:4px; }
          .hr-workspace .hr-responsive td:last-child { grid-column:1/-1; }
        }
        .hr-sidebar { position:fixed; inset-block:0; inset-inline-start:0; z-index:30; width:258px; background:var(--hr-ivory); border-inline-end:1px solid var(--hr-line); display:flex; flex-direction:column; padding:28px 17px 18px;overflow-y:auto;overscroll-behavior:contain; }
        .hr-brand-lockup { display:flex; align-items:center; gap:11px; padding:0 9px 28px; border-bottom:1px solid var(--hr-line); }
        .hr-brand-lockup img { width:54px;height:38px;object-fit:contain; }
        .hr-brand-lockup img,.hr-wordmark img,.hr-mobile-brand img { filter:brightness(0) saturate(100%) invert(11%) sepia(94%) saturate(3915%) hue-rotate(353deg) brightness(81%) contrast(111%); }
        .hr-brand-mark,.hr-wordmark-seal { width:38px;height:38px;display:grid;place-items:center;color:var(--hr-red);background:#f6e9e5;border-radius:12px; }
        .hr-brand-lockup strong { display:block;font-size:23px;line-height:1.05;letter-spacing:-.04em; }
        .hr-brand-lockup small { display:block;margin-top:4px;font-size:13px;color:var(--hr-muted); }
        .hr-side-label { margin:27px 11px 10px;color:#a2968e;font-size:12px;font-weight:700; }
        .hr-nav { display:grid;gap:5px; }
         .hr-nav-group { display:grid;gap:4px;margin-top:10px; }
         .hr-nav-group-label { padding:8px 11px 2px;color:#a2968e;font-size:11px;font-weight:700;letter-spacing:.02em; }
        .hr-nav-link { min-height:46px;width:100%;display:flex;align-items:center;gap:12px;padding:0 12px;border:0;border-radius:9px;background:transparent;color:#655851;text-align:start;font:inherit;font-size:15px;cursor:pointer;transition:background .18s,color .18s; }
        .hr-nav-link:hover { background:#f6f0e9;color:var(--hr-red); }
        .hr-nav-link.is-active { background:var(--hr-red);color:#fff;box-shadow:0 5px 12px #9e0a0a1c; }
        .hr-nav-link span { flex:1; }
         .hr-nav-subitem { min-height:40px;padding-inline-start:42px;font-size:14px; }
         .hr-nav-subitem:not(.is-active) { color:var(--hr-muted); }
        .hr-nav-chevron { opacity:.75; }
        .hr-sidebar-bottom { margin-top:auto; }
        .hr-user-summary { display:flex;align-items:center;gap:10px;padding:15px 8px;border-top:1px solid var(--hr-line); }
        .hr-avatar { width:35px;height:35px;flex:0 0 auto;display:grid;place-items:center;border-radius:50%;background:#efe3db;color:var(--hr-red);font-size:17px;font-weight:700; }
        .hr-user-details { min-width:0;display:flex;flex-direction:column; }
        .hr-user-details strong { overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:700; }
        .hr-user-details small { color:var(--hr-muted);font-size:12px; }
        .hr-logout { width:100%;height:42px;display:flex;align-items:center;gap:10px;padding:0 10px;border:1px solid var(--hr-line);border-radius:8px;background:transparent;color:#655851;font:inherit;font-size:14px;cursor:pointer; }
        .hr-logout:hover:not(:disabled) { color:var(--hr-red);border-color:#d9b4aa;background:#fcf6f2; }
        .hr-main-column { width:calc(100% - 258px);min-width:0;margin-inline-start:258px; }
        .hr-topbar { min-height:66px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 34px;border-bottom:1px solid var(--hr-line);background:#fffdf8e8; }
        .hr-topbar>div:first-child { display:flex;align-items:center;gap:10px;font-size:14px;font-weight:700; }
        .hr-breadcrumb-root,.hr-breadcrumb-slash { color:#a2968e;font-weight:400; }
        .hr-topbar-state { display:flex;align-items:center;gap:8px;color:var(--hr-muted);font-size:13px; }
        .hr-topbar-actions { display:flex;align-items:center;gap:14px;flex-shrink:0; }
         .hr-alert-bell { position:relative;width:38px;height:38px;flex:0 0 auto;display:grid;place-items:center;border:1px solid var(--hr-line);border-radius:9px;background:var(--hr-ivory);color:var(--hr-ink);cursor:pointer; }
         .hr-alert-bell:hover { color:var(--hr-red);border-color:#d9b4aa; }
         .hr-alert-bell:focus-visible { outline:2px solid var(--hr-red);outline-offset:2px; }
         .hr-alert-bell span { position:absolute;inset-block-start:-5px;inset-inline-end:-5px;min-width:17px;height:17px;display:grid;place-items:center;padding:0 3px;border:2px solid var(--hr-paper);border-radius:999px;background:var(--hr-red);color:#fff;font:10px/1 sans-serif; }
        .hr-icon-button:focus-visible,.hr-nav-link:focus-visible,.hr-logout:focus-visible { outline:2px solid var(--hr-red);outline-offset:3px; }
        .hr-session-error { margin:10px 0 0;color:var(--hr-red);font-size:13px;line-height:1.5; }
        .hr-topbar-dot,.hr-status-dot { width:7px;height:7px;border-radius:50%;background:#708268; }
         .hr-content { width:100%;max-width:1500px;margin:0 auto;padding:29px 34px 42px;min-width:0;overflow-x:clip; }
        .hr-content > * { min-width:0;max-width:100%; }
        .hr-content :where(.grid,.flex) { min-width:0; }
        .hr-content .grid > * { min-width:0; }
        .hr-content .hr-loading { min-height:50dvh; }
        .hr-mobile-header,.hr-mobile-scrim { display:none; }
        .hr-login-page { min-height:100dvh;display:grid;place-items:center;padding:26px;background:var(--hr-paper); }
         .user-workspace-page { min-height:100dvh;width:100%;display:flex;flex-direction:column;justify-content:center;padding:clamp(24px,6vw,76px);background:var(--hr-paper);color:var(--hr-ink);font-family:"Zain",Tahoma,sans-serif; }
         .user-workspace-heading { width:min(100%,900px);margin:0 auto 30px; }
         .user-workspace-heading .hr-wordmark { margin-bottom:54px; }
         .user-workspace-heading .hr-kicker { margin:0 0 9px; }
         .user-workspace-heading h1 { margin:0;color:var(--hr-ink);font-size:clamp(30px,5vw,48px);line-height:1.2; }
         .user-workspace-heading>p:last-child { margin:12px 0 0;color:var(--hr-muted);font-size:18px;line-height:1.7; }
         .user-system-list { width:min(100%,900px);display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,245px),1fr));gap:14px;margin:0 auto; }
         .user-system-card { position:relative;min-height:156px;display:flex;flex-direction:column;align-items:flex-start;justify-content:space-between;padding:23px;border:1px solid var(--hr-line);border-radius:12px;background:var(--hr-ivory);color:var(--hr-ink);text-align:start;font:inherit;cursor:pointer;transition:transform .2s; }
         .user-system-card:hover { transform:translateY(-3px);border-color:var(--hr-red);box-shadow:0 14px 30px #49352b12; }
         .user-system-number { color:var(--hr-red);font:12px/1.2 ui-monospace,monospace;letter-spacing:.12em; }
         .user-system-title { font-size:23px;font-weight:700; }
         .user-system-arrow { position:absolute;inset-inline-end:22px;bottom:22px;color:var(--hr-red);font-size:22px; }
         .user-no-access,.user-workspace-panel { width:min(100%,900px);margin:0 auto;padding:30px;border:1px dashed var(--hr-line);border-radius:12px;background:var(--hr-ivory);color:var(--hr-muted);text-align:center; }
         .user-no-access svg,.user-workspace-panel svg { color:var(--hr-red);margin:0 auto 8px; }
         .user-no-access h2,.user-workspace-panel h1 { margin:0;color:var(--hr-ink);font-size:23px; }
         .user-no-access p,.user-workspace-panel p { max-width:550px;margin:8px auto 0;line-height:1.7; }
         .user-workspace-signout { display:flex;align-items:center;justify-content:center;gap:8px;margin:28px auto 0;padding:10px 15px;border:1px solid var(--hr-line);border-radius:8px;background:transparent;color:var(--hr-muted);font:inherit;cursor:pointer; }
         .user-workspace-signout:hover { color:var(--hr-red);border-color:var(--hr-red); }
        .hr-login-frame { width:min(100%,970px);min-height:610px;display:grid;grid-template-columns:minmax(0,1fr) 39%;overflow:hidden;background:var(--hr-ivory);border:1px solid #e8ded2;border-radius:16px;box-shadow:0 22px 70px #49352b12; }
        .hr-login-copy { display:flex;flex-direction:column;padding:clamp(30px,6vw,64px); }
        .hr-wordmark { display:flex;align-items:center;gap:10px;color:var(--hr-red);font-weight:700;font-size:18px; }
        .hr-wordmark img { width:62px;height:42px;object-fit:contain; }
        .hr-wordmark-seal { width:34px;height:34px;border-radius:10px; }
        .hr-login-title { margin:auto 0 29px; }
        .hr-kicker { display:inline-block;margin-bottom:12px;color:var(--hr-red);font-size:15px;font-weight:700; }
        .hr-login-title h1 { margin:0;color:var(--hr-ink);font-size:26px;font-weight:700;line-height:1.25; }
        .hr-login-title p { margin:10px 0 0;color:var(--hr-muted);font-size:16px;line-height:1.8; }
        .hr-login-form { display:grid;gap:17px; }
        .hr-field { display:grid;gap:7px; }
        .hr-field label { color:#564740;font-size:14px;font-weight:700; }
        .hr-field input { height:46px;border-color:#e4d9ce;border-radius:8px;background:#fff;font-family:inherit;font-size:16px; }
        .hr-field input:focus-visible { border-color:var(--hr-red);box-shadow:0 0 0 2px #9e0a0a14; }
        .hr-password-wrap { position:relative; }
        .hr-password-wrap input { padding-inline-end:48px; }
        .hr-password-toggle { position:absolute;inset-inline-end:10px;top:50%;transform:translateY(-50%);display:grid;place-items:center;width:32px;height:32px;border:0;border-radius:6px;background:transparent;color:var(--hr-red);cursor:pointer; }
        .hr-password-toggle:focus-visible,.hr-remember input:focus-visible { outline:2px solid var(--hr-red);outline-offset:2px; }
        .hr-remember { display:grid;gap:3px;margin-top:-4px; }
        .hr-remember label { display:flex;align-items:center;gap:8px;color:#564740;font-size:14px;font-weight:600;cursor:pointer; }
        .hr-remember input { width:17px;height:17px;margin:0;accent-color:var(--hr-red); }
        .hr-remember p { margin:0;color:var(--hr-muted);font-size:12px; }
        .hr-login-submit { height:48px;margin-top:4px;display:flex;gap:10px;border-radius:8px;background:var(--hr-red);font-family:inherit;font-size:16px; }
        .hr-login-submit:hover { background:var(--hr-red-deep); }
        .hr-login-submit span { flex:1; }
        .hr-login-error { margin:0;padding:10px 12px;border:1px solid #e8b9b3;border-radius:7px;background:#fff2f0;color:#852019;font-size:14px;line-height:1.6; }
        .hr-login-footnote { display:flex;align-items:center;gap:7px;margin:24px 0 0;color:#92857c;font-size:13px; }
        .hr-login-aside { position:relative;display:flex;flex-direction:column;overflow:hidden;padding:28px 30px;color:#f7efe4;background:var(--hr-red); }
        .hr-login-aside:after { position:absolute;content:"";inset:0;background:linear-gradient(148deg,transparent 35%,#57050542 100%);pointer-events:none; }
        .hr-aside-top,.hr-aside-bottom { position:relative;z-index:1;display:flex;align-items:center;gap:9px;font-size:12px;color:#f7e8dcbb; }
        .hr-aside-top span:first-child { margin-inline-end:auto;font-family:monospace;letter-spacing:.12em; }
        .hr-status-dot { background:#d4c1a0; }
        .hr-aside-art { position:relative;z-index:1;display:grid;place-items:center;min-height:265px;flex:1; }
        .hr-art-ring { position:absolute;width:220px;height:220px;border:1px solid #f7efe42e;border-radius:50%; }
        .hr-art-ring-two { width:168px;height:168px;border-color:#f7efe44a; }
        .hr-art-core { width:100px;height:100px;display:grid;place-items:center;border:1px solid #f7efe477;border-radius:28px;transform:rotate(-8deg);color:#f6ece0;background:#ffffff0d; }
        .hr-art-core svg { transform:rotate(8deg); }
        .hr-art-index { position:absolute;bottom:22px;inset-inline-end:0;color:#f7efe48a;font:11px monospace;letter-spacing:.12em; }
        .hr-aside-caption { position:relative;z-index:1;margin-bottom:34px; }
        .hr-aside-caption span { display:block;margin-bottom:10px;color:#f2d7c9;font-size:14px; }
        .hr-aside-caption strong { font-size:31px;line-height:1.42;font-weight:400; }
        .hr-aside-bottom { justify-content:space-between;padding-top:16px;border-top:1px solid #ffffff35; }
        .hr-loading { min-height:100dvh;display:flex;align-items:center;justify-content:center;gap:16px;background:var(--hr-paper); }
        .hr-loading-mark { width:42px;height:42px;border-radius:13px;background:linear-gradient(90deg,#efe7dc 25%,#f8f3eb 50%,#efe7dc 75%);background-size:200% 100%;animation:hr-skeleton 1.6s ease-in-out infinite; }
        .hr-loading-lines { width:156px;display:grid;gap:9px; }
        .hr-loading-lines i { height:9px;border-radius:6px;background:linear-gradient(90deg,#efe7dc 25%,#f8f3eb 50%,#efe7dc 75%);background-size:200% 100%;animation:hr-skeleton 1.6s ease-in-out infinite; }
        .hr-loading-lines i:nth-child(2) { width:78%; }.hr-loading-lines i:nth-child(3) { width:56%; }
        .hr-spinning { animation:hr-spin 1s linear infinite; }
        @keyframes hr-skeleton { to { background-position:-200% 0; } }
        @keyframes hr-spin { to { transform:rotate(360deg); } }
        @media(max-width:900px) { .hr-sidebar { width:226px; }.hr-main-column { width:calc(100% - 226px);margin-inline-start:226px; }.hr-content { padding:24px 22px 34px; }.hr-topbar { padding-inline:22px; } }
         @media(max-width:767px) {
          .hr-workspace { display:block;padding-top:58px; }
          .hr-mobile-header { position:fixed;z-index:40;inset-block-start:0;inset-inline:0;height:58px;display:flex;align-items:center;justify-content:space-between;padding-inline:13px;border-bottom:1px solid var(--hr-line);background:var(--hr-ivory); }
          .hr-mobile-brand { display:flex;align-items:center;gap:8px;color:var(--hr-red);font-weight:700;font-size:15px; }
          .hr-mobile-brand img { width:44px;height:34px;object-fit:contain; }
          .hr-mobile-header .hr-brand-mark { width:30px;height:30px;border-radius:9px; }
           .hr-mobile-header .hr-alert-bell { margin-inline-start:auto;width:34px;height:34px;border:0;background:transparent; }
          .hr-icon-button { width:42px;height:42px;display:grid;place-items:center;border:0;border-radius:8px;background:transparent;color:var(--hr-ink); }
          .hr-mobile-scrim { position:fixed;z-index:29;inset:58px 0 0;display:block;width:100%;border:0;background:#251b17a1; }
          .hr-sidebar { z-index:35;inset-block:58px 0;inset-inline-start:0;inset-inline-end:auto;width:min(84vw,300px);padding:20px 14px 14px;transform:translateX(105%);transition:transform .22s ease;box-shadow:-12px 0 30px #382a2714; }
          .hr-workspace[dir="ltr"] .hr-sidebar { transform:translateX(-105%); }
          .hr-workspace[dir="ltr"] .hr-sidebar.is-open { transform:translateX(0); }
          .hr-sidebar.is-open { transform:translateX(0); }
          .hr-main-column { width:100%;margin:0; }
          .hr-topbar { display:none; }
           .hr-topbar[data-page="employees"],.hr-topbar[data-page="attendance-monitor"] { display:none; }
          .hr-topbar>div:first-child { min-width:0;gap:7px;font-size:13px; }
          .hr-topbar>div:first-child>span:last-child { overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
          .hr-topbar-actions { gap:0; }
          .hr-topbar-actions [data-teak-language-control] { display:none; }
          .hr-topbar-state { display:none; }
          .hr-content { padding:6px 12px 24px; }
          .hr-content :where(h1.text-2xl) { font-size:1.25rem; }
          .hr-login-page { padding:0;place-items:stretch; }
          .hr-login-frame { width:100%;min-height:100dvh;display:flex;flex-direction:column-reverse;border:0;border-radius:0;box-shadow:none; }
          .hr-login-aside { display:none; }
          .hr-aside-art { position:absolute;inset-inline-end:4%;top:30px;width:165px;min-height:135px; }
          .hr-art-ring { width:130px;height:130px; }.hr-art-ring-two { width:94px;height:94px; }
          .hr-art-core { width:62px;height:62px;border-radius:18px; }.hr-art-core svg { width:34px;height:34px; }
          .hr-art-index { bottom:-2px; }
          .hr-aside-caption { margin:34px 0 0; }.hr-aside-caption span { font-size:12px;margin-bottom:3px; }.hr-aside-caption strong { font-size:21px;line-height:1.25; }
          .hr-aside-bottom { display:none; }
          .hr-login-copy { flex:1;padding:23px 24px 28px; }
          .hr-login-title { margin:28px 0 24px; }.hr-login-title h1 { font-size:24px; }
          .hr-login-footnote { margin-top:18px; }
        }
        @media(prefers-reduced-motion:reduce) { .hr-nav-link,.hr-sidebar,.hr-loading-mark,.hr-loading-lines i,.hr-spinning { animation:none;transition:none; } }
      `}</style>
      <Switch>
        <Route path="/user-login" component={HrLoginRoute} />
        <Route path="/hr/login" component={HrLoginRoute} />
        <Route path="/warehouse-login" component={HrLoginRoute} />
        <Route path="/login" component={HrLoginRoute} />
        <Route path="/workspace" component={UserWorkspacePage} />
        <Route><HrLayout /></Route>
      </Switch>
    </>
  );
}
