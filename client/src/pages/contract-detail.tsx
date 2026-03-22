import { useState, useRef } from "react";
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
import { Textarea } from "@/components/ui/textarea";
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
import { ArrowLeft, ArrowRight, CreditCard, Receipt, Loader2, Plus, FileText, CheckCircle2, Clock, XCircle, Upload, X, Image as ImageIcon, AlertTriangle } from "lucide-react";
import { PaymentReceiptModal } from "@/components/payment-receipt";
import { Badge } from "@/components/ui/badge";

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

const statusConfig: Record<string, { ar: string; en: string; color: string; icon: any }> = {
  pending: { ar: "بانتظار الاعتماد", en: "Pending Approval", color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300", icon: Clock },
  confirmed: { ar: "مؤكدة", en: "Confirmed", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300", icon: CheckCircle2 },
  rejected: { ar: "مرفوضة", en: "Rejected", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300", icon: XCircle },
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
    notes: "",
  });
  const [attachmentImage, setAttachmentImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [receiptPayment, setReceiptPayment] = useState<any | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const { data: companySettings } = useQuery<any>({
    queryKey: ["/api/company-settings"],
  });

  const contractInvoices = invoices.filter(
    (inv) => inv.contractId === contract?.id && inv.type === "simplified_tax_invoice"
  );

  const paymentMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/payments", data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", id, "payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers", contract?.customerId, "invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      setPaymentDialog(false);
      setPaymentForm({ amount: "", paymentStage: "deposit", method: "bank_transfer", bankReference: "", notes: "" });
      setAttachmentImage(null);
      if (data.status === "confirmed") {
        setReceiptPayment(data);
        toast({ title: t("تم تسجيل الدفعة وإصدار الفاتورة", "Payment recorded and invoice issued") });
      } else {
        toast({ title: t("تم تسجيل الدفعة وهي بانتظار اعتماد المدير المالي", "Payment recorded, awaiting CFO approval") });
      }
    },
    onError: () => {
      toast({ title: t("حدث خطأ", "An error occurred"), variant: "destructive" });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: t("الحد الأقصى 5 ميجابايت", "Max file size is 5MB"), variant: "destructive" });
      return;
    }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      setAttachmentImage(reader.result as string);
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

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

  const paymentSchedule = (contract.paymentSchedule as any[]) || [];
  const pendingPayments = (payments as any[]).filter((p) => p.status === "pending");

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
        {pendingPayments.length > 0 && (
          <Badge variant="destructive" className="ms-auto" data-testid="badge-pending-payments">
            <AlertTriangle className="w-3 h-3 me-1" />
            {t(`${pendingPayments.length} دفعة بانتظار الاعتماد`, `${pendingPayments.length} payment(s) pending`)}
          </Badge>
        )}
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

            {paymentSchedule.length > 0 && (
              <div className="pt-4 border-t">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Receipt className="w-4 h-4" />
                  {t("جدول الدفعات المتوقعة", "Payment Schedule")}
                </h3>
                <div className="space-y-2">
                  {paymentSchedule.map((item: any, idx: number) => {
                    const confirmedForStage = (payments as any[]).filter(
                      (p) => p.paymentStage === item.stage && p.status === "confirmed"
                    );
                    const pendingForStage = (payments as any[]).filter(
                      (p) => p.paymentStage === item.stage && p.status === "pending"
                    );
                    const stagePaid = confirmedForStage.reduce((s: number, p: any) => s + parseFloat(p.amount || 0), 0);
                    const stageAmount = parseFloat(item.amount || 0);
                    const isPaid = stagePaid >= stageAmount && stageAmount > 0;
                    const hasPending = pendingForStage.length > 0;

                    return (
                      <div
                        key={idx}
                        className={`flex items-center justify-between p-3 rounded-lg border ${
                          isPaid ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800" :
                          hasPending ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800" :
                          "bg-muted/30"
                        }`}
                        data-testid={`schedule-row-${idx}`}
                      >
                        <div>
                          <p className="text-sm font-medium">{item.label || t(stageLabels[item.stage]?.ar || item.stage, stageLabels[item.stage]?.en || item.stage)}</p>
                          {item.dueDate && (
                            <p className="text-xs text-muted-foreground">
                              {t("استحقاق:", "Due:")} {new Date(item.dueDate).toLocaleDateString("ar-SA")}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{stageAmount.toLocaleString()} {t("ريال", "SAR")}</span>
                          {isPaid ? (
                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                          ) : hasPending ? (
                            <Clock className="w-4 h-4 text-amber-500" title={t("بانتظار الاعتماد", "Pending approval")} />
                          ) : (
                            <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="pt-4 border-t">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  {t("سجل المدفوعات", "Payment History")} ({(payments as any[]).length})
                </h3>
                {contract.status === "active" && (
                  <Dialog open={paymentDialog} onOpenChange={setPaymentDialog}>
                    <DialogTrigger asChild>
                      <Button size="sm" data-testid="button-add-payment">
                        <Plus className="w-3 h-3 me-1" /> {t("تسجيل دفعة", "Record Payment")}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
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
                            notes: paymentForm.notes || undefined,
                            attachmentUrl: attachmentImage || undefined,
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
                        <div className="space-y-2">
                          <Label>{t("صورة الإيصال / الوصل", "Receipt Image")}</Label>
                          {attachmentImage ? (
                            <div className="relative">
                              <img src={attachmentImage} alt="Receipt" className="w-full max-h-40 object-contain rounded-lg border bg-muted" />
                              <button
                                type="button"
                                onClick={() => setAttachmentImage(null)}
                                className="absolute top-1 end-1 bg-red-500 text-white rounded-full p-1"
                                data-testid="button-remove-attachment"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <label
                              className="flex flex-col items-center gap-2 border-2 border-dashed rounded-lg p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                              data-testid="label-upload-attachment"
                            >
                              {uploading ? (
                                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                              ) : (
                                <Upload className="w-5 h-5 text-muted-foreground" />
                              )}
                              <span className="text-xs text-muted-foreground">
                                {t("ارفع صورة الإيصال (اختياري)", "Upload receipt image (optional)")}
                              </span>
                              <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleFileSelect}
                                data-testid="input-attachment-file"
                              />
                            </label>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label>{t("ملاحظات", "Notes")}</Label>
                          <Textarea
                            value={paymentForm.notes}
                            onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                            className="h-16"
                            placeholder={t("ملاحظات إضافية...", "Additional notes...")}
                            data-testid="input-payment-notes"
                          />
                        </div>
                        <Button
                          type="submit"
                          className="w-full"
                          disabled={paymentMutation.isPending}
                          data-testid="button-submit-payment"
                        >
                          {paymentMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            t("تسجيل الدفعة", "Record Payment")
                          )}
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
              {(payments as any[]).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("لا توجد مدفوعات", "No payments yet")}</p>
              ) : (
                <div className="space-y-2">
                  {(payments as any[]).map((p: any) => {
                    const sc = statusConfig[p.status] || statusConfig.confirmed;
                    const StatusIcon = sc.icon;
                    return (
                      <div
                        key={p.id}
                        className={`flex items-center justify-between p-3 rounded-lg border ${
                          p.status === "pending" ? "border-amber-300 dark:border-amber-700 bg-amber-50/30 dark:bg-amber-950/20" :
                          p.status === "rejected" ? "border-red-200 dark:border-red-800" : ""
                        }`}
                        data-testid={`payment-${p.id}`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            p.status === "pending" ? "bg-amber-100 text-amber-600" :
                            p.status === "rejected" ? "bg-red-100 text-red-600" :
                            "bg-green-100 text-green-600"
                          }`}>
                            <StatusIcon className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                                {t(stageLabels[p.paymentStage]?.ar || p.paymentStage, stageLabels[p.paymentStage]?.en || p.paymentStage)}
                              </span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${sc.color}`}>
                                {t(sc.ar, sc.en)}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {t(methodLabels[p.method]?.ar || p.method, methodLabels[p.method]?.en || p.method)}
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {new Date(p.createdAt).toLocaleDateString("ar-SA")}
                            </span>
                            {p.rejectionReason && (
                              <p className="text-xs text-red-600 mt-0.5">{t("سبب الرفض:", "Reason:")} {p.rejectionReason}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {p.attachmentUrl && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => setPreviewImage(p.attachmentUrl)}
                              data-testid={`button-view-attachment-${p.id}`}
                            >
                              <ImageIcon className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {p.status === "confirmed" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => setReceiptPayment(p)}
                              data-testid={`button-receipt-${p.id}`}
                            >
                              <FileText className="w-3.5 h-3.5 me-1" />
                              {t("سند", "Receipt")}
                            </Button>
                          )}
                          <span className="font-bold text-green-600">{parseFloat(p.amount).toLocaleString()} SAR</span>
                        </div>
                      </div>
                    );
                  })}
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

      {receiptPayment && (
        <PaymentReceiptModal
          data={{
            receiptNumber: `RCP-${String(receiptPayment.id).padStart(5, "0")}`,
            customerName: customer?.fullName || "",
            amount: receiptPayment.amount,
            paymentMethod: receiptPayment.method,
            bankReference: receiptPayment.bankReference || "",
            paymentStage: receiptPayment.paymentStage,
            contractNumber: contract.contractNumber,
            date: receiptPayment.confirmedAt || receiptPayment.createdAt,
            companyName: companySettings?.nameAr || "مصنع تيك للمنتجات الخشبية",
            companyVat: companySettings?.vatNumber || "",
            companyAddress: companySettings?.address || "الرياض - المملكة العربية السعودية",
            companyPhone: companySettings?.phone || "",
            companyLogo: companySettings?.logo || "",
            companyStamp: companySettings?.stampImage || "",
            notes: receiptPayment.notes || "",
          }}
          onClose={() => setReceiptPayment(null)}
        />
      )}

      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
          data-testid="modal-image-preview"
        >
          <div
            className="max-w-2xl max-h-[80vh] overflow-auto bg-white dark:bg-gray-900 rounded-lg p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <img src={previewImage} alt="Receipt" className="w-full h-auto rounded" />
            <Button className="w-full mt-2" variant="outline" onClick={() => setPreviewImage(null)}>
              {t("إغلاق", "Close")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
