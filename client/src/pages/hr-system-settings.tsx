import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useLanguage } from "@/components/language-provider";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowUpLeft, CalendarDays, Clock3, KeyRound, LoaderCircle, Settings2, ShieldCheck, UsersRound } from "lucide-react";
import { useState } from "react";

type RoutingItem = { kind: "leave" | "permission"; managerReview: boolean; requireManager: boolean; version: number; updatedAt: string | null };
type RoutingResponse = { items: RoutingItem[] };
const routingKey = ["/api/hr/request-settings"];

const destinations = [
  { href: "/attendance-settings", icon: CalendarDays, ar: "أيام العمل والدوام", en: "Workdays & attendance" },
  { href: "/attendance-monitor?tab=zones", icon: Clock3, ar: "نطاقات الحضور", en: "Attendance zones" },
  { href: "/attendance-monitor?tab=work-settings", icon: Settings2, ar: "قواعد الدوام", en: "Work settings" },
  { href: "/attendance-monitor?tab=assignments", icon: UsersRound, ar: "إسناد الموظفين", en: "Employee assignments" },
  { href: "/access", icon: KeyRound, ar: "الحسابات والصلاحيات", en: "Accounts & access" },
  { href: "/actions", icon: ShieldCheck, ar: "إجراءات الموارد البشرية", en: "HR actions" },
];

