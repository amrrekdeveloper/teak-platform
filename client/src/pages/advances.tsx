import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { toLatinEditableDigits } from "@shared/digits";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { HrExpandedWorkspace, ReportPreview, type ReportData } from "@/components/hr-report";
import type { EmployeeAdvance, Employee } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, HandCoins, Plus, CheckCircle2, XCircle, Clock } from "lucide-react";

const fmt = (v: any) => Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function AdvancesPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();
  const canDisburse = ["owner", "accountant"].includes(user?.role || "");
  const [report, setReport] = useState<ReportData | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: "", amount: "", installments: "1", reason: "" });

  const { data: advances = [], isLoading, error: loadError } = useQuery<EmployeeAdvance[]>({ queryKey: ["/api/advances"] });
  const { data: employees = [] } = useQuery<Employee[]>({ queryKey: ["/api/employees"] });
  const empName = (id: number) => {
    const e = employees.find(x => x.id === id);
    return e?.fullNameAr || e?.fullNameEn || `#${id}`;
  };

  const createMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/advances", {
      employeeId: Number(form.employeeId), amount: form.amount, installments: Number(form.installments), reason: form.reason,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/advances"] });
      setOpen(false);
      setForm({ employeeId: "", amount: "", installments: "1", reason: "" });
      toast({ title: t("تم تسجيل السلفة", "Advance recorded") });
    },
    onError: () => toast({ title: t("حدث خطأ في التسجيل", "Error creating advance"), variant: "destructive" }),
  });

  const decideMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: "approve" | "reject" }) => apiRequest("POST", `/api/advances/${id}/${action}`, {}),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/advances"] });
      toast({ title: vars.action === "approve" ? t("تم اعتماد وصرف السلفة", "Advance approved & disbursed") : t("تم رفض السلفة", "Advance rejected") });
    },
    onError: async (err: any) => {
      let msg = t("حدث خطأ", "Error");
      try { const d = await err?.response?.json?.(); if (d?.message) msg = d.message; } catch {}
      toast({ title: msg, variant: "destructive" });
    },
  });

  const statusBadge = (s: string) => {
    if (s === "approved") return <Badge variant="outline" className="gap-1 border-blue-500 text-blue-600 dark:text-blue-400"><CheckCircle2 className="w-3 h-3" />{t("نشطة", "Active")}</Badge>;
    if (s === "settled") return <Badge variant="outline" className="gap-1 border-green-500 text-green-600 dark:text-green-400"><CheckCircle2 className="w-3 h-3" />{t("مسددة", "Settled")}</Badge>;
    if (s === "rejected") return <Badge variant="outline" className="gap-1 border-red-500 text-red-600 dark:text-red-400"><XCircle className="w-3 h-3" />{t("مرفوضة", "Rejected")}</Badge>;
    return <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600 dark:text-amber-400"><Clock className="w-3 h-3" />{t("بانتظار الاعتماد", "Pending")}</Badge>;
  };

  const totalOutstanding = advances.filter(a => a.status === "approved").reduce((s, a) => s + Number(a.remainingAmount || 0), 0);

  return (
    <HrExpandedWorkspace>
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-advances-title">
            <HandCoins className="w-6 h-6" />{t("سلف الموظفين", "Employee Advances")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("طلب واعتماد السلف وخصمها تلقائياً من الراتب", "Request, approve and auto-deduct advances from payroll")}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          {["owner", "hr"].includes(user?.role || "") && <DialogTrigger asChild>
            <Button data-testid="button-new-advance"><Plus className="w-4 h-4 me-1" />{t("سلفة جديدة", "New Advance")}</Button>
          </DialogTrigger>}
          <DialogContent className="max-h-[94dvh] overflow-y-auto">
            <DialogHeader><DialogTitle>{t("سلفة جديدة", "New Advance")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>{t("الموظف", "Employee")}</Label>
                <Select value={form.employeeId} onValueChange={v => setForm(f => ({ ...f, employeeId: v }))}>
                  <SelectTrigger data-testid="select-advance-employee"><SelectValue placeholder={t("اختر الموظف", "Select employee")} /></SelectTrigger>
                  <SelectContent>
                    {employees.filter(e => e.status === "active").map(e => (
                      <SelectItem key={e.id} value={String(e.id)}>{empName(e.id)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t("المبلغ (ر.س)", "Amount (SAR)")}</Label>
                  <Input type="text" inputMode="decimal" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: toLatinEditableDigits(e.target.value) }))} data-testid="input-advance-amount" />
                </div>
                <div className="space-y-1">
                  <Label>{t("عدد الأقساط", "Installments")}</Label>
                  <Input type="text" inputMode="numeric" value={form.installments} onChange={e => setForm(f => ({ ...f, installments: toLatinEditableDigits(e.target.value) }))} data-testid="input-advance-installments" />
                </div>
              </div>
              {Number(form.amount) > 0 && Number(form.installments) > 0 && (
                <p className="text-xs text-muted-foreground" data-testid="text-monthly-preview">
                  {t("الخصم الشهري المتوقع:", "Expected monthly deduction:")} {fmt(Number(form.amount) / Number(form.installments))} {t("ر.س", "SAR")}
                </p>
              )}
              <div className="space-y-1">
                <Label>{t("السبب (اختياري)", "Reason (optional)")}</Label>
                <Textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} data-testid="input-advance-reason" />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.employeeId || !(Number(form.amount) > 0) || !Number.isInteger(Number(form.installments)) || Number(form.installments) < 1} data-testid="button-submit-advance">
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("حفظ", "Save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <p className="rounded-lg border p-3 text-sm text-muted-foreground">{t("النموذج الرسمي للقرض والأرشفة الآلية معلقان لحين توفير الأصل المعتمد وربط بياناته. التقرير أدناه سجل مالي وليس بديلاً عن النموذج الرسمي. الصرف للمالك / المحاسب فقط.", "The official loan form and automatic archival await the approved original and its data integration. The report below is a financial record, not the official form. Only owner/accountant may disburse.")}</p>

      {loadError && <p role="alert" className="text-destructive">{t("تعذر تحميل السلف. أعد المحاولة.", "Could not load advances. Please retry.")}</p>}
      <Card><CardContent className="p-4 flex items-center gap-3">
        <HandCoins className="w-8 h-8 text-primary" />
        <div><div className="text-2xl font-bold" data-testid="stat-outstanding">{fmt(totalOutstanding)}</div><div className="text-xs text-muted-foreground">{t("إجمالي السلف القائمة (ر.س)", "Total outstanding advances (SAR)")}</div></div>
      </CardContent></Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : advances.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground" data-testid="text-empty">{t("لا توجد سلف مسجلة", "No advances recorded")}</div>
          ) : (
            <table className="w-full text-sm hr-responsive">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="p-3 text-start font-medium">{t("الموظف", "Employee")}</th>
                  <th className="p-3 text-start font-medium">{t("المبلغ", "Amount")}</th>
                  <th className="p-3 text-start font-medium">{t("الأقساط", "Installments")}</th>
                  <th className="p-3 text-start font-medium">{t("الخصم الشهري", "Monthly")}</th>
                  <th className="p-3 text-start font-medium">{t("المتبقي", "Remaining")}</th>
                  <th className="p-3 text-start font-medium">{t("الحالة", "Status")}</th>
                  <th className="p-3 text-start font-medium">{t("إجراءات", "Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {advances.map(a => (
                  <tr key={a.id} className="border-b last:border-0" data-testid={`row-advance-${a.id}`}>
                    <td data-label={t("الموظف", "Employee")} className="p-3 font-medium">{empName(a.employeeId)}</td>
                    <td data-label={t("المبلغ", "Amount")} className="p-3">{fmt(a.amount)}</td>
                    <td data-label={t("الأقساط", "Installments")} className="p-3">{a.installments}</td>
                    <td data-label={t("القسط", "Monthly")} className="p-3">{fmt(a.monthlyDeduction)}</td>
                    <td data-label={t("المتبقي", "Remaining")} className="p-3 font-semibold" data-testid={`text-remaining-${a.id}`}>{fmt(a.remainingAmount)}</td>
                    <td data-label={t("الحالة", "Status")} className="p-3">{statusBadge(a.status)}</td>
                    <td data-label={t("إجراءات", "Actions")} className="p-3 flex-wrap">
                      <Button variant="outline" size="sm" onClick={() => {
                        const employee = employees.find(e => e.id === a.employeeId);
                        setReport({ title: t("سجل السلفة — ليس النموذج الرسمي", "Advance record — not the official form"), subtitle: `${empName(a.employeeId)} | #${a.id} | ${a.status}`,
                          headings: [t("البيان", "Field"), t("القيمة", "Value")],
                          rows: [[t("رقم الموظف", "Employee number"), employee?.employeeNumber || "—"], [t("القسم", "Department"), employee?.department || "—"], [t("المسمى", "Position"), employee?.position || "—"], [t("تاريخ التعيين", "Hiring date"), employee?.contractStart || "—"], [t("الراتب", "Salary"), employee?.monthlySalary || "—"], [t("المبلغ", "Amount"), fmt(a.amount)], [t("الأقساط", "Installments"), a.installments], [t("القسط الشهري", "Monthly installment"), fmt(a.monthlyDeduction)], [t("المتبقي", "Remaining"), fmt(a.remainingAmount)], [t("السبب", "Reason"), a.reason || "—"]] });
                      }}>{t("فتح / PDF", "Open / PDF")}</Button>
                      {a.status === "pending" && (
                        <div className="flex gap-2">
                          {canDisburse && <Button size="sm" disabled={decideMutation.isPending} onClick={() => { if (window.confirm(t("تأكيد اعتماد وصرف السلفة؟", "Approve and disburse this advance?"))) decideMutation.mutate({ id: a.id, action: "approve" }); }} data-testid={`button-approve-${a.id}`}>{t("اعتماد وصرف", "Approve & pay")}</Button>}
                          {["owner", "hr"].includes(user?.role || "") && <Button size="sm" variant="outline" disabled={decideMutation.isPending} onClick={() => decideMutation.mutate({ id: a.id, action: "reject" })} data-testid={`button-reject-${a.id}`}>{t("رفض", "Reject")}</Button>}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <ReportPreview report={report} onClose={() => setReport(null)} />
    </div>
    </HrExpandedWorkspace>
  );
}
