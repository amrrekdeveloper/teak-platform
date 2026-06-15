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
import { FileText, CreditCard, CheckCircle, Plus, Trash2, KeyRound, Eye, EyeOff, Bell, Clock, AlertTriangle, MessageSquare, BookOpen, Scale, BarChart3, TrendingUp, Wallet, Receipt, Building2, BookText, Settings } from "lucide-react";

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

  const [showPinDialog, setShowPinDialog] = useState(false);
  const [currentPinInput, setCurrentPinInput] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showCurrentPin, setShowCurrentPin] = useState(false);

  const { data: pinData } = useQuery<{ pin: string }>({
    queryKey: ["/api/finance-auth/my-pin"],
    retry: false,
  });

  const changePinMutation = useMutation({
    mutationFn: ({ currentPin, newPin }: { currentPin: string; newPin: string }) =>
      apiRequest("PATCH", "/api/finance-auth/change-pin", { currentPin, newPin }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/finance-auth/my-pin"] });
      setShowPinDialog(false);
      setCurrentPinInput("");
      setNewPin("");
      setConfirmPin("");
      toast({ title: t("تم تغيير كلمة المرور بنجاح", "Password changed successfully") });
    },
    onError: (e: Error) => {
      let message = t("حدث خطأ", "Error");
      try {
        const body = e.message.replace(/^\d+:\s*/, "");
        const parsed = JSON.parse(body);
        if (parsed.message) message = parsed.message;
      } catch {}
      toast({ title: message, variant: "destructive" });
    },
  });
  const [schedule, setSchedule] = useState<PaymentScheduleItem[]>([
    { label: t("دفعة أولى", "First Payment"), amount: "", dueDate: "" },
    { label: t("دفعة ثانية", "Second Payment"), amount: "", dueDate: "" },
  ]);

  const { data: financeData, isLoading } = useQuery<any>({
    queryKey: ["/api/finance/ready-to-invoice"],
    staleTime: 30000,
  });

  interface UpcomingPayment {
    contractId: number;
    contractNumber: string;
    customerName: string;
    installmentLabel: string;
    amount: number;
    dueDate: string;
    daysRemaining: number;
    isOverdue: boolean;
  }

  const { data: upcomingPayments = [] } = useQuery<UpcomingPayment[]>({
    queryKey: ["/api/finance/upcoming-payments"],
    staleTime: 60000,
  });

  const checkRemindersMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/finance/check-payment-reminders", {});
      return res.json() as Promise<{ message: string; count: number }>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/finance/upcoming-payments"] });
      toast({
        title: t("تم إرسال التذكيرات", "Reminders Sent"),
        description: t(`تم إرسال ${data.count} إشعار`, `${data.count} notifications sent`),
      });
    },
    onError: () => toast({ title: t("حدث خطأ", "Error"), variant: "destructive" }),
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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("لوحة المدير المالي", "Finance Dashboard")}</h1>
          <p className="text-muted-foreground text-sm">{t("إدارة العقود والفواتير ومتابعة المدفوعات", "Manage contracts, invoices and payments")}</p>
        </div>
        <Link href="/invoices/new">
          <Button data-testid="button-create-invoice-finance">
            <Plus className="h-4 w-4 me-1" />
            {t("إنشاء فاتورة", "Create Invoice")}
          </Button>
        </Link>
      </div>

      {/* PIN management card — shown only when my-pin is accessible (accountant role) */}
      {pinData && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                <KeyRound className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("كلمة مرور الدخول السريع", "Quick Login PIN")}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-mono text-sm tracking-widest" data-testid="text-dashboard-pin">
                    {showCurrentPin ? pinData.pin : "•".repeat(pinData.pin.length)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowCurrentPin(!showCurrentPin)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="btn-toggle-dashboard-pin"
                  >
                    {showCurrentPin ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowPinDialog(true)}
              data-testid="btn-change-pin"
            >
              {t("تغيير", "Change")}
            </Button>
          </CardContent>
        </Card>
      )}

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

      {/* Accounting Quick Links */}
      <div>
        <h2 className="text-sm font-bold text-muted-foreground mb-3 uppercase tracking-wide">الوحدة المحاسبية</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { href: "/finance/accounts", icon: BookOpen, label: "شجرة الحسابات والقيود", color: "text-blue-500" },
            { href: "/finance/ledger", icon: BookText, label: "دفتر الأستاذ العام", color: "text-indigo-500" },
            { href: "/finance/trial-balance", icon: Scale, label: "ميزان المراجعة", color: "text-purple-500" },
            { href: "/finance/balance-sheet", icon: BarChart3, label: "الميزانية العمومية", color: "text-green-500" },
            { href: "/finance/income-statement", icon: TrendingUp, label: "قائمة الدخل", color: "text-emerald-500" },
            { href: "/finance/cash-flow", icon: Wallet, label: "التدفقات النقدية", color: "text-cyan-500" },
            { href: "/finance/vat-report", icon: Receipt, label: "ضريبة القيمة المضافة", color: "text-orange-500" },
            { href: "/finance/bank-reconciliation", icon: Building2, label: "مطابقة البنك", color: "text-rose-500" },
            { href: "/finance/settings", icon: Settings, label: "تغيير كلمة المرور", color: "text-slate-500" },
          ].map(item => (
            <Link key={item.href} href={item.href}>
              <Card className="hover:bg-accent/40 transition-colors cursor-pointer" data-testid={`quick-link${item.href.replace(/\//g, "-")}`}>
                <CardContent className="p-3 flex items-center gap-2">
                  <item.icon className={`h-5 w-5 shrink-0 ${item.color}`} />
                  <span className="text-xs font-medium leading-tight">{item.label}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Upcoming Payments Section */}
      {upcomingPayments.length > 0 && (
        <Card className="border-orange-200 dark:border-orange-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4 text-orange-500" />
              {t("دفعات قادمة (خلال 30 يوم)", "Upcoming Payments (within 30 days)")}
              <Badge variant="secondary" className="bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300">
                {upcomingPayments.length}
              </Badge>
              <div className="ms-auto">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs gap-1"
                  onClick={() => checkRemindersMutation.mutate()}
                  disabled={checkRemindersMutation.isPending}
                  data-testid="btn-send-payment-reminders"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  {checkRemindersMutation.isPending
                    ? t("جاري الإرسال...", "Sending...")
                    : t("إرسال تذكيرات", "Send Reminders")}
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {upcomingPayments.map((pmt, idx) => {
                const isOverdue = pmt.isOverdue;
                const isUrgent = !isOverdue && pmt.daysRemaining <= 3;
                const isSoon = !isOverdue && !isUrgent && pmt.daysRemaining <= 7;
                return (
                  <div
                    key={`${pmt.contractId}-${idx}`}
                    className={`flex items-center justify-between p-3 rounded-lg border gap-3 ${
                      isOverdue
                        ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
                        : isUrgent
                        ? "border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30"
                        : isSoon
                        ? "border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30"
                        : "border-border"
                    }`}
                    data-testid={`upcoming-payment-${pmt.contractId}-${idx}`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`mt-0.5 shrink-0 ${isOverdue ? "text-red-500" : isUrgent ? "text-orange-500" : "text-yellow-500"}`}>
                        {isOverdue ? <AlertTriangle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-sm">{pmt.contractNumber}</span>
                          <span className="text-xs text-muted-foreground">—</span>
                          <span className="text-xs text-muted-foreground truncate">{pmt.installmentLabel}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{pmt.customerName}</p>
                        <p className="text-sm font-bold text-primary mt-0.5">
                          {pmt.amount.toLocaleString()} ر.س
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {t("تاريخ الدفعة:", "Due Date:")} {pmt.dueDate}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-center">
                      <div
                        className={`text-2xl font-bold tabular-nums ${
                          isOverdue ? "text-red-600" : isUrgent ? "text-orange-600" : isSoon ? "text-yellow-600" : "text-foreground"
                        }`}
                        data-testid={`days-remaining-${pmt.contractId}-${idx}`}
                      >
                        {isOverdue ? Math.abs(pmt.daysRemaining) : pmt.daysRemaining}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {isOverdue
                          ? t("يوم تأخر", "days overdue")
                          : pmt.daysRemaining === 0
                          ? t("اليوم", "today")
                          : t("يوم متبقي", "days left")}
                      </div>
                      <Link href={`/contracts/${pmt.contractId}`}>
                        <Button size="sm" variant="ghost" className="mt-1 text-xs h-7 px-2" data-testid={`btn-upcoming-contract-${pmt.contractId}`}>
                          {t("عرض", "View")}
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
              <Bell className="h-3 w-3" />
              {t(
                "يُرسل النظام تذكيراً تلقائياً للمحاسبين قبل 3 أيام من موعد كل دفعة",
                "System automatically sends reminders to accountants 3 days before each payment due date"
              )}
            </p>
          </CardContent>
        </Card>
      )}

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

      {/* Change PIN Dialog */}
      <Dialog open={showPinDialog} onOpenChange={(open) => {
        setShowPinDialog(open);
        if (!open) { setCurrentPinInput(""); setNewPin(""); setConfirmPin(""); }
      }}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              {t("تغيير كلمة مرور الدخول السريع", "Change Quick Login PIN")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm">{t("كلمة المرور الحالية", "Current PIN")}</Label>
              <Input
                type="password"
                value={currentPinInput}
                onChange={(e) => setCurrentPinInput(e.target.value)}
                placeholder={t("أدخل كلمة المرور الحالية", "Enter current PIN")}
                className="font-mono"
                data-testid="input-current-pin-dialog"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">{t("كلمة المرور الجديدة", "New PIN")}</Label>
              <Input
                type="password"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder={t("أدخل كلمة المرور الجديدة", "Enter new PIN")}
                className="font-mono"
                data-testid="input-new-pin"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">{t("تأكيد كلمة المرور", "Confirm PIN")}</Label>
              <Input
                type="password"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                placeholder={t("أعد إدخال كلمة المرور", "Re-enter PIN")}
                className="font-mono"
                data-testid="input-confirm-pin"
              />
            </div>
            {newPin && confirmPin && newPin !== confirmPin && (
              <p className="text-sm text-destructive" data-testid="text-pin-mismatch">
                {t("كلمتا المرور غير متطابقتين", "PINs do not match")}
              </p>
            )}
            {newPin.length > 0 && newPin.length < 4 && (
              <p className="text-sm text-amber-600" data-testid="text-pin-short">
                {t("كلمة المرور يجب أن تكون 4 أحرف على الأقل", "PIN must be at least 4 characters")}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowPinDialog(false); setCurrentPinInput(""); setNewPin(""); setConfirmPin(""); }}>
              {t("إلغاء", "Cancel")}
            </Button>
            <Button
              onClick={() => changePinMutation.mutate({ currentPin: currentPinInput, newPin })}
              disabled={
                changePinMutation.isPending ||
                !currentPinInput ||
                !newPin || !confirmPin ||
                newPin !== confirmPin ||
                newPin.length < 4
              }
              data-testid="btn-confirm-change-pin"
            >
              {changePinMutation.isPending
                ? t("جاري الحفظ...", "Saving...")
                : t("حفظ", "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
