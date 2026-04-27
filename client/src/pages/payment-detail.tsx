import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { useLanguage } from "@/components/language-provider";
import type { Payment, Customer, Contract, Invoice } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Loader2, CheckCircle2, XCircle, Clock, UserCheck, FileText, Receipt } from "lucide-react";

const stageLabels: Record<string, { ar: string; en: string; color: string }> = {
  deposit: { ar: "عربون", en: "Deposit", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  pre_manufacturing: { ar: "قبل التصنيع", en: "Pre-manufacturing", color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
  delivery: { ar: "عند التوصيل", en: "Upon Delivery", color: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" },
  final: { ar: "نهائية", en: "Final", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  other: { ar: "أخرى", en: "Other", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
};

const methodLabels: Record<string, { ar: string; en: string }> = {
  bank_transfer: { ar: "تحويل بنكي", en: "Bank Transfer" },
  cash: { ar: "نقدي", en: "Cash" },
  card: { ar: "بطاقة", en: "Card" },
};

const statusConfig: Record<string, { ar: string; en: string; color: string; icon: any }> = {
  pending: { ar: "بانتظار مراجعة المندوب", en: "Pending Sales Review", color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300", icon: Clock },
  sales_reviewed: { ar: "راجعها المندوب — بانتظار المحاسب", en: "Sales Reviewed — Awaiting Accountant", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300", icon: UserCheck },
  confirmed: { ar: "مؤكدة", en: "Confirmed", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300", icon: CheckCircle2 },
  rejected: { ar: "مرفوضة", en: "Rejected", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300", icon: XCircle },
};

export default function PaymentDetailPage() {
  const { t, isRTL } = useLanguage();
  const [, params] = useRoute("/payments/:id");
  const id = params?.id;

  const { data: payment, isLoading, isError } = useQuery<Payment>({
    queryKey: ["/api/payments", id],
    enabled: !!id,
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: contracts = [] } = useQuery<Contract[]>({
    queryKey: ["/api/contracts"],
  });

  const { data: relatedInvoice } = useQuery<Invoice>({
    queryKey: ["/api/invoices", payment?.invoiceId],
    enabled: !!payment?.invoiceId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !payment) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-muted-foreground" data-testid="text-payment-not-found">
          {t("الدفعة غير موجودة", "Payment not found")}
        </p>
        <Link href="/payments">
          <Button variant="outline">
            {isRTL ? <ArrowRight className="w-4 h-4 me-2" /> : <ArrowLeft className="w-4 h-4 me-2" />}
            {t("العودة إلى المدفوعات", "Back to Payments")}
          </Button>
        </Link>
      </div>
    );
  }

  const customer = customers.find(c => c.id === payment.customerId);
  const contract = contracts.find(c => c.id === payment.contractId);
  const stage = stageLabels[payment.paymentStage] || stageLabels.other;
  const status = statusConfig[payment.status] || statusConfig.confirmed;
  const StatusIcon = status.icon;
  const method = methodLabels[payment.method];

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-4">
      <div className="flex items-center gap-3">
        <Link href="/payments">
          <Button variant="ghost" size="sm" data-testid="button-back-payments">
            {isRTL ? <ArrowRight className="w-4 h-4 me-1" /> : <ArrowLeft className="w-4 h-4 me-1" />}
            {t("المدفوعات", "Payments")}
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
          payment.status === "confirmed" ? "bg-green-500/10 text-green-600" :
          payment.status === "rejected" ? "bg-red-500/10 text-red-600" :
          "bg-amber-500/10 text-amber-600"
        }`}>
          <StatusIcon className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-payment-title">
            {t("دفعة", "Payment")} — {customer?.fullName || `#${payment.customerId}`}
          </h1>
          <p className="text-sm text-muted-foreground">
            {new Date(payment.createdAt).toLocaleDateString(isRTL ? "ar-SA" : "en-GB", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("تفاصيل الدفعة", "Payment Details")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <span className="text-muted-foreground">{t("الحالة", "Status")}</span>
            <Badge className={status.color} data-testid="badge-payment-status">
              <StatusIcon className="w-3 h-3 me-1" />
              {t(status.ar, status.en)}
            </Badge>

            <span className="text-muted-foreground">{t("المبلغ", "Amount")}</span>
            <span className="font-bold text-primary text-base" data-testid="text-payment-amount">
              {parseFloat(payment.amount).toLocaleString()} {t("ر.س", "SAR")}
            </span>

            <span className="text-muted-foreground">{t("مرحلة الدفع", "Payment Stage")}</span>
            <Badge className={stage.color} data-testid="badge-payment-stage">
              {t(stage.ar, stage.en)}
            </Badge>

            <span className="text-muted-foreground">{t("طريقة الدفع", "Payment Method")}</span>
            <span data-testid="text-payment-method">
              {method ? t(method.ar, method.en) : payment.method}
            </span>

            {customer && (
              <>
                <span className="text-muted-foreground">{t("العميل", "Customer")}</span>
                <Link href={`/customers/${customer.id}`}>
                  <span className="text-primary hover:underline cursor-pointer" data-testid="link-payment-customer">
                    {customer.fullName}
                  </span>
                </Link>
              </>
            )}

            {contract && (
              <>
                <span className="text-muted-foreground">{t("العقد", "Contract")}</span>
                <Link href={`/contracts/${contract.id}`}>
                  <span className="text-primary hover:underline cursor-pointer" data-testid="link-payment-contract">
                    {contract.contractNumber}
                  </span>
                </Link>
              </>
            )}

            {payment.bankReference && (
              <>
                <span className="text-muted-foreground">{t("المرجع البنكي", "Bank Reference")}</span>
                <span data-testid="text-payment-bank-ref">{payment.bankReference}</span>
              </>
            )}

            {payment.receiptNumber && (
              <>
                <span className="text-muted-foreground">{t("رقم الإيصال", "Receipt Number")}</span>
                <span data-testid="text-payment-receipt-number">{payment.receiptNumber}</span>
              </>
            )}

            {payment.confirmedAt && (
              <>
                <span className="text-muted-foreground">{t("تاريخ الاعتماد", "Confirmed At")}</span>
                <span data-testid="text-payment-confirmed-at">
                  {new Date(payment.confirmedAt).toLocaleDateString(isRTL ? "ar-SA" : "en-GB")}
                </span>
              </>
            )}

            {payment.invoiceId && (
              <>
                <span className="text-muted-foreground">{t("الفاتورة المرتبطة", "Related Invoice")}</span>
                <Link href={`/invoices/${payment.invoiceId}`}>
                  <span className="text-primary hover:underline cursor-pointer inline-flex items-center gap-1" data-testid="link-payment-invoice">
                    <Receipt className="w-3.5 h-3.5" />
                    {relatedInvoice?.invoiceNumber || `#${payment.invoiceId}`}
                  </span>
                </Link>
              </>
            )}
          </div>

          {payment.notes && (
            <div className="pt-3 border-t">
              <p className="text-sm text-muted-foreground mb-1">{t("ملاحظات", "Notes")}</p>
              <p className="text-sm" data-testid="text-payment-notes">{payment.notes}</p>
            </div>
          )}

          {payment.rejectionReason && (
            <div className="pt-3 border-t">
              <p className="text-sm text-red-600 font-medium mb-1">{t("سبب الرفض", "Rejection Reason")}</p>
              <p className="text-sm text-red-600" data-testid="text-payment-rejection-reason">{payment.rejectionReason}</p>
            </div>
          )}

          {payment.attachmentUrl && (
            <div className="pt-3 border-t">
              <p className="text-sm text-muted-foreground mb-2">{t("إيصال الدفع", "Payment Receipt")}</p>
              {payment.attachmentUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                <img
                  src={payment.attachmentUrl}
                  alt={t("إيصال الدفع", "Payment receipt")}
                  className="max-w-xs rounded-lg border"
                  data-testid="img-payment-attachment"
                />
              ) : (
                <a
                  href={payment.attachmentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-primary hover:underline text-sm"
                  data-testid="link-payment-attachment"
                >
                  <FileText className="w-4 h-4" />
                  {t("عرض المرفق", "View Attachment")}
                </a>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-center">
        <Link href="/payments">
          <Button variant="outline" data-testid="button-back-payments-bottom">
            {isRTL ? <ArrowRight className="w-4 h-4 me-2" /> : <ArrowLeft className="w-4 h-4 me-2" />}
            {t("العودة إلى قائمة المدفوعات", "Back to Payments List")}
          </Button>
        </Link>
      </div>
    </div>
  );
}
