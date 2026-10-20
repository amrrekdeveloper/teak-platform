import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { HrDueTerminations } from "@/components/hr-action-panel";
import { HrLeaveFormFields } from "@/components/hr-leave-form-fields";
import { MedicalDocumentLinks } from "@/components/medical-document-links";
import type { LeaveFormInput } from "@shared/hr-leave-form";
import type { LeaveRequest, Employee, AttendancePermission } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CalendarDays, Plus, CheckCircle2, XCircle, Clock, UserCheck, HelpCircle, Inbox, BarChart3 } from "lucide-react";

const LEAVE_TYPES: { value: string; ar: string; en: string }[] = [
  { value: "annual", ar: "سنوية", en: "Annual" },
  { value: "sick", ar: "مرضية", en: "Sick" },
  { value: "unpaid", ar: "بدون راتب", en: "Unpaid" },
  { value: "emergency", ar: "طارئة", en: "Emergency" },
  { value: "maternity", ar: "أمومة", en: "Maternity" },
  { value: "other", ar: "أخرى", en: "Other" },
];

const PERM_TYPES: Record<string, { ar: string; en: string }> = {
  leave: { ar: "مغادرة", en: "Leave" },
  permission: { ar: "استئذان", en: "Permission" },
  sick: { ar: "مرضي", en: "Sick" },
  official: { ar: "مهمة رسمية", en: "Official" },
  remote: { ar: "عمل عن بعد", en: "Remote" },
};

type ReviewHistory = {
  totalLeaves:number; totalPermissions:number; approved:number; rejected:number;
  leaves?:LeaveRequest[]; permissions?:AttendancePermission[];
  decisions?:{id:number;kind:string;request_id:number;decision:string;note:string|null;created_at:string}[];
};
type PendingData = {
  leaves: (LeaveRequest & { employee: { nameAr: string; department: string } | null; history: ReviewHistory })[];
  permissions: (AttendancePermission & { employee: { nameAr: string; department: string } | null; history: ReviewHistory })[];
};

