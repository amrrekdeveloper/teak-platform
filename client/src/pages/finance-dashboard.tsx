import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { FileText, CreditCard, CheckCircle, Plus, Trash2 } from "lucide-react";

import { Link } from "wouter";
import { format } from "date-fns";

function SarIcon({ className }: { className?: string }) {
  return (
    <span className={`font-bold leading-none inline-flex items-center justify-center ${className || ""}`} aria-label="SAR" style={{ fontSize: "0.85em" }}>
      ر.س
    </span>
  );
}

interface PaymentScheduleItem { label: string; amount: string; dueDate: string; }

export default function FinanceDashboardPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [selectedContract, setSelectedContract] = useState<any>(null);
  const [schedule, setSchedule] = useState<PaymentScheduleItem[]>([
    { label: t("دفعة أولى", "First Payment"), amount: "", dueDate: "" },
    { label: t("دفعة ثانية", "Second Payment"), amount: "", dueDate: "" },
  ]);

  const { data: financeData, isLoading } = useQuery<any>({
    queryKey: ["/api/finance/ready-to-invoice"],
    staleTime: 30000,
  });

  const createContractMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/contracts", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/finance/ready-to-invoice"] });
      qc.invalidateQueries({ queryKey: ["/api/contracts"] });
      setShowScheduleDialog(false);
      toast({ title: t("تم إنشاء العقد", "Contract created") });
    },
    onError: () => toast({ title: t("حدث خطأ", "Error"), variant: "destructive" }),
  });

  const createInvoiceMutation = useMutation({
    mutationFn: (contractId: string) => apiRequest("POST", "/api/invoices", { contractId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/finance/ready-to-invoice"] });
      qc.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: t("تم إصدار الفاتورة", "Invoice issued") });
    },
    onError: () => toast({ title: t("حدث خطأ", "Error"), variant: "destructive" }),
  });

  const openScheduleDialog = (item: any) => {
    setSelectedContract(item);
    if (item.quotation) {
      const total = parseFloat(item.quotation.finalPrice || "0");
      setSchedule([
        { label: t("دفعة أولى (30%)", "1st Payment (30%)"), amount: String(Math.round(total * 0.3)), dueDate: "" },
        { label: t("دفعة ثانية (40%)", "2nd Payment (40%)"), amount: String(Math.round(total * 0.4)), dueDate: "" },
        { label: t("دفعة ثالثة (30%)", "3rd Payment (30%)"), amount: String(Math.round(total * 0.3)), dueDate: "" },
      ]);
    }
    setShowScheduleDialog(true);
  };

  const handleCreateContract = () => {
    if (!selectedContract?.quotation) return;
    const q = selectedContract.quotation;
    createContractMutation.mutate({
      quotationId: q.id,
      customerId: q.customerId,
      contractNumber: `CNT-${Date.now()}`,
      totalAmount: q.finalPrice,
      vatAmount: q.vatAmount,
      depositAmount: schedule[0]?.amount || "0",
      status: "draft",
      paymentSchedule: schedule,
      startDate: new Date().toISOString().split("T")[0],
    });
  };

  const addScheduleItem = () => setSchedule(s => [...s, { label: "", amount: "", dueDate: "" }]);
  const removeScheduleItem = (i: number) => setSchedule(s => s.filter((_, j) => j !== i));
  const updateScheduleItem = (i: number, field: keyof PaymentScheduleItem, val: string) =>
    setSchedule(s => s.map((item, j) => j === i ? { ...item, [field]: val } : item));

  const readyForContract = financeData?.readyForContract || [];
  const readyForPayment = financeData?.readyForPayment || [];

  const totalPending = readyForContract.length + readyForPayment.length;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("لوحة المدير المالي", "Finance Dashboard")}</h1>
        <p className="text-muted-foreground text-sm">{t("إدارة العقود والفواتير ومتابعة المدفوعات", "Manage contracts, invoices and payments")}</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card data-testid="card-ready-contract">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{readyForContract.length}</p>
                <p className="text-xs text-muted-foreground">{t("جاهزة للعقد", "Ready for Contract")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-ready-invoice">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{readyForPayment.length}</p>
                <p className="text-xs text-muted-foreground">{t("تحتاج فاتورة", "Need Invoice")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <SarIcon className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">
                  {readyForContract
                    .reduce((s: number, i: any) => s + parseFloat(i.quotation?.finalPrice || 0), 0)
                    .toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">{t("قيمة انتظار العقد (ر.س)", "Pending Contract (SAR)")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">{totalPending}</p>
                <p className="text-xs text-muted-foreground">{t("إجمالي المعلقة", "Total Pending")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section 1: Ready for Contract */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-500" />
            {t("طلبات معتمدة — تحتاج عقداً", "Approved Orders — Need Contract")}
            <Badge variant="secondary">{readyForContract.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-sm py-4 text-center">{t("جاري التحميل...", "Loading...")}</p>
          ) : readyForContract.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">{t("لا توجد طلبات معلقة", "No pending orders")}</p>
          ) : (
            <div className="space-y-3">
              {readyForContract.map((item: any) => (
                <div key={item.quotation.id} className="flex items-center justify-between p-3 border rounded-lg gap-3"
                  data-testid={`finance-contract-${item.quotation.id}`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">#{item.quotation.quotationNumber}</span>
                      <Badge variant="outline" className="text-xs text-green-600 border-green-300">
                        {t("معتمد", "Approved")}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{item.customer?.fullName}</p>
                    <p className="text-sm font-bold text-primary mt-0.5">
                      {parseFloat(item.quotation.finalPrice || 0).toLocaleString()} ر.س
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Link href={`/quotations/${item.quotation.id}`}>
                      <Button size="sm" variant="outline" data-testid={`btn-view-quotation-${item.quotation.id}`}>
                        {t("عرض", "View")}
                      </Button>
                    </Link>
                    <Button size="sm" onClick={() => openScheduleDialog(item)}
                      data-testid={`btn-create-contract-${item.quotation.id}`}>
                      {t("إنشاء عقد", "Create Contract")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Ready for Invoice */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-green-500" />
            {t("عقود نشطة — إصدار فاتورة", "Active Contracts — Issue Invoice")}
            <Badge variant="secondary">{readyForPayment.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-sm py-4 text-center">{t("جاري التحميل...", "Loading...")}</p>
          ) : readyForPayment.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">{t("لا توجد عقود معلقة", "No pending contracts")}</p>
          ) : (
            <div className="space-y-3">
              {readyForPayment.map((item: any) => (
                <div key={item.contract.id} className="flex items-center justify-between p-3 border rounded-lg gap-3"
                  data-testid={`finance-invoice-${item.contract.id}`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{item.contract.contractNumber}</span>
                      <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">
                        {item.contract.status === "active" ? t("نشط", "Active") : t("موقّع", "Signed")}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{item.customer?.fullName}</p>
                    <p className="text-sm font-bold text-primary mt-0.5">
                      {parseFloat(item.contract.totalAmount || 0).toLocaleString()} ر.س
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("الدفعات:", "Payments:")} {item.payments?.length || 0}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Link href={`/contracts/${item.contract.id}`}>
                      <Button size="sm" variant="outline" data-testid={`btn-view-contract-${item.contract.id}`}>
                        {t("عرض", "View")}
                      </Button>
                    </Link>
                    <Button size="sm" onClick={() => createInvoiceMutation.mutate(item.contract.id)}
                      disabled={createInvoiceMutation.isPending}
                      data-testid={`btn-issue-invoice-${item.contract.id}`}>
                      {t("إصدار فاتورة", "Issue Invoice")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { href: "/payments", labelAr: "المدفوعات", labelEn: "Payments" },
          { href: "/invoices", labelAr: "الفواتير", labelEn: "Invoices" },
          { href: "/contracts", labelAr: "العقود", labelEn: "Contracts" },
          { href: "/quotations", labelAr: "عروض الأسعار", labelEn: "Quotations" },
        ].map(link => (
          <Link key={link.href} href={link.href}>
            <Button variant="outline" className="w-full" data-testid={`link-finance-${link.href.slice(1)}`}>
              {t(link.labelAr, link.labelEn)}
            </Button>
          </Link>
        ))}
      </div>

      {/* Payment Schedule Dialog */}
      <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("جدول الدفعات", "Payment Schedule")}</DialogTitle>
          </DialogHeader>
          {selectedContract?.quotation && (
            <div className="text-sm text-muted-foreground mb-2">
              {t("إجمالي العقد:", "Contract Total:")} {parseFloat(selectedContract.quotation.finalPrice || 0).toLocaleString()} ر.س
            </div>
          )}
          <div className="space-y-3">
            {schedule.map((item, i) => (
              <div key={i} className="grid grid-cols-5 gap-2 items-end">
                <div className="col-span-2">
                  <Label className="text-xs">{t("الوصف", "Label")}</Label>
                  <Input value={item.label} onChange={e => updateScheduleItem(i, "label", e.target.value)}
                    placeholder={t("دفعة", "Payment")} data-testid={`schedule-label-${i}`} />
                </div>
                <div>
                  <Label className="text-xs">{t("المبلغ", "Amount")}</Label>
                  <Input type="number" value={item.amount} onChange={e => updateScheduleItem(i, "amount", e.target.value)}
                    data-testid={`schedule-amount-${i}`} />
                </div>
                <div>
                  <Label className="text-xs">{t("تاريخ", "Due Date")}</Label>
                  <Input type="date" value={item.dueDate} onChange={e => updateScheduleItem(i, "dueDate", e.target.value)}
                    data-testid={`schedule-date-${i}`} />
                </div>
                <Button size="icon" variant="ghost" onClick={() => removeScheduleItem(i)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={addScheduleItem} data-testid="btn-add-schedule-item">
              <Plus className="h-3.5 w-3.5 me-1" />{t("إضافة دفعة", "Add Payment")}
            </Button>
            {/* Validation: sum check */}
            {selectedContract?.quotation && (
              <div className={`text-sm p-2 rounded ${
                Math.abs(schedule.reduce((s, i) => s + parseFloat(i.amount || "0"), 0) -
                  parseFloat(selectedContract.quotation.finalPrice || "0")) < 1
                  ? "bg-green-50 text-green-700" : "bg-orange-50 text-orange-700"
              }`}>
                {t("مجموع الدفعات:", "Schedule total:")} {schedule.reduce((s, i) => s + parseFloat(i.amount || "0"), 0).toLocaleString()} ر.س
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button variant="outline" onClick={() => setShowScheduleDialog(false)}>{t("إلغاء", "Cancel")}</Button>
            <Button onClick={handleCreateContract} disabled={createContractMutation.isPending}
              data-testid="btn-confirm-create-contract">
              {createContractMutation.isPending ? t("جاري الإنشاء...", "Creating...") : t("إنشاء العقد", "Create Contract")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
