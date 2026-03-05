import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useRoute, Link } from "wouter";
import type { Contract, Customer, Payment, Invoice } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, ArrowRight, CreditCard, Receipt, Loader2, Plus, FileText } from "lucide-react";

const stageLabels: Record<string, { ar: string; en: string }> = {
  deposit: { ar: "عربون", en: "Deposit" },
  pre_manufacturing: { ar: "قبل التصنيع", en: "Pre-manufacturing" },
  delivery: { ar: "عند التوصيل", en: "Upon Delivery" },
  final: { ar: "الدفعة النهائية", en: "Final Payment" },
  other: { ar: "أخرى", en: "Other" },
};

const methodLabels: Record<string, { ar: string; en: string }> = {
  bank_transfer: { ar: "تحويل بنكي", en: "Bank Transfer" },
  cash: { ar: "نقدي", en: "Cash" },
  card: { ar: "بطاقة", en: "Card" },
};

export default function ContractDetailPage() {
  const { t, isRTL } = useLanguage();
  const { toast } = useToast();
  const [, params] = useRoute("/contracts/:id");
  const id = params?.id;
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    paymentStage: "deposit",
    method: "bank_transfer",
    bankReference: "",
  });

  const { data: contract, isLoading } = useQuery<Contract>({
    queryKey: ["/api/contracts", id],
    enabled: !!id,
  });

  const { data: customer } = useQuery<Customer>({
    queryKey: ["/api/customers", contract?.customerId],
    enabled: !!contract?.customerId,
  });

  const { data: payments = [] } = useQuery<Payment[]>({
    queryKey: ["/api/contracts", id, "payments"],
    enabled: !!id,
  });

  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ["/api/customers", contract?.customerId, "invoices"],
    enabled: !!contract?.customerId,
  });

  const contractInvoices = invoices.filter(
    (inv) => inv.contractId === contract?.id && inv.type === "simplified_tax_invoice"
  );

  const paymentMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/payments", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", id, "payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers", contract?.customerId, "invoices"] });
      setPaymentDialog(false);
      setPaymentForm({ amount: "", paymentStage: "deposit", method: "bank_transfer", bankReference: "" });
      toast({ title: t("تم تسجيل الدفعة وإصدار الفاتورة", "Payment recorded and invoice issued") });
    },
    onError: () => {
      toast({ title: t("حدث خطأ", "An error occurred"), variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!contract) {
    return <div className="text-center py-12 text-muted-foreground">{t("العقد غير موجود", "Contract not found")}</div>;
  }

  const paidPercent = parseFloat(contract.totalAmount) > 0
    ? Math.round((parseFloat(contract.paidAmount) / parseFloat(contract.totalAmount)) * 100)
    : 0;

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/contracts">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <BackIcon className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-contract-number">
            {contract.contractNumber}
          </h1>
          <p className="text-sm text-muted-foreground">
            {customer?.fullName}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t("ملخص العقد", "Contract Summary")}</CardTitle>
            <span className={`text-xs px-2 py-0.5 rounded-full ${contract.status === "active" ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" : "bg-blue-100 text-blue-700"}`}>
              {contract.status === "active" ? t("نشط", "Active") : t("مكتمل", "Completed")}
            </span>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-sm text-muted-foreground">{t("الإجمالي", "Total")}</p>
                <p className="text-xl font-bold">{parseFloat(contract.totalAmount).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("المدفوع", "Paid")}</p>
                <p className="text-xl font-bold text-green-600">{parseFloat(contract.paidAmount).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("المتبقي", "Remaining")}</p>
                <p className="text-xl font-bold text-amber-600">{parseFloat(contract.remainingAmount).toLocaleString()}</p>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">{t("نسبة السداد", "Payment Progress")}</span>
                <span className="font-medium">{paidPercent}%</span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${paidPercent}%` }} />
              </div>
            </div>

            <div className="pt-4 border-t">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  {t("سجل المدفوعات", "Payment History")} ({payments.length})
                </h3>
                {contract.status === "active" && (
                  <Dialog open={paymentDialog} onOpenChange={setPaymentDialog}>
                    <DialogTrigger asChild>
                      <Button size="sm" data-testid="button-add-payment">
                        <Plus className="w-3 h-3 me-1" /> {t("تسجيل دفعة", "Record Payment")}
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{t("تسجيل دفعة جديدة", "Record New Payment")}</DialogTitle>
                      </DialogHeader>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          paymentMutation.mutate({
                            contractId: contract.id,
                            customerId: contract.customerId,
                            amount: paymentForm.amount,
                            paymentStage: paymentForm.paymentStage,
                            method: paymentForm.method,
                            bankReference: paymentForm.bankReference || undefined,
                          });
                        }}
                        className="space-y-4"
                      >
                        <div className="space-y-2">
                          <Label>{t("المبلغ (ريال)", "Amount (SAR)")} *</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={paymentForm.amount}
                            onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                            required
                            data-testid="input-payment-amount"
                          />
                          <p className="text-xs text-muted-foreground">
                            {t(`المتبقي: ${parseFloat(contract.remainingAmount).toLocaleString()} ريال`, `Remaining: ${parseFloat(contract.remainingAmount).toLocaleString()} SAR`)}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label>{t("مرحلة الدفع", "Payment Stage")}</Label>
                          <Select
                            value={paymentForm.paymentStage}
                            onValueChange={(v) => setPaymentForm({ ...paymentForm, paymentStage: v })}
                          >
                            <SelectTrigger data-testid="select-payment-stage">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(stageLabels).map(([key, label]) => (
                                <SelectItem key={key} value={key}>
                                  {t(label.ar, label.en)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>{t("طريقة الدفع", "Payment Method")}</Label>
                          <Select
                            value={paymentForm.method}
                            onValueChange={(v) => setPaymentForm({ ...paymentForm, method: v })}
                          >
                            <SelectTrigger data-testid="select-payment-method">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(methodLabels).map(([key, label]) => (
                                <SelectItem key={key} value={key}>
                                  {t(label.ar, label.en)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {paymentForm.method === "bank_transfer" && (
                          <div className="space-y-2">
                            <Label>{t("رقم الحوالة", "Transfer Reference")}</Label>
                            <Input
                              value={paymentForm.bankReference}
                              onChange={(e) => setPaymentForm({ ...paymentForm, bankReference: e.target.value })}
                              data-testid="input-bank-reference"
                            />
                          </div>
                        )}
                        <Button
                          type="submit"
                          className="w-full"
                          disabled={paymentMutation.isPending}
                          data-testid="button-submit-payment"
                        >
                          {paymentMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            t("تسجيل الدفعة وإصدار الفاتورة", "Record Payment & Issue Invoice")
                          )}
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("لا توجد مدفوعات", "No payments yet")}</p>
              ) : (
                <div className="space-y-2">
                  {payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border" data-testid={`payment-${p.id}`}>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                            {t(stageLabels[p.paymentStage]?.ar || p.paymentStage, stageLabels[p.paymentStage]?.en || p.paymentStage)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {t(methodLabels[p.method]?.ar || p.method, methodLabels[p.method]?.en || p.method)}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(p.createdAt).toLocaleDateString("ar-SA")}
                        </span>
                      </div>
                      <span className="font-bold text-green-600">{parseFloat(p.amount).toLocaleString()} SAR</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Receipt className="w-5 h-5" />
                {t("الفواتير الضريبية", "Tax Invoices")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {contractInvoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("ستصدر الفواتير تلقائياً عند تسجيل المدفوعات", "Invoices will be auto-generated upon payment")}
                </p>
              ) : (
                <div className="space-y-2">
                  {contractInvoices.map((inv) => (
                    <Link key={inv.id} href={`/invoices/${inv.id}`}>
                      <div className="flex items-center justify-between p-2 rounded border cursor-pointer hover:bg-muted/50" data-testid={`invoice-link-${inv.id}`}>
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-primary" />
                          <span className="text-sm font-medium">#{inv.invoiceNumber}</span>
                        </div>
                        <span className="text-sm font-medium">{parseFloat(inv.totalWithVat).toLocaleString()}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
