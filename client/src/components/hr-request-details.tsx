import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/components/language-provider";
import { MedicalDocumentLinks } from "@/components/medical-document-links";
import { RequestAttachments } from "@/components/request-attachments";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertCircle, Clock3 } from "lucide-react";

type RequestKind = "leave" | "permission";
type RequestRecord = Record<string, unknown> & {
  id: number;
  status?: string;
  reason?: string | null;
  leaveType?: string;
  startDate?: string;
  endDate?: string;
  days?: number;
  type?: string;
  date?: string;
  startTime?: string | null;
  endTime?: string | null;
  hoursRequested?: number | null;
  reviewerStage?: string | null;
  leaveFormData?: Record<string, unknown> | null;
};
type DecisionEntry = {
  id: number;
  decision: string;
  previousStatus: string | null;
  nextStatus: string | null;
  note: string | null;
  createdAt: string;
  actorName: string | null;
};
type RequestDetailsResponse = { request: RequestRecord; history: DecisionEntry[]; managerName: string | null;
  approvalRoute?:{captured:boolean;managerRequired:boolean;managerComplete:boolean;stage:string} };

const STATUSES: Record<string, { ar: string; en: string }> = {
  pending: { ar: "قيد الانتظار", en: "Pending" },
  manager_pending: { ar: "بانتظار المدير", en: "Manager review" },
  manager_approved: { ar: "بانتظار الموارد البشرية", en: "HR review" },
  approved: { ar: "معتمد", en: "Approved" },
  auto_approved: { ar: "معتمد تلقائياً", en: "Auto-approved" },
  rejected: { ar: "مرفوض", en: "Rejected" },
  clarification_requested: { ar: "توضيح مطلوب", en: "Needs clarification" },
  cancelled: { ar: "ملغى", en: "Cancelled" },
};
const DECISIONS: Record<string, { ar: string; en: string }> = {
  submit: {ar:"تقديم الطلب",en:"Submitted"},
  administrative_approve: {ar:"اعتماد إداري",en:"Administrative approval"},
  administrative_reject: {ar:"رفض إداري",en:"Administrative rejection"},
  administrative_clarify: {ar:"طلب توضيح إداري",en:"Administrative clarification"},
  approve: { ar: "اعتماد", en: "Approved" }, approved: { ar: "اعتماد", en: "Approved" },
  reject: { ar: "رفض", en: "Rejected" }, rejected: { ar: "رفض", en: "Rejected" },
  clarify: { ar: "طلب توضيح", en: "Clarification requested" },
  cancel: { ar: "إلغاء", en: "Cancelled" }, cancelled: { ar: "إلغاء", en: "Cancelled" },
};
const FORM_LABELS: Record<string, { ar: string; en: string }> = {
  passportNumber: { ar: "رقم الجواز", en: "Passport number" },
  destination: { ar: "الوجهة", en: "Destination" },
  actualDepartureDate: { ar: "تاريخ المغادرة المبلغ عنه", en: "Reported departure date" },
  actualReturnDate: { ar: "تاريخ العودة المبلغ عنه", en: "Reported return date" },
  substituteEmployeeId: { ar: "الموظف البديل", en: "Substitute employee" },
  leaveAddress: { ar: "العنوان أثناء الإجازة", en: "Address during leave" },
  leavePhone: { ar: "هاتف التواصل", en: "Contact phone" },
  ticketDetails: { ar: "بيانات التذاكر", en: "Ticket details" },
  visaDetails: { ar: "بيانات التأشيرة", en: "Visa details" },
  notes: { ar: "ملاحظات النموذج", en: "Form notes" },
  employeeAcknowledged: { ar: "إقرار الموظف", en: "Employee acknowledgment" },
  entitlementDate: { ar: "تاريخ الاستحقاق", en: "Entitlement date" },
  lastReturnDate: { ar: "تاريخ العودة من آخر إجازة", en: "Last leave return date" },
  lastLeaveType: { ar: "نوع آخر إجازة", en: "Last leave type" },
};
const LEAVE_TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  annual: { ar: "سنوية", en: "Annual" }, sick: { ar: "مرضية", en: "Sick" }, unpaid: { ar: "بدون راتب", en: "Unpaid" },
  emergency: { ar: "طارئة", en: "Emergency" }, maternity: { ar: "أمومة", en: "Maternity" }, other: { ar: "أخرى", en: "Other" },
};
const PERMISSION_TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  leave: { ar: "مغادرة", en: "Leave" }, permission: { ar: "استئذان", en: "Permission" },
  sick: { ar: "مرضي", en: "Sick" }, official: { ar: "مهمة رسمية", en: "Official" },
  remote: { ar: "عمل عن بعد", en: "Remote work" },
};
const recordOf = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function HrRequestDetails({ kind, requestId, employeeName, onClose,onDecision }: { kind: RequestKind; requestId: number; employeeName: string; onClose: () => void;onDecision?:(action:"approve"|"reject"|"clarify",stage:string)=>void }) {
  const { t, isRTL } = useLanguage();
  const { data, isLoading, isError, error, refetch } = useQuery<RequestDetailsResponse>({
    queryKey: ["/api/hr/requests", kind, requestId, "history"],
    queryFn: async () => (await apiRequest("GET", `/api/hr/requests/${kind}/${requestId}/history`)).json(),
  });
  const request = data?.request;
  const snapshot = recordOf(request?.leaveFormData);
  const submitted = recordOf(snapshot.submitted);
  const capturedSubstitute = recordOf(snapshot.substitute);
  const hrReview = recordOf(submitted.hrReview);
  const submittedRows = Object.entries(FORM_LABELS).flatMap(([key, label]) => {
    const value = key in hrReview ? hrReview[key] : key === "substituteEmployeeId" ? submitted[key] ?? capturedSubstitute.id ?? capturedSubstitute.name : submitted[key];
    if (value == null || value === "") return [];
    const localized = typeof value === "boolean"
      ? (value ? t("تم الإقرار", "Acknowledged") : t("لم يتم الإقرار", "Not acknowledged"))
      : key === "substituteEmployeeId" ? String(capturedSubstitute.name || `#${String(value)}`) + (capturedSubstitute.employeeNumber ? ` · ${String(capturedSubstitute.employeeNumber)}` : "")
      : key === "lastLeaveType" ? t(LEAVE_TYPE_LABELS[String(value)]?.ar || String(value), LEAVE_TYPE_LABELS[String(value)]?.en || String(value))
      : String(value);
    return [{ key, label: t(label.ar, label.en), value: localized }];
  });
  const friendlyStatus = (value: string | null | undefined) => {
    if (!value) return "—";
    const label = STATUSES[value];
    return label ? t(label.ar, label.en) : value;
  };
  const friendlyDecision = (value: string) => {
    const label = DECISIONS[value] || STATUSES[value];
    return label ? t(label.ar, label.en) : value;
  };
  const formatDate = (value: string | null | undefined) => {
    if (!value) return "—";
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return value;
    return new Intl.DateTimeFormat(isRTL ? "ar-SA" : "en-GB", { dateStyle: "medium", timeStyle: value.includes("T") ? "short" : undefined }).format(parsed);
  };
  const typeLabel = request
    ? kind === "leave"
      ? t(LEAVE_TYPE_LABELS[request.leaveType || ""]?.ar || request.leaveType || "إجازة", LEAVE_TYPE_LABELS[request.leaveType || ""]?.en || request.leaveType || "Leave")
      : t(PERMISSION_TYPE_LABELS[request.type || ""]?.ar || request.type || "استئذان", PERMISSION_TYPE_LABELS[request.type || ""]?.en || request.type || "Permission")
    : "";
  const stageValue = String(request?.reviewerStage || (request?.status === "manager_approved" ? "hr" : request?.status === "manager_pending" ? "manager" : request?.status === "pending" ? "manager" : ""));
  const stage = stageValue.toLowerCase().includes("manager") ? "manager" : stageValue.toLowerCase().includes("hr") ? "hr" : stageValue.toLowerCase().includes("owner") ? "owner" : stageValue;
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[90dvh] w-[calc(100vw-1rem)] max-w-xl overflow-y-auto p-4 sm:p-6">
      <DialogHeader className="px-7 text-start sm:px-0">
        <DialogTitle>{t("تفاصيل الطلب", "Request details")} · #{requestId}</DialogTitle>
        <DialogDescription>{t("معلومات الطلب ومسار قراراته.", "Request information and decision history.")}</DialogDescription>
      </DialogHeader>
      {isLoading ? <div className="space-y-3 py-2" role="status"><div className="h-5 w-2/3 animate-pulse rounded bg-muted" /><div className="h-16 animate-pulse rounded bg-muted" /><div className="h-12 animate-pulse rounded bg-muted" /></div>
        : isError || !request ? <div className="rounded-lg border border-destructive/30 p-4" role="alert">
          <p className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{error instanceof Error ? error.message : t("تعذر تحميل تفاصيل الطلب.", "Could not load request details.")}</p>
          <Button className="mt-3" size="sm" variant="outline" onClick={() => refetch()}>{t("إعادة المحاولة", "Retry")}</Button>
        </div> : <div className="space-y-4">
          <section className="rounded-xl border bg-muted/20 p-3 sm:p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0"><h3 className="break-words font-semibold">{typeLabel}</h3><p className="mt-1 text-xs text-muted-foreground">#{request.id}</p></div>
              <Badge variant="outline">{friendlyStatus(request.status)}</Badge>
            </div>
            <dl className="mt-3 grid grid-cols-1 gap-2 text-sm min-[380px]:grid-cols-2">
              <div className="min-[380px]:col-span-2"><dt className="text-xs text-muted-foreground">{t("الموظف", "Employee")}</dt><dd className="mt-0.5 break-words">{employeeName || "—"}</dd></div>
              {kind === "leave" ? <>
                <div><dt className="text-xs text-muted-foreground">{t("من — إلى", "From — to")}</dt><dd dir="ltr" className="mt-0.5 break-words">{request.startDate || "—"} — {request.endDate || "—"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">{t("المدة", "Duration")}</dt><dd className="mt-0.5">{request.days ?? "—"} {t("يوم", "days")}</dd></div>
              </> : <>
                <div><dt className="text-xs text-muted-foreground">{t("التاريخ", "Date")}</dt><dd dir="ltr" className="mt-0.5">{request.date || "—"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">{t("الوقت", "Time")}</dt><dd dir="ltr" className="mt-0.5 break-words">{request.startTime || "—"} — {request.endTime || "—"}</dd></div>
                {request.hoursRequested != null && <div><dt className="text-xs text-muted-foreground">{t("الساعات", "Hours")}</dt><dd className="mt-0.5">{request.hoursRequested}</dd></div>}
              </>}
              <div><dt className="text-xs text-muted-foreground">{t("مرحلة المراجعة", "Review stage")}</dt><dd className="mt-0.5">{stage === "manager" ? t("المدير المباشر", "Direct manager") : stage === "hr" ? t("الموارد البشرية", "HR") : stage === "owner" ? t("الإدارة", "Management") : stage === "closed" ? t("منتهٍ", "Closed") : stage || "—"}</dd></div>
              {data.managerName && <div><dt className="text-xs text-muted-foreground">{t("المدير المباشر", "Direct manager")}</dt><dd className="mt-0.5 break-words">{data.managerName}</dd></div>}
              <div className="min-[380px]:col-span-2"><dt className="text-xs text-muted-foreground">{t("السبب", "Reason")}</dt><dd className="mt-0.5 break-words whitespace-pre-wrap">{request.reason || "—"}</dd></div>
              {typeof request.notes === "string" && request.notes && <div className="min-[380px]:col-span-2"><dt className="text-xs text-muted-foreground">{t("ملاحظات", "Notes")}</dt><dd className="mt-0.5 break-words whitespace-pre-wrap">{request.notes}</dd></div>}
            </dl>
          </section>
          <section className="rounded-xl border p-3">
            <h3 className="mb-3 font-semibold">{t("سلسلة الموافقات","Approval route")}</h3>
            <ol className="space-y-2 text-sm">
              <li>{t("١. تقديم الموظف — مسجل","1. Employee submission — recorded")}</li>
              {data.approvalRoute?.managerRequired&&<li>{t("٢. المدير المباشر","2. Direct manager")}{data.managerName?` · ${data.managerName}`:""} — {data.approvalRoute.managerComplete?t("تمت الموافقة","Approved"):stage==="manager"?t("بانتظار القرار","Awaiting decision"):stage==="closed"?t("راجع سجل القرارات","See decision history"):t("المرحلة التالية","Next stage")}</li>}
              <li>{t("الموارد البشرية — القرار النهائي","HR — final decision")} · {stage==="hr"?t("بانتظار القرار","Awaiting decision"):stage==="closed"?friendlyStatus(request.status):t("بعد مراجعة المدير","After manager review")}</li>
            </ol>
            <p className="mt-3 text-xs text-muted-foreground">{data.approvalRoute?.captured?t("المسار محفوظ مع الطلب؛ تغيير الإعدادات لا يغيّر طلبًا جاريًا.","The route is captured with the request; settings changes do not reroute it."):t("طلب سابق؛ يُحافظ على قراراته ومساره السابق دون إعادة تقديمه.","Existing request: its original decisions and route are preserved.")}</p>
            {onDecision&&stage!=="closed"&&<div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" onClick={()=>onDecision("approve",stage||"unknown")}>{t("اعتماد","Approve")}</Button>
              <Button size="sm" variant="destructive" onClick={()=>onDecision("reject",stage||"unknown")}>{t("رفض","Reject")}</Button>
              <Button size="sm" variant="outline" onClick={()=>onDecision("clarify",stage||"unknown")}>{t("طلب توضيح","Request clarification")}</Button>
            </div>}
          </section>
          <RequestAttachments kind={kind} id={requestId}/>
          {kind === "leave" && <details className="rounded-xl border p-3">
            <summary className="cursor-pointer font-medium">{t("البيانات المحفوظة مع الطلب", "Captured leave form")}</summary>
            {submittedRows.length ? <dl className="mt-3 grid grid-cols-1 gap-3 text-sm min-[380px]:grid-cols-2">
              {submittedRows.map(row => <div key={row.key} className="min-w-0 border-t pt-2"><dt className="text-xs text-muted-foreground">{row.label}</dt><dd className="mt-1 break-words whitespace-pre-wrap">{row.value}</dd></div>)}
            </dl> : <p className="mt-3 text-sm text-muted-foreground">{t("لا توجد بيانات نموذج إضافية محفوظة.", "No additional captured form values.")}</p>}
          </details>}
          {kind === "leave" && <section className="rounded-xl border p-3"><h3 className="mb-2 text-sm font-medium">{t("المرفقات الطبية", "Medical documents")}</h3><MedicalDocumentLinks leaveId={requestId} /></section>}
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Clock3 className="h-4 w-4" />{t("سجل القرارات", "Decision history")}</h3>
            {data.history.length ? <ol className="space-y-2">
              {data.history.map(item => <li key={item.id} className="min-w-0 rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{friendlyDecision(item.decision)}</span>
                  <time className="text-xs text-muted-foreground" dir="auto">{formatDate(item.createdAt)}</time>
                </div>
                <p className="mt-1 break-words text-sm">{item.actorName || t("غير محدد", "Not specified")}</p>
                {(item.previousStatus || item.nextStatus) && <p className="mt-1 break-words text-xs text-muted-foreground">{friendlyStatus(item.previousStatus)} → {friendlyStatus(item.nextStatus)}</p>}
                {item.note && <p className="mt-2 break-words whitespace-pre-wrap text-sm text-muted-foreground">{item.note}</p>}
              </li>)}
            </ol> : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{t("لا توجد قرارات مسجلة بعد.", "No decisions have been recorded yet.")}</p>}
          </section>
        </div>}
    </DialogContent>
  </Dialog>;
}
