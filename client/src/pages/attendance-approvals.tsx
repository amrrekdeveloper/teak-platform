import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useLanguage } from "@/components/language-provider";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertCircle, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, FileText, LoaderCircle, Paperclip, Search, X } from "lucide-react";

type Status = "pending" | "approved" | "rejected" | "all";
type ApprovalItem = {
  id: number; employeeId: number; employeeName: string; employeeNumber: string;
  businessDay: string; shiftKey: string; reason: string; status: Exclude<Status, "all">;
  reviewNote: string | null; createdAt: string; hasAttachment: boolean;
  reviewedAt: string | null; reviewerName: string | null;
};
type ReviewItem = ApprovalItem & {
  review: {
    canApprove: boolean; waitingForPeriodEnd: boolean; periodEnded: boolean;
    scheduleVerified: boolean; shiftLabel: string; status: string;
    checkIn: string | null; checkOut: string | null; lateMinutes: number | null;
    earlyDepartureMinutes: number | null; outOfZone: boolean; warning: string | null; warningEn?: string | null;
  };
};
type ApprovalResponse = {
  items: ApprovalItem[]; total: number; page: number; pageSize: number;
  counts: { pending: number; approved: number; rejected: number }; asOf: string;
};

function dateLabel(value: string, lang: string) {
  const parsed = new Date(value);
  return Number.isNaN(+parsed) ? value : new Intl.DateTimeFormat(lang === "ar" ? "ar-SA" : "en-GB", {
    calendar: "gregory", dateStyle: "medium", timeZone: "Asia/Riyadh",
  }).format(parsed);
}
function timeLabel(value: string | null, lang: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(+date) ? value : new Intl.DateTimeFormat(lang === "ar" ? "ar-SA" : "en-GB", {
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh",
  }).format(date);
}
function dateTimeLabel(value: string, lang: string) {
  const date = new Date(value);
  return Number.isNaN(+date) ? value : new Intl.DateTimeFormat(lang === "ar" ? "ar-SA" : "en-GB", {
    calendar: "gregory", dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh",
  }).format(date);
}
function attendanceStateLabel(status: string, t: (ar: string, en: string) => string) {
  const labels: Record<string, [string, string]> = {
    unverified_schedule: ["جدول غير موثق", "Schedule unverified"],
    absent: ["غياب", "Absent"],
    missing_checkin: ["نقص تسجيل الدخول", "Missing check-in"],
    missing_checkout: ["نقص تسجيل الخروج", "Missing check-out"],
    late: ["تأخر", "Late"],
    present: ["حضور", "Present"],
    excused: ["معذور", "Excused"],
    pending: ["قيد المراجعة", "Pending"],
    approved_leave: ["إجازة معتمدة", "Approved leave"],
    rest_day: ["يوم راحة", "Rest day"],
    not_started: ["لم يبدأ", "Not started"],
  };
  const label = labels[status];
  return label ? t(label[0], label[1]) : status || "—";
}

