import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  FileText, Receipt, Factory, Shield, Wrench, LogOut, CheckCircle2,
  Clock, Upload, Eye, Loader2,
  Calendar, Sun, Moon, Share2, Printer,
  AlertCircle, Package, CreditCard, X, QrCode,
} from "lucide-react";
import teakLogo from "@assets/TEAK-LOGO_(1)_(1)_1772710617816.png";

function ZatcaQRCode({ data, size = 120 }: { data: string; size?: number }) {
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
      <div className="w-[120px] h-[120px] border rounded flex items-center justify-center text-muted-foreground text-[10px] text-center p-2">
        QR Code
      </div>
    );
  }
  return <canvas ref={canvasRef} className="rounded" />;
}

type TabKey = "quotes" | "invoices" | "production" | "payments" | "warranty" | "maintenance";

function PortalHeader({ customerName }: { customerName: string }) {
  const { t, lang, setLang } = useLanguage();
  const { theme, toggleTheme } = useTheme();

  const handleLogout = () => {
    localStorage.removeItem("portalPhone");
    localStorage.removeItem("portalCustomerName");
    window.location.href = "/portal/login";
  };

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b">
      <div className="max-w-2xl mx-auto px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img src={teakLogo} alt="Teak" className="w-8 h-8 object-contain logo-auto" data-testid="img-portal-header-logo" />
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate" data-testid="text-header-name">{customerName}</p>
            <p className="text-[11px] text-muted-foreground">{t("بوابة العملاء", "Customer Portal")}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setLang(lang === "ar" ? "en" : "ar")} data-testid="button-lang-toggle">
            {lang === "ar" ? "EN" : "عربي"}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleTheme} data-testid="button-theme-toggle">
            {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={handleLogout} data-testid="button-logout">
            <LogOut className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </header>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useLanguage();
  const map: Record<string, { ar: string; en: string; cls: string }> = {
    draft: { ar: "مسودة", en: "Draft", cls: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
    sent: { ar: "مُرسل", en: "Sent", cls: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
    approved: { ar: "معتمد", en: "Approved", cls: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300" },
    rejected: { ar: "مرفوض", en: "Rejected", cls: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" },
    pending: { ar: "قيد الانتظار", en: "Pending", cls: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
    active: { ar: "نشط", en: "Active", cls: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300" },
    completed: { ar: "مكتمل", en: "Completed", cls: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300" },
    issued: { ar: "صادرة", en: "Issued", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
    paid: { ar: "مدفوعة", en: "Paid", cls: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300" },
    in_progress: { ar: "قيد التنفيذ", en: "In Progress", cls: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
    designing: { ar: "قيد التصميم", en: "Designing", cls: "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300" },
    cancelled: { ar: "ملغي", en: "Cancelled", cls: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" },
  };
  const info = map[status] || { ar: status, en: status, cls: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${info.cls}`} data-testid={`badge-status-${status}`}>
      {t(info.ar, info.en)}
    </span>
  );
}

function TabBar({ active, onChange, counts }: { active: TabKey; onChange: (t: TabKey) => void; counts: Record<TabKey, number> }) {
  const { t } = useLanguage();
  const scrollRef = useRef<HTMLDivElement>(null);

  const tabs: { key: TabKey; icon: typeof FileText; ar: string; en: string }[] = [
    { key: "quotes", icon: FileText, ar: "عروض الأسعار", en: "Quotes" },
    { key: "invoices", icon: Receipt, ar: "الفواتير", en: "Invoices" },
    { key: "production", icon: Factory, ar: "الإنتاج", en: "Production" },
    { key: "payments", icon: CreditCard, ar: "المدفوعات", en: "Payments" },
    { key: "warranty", icon: Shield, ar: "الضمان", en: "Warranty" },
    { key: "maintenance", icon: Wrench, ar: "الصيانة", en: "Maintenance" },
  ];

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const activeBtn = el.querySelector(`[data-active="true"]`) as HTMLElement;
    if (activeBtn) {
      activeBtn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [active]);

  return (
    <div className="border-b bg-background sticky top-[53px] z-40">
      <div
        ref={scrollRef}
        className="flex overflow-x-auto scrollbar-hide px-2"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {tabs.map((tab) => {
          const isActive = active === tab.key;
          const count = counts[tab.key];
          return (
            <button
              key={tab.key}
              data-active={isActive ? "true" : undefined}
              onClick={() => onChange(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors shrink-0 ${
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`tab-${tab.key}`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {t(tab.ar, tab.en)}
              {count > 0 && (
                <span className={`min-w-[18px] h-[18px] rounded-full text-[10px] flex items-center justify-center ${
                  isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, titleAr, titleEn }: { icon: typeof FileText; titleAr: string; titleEn: string }) {
  const { t } = useLanguage();
  return (
    <div className="text-center py-12">
      <Icon className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
      <p className="text-sm text-muted-foreground">{t(titleAr, titleEn)}</p>
    </div>
  );
}

function QuotationsTab({ quotations, designs, onApprove, approving }: {
  quotations: any[]; designs: any[]; onApprove: (id: number) => void; approving: boolean;
}) {
  const { t } = useLanguage();
  const [viewDesign, setViewDesign] = useState<number | null>(null);

  if (!quotations.length) return <EmptyState icon={FileText} titleAr="لا توجد عروض أسعار" titleEn="No quotations yet" />;

  const sorted = [...quotations].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  return (
    <div className="space-y-3">
      {sorted.map((q: any) => {
        const design = designs.find((d: any) => d.customerId === q.customerId && d.status === "completed");
        const isApproved = q.status === "approved";

        return (
          <Card key={q.id} className={`overflow-hidden ${isApproved ? "border-green-200 dark:border-green-900" : ""}`} data-testid={`card-quotation-${q.id}`}>
            <CardContent className="p-0">
              <div className={`px-4 py-3 flex items-center justify-between ${isApproved ? "bg-green-50/50 dark:bg-green-950/20" : "bg-blue-50/30 dark:bg-blue-950/10"}`}>
                <div className="flex items-center gap-2">
                  <FileText className={`w-4 h-4 ${isApproved ? "text-green-600" : "text-blue-600"}`} />
                  <span className="text-sm font-semibold">{t("عرض سعر", "Quotation")} #{q.id}</span>
                </div>
                <StatusBadge status={q.status} />
              </div>

              <div className="px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t("المبلغ الإجمالي", "Total Amount")}</span>
                  <span className="font-bold text-base">{Number(q.totalWithVat || q.total || 0).toLocaleString()} <span className="text-xs font-normal text-muted-foreground">{t("ريال", "SAR")}</span></span>
                </div>
                {q.vatAmount && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{t("شامل الضريبة", "Including VAT")}</span>
                    <span className="text-xs text-muted-foreground">{Number(q.vatAmount).toLocaleString()} {t("ريال", "SAR")}</span>
                  </div>
                )}
                {q.createdAt && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    {new Date(q.createdAt).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" })}
                  </div>
                )}

                {isApproved && (
                  <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 rounded-md px-2.5 py-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {t("تم اعتماده وتحويله لفاتورة ضريبية", "Approved and converted to tax invoice")}
                  </div>
                )}
              </div>

              {design?.sketchImage && (
                <div className="px-4 pb-3">
                  <button
                    onClick={() => setViewDesign(viewDesign === q.id ? null : q.id)}
                    className="text-xs text-primary flex items-center gap-1 hover:underline"
                    data-testid={`button-toggle-design-${q.id}`}
                  >
                    <Eye className="w-3 h-3" />
                    {t("عرض المخططات", "View Designs")}
                  </button>
                  {viewDesign === q.id && (
                    <div className="mt-2 border rounded-lg p-2 bg-muted/30">
                      <img src={design.sketchImage} alt="Design" className="w-full rounded" data-testid={`img-design-${q.id}`} />
                      {design.notes && <p className="text-xs text-muted-foreground mt-1.5">{design.notes}</p>}
                    </div>
                  )}
                </div>
              )}

              {(q.status === "sent" || q.status === "draft") && (
                <div className="px-4 pb-3">
                  <Button
                    onClick={() => onApprove(q.id)}
                    disabled={approving}
                    className="w-full h-10"
                    data-testid={`button-approve-quotation-${q.id}`}
                  >
                    {approving ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <CheckCircle2 className="w-4 h-4 me-2" />}
                    {t("اعتماد عرض السعر", "Approve Quotation")}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function InvoicePreviewModal({ invoice, onClose }: { invoice: any; onClose: () => void }) {
  const { t, lang } = useLanguage();
  const isTaxInvoice = invoice.type === "simplified_tax_invoice";
  const printRef = useRef<HTMLDivElement>(null);

  const formatNum = (v: any) => parseFloat(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html dir="rtl">
        <head>
          <title>${invoice.invoiceNumber || invoice.id}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: system-ui, -apple-system, sans-serif; padding: 20px; color: #1a1a1a; font-size: 13px; max-width: 400px; margin: 0 auto; }
            canvas { display: block; margin: 0 auto; }
          </style>
        </head>
        <body>${content.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${isTaxInvoice ? "فاتورة ضريبية مبسطة" : "عرض سعر"} #${invoice.invoiceNumber || invoice.id}`,
          text: `المبلغ: ${formatNum(invoice.totalWithVat)} ريال`,
        });
      } catch {}
    }
  };

  const invoiceTitle = isTaxInvoice
    ? t("فاتورة ضريبية مبسطة", "Simplified Tax Invoice")
    : t("عرض سعر ضريبي", "Tax Price Quotation");

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-background w-full sm:max-w-md sm:rounded-xl rounded-t-xl max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-background border-b px-4 py-2.5 flex items-center justify-between z-10">
          <h3 className="font-semibold text-sm">{invoiceTitle}</h3>
          <div className="flex items-center gap-1">
            {typeof navigator.share === "function" && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleShare} data-testid="button-share-invoice">
                <Share2 className="w-4 h-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handlePrint} data-testid="button-print-invoice">
              <Printer className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} data-testid="button-close-invoice">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div ref={printRef} className="px-4 py-5">
          <div className={`text-center pb-4 mb-4 border-b-2 ${isTaxInvoice ? "border-green-500" : "border-blue-500"}`}>
            <div className={`inline-block px-6 py-2 rounded-md mb-3 ${isTaxInvoice ? "bg-green-600 text-white" : "bg-blue-600 text-white"}`}>
              <p className="font-bold text-base">{invoiceTitle}</p>
            </div>
            <p className="text-xs text-muted-foreground mb-1">
              {t("رقم الفاتورة:", "Invoice No:")} <span className="font-bold text-foreground">{invoice.invoiceNumber || invoice.id}</span>
            </p>
            <img src={teakLogo} alt="Teak" className="w-10 h-10 object-contain mx-auto mb-1 logo-red" />
            <p className="font-bold text-sm">{invoice.sellerName}</p>
            {invoice.sellerAddress && <p className="text-[11px] text-muted-foreground">{invoice.sellerAddress}</p>}
          </div>

          <div className="space-y-2 mb-4 text-xs border rounded-lg p-3 bg-muted/20">
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
              <span className="font-mono font-medium text-[11px]" dir="ltr">{invoice.sellerVatNumber}</span>
            </div>
          </div>

          {Array.isArray(invoice.items) && invoice.items.length > 0 && (
            <div className="mb-4">
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="border-y bg-muted/30">
                    <th className="text-start py-2 px-2 font-semibold">{t("المنتجات", "Products")}</th>
                    <th className="text-center py-2 px-1 font-semibold">{t("الكمية", "Qty")}</th>
                    <th className="text-center py-2 px-1 font-semibold">{t("سعر الوحدة", "Unit Price")}</th>
                    <th className="text-center py-2 px-1 font-semibold">{t("ض.ق.م", "VAT")}</th>
                    <th className="text-end py-2 px-2 font-semibold">{t("السعر شامل", "Total")}</th>
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
                        <td className="py-1.5 px-2">{item.description || item.productType || `${t("منتج", "Product")} ${idx + 1}`}</td>
                        <td className="py-1.5 px-1 text-center">{item.quantity || "1"}</td>
                        <td className="py-1.5 px-1 text-center">{formatNum(unitPrice)}</td>
                        <td className="py-1.5 px-1 text-center">{formatNum(itemVat)}</td>
                        <td className="py-1.5 px-2 text-end font-medium">{formatNum(itemWithVat)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="space-y-0 mb-4">
            <div className="flex justify-between items-center py-2 px-3 border rounded-t-lg bg-muted/20">
              <span className="text-xs font-semibold">{t("إجمالي المبلغ الخاضع للضريبة", "Total Taxable Amount")}</span>
              <span className="text-xs font-bold">{formatNum(invoice.subtotal)}</span>
            </div>
            <div className="flex justify-between items-center py-2 px-3 border-x border-b bg-muted/20">
              <span className="text-xs font-semibold">{t("ضريبة القيمة المضافة", "VAT")} ({invoice.vatRate || 15}%)</span>
              <span className="text-xs font-bold">{formatNum(invoice.vatAmount)}</span>
            </div>
            <div className={`flex justify-between items-center py-2.5 px-3 border rounded-b-lg ${isTaxInvoice ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900" : "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900"}`}>
              <span className="text-sm font-bold">{t("المجموع مع الضريبة", "Total with VAT")} ({invoice.vatRate || 15}%)</span>
              <span className="text-sm font-bold">{formatNum(invoice.totalWithVat)}</span>
            </div>
          </div>

          {invoice.qrCodeData && (
            <div className="text-center pt-3 border-t">
              <p className="text-[10px] text-muted-foreground mb-3">
                {`>>>>>>>>>>>>>> ${t("إغلاق الفاتورة", "Invoice Close")} ${invoice.invoiceNumber || ""} >>>>>>>>>>>>>>`}
              </p>
              <ZatcaQRCode data={invoice.qrCodeData} size={140} />
              <p className="text-[10px] text-muted-foreground mt-2">
                {t("رمز الاستجابة السريعة (QR Code)", "Quick Response Code (QR Code)")}
              </p>
            </div>
          )}

          {isTaxInvoice && (
            <p className="text-[9px] text-muted-foreground text-center mt-3 pt-2 border-t">
              {t(
                "فاتورة ضريبية مبسطة صادرة وفقاً لمتطلبات هيئة الزكاة والضريبة والجمارك (ZATCA)",
                "Simplified tax invoice issued per ZATCA requirements"
              )}
            </p>
          )}
        </div>

        <div className="sticky bottom-0 bg-background border-t p-3 flex gap-2">
          <Button variant="outline" className="flex-1 h-10 text-xs" onClick={handlePrint} data-testid="button-print-invoice-bottom">
            <Printer className="w-3.5 h-3.5 me-1.5" />
            {t("طباعة / حفظ PDF", "Print / Save PDF")}
          </Button>
          {typeof navigator.share === "function" && (
            <Button variant="outline" className="flex-1 h-10 text-xs" onClick={handleShare} data-testid="button-share-invoice-bottom">
              <Share2 className="w-3.5 h-3.5 me-1.5" />
              {t("مشاركة", "Share")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function InvoicesTab({ invoices }: { invoices: any[] }) {
  const { t } = useLanguage();
  const [previewInvoice, setPreviewInvoice] = useState<any | null>(null);

  if (!invoices.length) return <EmptyState icon={Receipt} titleAr="لا توجد فواتير" titleEn="No invoices yet" />;

  const sorted = [...invoices].sort((a, b) => new Date(b.issuedAt || b.createdAt || 0).getTime() - new Date(a.issuedAt || a.createdAt || 0).getTime());

  return (
    <>
      <div className="space-y-3">
        {sorted.map((inv: any) => {
          const isTaxInvoice = inv.type === "simplified_tax_invoice";
          return (
            <Card key={inv.id} className={`overflow-hidden ${isTaxInvoice ? "border-green-200 dark:border-green-900" : "border-blue-200 dark:border-blue-900"}`} data-testid={`card-invoice-${inv.id}`}>
              <CardContent className="p-0">
                <div className={`px-4 py-2.5 flex items-center justify-between ${isTaxInvoice ? "bg-green-50/50 dark:bg-green-950/20" : "bg-blue-50/30 dark:bg-blue-950/10"}`}>
                  <div className="flex items-center gap-2">
                    <Receipt className={`w-4 h-4 ${isTaxInvoice ? "text-green-600" : "text-blue-600"}`} />
                    <span className="text-sm font-semibold">
                      {isTaxInvoice ? t("فاتورة ضريبية مبسطة", "Simplified Tax Invoice") : t("عرض سعر ضريبي", "Tax Price Quotation")}
                    </span>
                  </div>
                  <StatusBadge status={inv.status} />
                </div>

                <div className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">#{inv.invoiceNumber || inv.id}</span>
                    <span className="font-bold text-base">{Number(inv.totalWithVat || 0).toLocaleString()} <span className="text-xs font-normal text-muted-foreground">{t("ريال", "SAR")}</span></span>
                  </div>
                  {inv.vatAmount && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{t("الضريبة", "VAT")}</span>
                      <span className="text-xs text-muted-foreground">{Number(inv.vatAmount).toLocaleString()} {t("ريال", "SAR")}</span>
                    </div>
                  )}
                  {(inv.issuedAt || inv.createdAt) && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      {new Date(inv.issuedAt || inv.createdAt).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" })}
                    </div>
                  )}
                </div>

                <div className="px-4 pb-3">
                  <Button
                    variant="outline"
                    className="w-full h-9 text-xs"
                    onClick={() => setPreviewInvoice(inv)}
                    data-testid={`button-view-invoice-${inv.id}`}
                  >
                    <Eye className="w-3.5 h-3.5 me-1.5" />
                    {t("استعراض الفاتورة", "View Invoice")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {previewInvoice && (
        <InvoicePreviewModal invoice={previewInvoice} onClose={() => setPreviewInvoice(null)} />
      )}
    </>
  );
}

function ProductionTab({ production }: { production: any[] }) {
  const { t } = useLanguage();

  const stageLabels: Record<string, { ar: string; en: string }> = {
    cutting: { ar: "القص", en: "Cutting" },
    edging: { ar: "الحواف", en: "Edging" },
    assembly: { ar: "التجميع", en: "Assembly" },
    finishing: { ar: "التشطيب", en: "Finishing" },
    quality_check: { ar: "فحص الجودة", en: "Quality Check" },
    packaging: { ar: "التغليف", en: "Packaging" },
  };

  if (!production.length) return <EmptyState icon={Factory} titleAr="لا يوجد إنتاج حالياً" titleEn="No production orders yet" />;

  return (
    <div className="space-y-3">
      {production.map(({ workOrder, stages }: any) => (
        <Card key={workOrder.id} data-testid={`card-production-${workOrder.id}`}>
          <CardContent className="p-0">
            <div className="px-4 py-2.5 flex items-center justify-between bg-orange-50/30 dark:bg-orange-950/10">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-orange-600" />
                <span className="text-sm font-semibold">{t("أمر عمل", "Work Order")} #{workOrder.id}</span>
              </div>
              <StatusBadge status={workOrder.status} />
            </div>

            <div className="px-4 py-3">
              {stages.length > 0 ? (
                <div className="space-y-2.5">
                  {stages.map((stage: any, idx: number) => {
                    const label = stageLabels[stage.stageName] || { ar: stage.stageName, en: stage.stageName };
                    const isCompleted = stage.status === "completed";
                    const isActive = stage.status === "in_progress";

                    return (
                      <div key={stage.id} className="flex gap-2.5" data-testid={`stage-${stage.id}`}>
                        <div className="flex flex-col items-center">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${
                            isCompleted ? "bg-green-500 text-white" :
                            isActive ? "bg-primary text-primary-foreground animate-pulse" :
                            "bg-muted text-muted-foreground"
                          }`}>
                            {isCompleted ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx + 1}
                          </div>
                          {idx < stages.length - 1 && (
                            <div className={`w-0.5 h-6 ${isCompleted ? "bg-green-500" : "bg-muted"}`} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium text-xs ${isActive ? "text-primary" : ""}`}>{t(label.ar, label.en)}</p>
                          {stage.completedAt && (
                            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5" />
                              {new Date(stage.completedAt).toLocaleDateString("ar-SA")}
                            </p>
                          )}
                          {stage.progressImages && stage.progressImages.length > 0 && (
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {stage.progressImages.map((img: string, i: number) => (
                                <img key={i} src={img} alt="" className="w-12 h-12 rounded object-cover border" />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">
                  {t("لم تبدأ مراحل الإنتاج بعد", "Production stages not started yet")}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PaymentsTab({ payments, contracts, phone }: { payments: any[]; contracts: any[]; phone: string }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [showUpload, setShowUpload] = useState(false);
  const [receiptData, setReceiptData] = useState({ amount: "", notes: "" });
  const [uploading, setUploading] = useState(false);

  const handleUploadReceipt = async () => {
    if (!receiptData.amount) {
      toast({ title: t("خطأ", "Error"), description: t("أدخل المبلغ", "Enter amount"), variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const res = await fetch("/api/customer-portal/upload-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          contractId: contracts.length > 0 ? contracts[0].id : null,
          amount: receiptData.amount,
          paymentMethod: "bank_transfer",
          notes: receiptData.notes || t("تحويل بنكي", "Bank Transfer"),
        }),
      });
      if (res.ok) {
        toast({ title: t("تم", "Done"), description: t("تم رفع وصل الدفع بنجاح", "Payment receipt uploaded successfully") });
        setShowUpload(false);
        setReceiptData({ amount: "", notes: "" });
        queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/my-data"] });
      } else {
        throw new Error("Upload failed");
      }
    } catch {
      toast({ title: t("خطأ", "Error"), description: t("حدث خطأ", "An error occurred"), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button
        variant="outline"
        size="sm"
        className="w-full h-9 text-xs border-dashed"
        onClick={() => setShowUpload(!showUpload)}
        data-testid="button-toggle-upload"
      >
        <Upload className="w-3.5 h-3.5 me-1.5" />
        {t("رفع وصل دفع جديد", "Upload New Payment Receipt")}
      </Button>

      {showUpload && (
        <Card>
          <CardContent className="p-3 space-y-2.5">
            <Input
              type="number"
              placeholder={t("المبلغ (ريال)", "Amount (SAR)")}
              value={receiptData.amount}
              onChange={(e) => setReceiptData({ ...receiptData, amount: e.target.value })}
              className="h-10"
              data-testid="input-receipt-amount"
            />
            <Textarea
              placeholder={t("ملاحظات (اختياري)", "Notes (optional)")}
              value={receiptData.notes}
              onChange={(e) => setReceiptData({ ...receiptData, notes: e.target.value })}
              rows={2}
              data-testid="input-receipt-notes"
            />
            <div className="flex gap-2">
              <Button onClick={handleUploadReceipt} disabled={uploading} className="flex-1 h-9 text-xs" data-testid="button-submit-receipt">
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin me-1.5" /> : null}
                {t("إرسال", "Submit")}
              </Button>
              <Button variant="ghost" className="h-9 text-xs" onClick={() => setShowUpload(false)}>
                {t("إلغاء", "Cancel")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {payments.length > 0 ? (
        [...payments].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).map((p: any) => (
          <Card key={p.id} data-testid={`card-payment-${p.id}`}>
            <CardContent className="px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-sm">{Number(p.amount).toLocaleString()} <span className="text-xs font-normal text-muted-foreground">{t("ريال", "SAR")}</span></span>
                  {p.createdAt && (
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Calendar className="w-2.5 h-2.5" />
                      {new Date(p.createdAt).toLocaleDateString("ar-SA")}
                    </p>
                  )}
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {p.method === "bank_transfer" ? t("تحويل بنكي", "Bank Transfer") : p.method === "cash" ? t("نقد", "Cash") : p.method}
                </span>
              </div>
              {p.notes && <p className="text-xs text-muted-foreground mt-1.5 border-t pt-1.5">{p.notes}</p>}
            </CardContent>
          </Card>
        ))
      ) : !showUpload ? (
        <EmptyState icon={CreditCard} titleAr="لا توجد مدفوعات بعد" titleEn="No payments yet" />
      ) : null}
    </div>
  );
}

function WarrantyTab({ warranties }: { warranties: any[] }) {
  const { t } = useLanguage();
  if (!warranties.length) return <EmptyState icon={Shield} titleAr="لا توجد شهادات ضمان" titleEn="No warranty certificates" />;

  return (
    <div className="space-y-3">
      {warranties.map((w: any) => (
        <Card key={w.id} data-testid={`card-warranty-${w.id}`}>
          <CardContent className="p-0">
            <div className="px-4 py-2.5 flex items-center justify-between bg-purple-50/30 dark:bg-purple-950/10">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-semibold">{t("شهادة ضمان", "Warranty Certificate")} #{w.id}</span>
              </div>
              <StatusBadge status={w.status} />
            </div>
            <div className="px-4 py-3 space-y-1.5 text-xs text-muted-foreground">
              <p className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {t("من", "From")}: <span className="text-foreground font-medium">{w.startDate}</span></p>
              <p className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {t("إلى", "To")}: <span className="text-foreground font-medium">{w.endDate}</span></p>
              {w.terms && <p className="pt-1 border-t mt-1.5">{w.terms}</p>}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function MaintenanceTab({ maintenance, phone }: { maintenance: any[]; phone: string }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!description.trim()) {
      toast({ title: t("خطأ", "Error"), description: t("اكتب وصف المشكلة", "Describe the issue"), variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/customer-portal/maintenance-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ description }),
      });
      if (res.ok) {
        toast({ title: t("تم", "Done"), description: t("تم تقديم طلب الصيانة", "Maintenance request submitted") });
        setShowForm(false);
        setDescription("");
        queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/my-data"] });
      }
    } catch {
      toast({ title: t("خطأ", "Error"), description: t("حدث خطأ", "Error occurred"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button
        variant="outline"
        size="sm"
        className="w-full h-9 text-xs border-dashed"
        onClick={() => setShowForm(!showForm)}
        data-testid="button-new-maintenance"
      >
        <Wrench className="w-3.5 h-3.5 me-1.5" />
        {t("تقديم طلب صيانة جديد", "Submit New Maintenance Request")}
      </Button>

      {showForm && (
        <Card>
          <CardContent className="p-3 space-y-2.5">
            <Textarea
              placeholder={t("وصف المشكلة...", "Describe the issue...")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              data-testid="input-maintenance-description"
            />
            <div className="flex gap-2">
              <Button onClick={handleSubmit} disabled={submitting} className="flex-1 h-9 text-xs" data-testid="button-submit-maintenance">
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin me-1.5" /> : null}
                {t("إرسال", "Submit")}
              </Button>
              <Button variant="ghost" className="h-9 text-xs" onClick={() => setShowForm(false)}>
                {t("إلغاء", "Cancel")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {maintenance.length > 0 ? (
        [...maintenance].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).map((m: any) => (
          <Card key={m.id} data-testid={`card-maintenance-${m.id}`}>
            <CardContent className="px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">#{m.id}</span>
                <StatusBadge status={m.status} />
              </div>
              <p className="text-sm">{m.description}</p>
              {m.createdAt && (
                <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1.5">
                  <Calendar className="w-2.5 h-2.5" />
                  {new Date(m.createdAt).toLocaleDateString("ar-SA")}
                </p>
              )}
            </CardContent>
          </Card>
        ))
      ) : !showForm ? (
        <EmptyState icon={Wrench} titleAr="لا توجد طلبات صيانة" titleEn="No maintenance requests" />
      ) : null}
    </div>
  );
}

export default function CustomerPortal() {
  const { t, lang } = useLanguage();
  const [phone, setPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("quotes");
  const { toast } = useToast();

  useEffect(() => {
    const savedPhone = localStorage.getItem("portalPhone");
    const savedName = localStorage.getItem("portalCustomerName");
    if (!savedPhone) {
      window.location.href = "/portal/login";
      return;
    }
    setPhone(savedPhone);
    setCustomerName(savedName || "");
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/customer-portal/my-data", phone],
    queryFn: async () => {
      if (!phone) return null;
      const res = await fetch("/api/customer-portal/my-data", { credentials: "include" });
      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem("portalPhone");
          localStorage.removeItem("portalCustomerName");
          window.location.href = "/portal/login";
          return null;
        }
        throw new Error("Failed to fetch");
      }
      return res.json();
    },
    enabled: !!phone,
    refetchInterval: 30000,
  });

  const approveMutation = useMutation({
    mutationFn: async (quotationId: number) => {
      const res = await fetch(`/api/customer-portal/approve-quotation/${quotationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("تم", "Done"), description: t("تم اعتماد عرض السعر وتحويله لفاتورة ضريبية", "Quotation approved and converted to tax invoice") });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/my-data"] });
    },
    onError: () => {
      toast({ title: t("خطأ", "Error"), description: t("حدث خطأ في الاعتماد", "Error approving"), variant: "destructive" });
    },
  });

  if (!phone) return null;

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center" dir={lang === "ar" ? "rtl" : "ltr"}>
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">{t("جاري تحميل البيانات...", "Loading data...")}</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-4" dir={lang === "ar" ? "rtl" : "ltr"}>
        <div className="text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
          <p className="text-sm text-muted-foreground">{t("حدث خطأ في تحميل البيانات", "Error loading data")}</p>
          <Button onClick={() => window.location.reload()} size="sm" data-testid="button-retry">{t("إعادة المحاولة", "Retry")}</Button>
        </div>
      </div>
    );
  }

  const counts: Record<TabKey, number> = {
    quotes: data.quotations?.length || 0,
    invoices: data.invoices?.length || 0,
    production: data.production?.length || 0,
    payments: data.payments?.length || 0,
    warranty: data.warranties?.length || 0,
    maintenance: data.maintenance?.length || 0,
  };

  return (
    <div className="min-h-[100dvh] bg-background" dir={lang === "ar" ? "rtl" : "ltr"}>
      <PortalHeader customerName={customerName || data.customer?.fullName || ""} />

      <TabBar active={activeTab} onChange={setActiveTab} counts={counts} />

      <main className="max-w-2xl mx-auto px-4 py-4 pb-20">
        {activeTab === "quotes" && (
          <QuotationsTab
            quotations={data.quotations || []}
            designs={data.designs || []}
            onApprove={(id) => approveMutation.mutate(id)}
            approving={approveMutation.isPending}
          />
        )}
        {activeTab === "invoices" && <InvoicesTab invoices={data.invoices || []} />}
        {activeTab === "production" && <ProductionTab production={data.production || []} />}
        {activeTab === "payments" && <PaymentsTab payments={data.payments || []} contracts={data.contracts || []} phone={phone} />}
        {activeTab === "warranty" && <WarrantyTab warranties={data.warranties || []} />}
        {activeTab === "maintenance" && <MaintenanceTab maintenance={data.maintenance || []} phone={phone} />}
      </main>
    </div>
  );
}
