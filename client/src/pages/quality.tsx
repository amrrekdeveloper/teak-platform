import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { QualityCheck, WorkOrder } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Shield, CheckCircle2, XCircle, AlertTriangle, ClipboardCheck } from "lucide-react";

const checkTypeLabels: Record<string, { ar: string; en: string }> = {
  material_incoming: { ar: "فحص مواد واردة", en: "Material Incoming" },
  in_process: { ar: "فحص أثناء الإنتاج", en: "In-Process" },
  final_product: { ar: "فحص المنتج النهائي", en: "Final Product" },
};

const resultConfig: Record<string, { ar: string; en: string; color: string; icon: any }> = {
  pass: { ar: "ناجح", en: "Pass", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300", icon: CheckCircle2 },
  fail: { ar: "فاشل", en: "Fail", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300", icon: XCircle },
  conditional: { ar: "مشروط", en: "Conditional", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300", icon: AlertTriangle },
};

export default function QualityPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [filter, setFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ workOrderId: "", checkType: "final_product", result: "pass", notes: "" });

  const { data: checks = [], isLoading } = useQuery<QualityCheck[]>({ queryKey: ["/api/quality-checks"] });
  const { data: workOrders = [] } = useQuery<WorkOrder[]>({ queryKey: ["/api/work-orders"] });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/quality-checks", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quality-checks"] });
      setCreateOpen(false);
      setForm({ workOrderId: "", checkType: "final_product", result: "pass", notes: "" });
      toast({ title: t("تم تسجيل فحص الجودة", "Quality check recorded") });
    },
  });

  const filtered = filter === "all" ? checks : checks.filter(c => c.result === filter);

  const passCount = checks.filter(c => c.result === "pass").length;
  const failCount = checks.filter(c => c.result === "fail").length;
  const conditionalCount = checks.filter(c => c.result === "conditional").length;

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-quality-title">{t("فحص الجودة", "Quality Control")}</h1>
          <p className="text-muted-foreground text-sm">{t("إدارة فحوصات الجودة", "Manage quality inspections")}</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-qc"><Plus className="w-4 h-4 me-2" />{t("فحص جديد", "New Check")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("تسجيل فحص جودة", "Record Quality Check")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>{t("أمر العمل", "Work Order")} *</Label>
                <Select value={form.workOrderId} onValueChange={v => setForm({ ...form, workOrderId: v })}>
                  <SelectTrigger data-testid="select-qc-wo"><SelectValue placeholder={t("اختر", "Select")} /></SelectTrigger>
                  <SelectContent>{workOrders.map(wo => <SelectItem key={wo.id} value={wo.id.toString()}>#{wo.orderNumber}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t("نوع الفحص", "Check Type")} *</Label>
                <Select value={form.checkType} onValueChange={v => setForm({ ...form, checkType: v })}>
                  <SelectTrigger data-testid="select-qc-type"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(checkTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{t(v.ar, v.en)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t("النتيجة", "Result")} *</Label>
                <Select value={form.result} onValueChange={v => setForm({ ...form, result: v })}>
                  <SelectTrigger data-testid="select-qc-result"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(resultConfig).map(([k, v]) => <SelectItem key={k} value={k}>{t(v.ar, v.en)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t("ملاحظات", "Notes")}</Label>
                <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder={t("تفاصيل الفحص...", "Inspection details...")} data-testid="input-qc-notes" />
              </div>
              <Button className="w-full" onClick={() => createMutation.mutate({ workOrderId: parseInt(form.workOrderId), checkType: form.checkType, result: form.result, notes: form.notes })} disabled={!form.workOrderId || createMutation.isPending} data-testid="button-create-qc">
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("تسجيل", "Record")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card><CardContent className="p-4 flex items-center gap-3"><ClipboardCheck className="w-8 h-8 text-primary" /><div><p className="text-2xl font-bold" data-testid="text-total-checks">{checks.length}</p><p className="text-xs text-muted-foreground">{t("إجمالي الفحوصات", "Total Checks")}</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><CheckCircle2 className="w-8 h-8 text-green-600" /><div><p className="text-2xl font-bold text-green-600" data-testid="text-pass-count">{passCount}</p><p className="text-xs text-muted-foreground">{t("ناجح", "Passed")}</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><XCircle className="w-8 h-8 text-red-600" /><div><p className="text-2xl font-bold text-red-600" data-testid="text-fail-count">{failCount}</p><p className="text-xs text-muted-foreground">{t("فاشل", "Failed")}</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><AlertTriangle className="w-8 h-8 text-yellow-600" /><div><p className="text-2xl font-bold text-yellow-600" data-testid="text-conditional-count">{conditionalCount}</p><p className="text-xs text-muted-foreground">{t("مشروط", "Conditional")}</p></div></CardContent></Card>
      </div>

      <div className="flex gap-2">
        {[{ key: "all", ar: "الكل", en: "All" }, ...Object.entries(resultConfig).map(([k, v]) => ({ key: k, ar: v.ar, en: v.en }))].map(tab => (
          <Button key={tab.key} size="sm" variant={filter === tab.key ? "default" : "outline"} onClick={() => setFilter(tab.key)} data-testid={`button-filter-${tab.key}`}>{t(tab.ar, tab.en)}</Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t("لا توجد فحوصات جودة", "No quality checks")}</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(qc => {
            const res = resultConfig[qc.result || "pass"] || resultConfig.pass;
            const type = checkTypeLabels[qc.checkType || "final_product"] || checkTypeLabels.final_product;
            const ResultIcon = res.icon;
            return (
              <Card key={qc.id} data-testid={`card-qc-${qc.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><Shield className="w-5 h-5 text-primary" /></div>
                      <div>
                        <h3 className="font-semibold">{t("أمر عمل", "WO")} #{qc.workOrderId}</h3>
                        <p className="text-xs text-muted-foreground">{t(type.ar, type.en)}</p>
                        {qc.notes && <p className="text-xs text-muted-foreground mt-1 max-w-xs truncate">{qc.notes}</p>}
                      </div>
                    </div>
                    <Badge className={res.color}>
                      <ResultIcon className="w-3 h-3 me-1" />
                      {t(res.ar, res.en)}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
