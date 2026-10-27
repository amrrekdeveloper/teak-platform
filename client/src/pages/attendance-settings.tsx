import { useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, ArrowUpRight, CalendarDays, Check, CheckCircle2, Clock3, FileClock, Info, LoaderCircle, RefreshCw, Search, ShieldAlert, UsersRound, X } from "lucide-react";
import { Link } from "wouter";

type Employee = {
  id: number; employeeNumber: string; name: string; status: string;
  workingDays: number[] | null; source: "employee" | "default" | "legacy"; policyId: number | null; effectiveFrom: string | null;
};
type Policy = { id: number; employeeId: number | null; workingDays: number[] | null; effectiveFrom: string; reason: string; createdAt: string };
type Review = { id: number; employeeId: number; businessDay: string; workingDay: boolean; reason: string; createdAt: string };
type Settings = { today: string; tomorrow: string; employees: Employee[]; policies: Policy[]; reviews: Review[] };
type PreviewRow = {
  employeeId: number; employeeNumber: string; name: string;
  before: { workingDays: number[] | null; source: string; workingDay: boolean | null; statuses: string[] };
  after: { workingDays: number[] | null; source: string; workingDay: boolean | null; statuses: string[] };
  warning?: string;
};
type Preview = {
  previewToken: string; rows: PreviewRow[]; affectedCount: number; excludedCount: number; warnings: string[];
  mode: "policy" | "bootstrap" | "review"; effectiveFrom?: string; businessDay?: string;
};
type ApiErrorBody = { message?: string; messageEn?: string; error?: string };

const DAYS = [
  { n: 0, ar: "الأحد", en: "Sunday", shortAr: "أحد", shortEn: "Sun" },
  { n: 1, ar: "الاثنين", en: "Monday", shortAr: "اثن", shortEn: "Mon" },
  { n: 2, ar: "الثلاثاء", en: "Tuesday", shortAr: "ثلا", shortEn: "Tue" },
  { n: 3, ar: "الأربعاء", en: "Wednesday", shortAr: "أرب", shortEn: "Wed" },
  { n: 4, ar: "الخميس", en: "Thursday", shortAr: "خمي", shortEn: "Thu" },
  { n: 5, ar: "الجمعة", en: "Friday", shortAr: "جمع", shortEn: "Fri" },
  { n: 6, ar: "السبت", en: "Saturday", shortAr: "سبت", shortEn: "Sat" },
];
const DEFAULT_DAYS = [0, 1, 2, 3, 4, 6];
const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const todayLocal = () => localDate(new Date());
const addDays = (value: string, count: number) => {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + count);
  return localDate(date);
};
const formatDate = (value: string, locale: string) => {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(date);
};
const dateTime = (value: string, locale: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
};

async function requestJson<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include",
  });
  const payload = await response.json().catch(() => ({})) as T & ApiErrorBody;
  if (!response.ok) {
    const error = new Error(payload.message || payload.error || `Request failed (${response.status})`) as Error & { status?: number; messageEn?: string };
    error.status = response.status;
    error.messageEn = payload.messageEn;
    throw error;
  }
  return payload;
}

