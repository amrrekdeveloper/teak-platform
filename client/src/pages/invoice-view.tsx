import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { useRoute, Link } from "wouter";
import type { Invoice } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Loader2, Printer, QrCode } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import teakLogo from "@assets/TEAK-LOGO_(1)_(1)_1772710617816.png";

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

  const { data: invoice, isLoading } = useQuery<Invoice>({
    queryKey: ["/api/invoices", id],
    enabled: !!id,
  });

  const handlePrint = () => window.print();

  const formatNum = (v: any) => parseFloat(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  const invoiceTitle = isTaxInvoice
    ? t("فاتورة ضريبية مبسطة", "Simplified Tax Invoice")
    : t("عرض سعر ضريبي", "Tax Price Quotation");

  return (
    <div className="max-w-md mx-auto">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/invoices">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <BackIcon className="w-4 h-4" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">{invoiceTitle}</h1>
        </div>
        <Button onClick={handlePrint} data-testid="button-print">
          <Printer className="w-4 h-4 me-2" />
          {t("طباعة / تحميل", "Print / Download")}
        </Button>
      </div>

      <Card className="print:shadow-none print:border-none" id="invoice-content">
        <CardContent className="p-5 sm:p-6">
          <div className={`text-center pb-4 mb-4 border-b-2 ${isTaxInvoice ? "border-green-500" : "border-blue-500"}`}>
            <div className={`inline-block px-6 py-2.5 rounded-md mb-3 ${isTaxInvoice ? "bg-green-600 text-white" : "bg-blue-600 text-white"}`}>
              <p className="font-bold text-lg">{invoiceTitle}</p>
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              {t("رقم الفاتورة:", "Invoice No:")} <span className="font-bold text-foreground" data-testid="text-invoice-number">{invoice.invoiceNumber}</span>
            </p>
            <img src={teakLogo} alt="Teak" className="w-12 h-12 object-contain mx-auto mb-1 logo-red" />
            <h2 className="text-base font-bold">{invoice.sellerName}</h2>
            {invoice.sellerAddress && <p className="text-xs text-muted-foreground">{invoice.sellerAddress}</p>}
          </div>

          <div className="space-y-2 mb-5 text-sm border rounded-lg p-3 bg-muted/20">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("تاريخ:", "Date:")}</span>
              <span className="font-medium">
                {invoice.issuedAt
                  ? new Date(invoice.issuedAt).toLocaleDateString("ar-SA", { year: "numeric", month: "2-digit", day: "2-digit" })
                  : "-"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("رقم تسجيل ضريبة القيمة المضافة:", "VAT Registration No:")}</span>
              <span className="font-mono font-medium text-xs" dir="ltr">{invoice.sellerVatNumber}</span>
            </div>
          </div>

          {isTaxInvoice && invoice.paymentStage && (
            <div className="mb-4 text-sm border rounded-lg p-3 bg-muted/10">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("مرحلة الدفع:", "Payment Stage:")}</span>
                <span className="font-medium">
                  {t(stageLabels[invoice.paymentStage]?.ar || invoice.paymentStage, stageLabels[invoice.paymentStage]?.en || invoice.paymentStage)}
                </span>
              </div>
              {invoice.paymentMethod && (
                <div className="flex justify-between mt-1">
                  <span className="text-muted-foreground">{t("طريقة الدفع:", "Payment Method:")}</span>
                  <span className="font-medium">{invoice.paymentMethod}</span>
                </div>
              )}
            </div>
          )}

          {invoice.buyerName && (
            <div className="mb-4 text-sm border rounded-lg p-3 bg-muted/10">
              <p className="text-xs text-muted-foreground uppercase mb-1">{t("بيانات المشتري", "BUYER DETAILS")}</p>
              <p className="font-semibold" data-testid="text-buyer-name">{invoice.buyerName}</p>
              {invoice.buyerPhone && <p className="text-xs text-muted-foreground" dir="ltr">{invoice.buyerPhone}</p>}
            </div>
          )}

          {Array.isArray(invoice.items) && invoice.items.length > 0 && (
            <div className="mb-5">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-y bg-muted/30">
                    <th className="text-start py-2 px-2 font-semibold">{t("المنتجات", "Products")}</th>
                    <th className="text-center py-2 px-1 font-semibold">{t("الكمية", "Qty")}</th>
                    <th className="text-center py-2 px-1 font-semibold">{t("سعر الوحدة", "Unit Price")}</th>
                    <th className="text-center py-2 px-1 font-semibold">{t("ض.ق.م", "VAT")}</th>
                    <th className="text-end py-2 px-2 font-semibold">{t("السعر شامل ض.ق.م", "Total incl. VAT")}</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item: any, idx: number) => {
                    const itemAmount = parseFloat(item.amount || item.total || 0);
                    const itemQty = parseFloat(item.quantity || 1);
                    const unitPrice = item.unitPrice ? parseFloat(item.unitPrice) : itemAmount / itemQty / 1.15;
                    const itemVat = item.vat ? parseFloat(item.vat) : itemAmount - (itemAmount / 1.15);
                    const itemWithVat = item.totalWithVat ? parseFloat(item.totalWithVat) : itemAmount;
                    return (
                      <tr key={idx} className="border-b">
                        <td className="py-2 px-2">{item.description || item.productType || `${t("منتج", "Product")} ${idx + 1}`}</td>
                        <td className="py-2 px-1 text-center">{item.quantity || "1"}</td>
                        <td className="py-2 px-1 text-center">{formatNum(unitPrice)}</td>
                        <td className="py-2 px-1 text-center">{formatNum(itemVat)}</td>
                        <td className="py-2 px-2 text-end font-medium">{formatNum(itemWithVat)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="space-y-0 mb-6">
            <div className="flex justify-between items-center py-2.5 px-4 border rounded-t-lg bg-muted/20">
              <span className="text-sm font-semibold">{t("إجمالي المبلغ الخاضع للضريبة", "Total Taxable Amount")}</span>
              <span className="text-sm font-bold">{formatNum(invoice.subtotal)}</span>
            </div>
            <div className="flex justify-between items-center py-2.5 px-4 border-x border-b bg-muted/20">
              <span className="text-sm font-semibold">{t("ضريبة القيمة المضافة", "VAT")} ({invoice.vatRate}%)</span>
              <span className="text-sm font-bold">{formatNum(invoice.vatAmount)}</span>
            </div>
            <div className={`flex justify-between items-center py-3 px-4 border rounded-b-lg ${isTaxInvoice ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900" : "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900"}`}>
              <span className="font-bold">{t("المجموع مع الضريبة", "Total with VAT")} ({invoice.vatRate}%)</span>
              <span className="font-bold text-lg" data-testid="text-total-with-vat">{formatNum(invoice.totalWithVat)}</span>
            </div>
          </div>

          {invoice.qrCodeData && (
            <div className="border-t pt-5">
              <div className="text-center">
                <p className="text-[11px] text-muted-foreground mb-3">
                  {`>>>>>>>>>>>>>> ${t("إغلاق الفاتورة", "Invoice Close")} ${invoice.invoiceNumber || ""} >>>>>>>>>>>>>>`}
                </p>
                <ZatcaQRCode data={invoice.qrCodeData} size={160} />
                <p className="text-xs text-muted-foreground mt-2">
                  {t("رمز الاستجابة السريعة (QR Code)", "Quick Response Code (QR Code)")}
                </p>
              </div>
            </div>
          )}

          {isTaxInvoice && (
            <p className="text-[10px] text-muted-foreground text-center mt-4 pt-3 border-t">
              {t(
                "فاتورة ضريبية مبسطة صادرة وفقاً لمتطلبات هيئة الزكاة والضريبة والجمارك (ZATCA)",
                "Simplified tax invoice issued per ZATCA requirements"
              )}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
