import { useEffect,useMemo,useRef,useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link,useSearch } from "wouter";
import { useLanguage } from "@/components/language-provider";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAttendanceLive } from "@/hooks/use-attendance-live";
import { HrLeaveFormFields } from "@/components/hr-leave-form-fields";
import { MedicalDocumentLinks } from "@/components/medical-document-links";
import { HrRequestDetails } from "@/components/hr-request-details";
import { uploadRequestAttachment } from "@/components/request-attachments";
import HrReportsPage from "@/pages/hr-reports";
import type { LeaveFormInput } from "@shared/hr-leave-form";
import type { LeaveRequest, Employee, AttendancePermission } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, CalendarDays, CheckCircle2, Clock3, FileText, Loader2, Plus, Search, XCircle } from "lucide-react";

const LEAVE_TYPES = [
  { value: "annual", ar: "سنوية", en: "Annual" }, { value: "sick", ar: "مرضية", en: "Sick" },
  { value: "unpaid", ar: "بدون راتب", en: "Unpaid" }, { value: "emergency", ar: "طارئة", en: "Emergency" },
  { value: "maternity", ar: "أمومة", en: "Maternity" }, { value: "other", ar: "أخرى", en: "Other" },
];
const PERM_TYPES: Record<string, { ar: string; en: string }> = {
  leave: { ar: "مغادرة", en: "Leave" }, permission: { ar: "استئذان", en: "Permission" },
  sick: { ar: "مرضي", en: "Sick" }, official: { ar: "مهمة رسمية", en: "Official" }, remote: { ar: "عمل عن بعد", en: "Remote" },
};
type Section = "leaves" | "permissions";
type PendingRequest<T> = T & { employee?: { nameAr?: string; department?: string } | null; reviewerStage?: string };
type PendingData = { leaves: PendingRequest<LeaveRequest>[]; permissions: PendingRequest<AttendancePermission>[] };
type LeaveBalance = { entitlement: number; used: number; remaining: number; pending?: number; reserved?: number; available?: number; year: string };
const isPending = (status: string) => ["pending", "manager_pending", "manager_approved", "clarification_requested"].includes(status);
const canCancel = (status: string) => ["pending", "manager_approved", "clarification_requested", "approved"].includes(status);

export default function LeavesPage({ section = "leaves" }: { section?: Section }) {
  const { t } = useLanguage();
  const legacy = locationIsLegacy();
  const [legacyView, setLegacyView] = useState<Section | "reports">("leaves");
  if (!legacy) return <LeavesContent section={section} legacy={false} />;
  return <div className="space-y-5">
    <nav className="flex flex-wrap gap-2" aria-label={t("أقسام الطلبات", "Request sections")}>
      <Button size="sm" variant={legacyView === "leaves" ? "default" : "outline"} aria-pressed={legacyView === "leaves"} onClick={() => setLegacyView("leaves")}>{t("الإجازات", "Leaves")}</Button>
      <Button size="sm" variant={legacyView === "permissions" ? "default" : "outline"} aria-pressed={legacyView === "permissions"} onClick={() => setLegacyView("permissions")}>{t("الاستئذانات", "Permissions")}</Button>
      <Button size="sm" variant={legacyView === "reports" ? "default" : "outline"} aria-pressed={legacyView === "reports"} onClick={() => setLegacyView("reports")}>{t("التقارير", "Reports")}</Button>
    </nav>
    {legacyView === "reports" ? <HrReportsPage /> : <LeavesContent section={legacyView} legacy />}
  </div>;
}

