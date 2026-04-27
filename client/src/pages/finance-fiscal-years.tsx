import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { apiRequest } from "@/lib/queryClient";
import { FinanceLayout } from "@/components/finance-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Lock, Settings2, CheckCircle2, AlertCircle, Calendar } from "lucide-react";
import { format } from "date-fns";

export default function FinanceFiscalYearsPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState({
    name: "",
    startDate: format(new Date(new Date().getFullYear(), 0, 1), "yyyy-MM-dd"),
    endDate: format(new Date(new Date().getFullYear(), 11, 31), "yyyy-MM-dd"),
    calendarType: "gregorian",
    notes: "",
  });

  const [closeConfirm, setCloseConfirm] = useState<number | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);

  const { data: fiscalYears = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/accounting/fiscal-years"],
  });

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/accounting/fiscal-years", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/accounting/fiscal-years"] });
      setDialog(false);
      setForm({ name: "", startDate: format(new Date(new Date().getFullYear(), 0, 1), "yyyy-MM-dd"), endDate: format(new Date(new Date().getFullYear(), 11, 31), "yyyy-MM-dd"), calendarType: "gregorian", notes: "" });
      toast({ title: t("تم إنشاء السنة المالية", "Fiscal year created") });
    },
    onError: (e: any) => toast({ title: e.message || t("حدث خطأ", "An error occurred"), variant: "destructive" }),
  });

  const closeMut = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/accounting/fiscal-years/${id}/close`, {}),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/accounting/fiscal-years"] });
      qc.invalidateQueries({ queryKey: ["/api/accounting/journal-entries"] });
      setCloseConfirm(null);
      const netP = data?.netProfit;
      const msg = netP !== undefined
        ? t(
            `تم إقفال السنة المالية. صافي ${parseFloat(netP) >= 0 ? "الربح" : "الخسارة"}: ${Math.abs(parseFloat(netP)).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س`,
            `Fiscal year closed. Net ${parseFloat(netP) >= 0 ? "profit" : "loss"}: ${Math.abs(parseFloat(netP)).toLocaleString(undefined, { minimumFractionDigits: 2 })} SAR`
          )
        : t("تم إقفال السنة المالية", "Fiscal year closed");
      toast({ title: msg });
    },
    onError: (e: any) => {
      setCloseConfirm(null);
      const raw: string = e.message || t("حدث خطأ", "An error occurred");
      const colonIdx = raw.indexOf(": ");
      const body = colonIdx !== -1 ? raw.slice(colonIdx + 2) : raw;
      let parsed = body;
      try { parsed = JSON.parse(body)?.message || body; } catch { /* not JSON */ }
      setCloseError(parsed);
    },
  });

  const handleCreate = () => {
    if (!form.name || !form.startDate || !form.endDate)
      return toast({ title: t("جميع الحقول مطلوبة", "All fields are required"), variant: "destructive" });
    if (form.endDate <= form.startDate)
      return toast({ title: t("تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء", "End date must be after start date"), variant: "destructive" });
    createMut.mutate(form);
  };

  return (
    <FinanceLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              {t("السنوات المالية", "Fiscal Years")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("إدارة السنوات المالية وإقفال نهاية السنة", "Manage fiscal years and year-end closing")}
            </p>
          </div>
          <Button size="sm" onClick={() => setDialog(true)} data-testid="btn-new-fiscal-year">
            <Plus className="h-4 w-4 me-1.5" />
            {t("سنة مالية جديدة", "New Fiscal Year")}
          </Button>
        </div>

        {isLoading ? (
          <p className="text-center text-muted-foreground py-8">{t("جاري التحميل...", "Loading...")}</p>
        ) : (fiscalYears as any[]).length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <Settings2 className="h-10 w-10 mx-auto text-muted-foreground/40" />
              <p className="text-muted-foreground">{t("لا توجد سنوات مالية محددة بعد", "No fiscal years defined yet")}</p>
              <Button size="sm" onClick={() => setDialog(true)} data-testid="btn-create-first-fy">
                <Plus className="h-4 w-4 me-1.5" />
                {t("إنشاء السنة المالية الأولى", "Create First Fiscal Year")}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {(fiscalYears as any[]).map((fy: any) => (
              <Card key={fy.id} data-testid={`fiscal-year-${fy.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-base">{fy.name}</span>
                        {fy.status === "active" ? (
                          <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-[10px]">
                            <CheckCircle2 className="h-3 w-3 me-1" />
                            {t("نشطة", "Active")}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground text-[10px]">
                            <Lock className="h-3 w-3 me-1" />
                            {t("مغلقة", "Closed")}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px]">
                          {fy.calendarType === "hijri" ? t("هجري", "Hijri") : t("ميلادي", "Gregorian")}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{t("من:", "From:")} <strong className="text-foreground">{fy.startDate}</strong></span>
                        <span>{t("إلى:", "To:")} <strong className="text-foreground">{fy.endDate}</strong></span>
                      </div>
                      {fy.notes && <p className="text-xs text-muted-foreground">{fy.notes}</p>}
                      {fy.closingEntryId && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                          {t("تم الإقفال — قيد الإقفال رقم:", "Closed — closing entry:")} #{fy.closingEntryId}
                        </p>
                      )}
                    </div>
                    {fy.status === "active" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 text-amber-700 border-amber-300 hover:bg-amber-50 dark:text-amber-300 dark:border-amber-800 dark:hover:bg-amber-950"
                        onClick={() => setCloseConfirm(fy.id)}
                        data-testid={`btn-close-fy-${fy.id}`}
                      >
                        <Lock className="h-3.5 w-3.5 me-1.5" />
                        {t("إقفال السنة", "Close Year")}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Year-end closing info */}
        <Card className="border-dashed">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground">{t("كيف يعمل إقفال السنة المالية؟", "How does year-end closing work?")}</p>
                <p>{t("عند إقفال السنة المالية، يتم إنشاء قيد محاسبي آلي يُصفّر حسابات الإيرادات والمصروفات ويُحوّل صافي الربح أو الخسارة إلى حساب الأرباح المحتجزة (3200).", "When closing a fiscal year, an automatic journal entry is created that zeros out revenue and expense accounts and transfers the net profit or loss to the retained earnings account (3200).")}</p>
                <p>{t("لا يمكن إلغاء هذا الإجراء بعد التنفيذ.", "This action cannot be undone.")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create Fiscal Year Dialog */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{t("سنة مالية جديدة", "New Fiscal Year")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">{t("الاسم", "Name")} *</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder={t("مثال: السنة المالية 2025", "e.g. Fiscal Year 2025")}
                data-testid="input-fy-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t("تاريخ البدء", "Start Date")} *</Label>
                <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} data-testid="input-fy-start" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("تاريخ الانتهاء", "End Date")} *</Label>
                <Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} data-testid="input-fy-end" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("نوع التقويم", "Calendar Type")}</Label>
              <Select value={form.calendarType} onValueChange={v => setForm(f => ({ ...f, calendarType: v }))}>
                <SelectTrigger data-testid="select-fy-calendar">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gregorian">{t("ميلادي (Gregorian)", "Gregorian")}</SelectItem>
                  <SelectItem value="hijri">{t("هجري (Hijri)", "Hijri")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("ملاحظات", "Notes")}</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder={t("ملاحظات اختيارية...", "Optional notes...")} data-testid="input-fy-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>{t("إلغاء", "Cancel")}</Button>
            <Button onClick={handleCreate} disabled={createMut.isPending} data-testid="btn-save-fiscal-year">
              {createMut.isPending ? t("جاري الإنشاء...", "Creating...") : t("إنشاء", "Create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Year Confirmation Dialog */}
      <Dialog open={closeConfirm !== null} onOpenChange={open => { if (!open) setCloseConfirm(null); }}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <Lock className="h-4 w-4" />
              {t("تأكيد إقفال السنة المالية", "Confirm Year-End Closing")}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <p className="text-sm">{t("هل أنت متأكد من إقفال هذه السنة المالية؟", "Are you sure you want to close this fiscal year?")}</p>
            <p className="text-xs text-muted-foreground">{t("سيتم إنشاء قيد إقفال آلي ونقل صافي الربح/الخسارة إلى الأرباح المحتجزة. لا يمكن التراجع عن هذا الإجراء.", "An automatic closing entry will be created and net profit/loss will be transferred to retained earnings. This action cannot be undone.")}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseConfirm(null)}>{t("إلغاء", "Cancel")}</Button>
            <Button
              variant="destructive"
              onClick={() => closeConfirm !== null && closeMut.mutate(closeConfirm)}
              disabled={closeMut.isPending}
              data-testid="btn-confirm-close-fy"
            >
              {closeMut.isPending ? t("جاري الإقفال...", "Closing...") : t("إقفال السنة", "Close Year")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Retained earnings missing error dialog */}
      <Dialog open={closeError !== null} onOpenChange={open => { if (!open) setCloseError(null); }}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              {t("تعذّر إقفال السنة المالية", "Year-End Close Failed")}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm" data-testid="text-close-error">{closeError}</p>
            <p className="text-xs text-muted-foreground">
              {t(
                "يرجى إضافة حساب الأرباح المحتجزة برمز 3200 في دليل الحسابات ثم إعادة المحاولة.",
                "Please add the retained earnings account with code 3200 in the chart of accounts, then try again."
              )}
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setCloseError(null)} data-testid="btn-close-error-dialog">
              {t("حسناً", "OK")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FinanceLayout>
  );
}
