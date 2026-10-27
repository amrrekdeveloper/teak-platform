import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { HrAlert, HrAlertsResponse } from "@shared/hr-alerts";
import { useLanguage } from "@/components/language-provider";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Bell, CalendarClock, Check, Clock3, Search, Settings2 } from "lucide-react";

const ALERTS_KEY = ["/api/hr/alerts"];
type StateAction = "read" | "unread" | "snooze" | "unsnooze";

export default function HrAlertsPage() {
  const { t, isRTL } = useLanguage();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [readFilter, setReadFilter] = useState("all");
  const [view, setView] = useState<"active" | "snoozed">("active");
  const [snoozeTarget, setSnoozeTarget] = useState<HrAlert | null>(null);
  const [snoozeDays, setSnoozeDays] = useState<1 | 3 | 7 | 14>(3);
  const [snoozeNote, setSnoozeNote] = useState("");
  const [leadDays, setLeadDays] = useState(30);
  const [requestSlaDays, setRequestSlaDays] = useState(7);
  const [settingsInitialized, setSettingsInitialized] = useState(false);
  const expectedUpdatedAt = useRef<string | null>(null);
  const query = useQuery<HrAlertsResponse>({
    queryKey: ALERTS_KEY,
    queryFn: async () => (await apiRequest("GET", "/api/hr/alerts")).json(),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const data = query.data;
  useEffect(() => {
    if (data && !settingsInitialized) {
      setLeadDays(data.settings.leadDays);
      setRequestSlaDays(data.settings.requestSlaDays);
      expectedUpdatedAt.current = data.settings.updatedAt;
      setSettingsInitialized(true);
    }
  }, [data, settingsInitialized]);
  const stateMutation = useMutation({
    mutationFn: ({ alert, action, days, note }: { alert: HrAlert; action: StateAction; days?: 1 | 3 | 7 | 14; note?: string }) =>
      apiRequest("PATCH", "/api/hr/alerts/state", { key: alert.key, action, ...(days ? { days } : {}), ...(note ? { note } : {}) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ALERTS_KEY }); setSnoozeTarget(null); setSnoozeNote(""); },
  });
  const settingsMutation = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/hr/alerts/settings", {
      leadDays, requestSlaDays, expectedUpdatedAt: expectedUpdatedAt.current,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ALERTS_KEY });
      const refreshed = await query.refetch();
      if (refreshed.data) {
        setLeadDays(refreshed.data.settings.leadDays);
        setRequestSlaDays(refreshed.data.settings.requestSlaDays);
        expectedUpdatedAt.current = refreshed.data.settings.updatedAt;
        setSettingsInitialized(true);
      }
    },
  });
  const activeItems = useMemo(() => (data?.items || []).filter(item => !item.snoozedUntil), [data?.items]);
  const snoozedItems = useMemo(() => (data?.items || []).filter(item => !!item.snoozedUntil), [data?.items]);
  const visible = useMemo(() => (view === "active" ? activeItems : snoozedItems).filter(item => {
    const text = `${item.employeeNameAr} ${item.employeeNameEn} ${item.employeeNumber} ${item.titleAr} ${item.titleEn} ${item.descriptionAr} ${item.descriptionEn}`.toLocaleLowerCase();
    return text.includes(search.toLocaleLowerCase()) &&
      (category === "all" || item.category === category) &&
      (severity === "all" || item.severity === severity) &&
      (readFilter === "all" || (readFilter === "read" ? !!item.readAt : !item.readAt)) &&
      (view === "snoozed" || category === "all" || item.category === category);
  }), [activeItems, snoozedItems, view, search, category, severity, readFilter]);
  const unreadCritical = (data?.items || []).filter(item => item.severity === "critical" && !item.readAt).length;
  const unreadCount = (data?.items || []).filter(item => !item.readAt).length;
  const categoryName = (value: HrAlert["category"]) => value === "compliance" ? t("الامتثال", "Compliance") : value === "requests" ? t("الطلبات", "Requests") : t("البيانات", "Data");
  const severityName = (value: HrAlert["severity"]) => value === "critical" ? t("حرج", "Critical") : value === "warning" ? t("تنبيه", "Warning") : t("معلومة", "Info");
  const relativeDue = (alert: HrAlert) => {
    const days=alert.daysRemaining;
    if(days==null)return alert.category==="data"?t("تحتاج مراجعة", "Needs review"):t("التاريخ غير معروف", "Date unknown");
    if(alert.kind==="leave_return")return days===0?t("موعد العودة اليوم","Return due today"):t(`العودة بعد ${days} يوم`,`Return in ${days} days`);
    if(alert.category==="requests")return days<0?t(`متأخر للمتابعة ${Math.abs(days)} يوم`,`Follow-up overdue by ${Math.abs(days)} days`):t("للمتابعة اليوم","Follow up today");
    return days<0?t(`منتهٍ منذ ${Math.abs(days)} يوم`,`Expired ${Math.abs(days)} days ago`):days===0?t("ينتهي اليوم","Due today"):t(`متبقي ${days} يوم`,`${days} days remaining`);
  };
  const employeeHref = (href: string) => href.startsWith("/hr/") ? href : `/hr${href.startsWith("/") ? href : `/${href}`}`;
  const label = (alert: HrAlert) => t(alert.employeeNameAr || alert.employeeNameEn, alert.employeeNameEn || alert.employeeNameAr);
  const title = (alert: HrAlert) => t(alert.titleAr, alert.titleEn);
  const description = (alert: HrAlert) => t(alert.descriptionAr, alert.descriptionEn);
  const filters = <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <div className="relative sm:col-span-2 xl:col-span-1"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="ps-9" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={t("ابحث بالموظف أو التنبيه", "Search employee or alert")} /></div>
    <select aria-label={t("الفئة", "Category")} className="h-10 rounded-md border bg-background px-3 text-sm" value={category} onChange={event => setCategory(event.target.value)}>
      <option value="all">{t("كل الفئات", "All categories")}</option><option value="compliance">{t("الامتثال", "Compliance")}</option><option value="requests">{t("الطلبات", "Requests")}</option><option value="data">{t("البيانات", "Data")}</option>
    </select>
    <select aria-label={t("الأهمية", "Severity")} className="h-10 rounded-md border bg-background px-3 text-sm" value={severity} onChange={event => setSeverity(event.target.value)}>
      <option value="all">{t("كل مستويات الأهمية", "All severities")}</option><option value="critical">{t("حرج", "Critical")}</option><option value="warning">{t("تنبيه", "Warning")}</option><option value="info">{t("معلومة", "Info")}</option>
    </select>
    <select aria-label={t("حالة القراءة", "Read status")} className="h-10 rounded-md border bg-background px-3 text-sm" value={readFilter} onChange={event => setReadFilter(event.target.value)}>
      <option value="all">{t("مقروء وغير مقروء", "Read and unread")}</option><option value="unread">{t("غير مقروء", "Unread")}</option><option value="read">{t("مقروء", "Read")}</option>
    </select>
    <div className="flex rounded-md border p-1" role="group" aria-label={t("عرض التنبيهات", "Alert view")}>
      <button className={`min-h-8 flex-1 rounded px-2 text-sm ${view === "active" ? "bg-primary text-primary-foreground" : ""}`} aria-pressed={view === "active"} onClick={() => setView("active")}>{t("النشطة", "Active")} <span className="ms-1 opacity-75">{activeItems.length}</span></button>
      <button className={`min-h-8 flex-1 rounded px-2 text-sm ${view === "snoozed" ? "bg-primary text-primary-foreground" : ""}`} aria-pressed={view === "snoozed"} onClick={() => setView("snoozed")}>{t("مؤجلة", "Snoozed")} <span className="ms-1 opacity-75">{snoozedItems.length}</span></button>
    </div>
  </div>;
  const alertActions = (alert: HrAlert) => <div className="flex flex-wrap gap-2">
    <a className="inline-flex min-h-9 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted" href={employeeHref(alert.href)}>{t("فتح ملف الموظف", "Open employee")}</a>
    <Button size="sm" variant="outline" disabled={stateMutation.isPending} onClick={() => stateMutation.mutate({ alert, action: view === "snoozed" ? "unsnooze" : alert.readAt ? "unread" : "read" })}>
      {view === "snoozed" ? t("إلغاء التأجيل", "Unsnooze") : alert.readAt ? t("تحديد كغير مقروء", "Mark unread") : t("تحديد كمقروء", "Mark read")}
    </Button>
    {view === "active" && <Button size="sm" variant="outline" disabled={stateMutation.isPending} onClick={() => { setSnoozeTarget(alert); setSnoozeNote(""); }}>{t("تأجيل شخصي", "Snooze personally")}</Button>}
  </div>;
  const alertCard = (alert: HrAlert) => <article key={alert.key} className={`rounded-xl border bg-card p-4 shadow-sm ${alert.severity === "critical" ? "border-s-4 border-s-destructive" : ""}`}>
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0"><p className="break-words font-semibold">{title(alert)}</p><p className="mt-1 text-sm text-muted-foreground">{label(alert)} · {alert.employeeNumber}</p></div>
      <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${alert.severity === "critical" ? "bg-destructive/10 text-destructive" : alert.severity === "warning" ? "bg-amber-100 text-amber-900" : "bg-muted text-muted-foreground"}`}>{severityName(alert.severity)}</span>
    </div>
    <p className="mt-3 break-words text-sm leading-relaxed">{description(alert)}</p>
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span className="rounded-full bg-muted px-2 py-1">{categoryName(alert.category)}</span>
      <span className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />{relativeDue(alert)}{alert.dueDate ? ` · ${alert.dueDate}` : ""}</span>
      {!alert.dueDate && <span>{t("غياب التاريخ يعني أن الحالة غير معروفة، وليس أنها منتهية.", "A missing date means unknown, not expired.")}</span>}
      {alert.snoozedUntil && <span>{t("تأجيل شخصي حتى", "Personally snoozed until")} {alert.snoozedUntil}</span>}
      {!alert.readAt && <span className="font-semibold text-primary">{t("غير مقروء", "Unread")}</span>}
    </div>
    {alert.severity === "critical" && alert.daysRemaining != null && alert.daysRemaining < 0 && alert.snoozedUntil && <p className="mt-2 text-xs font-medium text-destructive">{t("التأجيل لا يحل المشكلة؛ التنبيه ما زال منتهيًا.", "Snoozing does not resolve this item; it remains expired.")}</p>}
    <div className="mt-4 flex flex-wrap gap-2">{alertActions(alert)}</div>
  </article>;

  return <div className="space-y-5">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground"><Bell className="h-4 w-4" />{t("متابعة الموارد البشرية", "HR monitoring")}</div><h1 className="text-2xl font-bold">{t("التنبيهات", "Alerts")}</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("تنبيهات تشغيلية من بيانات الموظفين والطلبات. تُغلق تلقائياً عند تصحيح المصدر، ولا يحل التأجيل محل المعالجة.", "Actionable alerts from employee and request records. They clear when the source is corrected; snoozing is not resolution.")}</p></div>
      <div className="flex flex-wrap gap-2 text-sm"><span className="rounded-lg border bg-card px-3 py-2">{t("غير مقروء", "Unread")} <strong className="ms-1">{unreadCount}</strong></span><span className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-destructive">{t("حرج غير مقروء", "Critical unread")} <strong className="ms-1">{unreadCritical}</strong></span></div>
    </header>
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center gap-2 font-semibold"><Settings2 className="h-4 w-4" />{t("سياسة التنبيه المشتركة", "Shared alert settings")}</div>
      <p className="mb-4 text-sm text-muted-foreground">{t("تحدد هذه الحدود متى تظهر تنبيهات الاستحقاق والطلبات لجميع فريق الموارد البشرية.", "These shared thresholds control when compliance and request alerts appear for HR.")}</p>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-1"><Label htmlFor="lead-days">{t("التنبيه قبل الاستحقاق (٧–١٨٠ يوماً)", "Lead time (7–180 days)")}</Label><Input id="lead-days" type="number" min={7} max={180} value={leadDays} onChange={event => setLeadDays(Number(event.target.value))} /></div>
        <div className="space-y-1"><Label htmlFor="sla-days">{t("مهلة الطلب (١–٣٠ يوماً)", "Request SLA (1–30 days)")}</Label><Input id="sla-days" type="number" min={1} max={30} value={requestSlaDays} onChange={event => setRequestSlaDays(Number(event.target.value))} /></div>
        <Button disabled={!data || settingsMutation.isPending || leadDays < 7 || leadDays > 180 || requestSlaDays < 1 || requestSlaDays > 30} onClick={() => data && settingsMutation.mutate()}>
          {settingsMutation.isPending ? t("جارٍ الحفظ…", "Saving…") : t("حفظ الإعدادات", "Save settings")}
        </Button>
      </div>
      {settingsMutation.isError && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-50 p-3 text-sm text-amber-950" role="alert"><span>{t("تعذر حفظ الإعدادات. قد تكون تغيّرت لدى مستخدم آخر؛ أعد تحميل القيم قبل المحاولة.", "Settings could not be saved. They may have changed elsewhere; reload before retrying.")}</span><Button size="sm" variant="outline" onClick={async () => { const refreshed = await query.refetch(); if (refreshed.data) { setLeadDays(refreshed.data.settings.leadDays); setRequestSlaDays(refreshed.data.settings.requestSlaDays); expectedUpdatedAt.current = refreshed.data.settings.updatedAt; setSettingsInitialized(true); } }}>{t("إعادة تحميل", "Reload")}</Button></div>}
    </section>
    <section className="space-y-4">
      {filters}
      {stateMutation.isError && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive" role="alert"><span>{t("تعذر تحديث حالة التنبيه. لم يتغير سجل المصدر؛ أعد المحاولة.", "The alert state could not be updated. The source record was not changed; try again.")}</span><Button size="sm" variant="outline" onClick={() => stateMutation.reset()}>{t("إغلاق", "Dismiss")}</Button></div>}
      {query.isLoading ? <div className="space-y-3" aria-label={t("جارٍ تحميل التنبيهات", "Loading alerts")}><div className="h-28 animate-pulse rounded-xl bg-muted" /><div className="h-28 animate-pulse rounded-xl bg-muted" /></div>
        : query.isError ? <div className="rounded-xl border border-destructive/30 p-5" role="alert"><p className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{t("تعذر تحميل التنبيهات.", "Could not load alerts.")}</p><Button className="mt-3" size="sm" variant="outline" onClick={() => query.refetch()}>{t("إعادة المحاولة", "Retry")}</Button></div>
        : visible.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center"><Check className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-2 font-semibold">{t(view === "active" ? "لا توجد تنبيهات مطابقة" : "لا توجد تنبيهات مؤجلة", view === "active" ? "No matching alerts" : "No snoozed alerts")}</p><p className="mt-1 text-sm text-muted-foreground">{t("غيّر عوامل التصفية أو راجع بيانات المصدر عند الحاجة.", "Adjust the filters or review source records if needed.")}</p></div>
        : <><div className="space-y-3 md:hidden">{visible.map(alertCard)}</div><div className="hidden overflow-x-auto rounded-xl border md:block"><table className="w-full min-w-[920px] text-sm"><thead className="bg-muted/50"><tr>{[t("التنبيه", "Alert"), t("الموظف", "Employee"), t("الفئة", "Category"), t("الأهمية", "Severity"), t("الاستحقاق", "Due"), t("الحالة", "State"), t("الإجراءات", "Actions")].map(item => <th key={item} className="p-3 text-start">{item}</th>)}</tr></thead><tbody>{visible.map(alert => <tr key={alert.key} className="border-t align-top"><td className="max-w-xs p-3"><strong>{title(alert)}</strong><p className="mt-1 whitespace-normal text-xs text-muted-foreground">{description(alert)}</p></td><td className="p-3"><a className="font-medium underline-offset-4 hover:underline" href={employeeHref(alert.href)}>{label(alert)}</a><p className="text-xs text-muted-foreground">{alert.employeeNumber}</p></td><td className="p-3">{categoryName(alert.category)}</td><td className="p-3">{severityName(alert.severity)}</td><td className="p-3 whitespace-nowrap">{relativeDue(alert)}{alert.dueDate && <div className="text-xs text-muted-foreground" dir="ltr">{alert.dueDate}</div>}</td><td className="p-3">{alert.snoozedUntil ? t("مؤجل شخصياً", "Personally snoozed") : alert.readAt ? t("مقروء", "Read") : t("غير مقروء", "Unread")}</td><td className="p-3"><div className="flex max-w-64 flex-wrap gap-1">{alertActions(alert)}</div></td></tr>)}</tbody></table></div></>}
    </section>
    <Dialog open={!!snoozeTarget} onOpenChange={open => { if (!open && !stateMutation.isPending) setSnoozeTarget(null); }}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
        <DialogHeader><DialogTitle>{t("تأجيل شخصي للتنبيه", "Personally snooze alert")}</DialogTitle><DialogDescription>{t("سيظل التنبيه قائماً؛ سيختفي مؤقتاً من العرض النشط فقط. اكتب سبباً من ٣ أحرف على الأقل.", "The alert remains open and is only hidden temporarily from active view. Enter a note of at least 3 characters.")}</DialogDescription></DialogHeader>
        {snoozeTarget && <>
        <p className="mt-3 font-medium">{title(snoozeTarget)}</p>
        <div className="mt-4 space-y-2"><Label>{t("مدة التأجيل", "Snooze duration")}</Label><div className="grid grid-cols-4 gap-2">{([1, 3, 7, 14] as const).map(days => <button key={days} className={`min-h-10 rounded-md border text-sm ${snoozeDays === days ? "border-primary bg-primary/10 font-semibold" : ""}`} aria-pressed={snoozeDays === days} onClick={() => setSnoozeDays(days)}>{days} {t("يوم", "days")}</button>)}</div><Label htmlFor="snooze-note">{t("السبب", "Reason")}</Label><textarea id="snooze-note" className="min-h-24 w-full rounded-md border bg-background p-3 text-sm" value={snoozeNote} onChange={event => setSnoozeNote(event.target.value)} maxLength={500} /></div>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row"><Button variant="outline" disabled={stateMutation.isPending} onClick={() => setSnoozeTarget(null)}>{t("إلغاء", "Cancel")}</Button><Button disabled={stateMutation.isPending || snoozeNote.trim().length < 3} onClick={() => stateMutation.mutate({ alert: snoozeTarget, action: "snooze", days: snoozeDays, note: snoozeNote.trim() })}>{stateMutation.isPending ? t("جارٍ الحفظ…", "Saving…") : t("تأكيد التأجيل", "Confirm snooze")}</Button></DialogFooter>
        </>}
      </DialogContent>
    </Dialog>
    {data && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />{t("آخر تحديث", "Updated")} <time dateTime={data.generatedAt}>{new Date(data.generatedAt).toLocaleString(isRTL ? "ar-SA" : "en-GB")}</time></p>}
  </div>;
}
