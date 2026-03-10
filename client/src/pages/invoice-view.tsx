import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { useRoute, Link } from "wouter";
import type { Invoice } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Loader2, Printer } from "lucide-react";
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

  return <canvas ref={canvasRef} style={{ display: "block", margin: "0 auto" }} data-testid="qr-code" />;
}

export default function InvoiceViewPage() {
  const { t, isRTL } = useLanguage();
  const [, params] = useRoute("/invoices/:id");
  const id = params?.id;

  const { data: invoice, isLoading } = useQuery<Invoice>({
    queryKey: ["/api/invoices", id],
    enabled: !!id,
  });

  const fmtNum = (v: any) => parseFloat(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handlePrint = () => {
    const content = document.getElementById("invoice-receipt");
    if (!content) { window.print(); return; }
    const pw = window.open("", "_blank");
    if (!pw) return;
    pw.document.write(`
      <html dir="rtl">
        <head>
          <title>${invoice?.invoiceNumber || id}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: system-ui, -apple-system, sans-serif; padding: 8px; color: #000; font-size: 11px; max-width: 80mm; margin: 0 auto; direction: rtl; }
            canvas { display: block; margin: 0 auto; }
            table { border-collapse: collapse; width: 100%; }
            td, th { border: 1px solid #000; padding: 3px 4px; font-size: 10px; }
            @media print { @page { size: 80mm auto; margin: 4mm; } body { max-width: 100%; } }
          </style>
        </head>
        <body>${content.innerHTML}</body>
      </html>
    `);
    pw.document.close();
    setTimeout(() => { pw.print(); pw.close(); }, 500);
  };

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
  const headerTitle = isTaxInvoice
    ? t("فاتورة ضريبية مبسطة", "Simplified Tax Invoice")
    : t("عرض سعر ضريبي", "Tax Price Quotation");
  const headerColor = isTaxInvoice ? "#16a34a" : "#2563eb";

  return (
    <div className="max-w-md mx-auto">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/invoices">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <BackIcon className="w-4 h-4" />
            </Button>
          </Link>
          <h1 className="text-lg font-bold">{headerTitle}</h1>
        </div>
        <Button onClick={handlePrint} size="sm" data-testid="button-print">
          <Printer className="w-4 h-4 me-2" />
          {t("طباعة", "Print")}
        </Button>
      </div>

      <div className="bg-white rounded-lg border shadow-sm print:shadow-none print:border-none overflow-hidden">
        <div id="invoice-receipt" dir="rtl" className="p-4 text-black" style={{ fontSize: "12px", fontFamily: "system-ui, -apple-system, sans-serif" }}>
          <div style={{ backgroundColor: headerColor, color: "#fff", textAlign: "center", padding: "10px 4px", fontWeight: "bold", fontSize: "16px", marginBottom: "10px" }}>
            {isTaxInvoice ? "فاتورة ضريبية مبسطة" : "عرض سعر ضريبي"}
          </div>

          <div style={{ textAlign: "center", marginBottom: "8px", fontSize: "12px" }}>
            رقم الفاتورة: {invoice.invoiceNumber}
          </div>

          <div style={{ textAlign: "center", marginBottom: "4px" }}>
            <img src={teakLogo} alt="Teak" style={{ width: "44px", height: "44px", objectFit: "contain", margin: "0 auto 4px", display: "block" }} />
          </div>

          <div style={{ textAlign: "center", fontWeight: "bold", fontSize: "14px", marginBottom: "2px" }}>
            {invoice.sellerName}
          </div>
          {invoice.sellerAddress && (
            <div style={{ textAlign: "center", fontSize: "11px", color: "#666", marginBottom: "10px" }}>
              {invoice.sellerAddress}
            </div>
          )}

          <div style={{ border: "1px solid #000", padding: "8px 10px", marginBottom: "10px", fontSize: "11px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
              <span>تاريخ:</span>
              <span>{invoice.issuedAt ? new Date(invoice.issuedAt).toLocaleDateString("ar-SA", { year: "numeric", month: "2-digit", day: "2-digit" }) : "-"}</span>
            </div>
            <div>
              <span>رقم تسجيل ضريبة القيمة المضافة: </span>
              <span style={{ direction: "ltr", unicodeBidi: "embed" }}>{invoice.sellerVatNumber}</span>
            </div>
          </div>

          {Array.isArray(invoice.items) && invoice.items.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "10px", fontSize: "11px" }}>
              <thead>
                <tr>
                  <th style={{ border: "1px solid #000", padding: "5px 4px", textAlign: "right", fontWeight: "bold" }}>المنتجات</th>
                  <th style={{ border: "1px solid #000", padding: "5px 4px", textAlign: "center", fontWeight: "bold" }}>الكمية</th>
                  <th style={{ border: "1px solid #000", padding: "5px 4px", textAlign: "center", fontWeight: "bold" }}>سعر الوحدة</th>
                  <th style={{ border: "1px solid #000", padding: "5px 4px", textAlign: "center", fontWeight: "bold" }}>ضريبة القيمة المضافة</th>
                  <th style={{ border: "1px solid #000", padding: "5px 4px", textAlign: "center", fontWeight: "bold" }}>السعر شامل ضريبة القيمة المضافة</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item: any, idx: number) => {
                  const itemTotal = parseFloat(item.amount || item.total || 0);
                  const itemQty = parseFloat(item.quantity || 1);
                  const unitPrice = item.unitPrice ? parseFloat(item.unitPrice) : itemTotal / itemQty / 1.15;
                  const itemVat = item.vat ? parseFloat(item.vat) : itemTotal - (itemTotal / 1.15);
                  const itemWithVat = item.totalWithVat ? parseFloat(item.totalWithVat) : itemTotal;
                  return (
                    <tr key={idx}>
                      <td style={{ border: "1px solid #000", padding: "4px", textAlign: "right" }}>{item.description || item.productType || `منتج ${idx + 1}`}</td>
                      <td style={{ border: "1px solid #000", padding: "4px", textAlign: "center" }}>{item.quantity || "1"}</td>
                      <td style={{ border: "1px solid #000", padding: "4px", textAlign: "center" }}>{fmtNum(unitPrice)}</td>
                      <td style={{ border: "1px solid #000", padding: "4px", textAlign: "center" }}>{fmtNum(itemVat)}</td>
                      <td style={{ border: "1px solid #000", padding: "4px", textAlign: "center" }}>{fmtNum(itemWithVat)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <div style={{ marginBottom: "10px" }}>
            <div style={{ border: "1px solid #000", padding: "7px 10px", display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
              <span>إجمالي المبلغ الخاضع للضريبة</span>
              <span style={{ fontWeight: "bold" }}>{fmtNum(invoice.subtotal)}</span>
            </div>
            <div style={{ border: "1px solid #000", borderTop: "none", padding: "7px 10px", display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
              <span>ضريبة القيمة المضافة ({invoice.vatRate}%)</span>
              <span style={{ fontWeight: "bold" }}>{fmtNum(invoice.vatAmount)}</span>
            </div>
            <div style={{ border: "1px solid #000", borderTop: "none", padding: "7px 10px", display: "flex", justifyContent: "space-between", fontSize: "12px", backgroundColor: isTaxInvoice ? "#dcfce7" : "#dbeafe", fontWeight: "bold" }}>
              <span>المجموع مع الضريبة ({invoice.vatRate}%)</span>
              <span>{fmtNum(invoice.totalWithVat)}</span>
            </div>
          </div>

          {invoice.qrCodeData && (
            <div style={{ textAlign: "center" }}>
              <div style={{ color: headerColor, fontSize: "10px", marginBottom: "8px" }}>
                {">>>>>>>>>>>>>>>>"} إغلاق الفاتورة {invoice.invoiceNumber || ""} {"<<<<<<<<<<<<<<<<"}
              </div>
              <ZatcaQRCode data={invoice.qrCodeData} size={160} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
