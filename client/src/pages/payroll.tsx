import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { HrExpandedWorkspace } from "@/components/hr-report";
import type { PayrollRecord, Employee } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Wallet, Users, CheckCircle2, Clock, Banknote } from "lucide-react";

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const fmt = (v: any) => Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PayrollPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();
  const canPay = ["owner", "accountant"].includes(user?.role || "");
  const canPrepare = ["owner", "hr"].includes(user?.role || "");
  const [selected, setSelected] = useState<number[]>([]);
  const [bulkResults, setBulkResults] = useState<{ id: number; ok: boolean; message: string }[]>([]);
  const [period, setPeriod] = useState(currentPeriod());
  const [edits, setEdits] = useState<Record<number, { allowances: string; deductions: string }>>({});

  const { data: records = [], isLoading, error: loadError } = useQuery<PayrollRecord[]>({
    queryKey: ["/api/payroll", period],
    queryFn: async () => {
      const res = await fetch(`/api/payroll?period=${encodeURIComponent(period)}`, { credentials: "include" });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });

  const { data: employees = [] } = useQuery<Employee[]>({ queryKey: ["/api/employees"] });
  const bulkMutation = useMutation({
    mutationFn: async (action: "approve" | "pay") => {
      const response = await apiRequest("POST", "/api/payroll/bulk", { ids: selected, action });
      return response.json();
    },
    onSuccess: (data: { results: { id: number; ok: boolean; message: string }[] }) => {
      setBulkResults(data.results);
      setSelected(data.results.filter(r => !r.ok).map(r => r.id));
      queryClient.invalidateQueries({ queryKey: ["/api/payroll", period] });
    },
    onError: (error: Error) => toast({ title: error.message, variant: "destructive" }),
  });
  const empName = (id: number) => {
    const e = employees.find(x => x.id === id);
    return e?.fullNameAr || e?.fullNameEn || `#${id}`;
  };

  const generateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/payroll/generate", { period }),
    onSuccess: async (res: any) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/payroll", period] });
      toast({ title: t(`تم إنشاء ${data.created} سجل راتب`, `Generated ${data.created} payroll records`) });
    },
    onError: () => toast({ title: t("حدث خطأ في الإنشاء", "Error generating payroll"), variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/payroll/${id}`, data),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll", period] });
      setEdits(prev => { const n = { ...prev }; delete n[vars.id]; return n; });
      toast({ title: t("تم الحفظ", "Saved") });
    },
    onError: () => toast({ title: t("حدث خطأ في الحفظ", "Error saving"), variant: "destructive" }),
  });

  const payMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/payroll/${id}/pay`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll", period] });
      toast({ title: t("تم صرف الراتب وتسجيل القيد", "Salary paid and journal posted") });
    },
    onError: () => toast({ title: t("حدث خطأ في الصرف", "Error processing payment"), variant: "destructive" }),
  });

  const editVal = (r: PayrollRecord, field: "allowances" | "deductions") =>
    edits[r.id]?.[field] ?? r[field].toString();

  const setEdit = (r: PayrollRecord, field: "allowances" | "deductions", value: string) =>
    setEdits(prev => ({
      ...prev,
      [r.id]: {
        allowances: prev[r.id]?.allowances ?? r.allowances.toString(),
        deductions: prev[r.id]?.deductions ?? r.deductions.toString(),
        [field]: value,
      },
    }));

  const previewNet = (r: PayrollRecord) => {
    const basic = Number(r.basicSalary || 0);
    const a = Number(editVal(r, "allowances") || 0);
    const d = Number(editVal(r, "deductions") || 0);
    const adv = Number(r.advanceDeduction || 0);
    return Math.max(0, basic + a - d - adv);
  };

  const totalNet = records.reduce((s, r) => s + Number(r.netSalary || 0), 0);
  const paidCount = records.filter(r => r.status === "paid").length;
  const draftCount = records.filter(r => r.status === "draft").length;

  return (
    <HrExpandedWorkspace>
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-payroll-title">
            <Wallet className="w-6 h-6" />{t("مسيّر الرواتب", "Payroll")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("إنشاء ومعالجة رواتب الموظفين شهرياً", "Generate and process monthly employee salaries")}</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">{t("الشهر", "Month")}</Label>
            <Input type="month" value={period} onChange={e => { setPeriod(e.target.value); setSelected([]); setBulkResults([]); setEdits({}); }} className="w-40" data-testid="input-payroll-period" />
          </div>
          {canPrepare && <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending} data-testid="button-generate-payroll">
            {generateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("إنشاء المسيّر", "Generate")}
          </Button>}
        </div>
      </div>

      {loadError && <p role="alert" className="rounded-lg border border-destructive p-3 text-destructive">{t("تعذر تحميل مسير الرواتب. أعد المحاولة؛ لا تُعتبر القائمة الفارغة نتيجة صحيحة.", "Payroll could not be loaded. Retry; an empty list is not a valid result.")}</p>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <Users className="w-8 h-8 text-muted-foreground" />
          <div><div className="text-2xl font-bold" data-testid="stat-count">{records.length}</div><div className="text-xs text-muted-foreground">{t("عدد الموظفين", "Employees")}</div></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <Banknote className="w-8 h-8 text-primary" />
          <div><div className="text-2xl font-bold" data-testid="stat-total-net">{fmt(totalNet)}</div><div className="text-xs text-muted-foreground">{t("إجمالي الصافي (ر.س)", "Total Net (SAR)")}</div></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <CheckCircle2 className="w-8 h-8 text-green-600" />
          <div><div className="text-2xl font-bold" data-testid="stat-paid">{paidCount}</div><div className="text-xs text-muted-foreground">{t("مدفوع", "Paid")}</div></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <Clock className="w-8 h-8 text-amber-500" />
          <div><div className="text-2xl font-bold" data-testid="stat-draft">{draftCount}</div><div className="text-xs text-muted-foreground">{t("مسودة", "Draft")}</div></div>
        </CardContent></Card>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <p className="text-sm">{t("حدد السجلات غير المدفوعة والخالية من تعديلات غير محفوظة. الاعتماد لا يعني الصرف.", "Select unpaid records without unsaved edits. Approval does not disburse funds.")}</p>
        <div className="flex flex-wrap items-center gap-3">
          {canPrepare && <Button variant="outline" onClick={() => setSelected(records.filter(r => r.status === "draft" && !edits[r.id]).map(r => r.id))}>{t("تحديد كل المؤهل للاعتماد", "Select all eligible for approval")}</Button>}
          {canPay && <Button variant="outline" onClick={() => setSelected(records.filter(r => String(r.status) === "approved" && !edits[r.id]).map(r => r.id))}>{t("تحديد كل المؤهل للصرف", "Select all eligible for payment")}</Button>}
          <Button variant="ghost" onClick={() => setSelected([])}>{t("مسح التحديد", "Clear selection")}</Button>
          <span>{t("المحدد", "Selected")}: {selected.length}</span>
          {canPrepare && <Button disabled={!selected.length || bulkMutation.isPending || selected.some(id => !!edits[id] || records.find(r => r.id === id)?.status !== "draft")} onClick={() => bulkMutation.mutate("approve")}>{t("اعتماد المحدد", "Approve selected")}</Button>}
          {canPay && <Button disabled={!selected.length || bulkMutation.isPending || selected.some(id => !!edits[id] || String(records.find(r => r.id === id)?.status) !== "approved")} onClick={() => { if (window.confirm(t(`تأكيد صرف ${selected.length} راتب وتسجيل القيود؟`, `Pay ${selected.length} salaries and post journals?`))) bulkMutation.mutate("pay"); }}>{t("صرف المحدد", "Pay selected")}</Button>}
        </div>
        {bulkResults.length > 0 && <ul aria-live="polite" className="space-y-2">{bulkResults.map(result => <li key={result.id} className={result.ok ? "text-green-700" : "text-destructive"}>{empName(records.find(r => r.id === result.id)?.employeeId || 0)} — {result.ok ? t("نجح", "Success") : t("فشل", "Failed")}: {result.message}</li>)}</ul>}
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : records.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground" data-testid="text-empty">
              {t("لا توجد سجلات لهذا الشهر. اضغط \"إنشاء المسيّر\" لإنشائها.", "No records for this month. Click \"Generate\" to create them.")}
            </div>
          ) : (
            <table className="w-full text-sm hr-responsive">
              <thead className="border-b bg-muted/40">
                <tr className="text-start">
                  <th className="p-3">{t("تحديد", "Select")}</th>
                  <th className="p-3 text-start font-medium">{t("الموظف", "Employee")}</th>
                  <th className="p-3 text-start font-medium">{t("الأساسي", "Basic")}</th>
                  <th className="p-3 text-start font-medium">{t("بدلات", "Allowances")}</th>
                  <th className="p-3 text-start font-medium">{t("خصومات", "Deductions")}</th>
                  <th className="p-3 text-start font-medium">{t("سلفة", "Advance")}</th>
                  <th className="p-3 text-start font-medium">{t("الصافي", "Net")}</th>
                  <th className="p-3 text-start font-medium">{t("الحالة", "Status")}</th>
                  <th className="p-3 text-start font-medium">{t("إجراءات", "Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {records.map(r => {
                  const isPaid = r.status === "paid";
                  const dirty = !!edits[r.id];
                  return (
                    <tr key={r.id} className="border-b last:border-0" data-testid={`row-payroll-${r.id}`}>
                      <td data-label={t("تحديد", "Select")} className="p-3"><input type="checkbox" className="w-5 h-5" aria-label={`${t("تحديد", "Select")} ${empName(r.employeeId)}`} disabled={isPaid || dirty || bulkMutation.isPending} checked={selected.includes(r.id)} onChange={e => setSelected(ids => e.target.checked ? [...ids, r.id] : ids.filter(id => id !== r.id))} /></td>
                      <td data-label={t("الموظف", "Employee")} className="p-3 font-medium" data-testid={`text-emp-${r.id}`}>{empName(r.employeeId)}</td>
                      <td data-label={t("الأساسي", "Basic")} className="p-3">{fmt(r.basicSalary)}</td>
                      <td data-label={t("بدلات", "Allowances")} className="p-3">
                        <Input aria-label={t("بدلات", "Allowances")} type="number" min="0" value={editVal(r, "allowances")} disabled={r.status !== "draft" || !canPrepare}
                          onChange={e => setEdit(r, "allowances", e.target.value)} className="w-24 h-8" data-testid={`input-allowances-${r.id}`} />
                      </td>
                      <td data-label={t("خصومات", "Deductions")} className="p-3">
                        <Input aria-label={t("خصومات", "Deductions")} type="number" min="0" value={editVal(r, "deductions")} disabled={r.status !== "draft" || !canPrepare}
                          onChange={e => setEdit(r, "deductions", e.target.value)} className="w-24 h-8" data-testid={`input-deductions-${r.id}`} />
                      </td>
                      <td data-label={t("سلفة", "Advance")} className="p-3 text-muted-foreground" data-testid={`text-advance-${r.id}`}>{fmt(r.advanceDeduction)}</td>
                      <td data-label={t("الصافي", "Net")} className="p-3 font-semibold" data-testid={`text-net-${r.id}`}>{fmt(isPaid ? r.netSalary : previewNet(r))}</td>
                      <td data-label={t("الحالة", "Status")} className="p-3">
                        {isPaid ? (
                          <Badge variant="outline" className="gap-1 border-green-500 text-green-600 dark:text-green-400"><CheckCircle2 className="w-3 h-3" />{t("مدفوع", "Paid")}</Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600 dark:text-amber-400"><Clock className="w-3 h-3" />{String(r.status) === "approved" ? t("معتمد", "Approved") : t("مسودة", "Draft")}</Badge>
                        )}
                      </td>
                      <td data-label={t("إجراءات", "Actions")} className="p-3">
                        {!isPaid && (
                          <div className="flex gap-2">
                            {dirty && (
                              <Button size="sm" variant="outline" disabled={updateMutation.isPending}
                                onClick={() => updateMutation.mutate({ id: r.id, data: { allowances: editVal(r, "allowances"), deductions: editVal(r, "deductions") } })}
                                data-testid={`button-save-${r.id}`}>
                                {t("حفظ", "Save")}
                              </Button>
                            )}
                            {canPay && <Button size="sm" disabled={String(r.status) !== "approved" || dirty || payMutation.isPending || bulkMutation.isPending}
                              onClick={() => { if (window.confirm(t("تأكيد صرف الراتب وتسجيل القيد؟", "Pay salary and post journal?"))) payMutation.mutate(r.id); }} data-testid={`button-pay-${r.id}`}>
                              {t("صرف", "Pay")}
                            </Button>}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
    </HrExpandedWorkspace>
  );
}