function ReviewerHistory({history}:{history:ReviewHistory}) {
  const {t}=useLanguage();
  return <details className="text-xs mt-2 max-w-md">
    <summary className="cursor-pointer underline">{t("مراجعة السجل الكامل والقرارات", "Review full history and decisions")}</summary>
    <div className="space-y-2 max-h-64 overflow-auto py-2">
      {history.leaves?.map(r=><p key={`l${r.id}`}>#{r.id} · {r.leaveType} · {r.startDate} — {r.endDate} · {r.status} · {r.reason}</p>)}
      {history.permissions?.map(r=><p key={`p${r.id}`}>#{r.id} · {r.type} · {r.date} {r.startTime} — {r.formDetails?.returnDate || r.date} {r.endTime} · {r.hoursRequested} {t("ساعة","hours")} · {r.status} · {r.reason}</p>)}
      {history.decisions?.map(r=><p key={`d${r.id}`}>{r.kind} #{r.request_id} · {r.decision} · {r.note} · {r.created_at}</p>)}
    </div>
  </details>;
}

type ReportRow = {
  employeeId: number; nameAr: string; department: string;
  leaves: number; permissions: number; total: number; approved: number; rejected: number; approvalRate: number | null;
};

export default function LeavesPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: "", leaveType: "annual", startDate: "", endDate: "", reason: "" });
  const [leaveFormData, setLeaveFormData] = useState<LeaveFormInput>({});
  const [balanceEmp, setBalanceEmp] = useState("");
  const [decisionTarget, setDecisionTarget] = useState<{ kind: "leave" | "permission"; id: number } | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [selectedMedicalLeaveId, setSelectedMedicalLeaveId] = useState<number | null>(null);
  const [reportMonth, setReportMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const { data: leaves = [], isLoading } = useQuery<LeaveRequest[]>({ queryKey: ["/api/leaves"] });
  const { data: employees = [] } = useQuery<Employee[]>({ queryKey: ["/api/employees"] });
  const { data: pending } = useQuery<PendingData>({ queryKey: ["/api/pending-requests"] });
  const { data: report } = useQuery<{ period: string; results: ReportRow[] }>({
    queryKey: ["/api/requests-report", reportMonth],
    queryFn: async () => {
      const res = await fetch(`/api/requests-report?month=${reportMonth}`, { credentials: "include" });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });

  const empName = (id: number | null) => {
    if (!id) return "—";
    const e = employees.find(x => x.id === id);
    return e?.fullNameAr || e?.fullNameEn || `#${id}`;
  };
  const typeName = (v: string) => { const x = LEAVE_TYPES.find(x => x.value === v); return x ? t(x.ar, x.en) : v; };

  const { data: balance } = useQuery<{ entitlement: number; used: number; remaining: number; year: string }>({
    queryKey: ["/api/leaves/balance", balanceEmp],
    queryFn: async () => {
      const res = await fetch(`/api/leaves/balance/${balanceEmp}`, { credentials: "include" });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    enabled: !!balanceEmp,
  });

  const createMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/leaves", { ...form, leaveFormData }),
    onSuccess: () => {
      setLeaveFormData({});
      queryClient.invalidateQueries({ queryKey: ["/api/leaves"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pending-requests"] });
      setOpen(false);
      setForm({ employeeId: "", leaveType: "annual", startDate: "", endDate: "", reason: "" });
      toast({ title: t("تم تسجيل طلب الإجازة", "Leave request submitted") });
    },
    onError: () => toast({ title: t("حدث خطأ في التسجيل", "Error creating request"), variant: "destructive" }),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/leaves"] });
    queryClient.invalidateQueries({ queryKey: ["/api/leaves/balance"] });
    queryClient.invalidateQueries({ queryKey: ["/api/pending-requests"] });
    queryClient.invalidateQueries({ queryKey: ["/api/requests-report"] });
  };

  const decideMutation = useMutation({
    mutationFn: ({ kind, id, decision, notes }: { kind: "leave" | "permission"; id: number; decision: string; notes?: string }) =>
      apiRequest("POST", kind === "leave" ? `/api/leaves/${id}/decision` : `/api/attendance/permission/${id}/decision`, { decision, notes }),
    onSuccess: () => {
      invalidateAll();
      setDecisionTarget(null);
      setDecisionNote("");
      toast({ title: t("تم تحديث الطلب", "Request updated") });
    },
    onError: async (err: any) => {
      let msg = t("حدث خطأ", "Error");
      try { const j = await err.json?.(); if (j?.message) msg = j.message; } catch {}
      toast({ title: msg, variant: "destructive" });
    },
  });

  const statusBadge = (s: string) => {
    if (s === "approved" || s === "auto_approved") return <Badge variant="outline" className="gap-1 border-green-500 text-green-600 dark:text-green-400"><CheckCircle2 className="w-3 h-3" />{t("معتمدة", "Approved")}</Badge>;
    if (s === "rejected") return <Badge variant="outline" className="gap-1 border-red-500 text-red-600 dark:text-red-400"><XCircle className="w-3 h-3" />{t("مرفوضة", "Rejected")}</Badge>;
    if (s === "manager_approved") return <Badge variant="outline" className="gap-1 border-blue-500 text-blue-600 dark:text-blue-400"><UserCheck className="w-3 h-3" />{t("وافق المدير — بانتظار HR", "Manager OK — HR pending")}</Badge>;
    if (s === "clarification_requested") return <Badge variant="outline" className="gap-1 border-purple-500 text-purple-600 dark:text-purple-400"><HelpCircle className="w-3 h-3" />{t("بانتظار توضيح", "Needs clarification")}</Badge>;
    return <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600 dark:text-amber-400"><Clock className="w-3 h-3" />{t("بانتظار", "Pending")}</Badge>;
  };

  const decisionButtons = (kind: "leave" | "permission", id: number) => (
    <div className="flex flex-wrap gap-2">
      {kind === "permission" && <a className="text-sm underline" href={`/api/hr-permissions/${id}/document`} target="_blank" rel="noreferrer">{t("النموذج الكامل / طباعة", "Full form / Print")}</a>}
      <Button size="sm" disabled={decideMutation.isPending} onClick={() => decideMutation.mutate({ kind, id, decision: "approve" })} data-testid={`button-approve-${kind}-${id}`}>{t("اعتماد", "Approve")}</Button>
      <Button size="sm" variant="outline" disabled={decideMutation.isPending} onClick={() => { setDecisionTarget({ kind, id }); setDecisionNote(""); }} data-testid={`button-reject-${kind}-${id}`}>{t("رفض / توضيح", "Reject / Clarify")}</Button>
    </div>
  );

  const pendingCount = (pending?.leaves.length || 0) + (pending?.permissions.length || 0);

  return (
    <div className="space-y-6">
      <HrDueTerminations />
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-leaves-title">
            <CalendarDays className="w-6 h-6" />{t("إدارة الإجازات والطلبات", "Leaves & Requests")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("اعتماد بخطوتين: المدير المباشر ثم الموارد البشرية", "Two-step approval: direct manager then HR")}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-leave"><Plus className="w-4 h-4 me-1" />{t("طلب إجازة", "New Request")}</Button>
          </DialogTrigger>
          <DialogContent className="w-[96vw] max-w-3xl max-h-[94dvh] overflow-y-auto">
            <DialogHeader><DialogTitle>{t("طلب إجازة", "Leave Request")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>{t("الموظف", "Employee")}</Label>
                <Select value={form.employeeId} onValueChange={v => setForm(f => ({ ...f, employeeId: v }))}>
                  <SelectTrigger data-testid="select-leave-employee"><SelectValue placeholder={t("اختر الموظف", "Select employee")} /></SelectTrigger>
                  <SelectContent>
                    {employees.filter(e => e.status === "active").map(e => (<SelectItem key={e.id} value={String(e.id)}>{empName(e.id)}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t("نوع الإجازة", "Leave Type")}</Label>
                <Select value={form.leaveType} onValueChange={v => setForm(f => ({ ...f, leaveType: v }))}>
                  <SelectTrigger data-testid="select-leave-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEAVE_TYPES.map(x => (<SelectItem key={x.value} value={x.value}>{t(x.ar, x.en)}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t("من", "From")}</Label>
                  <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} data-testid="input-leave-start" />
                </div>
                <div className="space-y-1">
                  <Label>{t("إلى", "To")}</Label>
                  <Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} data-testid="input-leave-end" />
                </div>
              </div>
              <div className="space-y-1">
                <Label>{t("السبب (اختياري)", "Reason (optional)")}</Label>
                <Textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} data-testid="input-leave-reason" />
              </div>
              <HrLeaveFormFields value={leaveFormData} onChange={setLeaveFormData} employees={employees} employeeId={Number(form.employeeId)} />
            </div>
            <DialogFooter>
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.employeeId || !form.startDate || !form.endDate} data-testid="button-submit-leave">
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("إرسال", "Submit")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {pendingCount > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2" data-testid="text-pending-title">
              <Inbox className="w-4 h-4" />{t("طلبات بانتظار قرارك", "Requests awaiting your decision")}
              <Badge>{pendingCount}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="p-3 text-start font-medium">{t("الموظف", "Employee")}</th>
                  <th className="p-3 text-start font-medium">{t("النوع", "Type")}</th>
                  <th className="p-3 text-start font-medium">{t("التاريخ", "Date")}</th>
                  <th className="p-3 text-start font-medium">{t("السبب", "Reason")}</th>
                  <th className="p-3 text-start font-medium">{t("سجل الموظف", "History")}</th>
                  <th className="p-3 text-start font-medium">{t("الحالة", "Status")}</th>
                  <th className="p-3 text-start font-medium">{t("القرار", "Decision")}</th>
                </tr>
              </thead>
              <tbody>
                {pending?.leaves.map(l => (
                  <tr key={`l-${l.id}`} className="border-b last:border-0" data-testid={`row-pending-leave-${l.id}`}>
                    <td className="p-3 font-medium">{l.employee?.nameAr || empName(l.employeeId)}</td>
                    <td className="p-3">{t("إجازة", "Leave")} — {typeName(l.leaveType)}</td>
                    <td className="p-3" dir="ltr">{l.startDate} → {l.endDate} ({l.days})</td>
                    <td className="p-3 max-w-48 truncate">{l.reason || "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {t(`إجازات: ${l.history.totalLeaves} | استئذانات: ${l.history.totalPermissions} | مقبول: ${l.history.approved} | مرفوض: ${l.history.rejected}`,
                        `Leaves: ${l.history.totalLeaves} | Perms: ${l.history.totalPermissions} | OK: ${l.history.approved} | No: ${l.history.rejected}`)}
                      <ReviewerHistory history={l.history} />
                    </td>
                    <td className="p-3">{statusBadge(l.status)}</td>
                    <td className="p-3 space-y-2">
                      {decisionButtons("leave", l.id)}
                      <Button size="sm" variant="ghost" aria-expanded={selectedMedicalLeaveId === l.id}
                        onClick={() => setSelectedMedicalLeaveId(current => current === l.id ? null : l.id)}>
                        {t("المرفقات الطبية", "Medical documents")}
                      </Button>
                      {selectedMedicalLeaveId === l.id && <MedicalDocumentLinks leaveId={l.id} />}
                    </td>
                  </tr>
                ))}
                {pending?.permissions.map(p => (
                  <tr key={`p-${p.id}`} className="border-b last:border-0" data-testid={`row-pending-perm-${p.id}`}>
                    <td className="p-3 font-medium">{p.employee?.nameAr || empName(p.employeeId)}</td>
                    <td className="p-3">{t("استئذان", "Permission")} — {PERM_TYPES[p.type] ? t(PERM_TYPES[p.type].ar, PERM_TYPES[p.type].en) : p.type}</td>
                    <td className="p-3" dir="ltr"><div>{p.date} {p.startTime || ""}</div><div>— {p.formDetails?.returnDate || p.date} {p.endTime || ""}</div></td>
                    <td className="p-3 max-w-48 truncate">{p.reason || "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {t(`إجازات: ${p.history.totalLeaves} | استئذانات: ${p.history.totalPermissions} | مقبول: ${p.history.approved} | مرفوض: ${p.history.rejected}`,
                        `Leaves: ${p.history.totalLeaves} | Perms: ${p.history.totalPermissions} | OK: ${p.history.approved} | No: ${p.history.rejected}`)}
                      <ReviewerHistory history={p.history} />
                    </td>
                    <td className="p-3">{statusBadge(p.status)}</td>
                    <td className="p-3">{decisionButtons("permission", p.id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Card><CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="space-y-1">
          <Label className="text-xs">{t("رصيد الإجازة السنوية لموظف", "Annual balance for employee")}</Label>
          <Select value={balanceEmp} onValueChange={setBalanceEmp}>
            <SelectTrigger className="w-56" data-testid="select-balance-employee"><SelectValue placeholder={t("اختر الموظف", "Select employee")} /></SelectTrigger>
            <SelectContent>
              {employees.filter(e => e.status === "active").map(e => (<SelectItem key={e.id} value={String(e.id)}>{empName(e.id)}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        {balance && (
          <div className="flex gap-6 text-sm" data-testid="text-balance">
            <div><div className="text-2xl font-bold">{balance.entitlement}</div><div className="text-xs text-muted-foreground">{t("الاستحقاق", "Entitlement")}</div></div>
            <div><div className="text-2xl font-bold text-amber-600">{balance.used}</div><div className="text-xs text-muted-foreground">{t("المستخدم", "Used")}</div></div>
            <div><div className="text-2xl font-bold text-green-600">{balance.remaining}</div><div className="text-xs text-muted-foreground">{t("المتبقي", "Remaining")}</div></div>
          </div>
        )}
      </CardContent></Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : leaves.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground" data-testid="text-empty">{t("لا توجد طلبات إجازة", "No leave requests")}</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="p-3 text-start font-medium">{t("الموظف", "Employee")}</th>
                  <th className="p-3 text-start font-medium">{t("النوع", "Type")}</th>
                  <th className="p-3 text-start font-medium">{t("من", "From")}</th>
                  <th className="p-3 text-start font-medium">{t("إلى", "To")}</th>
                  <th className="p-3 text-start font-medium">{t("الأيام", "Days")}</th>
                  <th className="p-3 text-start font-medium">{t("الحالة", "Status")}</th>
                  <th className="p-3 text-start font-medium">{t("إجراءات", "Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {leaves.map(l => (
                  <tr key={l.id} className="border-b last:border-0" data-testid={`row-leave-${l.id}`}>
                    <td className="p-3 font-medium">{empName(l.employeeId)}</td>
                    <td className="p-3">{typeName(l.leaveType)}</td>
                    <td className="p-3" dir="ltr">{l.startDate}</td>
                    <td className="p-3" dir="ltr">{l.endDate}</td>
                    <td className="p-3 font-semibold">{l.days}</td>
                    <td className="p-3">{statusBadge(l.status)}</td>
                    <td className="p-3">
                      {(l.status === "pending" || l.status === "manager_approved" || l.status === "clarification_requested") && decisionButtons("leave", l.id)}
                      <div className="mt-2">
                        <Button size="sm" variant="ghost" aria-expanded={selectedMedicalLeaveId === l.id}
                          onClick={() => setSelectedMedicalLeaveId(current => current === l.id ? null : l.id)}>
                          {t("المرفقات الطبية", "Medical documents")}
                        </Button>
                        {selectedMedicalLeaveId === l.id && <MedicalDocumentLinks leaveId={l.id} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2" data-testid="text-report-title">
            <BarChart3 className="w-4 h-4" />{t("تقرير الطلبات الشهري", "Monthly requests report")}
          </CardTitle>
          <Input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} className="w-44" data-testid="input-report-month" />
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {!report || report.results.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm" data-testid="text-report-empty">{t("لا توجد طلبات في هذا الشهر", "No requests this month")}</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="p-3 text-start font-medium">{t("الموظف", "Employee")}</th>
                  <th className="p-3 text-start font-medium">{t("إجازات", "Leaves")}</th>
                  <th className="p-3 text-start font-medium">{t("استئذانات", "Permissions")}</th>
                  <th className="p-3 text-start font-medium">{t("الإجمالي", "Total")}</th>
                  <th className="p-3 text-start font-medium">{t("مقبول", "Approved")}</th>
                  <th className="p-3 text-start font-medium">{t("مرفوض", "Rejected")}</th>
                  <th className="p-3 text-start font-medium">{t("نسبة القبول", "Approval rate")}</th>
                </tr>
              </thead>
              <tbody>
                {report.results.map(r => (
                  <tr key={r.employeeId} className="border-b last:border-0" data-testid={`row-report-${r.employeeId}`}>
                    <td className="p-3 font-medium">{r.nameAr}</td>
                    <td className="p-3">{r.leaves}</td>
                    <td className="p-3">{r.permissions}</td>
                    <td className="p-3 font-semibold">{r.total}</td>
                    <td className="p-3 text-green-600">{r.approved}</td>
                    <td className="p-3 text-red-600">{r.rejected}</td>
                    <td className="p-3">{r.approvalRate === null ? "—" : `${r.approvalRate}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!decisionTarget} onOpenChange={o => { if (!o) { setDecisionTarget(null); setDecisionNote(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("رفض أو طلب توضيح", "Reject or request clarification")}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>{t("الملاحظة / السبب", "Note / Reason")}</Label>
            <Textarea value={decisionNote} onChange={e => setDecisionNote(e.target.value)} placeholder={t("اكتب السبب أو ما يحتاج توضيحاً…", "Write the reason or what needs clarification…")} data-testid="input-decision-note" />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="destructive" disabled={decideMutation.isPending}
              onClick={() => decisionTarget && decideMutation.mutate({ ...decisionTarget, decision: "reject", notes: decisionNote })}
              data-testid="button-confirm-reject">{t("رفض الطلب", "Reject")}</Button>
            <Button variant="outline" disabled={decideMutation.isPending || !decisionNote.trim()}
              onClick={() => decisionTarget && decideMutation.mutate({ ...decisionTarget, decision: "clarify", notes: decisionNote })}
              data-testid="button-confirm-clarify">{t("طلب توضيح", "Request clarification")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
