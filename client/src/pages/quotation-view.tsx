import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { useRoute, Link, useLocation } from "wouter";
import type { Quotation, Customer } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Loader2, Printer, Send, CheckCircle2, Receipt, X, Pencil } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import teakLogo from "@assets/TEAK-LOGO_(1)_(1)_1772710617816.png";
import { LoadingTransition } from "@/components/loading-transition";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export default function QuotationViewPage() {
  const { t, isRTL } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [, params] = useRoute("/quotations/:id/view");
  const id = params?.id;
  const autoPrint = new URLSearchParams(window.location.search).get("print") === "1";

  const { data: quotation, isLoading: quotationLoading } = useQuery<Quotation>({
    queryKey: ["/api/quotations", id],
    enabled: !!id,
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  interface CompanySettings {
    nameAr?: string;
    vatNumber?: string;
    address?: string;
  }
  const { data: companySettings } = useQuery<CompanySettings>({
    queryKey: ["/api/company-settings/public"],
  });

  const [showPrintTransition, setShowPrintTransition] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [approveReceiptFile, setApproveReceiptFile] = useState<File | null>(null);
  const [approveReceiptPreview, setApproveReceiptPreview] = useState<string | null>(null);
  const [approveAmount, setApproveAmount] = useState<string>("");
  const [approveMethod, setApproveMethod] = useState<string>("bank_transfer");
  const approveReceiptInputRef = useRef<HTMLInputElement>(null);

  const returnTo = new URLSearchParams(window.location.search).get("returnTo");

  const isManager = user?.role === "owner" || user?.role === "assistant" || user?.role === "it";
  const canApprove = quotation &&
    (quotation.status === "draft" || quotation.status === "sent") &&
    (isManager || user?.role === "sales");

  const approveMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, string> = {};
      if (approveReceiptPreview) body.paymentReceiptData = approveReceiptPreview;
      if (approveReceiptFile) body.paymentReceiptName = approveReceiptFile.name;
      if (approveAmount) body.paymentAmount = approveAmount;
      body.paymentMethod = approveMethod;
      const res = await apiRequest("POST", `/api/quotations/${id}/approve`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      toast({ title: t("تم اعتماد عرض السعر وإنشاء العقد بنجاح", "Quotation approved and contract created") });
      setApproveDialogOpen(false);
      setApproveReceiptFile(null);
      setApproveReceiptPreview(null);
      setApproveAmount("");
      if (returnTo) navigate(returnTo);
    },
    onError: (err: any) => {
      toast({ title: t("حدث خطأ أثناء الاعتماد", "Error during approval"), description: err?.message, variant: "destructive" });
    },
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/pricing/send-to-customer/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      toast({ title: t("تم إرسال العرض للعميل بنجاح", "Quotation sent to customer successfully") });
    },
    onError: () => {
      toast({ title: t("حدث خطأ أثناء الإرسال", "Error sending quotation"), variant: "destructive" });
    },
  });

  useEffect(() => {
    if (autoPrint && quotation && !quotationLoading) {
      const timer = setTimeout(() => setShowPrintTransition(true), 800);
      return () => clearTimeout(timer);
    }
  }, [autoPrint, quotation, quotationLoading]);

  const fmtNum = (v: string | number | null | undefined) =>
    parseFloat(String(v || 0)).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const customer = customers.find((c) => c.id === quotation?.customerId);

  const validUntil = quotation?.validUntil
    ? new Date(quotation.validUntil)
    : quotation?.createdAt
    ? new Date(new Date(quotation.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000)
    : null;

  const doPrint = () => {
    const content = document.getElementById("quotation-receipt");
    if (!content) {
      window.print();
      return;
    }
    const pw = window.open("", "_blank");
    if (!pw) return;
    pw.document.write(`
      <html dir="rtl">
        <head>
          <title>${t("عرض سعر", "Price Quotation")} #${quotation?.quotationNumber || id}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: system-ui, -apple-system, sans-serif; padding: 8px; color: #000; font-size: 11px; max-width: 80mm; margin: 0 auto; direction: rtl; }
            table { border-collapse: collapse; width: 100%; }
            td, th { border: 1px solid #000; padding: 3px 4px; font-size: 10px; }
            @media print { @page { size: 80mm auto; margin: 4mm; } body { max-width: 100%; } }
          </style>
        </head>
        <body>${content.innerHTML}</body>
      </html>
    `);
    pw.document.close();
    setTimeout(() => {
      pw.print();
      pw.close();
    }, 500);
  };

  const handlePrint = () => {
    setShowPrintTransition(true);
  };

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  if (quotationLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!quotation) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        {t("عرض السعر غير موجود", "Quotation not found")}
      </div>
    );
  }

  interface QuotationItem {
    nameAr?: string;
    nameEn?: string;
    description?: string;
    productType?: string;
    code?: string;
    quantity?: number | string;
    unitPrice?: number | string;
    optionsCost?: number | string;
    total?: number | string;
  }
  const items: QuotationItem[] = Array.isArray(quotation.items) ? (quotation.items as QuotationItem[]) : [];
  const sellerName =
    companySettings?.nameAr || "مصنع تيك للمنتجات الخشبية";
  const sellerVatNumber = companySettings?.vatNumber || "311476070100003";
  const sellerAddress = companySettings?.address || "الرياض، المملكة العربية السعودية";

  return (
    <div className="max-w-md mx-auto">
      <LoadingTransition
        show={showPrintTransition}
        message={t("جاري تجهيز عرض السعر...", "Preparing quotation...")}
        subMessage={t("يتم تجهيز المستند للطباعة", "Preparing document for printing")}
        duration={1000}
        onComplete={() => {
          setShowPrintTransition(false);
          doPrint();
        }}
      />

      <div className="flex items-center justify-between mb-4 print:hidden gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" data-testid="button-back" onClick={() => navigate(returnTo || "/quotations")}>
            <BackIcon className="w-4 h-4" />
          </Button>
          <h1 className="text-lg font-bold">
            {t("عرض سعر", "Price Quotation")} #{quotation.quotationNumber}
          </h1>
          {quotation.status === "approved" && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400 font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />{t("مُعتمد", "Approved")}
            </span>
          )}
          {quotation.status === "sent" && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 font-medium">
              {t("مُرسل", "Sent")}
            </span>
          )}
          {quotation.status === "draft" && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 font-medium">
              {t("مسودة", "Draft")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(quotation.status === "draft" || quotation.status === "sent") && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(`/quotation-builder?quotationId=${id}`)}
              data-testid="button-edit-quotation"
            >
              <Pencil className="w-4 h-4 me-2" />
              {t("تعديل", "Edit")}
            </Button>
          )}
          {quotation.status === "draft" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => sendMutation.mutate()}
              disabled={sendMutation.isPending}
              data-testid="button-send-quotation"
            >
              {sendMutation.isPending ? <Loader2 className="w-4 h-4 me-2 animate-spin" /> : <Send className="w-4 h-4 me-2" />}
              {t("إرسال للعميل", "Send to Customer")}
            </Button>
          )}
          {canApprove && (
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => setApproveDialogOpen(true)}
              data-testid="button-approve-quotation"
            >
              <CheckCircle2 className="w-4 h-4 me-2" />
              {t("اعتماد في المعرض", "Approve In Showroom")}
            </Button>
          )}
          <Button onClick={handlePrint} size="sm" variant="outline" data-testid="button-print">
            <Printer className="w-4 h-4 me-2" />
            {t("طباعة", "Print")}
          </Button>
        </div>
      </div>

      {/* Payment receipt (screen only) */}
      {(quotation as any).paymentReceiptData && (
        <div className="print:hidden mb-4 border rounded-lg p-3 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800 space-y-2" data-testid="section-payment-receipt">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-semibold text-sm">
            <Receipt className="w-4 h-4" />
            {t("وصل الدفع المرفق", "Attached Payment Receipt")}
          </div>
          {(quotation as any).paymentReceiptData.startsWith("data:image") ? (
            <img
              src={(quotation as any).paymentReceiptData}
              alt="payment receipt"
              className="max-h-48 rounded border object-contain w-full"
              data-testid="img-receipt"
            />
          ) : (
            <a
              href={(quotation as any).paymentReceiptData}
              download={(quotation as any).paymentReceiptName || "receipt.pdf"}
              className="flex items-center gap-2 text-sm text-primary underline"
              data-testid="link-receipt-download"
            >
              <Receipt className="w-4 h-4" />
              {(quotation as any).paymentReceiptName || t("تحميل الوصل", "Download receipt")}
            </a>
          )}
        </div>
      )}

      <div className="bg-white rounded-lg border shadow-sm print:shadow-none print:border-none overflow-hidden">
        <div
          id="quotation-receipt"
          dir="rtl"
          className="p-4 text-black"
          style={{
            fontSize: "12px",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          <div
            style={{
              backgroundColor: "#2563eb",
              color: "#fff",
              textAlign: "center",
              padding: "10px 4px",
              fontWeight: "bold",
              fontSize: "16px",
              marginBottom: "10px",
            }}
          >
            {t("عرض سعر", "Price Quotation")}
          </div>

          <div
            style={{
              textAlign: "center",
              marginBottom: "8px",
              fontSize: "12px",
            }}
          >
            {t("رقم عرض السعر:", "Quotation #:")} {quotation.quotationNumber}
          </div>

          <div style={{ textAlign: "center", marginBottom: "4px" }}>
            <img
              src={teakLogo}
              alt="Teak"
              style={{
                width: "44px",
                height: "44px",
                objectFit: "contain",
                margin: "0 auto 4px",
                display: "block",
              }}
            />
          </div>

          <div
            style={{
              textAlign: "center",
              fontWeight: "bold",
              fontSize: "14px",
              marginBottom: "2px",
            }}
          >
            {sellerName}
          </div>
          <div
            style={{
              textAlign: "center",
              fontSize: "11px",
              color: "#666",
              marginBottom: "10px",
            }}
          >
            {sellerAddress}
          </div>

          <div
            style={{
              border: "1px solid #000",
              padding: "8px 10px",
              marginBottom: "10px",
              fontSize: "11px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "4px",
              }}
            >
              <span>{t("تاريخ الإصدار:", "Issue Date:")}</span>
              <span>
                {quotation.createdAt
                  ? new Date(quotation.createdAt).toLocaleDateString("ar-SA", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    })
                  : "-"}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "4px",
              }}
            >
              <span>{t("صالح حتى:", "Valid Until:")}</span>
              <span style={{ color: "#2563eb", fontWeight: "bold" }}>
                {validUntil
                  ? validUntil.toLocaleDateString("ar-SA", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    })
                  : "-"}
              </span>
            </div>
            <div>
              <span>{t("رقم تسجيل ضريبة القيمة المضافة: ", "VAT Reg. No.: ")}</span>
              <span style={{ direction: "ltr", unicodeBidi: "embed" }}>
                {sellerVatNumber}
              </span>
            </div>
          </div>

          {customer && (
            <div
              style={{
                border: "1px solid #000",
                padding: "8px 10px",
                marginBottom: "10px",
                fontSize: "11px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "4px",
                }}
              >
                <span>{t("اسم العميل:", "Customer:")}</span>
                <span style={{ fontWeight: "bold" }}>{customer.fullName}</span>
              </div>
              {customer.phone && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>{t("الجوال:", "Phone:")}</span>
                  <span style={{ direction: "ltr", unicodeBidi: "embed" }}>
                    {customer.phone}
                  </span>
                </div>
              )}
            </div>
          )}

          {items.length > 0 && (
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                marginBottom: "10px",
                fontSize: "11px",
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      border: "1px solid #000",
                      padding: "5px 4px",
                      textAlign: "right",
                      fontWeight: "bold",
                    }}
                  >
                    {t("البند", "Item")}
                  </th>
                  <th
                    style={{
                      border: "1px solid #000",
                      padding: "5px 4px",
                      textAlign: "center",
                      fontWeight: "bold",
                    }}
                  >
                    {t("الكمية", "Qty")}
                  </th>
                  <th
                    style={{
                      border: "1px solid #000",
                      padding: "5px 4px",
                      textAlign: "center",
                      fontWeight: "bold",
                    }}
                  >
                    {t("السعر", "Price")}
                  </th>
                  <th
                    style={{
                      border: "1px solid #000",
                      padding: "5px 4px",
                      textAlign: "center",
                      fontWeight: "bold",
                    }}
                  >
                    {t("الضريبة", "VAT")}
                  </th>
                  <th
                    style={{
                      border: "1px solid #000",
                      padding: "5px 4px",
                      textAlign: "center",
                      fontWeight: "bold",
                    }}
                  >
                    {t("الإجمالي شامل الضريبة", "Total incl. VAT")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const itemQty = parseFloat(String(item.quantity ?? 1));
                  const unitPrice = parseFloat(String(item.unitPrice ?? 0));
                  const optionsCost = parseFloat(String(item.optionsCost ?? 0));
                  const linePreTax = (unitPrice + optionsCost) * itemQty;
                  const lineVat = linePreTax * 0.15;
                  const lineWithVat = linePreTax + lineVat;
                  const description =
                    item.nameAr ||
                    item.description ||
                    item.productType ||
                    `${t("بند", "Item")} ${idx + 1}`;
                  return (
                    <tr key={idx}>
                      <td
                        style={{
                          border: "1px solid #000",
                          padding: "4px",
                          textAlign: "right",
                        }}
                      >
                        {description}
                        {item.code && (
                          <div style={{ fontSize: "9px", color: "#666" }}>
                            {item.code}
                          </div>
                        )}
                      </td>
                      <td
                        style={{
                          border: "1px solid #000",
                          padding: "4px",
                          textAlign: "center",
                        }}
                      >
                        {itemQty}
                      </td>
                      <td
                        style={{
                          border: "1px solid #000",
                          padding: "4px",
                          textAlign: "center",
                        }}
                      >
                        {fmtNum(unitPrice + optionsCost)}
                      </td>
                      <td
                        style={{
                          border: "1px solid #000",
                          padding: "4px",
                          textAlign: "center",
                        }}
                      >
                        {fmtNum(lineVat)}
                      </td>
                      <td
                        style={{
                          border: "1px solid #000",
                          padding: "4px",
                          textAlign: "center",
                        }}
                      >
                        {fmtNum(lineWithVat)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <div style={{ marginBottom: "10px" }}>
            <div
              style={{
                border: "1px solid #000",
                padding: "7px 10px",
                display: "flex",
                justifyContent: "space-between",
                fontSize: "12px",
              }}
            >
              <span>{t("إجمالي المبلغ قبل الضريبة", "Subtotal (excl. VAT)")}</span>
              <span style={{ fontWeight: "bold" }}>
                {fmtNum(quotation.subtotal)}
              </span>
            </div>
            {parseFloat(quotation.discount || "0") > 0 && (
              <div
                style={{
                  border: "1px solid #000",
                  borderTop: "none",
                  padding: "7px 10px",
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "12px",
                  color: "#16a34a",
                }}
              >
                <span>{t("الخصم", "Discount")}</span>
                <span style={{ fontWeight: "bold" }}>
                  -{fmtNum(quotation.discount)}
                </span>
              </div>
            )}
            <div
              style={{
                border: "1px solid #000",
                borderTop: "none",
                padding: "7px 10px",
                display: "flex",
                justifyContent: "space-between",
                fontSize: "12px",
              }}
            >
              <span>{t("ضريبة القيمة المضافة (15%)", "VAT (15%)")}</span>
              <span style={{ fontWeight: "bold" }}>
                {fmtNum(quotation.vatAmount)}
              </span>
            </div>
            <div
              style={{
                border: "1px solid #000",
                borderTop: "none",
                padding: "7px 10px",
                display: "flex",
                justifyContent: "space-between",
                fontSize: "12px",
                backgroundColor: "#dbeafe",
                fontWeight: "bold",
              }}
            >
              <span>{t("الإجمالي النهائي شامل الضريبة", "Total incl. VAT")}</span>
              <span>{fmtNum(quotation.finalPrice)}</span>
            </div>
          </div>

          {quotation.deliveryDays && (
            <div
              style={{
                border: "1px solid #ddd",
                padding: "6px 10px",
                marginBottom: "10px",
                fontSize: "11px",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>{t("مدة التسليم:", "Delivery:")}</span>
              <span>
                {quotation.deliveryDays} {t("يوم", "days")}
              </span>
            </div>
          )}

          {quotation.notes && (
            <div
              style={{
                border: "1px solid #ddd",
                padding: "6px 10px",
                marginBottom: "10px",
                fontSize: "11px",
              }}
            >
              <div style={{ fontWeight: "bold", marginBottom: "3px" }}>
                {t("ملاحظات:", "Notes:")}
              </div>
              <div style={{ color: "#444" }}>{quotation.notes}</div>
            </div>
          )}

          <div
            style={{
              textAlign: "center",
              fontSize: "10px",
              color: "#888",
              marginTop: "12px",
              borderTop: "1px dashed #ccc",
              paddingTop: "8px",
            }}
          >
            <div>
              {t(
                "هذا عرض سعر وليس فاتورة رسمية — صالح حتى",
                "This is a price quotation, not an official invoice — valid until"
              )}{" "}
              {validUntil
                ? validUntil.toLocaleDateString("ar-SA", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                  })
                : "-"}
            </div>
            <div style={{ marginTop: "4px" }}>
              {sellerName} | {sellerVatNumber}
            </div>
          </div>
        </div>
      </div>

      {/* Approve In-Person Dialog */}
      <Dialog open={approveDialogOpen} onOpenChange={(open) => {
        setApproveDialogOpen(open);
        if (!open) { setApproveReceiptFile(null); setApproveReceiptPreview(null); }
      }}>
        <DialogContent className="max-w-sm" data-testid="dialog-approve-view">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              {t("اعتماد عرض السعر بالحضور الشخصي", "Approve Quotation In-Person")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">{t("عرض السعر", "Quotation")} #{quotation.quotationNumber}</p>
              <p className="text-sm font-semibold">{customer?.fullName || "—"}</p>
              <p className="text-base font-bold text-primary mt-1">{parseFloat(quotation.finalPrice).toLocaleString()} {t("ر.س", "SAR")}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              {t(
                "يُستخدم هذا الاعتماد عندما يحضر العميل للمعرض ويوافق على عرض السعر ويسدد الدفعة الأولى نقداً أو عبر نقاط البيع أو حوالة بنكية.",
                "Use this when the customer visits the showroom and approves the quotation, paying the first installment in cash, POS, or bank transfer."
              )}
            </p>
            <div className="space-y-2">
              <Label>{t("المبلغ المدفوع", "Amount Paid")}</Label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder={t("أدخل المبلغ", "Enter amount")}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={approveAmount}
                onChange={(e) => setApproveAmount(e.target.value)}
                data-testid="input-approve-amount"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("طريقة الدفع", "Payment Method")}</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={approveMethod}
                onChange={(e) => setApproveMethod(e.target.value)}
                data-testid="select-approve-method"
              >
                <option value="bank_transfer">{t("تحويل بنكي", "Bank Transfer")}</option>
                <option value="cash">{t("نقداً", "Cash")}</option>
                <option value="pos">{t("نقطة بيع (POS)", "POS")}</option>
                <option value="check">{t("شيك", "Check")}</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>{t("وصل الدفع (اختياري)", "Payment Receipt (optional)")}</Label>
              {approveReceiptPreview ? (
                <div className="relative rounded-md border overflow-hidden">
                  <img src={approveReceiptPreview} alt="receipt" className="w-full max-h-40 object-contain bg-muted/20" />
                  <button
                    className="absolute top-1 end-1 bg-background/80 rounded-full p-0.5 hover:bg-destructive hover:text-white transition-colors"
                    onClick={() => { setApproveReceiptFile(null); setApproveReceiptPreview(null); }}
                    data-testid="button-remove-receipt-view"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label
                  className="w-full border-2 border-dashed rounded-md py-4 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer"
                  data-testid="button-upload-receipt-view"
                >
                  <input
                    ref={approveReceiptInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setApproveReceiptFile(file);
                      const reader = new FileReader();
                      reader.onload = (ev) => setApproveReceiptPreview(ev.target?.result as string);
                      reader.readAsDataURL(file);
                    }}
                    data-testid="input-receipt-file-view"
                  />
                  <Receipt className="w-5 h-5" />
                  <span className="text-sm">{t("ارفع صورة الوصل", "Upload receipt image")}</span>
                </label>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => { setApproveDialogOpen(false); setApproveReceiptFile(null); setApproveReceiptPreview(null); }} data-testid="button-cancel-approve-view">
              {t("إلغاء", "Cancel")}
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
              data-testid="button-confirm-approve-view"
            >
              {approveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin me-1.5" /> : <CheckCircle2 className="w-4 h-4 me-1.5" />}
              {t("تأكيد الاعتماد", "Confirm Approval")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
