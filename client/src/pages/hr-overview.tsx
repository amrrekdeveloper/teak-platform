import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowUpLeft, BriefcaseBusiness, CalendarDays, Clock3, RefreshCw, UsersRound } from "lucide-react";

type Overview = {
  employees: { active: number; total: number; missingManager: number };
  pending: { leaves: number; permissions: number; corrections: number; actions: number };
  asOf: string;
};

const getOverview = async (): Promise<Overview> => {
  const response = await fetch("/api/hr/overview", { credentials: "include" });
  if (!response.ok) throw new Error("overview");
  return response.json();
};

export default function HrOverviewPage() {
  const { t, isRTL } = useLanguage();
  const [, setLocation] = useLocation();
  const { data, isLoading, isError, refetch, dataUpdatedAt } = useQuery<Overview>({
    queryKey: ["/api/hr/overview"],
    queryFn: getOverview,
    staleTime: 30_000,
  });
  const dateText = (value?: string) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat(isRTL ? "ar-SA" : "en-GB", {
      dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh", calendar: "gregory",
    }).format(date);
  };
  const pendingLinks = [
    { label: t("طلبات الإجازة", "Leave requests"), count: data?.pending.leaves, href: "/requests?kind=leave&status=pending", icon: CalendarDays },
    { label: t("طلبات الاستئذان", "Permission requests"), count: data?.pending.permissions, href: "/requests?kind=permission&status=pending", icon: Clock3 },
    { label: t("تصحيحات الحضور", "Attendance corrections"), count: data?.pending.corrections, href: "/attendance-monitor/approvals", icon: Clock3 },
    { label: t("إجراءات الموارد البشرية", "HR actions"), count: data?.pending.actions, href: "/actions", icon: BriefcaseBusiness },
  ];
  return <div className="space-y-6">
    <header className="flex flex-col gap-4 border-b border-[var(--hr-line)]/40 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="mb-1 text-sm font-semibold text-[var(--hr-red)]">{t("مساحة العمل / الموارد البشرية", "WORKSPACE / HUMAN RESOURCES")}</p>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--hr-ink)]">{t("نظرة عامة", "Overview")}</h1>
        <p className="mt-1 text-sm text-[var(--hr-muted)]">{t("صورة تشغيلية مختصرة لما يحتاج انتباهك اليوم.", "A concise operational view of what needs your attention.")}</p>
      </div>
      <Button variant="outline" onClick={() => refetch()} disabled={isLoading} className="gap-2 self-start sm:self-auto">
        <RefreshCw size={15} className={isLoading ? "animate-spin" : ""} />{t("تحديث البيانات", "Refresh snapshot")}
      </Button>
    </header>
    {isError && !data ? <section className="rounded-xl border border-[var(--hr-line)] bg-[var(--hr-ivory)] p-6" role="alert">
      <p className="font-semibold">{t("تعذر تحميل لوحة الموارد البشرية.", "The HR overview could not be loaded.")}</p>
      <p className="mt-1 text-sm text-[var(--hr-muted)]">{t("تحقق من الاتصال ثم أعد المحاولة.", "Check your connection and retry.")}</p>
      <Button variant="outline" className="mt-4" onClick={() => refetch()}>{t("إعادة المحاولة", "Try again")}</Button>
    </section> : <>
      <section className="grid gap-4 sm:grid-cols-2">
        <article className="relative overflow-hidden rounded-2xl border border-[var(--hr-line)]/50 bg-[var(--hr-ivory)] p-5 sm:p-7">
          <div className="absolute inset-block-0 inset-inline-end-0 w-1.5 bg-[var(--hr-red)]" />
          <div className="flex items-start justify-between"><div><p className="text-sm text-[var(--hr-muted)]">{t("الموظفون النشطون", "Active employees")}</p>
            {isLoading && !data ? <div className="mt-3 h-10 w-24 animate-pulse rounded bg-[var(--hr-soft)]" /> : <p className="mt-2 text-4xl font-bold tracking-tight text-[var(--hr-ink)]">{data?.employees.active ?? "—"}<span className="ms-2 text-base font-normal text-[var(--hr-muted)]">/ {data?.employees.total ?? "—"}</span></p>}</div>
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--hr-soft)] text-[var(--hr-red)]"><UsersRound size={21} /></span></div>
          <p className="mt-4 text-xs text-[var(--hr-muted)]">{t("نشط من إجمالي المسجلين", "Active out of all registered employees")}</p>
        </article>
        <button type="button" onClick={() => setLocation("/employees")} className="group rounded-2xl border border-[var(--hr-line)]/50 bg-[var(--hr-ivory)] p-5 text-start transition-colors hover:border-[var(--hr-red)]/50 sm:p-7">
          <div className="flex items-start justify-between"><div><p className="text-sm text-[var(--hr-muted)]">{t("دليل الموظفين", "Employee directory")}</p><p className="mt-2 text-xl font-bold text-[var(--hr-ink)]">{t("إدارة بيانات الفريق", "Manage your people")}</p></div><span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--hr-soft)] text-[var(--hr-red)]"><UsersRound size={21} /></span></div>
          <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--hr-red)]">{t("فتح الموظفين", "Open employees")}<ArrowUpLeft size={16} className={isRTL ? "" : "rotate-180"} /></span>
        </button>
      </section>
      <section className="overflow-hidden rounded-2xl border border-[var(--hr-line)]/50 bg-[var(--hr-ivory)]">
        <div className="flex flex-col gap-1 border-b border-[var(--hr-line)]/35 px-5 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div><h2 className="text-lg font-bold">{t("قائمة المتابعة", "Needs your attention")}</h2><p className="text-sm text-[var(--hr-muted)]">{t("افتح المسار التشغيلي الأصلي لمراجعة التفاصيل.", "Open the original operational workflow to review details.")}</p></div>
          <span className="text-xs text-[var(--hr-muted)]">{t("آخر تحديث", "Snapshot")}: {dateText(data?.asOf || (dataUpdatedAt ? new Date(dataUpdatedAt).toISOString() : undefined))}</span>
        </div>
        <div className="divide-y divide-[var(--hr-line)]/30">
          {pendingLinks.map(({ label, count, href, icon: Icon }) => <button key={href} type="button" onClick={() => setLocation(href)} className="flex w-full items-center gap-4 px-5 py-4 text-start transition-colors hover:bg-[var(--hr-soft)]/60 sm:px-6">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--hr-soft)] text-[var(--hr-red)]"><Icon size={19} /></span>
            <span className="min-w-0 flex-1"><strong className="block text-sm">{label}</strong><small className="text-[var(--hr-muted)]">{t("انتقل إلى قائمة المتابعة", "Go to the operational queue")}</small></span>
            {isLoading && !data ? <span className="h-7 w-10 animate-pulse rounded bg-[var(--hr-soft)]" /> : <span className="min-w-10 rounded-full bg-[var(--hr-soft)] px-3 py-1 text-center font-mono text-sm font-bold text-[var(--hr-ink)]">{count ?? "—"}</span>}
            <ArrowUpLeft size={16} className={`shrink-0 text-[var(--hr-muted)] ${isRTL ? "" : "rotate-180"}`} />
          </button>)}
        </div>
      </section>
      {(data?.employees.missingManager ?? 0) > 0 && <section className="flex items-start gap-3 rounded-xl border border-amber-700/30 bg-amber-50 p-4 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
        <AlertTriangle size={19} className="mt-0.5 shrink-0" /><p className="text-sm">{t(`${data?.employees.missingManager} موظفًا نشطًا بحاجة إلى ربط مدير مباشر بحساب نشط. راجع الإسناد قبل اشتراط موافقة المدير.`, `${data?.employees.missingManager} active employees need a manager linked to an active account. Review assignments before requiring manager approval.`)}</p>
      </section>}
      {isError && <p role="status" className="text-sm text-amber-800">{t("تعذر تحديث اللقطة؛ تعرض البيانات المحفوظة مؤقتًا.", "Refresh failed; showing the last cached snapshot.")}</p>}
    </>}
  </div>;
}
