import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Route, Switch, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import EmployeesPage from "@/pages/employees";
import EmployeeDetailPage from "@/pages/employee-detail";
import AttendanceMonitorPage from "@/pages/attendance-monitor";
import AttendanceSettingsPage from "@/pages/attendance-settings";
import LeavesPage from "@/pages/leaves";
import PayrollPage from "@/pages/payroll";
import AdvancesPage from "@/pages/advances";
import EvaluationsPage from "@/pages/evaluations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageToggle, useLanguage } from "@/components/language-provider";
import {
  ArrowLeft, CalendarDays, ChevronLeft, CircleDollarSign, Eye, EyeOff,
  ClipboardCheck, Clock3, DoorOpen, LoaderCircle, LockKeyhole, Menu,
  ShieldCheck, UsersRound, X, Settings,
} from "lucide-react";

type HrUser = { role?: string; maintenanceScope?: string; fullNameAr?: string; fullNameEn?: string; username?: string };
type HrPage = "employees" | "attendance-monitor" | "attendance-settings" | "leaves" | "payroll" | "advances" | "evaluations";
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

const navItems: { href: string; key: HrPage; label: string; icon: typeof UsersRound }[] = [
  { href: "/employees", key: "employees", label: "الموظفون", icon: UsersRound },
  { href: "/attendance-monitor", key: "attendance-monitor", label: "مراقبة الدوام", icon: Clock3 },
  { href: "/attendance-settings", key: "attendance-settings", label: "إعدادات الدوام", icon: Settings },
  { href: "/leaves", key: "leaves", label: "الطلبات والإجازات", icon: CalendarDays },
  { href: "/payroll", key: "payroll", label: "مسير الرواتب", icon: CircleDollarSign },
  { href: "/advances", key: "advances", label: "السلف", icon: DoorOpen },
  { href: "/evaluations", key: "evaluations", label: "التقييمات", icon: ClipboardCheck },
];

function WorkspaceLoading() {
  return (
    <div className="hr-loading" role="status" aria-label="جارٍ تحميل مساحة الموارد البشرية">
      <div className="hr-loading-mark" />
      <div className="hr-loading-lines"><i /><i /><i /></div>
    </div>
  );
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
      const response = await apiRequest("POST", "/api/hr-access/login", { username: submittedUsername, password: submittedPassword, rememberMe: submittedRemember });
      const user = await response.json() as HrUser;
      if (user?.role !== "hr" || user?.maintenanceScope !== "hr") {
        setError("تعذّر التحقق من صلاحية حساب الموارد البشرية.");
        return;
      }
      await queryClient.cancelQueries();
      queryClient.clear();
      queryClient.setQueryData(["/api/auth/me"], user);
      setLocation("/employees");
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

  const wrongRole = !!sessionUser && (sessionUser.role !== "hr" || sessionUser.maintenanceScope !== "hr");
  return (
    <main className="hr-login-page" dir={isRTL ? "rtl" : "ltr"}>
      <div className="hr-login-frame">
        <section className="hr-login-copy">
          <div className="hr-wordmark"><img src="/__maintenance/logo.png" alt="TEAK" /><span>{t("إدارة الموارد البشرية", "Human Resources")}</span><LanguageToggle /></div>
          <div className="hr-login-title">
            <span className="hr-kicker">{t("مساحة الموارد البشرية", "HR workspace")}</span>
            <h1>{t("تسجيل الدخول", "Sign in")}</h1>
            <p>{t("استخدم حساب الموارد البشرية المعتمد.", "Use your authorized HR account.")}</p>
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
                {error || t("هذا الحساب لا يملك صلاحية الدخول إلى مساحة الموارد البشرية.", "This account cannot access the HR workspace.")}
              </p>
            )}
            <Button type="submit" disabled={pending} className="hr-login-submit">
              {pending ? <LoaderCircle size={17} className="hr-spinning" /> : <LockKeyhole size={17} />}
              <span>{pending ? t("جارٍ التحقق…", "Verifying…") : t("دخول آمن", "Secure sign in")}</span>
              <ArrowLeft size={17} className={isRTL ? "" : "rotate-180"} />
            </Button>
          </form>
          <p className="hr-login-footnote"><LockKeyhole size={14} /> {t("دخول مخصص لإدارة الموارد البشرية", "Dedicated access for HR administration")}</p>
        </section>
        <aside className="hr-login-aside" aria-label="نظام الموارد البشرية">
          <div className="hr-aside-top"><span>TEAK / PEOPLE</span><span className="hr-status-dot" /> بيئة داخلية</div>
          <div className="hr-aside-art">
            <div className="hr-art-ring hr-art-ring-one" /><div className="hr-art-ring hr-art-ring-two" />
            <div className="hr-art-core"><UsersRound size={49} strokeWidth={1.15} /></div>
            <span className="hr-art-index">01 — 06</span>
          </div>
          <div className="hr-aside-caption"><span>{t("إدارة الفريق", "People management")}</span><strong>{t("من أول يوم،", "From day one,")}<br />{t("إلى كل يوم.", "to every day.")}</strong></div>
          <div className="hr-aside-bottom"><span>{t("الموارد البشرية", "Human Resources")}</span><span>HR / 2026</span></div>
        </aside>
      </div>
    </main>
  );
}

