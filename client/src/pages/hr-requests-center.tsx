import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, FileText, Plus, RefreshCw, Search } from "lucide-react";
import { useEffect, useState } from "react";

type RequestRow = { id: number; kind: "leave" | "permission"; employeeId: number; employeeName: string; employeeNumber: string; startDate: string; endDate: string; status: string; reason: string; createdAt: string; stage: "manager" | "hr" | "closed"; managerName: string | null };
type RequestData = { items: RequestRow[]; counts: { pending: number; approved: number; rejected: number; clarification: number }; total: number; page: number; pageSize: number };
type Status = "pending" | "approved" | "rejected" | "clarification_requested" | "all";
type Kind = "all" | "leave" | "permission";
const pageSize = 25;

export default function HrRequestsCenterPage() {
  const { t, isRTL } = useLanguage();
  const [, setLocation] = useLocation();
  const queryString = useSearch();
  const params = new URLSearchParams(queryString);
  const [kind, setKind] = useState<Kind>((["all", "leave", "permission"].includes(params.get("kind") || "") ? params.get("kind") : "all") as Kind);
  const [status, setStatus] = useState<Status>((["pending", "approved", "rejected", "clarification_requested", "all"].includes(params.get("status") || "") ? params.get("status") : "pending") as Status);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const next = new URLSearchParams(queryString);
    const queryKind = next.get("kind");
    const queryStatus = next.get("status");
    if (queryKind && ["all", "leave", "permission"].includes(queryKind)) setKind(queryKind as Kind);
    if (queryStatus && ["all", "pending", "approved", "rejected", "clarification_requested"].includes(queryStatus)) setStatus(queryStatus as Status);
  }, [queryString]);
  useEffect(() => { setPage(1); }, [kind, status, search, from, to]);
  const key = ["/api/hr/requests", kind, status, search.trim(), page, pageSize, from, to];
  const list = useQuery<RequestData>({
    queryKey: key,
    queryFn: async () => {
      const searchParams = new URLSearchParams({ kind, status, search: search.trim(), page: String(page), pageSize: String(pageSize) });
      if (from) searchParams.set("from", from);
      if (to) searchParams.set("to", to);
      const response = await fetch(`/api/hr/requests?${searchParams.toString()}`, { credentials: "include" });
      if (!response.ok) throw new Error("requests");
      return response.json();
    },
    staleTime: 30_000,
  });
  const statusLabel = (value: string) => value === "approved" ? t("معتمد", "Approved") : value === "rejected" ? t("مرفوض", "Rejected")
    : value === "clarification_requested" ? t("توضيح مطلوب", "Clarification") : t("قيد الانتظار", "Pending");
  const statusStyle = (value: string) => value === "approved" ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
    : value === "rejected" ? "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-100"
    : value === "clarification_requested" ? "bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100"
    : "bg-[var(--hr-soft)] text-[var(--hr-ink)]";
  const displayDate = (value: string) => {
    if (!value) return "—";
    const date = new Date(`${value.slice(0, 10)}T12:00:00+03:00`);
    return new Intl.DateTimeFormat(isRTL ? "ar-SA" : "en-GB", { dateStyle: "medium", timeZone: "Asia/Riyadh", calendar: "gregory" }).format(date);
  };
  const dateRange = (row: RequestRow) => `${displayDate(row.startDate)}${row.endDate && row.endDate !== row.startDate ? ` – ${displayDate(row.endDate)}` : ""}`;
  const openRequest = (row: RequestRow) => setLocation(row.kind === "leave" ? `/leaves?request=${row.id}` : `/permissions?request=${row.id}`);
  const permissionListSelected = kind === "permission";
  const makeRequest = () => setLocation(permissionListSelected ? "/permissions" : "/leaves?new=1");
  const requestCard = (row: RequestRow) => <button key={`${row.kind}-${row.id}`} type="button" onClick={() => openRequest(row)} className="w-full rounded-xl border border-[var(--hr-line)]/45 bg-[var(--hr-ivory)] p-4 text-start transition-colors hover:border-[var(--hr-red)]/50">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><span className="text-xs font-semibold text-[var(--hr-red)]">{row.kind === "leave" ? t("إجازة", "Leave") : t("استئذان", "Permission")} · #{row.id}</span><p className="mt-1 truncate font-bold">{row.employeeName || `#${row.employeeId}`}</p><p className="text-xs text-[var(--hr-muted)]">{row.employeeNumber || "—"}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(row.status)}`}>{statusLabel(row.status)}</span></div>
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--hr-muted)]"><span className="inline-flex items-center gap-1" dir="ltr"><CalendarDays size={14} />{dateRange(row)}</span><span>{row.stage === "manager" ? `${t("بانتظار", "Awaiting")} ${row.managerName || t("المدير", "manager")}` : row.stage === "hr" ? t("بانتظار الموارد البشرية", "Awaiting HR") : t("مغلق", "Closed")}</span></div>
    {row.reason && <p className="mt-2 line-clamp-2 text-sm text-[var(--hr-muted)]">{row.reason}</p>}
  </button>;
  const lastPage = Math.max(1, Math.ceil((list.data?.total || 0) / pageSize));
  return <div className="space-y-5">
    <header className="flex flex-col gap-4 border-b border-[var(--hr-line)]/40 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="mb-1 text-sm font-semibold text-[var(--hr-red)]">{t("مساحة العمل / الطلبات", "WORKSPACE / REQUESTS")}</p><h1 className="text-3xl font-bold tracking-tight">{t("مركز الطلبات", "Request center")}</h1><p className="mt-1 text-sm text-[var(--hr-muted)]">{t("متابعة سجلات الإجازات والاستئذانات الحالية؛ تُتخذ القرارات في مسار الطلب الأصلي.", "Track existing leave and permission records. Decisions stay in each request’s original workflow.")}</p></div>
      <div className="flex flex-col items-start gap-1 self-start sm:items-end sm:self-auto">
        <Button onClick={makeRequest} className="gap-2">
          {permissionListSelected ? <FileText size={17} /> : <Plus size={17} />}
          {permissionListSelected ? t("طلبات الاستئذان", "Permission requests") : t("طلب إجازة", "New leave")}
        </Button>
        {permissionListSelected && <span className="text-xs text-[var(--hr-muted)]">{t("يقدّم الموظف طلب الاستئذان من بوابته.", "Employees submit permission requests from their own portal.")}</span>}
      </div>
    </header>
    <section className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={t("ملخص الحالات", "Status summary")}>
      {[
        [t("بانتظار المراجعة", "Pending"), list.data?.counts.pending, "pending"],
        [t("معتمدة", "Approved"), list.data?.counts.approved, "approved"],
        [t("مرفوضة", "Rejected"), list.data?.counts.rejected, "rejected"],
        [t("توضيح مطلوب", "Clarification"), list.data?.counts.clarification, "clarification_requested"],
      ].map(([label, count, key]) => <button type="button" key={String(key)} onClick={() => setStatus(key as Status)} aria-pressed={status === key} className={`rounded-xl border p-3 text-start transition-colors ${status === key ? "border-[var(--hr-red)] bg-[var(--hr-soft)]" : "border-[var(--hr-line)]/35 bg-[var(--hr-ivory)]"}`}>
        <span className="block text-xs text-[var(--hr-muted)]">{label}</span><strong className="mt-1 block font-mono text-xl">{list.isLoading && !list.data ? "…" : count ?? "—"}</strong>
      </button>)}
    </section>
    <section className="space-y-3 rounded-2xl border border-[var(--hr-line)]/40 bg-[var(--hr-ivory)] p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]">
        <label className="relative"><span className="sr-only">{t("بحث", "Search")}</span><Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-[var(--hr-muted)]" /><Input className="ps-9" value={search} onChange={e => setSearch(e.target.value)} placeholder={t("ابحث بالموظف أو السبب أو الرقم", "Search employee, reason or ID")} /></label>
        <label className="space-y-1 text-xs text-[var(--hr-muted)]"><span>{t("نوع الطلب", "Request type")}</span><select value={kind} onChange={e => setKind(e.target.value as Kind)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"><option value="all">{t("كل الطلبات", "All requests")}</option><option value="leave">{t("الإجازات", "Leaves")}</option><option value="permission">{t("الاستئذانات", "Permissions")}</option></select></label>
        <label className="space-y-1 text-xs text-[var(--hr-muted)]"><span>{t("الحالة", "Status")}</span><select value={status} onChange={e => setStatus(e.target.value as Status)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"><option value="all">{t("كل الحالات", "All statuses")}</option><option value="pending">{t("قيد الانتظار", "Pending")}</option><option value="approved">{t("معتمد", "Approved")}</option><option value="rejected">{t("مرفوض", "Rejected")}</option><option value="clarification_requested">{t("توضيح مطلوب", "Clarification")}</option></select></label>
        <label className="space-y-1 text-xs text-[var(--hr-muted)]"><span>{t("من تاريخ", "From")}</span><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
        <label className="space-y-1 text-xs text-[var(--hr-muted)]"><span>{t("إلى تاريخ", "To")}</span><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
      </div>
    </section>
    {list.isLoading ? <div className="grid gap-3 sm:grid-cols-2">{[0,1,2,3].map(i => <div key={i} className="h-32 animate-pulse rounded-xl border bg-[var(--hr-soft)]" />)}</div>
      : list.isError ? <section role="alert" className="rounded-xl border border-[var(--hr-line)] bg-[var(--hr-ivory)] p-6"><p className="font-semibold">{t("تعذر تحميل الطلبات.", "Could not load requests.")}</p><p className="mt-1 text-sm text-[var(--hr-muted)]">{t("تحقق من الاتصال وحاول مرة أخرى.", "Check your connection and retry.")}</p><Button className="mt-4 gap-2" variant="outline" onClick={() => list.refetch()}><RefreshCw size={15} />{t("إعادة المحاولة", "Retry")}</Button></section>
      : !list.data?.items.length ? <section className="rounded-2xl border border-dashed border-[var(--hr-line)] bg-[var(--hr-ivory)] px-5 py-12 text-center"><FileText size={25} className="mx-auto text-[var(--hr-muted)]" /><h2 className="mt-3 font-bold">{t("لا توجد طلبات مطابقة", "No matching requests")}</h2><p className="mt-1 text-sm text-[var(--hr-muted)]">{t("جرّب تغيير عوامل التصفية أو ابدأ طلبًا من النموذج الحالي.", "Adjust your filters or start a request in its existing form.")}</p></section>
      : <>
        <div className="space-y-3 md:hidden">{list.data.items.map(requestCard)}</div>
        <div className="hidden overflow-x-auto rounded-xl border border-[var(--hr-line)]/45 bg-[var(--hr-ivory)] md:block"><table className="w-full min-w-[880px] text-sm">
          <thead className="bg-[var(--hr-soft)]/70"><tr>{[t("رقم الطلب", "Request"), t("الموظف", "Employee"), t("النوع", "Type"), t("الفترة", "Period"), t("الحالة", "Status"), t("المرحلة الحالية", "Current stage"), t("تاريخ الإرسال", "Submitted")].map(item => <th key={item} className="p-3 text-start font-semibold">{item}</th>)}</tr></thead>
          <tbody>{list.data.items.map(row => <tr key={`${row.kind}-${row.id}`} role="link" aria-label={`${t("فتح طلب", "Open request")} #${row.id}`} onClick={() => openRequest(row)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openRequest(row); } }} tabIndex={0} className="cursor-pointer border-t border-[var(--hr-line)]/30 hover:bg-[var(--hr-soft)]/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--hr-red)]">
            <td className="p-3 font-mono">#{row.id}</td><td className="p-3"><strong>{row.employeeName || `#${row.employeeId}`}</strong><small className="block text-[var(--hr-muted)]">{row.employeeNumber}</small></td><td className="p-3">{row.kind === "leave" ? t("إجازة", "Leave") : t("استئذان", "Permission")}</td><td className="p-3" dir="ltr">{dateRange(row)}</td><td className="p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(row.status)}`}>{statusLabel(row.status)}</span></td><td className="p-3">{row.stage === "manager" ? row.managerName || t("المدير المباشر", "Manager") : row.stage === "hr" ? t("الموارد البشرية", "HR") : t("مغلق", "Closed")}</td><td className="p-3" dir="ltr">{displayDate(row.createdAt)}</td>
          </tr>)}</tbody>
        </table></div>
      </>}
    <footer className="flex flex-col gap-3 rounded-xl border border-[var(--hr-line)]/35 bg-[var(--hr-ivory)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-[var(--hr-muted)]">{list.data ? t(`${list.data.total} سجلًا · صفحة ${page} من ${lastPage}`, `${list.data.total} records · Page ${page} of ${lastPage}`) : t("—", "—")}</p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1 || list.isFetching} onClick={() => setPage(p => Math.max(1, p - 1))}><ChevronLeft size={16} className={isRTL ? "" : "rotate-180"} />{t("السابق", "Previous")}</Button>
        <Button size="sm" variant="outline" disabled={page >= lastPage || list.isFetching} onClick={() => setPage(p => Math.min(lastPage, p + 1))}>{t("التالي", "Next")}<ChevronRight size={16} className={isRTL ? "" : "rotate-180"} /></Button>
      </div>
    </footer>
  </div>;
}