export default function HrSystemSettingsPage() {
  const { t, isRTL } = useLanguage();
  const [saveError, setSaveError] = useState("");
  const routing = useQuery<RoutingResponse>({
    queryKey: routingKey,
    queryFn: async () => {
      const response = await fetch("/api/hr/request-settings", { credentials: "include" });
      if (!response.ok) throw new Error("settings");
      return response.json();
    },
    staleTime: 30_000,
  });
  const update = useMutation({
    mutationFn: async (item: RoutingItem) => {
      const response = await apiRequest("PUT", `/api/hr/request-settings/${item.kind}`, {
        managerReview: item.managerReview, requireManager: item.requireManager, version: item.version,
      });
      return response.json() as Promise<RoutingItem>;
    },
    onSuccess: updated => {
      setSaveError("");
      queryClient.setQueryData<RoutingResponse>(routingKey, old => old ? {
        ...old, items: old.items.map(item => item.kind === updated.kind ? updated : item),
      } : { items: [updated] });
    },
    onError: async (error: Error) => {
      if (error.message.includes("409")) {
        setSaveError(t("تم تعديل الإعداد في جلسة أخرى. أعد تحميل الإعدادات قبل المحاولة.", "Settings changed elsewhere. Reload the latest version before trying again."));
        await queryClient.invalidateQueries({ queryKey: routingKey });
      } else setSaveError(t("تعذر حفظ المسار. لم يتغير الإعداد المحفوظ.", "Could not save routing. The saved setting was not changed."));
    },
  });
  const change = (item: RoutingItem, managerReview: boolean, requireManager = managerReview) => {
    setSaveError("");
    update.mutate({ ...item, managerReview, requireManager });
  };
  const kindLabel = (kind: RoutingItem["kind"]) => kind === "leave" ? t("الإجازات", "Leave") : t("الاستئذانات", "Permissions");
  const routingItem = (kind: RoutingItem["kind"]) => routing.data?.items.find(item => item.kind === kind);
  return <div className="space-y-6">
    <header className="border-b border-[var(--hr-line)]/40 pb-5">
      <p className="mb-1 text-sm font-semibold text-[var(--hr-red)]">{t("مساحة العمل / التهيئة", "WORKSPACE / CONFIGURATION")}</p>
      <h1 className="text-3xl font-bold tracking-tight">{t("إعدادات الموارد البشرية", "HR settings")}</h1>
      <p className="mt-1 text-sm text-[var(--hr-muted)]">{t("روابط الإعدادات الحالية ومسارات الطلبات المدعومة.", "Existing configuration destinations and supported request routing.")}</p>
    </header>
    <section className="space-y-3">
      <div><h2 className="text-lg font-bold">{t("إعدادات التشغيل", "Operational configuration")}</h2><p className="text-sm text-[var(--hr-muted)]">{t("تفتح كل وجهة إعداد النظام المعتمدة.", "Each link opens an existing system configuration screen.")}</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        {destinations.map(({ href, icon: Icon, ar, en }) => <Link key={href} href={href} className="group flex min-h-20 items-center gap-4 rounded-xl border border-[var(--hr-line)]/45 bg-[var(--hr-ivory)] p-4 text-[var(--hr-ink)] transition-colors hover:border-[var(--hr-red)]/50 hover:bg-[var(--hr-soft)]/50">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--hr-soft)] text-[var(--hr-red)]"><Icon size={19} /></span>
          <strong className="flex-1 text-sm">{t(ar, en)}</strong><ArrowUpLeft size={16} className={`text-[var(--hr-muted)] ${isRTL ? "" : "rotate-180"}`} />
        </Link>)}
      </div>
    </section>
    <section className="space-y-3">
      <div><h2 className="text-lg font-bold">{t("مسارات مراجعة الطلبات", "Request review routing")}</h2><p className="text-sm text-[var(--hr-muted)]">{t("الإعداد يسري على الطلبات الجديدة فقط؛ تظل الطلبات الحالية على مسارها المثبت.", "Changes apply to new requests only; existing requests keep their frozen route.")}</p></div>
      {routing.isLoading ? <div className="grid gap-3 sm:grid-cols-2">{[0,1].map(x => <div key={x} className="h-48 animate-pulse rounded-xl border bg-[var(--hr-soft)]" />)}</div>
        : routing.isError ? <div role="alert" className="rounded-xl border border-[var(--hr-line)] bg-[var(--hr-ivory)] p-5"><p className="font-semibold">{t("تعذر تحميل مسارات الطلبات.", "Could not load request routing.")}</p><Button className="mt-3" variant="outline" onClick={() => routing.refetch()}>{t("إعادة المحاولة", "Retry")}</Button></div>
        : <div className="grid gap-3 sm:grid-cols-2">{(["leave", "permission"] as const).map(kind => {
          const item = routingItem(kind);
          return <article key={kind} className="rounded-xl border border-[var(--hr-line)]/45 bg-[var(--hr-ivory)] p-5">
            <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--hr-soft)] text-[var(--hr-red)]"><CalendarDays size={19} /></span><h3 className="text-base font-bold">{kindLabel(kind)}</h3></div>
            {!item ? <p className="mt-4 text-sm text-[var(--hr-muted)]">{t("لا تتوفر بيانات المسار لهذا النوع.", "Routing data is unavailable for this request type.")}</p> : <>
              <div className="mt-4 rounded-lg bg-[var(--hr-soft)]/70 p-3">
                <p className="text-sm font-semibold">{item.managerReview ? t("المدير المباشر ثم الموارد البشرية", "Manager, then HR") : t("الموارد البشرية مباشرة", "HR only")}</p>
                <p className="mt-1 text-xs text-[var(--hr-muted)]">{item.managerReview
                  ? t("مراجعة المدير مرحلة أولى، والقرار النهائي للموارد البشرية.", "Manager review is the first stage; HR always makes the final decision.")
                  : t("يصل الطلب للموارد البشرية دون مراجعة المدير.", "Requests go directly to HR without manager review.")}</p>
              </div>
              {item.managerReview && <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm">
                <input type="checkbox" checked={item.requireManager} disabled={update.isPending} onChange={e => change(item, item.managerReview, e.target.checked)} className="mt-1 accent-[var(--hr-red)]" />
                <span>{t("اشترط مديرًا مباشرًا بحساب نشط؛ امنع الطلب الجديد عند تعذره", "Require a manager with an active account; block new requests if unavailable")}</span>
              </label>}
              {item.managerReview && !item.requireManager && <p className="mt-2 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200"><AlertTriangle size={15} className="mt-0.5 shrink-0" />{t("عند غياب المدير أو عدم صلاحية حسابه، يصل الطلب الجديد للموارد البشرية للمراجعة؛ لا للاعتماد التلقائي.", "If the manager is missing or their account is unavailable, new requests go to HR for review, never automatic approval.")}</p>}
              {!item.managerReview && <p className="mt-3 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200"><AlertTriangle size={15} className="mt-0.5 shrink-0" />{t("المسار المباشر إلى HR هو بديل صريح عند عدم طلب مراجعة المدير.", "Direct HR routing is an explicit fallback when manager review is disabled.")}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant={item.managerReview ? "default" : "outline"} disabled={update.isPending || item.managerReview} onClick={() => change(item, true)}>{update.isPending ? <LoaderCircle size={15} className="me-2 animate-spin" /> : null}{t("مدير ثم HR", "Manager then HR")}</Button>
                <Button size="sm" variant={!item.managerReview ? "default" : "outline"} disabled={update.isPending || !item.managerReview} onClick={() => change(item, false)}>{update.isPending ? <LoaderCircle size={15} className="me-2 animate-spin" /> : null}{t("HR فقط", "HR only")}</Button>
              </div>
            </>}
          </article>;
        })}</div>}
      {saveError && <p role="alert" className="rounded-lg border border-amber-700/25 bg-amber-50 p-3 text-sm text-amber-950">{saveError}</p>}
      <p className="rounded-xl border border-[var(--hr-line)]/40 bg-[var(--hr-soft)]/40 p-4 text-sm leading-6 text-[var(--hr-ink)]">
        <strong>{t("ضوابط المسار: ", "Routing safeguards: ")}</strong>
        {t("القرار النهائي دائمًا للموارد البشرية، ولا يوجد اعتماد تلقائي. عند اشتراط المدير وغيابه، يُمنع إرسال الطلب الجديد مع إظهار تنبيه؛ ويمكن اختيار HR فقط كبديل صريح. الطلبات القائمة لا تتغير.", "HR always retains the final decision; there is no auto-approval. When a manager is required but missing, new requests are blocked with a warning. HR-only can be selected as an explicit fallback. Existing requests are unchanged.")}
      </p>
    </section>
  </div>;
}