function HrLayout() {
  const { t, isRTL } = useLanguage();
  const navLabel = (key: HrPage) => ({
    employees: t("الموظفون", "Employees"),
    "attendance-monitor": t("مراقبة الدوام", "Attendance"),
    "attendance-settings": t("إعدادات الدوام", "Attendance settings"),
    leaves: t("الطلبات والإجازات", "Requests & leave"),
    payroll: t("مسير الرواتب", "Payroll"),
    advances: t("السلف", "Advances"),
    evaluations: t("التقييمات", "Evaluations"),
  })[key];
  const [location, setLocation] = useLocation();
  const { user, isLoading, logout, isLoggingOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const currentPath = location.replace(/^\/hr/, "") || "/";
  const active = navItems.find(item => currentPath === item.href || currentPath.startsWith(`${item.href}/`));
  const hrUser = user as HrUser | null;
  const authorized = hrUser?.role === "hr" && hrUser?.maintenanceScope === "hr";

  useEffect(() => {
    if (!isLoading && !authorized) setLocation("/login");
  }, [isLoading, authorized, setLocation]);

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
      setLocation("/login");
    } catch {
      setLogoutError("تعذّر تسجيل الخروج. تحقق من الاتصال وحاول مرة أخرى.");
    }
  };

  return (
    <div className="hr-workspace" dir={isRTL ? "rtl" : "ltr"}>
      <header className="hr-mobile-header">
        <button type="button" className="hr-icon-button" aria-label={menuOpen ? "إغلاق القائمة" : "فتح القائمة"} aria-expanded={menuOpen} onClick={() => setMenuOpen(v => !v)}>
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
         <div className="hr-mobile-brand"><img src="/__maintenance/logo.png" alt="TEAK" /><span>{t("تيك", "TEAK")}</span></div>
        <LanguageToggle testId="button-hr-mobile-language" />
        <span className="hr-avatar">{(hrUser.fullNameAr || hrUser.username || "HR").slice(0, 1)}</span>
      </header>
      {menuOpen && <button type="button" className="hr-mobile-scrim" aria-label="إغلاق القائمة" onClick={() => setMenuOpen(false)} />}
      <aside className={`hr-sidebar ${menuOpen ? "is-open" : ""}`}>
        <div className="hr-brand-lockup">
          <img src="/__maintenance/logo.png" alt="TEAK" />
          <div><strong>{t("تيك", "TEAK")}</strong><small>{t("إدارة الموارد البشرية", "Human Resources")}</small></div>
        </div>
        <div className="hr-side-label">{t("مساحة العمل", "Workspace")}</div>
        <nav className="hr-nav" aria-label="التنقل في الموارد البشرية">
          {navItems.map(({ href, key, label, icon: Icon }) => (
            <button key={key} type="button" className={`hr-nav-link ${active?.key === key ? "is-active" : ""}`} onClick={() => { setLocation(href); setMenuOpen(false); }}>
              <Icon size={18} strokeWidth={1.8} /><span>{navLabel(key)}</span>{active?.key === key && <ChevronLeft size={15} className={`hr-nav-chevron ${isRTL ? "" : "rotate-180"}`} />}
            </button>
          ))}
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
          <div><span className="hr-breadcrumb-root">{t("تيك", "TEAK")}</span><span className="hr-breadcrumb-slash">/</span><span>{active ? navLabel(active.key) : t("الموظف", "Employee")}</span></div>
          <div className="hr-topbar-actions">
            <div className="hr-topbar-state"><span className="hr-topbar-dot" /> {t("مساحة الموارد البشرية", "HR workspace")}</div>
            <LanguageToggle testId="button-hr-desktop-language" />
          </div>
        </header>
        <main className="hr-content">
          {isLoggingOut ? <WorkspaceLoading /> : <Switch>
            <Route path="/"><RedirectToEmployees /></Route>
            <Route path="/employees/:id" component={EmployeeDetailPage} />
            <Route path="/employees" component={EmployeesPage} />
            <Route path="/attendance-monitor" component={AttendanceMonitorPage} />
            <Route path="/attendance-settings" component={AttendanceSettingsPage} />
            <Route path="/leaves" component={LeavesPage} />
            <Route path="/payroll" component={PayrollPage} />
            <Route path="/advances" component={AdvancesPage} />
            <Route path="/evaluations" component={EvaluationsPage} />
            <Route><RedirectToEmployees /></Route>
          </Switch>}
        </main>
      </section>
    </div>
  );
}

function RedirectToEmployees() {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation("/employees"); }, [setLocation]);
  return <WorkspaceLoading />;
}