function LeavesContent({ section, legacy }: { section: Section; legacy: boolean }) {
  useAttendanceLive();
  const { t } = useLanguage();
  const { toast } = useToast();
  const isLeaves = section === "leaves";
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: "", leaveType: "annual", startDate: "", endDate: "", reason: "" });
  const [leaveFormData, setLeaveFormData] = useState<LeaveFormInput>({});
  const [balanceEmp, setBalanceEmp] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [decision, setDecision] = useState<{ id: number; kind: Section; stage: string; action: "approve" | "reject" | "clarify" } | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [overrideManager, setOverrideManager] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<LeaveRequest | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [medicalId, setMedicalId] = useState<number | null>(null);
  const [detailTarget, setDetailTarget] = useState<{ kind: "leave" | "permission"; id: number; employeeName: string } | null>(null);
  const [pendingQueueOpen, setPendingQueueOpen] = useState(false);
  const [formFile,setFormFile]=useState<File|null>(null);
  const searchQuery=useSearch(),openedLink=useRef("");
  const listQueryKey = isLeaves ? ["/api/leaves"] : ["/api/attendance/permissions"];
  const { data: leaves = [], isLoading, isError, refetch } = useQuery<LeaveRequest[]>({ queryKey: listQueryKey, enabled: isLeaves });
  const { data: permissions = [], isLoading: permissionsLoading, isError: permissionsError, refetch: refetchPermissions } = useQuery<AttendancePermission[]>({ queryKey: listQueryKey, enabled: !isLeaves });
  const { data: employees = [] } = useQuery<Employee[]>({ queryKey: ["/api/employees"] });
  const { data: pending } = useQuery<PendingData>({ queryKey: ["/api/pending-requests"] });
  const { data: balance, isError: balanceError } = useQuery<LeaveBalance>({
    queryKey: ["/api/leaves/balance", balanceEmp],
    queryFn: async () => {
      const res = await fetch(`/api/leaves/balance/${balanceEmp}?year=${new Date().getFullYear()}`, { credentials: "include" });
      if (!res.ok) throw new Error("balance");
      return res.json();
    },
    enabled: !!balanceEmp && isLeaves,
  });
  const employeeName = (id: number | null) => {
    const e = employees.find(person => person.id === id);
    return e ? (t(e.fullNameAr || "", e.fullNameEn || "") || `#${id}`) : `#${id ?? "—"}`;
  };
  const typeName = (value: string) => {
    const item = LEAVE_TYPES.find(x => x.value === value);
    return item ? t(item.ar, item.en) : value;
  };
  const invalidate = () => {
    queryClient.invalidateQueries({queryKey:["/api/hr/requests"]});
    queryClient.invalidateQueries({queryKey:["/api/hr/overview"]});
    queryClient.invalidateQueries({ queryKey: ["/api/leaves"] });
    queryClient.invalidateQueries({ queryKey: ["/api/attendance/permissions"] });
    queryClient.invalidateQueries({ queryKey: ["/api/leaves/balance"] });
    queryClient.invalidateQueries({ queryKey: ["/api/pending-requests"] });
    queryClient.invalidateQueries({ queryKey: ["/api/hr/alerts"] });
  };
  const createMutation = useMutation({
    mutationFn: async () => {
      const file=formFile,response=await apiRequest("POST","/api/leaves",{...form,leaveFormData});
      return {created:await response.json(),file};
    },
    onSuccess: async ({created,file}) => {
      let failedUpload=false;
      if(file)try{await uploadRequestAttachment("leave",created.id,file);}
      catch{failedUpload=true;}
      invalidate(); setLeaveFormData({}); setCreateOpen(false);
      setFormFile(null);setDetailTarget({kind:"leave",id:created.id,employeeName:employees.find(e=>e.id===created.employeeId)?.fullNameAr||""});
      setForm({ employeeId: "", leaveType: "annual", startDate: "", endDate: "", reason: "" });
      toast({title:failedUpload?t("تم حفظ الطلب، لكن تعذر رفع المرفق. أعد إرفاقه من التفاصيل.","Request saved, but upload failed. Attach it again from details."):t("تم تسجيل طلب الإجازة","Leave request submitted"),variant:failedUpload?"destructive":"default"});
    },
    onError: (error: Error) => toast({ title: error.message || t("تعذر تسجيل الطلب", "Could not create request"), variant: "destructive" }),
  });
  const decideMutation = useMutation({
    mutationFn: () => {
      if (!decision) throw new Error("No request selected");
      const endpoint = decision.kind === "leaves" ? `/api/leaves/${decision.id}/decision` : `/api/attendance/permission/${decision.id}/decision`;
      return apiRequest("POST", endpoint, { decision: decision.action, notes: decisionNote, ...(decision.stage.toLowerCase().includes("manager") ? { overrideManager } : {}) });
    },
    onSuccess: () => {
      invalidate(); setDecision(null); setDecisionNote(""); setOverrideManager(false);
      toast({ title: t("تم تحديث الطلب", "Request updated") });
    },
    onError: (error: Error) => toast({ title: error.message || t("تعذر تحديث الطلب", "Could not update request"), variant: "destructive" }),
  });
  const cancelMutation = useMutation({
    mutationFn: () => {
      if (!cancelTarget) throw new Error("No leave selected");
      return apiRequest("POST", `/api/leaves/${cancelTarget.id}/cancel`, { reason: cancelReason.trim() });
    },
    onSuccess: () => {
      invalidate(); setCancelTarget(null); setCancelReason("");
      toast({ title: t("تم إلغاء الطلب مع الاحتفاظ بسجله", "Request cancelled; history retained") });
    },
    onError: (error: Error) => toast({ title: error.message || t("تعذر إلغاء الطلب", "Could not cancel request"), variant: "destructive" }),
  });

  const currentPending = isLeaves ? (pending?.leaves || []) : (pending?.permissions || []);
  const rows = isLeaves ? leaves : permissions;
  useEffect(()=>{
    const params=new URLSearchParams(searchQuery),key=`${isLeaves}:${searchQuery}`;
    if(openedLink.current===key)return;
    if(isLeaves&&params.get("new")==="1"){openedLink.current=key;setCreateOpen(true);return;}
    const id=Number(params.get("request"));
    if(id>0&&rows.length&&employees.length){
      const item=rows.find(row=>row.id===id);
      if(item){openedLink.current=key;setDetailTarget({kind:isLeaves?"leave":"permission",id,
        employeeName:employees.find(e=>e.id===item.employeeId)?.fullNameAr||""});}
    }
  },[searchQuery,isLeaves,rows,employees]);
  const loading = isLeaves ? isLoading : permissionsLoading;
  const errored = isLeaves ? isError : permissionsError;
  const filtered = useMemo(() => rows.filter((row: any) => {
    const name = employeeName(row.employeeId);
    const matchesSearch = `${name} ${row.reason || ""} ${row.id}`.toLocaleLowerCase().includes(search.toLocaleLowerCase());
    return matchesSearch && (statusFilter === "all" || row.status === statusFilter);
  }), [rows, search, statusFilter, employees]);
  const statusBadge = (status: string) => {
    const label = status === "approved" || status === "auto_approved" ? t("معتمد", "Approved")
      : status === "rejected" ? t("مرفوض", "Rejected")
      : status === "cancelled" ? t("ملغى", "Cancelled")
      : status === "manager_approved" ? t("بانتظار HR", "HR review")
      : status === "clarification_requested" ? t("توضيح مطلوب", "Needs details") : t("قيد الانتظار", "Pending");
    const icon = status === "approved" || status === "auto_approved" ? <CheckCircle2 className="h-3 w-3" />
      : status === "rejected" || status === "cancelled" ? <XCircle className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />;
    return <Badge variant="outline" className="gap-1 whitespace-nowrap">{icon}{label}</Badge>;
  };
  const launchDecision = (request: any, kind: Section, action: "approve" | "reject" | "clarify") => {
    const queued=(kind==="leaves"?pending?.leaves:pending?.permissions)?.find(item=>item.id===request.id);
    const employee=employees.find(item=>item.id===request.employeeId);
    const stage=queued?.reviewerStage || request.reviewerStage ||
      (request.status==="manager_approved" || request.managerApprovedBy ? "hr" : employee ? (employee.managerId ? "manager" : "hr") : "unknown");
    setDecision({ id: request.id, kind, stage, action });
    setDecisionNote(""); setOverrideManager(false);
  };
  const reviewControls = (request: any, kind: Section) => (
    <div className="flex flex-wrap gap-2">
      {kind === "permissions" && <a className="text-xs underline underline-offset-2" href={`/api/hr-permissions/${request.id}/document`} target="_blank" rel="noreferrer">{t("النموذج", "Form")}</a>}
      <Button size="sm" onClick={() => launchDecision(request, kind, "approve")}>{t("اعتماد", "Approve")}</Button>
      <Button size="sm" variant="outline" onClick={() => launchDecision(request, kind, "reject")}>{t("رفض", "Reject")}</Button>
      <Button size="sm" variant="ghost" onClick={() => launchDecision(request, kind, "clarify")}>{t("توضيح", "Clarify")}</Button>
    </div>
  );
  const requestDetails = (row: any) => isLeaves
    ? <span dir="ltr">{row.startDate} — {row.endDate} · {row.days} {t("يوم", "days")}</span>
    : <span dir="ltr">{row.date} {row.startTime || ""} — {row.formDetails?.returnDate || row.date} {row.endTime || ""}</span>;
  const detailButton = (request: { id: number; employeeId: number }, kind: Section) => (
    <Button size="sm" variant="outline" onClick={() => setDetailTarget({ id: request.id, employeeName: employeeName(request.employeeId), kind: kind === "leaves" ? "leave" : "permission" })}>
      {t("تفاصيل", "Details")}
    </Button>
  );
  const pendingCard = (request: any) => (
    <article key={request.id} className="rounded-xl border bg-card p-4 shadow-sm" data-testid={`pending-${section}-${request.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="font-semibold">{request.employee?.nameAr || employeeName(request.employeeId)}</p>
          <p className="mt-1 text-sm text-muted-foreground">{isLeaves ? typeName(request.leaveType) : (PERM_TYPES[request.type] ? t(PERM_TYPES[request.type].ar, PERM_TYPES[request.type].en) : request.type)}</p></div>
        {statusBadge(request.status)}
      </div>
      <p className="mt-3 text-sm" dir={isLeaves ? "ltr" : undefined}>{requestDetails(request)}</p>
      {request.reason && <p className="mt-2 text-sm text-muted-foreground">{request.reason}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {detailButton(request, section)}
        {reviewControls(request, section)}
        {isLeaves && <Button size="sm" variant="ghost" onClick={() => setMedicalId(medicalId === request.id ? null : request.id)}>{t("المرفقات الطبية", "Medical files")}</Button>}
      </div>
      {isLeaves && medicalId === request.id && <MedicalDocumentLinks leaveId={request.id} />}
    </article>
  );
  const listItem = (row: any) => (
    <article key={row.id} className="rounded-xl border bg-card p-4" data-testid={`card-${section}-${row.id}`}>
      <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{employeeName(row.employeeId)}</p><p className="mt-1 text-sm text-muted-foreground">{isLeaves ? typeName(row.leaveType) : (PERM_TYPES[row.type] ? t(PERM_TYPES[row.type].ar, PERM_TYPES[row.type].en) : row.type)}</p></div>{statusBadge(row.status)}</div>
      <p className="mt-3 text-sm" dir="ltr">{requestDetails(row)}</p>
      {row.reason && <p className="mt-2 text-sm text-muted-foreground">{row.reason}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {detailButton(row, section)}
        {isPending(row.status) && reviewControls(row, section)}
        {isLeaves && <Button size="sm" variant="ghost" onClick={() => setMedicalId(medicalId === row.id ? null : row.id)}>{t("المرفقات", "Files")}</Button>}
        {isLeaves && canCancel(row.status) && <Button size="sm" variant="outline" onClick={() => { setCancelTarget(row); setCancelReason(""); }}>{t("إلغاء", "Cancel")}</Button>}
        {isLeaves && row.status === "approved" && <span className="basis-full text-xs text-amber-700">{t("الإلغاء يؤثر على الحضور والرصيد، ولا يرحّل الرواتب تلقائياً.", "Cancellation affects attendance and balance; payroll is not posted automatically.")}</span>}
      </div>
      {isLeaves && medicalId === row.id && <MedicalDocumentLinks leaveId={row.id} />}
    </article>
  );

  return <div className="space-y-5">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="h-4 w-4" />{t("إدارة الطلبات", "Request management")}</div>
        <h1 className="text-2xl font-bold">{t(isLeaves ? "الإجازات" : "الاستئذانات", isLeaves ? "Leaves" : "Permissions")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("قائمة مركزة مع مراجعة الطلبات حسب الحالة والموظف.", "A focused list with review by status and employee.")}</p></div>
      {isLeaves && <div className="flex flex-wrap items-center gap-2">
        {!legacy && <Link href="/actions?group=return" className="rounded-md border px-3 py-2 text-sm">{t("إجراءات الإجازة", "Leave procedures")}</Link>}
        <Button onClick={() => setCreateOpen(true)}><Plus className="me-1 h-4 w-4" />{t("طلب إجازة", "New leave")}</Button>
      </div>}
    </header>
    {!legacy && <nav className="flex flex-wrap gap-2" aria-label={t("أقسام الطلبات", "Request sections")}>
        <Link href="/leaves" className={`rounded-full border px-3 py-2 text-sm ${isLeaves ? "bg-primary text-primary-foreground" : "bg-card"}`}>{t("الإجازات", "Leaves")}</Link>
        <Link href="/permissions" className={`rounded-full border px-3 py-2 text-sm ${!isLeaves ? "bg-primary text-primary-foreground" : "bg-card"}`}>{t("الاستئذانات", "Permissions")}</Link>
        <Link href="/reports" className="rounded-full border bg-card px-3 py-2 text-sm">{t("مركز التقارير", "Reports")}</Link>
    </nav>}

    {isLeaves && <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-1"><Label className="text-xs">{t("رصيد الإجازة", "Leave balance")}</Label>
          <Select value={balanceEmp} onValueChange={setBalanceEmp}><SelectTrigger><SelectValue placeholder={t("اختر الموظف", "Select employee")} /></SelectTrigger><SelectContent>{employees.filter(e => e.status === "active").map(e => <SelectItem key={e.id} value={String(e.id)}>{employeeName(e.id)}</SelectItem>)}</SelectContent></Select></div>
        {balance && <div className="grid grid-cols-4 gap-3 text-center sm:flex sm:gap-6">{[
          [t("المستحق", "Entitled"), balance.entitlement], [t("المستخدم", "Used"), balance.used], [t("محجوز", "Reserved"), balance.pending ?? balance.reserved ?? 0], [t("المتاح", "Available"), balance.available ?? balance.remaining],
        ].map(([label, value]) => <div key={String(label)}><strong className="text-xl">{value}</strong><p className="text-xs text-muted-foreground">{label}</p></div>)}</div>}
        {balanceError && <p role="alert" className="text-sm text-destructive">{t("تعذر تحميل الرصيد.", "Could not load balance.")}</p>}
      </CardContent>
    </Card>}

    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div className="min-w-0"><CardTitle className="flex flex-wrap items-center gap-2 text-base"><Clock3 className="h-4 w-4 shrink-0" />{t("بانتظار المراجعة", "Pending review")}<Badge variant="secondary">{currentPending.length}</Badge></CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{t("تشمل الطلبات بانتظار المدير والطلبات المحالة إلى الموارد البشرية.", "Includes requests awaiting a manager and those routed to HR.")}</p>
        </div>
        <Button variant="ghost" size="sm" aria-expanded={pendingQueueOpen} onClick={() => setPendingQueueOpen(open => !open)}>{pendingQueueOpen ? t("إخفاء", "Hide") : t("عرض", "View")}</Button>
      </CardHeader>
      {pendingQueueOpen && <CardContent className="space-y-3">
        {currentPending.length ? currentPending.map(pendingCard) : <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">{t("لا توجد طلبات بانتظار المراجعة.", "Nothing is waiting for review.")}</p>}
      </CardContent>}
    </Card>

    <section className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="ps-9" type="search" placeholder={t("ابحث بالموظف أو السبب أو الرقم", "Search employee, reason or ID")} value={search} onChange={e => setSearch(e.target.value)} /></div>
        <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger><SelectContent>
          <SelectItem value="all">{t("كل الحالات", "All statuses")}</SelectItem>
          {["pending", "manager_pending", "manager_approved", "approved", "rejected", "clarification_requested", "cancelled"].map(s => <SelectItem key={s} value={s}>{s === "pending" || s === "manager_pending" ? t("قيد الانتظار", "Pending") : s === "manager_approved" ? t("بانتظار HR", "HR review") : s === "approved" ? t("معتمد", "Approved") : s === "rejected" ? t("مرفوض", "Rejected") : s === "cancelled" ? t("ملغى", "Cancelled") : t("توضيح مطلوب", "Needs details")}</SelectItem>)}
        </SelectContent></Select>
      </div>
      {loading ? <div className="space-y-3"><div className="h-20 animate-pulse rounded-xl bg-muted" /><div className="h-20 animate-pulse rounded-xl bg-muted" /></div>
        : errored ? <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5" role="alert"><div className="flex items-center gap-2 text-sm"><AlertCircle className="h-4 w-4" />{t("تعذر تحميل القائمة.", "Could not load the list.")}</div><Button className="mt-3" variant="outline" size="sm" onClick={() => isLeaves ? refetch() : refetchPermissions()}>{t("إعادة المحاولة", "Retry")}</Button></div>
        : filtered.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center"><FileText className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-2 font-medium">{t("لا توجد نتائج", "No matching requests")}</p><p className="mt-1 text-sm text-muted-foreground">{t("جرّب تغيير البحث أو الحالة.", "Try changing the search or status.")}</p></div>
        : <><div className="space-y-3 md:hidden">{filtered.map(listItem)}</div>
          <div className="hidden overflow-x-auto rounded-xl border md:block"><table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/50 text-start"><tr>{[t("الموظف", "Employee"), t("النوع", "Type"), t("الفترة", "Period"), t("السبب", "Reason"), t("الحالة", "Status"), t("الإجراءات", "Actions")].map(x => <th key={x} className="p-3 text-start font-semibold">{x}</th>)}</tr></thead>
             <tbody>{filtered.map((row: any) => <tr key={row.id} className="border-t"><td className="p-3 font-medium">{employeeName(row.employeeId)}</td><td className="p-3">{isLeaves ? typeName(row.leaveType) : (PERM_TYPES[row.type] ? t(PERM_TYPES[row.type].ar, PERM_TYPES[row.type].en) : row.type)}</td><td className="p-3" dir="ltr">{requestDetails(row)}</td><td className="max-w-48 truncate p-3">{row.reason || "—"}</td><td className="p-3">{statusBadge(row.status)}</td><td className="p-3"><div className="flex flex-wrap gap-1">
               {detailButton(row, section)}
              {isPending(row.status) && reviewControls(row, section)}
              {isLeaves && <Button size="sm" variant="ghost" onClick={() => setMedicalId(medicalId === row.id ? null : row.id)}>{t("المرفقات", "Files")}</Button>}
               {isLeaves && canCancel(row.status) && <Button size="sm" variant="outline" onClick={() => { setCancelTarget(row); setCancelReason(""); }}>{t("إلغاء", "Cancel")}</Button>}
            </div>{isLeaves && medicalId === row.id && <MedicalDocumentLinks leaveId={row.id} />}
              {isLeaves && row.status === "approved" && <p className="mt-1 text-xs text-amber-700">{t("يؤثر على الحضور والرصيد؛ لا يرحّل الرواتب.", "Affects attendance and balance; does not post payroll.")}</p>}</td></tr>)}</tbody>
          </table></div></>}
    </section>

    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="max-h-[94dvh] w-[96vw] max-w-3xl overflow-y-auto">
      <DialogHeader><DialogTitle>{t("طلب إجازة", "Leave request")}</DialogTitle><DialogDescription>{t("أدخل بيانات الطلب ومرفقاته قبل الإرسال للمراجعة.", "Enter the request details and any required attachments before submitting for review.")}</DialogDescription></DialogHeader>
      <label className="block space-y-2 text-sm"><span>{t("مرفق اختياري — PDF أو صورة حتى 5 ميغابايت","Optional attachment — PDF or image up to 5 MB")}</span><Input type="file" accept="application/pdf,image/jpeg,image/png" onChange={event=>{const file=event.target.files?.[0]||null;if(file&&file.size>5242880){event.target.value="";toast({title:t("الحد الأقصى 5 ميغابايت","Maximum 5 MB"),variant:"destructive"});return;}setFormFile(file);}}/>{formFile&&<Button type="button" variant="ghost" size="sm" onClick={()=>setFormFile(null)}>{t("إزالة الملف المحدد","Remove selected file")}</Button>}</label>
      <div className="space-y-3">
        <div className="space-y-1"><Label>{t("الموظف", "Employee")}</Label><Select value={form.employeeId} onValueChange={employeeId => setForm(v => ({ ...v, employeeId }))}><SelectTrigger><SelectValue placeholder={t("اختر الموظف", "Select employee")} /></SelectTrigger><SelectContent>{employees.filter(e => e.status === "active").map(e => <SelectItem key={e.id} value={String(e.id)}>{employeeName(e.id)}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label>{t("نوع الإجازة", "Leave type")}</Label><Select value={form.leaveType} onValueChange={leaveType => setForm(v => ({ ...v, leaveType }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{LEAVE_TYPES.map(x => <SelectItem key={x.value} value={x.value}>{t(x.ar, x.en)}</SelectItem>)}</SelectContent></Select></div>
        <div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label>{t("من", "From")}</Label><Input type="date" value={form.startDate} onChange={e => setForm(v => ({ ...v, startDate: e.target.value }))} /></div><div className="space-y-1"><Label>{t("إلى", "To")}</Label><Input type="date" value={form.endDate} onChange={e => setForm(v => ({ ...v, endDate: e.target.value }))} /></div></div>
        <div className="space-y-1"><Label>{t("السبب (اختياري)", "Reason (optional)")}</Label><Textarea value={form.reason} onChange={e => setForm(v => ({ ...v, reason: e.target.value }))} /></div>
        <HrLeaveFormFields value={leaveFormData} onChange={setLeaveFormData} employees={employees} employeeId={Number(form.employeeId)} />
      </div>
      <DialogFooter><Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.employeeId || !form.startDate || !form.endDate}>{createMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}{t("إرسال", "Submit")}</Button></DialogFooter>
    </DialogContent></Dialog>

    <Dialog open={!!decision} onOpenChange={open => { if (!open && !decideMutation.isPending) { setDecision(null); setDecisionNote(""); setOverrideManager(false); } }}><DialogContent>
      <DialogHeader><DialogTitle>{t(decision?.action === "approve" ? "اعتماد الطلب" : decision?.action === "reject" ? "رفض الطلب" : "طلب توضيح", decision?.action === "approve" ? "Approve request" : decision?.action === "reject" ? "Reject request" : "Request details")}</DialogTitle><DialogDescription>{t("راجع الطلب وسجّل الملاحظة المطلوبة قبل تأكيد القرار. لن يُغلق النموذج قبل اكتمال الحفظ.", "Review the request and enter any required note before confirming. The dialog remains open until the update succeeds.")}</DialogDescription></DialogHeader>
      <div className="space-y-3"><Label>{t("ملاحظة / سبب التدخل", "Notes / intervention reason")}{decision?.action !== "approve" || decision?.stage==="manager" ? ` · ${t("مطلوبة", "required")}` : ` · ${t("اختيارية", "optional")}`}</Label><Textarea value={decisionNote} onChange={e => setDecisionNote(e.target.value)} />
        {decision?.stage==="manager" && <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{t("الطلب ينتظر المدير المباشر. لإصدار قرار نهائي الآن، فعّل التدخل الإداري وسجّل سببًا من 3 أحرف على الأقل.", "This request awaits the manager. To make a final decision now, explicitly authorize an administrative override and enter a reason of at least 3 characters.")}</p>}
        {decision?.stage.toLowerCase().includes("manager") && <label className="flex items-start gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" checked={overrideManager} onChange={e => setOverrideManager(e.target.checked)} className="mt-1" /><span>{t("تجاوز مرحلة المدير المباشر (إجراء إداري صريح)", "Override manager stage (explicit administrative action)")}</span></label>}
      </div>
      <DialogFooter><Button disabled={decideMutation.isPending || decision?.stage==="unknown" || (decision?.action !== "approve" && !decisionNote.trim()) || (decision?.stage==="manager" && (!overrideManager || decisionNote.trim().length<3))} variant={decision?.action === "reject" ? "destructive" : "default"} onClick={() => decideMutation.mutate()}>{decideMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}{t("تأكيد", "Confirm")}</Button></DialogFooter>
    </DialogContent></Dialog>

    <Dialog open={!!cancelTarget} onOpenChange={open => { if (!open && !cancelMutation.isPending) { setCancelTarget(null); setCancelReason(""); } }}><DialogContent>
      <DialogHeader><DialogTitle>{t("تأكيد إلغاء الإجازة", "Confirm leave cancellation")}</DialogTitle><DialogDescription>{t("أدخل سبباً واضحاً؛ سيُحفظ القرار في سجل الطلب.", "Provide a clear reason; the decision will remain in the request history.")}</DialogDescription></DialogHeader>
      <div className="space-y-3"><p className="rounded-lg border border-amber-500/30 bg-amber-50 p-3 text-sm text-amber-900">{t("هذا الإجراء نهائي ويحفظ سجل الطلب. قد يؤثر على الحضور ورصيد الإجازة، ولا يرحّل أي تعديل إلى الرواتب تلقائياً.", "This is irreversible and retains the request history. It may change attendance and leave balance; payroll is not updated automatically.")}</p>
        <div className="space-y-1"><Label>{t("سبب الإلغاء (٣ أحرف على الأقل)", "Cancellation reason (at least 3 characters)")}</Label><Textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} /></div></div>
      <DialogFooter><Button variant="destructive" disabled={cancelReason.trim().length < 3 || cancelMutation.isPending} onClick={() => cancelMutation.mutate()}>{cancelMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}{t("تأكيد الإلغاء", "Confirm cancellation")}</Button></DialogFooter>
    </DialogContent></Dialog>
    {detailTarget && <HrRequestDetails kind={detailTarget.kind} requestId={detailTarget.id} employeeName={detailTarget.employeeName} onClose={() => setDetailTarget(null)} onDecision={(action,stage)=>{setDecisionNote("");setOverrideManager(false);setDecision({id:detailTarget.id,kind:detailTarget.kind==="leave"?"leaves":"permissions",action,stage});setDetailTarget(null);}} />}
  </div>;
}

function locationIsLegacy() {
  return typeof window !== "undefined" && window.location.pathname === "/leaves";
}
