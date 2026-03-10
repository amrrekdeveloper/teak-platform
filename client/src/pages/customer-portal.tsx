import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  FileText, Receipt, Shield, Wrench, LogOut, CheckCircle2,
  Clock, Eye, Loader2,
  Calendar, Sun, Moon, Share2, Printer,
  AlertCircle, X, ClipboardList, ChevronDown, ChevronUp,
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

type TabKey = "orders" | "quotes" | "invoices" | "warranty" | "maintenance";

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
    in_production: { ar: "في الإنتاج", en: "In Production", cls: "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300" },
    quality_check: { ar: "فحص الجودة", en: "Quality Check", cls: "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300" },
    ready: { ar: "جاهز", en: "Ready", cls: "bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300" },
    shipped: { ar: "تم الشحن", en: "Shipped", cls: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" },
    delivered: { ar: "تم التسليم", en: "Delivered", cls: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300" },
    installed: { ar: "تم التركيب", en: "Installed", cls: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300" },
    designing: { ar: "قيد التصميم", en: "Designing", cls: "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300" },
    cancelled: { ar: "ملغي", en: "Cancelled", cls: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" },
    expired: { ar: "منتهي", en: "Expired", cls: "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400" },
    void: { ar: "ملغي", en: "Void", cls: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" },
    claimed: { ar: "مطالب به", en: "Claimed", cls: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
    scheduled: { ar: "مجدول", en: "Scheduled", cls: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
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
    { key: "orders", icon: ClipboardList, ar: "الطلبات", en: "Orders" },
    { key: "quotes", icon: FileText, ar: "عروض الأسعار", en: "Quotes" },
    { key: "invoices", icon: Receipt, ar: "الفواتير", en: "Invoices" },
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

const orderStages = [
  { key: "reviewing", ar: "قيد المراجعة", en: "Under Review" },
  { key: "designing", ar: "عند المصمم", en: "With Designer" },
  { key: "quotation_sent", ar: "تم إرسال عرض السعر", en: "Quotation Sent" },
  { key: "awaiting_approval", ar: "بانتظار تأكيد عرض السعر", en: "Awaiting Approval" },
  { key: "approved", ar: "تم اعتماد عرض السعر", en: "Quotation Approved" },
  { key: "in_production", ar: "في الإنتاج", en: "In Production" },
  { key: "quality_check", ar: "فحص الجودة", en: "Quality Check" },
  { key: "ready", ar: "جاهز للتسليم", en: "Ready for Delivery" },
  { key: "delivered", ar: "تم التسليم", en: "Delivered" },
  { key: "installed", ar: "تم التركيب", en: "Installed" },
  { key: "completed", ar: "مكتمل", en: "Completed" },
];

function getOrderStageIndex(quotation: any, contracts: any[], production: any[]): number {
  if (quotation.status === "draft") return 0;
  if (quotation.status === "sent") return 3;
  if (quotation.status === "rejected" || quotation.status === "expired") return -1;
  if (quotation.status === "approved") {
    const contract = contracts.find((c: any) => c.quotationId === quotation.id);
    if (!contract) return 4;
    const workOrderData = production.find((p: any) => p.workOrder?.contractId === contract.id);
    if (!workOrderData) return 4;
    const wo = workOrderData.workOrder;
    if (wo.status === "pending") return 5;
    if (wo.status === "in_production") return 5;
    if (wo.status === "quality_check") return 6;
    if (wo.status === "ready") return 7;
    if (wo.status === "shipped" || wo.status === "delivered") return 8;
    if (wo.status === "installed") return 9;
    if (wo.status === "completed") return 10;
    return 5;
  }
  return 0;
}

function OrdersTab({ quotations, contracts, production, designs }: {
  quotations: any[]; contracts: any[]; production: any[]; designs: any[];
}) {
  const { t } = useLanguage();
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);

  if (!quotations.length) return <EmptyState icon={ClipboardList} titleAr="لا توجد طلبات" titleEn="No orders yet" />;

  const sorted = [...quotations].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  return (
    <div className="space-y-3">
      {sorted.map((q: any) => {
        const stageIdx = getOrderStageIndex(q, contracts, production);
        const isRejected = q.status === "rejected";
        const isExpired = q.status === "expired";
        const isExpanded = expandedOrder === q.id;
        const design = designs.find((d: any) => d.customerId === q.customerId && d.status === "completed");
        const currentStage = stageIdx >= 0 ? orderStages[stageIdx] : null;

        return (
          <Card key={q.id} className={`overflow-hidden ${isRejected ? "border-red-200 dark:border-red-900" : isExpired ? "border-gray-200" : ""}`} data-testid={`card-order-${q.id}`}>
            <CardContent className="p-0">
              <div className="px-4 py-3 flex items-center justify-between">
                <div>
                  <span className="text-sm font-semibold">{t("طلب", "Order")} #{q.id}</span>
                  {q.productDescription && (
                    <p className="text-xs text-muted-foreground mt-0.5">{q.productDescription}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isRejected ? (
                    <StatusBadge status="rejected" />
                  ) : isExpired ? (
                    <StatusBadge status="expired" />
                  ) : currentStage ? (
                    <span className="text-[11px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      {t(currentStage.ar, currentStage.en)}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="px-4 pb-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{t("المبلغ", "Amount")}</span>
                  <span className="font-bold">{Number(q.totalWithVat || q.total || 0).toLocaleString()} {t("ريال", "SAR")}</span>
                </div>
                {q.createdAt && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    {new Date(q.createdAt).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" })}
                  </div>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-8 text-xs"
                  onClick={() => setExpandedOrder(isExpanded ? null : q.id)}
                  data-testid={`button-order-details-${q.id}`}
                >
                  {isExpanded ? <ChevronUp className="w-3 h-3 me-1" /> : <ChevronDown className="w-3 h-3 me-1" />}
                  {t("تفاصيل الطلب", "Order Details")}
                </Button>
              </div>

              {isExpanded && !isRejected && !isExpired && stageIdx >= 0 && (
                <div className="px-4 pb-4 border-t pt-3">
                  <p className="text-xs font-semibold mb-3 text-muted-foreground">{t("مراحل الطلب", "Order Stages")}</p>
                  <div className="space-y-0">
                    {orderStages.map((stage, idx) => {
                      const isCompleted = idx < stageIdx;
                      const isCurrent = idx === stageIdx;
                      const isPending = idx > stageIdx;
                      return (
                        <div key={stage.key} className="flex gap-2.5" data-testid={`order-stage-${stage.key}`}>
                          <div className="flex flex-col items-center">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                              isCompleted ? "bg-green-500 text-white" :
                              isCurrent ? "bg-primary text-primary-foreground ring-2 ring-primary/30" :
                              "bg-muted text-muted-foreground"
                            }`}>
                              {isCompleted ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx + 1}
                            </div>
                            {idx < orderStages.length - 1 && (
                              <div className={`w-0.5 h-5 ${isCompleted ? "bg-green-500" : "bg-muted"}`} />
                            )}
                          </div>
                          <div className="flex-1 min-w-0 pb-1">
                            <p className={`text-xs ${isCurrent ? "font-bold text-primary" : isCompleted ? "text-green-700 dark:text-green-400" : "text-muted-foreground"}`}>
                              {t(stage.ar, stage.en)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {design?.sketchImage && (
                    <div className="mt-3 border rounded-lg p-2 bg-muted/30">
                      <p className="text-[11px] text-muted-foreground mb-1.5">{t("المخطط", "Design")}</p>
                      <img src={design.sketchImage} alt="Design" className="w-full rounded" data-testid={`img-design-${q.id}`} />
                      {design.notes && <p className="text-xs text-muted-foreground mt-1.5">{design.notes}</p>}
                    </div>
                  )}
                </div>
              )}

              {isExpanded && (isRejected || isExpired) && (
                <div className="px-4 pb-3 border-t pt-3">
                  <p className="text-xs text-muted-foreground text-center">
                    {isRejected
                      ? t("تم رفض عرض السعر لهذا الطلب", "The quotation for this order was rejected")
                      : t("انتهت صلاحية عرض السعر لهذا الطلب", "The quotation for this order has expired")}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function QuotationsTab({ quotations, designs, onApprove, approving }: {
  quotations: any[]; designs: any[]; onApprove: (id: number) => void; approving: boolean;
}) {
  const { t } = useLanguage();
  const [viewDesign, setViewDesign] = useState<number | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<any | null>(null);

  if (!quotations.length) return <EmptyState icon={FileText} titleAr="لا توجد عروض أسعار" titleEn="No quotations yet" />;

  const sorted = [...quotations].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  return (
    <>
      <div className="space-y-3">
        {sorted.map((q: any) => {
          const design = designs.find((d: any) => d.customerId === q.customerId && d.status === "completed");
          const isApproved = q.status === "approved";

          return (
            <Card key={q.id} className={`overflow-hidden ${isApproved ? "border-green-200 dark:border-green-900" : ""}`} data-testid={`card-quotation-${q.id}`}>
              <CardContent className="p-0">
                <div className={`px-4 py-3 flex items-center justify-between ${isApproved ? "bg-green-50/50 dark:bg-green-950/20" : ""}`}>
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

                <div className="px-4 pb-3 space-y-2">
                  <Button
                    variant="outline"
                    className="w-full h-9 text-xs"
                    onClick={() => {
                      setPreviewInvoice({
                        ...q,
                        invoiceNumber: q.id,
                        type: "quotation",
                        sellerName: q.sellerName || "مصنع تيك للمنتجات الخشبية",
                        sellerAddress: q.sellerAddress || "الرياض - المملكة العربية السعودية",
                        sellerVatNumber: q.sellerVatNumber || "310012345600003",
                      });
                    }}
                    data-testid={`button-view-quotation-invoice-${q.id}`}
                  >
                    <Eye className="w-3.5 h-3.5 me-1.5" />
                    {t("استعراض عرض السعر", "View Quotation")}
                  </Button>

                  {design?.sketchImage && (
                    <button
                      onClick={() => setViewDesign(viewDesign === q.id ? null : q.id)}
                      className="text-xs text-primary flex items-center gap-1 hover:underline w-full justify-center"
                      data-testid={`button-toggle-design-${q.id}`}
                    >
                      <Eye className="w-3 h-3" />
                      {t("عرض المخططات", "View Designs")}
                    </button>
                  )}

                  {viewDesign === q.id && design?.sketchImage && (
                    <div className="border rounded-lg p-2 bg-muted/30">
                      <img src={design.sketchImage} alt="Design" className="w-full rounded" data-testid={`img-design-${q.id}`} />
                      {design.notes && <p className="text-xs text-muted-foreground mt-1.5">{design.notes}</p>}
                    </div>
                  )}

                  {(q.status === "sent" || q.status === "draft") && (
                    <Button
                      onClick={() => onApprove(q.id)}
                      disabled={approving}
                      className="w-full h-10"
                      data-testid={`button-approve-quotation-${q.id}`}
                    >
                      {approving ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <CheckCircle2 className="w-4 h-4 me-2" />}
                      {t("اعتماد عرض السعر", "Approve Quotation")}
                    </Button>
                  )}
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

function InvoicePreviewModal({ invoice, onClose }: { invoice: any; onClose: () => void }) {
  const { t } = useLanguage();
  const isTaxInvoice = invoice.type === "simplified_tax_invoice";
  const printRef = useRef<HTMLDivElement>(null);

  const fmtNum = (v: any) => parseFloat(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const cloned = content.cloneNode(true) as HTMLElement;
    const canvases = content.querySelectorAll("canvas");
    const clonedCanvases = cloned.querySelectorAll("canvas");
    canvases.forEach((canvas, i) => {
      try {
        const img = document.createElement("img");
        img.src = canvas.toDataURL("image/png");
        img.style.display = "block";
        img.style.margin = "0 auto";
        img.style.width = canvas.width + "px";
        img.style.height = canvas.height + "px";
        clonedCanvases[i]?.parentNode?.replaceChild(img, clonedCanvases[i]);
      } catch {}
    });
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html dir="rtl">
        <head>
          <title>${invoice.invoiceNumber || invoice.id}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: system-ui, -apple-system, sans-serif; padding: 8px; color: #000; font-size: 11px; max-width: 80mm; margin: 0 auto; direction: rtl; }
            table { border-collapse: collapse; width: 100%; }
            td, th { border: 1px solid #000; padding: 3px 4px; font-size: 10px; }
            img { display: block; margin: 0 auto; }
            @media print { @page { size: 80mm auto; margin: 4mm; } body { max-width: 100%; } }
          </style>
        </head>
        <body>${cloned.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${isTaxInvoice ? "فاتورة ضريبية مبسطة" : "عرض سعر ضريبي"} #${invoice.invoiceNumber || invoice.id}`,
          text: `المبلغ: ${fmtNum(invoice.totalWithVat)} ريال`,
        });
      } catch {}
    }
  };

  const headerTitle = isTaxInvoice
    ? t("فاتورة ضريبية مبسطة", "Simplified Tax Invoice")
    : t("عرض سعر ضريبي", "Tax Price Quotation");

  const headerColor = isTaxInvoice ? "#16a34a" : "#2563eb";

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-[340px] sm:rounded-xl rounded-t-xl max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b px-3 py-2 flex items-center justify-between z-10">
          <h3 className="font-semibold text-xs text-black">{headerTitle}</h3>
          <div className="flex items-center gap-1">
            {typeof navigator.share === "function" && (
              <button className="p-1.5 rounded hover:bg-gray-100" onClick={handleShare} data-testid="button-share-invoice">
                <Share2 className="w-3.5 h-3.5 text-gray-600" />
              </button>
            )}
            <button className="p-1.5 rounded hover:bg-gray-100" onClick={handlePrint} data-testid="button-print-invoice">
              <Printer className="w-3.5 h-3.5 text-gray-600" />
            </button>
            <button className="p-1.5 rounded hover:bg-gray-100" onClick={onClose} data-testid="button-close-invoice">
              <X className="w-3.5 h-3.5 text-gray-600" />
            </button>
          </div>
        </div>

        <div ref={printRef} dir="rtl" className="p-3 text-black" style={{ fontSize: "11px", fontFamily: "system-ui, -apple-system, sans-serif" }}>
          <div style={{ backgroundColor: headerColor, color: "#fff", textAlign: "center", padding: "8px 4px", fontWeight: "bold", fontSize: "14px", marginBottom: "8px" }}>
            {isTaxInvoice ? "فاتورة ضريبية مبسطة" : "عرض سعر ضريبي"}
          </div>

          <div style={{ textAlign: "center", marginBottom: "6px", fontSize: "11px" }}>
            رقم الفاتورة: {invoice.invoiceNumber || invoice.id}
          </div>

          <div style={{ textAlign: "center", marginBottom: "2px" }}>
            <img src={teakLogo} alt="Teak" style={{ width: "36px", height: "36px", objectFit: "contain", margin: "0 auto 4px", display: "block" }} />
          </div>

          <div style={{ textAlign: "center", fontWeight: "bold", fontSize: "12px", marginBottom: "2px" }}>
            {invoice.sellerName || "مصنع تيك للمنتجات الخشبية"}
          </div>
          {invoice.sellerAddress && (
            <div style={{ textAlign: "center", fontSize: "10px", color: "#666", marginBottom: "8px" }}>
              {invoice.sellerAddress}
            </div>
          )}

          <div style={{ border: "1px solid #000", padding: "6px 8px", marginBottom: "8px", fontSize: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
              <span>تاريخ:</span>
              <span>{invoice.issuedAt ? new Date(invoice.issuedAt).toLocaleDateString("ar-SA", { year: "numeric", month: "2-digit", day: "2-digit" }) : "-"}</span>
            </div>
            <div>
              <span>رقم تسجيل ضريبة القيمة المضافة: </span>
              <span style={{ direction: "ltr", unicodeBidi: "embed" }}>{invoice.sellerVatNumber || "310012345600003"}</span>
            </div>
          </div>

          {Array.isArray(invoice.items) && invoice.items.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "8px", fontSize: "10px" }}>
              <thead>
                <tr>
                  <th style={{ border: "1px solid #000", padding: "4px 3px", textAlign: "right", fontWeight: "bold" }}>المنتجات</th>
                  <th style={{ border: "1px solid #000", padding: "4px 3px", textAlign: "center", fontWeight: "bold" }}>الكمية</th>
                  <th style={{ border: "1px solid #000", padding: "4px 3px", textAlign: "center", fontWeight: "bold" }}>سعر الوحدة</th>
                  <th style={{ border: "1px solid #000", padding: "4px 3px", textAlign: "center", fontWeight: "bold" }}>ضريبة القيمة المضافة</th>
                  <th style={{ border: "1px solid #000", padding: "4px 3px", textAlign: "center", fontWeight: "bold" }}>السعر شامل ضريبة القيمة المضافة</th>
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
                      <td style={{ border: "1px solid #000", padding: "3px", textAlign: "right" }}>{item.description || item.productType || `منتج ${idx + 1}`}</td>
                      <td style={{ border: "1px solid #000", padding: "3px", textAlign: "center" }}>{item.quantity || "1"}</td>
                      <td style={{ border: "1px solid #000", padding: "3px", textAlign: "center" }}>{fmtNum(unitPrice)}</td>
                      <td style={{ border: "1px solid #000", padding: "3px", textAlign: "center" }}>{fmtNum(itemVat)}</td>
                      <td style={{ border: "1px solid #000", padding: "3px", textAlign: "center" }}>{fmtNum(itemWithVat)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <div style={{ marginBottom: "8px" }}>
            <div style={{ border: "1px solid #000", padding: "6px 8px", display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
              <span>إجمالي المبلغ الخاضع للضريبة</span>
              <span style={{ fontWeight: "bold" }}>{fmtNum(invoice.subtotal)}</span>
            </div>
            <div style={{ border: "1px solid #000", borderTop: "none", padding: "6px 8px", display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
              <span>ضريبة القيمة المضافة ({invoice.vatRate || "15"}%)</span>
              <span style={{ fontWeight: "bold" }}>{fmtNum(invoice.vatAmount)}</span>
            </div>
            <div style={{ border: "1px solid #000", borderTop: "none", padding: "6px 8px", display: "flex", justifyContent: "space-between", fontSize: "11px", backgroundColor: isTaxInvoice ? "#dcfce7" : "#dbeafe", fontWeight: "bold" }}>
              <span>المجموع مع الضريبة ({invoice.vatRate || "15"}%)</span>
              <span>{fmtNum(invoice.totalWithVat)}</span>
            </div>
          </div>

          {invoice.qrCodeData && (
            <div style={{ textAlign: "center" }}>
              <div style={{ color: headerColor, fontSize: "9px", marginBottom: "6px" }}>
                {">>>>>>>>>>>>>>>>"} إغلاق الفاتورة {invoice.invoiceNumber || invoice.id} {"<<<<<<<<<<<<<<<<"}
              </div>
              <ZatcaQRCode data={invoice.qrCodeData} size={130} />
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t p-2.5 flex gap-2">
          <Button variant="outline" className="flex-1 h-9 text-xs" onClick={handlePrint} data-testid="button-print-invoice-bottom">
            <Printer className="w-3.5 h-3.5 me-1.5" />
            {t("طباعة / حفظ PDF", "Print / Save PDF")}
          </Button>
          {typeof navigator.share === "function" && (
            <Button variant="outline" className="flex-1 h-9 text-xs" onClick={handleShare} data-testid="button-share-invoice-bottom">
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
            <Card key={inv.id} className={`overflow-hidden ${isTaxInvoice ? "border-green-200 dark:border-green-900" : ""}`} data-testid={`card-invoice-${inv.id}`}>
              <CardContent className="p-0">
                <div className={`px-4 py-2.5 flex items-center justify-between ${isTaxInvoice ? "bg-green-50/50 dark:bg-green-950/20" : ""}`}>
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

function WarrantyTab({ warranties }: { warranties: any[] }) {
  const { t } = useLanguage();
  if (!warranties.length) return <EmptyState icon={Shield} titleAr="لا توجد شهادات ضمان" titleEn="No warranty certificates" />;

  const now = new Date();

  return (
    <div className="space-y-3">
      {warranties.map((w: any) => {
        const endDate = w.endDate ? new Date(w.endDate) : null;
        const isExpired = endDate && endDate < now;
        const isActive = w.status === "active" && !isExpired;
        const daysLeft = endDate ? Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;

        return (
          <Card key={w.id} className={`overflow-hidden ${isActive ? "border-green-200 dark:border-green-900" : isExpired ? "border-red-200 dark:border-red-900" : ""}`} data-testid={`card-warranty-${w.id}`}>
            <CardContent className="p-0">
              <div className={`px-4 py-2.5 flex items-center justify-between ${isActive ? "bg-green-50/30 dark:bg-green-950/10" : isExpired ? "bg-red-50/30 dark:bg-red-950/10" : ""}`}>
                <div className="flex items-center gap-2">
                  <Shield className={`w-4 h-4 ${isActive ? "text-green-600" : isExpired ? "text-red-500" : "text-gray-500"}`} />
                  <span className="text-sm font-semibold">{t("شهادة ضمان", "Warranty Certificate")} #{w.id}</span>
                </div>
                <StatusBadge status={isExpired ? "expired" : w.status} />
              </div>
              <div className="px-4 py-3 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> {t("بداية الضمان", "Warranty Start")}</span>
                  <span className="font-medium">{w.startDate ? new Date(w.startDate).toLocaleDateString("ar-SA") : "-"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> {t("نهاية الضمان", "Warranty End")}</span>
                  <span className="font-medium">{w.endDate ? new Date(w.endDate).toLocaleDateString("ar-SA") : "-"}</span>
                </div>
                {isActive && daysLeft !== null && daysLeft > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> {t("المتبقي", "Remaining")}</span>
                    <span className="font-medium text-green-600 dark:text-green-400">{daysLeft} {t("يوم", "days")}</span>
                  </div>
                )}
                {w.terms && <p className="pt-2 border-t text-muted-foreground">{w.terms}</p>}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function MaintenanceTab({ maintenance, contracts, production, phone }: {
  maintenance: any[]; contracts: any[]; production: any[]; phone: string;
}) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [description, setDescription] = useState("");
  const [selectedContract, setSelectedContract] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const deliveredContracts = contracts.filter((c: any) => {
    const wo = production.find((p: any) => p.workOrder?.contractId === c.id);
    return wo && ["delivered", "installed", "completed"].includes(wo.workOrder?.status);
  });

  const hasProducts = deliveredContracts.length > 0;

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
        body: JSON.stringify({
          description,
          contractId: selectedContract || (deliveredContracts.length > 0 ? deliveredContracts[0].id : null),
        }),
      });
      if (res.ok) {
        toast({ title: t("تم", "Done"), description: t("تم تقديم طلب الصيانة", "Maintenance request submitted") });
        setShowForm(false);
        setDescription("");
        setSelectedContract(null);
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
      {hasProducts ? (
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
      ) : (
        <Card>
          <CardContent className="px-4 py-4 text-center">
            <Wrench className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">
              {t(
                "يمكنك تقديم طلب صيانة بعد استلام المنتج وتركيبه",
                "You can submit a maintenance request after product delivery and installation"
              )}
            </p>
          </CardContent>
        </Card>
      )}

      {showForm && hasProducts && (
        <Card>
          <CardContent className="p-3 space-y-2.5">
            {deliveredContracts.length > 1 && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t("اختر المنتج", "Select Product")}</label>
                <select
                  className="w-full h-9 text-xs border rounded-md px-2 bg-background"
                  value={selectedContract || ""}
                  onChange={(e) => setSelectedContract(Number(e.target.value) || null)}
                  data-testid="select-maintenance-contract"
                >
                  {deliveredContracts.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {t("عقد", "Contract")} #{c.contractNumber || c.id}
                    </option>
                  ))}
                </select>
              </div>
            )}
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
                <span className="text-xs text-muted-foreground">#{m.requestNumber || m.id}</span>
                <StatusBadge status={m.status} />
              </div>
              <p className="text-sm">{m.description}</p>
              {m.resolution && (
                <p className="text-xs text-green-600 dark:text-green-400 mt-1.5 border-t pt-1.5">
                  {t("الحل:", "Resolution:")} {m.resolution}
                </p>
              )}
              {m.scheduledDate && (
                <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
                  <Clock className="w-2.5 h-2.5" />
                  {t("موعد:", "Scheduled:")} {new Date(m.scheduledDate).toLocaleDateString("ar-SA")}
                </p>
              )}
              {m.createdAt && (
                <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Calendar className="w-2.5 h-2.5" />
                  {new Date(m.createdAt).toLocaleDateString("ar-SA")}
                </p>
              )}
            </CardContent>
          </Card>
        ))
      ) : !showForm && !hasProducts ? null : !showForm ? (
        <EmptyState icon={Wrench} titleAr="لا توجد طلبات صيانة" titleEn="No maintenance requests" />
      ) : null}
    </div>
  );
}

export default function CustomerPortal() {
  const { t, lang } = useLanguage();
  const [phone, setPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("orders");
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
    orders: data.quotations?.length || 0,
    quotes: data.quotations?.length || 0,
    invoices: data.invoices?.length || 0,
    warranty: data.warranties?.length || 0,
    maintenance: data.maintenance?.length || 0,
  };

  return (
    <div className="min-h-[100dvh] bg-background" dir={lang === "ar" ? "rtl" : "ltr"}>
      <PortalHeader customerName={customerName || data.customer?.fullName || ""} />

      <TabBar active={activeTab} onChange={setActiveTab} counts={counts} />

      <main className="max-w-2xl mx-auto px-4 py-4 pb-20">
        {activeTab === "orders" && (
          <OrdersTab
            quotations={data.quotations || []}
            contracts={data.contracts || []}
            production={data.production || []}
            designs={data.designs || []}
          />
        )}
        {activeTab === "quotes" && (
          <QuotationsTab
            quotations={data.quotations || []}
            designs={data.designs || []}
            onApprove={(id) => approveMutation.mutate(id)}
            approving={approveMutation.isPending}
          />
        )}
        {activeTab === "invoices" && <InvoicesTab invoices={data.invoices || []} />}
        {activeTab === "warranty" && <WarrantyTab warranties={data.warranties || []} />}
        {activeTab === "maintenance" && (
          <MaintenanceTab
            maintenance={data.maintenance || []}
            contracts={data.contracts || []}
            production={data.production || []}
            phone={phone}
          />
        )}
      </main>
    </div>
  );
}
