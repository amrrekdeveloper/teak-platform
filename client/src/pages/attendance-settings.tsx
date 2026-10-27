import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, ArrowUpRight, CalendarDays, Check, CheckCircle2, Clock3, Info, LoaderCircle, RefreshCw, Search, ShieldAlert, UsersRound, X } from "lucide-react";
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
  { n: 0, ar: "الأحد", en: "Sunday" }, { n: 1, ar: "الاثنين", en: "Monday" },
  { n: 2, ar: "الثلاثاء", en: "Tuesday" }, { n: 3, ar: "الأربعاء", en: "Wednesday" },
  { n: 4, ar: "الخميس", en: "Thursday" }, { n: 5, ar: "الجمعة", en: "Friday" },
  { n: 6, ar: "السبت", en: "Saturday" },
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
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { calendar: "gregory", day: "numeric", month: "short", year: "numeric" }).format(date);
};
const dateTime = (value: string, locale: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { calendar: "gregory", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
};

async function requestJson<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method, headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined, credentials: "include",
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
  const activeEmployees = useMemo(() => (settings?.employees || []).filter(employee => employee.status === "active"), [settings?.employees]);
  const visibleEmployees = mode === "review" ? (settings?.employees || []) : activeEmployees;
  const filteredEmployees = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return term ? visibleEmployees.filter(employee => employee.name.toLocaleLowerCase().includes(term) || employee.employeeNumber.toLocaleLowerCase().includes(term)) : visibleEmployees;
  }, [visibleEmployees, search]);
  useEffect(() => {
    if (!settings || settings.policies.length === 0) return;
    const companyWeek = settings.policies
      .filter(item => item.employeeId === null && item.effectiveFrom <= viewDate && item.workingDays !== null)
      .sort((a,b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.id-a.id)[0];
    if (companyWeek?.workingDays) setWorkingDays(companyWeek.workingDays);
  }, [settings?.policies.length]); // initialize from the saved week once the page loads

  const invalidatePreview = () => { setPreview(null); setError(""); setSuccess(""); setConfirmChecked(false); };
  const toggleDay = (day: number) => {
    if (mode === "bootstrap") return;
    invalidatePreview();
    setResetInherit(false);
    setWorkingDays(current => current.includes(day) ? current.filter(value => value !== day) : [...current, day].sort((a, b) => a - b));
  };
  const toggleEmployee = (id: number) => {
    invalidatePreview();
    const next = selectedIds.includes(id) ? selectedIds.filter(value => value !== id) : [...selectedIds, id];
    if (mode === "policy" && selectedIds.length === 0 && next.length === 1) {
      const savedDays = activeEmployees.find(employee => employee.id === id)?.workingDays;
      setWorkingDays(savedDays || DEFAULT_DAYS);
      setResetInherit(false);
    }
    setSelectedIds(next);
  };
  const setModeSafe = (value: "policy" | "bootstrap" | "review") => {
    invalidatePreview();
    setMode(value);
    if (value === "review") { setScope("employees"); setViewDate(businessDay); }
    else if (value === "bootstrap") {
      setScope("all"); setResetInherit(false); setIncludeOverrides(false);
      setWorkingDays(DEFAULT_DAYS);
      setEffectiveFrom(settings?.today || todayLocal());
      setViewDate(settings?.today || todayLocal());
    } else {
      setSelectedIds(current => current.filter(id => activeEmployees.some(employee => employee.id === id)));
      const futureStart = settings?.tomorrow || addDays(settings?.today || todayLocal(), 1);
      const nextEffective = effectiveFrom < futureStart ? futureStart : effectiveFrom;
      setEffectiveFrom(nextEffective); setViewDate(nextEffective);
    }
  };
  const changeScope = (value: "all" | "employees") => {
    invalidatePreview(); setScope(value);
    if (value === "all") { setResetInherit(false); setSelectedIds([]); }
  };
  const changeField = (fn: (value: string) => void) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    invalidatePreview(); fn(event.target.value);
  };
  const changeEffectiveDate = (value: string) => {
    if (mode === "bootstrap") return;
    invalidatePreview(); setEffectiveFrom(value);
    if (value) setViewDate(value);
  };
  const changeReviewDate = (value: string) => {
    invalidatePreview(); setBusinessDay(value);
    if (value) setViewDate(value);
  };
  const selectedAllVisible = filteredEmployees.length > 0 && filteredEmployees.every(employee => selectedIds.includes(employee.id));
  const selectVisible = () => {
    invalidatePreview();
    setSelectedIds(current => selectedAllVisible
      ? current.filter(id => !filteredEmployees.some(employee => employee.id === id))
      : Array.from(new Set([...current, ...filteredEmployees.map(employee => employee.id)])));
  };
  const currentDate = settings?.today || todayLocal();
  const minimumEffectiveDate = settings?.tomorrow || addDays(currentDate, 1);
  const formValid = reason.trim().length >= 3 && reason.trim().length <= 1000 &&
    (scope !== "all" || activeEmployees.length > 0) &&
    (scope !== "employees" || selectedIds.length > 0) &&
    (mode === "bootstrap" ? (settings?.policies.length === 0 && effectiveFrom === currentDate && scope === "all") :
      mode !== "policy" || (!!effectiveFrom && effectiveFrom >= minimumEffectiveDate)) &&
    (mode !== "review" || (!!businessDay && businessDay <= currentDate)) &&
    (mode !== "policy" || workingDays.length > 0);
  const showError = (cause: unknown) => {
    const e = cause as Error & { messageEn?: string; status?: number };
    const general = e.status === 409
      ? t("تغيّرت البيانات منذ المعاينة. حدّث المعاينة قبل التأكيد.", "The data changed since preview. Refresh the preview before confirming.")
      : e.status === 503
        ? t("إعدادات الدوام غير متاحة حالياً بسبب إعداد قاعدة البيانات. تواصل مع الدعم.", "Attendance settings are temporarily unavailable due to database setup. Contact support.")
        : (isRTL ? e.message : e.messageEn || e.message);
    setError(general || t("تعذّر إكمال الطلب. حاول مرة أخرى.", "The request could not be completed. Please try again."));
  };
  const makeBody = () => ({
    mode, scope, employeeIds: scope === "employees" ? selectedIds : [],
    workingDays: mode === "bootstrap" ? DEFAULT_DAYS : mode === "review"
      ? (reviewWorkingDay ? [new Date(`${businessDay}T12:00:00`).getDay()] : [])
      : scope === "employees" && resetInherit ? null : workingDays,
    ...(mode === "review" ? { businessDay } : { effectiveFrom: mode === "bootstrap" ? currentDate : effectiveFrom }),
    includeOverrides: mode === "policy" && scope === "all" && includeOverrides,
    reason: reason.trim(),
  });
  const requestPreview = async () => {
    if (!formValid || pending) return;
    setError(""); setSuccess(""); setPending(true); setPreview(null);
    try {
      const result = await requestJson<Preview>("/api/attendance/workweek/preview", "POST", makeBody());
      setPreview(result); setConfirmChecked(false); setDialogOpen(true);
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
      setReason(""); setIncludeOverrides(false);
      if (mode === "bootstrap") {
        const nextDate=settings?.tomorrow || addDays(currentDate,1);
        setMode("policy"); setEffectiveFrom(nextDate); setViewDate(nextDate);
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["/api/attendance/workweek/settings"] }),
        qc.invalidateQueries({ queryKey: ["/api/attendance/monitor"] }),
        qc.invalidateQueries({ queryKey: ["attendance-shift-monitor"] }),
        qc.invalidateQueries({ queryKey: ["attendance-shift-monitor-today"] }),
        qc.invalidateQueries({ queryKey: ["/api/attendance/corrections"] }),
        qc.invalidateQueries({ queryKey: ["/api/attendance/risk-scores"] }),
      ]);
    } catch (cause) {
      showError(cause); setDialogOpen(false);
      if ((cause as { status?: number })?.status === 409) setPreview(null);
    } finally { setApplyPending(false); }
  };
  const sourceName = (source: string) => source === "employee"
    ? t("أيام خاصة بالموظف", "Employee-specific days")
    : source === "default" ? t("أيام الدوام العامة", "General workdays")
      : source === "legacy" ? t("غير معروف — يحتاج مراجعة", "Unknown — needs review") : source;
  const dayLabel = (day: number) => DAYS.find(item => item.n === day)?.[isRTL ? "ar" : "en"] || "—";
  const daySummary = (days: number[] | null) => days === null
    ? t("غير معروف — لم يتم اعتماده", "Unknown — not approved")
    : days.map(dayLabel).join("، ");
  const localizedMessage = (message: string) => {
    if (message.includes("القاعدة العامة تشمل") || message.includes("general policy also covers")) {
      return t("تشمل أيام الدوام العامة الموظفين الجدد أيضاً، وتبقى التغييرات الفردية المجدولة بعد هذا التاريخ محفوظة.", "General workdays also apply to new employees. Individual changes scheduled after this date remain in place.");
    }
    const halves = message.split(" / ");
    return halves.length > 1 ? (isRTL ? halves[0] : halves.slice(1).join(" / ")) : message;
  };
  const statusLabel = (status: string) => {
    const labels: Record<string, [string, string]> = {
      absent: ["غياب", "Absent"], pending: ["قيد المراجعة", "Pending"], present: ["حاضر", "Present"],
      late: ["متأخر", "Late"], missing_checkout: ["خروج ناقص", "Missing checkout"],
      missing_checkin: ["دخول ناقص", "Missing check-in"], rest_day: ["يوم راحة", "Rest day"],
      not_started: ["لم يبدأ", "Not started"], approved_leave: ["إجازة معتمدة", "Approved leave"],
      excused: ["بعذر", "Excused"], unverified_schedule: ["جدول غير موثّق", "Unverified schedule"],
    };
    return labels[status]?.[isRTL ? 0 : 1] || status;
  };
  const deficiencyStatuses = ["absent", "pending", "missing_checkout", "missing_checkin", "unverified_schedule", "not_started"];
  const deficiencyRows = preview?.mode === "review" ? preview.rows.filter(row => row.after.statuses?.some(status => deficiencyStatuses.includes(status))) : [];
  const absenceCount = preview?.mode === "review" ? preview.rows.filter(row => row.after.statuses?.includes("absent")).length : 0;
  const reviewClassLabel = (workingDay: boolean | null) => workingDay === null
    ? t("التصنيف غير معروف", "Classification unknown")
    : workingDay ? t("يوم عمل", "Working day") : t("يوم راحة", "Rest day");
  const activeUnknownCount = activeEmployees.filter(employee => employee.workingDays === null).length;

  if (settingsQuery.isLoading) return <div className="wk-page" dir={isRTL ? "rtl" : "ltr"} aria-label={t("جارٍ تحميل إعدادات الدوام", "Loading workday settings")}><style>{styles}</style><div className="wk-loading"><i /><i /><i /></div></div>;
  if (settingsQuery.isError || !settings) return (
    <div className="wk-page" dir={isRTL ? "rtl" : "ltr"}><style>{styles}</style><section className="wk-error-state">
      <AlertTriangle size={22} /><h1>{t("تعذّر تحميل إعدادات الدوام", "Could not load workday settings")}</h1>
      <p>{t("تحقق من الاتصال ثم أعد المحاولة. لن يتم حفظ تغيير دون معاينة وتأكيد.", "Check your connection and try again. Changes are not saved without preview and confirmation.")}</p>
      <Button onClick={() => settingsQuery.refetch()} className="wk-primary"><RefreshCw size={16} />{t("إعادة المحاولة", "Try again")}</Button>
    </section></div>
  );

  return (
    <div className="wk-page" dir={isRTL ? "rtl" : "ltr"}>
      <style>{styles}</style>
      <header className="wk-heading">
        <div><div className="wk-eyebrow">{t("الحضور والانصراف", "ATTENDANCE")}</div>
          <h1>{t("أيام الدوام والراحة", "Workdays & rest days")}</h1>
          <p>{t("حدّد أيام العمل للموظفين. التعديلات الأسبوعية تبدأ غداً أو من التاريخ الذي تختاره.", "Set employees’ workdays. Weekly changes begin tomorrow or on the date you choose.")}</p>
        </div>
      </header>
      <nav className="wk-shortcuts" aria-label={t("إعدادات مرتبطة", "Related settings")}>
        <Link href="/attendance-monitor?tab=work-settings" className="wk-shortcut">{t("أوقات الدوام", "Work hours")}<ArrowUpRight size={14} /></Link>
        <Link href="/attendance-monitor?tab=assignments" className="wk-shortcut">{t("توزيع الورديات", "Shift assignments")}<ArrowUpRight size={14} /></Link>
        <Link href="/attendance-monitor?tab=zones" className="wk-shortcut">{t("مناطق الحضور", "Attendance zones")}<ArrowUpRight size={14} /></Link>
      </nav>

      {settings.policies.length === 0 && <section className="wk-bootstrap" aria-labelledby="wk-bootstrap-title">
        <div><h2 id="wk-bootstrap-title">{t("لم تُعتمد أيام الدوام بعد", "Workdays have not been approved yet")}</h2>
          <p>{t("يمكنك اعتماد أسبوع المصنع لأول مرة: من الأحد إلى الخميس والسبت دوام، والجمعة راحة. لن يُحفظ شيء قبل المعاينة والتأكيد.", "Set the factory’s initial week: Sunday–Thursday and Saturday are workdays; Friday is rest. Nothing is saved before preview and confirmation.")}</p>
        </div>
        <Button type="button" className="wk-primary" onClick={() => setModeSafe("bootstrap")} disabled={mode === "bootstrap"}>
          <CalendarDays size={17} />{t("اعتماد أيام الدوام لأول مرة", "Approve workdays for the first time")}
        </Button>
      </section>}

      <div className="wk-links-mode" role="group" aria-label={t("اختيار الإجراء", "Choose an action")}>
        <button type="button" className={mode !== "review" ? "selected" : ""} aria-pressed={mode !== "review"} data-testid="workweek-mode-policy" onClick={() => setModeSafe("policy")}>
          <CalendarDays size={18} /><span>{t("تعديل أيام الأسبوع", "Change weekly workdays")}</span>
        </button>
        <button type="button" className={mode === "review" ? "selected" : ""} aria-pressed={mode === "review"} data-testid="workweek-mode-review" onClick={() => setModeSafe("review")}>
          <Clock3 size={18} /><span>{t("تصحيح يوم في السجل", "Correct a recorded day")}</span>
        </button>
      </div>

      <main className="wk-builder">
        {mode === "review" && <div className="wk-caution"><ShieldAlert size={19} /><div>
          <strong>{t("تصحيح التصنيف فقط", "This corrects the day classification only")}</strong>
          <p>{t("تبقى البصمات كما هي. قد يتغير احتساب الحضور والغياب عند وجود جدول وردية مكتمل؛ راجع النتيجة قبل الحفظ.", "Punches stay unchanged. Attendance or absence may change when a complete shift schedule exists; review the result before saving.")}</p>
        </div></div>}
        <section className="wk-section">
          <div className="wk-title"><span className="wk-step">1</span><div><h2>{t("من يشمله التغيير؟", "Who should this apply to?")}</h2>
            <p>{mode === "review" ? t("اختر الموظفين المطلوب تصحيح يومهم.", "Choose the employees whose recorded day needs correction.") : t("يشمل اختيار الجميع الموظفين النشطين فقط.", "Choosing everyone includes active employees only.")}</p>
          </div></div>
          <div className="wk-scope-options">
            <button type="button" data-testid="workweek-scope" aria-pressed={scope === "all"} disabled={mode === "review" || mode === "bootstrap"} className={`wk-scope-option ${scope === "all" ? "selected" : ""}`} onClick={() => changeScope("all")}>
              <UsersRound size={18} /><span><strong>{t("كل الموظفين النشطين", "All active employees")}</strong><small>{activeEmployees.length} {t("موظف نشط", "active employees")}</small></span>{scope === "all" && <Check size={17} />}
            </button>
            <button type="button" aria-pressed={scope === "employees"} disabled={mode === "bootstrap"} className={`wk-scope-option ${scope === "employees" ? "selected" : ""}`} onClick={() => changeScope("employees")}>
              <CheckCircle2 size={18} /><span><strong>{t("موظفون محددون", "Selected employees")}</strong><small>{t("اختر كل شخص على حدة", "Choose each person explicitly")}</small></span>{scope === "employees" && <Check size={17} />}
            </button>
          </div>
          {scope === "employees" && <div className="wk-employee-picker">
            <div className="wk-employee-toolbar">
              <label className="wk-search"><Search size={16} /><Input value={search} onChange={changeField(setSearch)} placeholder={t("ابحث بالاسم أو الرقم الوظيفي", "Search name or employee number")} aria-label={t("البحث عن موظف", "Search employees")} /></label>
              <Button type="button" variant="outline" className="wk-select-visible" onClick={selectVisible} disabled={!filteredEmployees.length}>{selectedAllVisible ? t("إلغاء تحديد الظاهر", "Clear visible") : t("تحديد الظاهر", "Select visible")}</Button>
              <span className="wk-selected-count">{selectedIds.length} {t("محدد", "selected")}</span>
            </div>
            <div className="wk-employee-list">
              {filteredEmployees.length === 0 ? <div className="wk-no-results">{t("لا توجد نتائج مطابقة.", "No matching employees.")}</div> : filteredEmployees.map(employee => {
                const checked = selectedIds.includes(employee.id);
                return <label key={employee.id} className={`wk-employee ${checked ? "checked" : ""}`}>
                  <input type="checkbox" data-testid={`workweek-employee-${employee.id}`} checked={checked} onChange={() => toggleEmployee(employee.id)} />
                  <span className="wk-checkbox">{checked && <Check size={14} />}</span>
                  <span className="wk-employee-info"><strong>{employee.name}</strong><small>{t("رقم", "No.")} {employee.employeeNumber}{employee.status !== "active" ? ` · ${t("غير نشط", "Inactive")}` : ""}</small></span>
                  <span className={`wk-state-pill ${employee.workingDays === null ? "unknown" : ""}`}>{employee.workingDays === null ? t("غير معروف", "Unknown") : `${employee.workingDays.length} ${t("أيام دوام", "workdays")}`}</span>
                </label>;
              })}
            </div>
          </div>}
        </section>

        <section className="wk-section">
          <div className="wk-title"><span className="wk-step">2</span><div><h2>{mode === "review" ? t("ما تصنيف هذا اليوم؟", "How should this day be recorded?") : t("ما أيام الدوام؟", "Which days are workdays?")}</h2>
            <p>{mode === "review" ? t("غيّر التصنيف لهذا التاريخ المحدد فقط.", "This changes the classification for this date only.") : t("الأيام غير المحددة تُعد أيام راحة.", "Unselected days are rest days.")}</p></div></div>
          {mode !== "review" ? <>
            <div className="wk-day-grid" aria-label={t("اختيار أيام الدوام", "Choose workdays")}>
              {DAYS.map(day => {
                const active = workingDays.includes(day.n);
                return <button key={day.n} type="button" data-testid={`workweek-day-${day.n}`} aria-pressed={active} disabled={mode === "bootstrap"} className={`wk-day-button ${active ? "is-working" : "is-rest"}`} onClick={() => toggleDay(day.n)}>
                  <span>{day[isRTL ? "ar" : "en"]}</span><small>{active ? t("دوام", "Work") : t("راحة", "Rest")}</small>
                </button>;
              })}
            </div>
            <p className="wk-day-summary">{workingDays.length} {t("أيام دوام", "workdays")} · {7 - workingDays.length} {t("أيام راحة", "rest days")}</p>
            {mode === "bootstrap" && <p className="wk-inline-note">{t("هذا هو أسبوع المصنع المحدد للاعتماد الأول.", "This is the factory week used for initial approval.")}</p>}
            {activeUnknownCount > 0 && mode === "policy" && <p className="wk-inline-note warning"><Info size={15} />{t(`${activeUnknownCount} موظف نشط لديهم أيام غير معروفة؛ راجع النتيجة قبل الاعتماد.`, `${activeUnknownCount} active employees have unknown workdays; review the preview before approval.`)}</p>}
            {mode === "policy" && scope === "employees" && <label className="wk-override-toggle">
              <input type="checkbox" checked={resetInherit} onChange={event => { invalidatePreview(); setResetInherit(event.target.checked); }} />
              <span className="wk-checkbox">{resetInherit && <Check size={14} />}</span>
              <span><strong>{t("استخدم أيام الأسبوع العامة بدلاً من أيامهم الخاصة", "Use the general workweek instead of their personal days")}</strong><small>{t("سيُظهر العرض الأيام التي ستُطبق على كل موظف.", "The preview will show the days each employee will receive.")}</small></span>
            </label>}
          </> : <>
            <div className="wk-review-fields">
              <div className="wk-field"><label htmlFor="wk-review-date">{t("تاريخ اليوم", "Date to correct")}<b>*</b></label>
                <Input id="wk-review-date" data-testid="workweek-review-date" type="date" max={currentDate} value={businessDay} onChange={event => changeReviewDate(event.target.value)} />
                <small>{t("اليوم أو تاريخ سابق فقط.", "Today or an earlier date only.")}</small>
              </div>
              <div className="wk-review-status" role="group" aria-label={t("تصنيف اليوم", "Day classification")}>
                <button type="button" data-testid="workweek-review-workday" aria-pressed={reviewWorkingDay} className={reviewWorkingDay ? "is-selected-work" : ""} onClick={() => { invalidatePreview(); setReviewWorkingDay(true); }}>
                  <CheckCircle2 size={19} /><span><strong>{t("يوم دوام", "Workday")}</strong></span>
                </button>
                <button type="button" data-testid="workweek-review-restday" aria-pressed={!reviewWorkingDay} className={!reviewWorkingDay ? "is-selected-rest" : ""} onClick={() => { invalidatePreview(); setReviewWorkingDay(false); }}>
                  <Clock3 size={19} /><span><strong>{t("يوم راحة", "Rest day")}</strong></span>
                </button>
              </div>
            </div>
          </>}
        </section>

        <section className="wk-section">
          <div className="wk-title"><span className="wk-step">3</span><div><h2>{t("موعد التطبيق والسبب", "Start date and reason")}</h2>
            <p>{mode === "review" ? t("اشرح سبب تصحيح السجل.", "Explain why the record needs correction.") : t("لن تتغير الأيام السابقة.", "Past dates will not be changed.")}</p></div></div>
          <div className="wk-date-reason-grid">
            {mode !== "review" && <div className="wk-field"><label htmlFor="wk-effective-date">{mode === "bootstrap" ? t("يبدأ من اليوم", "Starts today") : t("تطبيق التغيير من", "Apply changes from")}<b>*</b></label>
              <Input id="wk-effective-date" data-testid="workweek-effective-date" type="date" min={mode === "bootstrap" ? currentDate : minimumEffectiveDate} disabled={mode === "bootstrap"} value={effectiveFrom} onChange={event => changeEffectiveDate(event.target.value)} />
              <small>{mode === "bootstrap" ? formatDate(currentDate, isRTL ? "ar-SA" : "en-US") : t("غداً أو تاريخ لاحق.", "Tomorrow or a later date.")}</small>
            </div>}
            <div className="wk-field"><label htmlFor="wk-reason">{t("سبب التغيير", "Reason")}<b>*</b></label>
              <Textarea id="wk-reason" data-testid="workweek-reason" value={reason} onChange={changeField(setReason)} maxLength={1000} rows={3} placeholder={t("اكتب سبباً واضحاً (3 أحرف على الأقل)", "Enter a clear reason (at least 3 characters)")} />
              <small>{reason.trim().length}/1000</small>
            </div>
          </div>
          {mode === "policy" && scope === "all" && <label className="wk-override-toggle">
            <input type="checkbox" checked={includeOverrides} onChange={event => { invalidatePreview(); setIncludeOverrides(event.target.checked); }} />
            <span className="wk-checkbox">{includeOverrides && <Check size={14} />}</span>
            <span><strong>{t("تضمين أيام الموظفين الخاصة", "Include personal employee schedules")}</strong><small>{t("عند التحديد، سيتغير جدول الموظفين ذوي الأيام الخاصة. اتركه دون تحديد للحفاظ عليها.", "When selected, employees with personal schedules will be changed too. Leave unchecked to preserve them.")}</small></span>
          </label>}
        </section>

        {error && <div className="wk-alert wk-alert-error" role="alert"><AlertTriangle size={18} /><span>{error}</span><button type="button" aria-label={t("إغلاق", "Dismiss")} onClick={() => setError("")}><X size={16} /></button></div>}
        {success && <div className="wk-alert wk-alert-success" role="status"><CheckCircle2 size={18} /><span>{success}</span><button type="button" aria-label={t("إغلاق", "Dismiss")} onClick={() => setSuccess("")}><X size={16} /></button></div>}
        <footer className="wk-submit-bar">
          <span>{t("ستراجع الأسماء والتغييرات قبل الحفظ.", "Review the names and changes before saving.")}</span>
          <Button type="button" data-testid="workweek-preview" onClick={requestPreview} disabled={!formValid || pending} className="wk-primary">
            {pending ? <LoaderCircle size={17} className="wk-spin" /> : <Search size={17} />}{pending ? t("جارٍ تجهيز المعاينة…", "Preparing preview…") : t("مراجعة التغييرات", "Review changes")}
          </Button>
        </footer>
      </main>

      <details className="wk-details">
        <summary>{t("أيام دوام الموظفين", "Employee workdays")}{activeUnknownCount > 0 && <span>{activeUnknownCount} {t("غير معروف", "unknown")}</span>}</summary>
        <div className="wk-details-tools">
          <label className="wk-search"><Search size={16} /><Input value={search} onChange={changeField(setSearch)} placeholder={t("ابحث بالاسم أو الرقم الوظيفي", "Search name or employee number")} aria-label={t("البحث عن موظف", "Search employees")} /></label>
          <span>{activeEmployees.length} {t("موظف نشط", "active employees")} · {settings.employees.length - activeEmployees.length} {t("غير نشط", "inactive")}</span>
        </div>
        {settings.employees.length === 0 ? <p className="wk-no-results">{t("لا يوجد موظفون لعرضهم.", "No employees to show.")}</p> :
          <div className="wk-saved-list">{settings.employees.filter(employee => {
            const term = search.trim().toLocaleLowerCase();
            return !term || employee.name.toLocaleLowerCase().includes(term) || employee.employeeNumber.toLocaleLowerCase().includes(term);
          }).map(employee => <article key={employee.id} className="wk-saved-person">
            <div><strong>{employee.name}</strong><small>{employee.employeeNumber} · {employee.status === "active" ? t("نشط", "Active") : t("غير نشط", "Inactive")}</small></div>
            <p className={employee.workingDays === null ? "unknown" : ""}>{daySummary(employee.workingDays)}</p>
          </article>)}</div>}
      </details>

      <details className="wk-details wk-history">
        <summary>{t("آخر التغييرات", "Recent changes")}</summary>
        <div className="wk-history-list">
          {settings.policies.length === 0 && settings.reviews.length === 0 && <p className="wk-no-results">{t("لا توجد تغييرات مسجلة بعد.", "No changes recorded yet.")}</p>}
          {settings.policies.slice(0, 8).map(policy => {
            const employee = settings.employees.find(item => item.id === policy.employeeId);
            return <article className="wk-history-row" key={`schedule-${policy.id}`}><span>{formatDate(policy.effectiveFrom, isRTL ? "ar-SA" : "en-US")}</span>
              <div><strong>{employee?.name || t("كل الموظفين النشطين", "All active employees")}</strong><p>{daySummary(policy.workingDays)}</p><small>{policy.reason}</small></div>
              <time>{dateTime(policy.createdAt, isRTL ? "ar-SA" : "en-US")}</time>
            </article>;
          })}
          {settings.reviews.slice(0, 8).map(review => {
            const employee = settings.employees.find(item => item.id === review.employeeId);
            return <article className="wk-history-row" key={`review-${review.id}`}><span>{formatDate(review.businessDay, isRTL ? "ar-SA" : "en-US")}</span>
              <div><strong>{employee?.name || `${t("الموظف", "Employee")} #${review.employeeId}`}</strong><p>{review.workingDay ? t("يوم دوام", "Workday") : t("يوم راحة", "Rest day")}</p><small>{review.reason}</small></div>
              <time>{dateTime(review.createdAt, isRTL ? "ar-SA" : "en-US")}</time>
            </article>;
          })}
        </div>
      </details>

      <Dialog open={dialogOpen} onOpenChange={open => { if (!applyPending) setDialogOpen(open); }}>
        <DialogContent className="wk-dialog" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader className="wk-dialog-header">
            <div className="wk-dialog-icon"><ShieldAlert size={21} /></div>
            <DialogTitle>{t("راجع التفاصيل قبل الحفظ", "Review before saving")}</DialogTitle>
            <DialogDescription>{preview?.mode !== "review"
              ? t(`يبدأ من ${formatDate(preview?.effectiveFrom || "", isRTL ? "ar-SA" : "en-US")}`, `Starts ${formatDate(preview?.effectiveFrom || "", "en-US")}`)
              : t(`تصحيح يوم ${formatDate(preview?.businessDay || "", isRTL ? "ar-SA" : "en-US")}`, `Correction for ${formatDate(preview?.businessDay || "", "en-US")}`)}</DialogDescription>
          </DialogHeader>
          {preview && <div className="wk-preview-content">
            <div className="wk-preview-stats"><div><strong>{preview.affectedCount}</strong><span>{t("موظف سيتأثر", "employees affected")}</span></div>
              {preview.excludedCount > 0 && <div><strong>{preview.excludedCount}</strong><span>{t("احتُفظ بأيامهم الخاصة", "personal schedules preserved")}</span></div>}</div>
            {(preview.warnings.length > 0 || (mode === "policy" && scope === "all" && includeOverrides)) && <div className="wk-preview-warnings"><AlertTriangle size={17} /><div>
              {preview.warnings.map((warning, index) => <p key={index}>{localizedMessage(warning)}</p>)}
              {mode === "policy" && scope === "all" && includeOverrides && <p>{t("تم اختيار تضمين الموظفين ذوي أيام الدوام الخاصة؛ ستُستبدل أيامهم بهذا الجدول من التاريخ المحدد.", "Personal employee schedules are included and will be replaced by this schedule from the selected date.")}</p>}
            </div></div>}
            {preview.mode === "review" && <div className="wk-preview-deficiency" role="alert"><AlertTriangle size={18} /><div>
              <strong>{t("راجع نتائج الحضور", "Review attendance outcomes")}</strong>
              <p>{deficiencyRows.length > 0
                ? t(`قد تظهر حالات تحتاج مراجعة لدى ${deficiencyRows.length} موظف${absenceCount ? `، منها ${absenceCount} غياب` : ""}. راجع الأسماء قبل التأكيد.`, `${deficiencyRows.length} employee${deficiencyRows.length === 1 ? "" : "s"} may have an outcome that needs review${absenceCount ? `, including ${absenceCount} absence` : ""}. Check names before confirming.`)
                : t("لا تظهر حالات غياب أو نقص حضور معروفة. راجع التصنيف قبل التأكيد.", "No known absence or attendance-deficiency outcomes appear. Check the classification before confirming.")}</p>
            </div></div>}
            <div className={`wk-preview-table-wrap ${preview.mode === "review" ? "is-review-preview" : ""}`}>
              <table className="wk-preview-table"><thead><tr><th>{t("الموظف", "Employee")}</th><th>{t("قبل", "Before")}</th><th>{t("بعد", "After")}</th></tr></thead>
                <tbody>{preview.rows.map(row => {
                  const renderState = (state: PreviewRow["before"], side: "before" | "after") => preview.mode !== "review"
                    ? <><span className={side === "after" ? "wk-after" : "wk-before"}>{daySummary(state.workingDays)}</span><small>{sourceName(state.source)}</small></>
                    : <><div className="wk-status-chips">{(state.statuses || []).length ? state.statuses.map(status => <span key={status} className={`wk-status-chip wk-status-${status}`}>{statusLabel(status)}</span>) : <span>{t("لا توجد حالة", "No status")}</span>}</div><small>{reviewClassLabel(state.workingDay)}</small></>;
                  return <tr key={row.employeeId}><td><strong>{row.name}</strong><small>{row.employeeNumber}</small></td>
                    <td data-label={t("قبل", "Before")}>{renderState(row.before, "before")}</td>
                    <td data-label={t("بعد", "After")}>{renderState(row.after, "after")}{row.warning && <em>{localizedMessage(row.warning)}</em>}</td></tr>;
                })}</tbody>
              </table>
            </div>
            {preview.mode === "review" && <div className="wk-dialog-caution"><Info size={16} />{t("يتغير تصنيف اليوم فقط. البصمات لا تتغير، ولا يُنشأ غياب تلقائي دون جدول محفوظ ومكتمل.", "Only the day classification changes. Punches are untouched; no absence is inferred without a complete saved schedule.")}</div>}
            <label className="wk-final-confirm"><input type="checkbox" data-testid="workweek-confirm-check" checked={confirmChecked} onChange={event => setConfirmChecked(event.target.checked)} />
              <span className="wk-checkbox">{confirmChecked && <Check size={14} />}</span><span>{t("راجعت التغييرات وأوافق على حفظها.", "I reviewed the changes and confirm saving them.")}</span>
            </label>
          </div>}
          <DialogFooter className="wk-dialog-footer">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={applyPending}>{t("عودة للتعديل", "Back to edit")}</Button>
            <Button type="button" data-testid="workweek-apply" onClick={applyPreview} disabled={!confirmChecked || applyPending || !preview} className="wk-primary">
              {applyPending ? <LoaderCircle size={17} className="wk-spin" /> : <CheckCircle2 size={17} />}{applyPending ? t("جارٍ الحفظ…", "Saving…") : t("تأكيد وحفظ", "Confirm & save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const styles = `
.wk-page,.wk-dialog{--red:var(--hr-red,#9e0a0a);--paper:var(--hr-paper,#f6f2ea);--ivory:var(--hr-ivory,#fffdf8);--ink:var(--hr-ink,#382a27);--muted:var(--hr-muted,#625650);--line:var(--hr-line,#95816d);--soft:var(--hr-soft,#f1ebe2);--wk-accent:var(--red);--wk-warning:#80551d;--wk-positive:#456143;color:var(--ink);font-family:"Zain",Tahoma,sans-serif}
.wk-page{max-width:1120px;min-width:0;margin:0 auto;padding:12px 18px 48px}
.wk-page *,.wk-dialog *{box-sizing:border-box}.wk-page button,.wk-page input,.wk-page textarea,.wk-dialog button,.wk-dialog input{font:inherit}.wk-heading{padding:8px 0 14px}.wk-eyebrow{color:var(--red);font-size:12px;font-weight:800;letter-spacing:.09em}.wk-heading h1{margin:4px 0;font-size:clamp(26px,3vw,34px);line-height:1.2}.wk-heading p{margin:0;color:var(--muted);font-size:15px;line-height:1.5}
.wk-shortcuts{display:flex;gap:8px;flex-wrap:wrap;padding:11px 0 14px;margin-bottom:14px;border-bottom:1px solid color-mix(in srgb,var(--line),transparent 50%)}.wk-shortcut{min-height:38px;display:inline-flex;align-items:center;gap:6px;padding:0 11px;border:1px solid color-mix(in srgb,var(--line),transparent 30%);border-radius:7px;background:var(--ivory);color:var(--ink);text-decoration:none;font-size:13px}.wk-shortcut:hover{border-color:var(--red);color:var(--red)}
.wk-bootstrap{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:15px;padding:15px 17px;border:1px solid #dbc3a4;border-radius:9px;background:color-mix(in srgb,#fff4e2,var(--ivory) 40%)}.wk-bootstrap h2{margin:0;font-size:17px}.wk-bootstrap p{margin:4px 0 0;max-width:700px;color:var(--muted);font-size:13px;line-height:1.5}
.wk-links-mode{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}.wk-links-mode button{min-height:48px;display:flex;align-items:center;justify-content:center;gap:8px;padding:9px;border:1px solid color-mix(in srgb,var(--line),transparent 25%);border-radius:8px;background:var(--ivory);color:var(--ink);font-weight:700;cursor:pointer}.wk-links-mode button.selected{border-color:var(--red);background:color-mix(in srgb,var(--red),var(--ivory) 94%);color:var(--red)}.wk-links-mode button:focus-visible,.wk-day-button:focus-visible,.wk-scope-option:focus-visible,.wk-review-status button:focus-visible{outline:3px solid color-mix(in srgb,var(--red),transparent 30%);outline-offset:2px}
.wk-builder,.wk-details{min-width:0;border:1px solid color-mix(in srgb,var(--line),transparent 25%);border-radius:10px;background:var(--ivory);overflow:hidden}.wk-caution{display:flex;gap:10px;margin:14px 16px 0;padding:11px 12px;border:1px solid #dec69f;border-radius:7px;background:#fff7e9;color:#75552f}.wk-caution>svg{flex:0 0 auto}.wk-caution strong{font-size:14px}.wk-caution p{margin:3px 0 0;color:var(--muted);font-size:13px;line-height:1.5}
.wk-section{padding:18px 18px 19px;border-bottom:1px solid color-mix(in srgb,var(--line),transparent 50%)}.wk-title{display:flex;align-items:flex-start;gap:10px;margin-bottom:14px}.wk-step{width:25px;height:25px;flex:0 0 auto;display:grid;place-items:center;border-radius:50%;background:color-mix(in srgb,var(--red),var(--ivory) 90%);color:var(--red);font-size:12px;font-weight:800}.wk-title h2{margin:0;font-size:17px}.wk-title p{margin:3px 0 0;color:var(--muted);font-size:13px;line-height:1.45}
.wk-scope-options{display:grid;grid-template-columns:1fr 1fr;gap:9px}.wk-scope-option{min-height:65px;display:flex;align-items:center;gap:10px;padding:10px;border:1px solid color-mix(in srgb,var(--line),transparent 28%);border-radius:8px;background:var(--ivory);color:var(--ink);text-align:start;cursor:pointer}.wk-scope-option>span{flex:1;display:grid;min-width:0}.wk-scope-option strong{font-size:14px}.wk-scope-option small{color:var(--muted);font-size:12px}.wk-scope-option.selected{border-color:var(--red);background:color-mix(in srgb,var(--red),var(--ivory) 95%);color:var(--red)}.wk-scope-option:disabled{opacity:.6;cursor:not-allowed}
.wk-employee-picker{margin-top:12px;border:1px solid color-mix(in srgb,var(--line),transparent 25%);border-radius:8px;overflow:hidden}.wk-employee-toolbar,.wk-details-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:9px;background:var(--paper);border-bottom:1px solid color-mix(in srgb,var(--line),transparent 40%)}.wk-search{min-width:180px;flex:1;position:relative}.wk-search svg{position:absolute;inset-inline-start:10px;top:50%;transform:translateY(-50%);color:var(--muted)}.wk-search input{height:40px;padding-inline-start:34px;border-color:color-mix(in srgb,var(--line),transparent 25%);background:var(--ivory);font-size:16px}.wk-select-visible{min-height:40px;padding-inline:10px;border-color:color-mix(in srgb,var(--line),transparent 25%);background:var(--ivory);font-size:13px}.wk-selected-count{color:var(--red);font-size:13px;font-weight:700;white-space:nowrap}.wk-employee-list{max-height:260px;overflow-y:auto;overscroll-behavior:contain}.wk-employee{min-height:52px;display:flex;align-items:center;gap:10px;padding:7px 11px;border-bottom:1px solid color-mix(in srgb,var(--line),transparent 68%);cursor:pointer}.wk-employee.checked{background:color-mix(in srgb,var(--red),var(--ivory) 97%)}.wk-employee input,.wk-override-toggle input,.wk-final-confirm input{position:absolute;width:1px;height:1px;opacity:0}.wk-checkbox{width:20px;height:20px;flex:0 0 auto;display:grid;place-items:center;border:1.5px solid color-mix(in srgb,var(--line),var(--ink) 10%);border-radius:5px;background:var(--ivory);color:white}.wk-employee input:checked+.wk-checkbox,.wk-override-toggle input:checked+.wk-checkbox,.wk-final-confirm input:checked+.wk-checkbox{border-color:var(--red);background:var(--red)}.wk-employee input:focus-visible+.wk-checkbox,.wk-override-toggle input:focus-visible+.wk-checkbox,.wk-final-confirm input:focus-visible+.wk-checkbox{outline:2px solid var(--red);outline-offset:2px}.wk-employee-info{flex:1;min-width:0;display:grid}.wk-employee-info strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}.wk-employee-info small{color:var(--muted);font-size:12px}.wk-state-pill{padding:3px 7px;border-radius:5px;background:#e8efe4;color:#466344;font-size:11px;white-space:nowrap}.wk-state-pill.unknown{background:#fff0de;color:#81551f}.wk-no-results{padding:17px;text-align:center;color:var(--muted);font-size:14px}
.wk-day-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:7px}.wk-day-button{min-width:0;min-height:67px;display:grid;align-content:center;justify-items:center;gap:4px;padding:5px 2px;border:1px solid color-mix(in srgb,var(--line),transparent 30%);border-radius:7px;cursor:pointer;transition:transform .14s ease,background-color .14s ease}.wk-day-button:hover:not(:disabled){transform:translateY(-1px)}.wk-day-button span{font-size:clamp(11px,1.3vw,14px);font-weight:700;white-space:nowrap}.wk-day-button small{font-size:11px;font-weight:700}.wk-day-button.is-working{border-color:#c5d4bf;background:#eef3e9;color:#456143}.wk-day-button.is-rest{border-color:#e2d6cc;background:#f7f0e9;color:#856750}.wk-day-button:disabled{cursor:default;opacity:.86}.wk-day-summary{margin:9px 0 0;color:var(--muted);font-size:13px}.wk-inline-note{display:flex;align-items:flex-start;gap:6px;margin:9px 0 0;color:var(--muted);font-size:12px;line-height:1.5}.wk-inline-note.warning{color:#775522}
.wk-override-toggle{display:flex;align-items:flex-start;gap:9px;margin-top:12px;padding:11px;border:1px solid color-mix(in srgb,#dfbd91,var(--line) 40%);border-radius:7px;background:color-mix(in srgb,#fff5e6,var(--ivory) 30%);cursor:pointer}.wk-override-toggle>span:last-child{display:grid}.wk-override-toggle strong{font-size:13px}.wk-override-toggle small{margin-top:2px;color:var(--muted);font-size:12px;line-height:1.45}
.wk-date-reason-grid{display:grid;grid-template-columns:minmax(190px,.7fr) minmax(220px,1.3fr);gap:13px}.wk-field{min-width:0;display:grid;align-content:start;gap:6px}.wk-field label{font-size:13px;font-weight:700}.wk-field label b{margin-inline-start:3px;color:var(--red)}.wk-field input,.wk-field textarea{min-height:44px;border-color:color-mix(in srgb,var(--line),transparent 20%);border-radius:7px;background:var(--ivory);font-size:16px}.wk-field textarea{min-height:84px;padding:9px 11px;resize:vertical;line-height:1.5}.wk-field>small{color:var(--muted);font-size:11px}.wk-review-fields{display:grid;grid-template-columns:minmax(190px,.7fr) minmax(220px,1.3fr);gap:13px}.wk-review-status{display:grid;grid-template-columns:1fr 1fr;gap:8px;align-self:end}.wk-review-status button{min-height:46px;display:flex;align-items:center;gap:8px;padding:9px;border:1px solid color-mix(in srgb,var(--line),transparent 25%);border-radius:7px;background:var(--ivory);color:var(--ink);text-align:start;cursor:pointer}.wk-review-status button.is-selected-work{border-color:#b8cbb1;background:#eef3e9;color:#456143}.wk-review-status button.is-selected-rest{border-color:#ddc9b8;background:#f7f0e9;color:#856750}
.wk-alert{display:flex;align-items:flex-start;gap:9px;margin:12px 16px 0;padding:10px 12px;border-radius:7px;font-size:14px;line-height:1.5}.wk-alert>span{flex:1;min-width:0}.wk-alert button{display:grid;place-items:center;width:28px;height:28px;flex:0 0 auto;border:0;background:transparent;cursor:pointer}.wk-alert-error{border:1px solid #e5b7b0;background:#fff1ee;color:#81271f}.wk-alert-success{border:1px solid #cad8c3;background:#f0f5ec;color:#456242}.wk-submit-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 17px;background:var(--paper)}.wk-submit-bar>span{color:var(--muted);font-size:12px;line-height:1.4}.wk-primary{min-height:44px;display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:7px;background:var(--red);color:white;font-size:14px;font-weight:700;white-space:normal}.wk-primary:hover{background:var(--hr-red-deep,#780808)}.wk-primary:disabled{opacity:.5}.wk-spin{animation:wk-spin 1s linear infinite}@keyframes wk-spin{to{transform:rotate(360deg)}}
.wk-details{margin-top:13px}.wk-details summary{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:50px;padding:12px 15px;cursor:pointer;font-weight:700;list-style:none}.wk-details summary::-webkit-details-marker{display:none}.wk-details summary:after{content:"+";color:var(--red);font-size:20px}.wk-details[open] summary:after{content:"−"}.wk-details summary span{margin-inline-start:auto;color:#80551d;font-size:12px;font-weight:600}.wk-details-tools{border-block:1px solid color-mix(in srgb,var(--line),transparent 45%)}.wk-details-tools>span{color:var(--muted);font-size:12px}.wk-saved-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));max-height:430px;overflow:auto}.wk-saved-person{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;min-width:0;padding:11px 14px;border-bottom:1px solid color-mix(in srgb,var(--line),transparent 65%)}.wk-saved-person>div{display:grid;min-width:0}.wk-saved-person strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.wk-saved-person small{color:var(--muted);font-size:11px}.wk-saved-person p{margin:0;text-align:end;font-size:12px;line-height:1.5}.wk-saved-person p.unknown{color:#80551d}.wk-history-list{padding:0 15px 10px}.wk-history-row{display:grid;grid-template-columns:minmax(80px,.3fr) minmax(0,1fr) auto;gap:10px;padding:10px 0;border-top:1px solid color-mix(in srgb,var(--line),transparent 60%);font-size:12px}.wk-history-row>span{font-weight:700}.wk-history-row>div{min-width:0}.wk-history-row p{margin:2px 0;color:var(--muted)}.wk-history-row small{display:block;overflow-wrap:anywhere;color:var(--muted)}.wk-history-row time{color:var(--muted);white-space:nowrap;font-size:11px}
.wk-dialog{width:min(880px,calc(100vw - 28px));max-width:880px;max-height:min(90dvh,900px);display:flex;flex-direction:column;gap:0!important;overflow:hidden}.wk-dialog-header,.wk-dialog-footer{flex:0 0 auto}.wk-dialog-header{display:grid;grid-template-columns:34px 1fr;gap:0 10px;padding-bottom:12px;border-bottom:1px solid color-mix(in srgb,var(--line),transparent 45%)}.wk-dialog-icon{grid-row:1/3;width:32px;height:32px;display:grid;place-items:center;border-radius:7px;background:color-mix(in srgb,var(--red),var(--ivory) 91%);color:var(--red)}.wk-dialog-header [data-slot=dialog-title]{align-self:end}.wk-dialog-header [data-slot=dialog-description]{margin-top:3px}.wk-preview-content{min-height:0;overflow:auto;padding:12px 1px}.wk-preview-stats{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px}.wk-preview-stats>div{display:grid;padding:8px 12px;border-radius:7px;background:var(--paper)}.wk-preview-stats strong{font-size:22px}.wk-preview-stats span{color:var(--muted);font-size:12px}.wk-preview-warnings,.wk-preview-deficiency,.wk-dialog-caution{display:flex;align-items:flex-start;gap:9px;margin:9px 0;padding:10px 11px;border:1px solid #e1c99f;border-radius:7px;background:#fff7e9;color:#75552f;font-size:13px;line-height:1.5}.wk-preview-warnings>svg,.wk-preview-deficiency>svg,.wk-dialog-caution>svg{flex:0 0 auto;margin-top:2px}.wk-preview-warnings p,.wk-preview-deficiency p{margin:0 0 4px}.wk-preview-deficiency strong{font-size:13px}.wk-preview-table-wrap{max-height:340px;overflow:auto;border:1px solid color-mix(in srgb,var(--line),transparent 35%);border-radius:7px}.wk-preview-table{width:100%;border-collapse:collapse;font-size:13px}.wk-preview-table th,.wk-preview-table td{min-width:130px;padding:9px;text-align:start;vertical-align:top;border-bottom:1px solid color-mix(in srgb,var(--line),transparent 55%)}.wk-preview-table th{position:sticky;top:0;background:var(--paper);color:var(--muted);font-size:12px}.wk-preview-table td:first-child{min-width:160px}.wk-preview-table td strong,.wk-preview-table td small{display:block}.wk-preview-table td small{margin-top:3px;color:var(--muted);font-size:11px}.wk-after{font-weight:700;color:#456143}.wk-before{color:var(--muted)}.wk-preview-table em{display:block;margin-top:5px;color:#80551d;font-style:normal;font-size:11px}.wk-status-chips{display:flex;flex-wrap:wrap;gap:4px}.wk-status-chip{padding:2px 6px;border-radius:4px;background:var(--paper);font-size:11px}.wk-final-confirm{display:flex;align-items:flex-start;gap:9px;margin-top:12px;padding:10px;border:1px solid color-mix(in srgb,var(--line),transparent 25%);border-radius:7px;cursor:pointer;font-size:13px}.wk-final-confirm>span:last-child{line-height:1.5}.wk-dialog-footer{gap:8px;padding-top:10px;border-top:1px solid color-mix(in srgb,var(--line),transparent 50%)}.wk-dialog-footer button{min-height:42px}.wk-loading{display:grid;gap:12px;padding-top:30px}.wk-loading i{height:66px;border-radius:9px;background:linear-gradient(90deg,var(--soft),var(--ivory),var(--soft));background-size:200% 100%;animation:wk-shimmer 1.5s ease-in-out infinite}@keyframes wk-shimmer{to{background-position:-200% 0}}.wk-error-state{max-width:560px;margin:80px auto;padding:26px;border:1px solid color-mix(in srgb,var(--line),transparent 25%);border-radius:10px;background:var(--ivory);text-align:center}.wk-error-state>svg{color:var(--red)}.wk-error-state h1{font-size:22px}.wk-error-state p{color:var(--muted);line-height:1.6}
@media(max-width:767px){.wk-page{padding:8px 12px 32px}.wk-heading p{font-size:14px}.wk-bootstrap{align-items:stretch;flex-direction:column;gap:11px;padding:13px}.wk-bootstrap .wk-primary{width:100%}.wk-links-mode{grid-template-columns:1fr}.wk-links-mode button{justify-content:flex-start;padding-inline:13px}.wk-section{padding:15px 13px}.wk-scope-options{grid-template-columns:1fr}.wk-day-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.wk-day-button{min-height:60px}.wk-date-reason-grid,.wk-review-fields{grid-template-columns:1fr}.wk-review-status{align-self:auto}.wk-submit-bar{align-items:stretch;flex-direction:column;padding:13px}.wk-submit-bar .wk-primary{width:100%}.wk-saved-list{grid-template-columns:1fr}.wk-history-row{grid-template-columns:minmax(70px,.4fr) minmax(0,1fr);gap:6px}.wk-history-row time{grid-column:2}.wk-dialog{width:calc(100vw - 20px);max-height:calc(100dvh - 24px);padding:16px}.wk-preview-table,.wk-preview-table tbody{display:block;width:100%}.wk-preview-table thead{display:none}.wk-preview-table tr{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);padding:6px 0;border-bottom:1px solid color-mix(in srgb,var(--line),transparent 50%)}.wk-preview-table td{display:block;min-width:0!important;overflow-wrap:anywhere;border:0!important}.wk-preview-table td:first-child{grid-column:1/-1}.wk-preview-table td[data-label]:before{content:attr(data-label);display:block;margin-bottom:4px;color:var(--muted);font-size:11px}.wk-preview-table-wrap{max-height:none;overflow:visible}.wk-dialog-footer{flex-direction:column-reverse}.wk-dialog-footer button{width:100%;min-height:44px;flex:none}.wk-preview-content{flex:1}.wk-shortcuts{gap:6px}.wk-shortcut{flex:1;justify-content:center;padding-inline:7px;font-size:12px}}
@media(max-width:390px){.wk-page{padding-inline:10px}.wk-day-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.wk-employee-toolbar{align-items:stretch}.wk-search{flex-basis:100%}.wk-select-visible{flex:1}.wk-selected-count{align-self:center}.wk-state-pill{font-size:10px;padding-inline:5px}.wk-preview-table tr{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
@media(prefers-reduced-motion:reduce){.wk-spin,.wk-loading i{animation:none}.wk-day-button{transition:none}}
.wk-bootstrap,.wk-override-toggle{background:var(--soft);border-color:var(--line)}
.wk-eyebrow,.wk-shortcut:hover,.wk-links-mode button.selected,.wk-scope-option.selected,.wk-step,.wk-selected-count,.wk-field label b,.wk-details summary:after,.wk-dialog-icon,.wk-error-state>svg{color:var(--wk-accent)}
.wk-inline-note.warning,.wk-details summary span,.wk-saved-person p.unknown,.wk-preview-table em{color:var(--wk-warning)}
.wk-after{color:var(--wk-positive)}.wk-caution p{color:inherit}
html.dark .wk-page,html.dark .wk-dialog{--wk-accent:#ffb4ac;--wk-warning:#f2c478;--wk-positive:#b7d6a7}
html.dark .wk-caution,html.dark .wk-preview-warnings,html.dark .wk-preview-deficiency,html.dark .wk-dialog-caution{background:#3e2e1e;color:#f2c478;border-color:#9d8059}
html.dark .wk-alert-success{background:#26382a;color:#c4e4bb;border-color:#547558}
html.dark .wk-alert-error{background:#421f22;color:#ffc5be;border-color:#bb7771}
`;