export default function AttendanceApprovalsPage() {
  const { t, lang, isRTL } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<Status>("pending");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const pageSize = 25;
  const params = useMemo(() => {
    const value = new URLSearchParams({ status, page: String(page), pageSize: String(pageSize) });
    if (search.trim()) value.set("search", search.trim());
    if (from) value.set("from", from);
    if (to) value.set("to", to);
    return value.toString();
  }, [status, page, search, from, to]);
  const queue = useQuery<ApprovalResponse>({
    refetchInterval: 30_000,
    queryKey: ["/api/attendance/approvals", params],
    queryFn: async () => {
      const response = await fetch(`/api/attendance/approvals?${params}`, { credentials: "include" });
      if (!response.ok) throw new Error(t("تعذر تحميل طلبات التوضيح.", "Could not load attendance explanations."));
      return response.json();
    },
  });
  const reviewQuery = useQuery<ReviewItem>({
    refetchInterval: selectedId !== null ? 30_000 : false,
    queryKey: ["/api/attendance/corrections", selectedId, "review"],
    enabled: selectedId !== null,
    queryFn: async () => {
      const response = await fetch(`/api/attendance/corrections/${selectedId}/review`, { credentials: "include" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || t("تعذر تحميل تفاصيل الطلب.", "Could not load request details."));
      return body;
    },
  });
  const closeReview = () => { setSelectedId(null); setDecision(null); setNote(""); setConfirmed(false); };
  const mutation = useMutation({
    mutationFn: async () => {
      if (selectedId === null || !decision) throw new Error("No decision selected");
      return apiRequest("POST", `/api/attendance/corrections/${selectedId}/decision`, { decision, note: note.trim() });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/attendance/approvals"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/attendance/corrections"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/attendance/monitor"] }),
        queryClient.invalidateQueries({ queryKey: ["attendance-shift-monitor"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/attendance/risk-scores"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/hr/reports"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/hr/alerts"] }),
      ]);
      toast({ title: t("تم حفظ القرار وتحديث السجل.", "Decision saved and records refreshed.") });
      closeReview();
    },
    onError: async (error: Error) => {
      const conflict = /409|conflict|تغير|تحديث/i.test(error.message);
      toast({ title: conflict ? t("تم تحديث الطلب من مستخدم آخر. أُعيد تحميل القائمة؛ راجع الحالة الحالية.", "This request changed elsewhere. The queue has been refreshed; review its current status.") : (error.message || t("تعذر حفظ القرار.", "Could not save the decision.")), variant: "destructive" });
      if (conflict) {
        await queryClient.invalidateQueries({ queryKey: ["/api/attendance/approvals"] });
        await reviewQuery.refetch();
      }
    },
  });
  const data = queue.data;
  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / pageSize));
  const labels: Record<Status, string> = {
    pending: t("قيد المراجعة", "Pending"),
    approved: t("مقبول", "Approved"),
    rejected: t("مرفوض", "Rejected"),
    all: t("الكل", "All"),
  };
  const beginDecision = (value: "approved" | "rejected") => {
    setDecision(value);
    setConfirmed(false);
  };
  const submitDecision = () => {
    if (!decision || note.trim().length < 3) return;
    if (decision === "approved" && !reviewQuery.data?.review.canApprove) return;
    if (!confirmed) return;
    mutation.mutate();
  };

  return <div className="mx-auto max-w-6xl space-y-5" dir={isRTL ? "rtl" : "ltr"}>
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-4 w-4" />{t("الحضور والانصراف", "Attendance")}</div>
        <h1 className="text-2xl font-bold tracking-tight">{t("مراجعة أعذار نقص الدوام", "Attendance explanations")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("راجع توضيح الموظف والأدلة قبل تسجيل قرار. لا يغيّر الاعتماد بصمات الحضور الأصلية.", "Review the employee’s explanation and evidence before deciding. Approval never changes original punches.")}</p>
      </div>
      <Button variant="outline" onClick={() => setLocation("/attendance-monitor")}><ChevronRight className="me-2 h-4 w-4" />{t("مراقبة الدوام", "Daily monitoring")}</Button>
    </header>

    <div className="grid grid-cols-3 gap-2 md:gap-3">
      {(["pending", "approved", "rejected"] as const).map((key, index) => {
        const count = data?.counts[key];
        return <button key={key} type="button" onClick={() => { setStatus(key); setPage(1); }}
          className={`rounded-xl border p-3 text-start transition-colors md:px-5 md:py-4 ${status === key ? "border-primary/50 bg-primary/[0.06]" : "bg-card hover:bg-muted/40"}`}>
          <span className="block text-[11px] text-muted-foreground md:text-sm">{labels[key]}</span>
          <span className="mt-1 block font-mono text-xl font-semibold tabular-nums md:text-2xl">{count === undefined ? <span className="inline-block h-6 w-10 animate-pulse rounded bg-muted" /> : count.toLocaleString(lang === "ar" ? "ar-SA" : "en-US")}</span>
          <span className="sr-only">{index === 0 ? t("الطلبات الحالية", "Current requests") : ""}</span>
        </button>;
      })}
    </div>

    <Card>
      <CardContent className="grid gap-3 p-3 md:grid-cols-[minmax(200px,1fr)_auto_auto_auto] md:items-end md:p-4">
        <div className="space-y-1.5"><Label htmlFor="approval-search">{t("بحث", "Search")}</Label><div className="relative"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="approval-search" className="ps-9" value={search} placeholder={t("الاسم أو الرقم الوظيفي", "Name or employee number")} onChange={event => { setSearch(event.target.value); setPage(1); }} /></div></div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5"><Label htmlFor="approval-from">{t("من", "From")}</Label><Input id="approval-from" type="date" value={from} onChange={event => { setFrom(event.target.value); setPage(1); }} /></div>
          <div className="space-y-1.5"><Label htmlFor="approval-to">{t("إلى", "To")}</Label><Input id="approval-to" type="date" value={to} onChange={event => { setTo(event.target.value); setPage(1); }} /></div>
        </div>
        <div className="flex flex-wrap gap-1.5 md:justify-end">{(["pending", "approved", "rejected", "all"] as Status[]).map(key =>
          <Button key={key} size="sm" variant={status === key ? "default" : "outline"} onClick={() => { setStatus(key); setPage(1); }}>{labels[key]}</Button>)}</div>
        <p className="text-xs text-muted-foreground md:text-end">{data ? t(`${data.total} طلب`, `${data.total} requests`) : t("جارٍ تحديث النتائج", "Updating results")}</p>
      </CardContent>
    </Card>

    {queue.isLoading ? <div className="space-y-3" aria-label={t("جارٍ تحميل الطلبات", "Loading requests")}><div className="h-20 animate-pulse rounded-xl bg-muted" /><div className="h-20 animate-pulse rounded-xl bg-muted" /><div className="h-20 animate-pulse rounded-xl bg-muted" /></div>
      : queue.isError ? <Card><CardContent className="flex flex-col items-center gap-3 p-10 text-center"><AlertCircle className="h-8 w-8 text-destructive" /><p className="text-sm text-muted-foreground">{t("تعذر تحميل القائمة. تحقق من الاتصال ثم أعد المحاولة.", "The list could not be loaded. Check your connection and retry.")}</p><Button variant="outline" onClick={() => queue.refetch()}>{t("إعادة المحاولة", "Retry")}</Button></CardContent></Card>
      : data?.items.length ? <>
        <div className="space-y-2 md:hidden">
          {data.items.map(item => <ApprovalCard key={item.id} item={item} statusLabel={labels[item.status]} lang={lang} onReview={() => setSelectedId(item.id)} />)}
        </div>
        <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
          <table className="w-full text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr>
            {[t("الموظف", "Employee"), t("تاريخ الدوام", "Work date"), t("الوردية", "Shift"), t("التوضيح", "Explanation"), t("الحالة", "Status"), t("الإجراء", "Action")].map(label => <th key={label} className="p-3 text-start font-medium">{label}</th>)}
          </tr></thead><tbody>{data.items.map(item => <tr key={item.id} className="border-t">
            <td className="p-3"><strong className="block">{item.employeeName}</strong><span className="text-xs text-muted-foreground">{item.employeeNumber}</span></td>
            <td className="p-3 tabular-nums">{dateLabel(item.businessDay, lang)}</td><td className="p-3">{item.shiftKey || "—"}</td>
            <td className="max-w-xs p-3"><span className="line-clamp-2">{item.reason}</span>{item.hasAttachment && <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Paperclip className="h-3 w-3" />{t("مرفق", "Attachment")}</span>}</td>
            <td className="p-3"><StatusBadge status={item.status} label={labels[item.status]} /></td>
            <td className="p-3"><Button size="sm" variant="outline" onClick={() => setSelectedId(item.id)}>{t("مراجعة", "Review")}<ChevronLeft className="ms-1 h-4 w-4" /></Button></td>
          </tr>)}</tbody></table>
        </div>
      </> : <Card><CardContent className="flex flex-col items-center gap-2 p-10 text-center"><FileText className="h-9 w-9 text-muted-foreground/50" /><h2 className="font-semibold">{t("لا توجد طلبات هنا", "Nothing to review here")}</h2><p className="text-sm text-muted-foreground">{t("جرّب حالة أخرى أو عدّل نطاق البحث.", "Try another status or adjust your search.")}</p></CardContent></Card>}

    {!queue.isLoading && !queue.isError && (data?.total || 0) > 0 && <div className="flex items-center justify-between gap-3 border-t pt-3">
      <span className="text-xs text-muted-foreground">{t(`صفحة ${page} من ${totalPages}`, `Page ${page} of ${totalPages}`)}</span>
      <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(value => value - 1)}><ChevronRight className="h-4 w-4" />{t("السابق", "Previous")}</Button><Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(value => value + 1)}>{t("التالي", "Next")}<ChevronLeft className="h-4 w-4" /></Button></div>
    </div>}

    <Dialog open={selectedId !== null} onOpenChange={open => { if (!open && !mutation.isPending) closeReview(); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{t("مراجعة التوضيح والأدلة", "Review explanation & evidence")}</DialogTitle></DialogHeader>
        {reviewQuery.isLoading ? <div className="space-y-3 py-5"><div className="h-8 animate-pulse rounded bg-muted" /><div className="h-24 animate-pulse rounded bg-muted" /></div>
          : reviewQuery.isError ? <div className="space-y-3 py-4 text-sm text-destructive"><p>{(reviewQuery.error as Error).message}</p><Button variant="outline" onClick={() => reviewQuery.refetch()}>{t("إعادة المحاولة", "Retry")}</Button></div>
          : reviewQuery.data ? <div className="space-y-4">
            <div className="rounded-lg border bg-muted/20 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{reviewQuery.data.employeeName}</p><p className="text-xs text-muted-foreground">{reviewQuery.data.employeeNumber} · {dateLabel(reviewQuery.data.businessDay, lang)} · {reviewQuery.data.review.shiftLabel || reviewQuery.data.shiftKey}</p></div><StatusBadge status={reviewQuery.data.status} label={labels[reviewQuery.data.status as Status] || reviewQuery.data.status} /></div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{reviewQuery.data.reason}</p>
              {reviewQuery.data.hasAttachment && <a className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary underline underline-offset-4" href={`/api/attendance/corrections/${reviewQuery.data.id}/attachment`} target="_blank" rel="noreferrer"><Paperclip className="h-4 w-4" />{t("فتح المرفق", "Open attachment")}</a>}
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm min-[480px]:grid-cols-3">
              <Evidence label={t("الدخول", "Check-in")} value={timeLabel(reviewQuery.data.review.checkIn, lang)} />
              <Evidence label={t("الخروج", "Check-out")} value={timeLabel(reviewQuery.data.review.checkOut, lang)} />
              <Evidence label={t("تأخر", "Late")} value={reviewQuery.data.review.lateMinutes == null ? "—" : `${reviewQuery.data.review.lateMinutes} ${t("د", "min")}`} />
              <Evidence label={t("مغادرة مبكرة", "Early departure")} value={reviewQuery.data.review.earlyDepartureMinutes == null ? "—" : `${reviewQuery.data.review.earlyDepartureMinutes} ${t("د", "min")}`} />
              <Evidence label={t("الجدول", "Schedule")} value={reviewQuery.data.review.scheduleVerified ? t("موثق", "Verified") : t("غير موثق", "Unverified")} />
              <Evidence label={t("حالة الدوام", "Attendance status")} value={attendanceStateLabel(reviewQuery.data.review.status, t)} />
              <Evidence label={t("خارج النطاق", "Out of zone")} value={reviewQuery.data.review.outOfZone ? t("نعم", "Yes") : t("لا", "No")} />
            </div>
            {(lang === "ar" ? reviewQuery.data.review.warning : (reviewQuery.data.review.warningEn || reviewQuery.data.review.warning)) && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">{lang === "ar" ? reviewQuery.data.review.warning : (reviewQuery.data.review.warningEn || reviewQuery.data.review.warning)}</p>}
            {(reviewQuery.data.reviewNote || reviewQuery.data.reviewerName || reviewQuery.data.reviewedAt) && <div className="rounded-lg border p-3 text-sm"><p className="font-medium">{t("سجل المراجعة", "Review history")}</p><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{reviewQuery.data.reviewNote || t("لا توجد ملاحظة مسجلة.", "No decision note was recorded.")}</p><p className="mt-2 text-xs text-muted-foreground">{reviewQuery.data.reviewerName || "—"} · {reviewQuery.data.reviewedAt ? dateTimeLabel(reviewQuery.data.reviewedAt, lang) : "—"}</p></div>}
            {reviewQuery.data.status === "pending" && <>
              {!decision ? <div className="flex flex-wrap gap-2"><Button onClick={() => beginDecision("approved")} disabled={!reviewQuery.data.review.canApprove}><Check className="me-2 h-4 w-4" />{t("قبول التوضيح", "Accept explanation")}</Button><Button variant="destructive" onClick={() => beginDecision("rejected")}><X className="me-2 h-4 w-4" />{t("رفض التوضيح", "Reject explanation")}</Button></div>
                : <div className="space-y-3 rounded-lg border p-3">
                  <p className="text-sm font-semibold">{decision === "approved" ? t("تأكيد قبول التوضيح", "Confirm acceptance") : t("تأكيد رفض التوضيح", "Confirm rejection")}</p>
                  {decision === "rejected" && <p className="text-xs leading-5 text-muted-foreground">{t("سيبقى نقص الدوام والبصمات كما هي؛ الرفض لا يعدّل السجل الأصلي.", "The deficiency and punches remain unchanged; rejection does not edit original records.")}</p>}
                  <div className="space-y-1.5"><Label htmlFor="approval-note">{t("ملاحظة القرار (٣ أحرف على الأقل)", "Decision note (at least 3 characters)")}</Label><Textarea id="approval-note" value={note} onChange={event => setNote(event.target.value)} rows={3} maxLength={1000} placeholder={t("اكتب سبب القرار", "Record the reason for your decision")} /></div>
                  <label className="flex items-start gap-2 text-sm leading-5"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1 accent-primary" />{decision === "approved" ? t("أؤكد مراجعة الأدلة، وأفهم أن القبول لا يغيّر البصمات الأصلية.", "I have reviewed the evidence and understand acceptance does not alter original punches.") : t("أؤكد مراجعة الأدلة، وأفهم أن الرفض يُبقي النقص والبصمات كما هي.", "I have reviewed the evidence and understand rejection leaves the deficiency and punches unchanged.")}</label>
                  <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => setDecision(null)} disabled={mutation.isPending}>{t("رجوع", "Back")}</Button><Button variant={decision === "rejected" ? "destructive" : "default"} disabled={mutation.isPending || note.trim().length < 3 || !confirmed || (decision === "approved" && !reviewQuery.data.review.canApprove)} onClick={submitDecision}>{mutation.isPending && <LoaderCircle className="me-2 h-4 w-4 animate-spin" />}{t("تسجيل القرار", "Record decision")}</Button></div>
                </div>}
            </>}
          </div> : null}
      </DialogContent>
    </Dialog>
  </div>;
}

function Evidence({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-lg border p-2.5"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-words font-medium tabular-nums">{value}</p></div>;
}
function StatusBadge({ status, label }: { status: string; label: string }) {
  const style = status === "approved" ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
    : status === "rejected" ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
      : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
  return <Badge variant="outline" className={style}>{label}</Badge>;
}
function ApprovalCard({ item, statusLabel, lang, onReview }: { item: ApprovalItem; statusLabel: string; lang: string; onReview: () => void }) {
  return <article className="rounded-xl border bg-card p-3.5">
    <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h2 className="break-words font-semibold">{item.employeeName}</h2><p className="text-xs text-muted-foreground">{item.employeeNumber}</p></div><StatusBadge status={item.status} label={statusLabel} /></div>
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{dateLabel(item.businessDay, lang)}</span><span>{item.shiftKey || "—"}</span>{item.hasAttachment && <span className="inline-flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" />{lang === "ar" ? "مرفق" : "Attachment"}</span>}</div>
    <p className="mt-3 line-clamp-3 text-sm leading-6">{item.reason}</p>
    <Button className="mt-3 w-full" variant="outline" onClick={onReview}>{lang === "ar" ? "مراجعة التفاصيل" : "Review details"}<ChevronLeft className="ms-1 h-4 w-4" /></Button>
  </article>;
}