function HrLoginRoute() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const hrUser = user as HrUser | null;
  useEffect(() => {
    if (hrUser?.role === "hr" && hrUser.maintenanceScope === "hr") setLocation("/employees");
  }, [hrUser?.role, hrUser?.maintenanceScope, setLocation]);
  return <HrLogin sessionUser={hrUser} />;
}

export default function HrWorkspace() {
  return (
    <>
      <style>{`
        .hr-workspace, .hr-login-page { --hr-red:#9e0a0a; --hr-red-deep:#780808; --hr-paper:#f6f2ea; --hr-ivory:#fffdf8; --hr-ink:#382a27; --hr-muted:#786c64; --hr-line:#e7ded3; --hr-soft:#f1ebe2; color:var(--hr-ink); font-family:"Zain",Tahoma,sans-serif; }
        .hr-workspace { min-height:100dvh; width:100%;max-width:100%;overflow-x:clip;display:flex; background:var(--hr-paper); }
        .hr-sidebar { position:fixed; inset-block:0; inset-inline-start:0; z-index:30; width:258px; background:var(--hr-ivory); border-inline-end:1px solid var(--hr-line); display:flex; flex-direction:column; padding:28px 17px 18px;overflow-y:auto;overscroll-behavior:contain; }
        .hr-brand-lockup { display:flex; align-items:center; gap:11px; padding:0 9px 28px; border-bottom:1px solid var(--hr-line); }
        .hr-brand-lockup img { width:54px;height:38px;object-fit:contain; }
        .hr-brand-lockup img,.hr-wordmark img,.hr-mobile-brand img { filter:brightness(0) saturate(100%) invert(11%) sepia(94%) saturate(3915%) hue-rotate(353deg) brightness(81%) contrast(111%); }
        .hr-brand-mark,.hr-wordmark-seal { width:38px;height:38px;display:grid;place-items:center;color:var(--hr-red);background:#f6e9e5;border-radius:12px; }
        .hr-brand-lockup strong { display:block;font-size:23px;line-height:1.05;letter-spacing:-.04em; }
        .hr-brand-lockup small { display:block;margin-top:4px;font-size:13px;color:var(--hr-muted); }
        .hr-side-label { margin:27px 11px 10px;color:#a2968e;font-size:12px;font-weight:700; }
        .hr-nav { display:grid;gap:5px; }
        .hr-nav-link { min-height:46px;width:100%;display:flex;align-items:center;gap:12px;padding:0 12px;border:0;border-radius:9px;background:transparent;color:#655851;text-align:start;font:inherit;font-size:15px;cursor:pointer;transition:background .18s,color .18s; }
        .hr-nav-link:hover { background:#f6f0e9;color:var(--hr-red); }
        .hr-nav-link.is-active { background:var(--hr-red);color:#fff;box-shadow:0 5px 12px #9e0a0a1c; }
        .hr-nav-link span { flex:1; }
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
        .hr-icon-button:focus-visible,.hr-nav-link:focus-visible,.hr-logout:focus-visible { outline:2px solid var(--hr-red);outline-offset:3px; }
        .hr-session-error { margin:10px 0 0;color:var(--hr-red);font-size:13px;line-height:1.5; }
        .hr-topbar-dot,.hr-status-dot { width:7px;height:7px;border-radius:50%;background:#708268; }
        .hr-content { width:100%;max-width:1500px;margin:0 auto;padding:29px 34px 42px;min-width:0;overflow-x:auto; }
        .hr-content > * { min-width:0;max-width:100%; }
        .hr-content :where(.grid,.flex) { min-width:0; }
        .hr-content .grid > * { min-width:0; }
        .hr-content .hr-loading { min-height:50dvh; }
        .hr-mobile-header,.hr-mobile-scrim { display:none; }
        .hr-login-page { min-height:100dvh;display:grid;place-items:center;padding:26px;background:var(--hr-paper); }
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
          .hr-icon-button { width:42px;height:42px;display:grid;place-items:center;border:0;border-radius:8px;background:transparent;color:var(--hr-ink); }
          .hr-mobile-scrim { position:fixed;z-index:29;inset:58px 0 0;display:block;width:100%;border:0;background:#251b17a1; }
          .hr-sidebar { z-index:35;inset-block:58px 0;inset-inline-start:0;inset-inline-end:auto;width:min(84vw,300px);padding:20px 14px 14px;transform:translateX(105%);transition:transform .22s ease;box-shadow:-12px 0 30px #382a2714; }
          .hr-workspace[dir="ltr"] .hr-sidebar { transform:translateX(-105%); }
          .hr-workspace[dir="ltr"] .hr-sidebar.is-open { transform:translateX(0); }
          .hr-sidebar.is-open { transform:translateX(0); }
          .hr-main-column { width:100%;margin:0; }
          .hr-topbar { min-height:52px;padding:0 12px;background:transparent;border-bottom:0; }
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
        <Route path="/login"><HrLoginRoute /></Route>
        <Route><HrLayout /></Route>
      </Switch>
    </>
  );
}
