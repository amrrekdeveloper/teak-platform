import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { LeaveRequest, Employee } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CalendarDays, Plus, CheckCircle2, XCircle, Clock } from "lucide-react";

const LEAVE_TYPES: { value: string; ar: string; en: string }[] = [
  { value: "annual", ar: "سنوية", en: "Annual" },
  { value: "sick", ar: "مرضية", en: "Sick" },
  { value: "unpaid", ar: "بدون راتب", en: "Unpaid" },
  { value: "emergency", ar: "طارئة", en: "Emergency" },
  { value: "maternity", ar: "أمومة", en: "Maternity" },
  { value: "other", ar: "أخرى", en: "Other" },
];

export default function LeavesPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: "", leaveType: "annual", startDate: "", endDate: "", reason: "" });
  const [balanceEmp, setBalanceEmp] = useState("");

  const { data: leaves = [], isLoading } = useQuery<LeaveRequest[]>({ queryKey: ["/api/leaves"] });
  const { data: employees = [] } = useQuery<Employee[]>({ queryKey: ["/api/employees"] });
  const empName = (id: number) => {
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
    mutationFn: () => apiRequest("POST", "/api/leaves", form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leaves"] });
      setOpen(false);
      setForm({ employeeId: "", leaveType: "annual", startDate: "", endDate: "", reason: "" });
      toast({ title: t("تم تسجيل طلب الإجازة", "Leave request submitted") });
    },
    onError: () => toast({ title: t("حدث خطأ في التسجيل", "Error creating request"), variant: "destructive" }),
  });

  const decideMutation = useMutation({
    mutationFn: ({ id, decision }: { id: number; decision: "approved" | "rejected" }) => apiRequest("POST", `/api/leaves/${id}/decision`, { decision }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leaves"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leaves/balance"] });
      toast({ title: t("تم تحديث الطلب", "Request updated") });
    },
    onError: () => toast({ title: t("حدث خطأ", "Error"), variant: "destructive" }),
  });

  const statusBadge = (s: string) => {
    if (s === "approved") return <Badge variant="outline" className="gap-1 border-green-500 text-green-600 dark:text-green-400"><CheckCircle2 className="w-3 h-3" />{t("معتمدة", "Approved")}</Badge>;
    if (s === "rejected") return <Badge variant="outline" className="gap-1 border-red-500 text-red-600 dark:text-red-400"><XCircle className="w-3 h-3" />{t("مرفوضة", "Rejected")}</Badge>;
    return <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600 dark:text-amber-400"><Clock className="w-3 h-3" />{t("بانتظار", "Pending")}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-leaves-title">
            <CalendarDays className="w-6 h-6" />{t("إدارة الإجازات", "Leave Management")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("طلبات الإجازات واعتمادها ورصيد الإجازة السنوية", "Leave requests, approvals and annual balance")}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-leave"><Plus className="w-4 h-4 me-1" />{t("طلب إجازة", "New Request")}</Button>
          </DialogTrigger>
          <DialogContent>
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
            </div>
            <DialogFooter>
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.employeeId || !form.startDate || !form.endDate} data-testid="button-submit-leave">
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("إرسال", "Submit")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

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
                      {l.status === "pending" && (
                        <div className="flex gap-2">
                          <Button size="sm" disabled={decideMutation.isPending} onClick={() => decideMutation.mutate({ id: l.id, decision: "approved" })} data-testid={`button-approve-${l.id}`}>{t("اعتماد", "Approve")}</Button>
                          <Button size="sm" variant="outline" disabled={decideMutation.isPending} onClick={() => decideMutation.mutate({ id: l.id, decision: "rejected" })} data-testid={`button-reject-${l.id}`}>{t("رفض", "Reject")}</Button>
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
    </div>
  );
}
