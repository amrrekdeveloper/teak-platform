import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { useRoute, Link } from "wouter";
import type { Invoice } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Loader2, Download, QrCode } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import logoEN from "@assets/logo_teak2_1772689894105.png";
import logoAR from "@assets/logo_teak1_1772689915503.png";

function ZatcaQRCode({ data, size = 160 }: { data: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!canvasRef.current || !data) return;
    import("qrcode").then((QRCode) => {
      QRCode.toCanvas(canvasRef.current, data, {
        width: size,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
        errorCorrectionLevel: "M",
      }).catch(() => setError(true));
    }).catch(() => setError(true));
  }, [data, size]);

  if (error) {
    return (
      <div className="w-40 h-40 border rounded flex items-center justify-center text-muted-foreground text-xs text-center p-2">
        QR Code Data Present
      </div>
    );
  }

  return <canvas ref={canvasRef} className="mx-auto" data-testid="qr-code" />;
}

const stageLabels: Record<string, { ar: string; en: string }> = {
  deposit: { ar: "عربون", en: "Deposit" },
  pre_manufacturing: { ar: "دفعة قبل التصنيع", en: "Pre-manufacturing" },
  delivery: { ar: "دفعة عند التوصيل", en: "Upon Delivery" },
  final: { ar: "الدفعة النهائية", en: "Final Payment" },
};

export default function InvoiceViewPage() {
  const { t, isRTL, lang } = useLanguage();
  const [, params] = useRoute("/invoices/:id");
  const id = params?.id;
  const currentLogo = lang === "ar" ? logoAR : logoEN;

  const { data: invoice, isLoading } = useQuery<Invoice>({
    queryKey: ["/api/invoices", id],
    enabled: !!id,
  });

  const handlePrint = () => window.print();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!invoice) {
    return <div className="text-center py-12 text-muted-foreground">{t("الفاتورة غير موجودة", "Invoice not found")}</div>;
  }

  const isTaxInvoice = invoice.type === "simplified_tax_invoice";
  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/invoices">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <BackIcon className="w-4 h-4" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">
            {isTaxInvoice ? t("فاتورة ضريبية مبسطة", "Simplified Tax Invoice") : t("عرض سعر", "Quotation")}
          </h1>
        </div>
        <Button onClick={handlePrint} data-testid="button-print">
          <Download className="w-4 h-4 me-2" />
          {t("طباعة / تحميل", "Print / Download")}
        </Button>
      </div>

      <Card className="print:shadow-none print:border-none" id="invoice-content">
        <CardContent className="p-6 sm:p-8">
          <div className="flex items-start justify-between mb-8">
            <div>
              <img src={currentLogo} alt="Teak" className="w-16 h-16 object-contain mb-2" />
              <h2 className="text-xl font-bold">{invoice.sellerName}</h2>
              <p className="text-sm text-muted-foreground">{invoice.sellerAddress}</p>
              <p className="text-sm text-muted-foreground" dir="ltr">
                {t("الرقم الضريبي: ", "VAT#: ")}{invoice.sellerVatNumber}
              </p>
            </div>
            <div className="text-end">
              <div className={`text-lg font-bold mb-2 ${isTaxInvoice ? "text-green-700 dark:text-green-400" : "text-blue-700 dark:text-blue-400"}`}>
                {isTaxInvoice ? t("فاتورة ضريبية مبسطة", "Simplified Tax Invoice") : t("عرض سعر", "Price Quotation")}
              </div>
              <p className="text-sm">
                <span className="text-muted-foreground">{t("رقم: ", "No: ")}</span>
                <span className="font-bold" data-testid="text-invoice-number">#{invoice.invoiceNumber}</span>
              </p>
              {invoice.issuedAt && (
                <p className="text-sm text-muted-foreground">
                  {t("التاريخ: ", "Date: ")}
                  {new Date(invoice.issuedAt).toLocaleDateString("ar-SA", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              )}
            </div>
          </div>

          <div className="border-t border-b py-4 mb-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase">{t("بيانات المشتري", "BUYER DETAILS")}</p>
                <p className="font-semibold mt-1" data-testid="text-buyer-name">{invoice.buyerName}</p>
                {invoice.buyerPhone && <p className="text-sm text-muted-foreground" dir="ltr">{invoice.buyerPhone}</p>}
              </div>
              {isTaxInvoice && invoice.paymentStage && (
                <div className="text-end">
                  <p className="text-xs text-muted-foreground uppercase">{t("مرحلة الدفع", "PAYMENT STAGE")}</p>
                  <p className="font-semibold mt-1">
                    {t(stageLabels[invoice.paymentStage]?.ar || invoice.paymentStage, stageLabels[invoice.paymentStage]?.en || invoice.paymentStage)}
                  </p>
                  {invoice.paymentMethod && (
                    <p className="text-sm text-muted-foreground">{invoice.paymentMethod}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-start py-2 font-medium text-muted-foreground">{t("البيان", "Description")}</th>
                  <th className="text-end py-2 font-medium text-muted-foreground">{t("المبلغ", "Amount")}</th>
                </tr>
              </thead>
              <tbody>
                {Array.isArray(invoice.items) && invoice.items.map((item: any, idx: number) => (
                  <tr key={idx} className="border-b">
                    <td className="py-2">{item.description || item.productType || t("بند", "Item")}</td>
                    <td className="py-2 text-end">{parseFloat(item.amount || item.total || 0).toLocaleString()} SAR</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end mb-8">
            <div className="w-64 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("المجموع قبل الضريبة", "Subtotal")}</span>
                <span>{parseFloat(invoice.subtotal).toLocaleString()} SAR</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("ضريبة القيمة المضافة", "VAT")} ({invoice.vatRate}%)</span>
                <span>{parseFloat(invoice.vatAmount).toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR</span>
              </div>
              <div className="flex justify-between font-bold text-lg pt-2 border-t">
                <span>{t("الإجمالي شامل الضريبة", "Total with VAT")}</span>
                <span className="text-primary" data-testid="text-total-with-vat">
                  {parseFloat(invoice.totalWithVat).toLocaleString(undefined, { maximumFractionDigits: 2 })} SAR
                </span>
              </div>
            </div>
          </div>

          {isTaxInvoice && invoice.qrCodeData && (
            <div className="border-t pt-6">
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <QrCode className="w-4 h-4" />
                  {t("رمز التحقق — امسح للتحقق من صحة الفاتورة", "Verification QR — Scan to verify invoice")}
                </div>
                <ZatcaQRCode data={invoice.qrCodeData} size={160} />
                <p className="text-xs text-muted-foreground text-center max-w-sm">
                  {t(
                    "هذه فاتورة ضريبية مبسطة صادرة وفقاً لمتطلبات هيئة الزكاة والضريبة والجمارك (ZATCA)",
                    "This is a simplified tax invoice issued in compliance with ZATCA requirements"
                  )}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