export default function AttendanceSettingsPage() {
  const { t, isRTL } = useLanguage();
  const qc = useQueryClient();
  const [viewDate, setViewDate] = useState(() => addDays(todayLocal(), 1));
  const [mode, setMode] = useState<"policy" | "bootstrap" | "review">("policy");
  const [scope, setScope] = useState<"all" | "employees">("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [workingDays, setWorkingDays] = useState<number[]>(DEFAULT_DAYS);
  const [resetInherit, setResetInherit] = useState(false);
  const [reviewWorkingDay, setReviewWorkingDay] = useState(() => DEFAULT_DAYS.includes(new Date().getDay()));
  const [effectiveFrom, setEffectiveFrom] = useState(() => addDays(todayLocal(), 1));
  const [businessDay, setBusinessDay] = useState(todayLocal);
  const [includeOverrides, setIncludeOverrides] = useState(false);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);
  const [applyPending, setApplyPending] = useState(false);

  const settingsQuery = useQuery<Settings>({
    queryKey: ["/api/attendance/workweek/settings", viewDate],
    queryFn: () => requestJson(`/api/attendance/workweek/settings?day=${encodeURIComponent(viewDate)}`),
  });
  const settings = settingsQuery.data;
  const filteredEmployees = useMemo(() => {
    const employees = settings?.employees || [];
    const term = search.trim().toLocaleLowerCase();
    return term ? employees.filter(employee =>
      employee.name.toLocaleLowerCase().includes(term) || employee.employeeNumber.toLocaleLowerCase().includes(term)
    ) : employees;
  }, [settings?.employees, search]);
  const invalidatePreview = () => {
    setPreview(null); setError(""); setSuccess(""); setConfirmChecked(false);
  };
  const toggleDay = (day: number) => {
    if (mode === "bootstrap") return;
    invalidatePreview();
    setResetInherit(false);
    setWorkingDays(current => current.includes(day) ? current.filter(value => value !== day) : [...current, day].sort((a, b) => a - b));
  };
  const toggleEmployee = (id: number) => {
    invalidatePreview();
    setSelectedIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  };
  const setModeSafe = (value: "policy" | "bootstrap" | "review") => {
    invalidatePreview();
    setMode(value);
    if (value === "review") setScope("employees");
    else if (value === "bootstrap") {
      setScope("all");
      setResetInherit(false);
      setIncludeOverrides(false);
      setWorkingDays(DEFAULT_DAYS);
      setEffectiveFrom(settings?.today || todayLocal());
      setViewDate(settings?.today || todayLocal());
    } else {
      const futureStart = settings?.tomorrow || addDays(settings?.today || todayLocal(), 1);
      const nextEffective = effectiveFrom < futureStart ? futureStart : effectiveFrom;
      setEffectiveFrom(nextEffective);
      setViewDate(nextEffective);
    }
    if (value === "review") setViewDate(businessDay);
  };
  const changeScope = (value: "all" | "employees") => {
    invalidatePreview();
    setScope(value);
    if (value === "all") setResetInherit(false);
  };
  const changeField = (fn: (value: string) => void) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    invalidatePreview(); fn(event.target.value);
  };
  const changeEffectiveDate = (value: string) => {
    if (mode === "bootstrap") return;
    invalidatePreview();
    setEffectiveFrom(value);
    if (value) setViewDate(value);
  };
  const changeReviewDate = (value: string) => {
    invalidatePreview();
    setBusinessDay(value);
    if (value) setViewDate(value);
  };
  const changeViewDate = (value: string) => {
    if (!value || mode === "bootstrap") return;
    invalidatePreview();
    setViewDate(value);
    if (mode === "policy") setEffectiveFrom(value);
    else setBusinessDay(value);
  };
  const selectedAllVisible = filteredEmployees.length > 0 && filteredEmployees.every(employee => selectedIds.includes(employee.id));
  const selectVisible = () => {
    invalidatePreview();
    setSelectedIds(current => selectedAllVisible
      ? current.filter(id => !filteredEmployees.some(employee => employee.id === id))
      : Array.from(new Set([...current, ...filteredEmployees.map(employee => employee.id)])));
  };
  const currentDate = settings?.today || todayLocal();
  const minimumEffectiveDate = mode === "bootstrap" ? currentDate : settings?.tomorrow || addDays(currentDate, 1);
  const formValid = reason.trim().length >= 3 && reason.trim().length <= 1000 &&
    (scope !== "employees" || selectedIds.length > 0) &&
    (mode === "bootstrap" ? (settings?.policies.length === 0 && effectiveFrom === currentDate && scope === "all") :
      mode !== "policy" || (!!effectiveFrom && effectiveFrom >= minimumEffectiveDate)) &&
    (mode !== "review" || (!!businessDay && businessDay <= currentDate));
  const showError = (cause: unknown) => {
    const e = cause as Error & { messageEn?: string; status?: number };
    const general = e.status === 409
      ? t("انتهت صلاحية المعاينة بسبب تغيّر البيانات. حدّث المعاينة قبل المتابعة.", "The preview is stale because the data changed. Refresh the preview before continuing.")
      : e.status === 503
        ? t("إعدادات الدوام غير متاحة حالياً بسبب إعداد قاعدة البيانات. تواصل مع الدعم.", "Attendance settings are temporarily unavailable due to database setup. Contact support.")
        : (isRTL ? e.message : e.messageEn || e.message);
    setError(general || t("تعذّر إكمال الطلب. حاول مرة أخرى.", "The request could not be completed. Please try again."));
  };
  const makeBody = () => ({
    mode, scope,
    employeeIds: scope === "employees" ? selectedIds : [],
    workingDays: mode === "bootstrap" ? DEFAULT_DAYS : mode === "review"
      ? (reviewWorkingDay ? [new Date(`${businessDay}T12:00:00`).getDay()] : [])
      : scope === "employees" && resetInherit ? null : workingDays,
    ...(mode === "review" ? { businessDay } : { effectiveFrom: mode === "bootstrap" ? currentDate : effectiveFrom }),
    includeOverrides:mode==="policy"&&scope==="all"&&includeOverrides,
    reason: reason.trim(),
  });
  const requestPreview = async () => {
    if (!formValid || pending) return;
    setError(""); setSuccess(""); setPending(true); setPreview(null);
    try {
      const result = await requestJson<Preview>("/api/attendance/workweek/preview", "POST", makeBody());
      setPreview(result);
      setConfirmChecked(false);
      setDialogOpen(true);
    } catch (cause) { showError(cause); }
    finally { setPending(false); }
  };
  const applyPreview = async () => {
    if (!preview || !confirmChecked || applyPending) return;
    setApplyPending(true); setError("");
    try {
      const result = await requestJson<{ success: true; count: number; message: string; messageEn: string }>(
        "/api/attendance/workweek/apply", "POST", { ...makeBody(), previewToken: preview.previewToken, confirm: true },
      );
      setSuccess(t(result.message || `${result.count} employee records updated.`, result.messageEn || `${result.count} employee records updated.`));
      setPreview(null); setDialogOpen(false); setConfirmChecked(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["/api/attendance/workweek/settings"] }),
        qc.invalidateQueries({ queryKey: ["/api/attendance/monitor"] }),
        qc.invalidateQueries({ queryKey: ["attendance-shift-monitor"] }),
        qc.invalidateQueries({ queryKey: ["attendance-shift-monitor-today"] }),
        qc.invalidateQueries({ queryKey: ["/api/attendance/corrections"] }),
        qc.invalidateQueries({ queryKey: ["/api/attendance/risk-scores"] }),
      ]);
    } catch (cause) {
      showError(cause);
      setDialogOpen(false);
      if ((cause as { status?: number })?.status === 409) setPreview(null);
    } finally { setApplyPending(false); }
  };
  const sourceName = (source: string) => source === "employee"
    ? t("استثناء موظف", "Employee exception")
    : source === "default" ? t("السياسة الافتراضية", "Default policy")
      : source === "legacy" ? t("غير معروف — غير جاهز", "Unknown — not ready") : source;
  const dayLabel = (day: number) => DAYS.find(item => item.n === day)?.[isRTL ? "ar" : "en"] || "—";
  const daySummary = (days: number[] | null) => days === null
    ? t("غير معروف — يحتاج مراجعة واعتماد", "Unknown — review and approval needed")
    : days.map(dayLabel).join("، ");
  const localizedMessage = (message: string) => {
    const halves = message.split(" / ");
    return halves.length > 1 ? (isRTL ? halves[0] : halves.slice(1).join(" / ")) : message;
  };
  const statusLabel = (status: string) => {
    const labels: Record<string, [string, string]> = {
      absent: ["غياب", "Absent"],
      pending: ["قيد المراجعة", "Pending"],
      present: ["حاضر", "Present"],
      late: ["متأخر", "Late"],
      missing_checkout: ["خروج ناقص", "Missing checkout"],
      missing_checkin: ["دخول ناقص", "Missing check-in"],
      rest_day: ["يوم راحة", "Rest day"],
      not_started: ["لم يبدأ", "Not started"],
      approved_leave: ["إجازة معتمدة", "Approved leave"],
      excused: ["بعذر", "Excused"],
      unverified_schedule: ["جدول غير موثّق", "Unverified schedule"],
    };
    return labels[status]?.[isRTL ? 0 : 1] || status;
  };
  const deficiencyStatuses = ["absent", "pending", "missing_checkout", "missing_checkin", "unverified_schedule", "not_started"];
  const deficiencyRows = preview?.mode === "review"
    ? preview.rows.filter(row => row.after.statuses?.some(status => deficiencyStatuses.includes(status)))
    : [];
  const absenceCount = preview?.mode === "review"
    ? preview.rows.filter(row => row.after.statuses?.includes("absent")).length
    : 0;
  const reviewClassLabel = (workingDay: boolean | null) => workingDay === null
    ? t("تصنيف غير معروف", "Classification unknown")
    : workingDay ? t("مصنّف كيوم عمل", "Classified as a workday") : t("مصنّف كيوم راحة", "Classified as a rest day");

  if (settingsQuery.isLoading) return (
    <div className="wk-page" dir={isRTL ? "rtl" : "ltr"} aria-label={t("جارٍ تحميل إعدادات الدوام", "Loading attendance settings")}>
      <style>{styles}</style>
      <div className="wk-skeleton-head"><i /><i /></div>
      <div className="wk-skeleton-grid"><i /><i /></div>
      <div className="wk-skeleton-panel"><i /><i /><i /><i /></div>
    </div>
  );
  if (settingsQuery.isError || !settings) return (
    <div className="wk-page" dir={isRTL ? "rtl" : "ltr"}>
      <style>{styles}</style>
      <div className="wk-error-state"><span className="wk-icon-box"><AlertTriangle size={21} /></span>
        <h1>{t("تعذّر تحميل إعدادات الدوام", "Could not load attendance settings")}</h1>
        <p>{t("تحقق من الاتصال ثم أعد المحاولة. لن يتم حفظ أي تغيير قبل تأكيده.", "Check your connection and try again. No changes are saved until confirmed.")}</p>
        <Button onClick={() => settingsQuery.refetch()} className="wk-primary"><RefreshCw size={16} />{t("إعادة المحاولة", "Try again")}</Button>
      </div>
    </div>
  );

  const statusSummary = settings.employees.reduce((result, employee) => {
    result[employee.source] = (result[employee.source] || 0) + 1;
    if (employee.workingDays === null) result.unknown += 1;
    return result;
  }, { employee: 0, default: 0, legacy: 0, unknown: 0 } as Record<string, number>);

  return (
    <div className="wk-page" dir={isRTL ? "rtl" : "ltr"}>
      <style>{styles}</style>
      <header className="wk-heading">
        <div>
          <div className="wk-eyebrow"><span className="wk-eyebrow-mark" />{t("الحضور والانصراف", "ATTENDANCE CONTROL")}</div>
          <h1>{t("أيام العمل والراحة", "Working week")}</h1>
          <p>{t("اضبط سياسة الأسبوع، وراجع الحالات السابقة دون المساس بسجلات البصمة.", "Set the weekly policy and review past dates without changing punch records.")}</p>
        </div>
        <div className="wk-heading-date"><CalendarDays size={17} /><span>{mode !== "review" ? t(mode === "bootstrap" ? "تاريخ بدء السياسة الأولية" : "تاريخ عرض السياسة", mode === "bootstrap" ? "Initial policy date" : "Policy date") : t("تاريخ المراجعة", "Review date")}</span>
          <Input type="date" aria-label={mode !== "review" ? t("تاريخ عرض السياسة", "Policy display date") : t("تاريخ المراجعة", "Review date")} value={viewDate} min={mode !== "review" ? minimumEffectiveDate : undefined} max={mode === "review" || mode === "bootstrap" ? currentDate : undefined} disabled={mode === "bootstrap"} onChange={event => changeViewDate(event.target.value)} />
        </div>
      </header>

      <nav className="wk-shortcuts" aria-label={t("روابط الحضور", "Attendance links")}>
        <span>{t("مسارات ذات صلة", "RELATED")}</span>
        <Link href="/attendance-monitor?tab=zones" className="wk-shortcut">{t("مناطق الحضور", "Attendance zones")}<ArrowUpRight size={14} /></Link>
        <Link href="/attendance-monitor?tab=work-settings" className="wk-shortcut">{t("أوقات الدوام", "Work hours")}<ArrowUpRight size={14} /></Link>
        <Link href="/attendance-monitor?tab=assignments" className="wk-shortcut">{t("توزيع الورديات", "Shift assignments")}<ArrowUpRight size={14} /></Link>
      </nav>

      <section className="wk-overview" aria-label={t("ملخص السياسة الحالية", "Current policy overview")}>
        <div className="wk-overview-main">
          <div className="wk-section-caption"><span className="wk-number">01</span>{t("نظرة عامة", "AT A GLANCE")}</div>
          <div className="wk-stat-line"><strong>{settings.employees.length}</strong><span>{t("موظف في النطاق", "employees in scope")}</span></div>
          <div className="wk-stat-tags">
            <span>{statusSummary.employee} · {t("استثناء موظف", "employee exceptions")}</span>
            <span>{statusSummary.default} · {t("افتراضي", "default")}</span>
            {statusSummary.unknown > 0 && <span className="wk-tag-warn">{statusSummary.unknown} · {t("غير معروف", "unknown")}</span>}
          </div>
        </div>
        <div className="wk-default-block">
          <div className="wk-default-title">{t("المقترح الافتراضي", "PROPOSED DEFAULT")}<span>{t("الجمعة راحة", "FRIDAY OFF")}</span></div>
          <div className="wk-mini-days" aria-label={daySummary(DEFAULT_DAYS)}>
            {DAYS.map(day => <span key={day.n} className={DEFAULT_DAYS.includes(day.n) ? "is-work" : "is-rest"}>{day[isRTL ? "shortAr" : "shortEn"]}</span>)}
          </div>
          <p>{t("الأحد إلى الخميس، والسبت عمل. الجمعة راحة.", "Sunday–Thursday and Saturday are workdays. Friday is rest.")}</p>
        </div>
      </section>

      {settings.policies.length === 0 && <section className="wk-bootstrap-banner" aria-labelledby="wk-bootstrap-title">
        <span className="wk-bootstrap-mark"><CalendarDays size={19} /></span>
        <div className="wk-bootstrap-copy">
          <h2 id="wk-bootstrap-title">{t("تفعيل سياسة أسبوع العمل لأول مرة", "Activate the workweek policy")}</h2>
          <p>{t(
            "لا توجد سياسة أسبوع عامة بعد. راجع نمط العمل المعروض، ثم عاين ووافق على سياسة تبدأ اليوم. لن تُطبّق تلقائياً، ولن تُعدّل تقويمات الأيام السابقة؛ راجع أي يوم تمت مراجعته بشكل منفصل عند الحاجة.",
            "No general workweek policy exists yet. Review the displayed workweek pattern, then preview and approve a policy effective today. Nothing is applied automatically, and past day calendars are unchanged; review any previously reviewed day separately if needed."
          )}</p>
        </div>
        {mode !== "bootstrap" && <Button type="button" className="wk-primary wk-bootstrap-action" onClick={() => setModeSafe("bootstrap")}>
          <CalendarDays size={17} />{t("إعداد سياسة اليوم", "Set up today’s policy")}
        </Button>}
      </section>}

      {mode === "policy" && <div className="wk-policy-context" role="note">
        <CalendarDays size={17} />
        <p>{t(
          `العرض يوضح السياسة السارية في ${formatDate(viewDate, isRTL ? "ar-SA" : "en-US")}. أي تعديل هنا سياسة مستقبلية تبدأ في التاريخ المحدد، ولا يغيّر الأيام السابقة.`,
          `The panel shows the policy effective on ${formatDate(viewDate, "en-US")}. Changes here create a future policy from the selected date; they do not change past days.`
        )}</p>
      </div>}

      <div className="wk-main-grid">
        <main className="wk-builder">
          <div className="wk-mode-tabs" role="tablist" aria-label={t("نوع الإجراء", "Change type")}>
            <button type="button" role="tab" aria-selected={mode === "policy" || mode === "bootstrap"} data-testid="workweek-mode-policy" className={mode === "policy" || mode === "bootstrap" ? "is-active" : ""} onClick={() => setModeSafe(mode === "bootstrap" ? "bootstrap" : "policy")}>
              <CalendarDays size={17} /><span>{mode === "bootstrap" ? t("تفعيل أولي", "Initial activation") : t("سياسة مستقبلية", "Future policy")}</span><small>{mode === "bootstrap" ? t("سياسة عامة تبدأ اليوم", "General policy starts today") : t("تبدأ من تاريخ لاحق", "Starts on a future date")}</small>
            </button>
            <button type="button" role="tab" aria-selected={mode === "review"} data-testid="workweek-mode-review" className={mode === "review" ? "is-active" : ""} onClick={() => setModeSafe("review")}>
              <FileClock size={17} /><span>{t("مراجعة يوم سابق", "Review a day")}</span><small>{t("تحديد يوم عمل أو راحة", "Mark work or rest")}</small>
            </button>
          </div>

          {mode === "review" && <div className="wk-caution"><ShieldAlert size={19} /><div>
            <strong>{t("المراجعة لا تغيّر سجلات البصمة", "Review does not change punch records")}</strong>
            <p>{t("لا تُنشئ الغياب أو الجزاءات تلقائياً. لا يمكن إنشاء ورديات تاريخية مجهولة من هذه الشاشة. اختر موظفين محددين فقط.", "This does not create absences or penalties automatically. Unknown historical shifts cannot be created here. Select specific employees only.")}</p>
          </div></div>}

          <section className="wk-form-section">
            <div className="wk-section-title"><span className="wk-number">02</span><div><h2>{t("نطاق التطبيق", "Who does this apply to?")}</h2><p>{t("اختر الجميع أو حدّد الموظفين المطلوبين.", "Apply to everyone or choose specific employees.")}</p></div></div>
            <div className="wk-scope-options">
              <button type="button" data-testid="workweek-scope" aria-pressed={scope === "all"} disabled={mode === "review" || mode === "bootstrap"} className={`wk-scope-option ${scope === "all" ? "selected" : ""}`} onClick={() => changeScope("all")}>
                <UsersRound size={18} /><span><strong>{t("كل الموظفين", "All employees")}</strong><small>{t("سيُظهر العرض من يشمله أو يستثنيه", "Preview shows included and excluded staff")}</small></span>{scope === "all" && <Check size={17} />}
              </button>
              <button type="button" aria-pressed={scope === "employees"} disabled={mode === "bootstrap"} className={`wk-scope-option ${scope === "employees" ? "selected" : ""}`} onClick={() => changeScope("employees")}>
                <CheckCircle2 size={18} /><span><strong>{t("موظفون محددون", "Selected employees")}</strong><small>{t("تحديد صريح لكل موظف", "Choose each employee explicitly")}</small></span>{scope === "employees" && <Check size={17} />}
              </button>
            </div>
            {scope === "employees" && <div className="wk-employee-picker">
              <div className="wk-employee-toolbar">
                <label className="wk-search"><Search size={16} /><Input value={search} onChange={changeField(setSearch)} placeholder={t("ابحث بالاسم أو الرقم الوظيفي", "Search by name or employee number")} aria-label={t("البحث عن موظف", "Search employees")} /></label>
                <Button type="button" variant="outline" className="wk-select-visible" onClick={selectVisible}>{selectedAllVisible ? t("إلغاء الظاهر", "Clear visible") : t("تحديد الظاهر", "Select visible")}</Button>
                <span className="wk-selected-count">{selectedIds.length} {t("محدد", "selected")}</span>
              </div>
              <div className="wk-employee-list">
                {filteredEmployees.length === 0 ? <div className="wk-no-results">{t("لا توجد نتائج مطابقة.", "No matching employees.")}</div> : filteredEmployees.map(employee => {
                  const checked = selectedIds.includes(employee.id);
                  return <label key={employee.id} className={`wk-employee ${checked ? "checked" : ""}`}>
                    <input type="checkbox" data-testid={`workweek-employee-${employee.id}`} checked={checked} onChange={() => toggleEmployee(employee.id)} />
                    <span className="wk-checkbox">{checked && <Check size={14} />}</span>
                    <span className="wk-employee-info"><strong>{employee.name}</strong><small>{t("رقم", "No.")} {employee.employeeNumber} <i>·</i> {sourceName(employee.source)}</small></span>
                    <span className={`wk-state-pill ${employee.workingDays === null ? "unknown" : ""}`}>{employee.workingDays === null ? t("غير معروف", "Unknown") : `${employee.workingDays.length} ${t("أيام عمل", "workdays")}`}</span>
                  </label>;
                })}
              </div>
            </div>}
          </section>

          <section className="wk-form-section">
            <div className="wk-section-title"><span className="wk-number">03</span><div><h2>{mode !== "review" ? t("أيام العمل الأسبوعية", "Weekly workdays") : t("حالة اليوم المختار", "Selected day status")}</h2>
              <p>{mode === "bootstrap"
                ? t(`نمط التفعيل الأولي: ${workingDays.length} أيام عمل و${7 - workingDays.length} أيام راحة. هذا النمط ثابت في التفعيل الأول؛ يمكن إنشاء سياسة مستقبلية مختلفة لاحقاً.`, `Initial activation pattern: ${workingDays.length} workdays and ${7 - workingDays.length} rest days. The initial pattern is fixed; a different future policy can be created later.`)
                : mode === "policy"
                  ? t(`اختر أيام العمل؛ غير المختارة أيام راحة. ${workingDays.length} أيام عمل و${7 - workingDays.length} أيام راحة.`, `Choose workdays; unselected days are rest days. ${workingDays.length} workdays, ${7 - workingDays.length} rest days.`)
                : t(`تصنيف ${formatDate(businessDay, isRTL ? "ar-SA" : "en-US")} (${dayLabel(new Date(`${businessDay}T12:00:00`).getDay())}) فقط.`, `Classification for ${formatDate(businessDay, "en-US")} (${dayLabel(new Date(`${businessDay}T12:00:00`).getDay())}) only.`)}</p></div></div>
            {mode !== "review" ? <div className="wk-day-grid" aria-label={t("اختيار أيام العمل", "Select working days")}>
              {DAYS.map(day => {
                const active = workingDays.includes(day.n);
                return <button key={day.n} type="button" data-testid={`workweek-day-${day.n}`} aria-pressed={active} disabled={mode === "bootstrap"} className={`wk-day-button ${active ? "is-working" : "is-rest"}`} onClick={() => toggleDay(day.n)}>
                  <span>{day[isRTL ? "ar" : "en"]}</span><small>{active ? t("عمل", "WORK") : t("راحة", "REST")}</small>
                </button>;
              })}
            </div> : <div className="wk-review-status" role="group" aria-label={t("حالة يوم المراجعة", "Review day classification")}>
              <button type="button" data-testid="workweek-review-workday" aria-pressed={reviewWorkingDay} className={reviewWorkingDay ? "is-selected-work" : ""} onClick={() => { invalidatePreview(); setReviewWorkingDay(true); }}>
                <CheckCircle2 size={19} /><span><strong>{t("يوم عمل", "Working day")}</strong><small>{t("تحديد اليوم المختار كدوام", "Classify the selected date as work")}</small></span>
              </button>
              <button type="button" data-testid="workweek-review-restday" aria-pressed={!reviewWorkingDay} className={!reviewWorkingDay ? "is-selected-rest" : ""} onClick={() => { invalidatePreview(); setReviewWorkingDay(false); }}>
                <Clock3 size={19} /><span><strong>{t("يوم راحة", "Rest day")}</strong><small>{t("تحديد اليوم المختار كراحة", "Classify the selected date as rest")}</small></span>
              </button>
            </div>}
            {mode === "policy" && scope === "employees" && <label className="wk-override-toggle wk-reset-toggle">
              <input type="checkbox" checked={resetInherit} onChange={event => { invalidatePreview(); setResetInherit(event.target.checked); }} />
              <span className="wk-checkbox">{resetInherit && <Check size={14} />}</span>
              <span><strong>{t("إعادة الموظفين المحددين إلى السياسة الافتراضية", "Reset selected employees to the default policy")}</strong><small>{t("بدلاً من تعيين أيام خاصة بهم، احذف الاستثناء واجعلهم يرثون الافتراضي.", "Remove individual schedules so these employees inherit the default policy.")}</small></span>
            </label>}
            {mode === "policy" && <div className="wk-inherit-row">
              <Info size={16} /><span>{t("عند الحاجة لإلغاء استثناء موظف، استخدم إعادة التعيين أعلاه. الأيام السبعة المحددة تعني أن كل أيام الأسبوع أيام عمل.", "To remove employee exceptions, use the reset option above. Selecting all seven days means every weekday is a workday.")}</span>
            </div>}
          </section>

          <section className="wk-form-section wk-date-section">
            <div className="wk-section-title"><span className="wk-number">04</span><div><h2>{t("التاريخ وسبب التغيير", "Date & reason")}</h2><p>{t("سبب موثّق مطلوب قبل المعاينة والتطبيق.", "A documented reason is required before preview and apply.")}</p></div></div>
            <div className="wk-date-reason-grid">
              <div className="wk-field"><label htmlFor="wk-change-date">{mode !== "review" ? t(mode === "bootstrap" ? "تاريخ بدء السياسة الأولية" : "تاريخ بدء السياسة", mode === "bootstrap" ? "Initial policy effective date" : "Policy effective date") : t("تاريخ يوم المراجعة", "Review business date")}<b>*</b></label>
                <Input id="wk-change-date" data-testid={mode !== "review" ? "workweek-effective-date" : "workweek-review-date"} type="date"
                  min={mode !== "review" ? minimumEffectiveDate : undefined} max={mode === "review" ? currentDate : mode === "bootstrap" ? currentDate : undefined}
                  disabled={mode === "bootstrap"}
                  value={mode !== "review" ? effectiveFrom : businessDay}
                  onChange={event => mode !== "review" ? changeEffectiveDate(event.target.value) : changeReviewDate(event.target.value)} />
                <small>{mode === "bootstrap"
                  ? t(`تبدأ السياسة العامة اليوم ${formatDate(currentDate, isRTL ? "ar-SA" : "en-US")} بعد المعاينة والموافقة.`, `The general policy starts today, ${formatDate(currentDate, "en-US")}, after preview and approval.`)
                  : mode === "policy" ? t(`يبدأ في ${formatDate(minimumEffectiveDate, isRTL ? "ar-SA" : "en-US")} أو بعده.`, `Must start on ${formatDate(minimumEffectiveDate, "en-US")} or later.`) : t("اليوم أو تاريخ سابق فقط.", "Today or an earlier date only.")}</small>
              </div>
              <div className="wk-field"><label htmlFor="wk-reason">{t("سبب التغيير", "Reason")}<b>*</b></label>
                <Textarea id="wk-reason" data-testid="workweek-reason" value={reason} onChange={changeField(setReason)} maxLength={1000} rows={3} placeholder={t("اكتب سبباً واضحاً للتغيير (3 أحرف على الأقل)", "Enter a clear reason (at least 3 characters)")} />
                <small>{reason.trim().length}/1000</small>
              </div>
            </div>
            {mode === "policy" && <label className="wk-override-toggle">
              <input type="checkbox" checked={includeOverrides} onChange={event => { invalidatePreview(); setIncludeOverrides(event.target.checked); }} />
              <span className="wk-checkbox">{includeOverrides && <Check size={14} />}</span>
              <span><strong>{t("تضمين استثناءات الموظفين الحالية", "Include existing employee exceptions")}</strong><small>{t("مفعّل: ستتجاوز السياسة الاستثناءات الفردية. اتركه غير محدد للحفاظ عليها.", "When enabled, this policy overrides individual exceptions. Leave unchecked to preserve them.")}</small></span>
            </label>}
          </section>

          {error && <div className="wk-alert wk-alert-error" role="alert"><AlertTriangle size={18} /><span>{error}</span><button type="button" aria-label={t("إغلاق", "Dismiss")} onClick={() => setError("")}><X size={16} /></button></div>}
          {success && <div className="wk-alert wk-alert-success" role="status"><CheckCircle2 size={18} /><span>{success}</span><button type="button" aria-label={t("إغلاق", "Dismiss")} onClick={() => setSuccess("")}><X size={16} /></button></div>}
          <footer className="wk-submit-bar">
            <span>{t("لن يتغير شيء قبل مراجعة المعاينة والتأكيد.", "Nothing changes until you review and confirm the preview.")}</span>
            <Button type="button" data-testid="workweek-preview" onClick={requestPreview} disabled={!formValid || pending} className="wk-primary">
              {pending ? <LoaderCircle size={17} className="wk-spin" /> : <Search size={17} />}{pending ? t("جارٍ إعداد المعاينة…", "Preparing preview…") : t("معاينة التغييرات", "Preview changes")}
            </Button>
          </footer>
        </main>

        <aside className="wk-current">
          <div className="wk-current-heading"><span className="wk-number">{viewDate > currentDate ? t("لاحقاً", "FUTURE") : t("ساري", "LIVE")}</span><div><h2>{t("السياسة السارية", "Effective policy")}</h2><p>{t(`كما في ${formatDate(viewDate, isRTL ? "ar-SA" : "en-US")}`, `Effective on ${formatDate(viewDate, "en-US")}`)}</p></div></div>
          {settings.employees.length === 0 ? <div className="wk-empty"><UsersRound size={20} /><p>{t("لا يوجد موظفون ضمن هذا النطاق.", "No employees are in this scope.")}</p></div> :
            <div className="wk-current-list">{settings.employees.slice(0, 8).map(employee => <article key={employee.id} className="wk-current-employee">
              <div className="wk-current-employee-head"><strong>{employee.name}</strong><span>{employee.employeeNumber}</span></div>
              <p className={employee.workingDays === null ? "wk-unknown-copy" : ""}>{daySummary(employee.workingDays)}</p>
              <div className="wk-current-meta"><span>{sourceName(employee.source)}</span>{employee.effectiveFrom && <span>{formatDate(employee.effectiveFrom, isRTL ? "ar-SA" : "en-US")}</span>}</div>
            </article>)}
              {settings.employees.length > 8 && <p className="wk-more">{t(`و${settings.employees.length - 8} موظفين آخرين`, `and ${settings.employees.length - 8} more employees`)}</p>}
            </div>}
        </aside>
      </div>

      <section className="wk-audit">
        <div className="wk-audit-heading"><div><span className="wk-number">LOG</span><h2>{t("آخر التغييرات", "Recent changes")}</h2></div><span>{t("للمراجعة والتتبع", "AUDIT TRAIL")}</span></div>
        <div className="wk-audit-columns">
          <div><h3><CalendarDays size={16} />{t("سياسات الأسبوع", "Weekly policies")}</h3>
            {settings.policies.length === 0 ? <p className="wk-audit-empty">{t("لا توجد سياسات مسجلة بعد.", "No policies recorded yet.")}</p> : settings.policies.slice(0, 5).map(policy => {
              const employee = settings.employees.find(item => item.id === policy.employeeId);
              return <article className="wk-audit-row" key={`policy-${policy.id}`}><span className="wk-audit-date">{formatDate(policy.effectiveFrom, isRTL ? "ar-SA" : "en-US")}</span><div><strong>{employee?.name || t("كل الموظفين", "All employees")}</strong><p>{policy.workingDays === null ? t("غير معروف", "Unknown") : daySummary(policy.workingDays)}</p><small>{policy.reason}</small></div><time>{dateTime(policy.createdAt, isRTL ? "ar-SA" : "en-US")}</time></article>;
            })}</div>
          <div><h3><Clock3 size={16} />{t("مراجعات الأيام", "Day reviews")}</h3>
            {settings.reviews.length === 0 ? <p className="wk-audit-empty">{t("لا توجد مراجعات مسجلة بعد.", "No reviews recorded yet.")}</p> : settings.reviews.slice(0, 5).map(review => {
              const employee = settings.employees.find(item => item.id === review.employeeId);
              return <article className="wk-audit-row" key={`review-${review.id}`}><span className="wk-audit-date">{formatDate(review.businessDay, isRTL ? "ar-SA" : "en-US")}</span><div><strong>{employee?.name || `${t("الموظف", "Employee")} #${review.employeeId}`}</strong><p>{review.workingDay ? t("يوم عمل", "Working day") : t("يوم راحة", "Rest day")}</p><small>{review.reason}</small></div><time>{dateTime(review.createdAt, isRTL ? "ar-SA" : "en-US")}</time></article>;
            })}</div>
        </div>
      </section>

      <Dialog open={dialogOpen} onOpenChange={open => { if (!applyPending) setDialogOpen(open); }}>
        <DialogContent className="wk-dialog" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader className="wk-dialog-header">
            <div className="wk-dialog-icon"><ShieldAlert size={21} /></div>
            <DialogTitle>{t("مراجعة التغييرات قبل التطبيق", "Review before applying")}</DialogTitle>
            <DialogDescription>{preview?.mode !== "review"
              ? t(`سياسة تبدأ في ${formatDate(preview?.effectiveFrom || "", isRTL ? "ar-SA" : "en-US")}`, `Policy effective ${formatDate(preview?.effectiveFrom || "", "en-US")}`)
              : t(`مراجعة يوم ${formatDate(preview?.businessDay || "", isRTL ? "ar-SA" : "en-US")}`, `Review for ${formatDate(preview?.businessDay || "", "en-US")}`)}</DialogDescription>
          </DialogHeader>
          {preview && <div className="wk-preview-content">
            <div className="wk-preview-stats"><div><strong>{preview.affectedCount}</strong><span>{t("سيتم تحديثهم", "to be updated")}</span></div><div><strong>{preview.excludedCount}</strong><span>{t("مستثنى", "excluded")}</span></div></div>
            {preview.warnings.length > 0 && <div className="wk-preview-warnings"><AlertTriangle size={17} /><div>{preview.warnings.map((warning, index) => <p key={index}>{localizedMessage(warning)}</p>)}</div></div>}
            {preview.mode === "review" && <div className="wk-preview-deficiency" role="alert">
              <AlertTriangle size={18} />
              <div><strong>{t("تنبيه نقص الحضور قبل الاعتماد", "Attendance deficiency check")}</strong>
                <p>{deficiencyRows.length > 0
                  ? t(`تتضمن النتائج بعد المراجعة حالات نقص لدى ${deficiencyRows.length} موظف${absenceCount ? `، منها ${absenceCount} مصنّف كغياب` : ""}. راجع حالة كل موظف قبل التأكيد. هذا التغيير لا يعدّل سجلات البصمة.`, `After-review outcomes include attendance deficiencies for ${deficiencyRows.length} employee${deficiencyRows.length === 1 ? "" : "s"}${absenceCount ? `, including ${absenceCount} classified as absent` : ""}. Check each employee before confirming. Punch records are unchanged.`)
                  : t("لا تظهر حالات غياب أو نقص حضور معروفة في هذه المعاينة. راجع النتائج أدناه قبل التأكيد؛ المراجعة تغيّر التصنيف فقط ولا تعدّل سجلات البصمة.", "No known absence or attendance-deficiency outcomes appear in this preview. Review the results below before confirming; this changes classification only, not punch records.")}</p>
              </div>
            </div>}
            <div className={`wk-preview-table-wrap ${preview.mode === "review" ? "is-review-preview" : ""}`}><table className="wk-preview-table"><thead><tr><th>{t("الموظف", "Employee")}</th><th>{t("قبل", "Before")}</th><th>{t("بعد", "After")}</th></tr></thead>
              <tbody>{preview.rows.map(row => {
                const renderState = (state: PreviewRow["before"], side: "before" | "after") => preview.mode !== "review"
                  ? <><span className={side === "after" ? "wk-after" : "wk-before"}>{daySummary(state.workingDays)}</span><small>{sourceName(state.source)}</small></>
                  : <>
                    <div className="wk-status-chips">{(state.statuses || []).length > 0
                      ? state.statuses.map(status => <span key={status} className={`wk-status-chip wk-status-${status}`}>{statusLabel(status)}</span>)
                      : <span className="wk-no-status">{t("لا توجد نتيجة حالة", "No status outcome")}</span>}</div>
                    <small>{reviewClassLabel(state.workingDay)}</small>
                    <small>{sourceName(state.source)}</small>
                  </>;
                return <tr key={row.employeeId}>
                  <td><strong>{row.name}</strong><small>{row.employeeNumber}</small></td>
                  <td data-label={t("قبل", "Before")}>{renderState(row.before, "before")}</td>
                  <td data-label={t("بعد", "After")}>{renderState(row.after, "after")}{row.warning && <em className={preview.mode === "review" ? "wk-row-warning" : ""}>{localizedMessage(row.warning)}</em>}</td>
                </tr>;
              })}</tbody>
            </table></div>
            {preview.mode === "review" && <div className="wk-dialog-caution"><Info size={16} />{t("هذا تصحيح لتصنيف يوم محدد فقط. سجلات الدخول والخروج والغياب والجزاءات لا تتغير.", "This corrects the classification of one day only. Punches, absences, and penalties are unchanged.")}</div>}
            <label className="wk-final-confirm"><input type="checkbox" data-testid="workweek-confirm-check" checked={confirmChecked} onChange={event => setConfirmChecked(event.target.checked)} />
              <span className="wk-checkbox">{confirmChecked && <Check size={14} />}</span><span>{t("راجعت الموظفين والتغييرات وأؤكد تطبيقها.", "I reviewed the employees and changes and confirm applying them.")}</span></label>
          </div>}
          <DialogFooter className="wk-dialog-footer">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={applyPending}>{t("عودة للتعديل", "Back to edit")}</Button>
            <Button type="button" data-testid="workweek-apply" onClick={applyPreview} disabled={!confirmChecked || applyPending || !preview} className="wk-primary">
              {applyPending ? <LoaderCircle size={17} className="wk-spin" /> : <CheckCircle2 size={17} />}{applyPending ? t("جارٍ التطبيق…", "Applying…") : t("تأكيد وتطبيق", "Confirm & apply")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const styles = `
.wk-dialog{--wk-red:#9e0a0a;--wk-red-dark:#780808;--wk-paper:#f6f2ea;--wk-ivory:#fffdf8;--wk-ink:#382a27;--wk-muted:#786c64;--wk-line:#e7ded3;--wk-soft:#f1ebe2;--wk-sage:#526b52;min-width:0;gap:0!important}
.wk-dialog *{box-sizing:border-box}.wk-dialog-header,.wk-dialog-footer{flex-shrink:0}.wk-dialog button,.wk-dialog input{font:inherit}
@media(max-width:767px){.wk-preview-table,.wk-preview-table tbody{display:block;width:100%}.wk-preview-table thead{display:none}.wk-preview-table tr{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);border-bottom:1px solid #e7ded3;padding:8px 0}.wk-preview-table td{display:block;min-width:0!important;overflow-wrap:anywhere;border:0!important}.wk-preview-table td:first-child{grid-column:1/-1}.wk-preview-table td[data-label]:before{content:attr(data-label);display:block;font-size:11px;color:#786c64;margin-bottom:4px}.wk-preview-table-wrap{max-height:none!important;overflow:visible!important}.wk-dialog-footer{flex-direction:column!important}.wk-dialog-footer button{width:100%;min-height:44px;flex:none!important}.wk-preview-content{flex:1;min-height:0}}
.wk-page{--wk-red:#9e0a0a;--wk-red-dark:#780808;--wk-paper:#f6f2ea;--wk-ivory:#fffdf8;--wk-ink:#382a27;--wk-muted:#786c64;--wk-line:#e7ded3;--wk-soft:#f1ebe2;--wk-sage:#526b52;max-width:1320px;margin:0 auto;color:var(--wk-ink);font-family:"Zain",Tahoma,sans-serif}
.wk-page *{box-sizing:border-box}.wk-page button,.wk-page input,.wk-page textarea{font:inherit}.wk-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;padding:10px 0 22px}.wk-eyebrow{display:flex;align-items:center;gap:8px;color:var(--wk-red);font-size:12px;letter-spacing:.1em;font-weight:800}.wk-eyebrow-mark{width:7px;height:7px;background:var(--wk-red);border-radius:50%}.wk-heading h1{margin:5px 0 1px;font-size:clamp(27px,3vw,36px);line-height:1.16;letter-spacing:-.035em;font-weight:700}.wk-heading p{margin:4px 0 0;color:var(--wk-muted);font-size:15px}.wk-heading-date{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:5px 8px;width:225px;color:var(--wk-muted);font-size:13px}.wk-heading-date svg{color:var(--wk-red)}.wk-heading-date input{grid-column:1/3;width:100%;height:43px;padding-inline:11px;border:1px solid var(--wk-line);border-radius:8px;background:var(--wk-ivory);font-size:16px}
.wk-shortcuts{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:11px 14px;margin-bottom:16px;border-block:1px solid var(--wk-line);background:#faf7f1}.wk-shortcuts>span{margin-inline-end:5px;color:#a2968e;font-size:11px;font-weight:800;letter-spacing:.1em}.wk-shortcut{min-height:34px;display:inline-flex;align-items:center;gap:5px;padding:0 10px;border:1px solid var(--wk-line);border-radius:6px;background:var(--wk-ivory);color:#5e5049;text-decoration:none;font-size:13px;transition:background .16s,color .16s}.wk-shortcut:hover{color:var(--wk-red);background:#f8eeea}
.wk-overview{display:grid;grid-template-columns:1fr minmax(290px,.8fr);gap:0;margin-bottom:19px;border:1px solid var(--wk-line);border-radius:10px;background:var(--wk-ivory);overflow:hidden}.wk-overview-main{padding:18px 21px}.wk-section-caption,.wk-default-title{display:flex;align-items:center;gap:9px;color:#9a8d84;font-size:11px;letter-spacing:.09em;font-weight:800}.wk-number{display:inline-grid;place-items:center;min-width:26px;height:24px;padding:0 5px;border-radius:5px;background:#f4e7e2;color:var(--wk-red);font-size:11px;font-family:monospace;letter-spacing:0}.wk-stat-line{display:flex;align-items:baseline;gap:9px;margin-top:8px}.wk-stat-line strong{font-size:38px;line-height:1;color:var(--wk-ink);font-weight:700}.wk-stat-line span{color:var(--wk-muted);font-size:15px}.wk-stat-tags{display:flex;gap:7px;flex-wrap:wrap;margin-top:11px}.wk-stat-tags span{padding:3px 8px;border-radius:20px;background:#f3efe8;color:#75695f;font-size:12px}.wk-stat-tags .wk-tag-warn{background:#fff0de;color:#865119}.wk-default-block{padding:18px 20px;border-inline-start:1px solid var(--wk-line);background:#fcf9f3}.wk-default-title{justify-content:space-between}.wk-default-title>span{padding:4px 7px;border-radius:4px;background:#f4e6e0;color:var(--wk-red);font-size:10px;letter-spacing:.06em}.wk-mini-days{display:flex;gap:6px;margin-top:12px}.wk-mini-days span{flex:1;display:grid;place-items:center;min-height:31px;border-radius:5px;font-size:11px}.wk-mini-days .is-work{background:#e7eee4;color:#426043}.wk-mini-days .is-rest{background:#f2e9e1;color:#8d6b58}.wk-default-block p{margin:8px 0 0;color:var(--wk-muted);font-size:13px}
.wk-main-grid{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(270px,.72fr);align-items:start;gap:17px}.wk-builder,.wk-current,.wk-audit{border:1px solid var(--wk-line);border-radius:10px;background:var(--wk-ivory);overflow:hidden}.wk-mode-tabs{display:grid;grid-template-columns:1fr 1fr;padding:8px;gap:7px;border-bottom:1px solid var(--wk-line);background:#faf7f1}.wk-mode-tabs button{min-height:62px;display:grid;grid-template-columns:25px 1fr;grid-template-rows:1fr 1fr;align-items:center;column-gap:8px;padding:7px 12px;border:1px solid transparent;border-radius:7px;background:transparent;color:#70645b;text-align:start;cursor:pointer;transition:background .16s,border-color .16s,color .16s}.wk-mode-tabs button svg{grid-row:1/3;color:#988a80}.wk-mode-tabs button span{font-size:15px;font-weight:700}.wk-mode-tabs button small{font-size:12px;color:var(--wk-muted)}.wk-mode-tabs button.is-active{border-color:#e4c7bd;background:var(--wk-ivory);color:var(--wk-red);box-shadow:0 2px 6px #49352b0b}.wk-mode-tabs button.is-active svg{color:var(--wk-red)}
.wk-caution{display:flex;gap:11px;margin:14px 16px 0;padding:12px 13px;border:1px solid #e7c9a6;border-radius:7px;background:#fff7e9;color:#76512b}.wk-caution>svg{flex:0 0 auto;margin-top:2px}.wk-caution strong{font-size:14px}.wk-caution p{margin:3px 0 0;color:#765c3a;font-size:13px;line-height:1.55}
.wk-form-section{padding:17px 18px 19px;border-bottom:1px solid var(--wk-line)}.wk-section-title{display:flex;align-items:flex-start;gap:10px;margin-bottom:14px}.wk-section-title>.wk-number{margin-top:1px;flex:0 0 auto}.wk-section-title h2{margin:0;font-size:17px;line-height:1.25}.wk-section-title p{margin:3px 0 0;color:var(--wk-muted);font-size:13px}.wk-scope-options{display:grid;grid-template-columns:1fr 1fr;gap:9px}.wk-scope-option{min-height:67px;display:flex;align-items:center;gap:9px;padding:9px 11px;border:1px solid var(--wk-line);border-radius:7px;background:#fffefa;color:#665951;text-align:start;cursor:pointer}.wk-scope-option>span{flex:1;display:grid}.wk-scope-option>span strong{font-size:14px}.wk-scope-option small{color:var(--wk-muted);font-size:12px;line-height:1.3}.wk-scope-option>svg{color:#94867d}.wk-scope-option.selected{border-color:#cb9b8e;background:#fcf3ef;color:var(--wk-red)}.wk-scope-option.selected>svg{color:var(--wk-red)}.wk-scope-option:disabled{opacity:.55;cursor:not-allowed}
.wk-employee-picker{margin-top:12px;border:1px solid var(--wk-line);border-radius:7px;overflow:hidden}.wk-employee-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:9px;background:#faf7f1;border-bottom:1px solid var(--wk-line)}.wk-search{min-width:180px;flex:1;position:relative}.wk-search svg{position:absolute;inset-inline-start:10px;top:50%;transform:translateY(-50%);color:#93877f}.wk-search input{height:40px;padding-inline-start:34px;border-color:var(--wk-line);background:white;font-size:16px}.wk-select-visible{min-height:40px;padding-inline:10px;border-color:var(--wk-line);background:var(--wk-ivory);font-size:13px}.wk-selected-count{color:var(--wk-red);font-size:13px;font-weight:700;white-space:nowrap}.wk-employee-list{max-height:260px;overflow-y:auto;overscroll-behavior:contain}.wk-employee{min-height:53px;display:flex;align-items:center;gap:10px;padding:7px 11px;border-bottom:1px solid #f0e9df;cursor:pointer}.wk-employee:last-child{border-bottom:0}.wk-employee.checked{background:#fcf6f2}.wk-employee input,.wk-override-toggle input,.wk-final-confirm input{position:absolute;opacity:0;width:1px;height:1px}.wk-checkbox{width:20px;height:20px;flex:0 0 auto;display:grid;place-items:center;border:1.5px solid #c9bdb2;border-radius:5px;background:white;color:white}.wk-employee input:checked+.wk-checkbox,.wk-override-toggle input:checked+.wk-checkbox,.wk-final-confirm input:checked+.wk-checkbox{border-color:var(--wk-red);background:var(--wk-red)}.wk-employee input:focus-visible+.wk-checkbox,.wk-override-toggle input:focus-visible+.wk-checkbox,.wk-final-confirm input:focus-visible+.wk-checkbox{outline:2px solid var(--wk-red);outline-offset:2px}.wk-employee-info{flex:1;min-width:0;display:grid}.wk-employee-info strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}.wk-employee-info small{color:var(--wk-muted);font-size:12px}.wk-employee-info i{font-style:normal;margin-inline:3px}.wk-state-pill{padding:3px 7px;border-radius:4px;background:#eaf0e6;color:#4d674a;font-size:11px;white-space:nowrap}.wk-state-pill.unknown{background:#fff0de;color:#8a551a}.wk-no-results{padding:19px;text-align:center;color:var(--wk-muted);font-size:14px}
.wk-day-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}.wk-day-button{min-height:61px;display:grid;align-content:center;justify-items:center;gap:3px;padding:5px 2px;border:1px solid var(--wk-line);border-radius:6px;cursor:pointer;transition:background .15s,border-color .15s,color .15s}.wk-day-button span{font-size:clamp(11px,1.15vw,14px);font-weight:700;white-space:nowrap}.wk-day-button small{font-size:9px;letter-spacing:.08em;font-weight:800}.wk-day-button.is-working{border-color:#c5d4bf;background:#eef3e9;color:#456143}.wk-day-button.is-rest{border-color:#e6d9ce;background:#f8f1eb;color:#8a6a57}.wk-day-button[aria-pressed=true]:hover{background:#e4ecde}.wk-day-button[aria-pressed=false]:hover{background:#f2e5dc}.wk-review-status{display:grid;grid-template-columns:1fr 1fr;gap:9px}.wk-review-status button{min-height:64px;display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--wk-line);border-radius:7px;background:#fffefa;color:#65584f;text-align:start;cursor:pointer}.wk-review-status button>span{display:grid}.wk-review-status button strong{font-size:14px}.wk-review-status button small{color:var(--wk-muted);font-size:12px}.wk-review-status button.is-selected-work{border-color:#c5d4bf;background:#eef3e9;color:#456143}.wk-review-status button.is-selected-rest{border-color:#e6d9ce;background:#f8f1eb;color:#8a6a57}.wk-inherit-row{display:flex;align-items:flex-start;gap:7px;margin-top:10px;color:var(--wk-muted);font-size:12px;line-height:1.5}.wk-inherit-row svg{flex:0 0 auto;color:#8a776b;margin-top:2px}
.wk-date-reason-grid{display:grid;grid-template-columns:minmax(190px,.73fr) minmax(220px,1.27fr);gap:13px}.wk-field{min-width:0;display:grid;align-content:start;gap:6px}.wk-field label{font-size:13px;font-weight:700;color:#5d5048}.wk-field label b{margin-inline-start:3px;color:var(--wk-red)}.wk-field input,.wk-field textarea{min-height:44px;border-color:var(--wk-line);border-radius:6px;background:#fffefa;font-size:16px}.wk-field textarea{min-height:87px;padding:9px 11px;resize:vertical;line-height:1.5}.wk-field input:focus-visible,.wk-field textarea:focus-visible,.wk-heading-date input:focus-visible{border-color:#ad5f4f;box-shadow:0 0 0 2px #9e0a0a14}.wk-field>small{color:#998c83;font-size:11px}.wk-override-toggle{display:flex;align-items:flex-start;gap:9px;margin-top:14px;padding:11px;border:1px solid #e9d8cb;border-radius:7px;background:#fcf7f0;cursor:pointer}.wk-override-toggle>span:last-child{display:grid}.wk-override-toggle strong{font-size:13px}.wk-override-toggle small{margin-top:2px;color:var(--wk-muted);font-size:12px;line-height:1.45}
.wk-alert{display:flex;align-items:flex-start;gap:9px;margin:13px 17px 0;padding:10px 12px;border-radius:6px;font-size:14px;line-height:1.5}.wk-alert>span{flex:1}.wk-alert button{display:grid;place-items:center;width:28px;height:28px;flex:0 0 auto;border:0;border-radius:5px;background:transparent;cursor:pointer}.wk-alert-error{border:1px solid #e5b7b0;background:#fff1ee;color:#81271f}.wk-alert-success{border:1px solid #cad8c3;background:#f0f5ec;color:#456242}.wk-submit-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 18px;background:#faf7f1}.wk-submit-bar>span{color:var(--wk-muted);font-size:12px;line-height:1.4}.wk-primary{min-height:44px;display:inline-flex;align-items:center;gap:8px;border-radius:6px;background:var(--wk-red);color:white;font-size:14px;font-weight:700;box-shadow:none}.wk-primary:hover{background:var(--wk-red-dark)}.wk-primary:disabled{opacity:.48}
.wk-current{position:sticky;top:16px}.wk-current-heading{display:flex;align-items:flex-start;gap:10px;padding:17px 16px;border-bottom:1px solid var(--wk-line);background:#faf7f1}.wk-current-heading h2{margin:0;font-size:17px}.wk-current-heading p{margin:2px 0 0;color:var(--wk-muted);font-size:12px}.wk-current-heading .wk-number{min-width:35px;background:#e9eee5;color:#52694d}.wk-current-list{max-height:505px;overflow-y:auto}.wk-current-employee{padding:12px 15px;border-bottom:1px solid #f0e9df}.wk-current-employee:last-child{border-bottom:0}.wk-current-employee-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px}.wk-current-employee-head strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}.wk-current-employee-head>span{color:#93867e;font:11px monospace;white-space:nowrap}.wk-current-employee p{margin:5px 0 6px;color:#63564e;font-size:12px;line-height:1.5}.wk-current-employee p.wk-unknown-copy{color:#8a551a}.wk-current-meta{display:flex;justify-content:space-between;gap:8px;color:#998c83;font-size:11px}.wk-more{margin:0;padding:12px 15px;color:var(--wk-muted);font-size:13px}.wk-empty{display:grid;justify-items:center;gap:7px;padding:30px 18px;color:var(--wk-muted);text-align:center}.wk-empty p{margin:0;font-size:13px}
.wk-audit{margin-top:17px}.wk-audit-heading{display:flex;justify-content:space-between;align-items:center;padding:14px 17px;border-bottom:1px solid var(--wk-line);background:#faf7f1}.wk-audit-heading>div{display:flex;align-items:center;gap:9px}.wk-audit-heading h2{margin:0;font-size:17px}.wk-audit-heading>span{color:#a2968e;font-size:10px;letter-spacing:.12em;font-weight:800}.wk-audit-columns{display:grid;grid-template-columns:1fr 1fr}.wk-audit-columns>div{min-width:0;padding:13px 16px 15px}.wk-audit-columns>div+div{border-inline-start:1px solid var(--wk-line)}.wk-audit-columns h3{display:flex;align-items:center;gap:7px;margin:0 0 8px;color:#695b53;font-size:14px}.wk-audit-columns h3 svg{color:var(--wk-red)}.wk-audit-empty{margin:0;padding:12px 4px;color:#9b8f87;font-size:13px}.wk-audit-row{display:grid;grid-template-columns:minmax(65px,.34fr) minmax(0,1fr) auto;align-items:start;gap:9px;padding:9px 0;border-top:1px solid #f0e9df}.wk-audit-date{color:#68564c;font-size:12px;font-weight:700}.wk-audit-row>div{min-width:0}.wk-audit-row strong{font-size:13px}.wk-audit-row p{margin:1px 0;color:#76685f;font-size:12px}.wk-audit-row small{display:block;overflow:hidden;color:#93877f;font-size:11px;text-overflow:ellipsis;white-space:nowrap}.wk-audit-row time{color:#a0948b;font-size:10px;white-space:nowrap}
.wk-dialog{width:min(92vw,760px)!important;max-width:760px!important;max-height:min(90dvh,900px);display:flex;flex-direction:column;overflow:hidden;padding:0!important;border:1px solid var(--wk-line)!important;border-radius:11px!important;background:var(--wk-ivory)!important;color:var(--wk-ink)!important;font-family:"Zain",Tahoma,sans-serif!important}.wk-dialog-header{position:relative;padding:20px 22px 15px;border-bottom:1px solid var(--wk-line);text-align:start}.wk-dialog-icon{width:39px;height:39px;display:grid;place-items:center;margin-bottom:10px;border-radius:8px;background:#f8eae4;color:var(--wk-red)}.wk-dialog-header h2{font-size:20px!important}.wk-dialog-header p{margin-top:4px!important;color:var(--wk-muted)!important}.wk-preview-content{min-height:0;overflow-y:auto;padding:15px 20px;overscroll-behavior:contain}.wk-preview-stats{display:flex;gap:9px;margin-bottom:12px}.wk-preview-stats>div{flex:1;display:flex;align-items:baseline;gap:8px;padding:9px 12px;border:1px solid var(--wk-line);border-radius:6px;background:#faf7f1}.wk-preview-stats strong{font-size:22px;color:var(--wk-red)}.wk-preview-stats span{color:var(--wk-muted);font-size:13px}.wk-preview-warnings{display:flex;align-items:flex-start;gap:9px;margin-bottom:12px;padding:10px 12px;border:1px solid #e8cda9;border-radius:6px;background:#fff7e9;color:#80551f}.wk-preview-warnings svg{flex:0 0 auto;margin-top:2px}.wk-preview-warnings p{margin:0;font-size:13px;line-height:1.5}.wk-preview-warnings p+p{margin-top:4px}.wk-preview-table-wrap{max-height:360px;overflow:auto;border:1px solid var(--wk-line);border-radius:6px}.wk-preview-table{width:100%;border-collapse:collapse;text-align:start;font-size:13px}.wk-preview-table th{position:sticky;top:0;z-index:1;padding:9px 11px;background:#f2ece3;color:#70645b;font-size:12px;text-align:start}.wk-preview-table td{padding:9px 11px;border-top:1px solid #eee7dd;vertical-align:top}.wk-preview-table td:first-child{min-width:120px}.wk-preview-table td>strong,.wk-preview-table td>small{display:block}.wk-preview-table td>small{margin-top:2px;color:#93877f;font-size:11px}.wk-preview-table td em{display:block;margin-top:4px;color:#89521e;font-size:11px;font-style:normal}.wk-before{color:#786c64}.wk-after{color:#456143;font-weight:700}.wk-dialog-caution{display:flex;align-items:flex-start;gap:7px;margin-top:11px;padding:9px 10px;border-radius:5px;background:#fff6e7;color:#74542d;font-size:12px;line-height:1.45}.wk-dialog-caution svg{flex:0 0 auto}.wk-final-confirm{display:flex;align-items:center;gap:9px;margin-top:13px;padding:11px;border:1px solid #d9c7bb;border-radius:6px;background:#fcf8f2;font-size:14px;font-weight:700;cursor:pointer}.wk-dialog-footer{padding:12px 20px;border-top:1px solid var(--wk-line);background:#faf7f1}.wk-dialog-footer button{min-height:43px}.wk-spin{animation:wkspin 1s linear infinite}@keyframes wkspin{to{transform:rotate(360deg)}}
.wk-preview-deficiency{display:flex;align-items:flex-start;gap:10px;margin-bottom:12px;padding:11px 13px;border:1px solid #dca6a0;border-inline-start:4px solid #a62a22;border-radius:6px;background:#fff0ed;color:#8b211b}.wk-preview-deficiency>svg{flex:0 0 auto;margin-top:2px}.wk-preview-deficiency strong{font-size:14px}.wk-preview-deficiency p{margin:3px 0 0;font-size:13px;line-height:1.5}.wk-status-chips{display:flex;flex-wrap:wrap;gap:4px;min-width:110px}.wk-status-chip{display:inline-flex;align-items:center;min-height:23px;padding:2px 7px;border:1px solid #ddd4c9;border-radius:4px;background:#f5f0e9;color:#675b52;font-size:11px;font-weight:700;line-height:1.25}.wk-status-absent,.wk-status-missing_checkin,.wk-status-missing_checkout,.wk-status-unverified_schedule{border-color:#e2b4ae;background:#fff0ed;color:#8b211b}.wk-status-pending,.wk-status-not_started{border-color:#e8cda9;background:#fff7e9;color:#80551f}.wk-status-present,.wk-status-approved_leave,.wk-status-excused,.wk-status-rest_day{border-color:#cbd8c3;background:#edf3e9;color:#456143}.wk-status-late{border-color:#e4c7aa;background:#fbf0e2;color:#875722}.wk-no-status{color:#988b81;font-size:11px;font-style:italic}.wk-row-warning{color:#8b211b!important}.is-review-preview .wk-preview-table td{min-width:145px}.is-review-preview .wk-preview-table td:first-child{min-width:120px}
.wk-error-state{min-height:50vh;display:grid;justify-items:center;align-content:center;text-align:center;padding:25px}.wk-icon-box{width:48px;height:48px;display:grid;place-items:center;border-radius:12px;background:#f7e9e4;color:var(--wk-red)}.wk-error-state h1{margin:14px 0 4px;font-size:22px}.wk-error-state p{max-width:430px;margin:0 0 16px;color:var(--wk-muted);font-size:14px;line-height:1.6}.wk-skeleton-head,.wk-skeleton-grid,.wk-skeleton-panel{display:grid;gap:12px}.wk-skeleton-head{grid-template-columns:1fr 220px;margin:15px 0 22px}.wk-skeleton-head i,.wk-skeleton-grid i,.wk-skeleton-panel i{height:58px;border-radius:8px;background:linear-gradient(100deg,#efe7dc 20%,#faf6ef 45%,#efe7dc 70%);background-size:220% 100%;animation:wkshimmer 1.5s ease-in-out infinite}.wk-skeleton-grid{grid-template-columns:1.3fr 1fr;margin-bottom:15px}.wk-skeleton-grid i{height:110px}.wk-skeleton-panel{grid-template-columns:1fr 1fr;padding:20px;border:1px solid var(--wk-line);border-radius:9px;background:var(--wk-ivory)}.wk-skeleton-panel i{height:70px}.wk-skeleton-panel i:nth-child(3),.wk-skeleton-panel i:nth-child(4){height:150px}@keyframes wkshimmer{to{background-position:-220% 0}}
.wk-page :focus-visible{outline:2px solid var(--wk-red);outline-offset:2px}.wk-page button:disabled{cursor:not-allowed}@media(max-width:980px){.wk-main-grid{grid-template-columns:minmax(0,1.4fr) minmax(240px,.8fr)}.wk-form-section{padding-inline:14px}.wk-day-grid{gap:4px}.wk-day-button span{font-size:11px}}@media(max-width:767px){.wk-heading{align-items:stretch;flex-direction:column;gap:13px;padding:5px 0 17px}.wk-heading-date{width:100%;max-width:310px}.wk-heading h1{font-size:28px}.wk-shortcuts{gap:6px;padding:9px 0;border-inline:0;background:transparent}.wk-shortcuts>span{width:100%}.wk-shortcut{min-height:39px;padding-inline:8px;font-size:12px}.wk-overview{grid-template-columns:1fr}.wk-default-block{border-inline-start:0;border-top:1px solid var(--wk-line)}.wk-main-grid{grid-template-columns:minmax(0,1fr);gap:13px}.wk-current{position:static}.wk-current-list{max-height:315px}.wk-mode-tabs{padding:6px;gap:5px}.wk-mode-tabs button{min-height:66px;padding:6px 7px;column-gap:6px}.wk-mode-tabs button span{font-size:14px}.wk-mode-tabs button small{font-size:11px}.wk-form-section{padding:15px 12px}.wk-scope-options{grid-template-columns:1fr}.wk-scope-option{min-height:58px}.wk-employee-toolbar{gap:6px}.wk-search{flex-basis:100%}.wk-day-grid{gap:4px}.wk-day-button{min-height:59px}.wk-day-button span{font-size:clamp(10px,2.7vw,13px)}.wk-day-button small{font-size:8px}.wk-date-reason-grid{grid-template-columns:1fr}.wk-submit-bar{align-items:stretch;flex-direction:column;padding:12px}.wk-submit-bar .wk-primary{width:100%}.wk-audit-columns{grid-template-columns:1fr}.wk-audit-columns>div+div{border-inline-start:0;border-top:1px solid var(--wk-line)}.wk-audit-row{grid-template-columns:minmax(63px,.3fr) minmax(0,1fr) auto;gap:6px}.wk-dialog{width:calc(100vw - 20px)!important;max-height:calc(100dvh - 24px)}.wk-dialog-header{padding:16px 15px 12px}.wk-preview-content{padding:11px}.wk-preview-table th,.wk-preview-table td{padding:8px 7px}.wk-preview-table{font-size:12px}.wk-preview-table td:first-child{min-width:95px}.wk-dialog-footer{padding:10px 11px;gap:8px}.wk-dialog-footer button{flex:1;font-size:13px}.wk-preview-stats>div{gap:5px;padding:8px}.wk-preview-stats strong{font-size:19px}.wk-preview-stats span{font-size:12px}.wk-audit-heading{padding-inline:12px}.wk-skeleton-head{grid-template-columns:1fr}.wk-skeleton-grid{grid-template-columns:1fr}.wk-skeleton-grid i:nth-child(2){display:none}.wk-skeleton-panel{padding:12px;gap:8px}}@media(prefers-reduced-motion:reduce){.wk-page *, .wk-dialog *{scroll-behavior:auto!important;animation:none!important;transition:none!important}}
@media(max-width:767px){.wk-page,.wk-builder,.wk-current,.wk-audit,.wk-overview,.wk-main-grid,.wk-audit-columns,.wk-date-reason-grid{width:100%;min-width:0;max-width:100%}.wk-page .wk-main-grid{grid-template-columns:minmax(0,1fr)}.wk-page .wk-audit-row{grid-template-columns:minmax(0,1fr) auto;gap:4px 8px}.wk-page .wk-audit-row>div{grid-column:1;grid-row:2}.wk-page .wk-audit-row time{grid-column:2;grid-row:1}.wk-dialog{width:calc(100vw - 20px)!important;max-width:calc(100vw - 20px)!important;max-height:calc(100dvh - 24px)}}
.wk-page,.wk-dialog{--wk-red:#9e0a0a;--wk-red-dark:#780808;--wk-paper:#f6f2ea;--wk-ivory:#fffdf8;--wk-ink:#382a27;--wk-muted:#786c64;--wk-line:#e7ded3;--wk-soft:#f1ebe2;--wk-sage:#526b52}.wk-page{width:100%;min-width:0;overflow-x:clip}.wk-page :where(.wk-overview,.wk-main-grid,.wk-builder,.wk-current,.wk-audit,.wk-audit-columns,.wk-date-reason-grid){min-width:0;max-width:100%}.wk-dialog{background-color:#fffdf8!important;color:#382a27!important;border:1px solid #e7ded3!important}.wk-dialog .wk-primary{background-color:#9e0a0a!important;color:#fff!important;border:1px solid #9e0a0a!important;opacity:1}.wk-dialog .wk-primary:hover:not(:disabled){background-color:#780808!important;border-color:#780808!important}.wk-dialog .wk-dialog-footer button:not(.wk-primary){background:#fffdf8!important;color:#5d5048!important;border:1px solid #e7ded3!important}.wk-dialog .wk-dialog-footer button:focus-visible{outline:2px solid #9e0a0a!important;outline-offset:2px}
.wk-policy-context{display:flex;align-items:flex-start;gap:9px;margin:-7px 0 17px;padding:11px 13px;border:1px solid #e7d4c5;border-inline-start:3px solid var(--wk-red);border-radius:7px;background:#faf4ec;color:#66564d}.wk-policy-context svg{flex:0 0 auto;margin-top:2px;color:var(--wk-red)}.wk-policy-context p{margin:0;font-size:13px;line-height:1.55}.wk-heading-date input,.wk-field input{max-width:100%;min-width:0}.wk-day-button{touch-action:manipulation}.wk-day-button:focus-visible,.wk-mode-tabs button:focus-visible,.wk-shortcut:focus-visible{outline:2px solid var(--wk-red);outline-offset:2px}
.wk-bootstrap-banner{display:flex;align-items:center;gap:12px;margin:0 0 16px;padding:14px 16px;border:1px solid #d9b7a9;border-inline-start:4px solid var(--wk-red);border-radius:9px;background:#fff7f1;color:var(--wk-ink)}.wk-bootstrap-mark{display:grid;place-items:center;width:38px;height:38px;flex:0 0 auto;border-radius:8px;background:#f5e5dd;color:var(--wk-red)}.wk-bootstrap-copy{flex:1;min-width:0}.wk-bootstrap-copy h2{margin:0;font-size:16px;line-height:1.3}.wk-bootstrap-copy p{margin:3px 0 0;color:var(--wk-muted);font-size:13px;line-height:1.5}.wk-bootstrap-action{flex:0 0 auto}.wk-bootstrap-action:focus-visible{outline:2px solid var(--wk-red);outline-offset:3px}@media(max-width:767px){.wk-bootstrap-banner{align-items:flex-start;flex-wrap:wrap;padding:12px}.wk-bootstrap-copy{flex-basis:calc(100% - 52px)}.wk-bootstrap-action{width:100%;justify-content:center}}
`;
