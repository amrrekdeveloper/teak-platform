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
  User, MapPin, Phone, Package, CalendarPlus,
  Palette, ThumbsUp, MessageSquare, Maximize, Image,
  Upload, CreditCard, Banknote, RotateCcw, Download, FileDown, Paperclip,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import teakLogo from "@assets/TEAK-LOGO_(1)_(1)_1772710617816.png";
import { DeliveryCountdown } from "@/components/delivery-countdown";
import { ExportEngineeringPdfButton } from "@/components/engineering-pdf";
import { PaymentReceiptModal } from "@/components/payment-receipt";

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

function PortalHeader({ customerName, customer, orderCount }: { customerName: string; customer?: any; orderCount?: number }) {
  const { t, lang, toggleLang } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [profileOpen, setProfileOpen] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem("portalPhone");
    localStorage.removeItem("portalCustomerName");
    window.location.href = "/portal/login";
  };

  const initials = customerName
    ? customerName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  return (
    <>
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b">
        <div className="max-w-2xl md:max-w-4xl lg:max-w-5xl mx-auto px-4 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <img src={teakLogo} alt="Teak" className="w-8 h-8 object-contain logo-auto" data-testid="img-portal-header-logo" />
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate" data-testid="text-header-name">{customerName}</p>
              <p className="text-[11px] text-muted-foreground">{t("بوابة العملاء", "Customer Portal")}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="text-xs" onClick={toggleLang} data-testid="button-lang-toggle">
              {lang === "ar" ? "EN" : "عربي"}
            </Button>
            <Button variant="ghost" size="icon" onClick={toggleTheme} data-testid="button-theme-toggle">
              {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </Button>
            <button
              onClick={() => setProfileOpen(true)}
              className="rounded-full"
              data-testid="button-profile-avatar"
            >
              <Avatar className="w-8 h-8">
                <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </div>
        </div>
      </header>

      <Sheet open={profileOpen} onOpenChange={setProfileOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[70dvh]" data-testid="sheet-customer-profile">
          <SheetHeader className="items-center pb-2">
            <Avatar className="w-16 h-16 mb-1">
              <AvatarFallback className="text-xl bg-primary/10 text-primary font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <SheetTitle className="text-center" data-testid="text-profile-name">
              {customerName}
            </SheetTitle>
            <SheetDescription className="text-center">
              {t("بوابة العملاء", "Customer Portal")}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-3 mt-2">
            {customer?.phone && (
              <div className="flex items-center gap-3 text-sm" data-testid="text-profile-phone">
                <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                <span dir="ltr">{customer.phone}</span>
              </div>
            )}
            {customer?.city && (
              <div className="flex items-center gap-3 text-sm" data-testid="text-profile-city">
                <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                <span>{customer.city}</span>
              </div>
            )}

            <Separator />

            <div className="flex items-center gap-3 text-sm" data-testid="text-profile-orders">
              <Package className="w-4 h-4 text-muted-foreground shrink-0" />
              <span>{t("عدد الطلبات", "Total Orders")}</span>
              <span className="ms-auto font-semibold">{orderCount ?? 0}</span>
            </div>

            <Separator />

            <Button
              variant="outline"
              className="w-full text-destructive hover:text-destructive"
              onClick={handleLogout}
              data-testid="button-profile-logout"
            >
              <LogOut className="w-4 h-4 me-2" />
              {t("تسجيل الخروج", "Logout")}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useLanguage();
  const map: Record<string, { ar: string; en: string; cls: string }> = {
    requested: { ar: "طلب جديد", en: "New Request", cls: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
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
        className="flex overflow-x-auto scrollbar-hide px-2 max-w-2xl md:max-w-4xl lg:max-w-5xl mx-auto"
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
  { key: "requested", ar: "طلب جديد", en: "New Request" },
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
  if (quotation.status === "requested") return 0;
  if (quotation.status === "draft") return 1;
  if (quotation.status === "sent") return 4;
  if (quotation.status === "rejected" || quotation.status === "expired") return -1;
  if (quotation.status === "approved") {
    const contract = contracts.find((c: any) => c.quotationId === quotation.id);
    if (!contract) return 5;
    const workOrderData = production.find((p: any) => p.workOrder?.contractId === contract.id);
    if (!workOrderData) return 5;
    const wo = workOrderData.workOrder;
    if (wo.status === "pending") return 6;
    if (wo.status === "in_production") return 6;
    if (wo.status === "quality_check") return 7;
    if (wo.status === "ready") return 8;
    if (wo.status === "shipped" || wo.status === "delivered") return 9;
    if (wo.status === "installed") return 10;
    if (wo.status === "completed") return 11;
    return 6;
  }
  return 0;
}

function formatInspectionDate(dateStr: string, lang: string) {
  const date = new Date(dateStr + "T00:00:00");
  const dayNames: Record<string, { ar: string; en: string }> = {
    "0": { ar: "الأحد", en: "Sunday" },
    "1": { ar: "الاثنين", en: "Monday" },
    "2": { ar: "الثلاثاء", en: "Tuesday" },
    "3": { ar: "الأربعاء", en: "Wednesday" },
    "4": { ar: "الخميس", en: "Thursday" },
    "5": { ar: "الجمعة", en: "Friday" },
    "6": { ar: "السبت", en: "Saturday" },
  };
  const dayName = dayNames[String(date.getDay())];
  const formatted = date.toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return `${lang === "ar" ? dayName.ar : dayName.en} ${formatted}`;
}

function generateIcsFile(dateStr: string, lang: string) {
  const date = dateStr.replace(/-/g, "");
  const nextDay = new Date(dateStr + "T00:00:00");
  nextDay.setDate(nextDay.getDate() + 1);
  const endDate = nextDay.toISOString().split("T")[0].replace(/-/g, "");
  const title = lang === "ar" ? "معاينة تيك للتصنيع" : "Teak Manufacturing Inspection";
  const description = lang === "ar" ? "موعد المعاينة مع مصنع تيك" : "Inspection appointment with Teak Manufacturing";

  const icsContent = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Teak//Portal//EN",
    "BEGIN:VEVENT",
    `DTSTART;VALUE=DATE:${date}`,
    `DTEND;VALUE=DATE:${endDate}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description}`,
    "STATUS:CONFIRMED",
    `UID:teak-inspection-${dateStr}@teak.sa`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `teak-inspection-${dateStr}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function InspectionAppointmentCard({ inspectionDate, orderId }: { inspectionDate: string; orderId: number }) {
  const { t, lang } = useLanguage();
  const formattedDate = formatInspectionDate(inspectionDate, lang);

  return (
    <div className="border rounded-lg p-3 bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900" data-testid={`card-inspection-${orderId}`}>
      <div className="flex items-center gap-2 mb-2">
        <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">
          {t("موعد المعاينة", "Inspection Appointment")}
        </span>
      </div>
      <p className="text-sm font-bold mb-2.5" data-testid={`text-inspection-date-${orderId}`}>
        {formattedDate}
      </p>
      <Button
        variant="outline"
        size="sm"
        className="w-full text-xs"
        onClick={() => generateIcsFile(inspectionDate, lang)}
        data-testid={`button-add-to-calendar-${orderId}`}
      >
        <CalendarPlus className="w-3.5 h-3.5 me-1.5" />
        {t("إضافة للتقويم", "Add to Calendar")}
      </Button>
    </div>
  );
}

function DesignViewSection({ design, quotationId, hideApprovalButtons, quotation }: { design: any; quotationId: number; hideApprovalButtons?: boolean; quotation?: any }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [fullscreenImg, setFullscreenImg] = useState<string | null>(null);
  const [showRevision, setShowRevision] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState("");

  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/customer-portal/approve-design/${design.id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("تم اعتماد التصميم بنجاح", "Design approved successfully") });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/my-data"] });
    },
    onError: () => {
      toast({ title: t("حدث خطأ", "Error"), variant: "destructive" });
    },
  });

  const revisionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/customer-portal/request-revision/${design.id}`, { notes: revisionNotes });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("تم إرسال طلب التعديل", "Revision request sent") });
      setShowRevision(false);
      setRevisionNotes("");
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/my-data"] });
    },
    onError: () => {
      toast({ title: t("حدث خطأ", "Error"), variant: "destructive" });
    },
  });

  const isApproved = design.customerApproval === "approved";
  const isRevisionRequested = design.customerApproval === "revision_requested";
  const canAct = !isApproved && design.status === "completed";

  return (
    <div className="mt-3 border rounded-lg p-3 bg-muted/30 space-y-3" data-testid={`design-section-${quotationId}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Palette className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold">{t("التصميم", "Design")}</span>
        </div>
        {isApproved && (
          <span className="text-[10px] font-medium text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-950/40 px-2 py-0.5 rounded-full flex items-center gap-1" data-testid={`badge-design-approved-${quotationId}`}>
            <CheckCircle2 className="w-3 h-3" />
            {t("تم الاعتماد", "Approved")}
          </span>
        )}
        {isRevisionRequested && (
          <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/40 px-2 py-0.5 rounded-full flex items-center gap-1" data-testid={`badge-design-revision-${quotationId}`}>
            <MessageSquare className="w-3 h-3" />
            {t("طلب تعديل", "Revision Requested")}
          </span>
        )}
      </div>

      {design.sketchImage && (
        <div className="relative group">
          <p className="text-[10px] text-muted-foreground mb-1">{t("المخطط ثنائي الأبعاد", "2D Sketch")}</p>
          <img
            src={design.sketchImage}
            alt="2D Design"
            className="w-full rounded cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => setFullscreenImg(design.sketchImage)}
            data-testid={`img-design-2d-${quotationId}`}
          />
          <button
            onClick={() => setFullscreenImg(design.sketchImage)}
            className="absolute top-2 end-2 bg-black/50 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
            data-testid={`button-fullscreen-2d-${quotationId}`}
          >
            <Maximize className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {design.screenshot3d && (
        <div className="relative group">
          <p className="text-[10px] text-muted-foreground mb-1">{t("العرض ثلاثي الأبعاد", "3D View")}</p>
          <img
            src={design.screenshot3d}
            alt="3D View"
            className="w-full rounded cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => setFullscreenImg(design.screenshot3d)}
            data-testid={`img-design-3d-${quotationId}`}
          />
          <button
            onClick={() => setFullscreenImg(design.screenshot3d)}
            className="absolute top-2 end-2 bg-black/50 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
            data-testid={`button-fullscreen-3d-${quotationId}`}
          >
            <Maximize className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {design.notes && <p className="text-xs text-muted-foreground">{design.notes}</p>}

      {design.customerApprovalNotes && isRevisionRequested && (
        <div className="bg-amber-50 dark:bg-amber-950/20 rounded-md p-2.5 text-xs">
          <p className="font-semibold text-amber-800 dark:text-amber-300 mb-0.5">{t("ملاحظات التعديل", "Revision Notes")}</p>
          <p className="text-amber-700 dark:text-amber-400">{design.customerApprovalNotes}</p>
        </div>
      )}

      {canAct && !hideApprovalButtons && quotation && Array.isArray(quotation.items) && quotation.items.length > 0 && (
        <div className="border rounded-lg overflow-hidden" data-testid={`design-pricing-breakdown-${quotationId}`}>
          <div className="px-3 py-2 bg-muted/50 flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold">{t("تفاصيل المنتجات والأسعار", "Products & Pricing Breakdown")}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-3 py-2 text-start font-medium">{t("المنتج", "Product")}</th>
                  <th className="px-2 py-2 text-center font-medium">{t("الكمية", "Qty")}</th>
                  <th className="px-2 py-2 text-end font-medium">{t("السعر", "Price")}</th>
                  <th className="px-3 py-2 text-end font-medium">{t("الإجمالي", "Total")}</th>
                </tr>
              </thead>
              <tbody>
                {quotation.items.map((item: any, idx: number) => {
                  const unitPrice = parseFloat(item.unitPrice || item.pricePerMeter || 0);
                  const optCost = parseFloat(item.optionsCost || 0);
                  const qty = parseFloat(item.quantity || 1);
                  const total = parseFloat(item.amount || item.total || item.lineTotal || 0) || (unitPrice + optCost) * qty;
                  return (
                    <tr key={idx} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        <p className="font-medium">{item.description || item.nameAr || item.productType || `${t("منتج", "Item")} ${idx + 1}`}</p>
                        {item.code && <p className="text-[10px] text-muted-foreground">{item.code}</p>}
                      </td>
                      <td className="px-2 py-2 text-center">{qty}</td>
                      <td className="px-2 py-2 text-end">{(unitPrice + optCost).toLocaleString()}</td>
                      <td className="px-3 py-2 text-end font-medium">{total.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t p-3 space-y-1 text-xs bg-muted/20">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("المجموع قبل الخصم", "Subtotal")}</span>
              <span>{parseFloat(quotation.subtotal || "0").toLocaleString()} {t("ر.س", "SAR")}</span>
            </div>
            {parseFloat(quotation.discount || "0") > 0 && (
              <div className="flex justify-between text-green-600">
                <span>{t("الخصم", "Discount")}</span>
                <span>-{parseFloat(quotation.discount).toLocaleString()} {t("ر.س", "SAR")}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("ضريبة القيمة المضافة 15%", "VAT 15%")}</span>
              <span>{parseFloat(quotation.vatAmount || "0").toLocaleString(undefined, { maximumFractionDigits: 2 })} {t("ر.س", "SAR")}</span>
            </div>
            <div className="flex justify-between font-bold text-sm border-t pt-1">
              <span>{t("الإجمالي النهائي", "Final Total")}</span>
              <span className="text-primary" data-testid={`text-design-final-price-${quotationId}`}>
                {parseFloat(quotation.finalPrice || quotation.totalPrice || "0").toLocaleString(undefined, { maximumFractionDigits: 2 })} {t("ر.س", "SAR")}
              </span>
            </div>
          </div>
        </div>
      )}

      {canAct && !hideApprovalButtons && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
              className="h-9 text-xs bg-green-600 hover:bg-green-700"
              data-testid={`button-approve-design-${quotationId}`}
            >
              {approveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin me-1" /> : <ThumbsUp className="w-3.5 h-3.5 me-1" />}
              {t("اعتماد التصميم", "Approve Design")}
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowRevision(!showRevision)}
              className="h-9 text-xs"
              data-testid={`button-request-revision-${quotationId}`}
            >
              <MessageSquare className="w-3.5 h-3.5 me-1" />
              {t("طلب تعديلات", "Request Changes")}
            </Button>
          </div>

          {showRevision && (
            <div className="space-y-2">
              <Textarea
                placeholder={t("اكتب ملاحظاتك للتعديل...", "Write your revision notes...")}
                value={revisionNotes}
                onChange={(e) => setRevisionNotes(e.target.value)}
                className="text-xs min-h-[60px]"
                data-testid={`textarea-revision-notes-${quotationId}`}
              />
              <Button
                onClick={() => revisionMutation.mutate()}
                disabled={revisionMutation.isPending || !revisionNotes.trim()}
                size="sm"
                className="w-full h-8 text-xs"
                data-testid={`button-submit-revision-${quotationId}`}
              >
                {revisionMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin me-1" /> : null}
                {t("إرسال طلب التعديل", "Submit Revision Request")}
              </Button>
            </div>
          )}
        </div>
      )}

      {fullscreenImg && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setFullscreenImg(null)}
          data-testid="modal-fullscreen-design"
        >
          <button
            className="absolute top-4 end-4 text-white bg-black/50 rounded-full p-2"
            onClick={() => setFullscreenImg(null)}
            data-testid="button-close-fullscreen"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={fullscreenImg}
            alt="Design fullscreen"
            className="max-w-full max-h-[90vh] object-contain rounded"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

type OrderFilter = "pending" | "active" | "done";

function classifyOrder(q: any, stageIdx: number): OrderFilter {
  if (q.status === "rejected" || q.status === "expired") return "done";
  if (stageIdx <= 4) return "pending";
  if (stageIdx <= 8) return "active";
  return "done";
}

function OrdersTab({ quotations, contracts, production, designs, customerName }: {
  quotations: any[]; contracts: any[]; production: any[]; designs: any[]; customerName?: string;
}) {
  const { t } = useLanguage();
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);
  const [orderFilter, setOrderFilter] = useState<OrderFilter>("pending");

  if (!quotations.length) return <EmptyState icon={ClipboardList} titleAr="لا توجد طلبات" titleEn="No orders yet" />;

  const sorted = [...quotations].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  const withStage = sorted.map((q: any) => {
    const stageIdx = getOrderStageIndex(q, contracts, production);
    return { q, stageIdx, category: classifyOrder(q, stageIdx) };
  });

  const counts: Record<OrderFilter, number> = {
    pending: withStage.filter(x => x.category === "pending").length,
    active:  withStage.filter(x => x.category === "active").length,
    done:    withStage.filter(x => x.category === "done").length,
  };

  const filtered = withStage.filter(x => x.category === orderFilter);

  const filterTabs: { key: OrderFilter; ar: string; en: string; color: string; activeColor: string }[] = [
    { key: "pending", ar: "معلّقة",  en: "Pending",     color: "border-amber-300 text-amber-700 dark:text-amber-400", activeColor: "bg-amber-500 text-white border-amber-500" },
    { key: "active",  ar: "جارية",   en: "In Progress", color: "border-blue-300 text-blue-700 dark:text-blue-400",   activeColor: "bg-blue-500 text-white border-blue-500" },
    { key: "done",    ar: "مكتملة",  en: "Done",        color: "border-green-300 text-green-700 dark:text-green-400", activeColor: "bg-green-600 text-white border-green-600" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide" role="tablist" aria-label={t("تصنيف الطلبات", "Order filters")}>
        {filterTabs.map(tab => {
          const isActive = orderFilter === tab.key;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => { setOrderFilter(tab.key); setExpandedOrder(null); }}
              data-testid={`filter-orders-${tab.key}`}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full border text-sm font-medium whitespace-nowrap transition-all shrink-0 ${
                isActive ? tab.activeColor : `bg-transparent ${tab.color} hover:bg-muted/60`
              }`}
            >
              {t(tab.ar, tab.en)}
              <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
                isActive ? "bg-white/25 text-white" : "bg-muted text-muted-foreground"
              }`}>
                {counts[tab.key]}
              </span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          titleAr={orderFilter === "pending" ? "لا توجد طلبات معلقة" : orderFilter === "active" ? "لا توجد طلبات جارية" : "لا توجد طلبات مكتملة"}
          titleEn={orderFilter === "pending" ? "No pending orders" : orderFilter === "active" ? "No active orders" : "No completed orders"}
        />
      ) : (
        <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
          {filtered.map(({ q, stageIdx }) => {
        const isRejected = q.status === "rejected";
        const isExpired = q.status === "expired";
        const isExpanded = expandedOrder === q.id;
        const design = designs.find((d: any) => d.quotationId === q.id && (d.status === "completed" || d.customerApproval));
        const currentStage = stageIdx >= 0 ? orderStages[stageIdx] : null;
        const itemDesc = q.items?.[0]?.description || q.productDescription;

        return (
          <Card key={q.id} className={`overflow-hidden ${isRejected ? "border-red-200 dark:border-red-900" : isExpired ? "border-gray-200" : ""}`} data-testid={`card-order-${q.id}`}>
            <CardContent className="p-0">
              <div className="px-4 py-3 flex items-center justify-between">
                <div>
                  <span className="text-sm font-semibold">{t("طلب", "Order")} #{q.id}</span>
                  {itemDesc && (
                    <p className="text-xs text-muted-foreground mt-0.5">{itemDesc}</p>
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
                  {q.inspectionDate && (
                    <div className="mb-3">
                      <InspectionAppointmentCard inspectionDate={q.inspectionDate} orderId={q.id} />
                    </div>
                  )}
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

                  {(() => {
                    const contract = contracts.find((c: any) => c.quotationId === q.id);
                    if (!contract) return null;
                    const woData = production.find((p: any) => p.workOrder?.contractId === contract.id);
                    const wo = woData?.workOrder;
                    if (wo && wo.productionStartDate && wo.deliveryDays) {
                      return (
                        <div className="mt-3 border rounded-lg p-3" data-testid={`delivery-countdown-order-${q.id}`}>
                          <DeliveryCountdown
                            deliveryDays={wo.deliveryDays}
                            productionStartDate={wo.productionStartDate}
                          />
                        </div>
                      );
                    }
                    return null;
                  })()}

                  <View3DButton quotationId={q.id} />

                  <PortalSurveyDesignFiles quotationId={q.id} />

                  {Array.isArray(q.items) && q.items.length > 0 && (
                    <ProductDetailsTable items={q.items} quotation={q} />
                  )}

                  {design && (design.sketchImage || design.screenshot3d) && (
                    <DesignViewSection design={design} quotationId={q.id} quotation={q} />
                  )}

                  {q.items && Array.isArray(q.items) && q.items.length > 0 && (
                    <div className="mt-3" data-testid={`engineering-pdf-section-${q.id}`}>
                      <ExportEngineeringPdfButton
                        roomData={{
                          length: design?.measurements?.roomLength || 400,
                          width: design?.measurements?.roomWidth || 300,
                          height: design?.measurements?.roomHeight || 270,
                          doors: design?.measurements?.doors || [],
                          windows: design?.measurements?.windows || [],
                        }}
                        products={q.items.map((item: any, idx: number) => ({
                          code: item.adekoCode || item.code || `P${idx + 1}`,
                          description: item.description || item.productType || "",
                          nameAr: item.adekoNameAr || item.description || "",
                          nameEn: item.adekoNameEn || item.description || "",
                          width: item.designW || item.width || 60,
                          height: item.designH || item.height || 80,
                          depth: item.designD || item.depth || 60,
                          designW: item.designW || item.width || 60,
                          designH: item.designH || item.height || 80,
                          designD: item.designD || item.depth || 60,
                          manufacturingW: item.manufacturingW || item.designW || item.width || 60,
                          manufacturingH: item.manufacturingH || item.designH || item.height || 80,
                          manufacturingD: item.manufacturingD || item.designD || item.depth || 60,
                          price: item.total || item.amount || 0,
                          quantity: item.quantity || item.qty || 1,
                          wallIndex: idx % 4,
                        }))}
                        customerName={customerName || ""}
                        projectTitle={q.notes || ""}
                        quotationNumber={q.id}
                      />
                    </div>
                  )}
                </div>
              )}

              {isExpanded && (isRejected || isExpired) && (
                <div className="px-4 pb-3 border-t pt-3 space-y-3">
                  {q.inspectionDate && (
                    <InspectionAppointmentCard inspectionDate={q.inspectionDate} orderId={q.id} />
                  )}
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
      )}
    </div>
  );
}

function PaymentSection({ invoice, contract, quotation, payments, setPreviewInvoice }: {
  invoice: any; contract: any; quotation: any; payments: any[]; setPreviewInvoice: (inv: any) => void;
}) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [paymentNotes, setPaymentNotes] = useState("");

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/customer-portal/upload-receipt", {
        contractId: contract?.id,
        amount: invoice?.totalWithVat || quotation.finalPrice || quotation.totalPrice || "0",
        receiptImage,
        paymentMethod: "bank_transfer",
        notes: paymentNotes || "تم رفع الوصل من بوابة العميل",
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("تم رفع إيصال السداد بنجاح", "Payment receipt uploaded successfully") });
      setReceiptImage(null);
      setPaymentNotes("");
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/my-data"] });
    },
    onError: () => {
      toast({ title: t("حدث خطأ", "Error"), variant: "destructive" });
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
      setReceiptImage(reader.result as string);
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="border rounded-lg p-3 bg-emerald-50/50 dark:bg-emerald-950/20 space-y-3" data-testid={`section-payment-${quotation.id}`}>
      <div className="flex items-center gap-2">
        <Banknote className="w-4 h-4 text-emerald-600" />
        <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
          {t("السداد", "Payment")}
        </span>
      </div>

      {invoice && (
        <Button
          variant="outline"
          size="sm"
          className="w-full h-9 text-xs border-emerald-200 dark:border-emerald-800"
          onClick={() => setPreviewInvoice({
            ...invoice,
            invoiceNumber: invoice.invoiceNumber || invoice.id,
            type: "simplified_tax_invoice",
            sellerName: invoice.sellerName || "مصنع تيك للمنتجات الخشبية",
            sellerAddress: invoice.sellerAddress || "الرياض - المملكة العربية السعودية",
            sellerVatNumber: invoice.sellerVatNumber || "310012345600003",
          })}
          data-testid={`button-view-invoice-${quotation.id}`}
        >
          <Receipt className="w-3.5 h-3.5 me-1.5" />
          {t("استعراض الفاتورة الضريبية", "View Tax Invoice")}
        </Button>
      )}

      <div className="space-y-2">
        <p className="text-[11px] text-muted-foreground">
          {t("يرجى تحويل المبلغ ثم إرفاق صورة الإيصال", "Please transfer the amount and attach the receipt")}
        </p>
        <div className="flex items-center justify-between bg-white dark:bg-gray-900 rounded-md px-3 py-2 border">
          <span className="text-xs text-muted-foreground">{t("المبلغ المطلوب", "Amount Due")}</span>
          <span className="font-bold text-sm">
            {Number(invoice?.totalWithVat || quotation.finalPrice || quotation.totalPrice || 0).toLocaleString()} {t("ريال", "SAR")}
          </span>
        </div>

        {payments.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground">{t("المدفوعات السابقة", "Previous Payments")}</p>
            {payments.map((p: any) => (
              <div key={p.id} className={`flex items-center justify-between rounded-md px-3 py-2 border text-xs ${
                p.status === "confirmed" ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800" :
                p.status === "rejected" ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800" :
                "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
              }`} data-testid={`payment-status-${p.id}`}>
                <div className="flex items-center gap-2">
                  {p.status === "confirmed" ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                  ) : p.status === "rejected" ? (
                    <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                  ) : (
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                  )}
                  <div>
                    <span className="font-medium">
                      {Number(p.amount || 0).toLocaleString()} {t("ريال", "SAR")}
                    </span>
                    <p className={`text-[10px] mt-0.5 ${
                      p.status === "confirmed" ? "text-green-600 dark:text-green-400" :
                      p.status === "rejected" ? "text-red-600 dark:text-red-400" :
                      "text-amber-600 dark:text-amber-400"
                    }`}>
                      {p.status === "confirmed" ? t("تم التأكيد", "Confirmed") :
                       p.status === "rejected" ? t("مرفوض", "Rejected") :
                       t("بانتظار التأكيد", "Pending confirmation")}
                    </p>
                    {p.status === "rejected" && p.rejectionReason && (
                      <p className="text-[10px] text-red-500 mt-0.5">{p.rejectionReason}</p>
                    )}
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(p.createdAt).toLocaleDateString("ar-SA")}
                </span>
              </div>
            ))}
          </div>
        )}

        {(() => {
          const hasRejected = payments.some((p: any) => p.status === "rejected");
          const hasPending = payments.some((p: any) => p.status === "pending");
          const allConfirmed = payments.length > 0 && payments.every((p: any) => p.status === "confirmed");
          const showUpload = !hasPending && !allConfirmed;

          if (hasPending) {
            return (
              <div className="text-center py-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
                <Clock className="w-5 h-5 text-amber-500 mx-auto mb-1" />
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                  {t("إيصالك قيد المراجعة من المحاسب", "Your receipt is being reviewed by the accountant")}
                </p>
              </div>
            );
          }

          if (allConfirmed) {
            return (
              <div className="text-center py-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
                <CheckCircle2 className="w-5 h-5 text-green-500 mx-auto mb-1" />
                <p className="text-xs text-green-700 dark:text-green-400 font-medium">
                  {t("تم تأكيد جميع المدفوعات", "All payments confirmed")}
                </p>
              </div>
            );
          }

          return (
            <>
              {hasRejected && (
                <div className="bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-800 p-2 text-center">
                  <p className="text-xs text-red-700 dark:text-red-400 font-medium">
                    {t("تم رفض الإيصال السابق — يرجى إرفاق إيصال جديد", "Previous receipt rejected — please upload a new one")}
                  </p>
                </div>
              )}
              {receiptImage ? (
                <div className="space-y-2">
                  <div className="relative">
                    <img src={receiptImage} alt="Receipt" className="w-full rounded-md border max-h-48 object-contain bg-white" />
                    <button
                      onClick={() => setReceiptImage(null)}
                      className="absolute top-1 end-1 bg-red-500 text-white rounded-full p-1"
                      data-testid={`button-remove-receipt-${quotation.id}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <Textarea
                    placeholder={t("ملاحظات إضافية (اختياري)", "Additional notes (optional)")}
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    className="text-xs h-16"
                    data-testid={`input-payment-notes-${quotation.id}`}
                  />
                  <Button
                    onClick={() => uploadMutation.mutate()}
                    disabled={uploadMutation.isPending}
                    className="w-full h-10 bg-emerald-600 hover:bg-emerald-700"
                    data-testid={`button-submit-receipt-${quotation.id}`}
                  >
                    {uploadMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <CreditCard className="w-4 h-4 me-2" />}
                    {hasRejected ? t("إعادة إرسال الإيصال", "Resubmit Receipt") : t("إرسال إيصال السداد", "Submit Payment Receipt")}
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center gap-2 border-2 border-dashed border-emerald-300 dark:border-emerald-700 rounded-lg p-4 cursor-pointer hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors">
                  <Upload className="w-6 h-6 text-emerald-500" />
                  <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                    {uploading ? t("جاري الرفع...", "Uploading...") : t("اضغط لإرفاق صورة أو ملف PDF للإيصال", "Tap to attach receipt image or PDF")}
                  </span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                    data-testid={`input-receipt-file-${quotation.id}`}
                  />
                </label>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}

function ProductDetailsTable({ items, quotation }: { items: any[]; quotation: any }) {
  const { t } = useLanguage();
  if (!items || !Array.isArray(items) || items.length === 0) return null;

  const subtotal = parseFloat(quotation.subtotal || "0");
  const vatAmount = parseFloat(quotation.vatAmount || "0");
  const discount = parseFloat(quotation.discount || "0");
  const finalPrice = parseFloat(quotation.finalPrice || quotation.totalPrice || "0");

  return (
    <div className="border rounded-lg overflow-hidden" data-testid={`product-table-${quotation.id}`}>
      <div className="px-3 py-2 bg-muted/50 flex items-center gap-1.5">
        <Package className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-semibold">{t("تفاصيل المنتجات", "Product Details")}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="px-3 py-2 text-start font-medium">{t("المنتج", "Product")}</th>
              <th className="px-2 py-2 text-center font-medium">{t("الكمية", "Qty")}</th>
              <th className="px-2 py-2 text-end font-medium">{t("السعر", "Price")}</th>
              <th className="px-3 py-2 text-end font-medium">{t("الإجمالي", "Total")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any, idx: number) => {
              const unitPrice = parseFloat(item.unitPrice || item.pricePerMeter || 0);
              const optCost = parseFloat(item.optionsCost || 0);
              const qty = parseFloat(item.quantity || 1);
              const total = parseFloat(item.amount || item.total || item.lineTotal || 0) || (unitPrice + optCost) * qty;
              return (
                <tr key={idx} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    <p className="font-medium">{item.description || item.nameAr || item.productType || `${t("منتج", "Item")} ${idx + 1}`}</p>
                    {item.code && <p className="text-[10px] text-muted-foreground">{item.code}</p>}
                    {item.optionDetails && Object.keys(item.optionDetails).length > 0 && (
                      <div className="mt-0.5">
                        {Object.entries(item.optionDetails).map(([key, val]: any) => (
                          <p key={key} className="text-[9px] text-muted-foreground">
                            {val.name} (+{val.price} {t("ر.س", "SAR")})
                          </p>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center">{qty}</td>
                  <td className="px-2 py-2 text-end">{(unitPrice + optCost).toLocaleString()}</td>
                  <td className="px-3 py-2 text-end font-medium">{total.toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t p-3 space-y-1 text-xs bg-muted/20">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("المجموع", "Subtotal")}</span>
          <span>{subtotal.toLocaleString()} {t("ر.س", "SAR")}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("الضريبة 15%", "VAT 15%")}</span>
          <span>{vatAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} {t("ر.س", "SAR")}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-green-600">
            <span>{t("الخصم", "Discount")}</span>
            <span>-{discount.toLocaleString()} {t("ر.س", "SAR")}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-sm border-t pt-1">
          <span>{t("الإجمالي النهائي", "Final Total")}</span>
          <span className="text-primary">{finalPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })} {t("ر.س", "SAR")}</span>
        </div>
      </div>
    </div>
  );
}

function View3DButton({ quotationId, surveyId }: { quotationId: number; surveyId?: number }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { data: surveys } = useQuery<any[]>({
    queryKey: ["/api/customer-portal/site-surveys"],
    queryFn: async () => {
      const res = await fetch("/api/customer-portal/site-surveys", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60000,
  });

  const survey = surveys?.find(s => s.quotationId === quotationId) || (surveyId ? surveys?.find(s => s.id === surveyId) : null);
  if (!survey) return null;

  const tokenQuery = survey.shareToken ? `&token=${survey.shareToken}` : "";

  const handleOpen = () => {
    window.open(`/view-3d?surveyId=${survey.id}&public=1&quotationId=${quotationId}${tokenQuery}`, "_blank");
  };

  const handleShare = () => {
    const url = `${window.location.origin}/view-3d?surveyId=${survey.id}&public=1&quotationId=${quotationId}${tokenQuery}`;
    if (navigator.share) {
      navigator.share({ title: t("تصميم ثلاثي الأبعاد - تيك", "3D Design - Teak"), url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url);
      toast({ title: t("تم نسخ الرابط", "Link copied") });
    }
  };

  return (
    <div className="flex gap-2" data-testid={`view-3d-${quotationId}`}>
      <Button
        variant="outline"
        size="sm"
        className="flex-1 h-9 text-xs border-purple-200 text-purple-700 hover:bg-purple-50 dark:border-purple-800 dark:text-purple-400 dark:hover:bg-purple-950/30"
        onClick={handleOpen}
        data-testid={`button-view-3d-${quotationId}`}
      >
        <Eye className="w-3.5 h-3.5 me-1.5" />
        {t("عرض التصميم 3D", "View 3D Design")}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-9 w-9 text-purple-600 dark:text-purple-400"
        onClick={handleShare}
        data-testid={`button-share-3d-${quotationId}`}
      >
        <Share2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

function PortalSurveyDesignFiles({ quotationId }: { quotationId: number }) {
  const { t } = useLanguage();
  const [expandedFiles, setExpandedFiles] = useState(false);
  const { data: surveys } = useQuery<any[]>({
    queryKey: ["/api/customer-portal/site-surveys"],
    queryFn: async () => {
      const res = await fetch("/api/customer-portal/site-surveys", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60000,
  });
  const survey = surveys?.find((s: any) => s.quotationId === quotationId);
  const files: any[] = survey?.designFiles || [];
  if (files.length === 0) return null;
  return (
    <div data-testid={`portal-design-files-${quotationId}`}>
      <button
        className="w-full flex items-center justify-between text-xs text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 rounded-md px-3 py-2 hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors"
        onClick={() => setExpandedFiles(!expandedFiles)}
        data-testid={`button-toggle-design-files-${quotationId}`}
      >
        <div className="flex items-center gap-1.5">
          <Paperclip className="w-3.5 h-3.5 shrink-0" />
          <span className="font-medium">{t("مخططات المشروع", "Project Plans")} ({files.length})</span>
        </div>
        {expandedFiles ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {expandedFiles && (
        <div className="mt-1 space-y-1.5 border rounded-lg p-2 bg-muted/20" data-testid={`design-files-list-${quotationId}`}>
          {files.map((f: any) => (
            <div key={f.id} className="flex items-center gap-2 text-xs" data-testid={`portal-file-row-${f.id}`}>
              <FileDown className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span className="flex-1 truncate font-medium">{f.file_name}</span>
              <button
                className="text-blue-600 dark:text-blue-400 underline shrink-0 hover:opacity-75"
                onClick={() => {
                  if (f.file_url) {
                    // New: authenticated endpoint for filesystem files
                    const filename = f.file_url.split("/").pop();
                    const a = document.createElement("a");
                    a.href = `/api/customer/survey-files/${filename}`;
                    a.download = f.file_name;
                    a.click();
                  } else if (f.file_data) {
                    // Legacy: base64 data URL
                    const a = document.createElement("a");
                    a.href = f.file_data;
                    a.download = f.file_name;
                    a.click();
                  }
                }}
                data-testid={`button-download-file-${f.id}`}
              >
                {t("تنزيل", "Download")}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QuotationsTab({ quotations, designs, invoices, contracts, payments, onApprove, approving }: {
  quotations: any[]; designs: any[]; invoices: any[]; contracts: any[]; payments: any[]; onApprove: (id: number) => void; approving: boolean;
}) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const [viewDesign, setViewDesign] = useState<number | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<any | null>(null);
  const [revisionForQuote, setRevisionForQuote] = useState<number | null>(null);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [expandedItems, setExpandedItems] = useState<number | null>(null);
  const [expandedProducts, setExpandedProducts] = useState<number | null>(null);

  const revisionMutation = useMutation({
    mutationFn: async ({ designId }: { designId: number }) => {
      const res = await apiRequest("POST", `/api/customer-portal/request-revision/${designId}`, { notes: revisionNotes });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("تم إرسال طلب التعديل بنجاح", "Revision request sent successfully") });
      setRevisionForQuote(null);
      setRevisionNotes("");
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/my-data"] });
    },
    onError: () => {
      toast({ title: t("حدث خطأ", "Error"), variant: "destructive" });
    },
  });

  if (!quotations.length) return <EmptyState icon={FileText} titleAr="لا توجد عروض أسعار" titleEn="No quotations yet" />;

  const sorted = [...quotations].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  return (
    <>
      <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
        {sorted.map((q: any) => {
          const design = designs.find((d: any) => d.quotationId === q.id && (d.status === "completed" || d.customerApproval));
          const isApproved = q.status === "approved";

          return (
            <Card key={q.id} className={`overflow-hidden ${isApproved ? "border-green-200 dark:border-green-900" : ""}`} data-testid={`card-quotation-${q.id}`}>
              <CardContent className="p-0">
                <div className={`px-4 py-3 flex items-center justify-between ${isApproved ? "bg-green-50/50 dark:bg-green-950/20" : q.status === "sent" ? "bg-blue-50/40 dark:bg-blue-950/20" : ""}`}>
                  <div className="flex items-center gap-2">
                    <FileText className={`w-4 h-4 ${isApproved ? "text-green-600" : q.status === "sent" ? "text-blue-600" : "text-muted-foreground"}`} />
                    <span className="text-sm font-semibold">{t("عرض سعر", "Quotation")} #{q.id}</span>
                  </div>
                  <StatusBadge status={q.status} />
                </div>
                {q.status === "sent" && (
                  <div className="px-4 py-2 bg-blue-50/70 dark:bg-blue-950/30 border-b border-blue-100 dark:border-blue-900 flex items-center gap-2 text-xs text-blue-700 dark:text-blue-400 font-medium" data-testid={`banner-awaiting-approval-${q.id}`}>
                    <span className="text-base leading-none">⏳</span>
                    {t("ينتظر اعتمادك — راجع التفاصيل وأعتمد عرض السعر", "Awaiting your approval — review details and approve")}
                  </div>
                )}

                <div className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{t("المبلغ الإجمالي", "Total Amount")}</span>
                    <span className="font-bold text-base">{Number(q.finalPrice || q.totalPrice || q.totalWithVat || q.total || 0).toLocaleString()} <span className="text-xs font-normal text-muted-foreground">{t("ريال", "SAR")}</span></span>
                  </div>
                  {q.vatAmount && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{t("ضريبة القيمة المضافة", "VAT (15%)")}</span>
                      <span className="text-xs text-muted-foreground">{Number(q.vatAmount).toLocaleString()} {t("ريال", "SAR")}</span>
                    </div>
                  )}
                  {q.discount && Number(q.discount) > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-green-600">{t("خصم", "Discount")}</span>
                      <span className="text-xs text-green-600">-{Number(q.discount).toLocaleString()} {t("ريال", "SAR")}</span>
                    </div>
                  )}
                  {q.createdAt && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      {new Date(q.createdAt).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" })}
                    </div>
                  )}

                  {q.items && Array.isArray(q.items) && q.items.length > 0 && (
                    <div>
                      <button
                        className="text-xs text-primary flex items-center gap-1 hover:underline mt-1"
                        onClick={() => setExpandedItems(expandedItems === q.id ? null : q.id)}
                        data-testid={`button-toggle-items-${q.id}`}
                      >
                        <Package className="w-3 h-3" />
                        {expandedItems === q.id ? t("إخفاء البنود", "Hide items") : t(`عرض ${q.items.length} بند`, `View ${q.items.length} item(s)`)}
                        {expandedItems === q.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                      {expandedItems === q.id && (
                        <div className="mt-2 space-y-1.5 border rounded-lg p-2 bg-muted/30" data-testid={`items-list-${q.id}`}>
                          {q.items.map((item: any, idx: number) => (
                            <div key={idx} className="flex items-start justify-between gap-2 text-xs" data-testid={`item-row-${q.id}-${idx}`}>
                              <div className="min-w-0">
                                <p className="font-medium truncate">
                                  {item.adekoNameAr && lang === "ar" ? item.adekoNameAr :
                                   item.adekoNameEn && lang === "en" ? item.adekoNameEn :
                                   item.description || (item.productType ? t(item.productType, item.productType) : t("بند", "Item"))}
                                </p>
                                {item.mode === "product" || item.qty > 1 ? (
                                  <p className="text-muted-foreground">{item.qty || 1} × {Number(item.unitPrice || item.pricePerMeter || 0).toLocaleString()} SAR</p>
                                ) : item.area > 0 ? (
                                  <p className="text-muted-foreground">{item.area} م² × {Number(item.pricePerMeter || 0).toLocaleString()} SAR</p>
                                ) : null}
                              </div>
                              <span className="font-semibold text-primary shrink-0">{Number(item.total || 0).toLocaleString()} SAR</span>
                            </div>
                          ))}
                        </div>
                      )}
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

                  <View3DButton quotationId={q.id} />

                  <PortalSurveyDesignFiles quotationId={q.id} />

                  {Array.isArray(q.items) && q.items.length > 0 && (
                    <>
                      {q.status === "sent" ? (
                        <ProductDetailsTable items={q.items} quotation={q} />
                      ) : (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full h-8 text-xs"
                            onClick={() => setExpandedProducts(expandedProducts === q.id ? null : q.id)}
                            data-testid={`button-toggle-products-${q.id}`}
                          >
                            <Package className="w-3 h-3 me-1" />
                            {expandedProducts === q.id ? t("إخفاء المنتجات", "Hide Products") : t("عرض المنتجات والأسعار", "View Products & Prices")}
                            {expandedProducts === q.id ? <ChevronUp className="w-3 h-3 ms-1" /> : <ChevronDown className="w-3 h-3 ms-1" />}
                          </Button>
                          {expandedProducts === q.id && (
                            <ProductDetailsTable items={q.items} quotation={q} />
                          )}
                        </>
                      )}
                    </>
                  )}

                  {design && (design.sketchImage || design.screenshot3d) && (
                    q.status === "sent" ? (
                      <div className="space-y-2">
                        {design.updatedAt && design.updatedAt !== design.createdAt && (
                          <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 rounded-md px-2.5 py-1.5" data-testid={`badge-design-updated-${q.id}`}>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {t("تم تحديث التصميم — يرجى المراجعة والاعتماد", "Design updated — please review and approve")}
                          </div>
                        )}
                        <DesignViewSection design={design} quotationId={q.id} hideApprovalButtons quotation={q} />
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => setViewDesign(viewDesign === q.id ? null : q.id)}
                          className="text-xs text-primary flex items-center gap-1 hover:underline w-full justify-center"
                          data-testid={`button-toggle-design-${q.id}`}
                        >
                          <Palette className="w-3 h-3" />
                          {t("عرض التصميم", "View Design")}
                          {design.customerApproval === "approved" && <CheckCircle2 className="w-3 h-3 text-green-600" />}
                        </button>
                        {viewDesign === q.id && (
                          <DesignViewSection design={design} quotationId={q.id} quotation={q} />
                        )}
                      </>
                    )
                  )}

                  {q.status === "sent" && (
                    <div className="space-y-2">
                      <Button
                        onClick={() => onApprove(q.id)}
                        disabled={approving}
                        className="w-full h-10"
                        data-testid={`button-approve-quotation-${q.id}`}
                      >
                        {approving ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <CheckCircle2 className="w-4 h-4 me-2" />}
                        {t("اعتماد التصميم وعرض السعر", "Approve Design & Quotation")}
                      </Button>

                      {design && revisionForQuote === q.id ? (
                        <div className="space-y-2 border rounded-lg p-2.5 bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                          <Textarea
                            placeholder={t("اكتب ملاحظاتك للتعديل...", "Write your revision notes...")}
                            value={revisionNotes}
                            onChange={(e) => setRevisionNotes(e.target.value)}
                            className="text-xs min-h-[60px]"
                            data-testid={`input-revision-notes-qt-${q.id}`}
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 h-8 text-xs border-amber-300 text-amber-700 hover:bg-amber-100"
                              onClick={() => revisionMutation.mutate({ designId: design.id })}
                              disabled={revisionMutation.isPending || !revisionNotes.trim()}
                              data-testid={`button-submit-revision-qt-${q.id}`}
                            >
                              {revisionMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin me-1" /> : <RotateCcw className="w-3.5 h-3.5 me-1" />}
                              {t("إرسال طلب التعديل", "Send Revision Request")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 text-xs"
                              onClick={() => { setRevisionForQuote(null); setRevisionNotes(""); }}
                              data-testid={`button-cancel-revision-qt-${q.id}`}
                            >
                              {t("إلغاء", "Cancel")}
                            </Button>
                          </div>
                        </div>
                      ) : design ? (
                        <Button
                          variant="outline"
                          className="w-full h-9 text-xs border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/30"
                          onClick={() => setRevisionForQuote(q.id)}
                          data-testid={`button-request-revision-qt-${q.id}`}
                        >
                          <RotateCcw className="w-3.5 h-3.5 me-1.5" />
                          {t("طلب تعديل", "Request Revision")}
                        </Button>
                      ) : null}
                    </div>
                  )}

                  {isApproved && (() => {
                    const invoice = invoices.find((inv: any) => inv.quotationId === q.id);
                    const contract = contracts.find((c: any) => c.quotationId === q.id);
                    const contractPayments = contract ? payments.filter((p: any) => p.contractId === contract.id) : [];
                    return (
                      <PaymentSection
                        invoice={invoice}
                        contract={contract}
                        quotation={q}
                        payments={contractPayments}
                        setPreviewInvoice={setPreviewInvoice}
                      />
                    );
                  })()}
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

function PaymentScheduleSection({
  inv, contract, payments, totalPaid, totalAmount, onReceiptClick
}: {
  inv: any; contract: any; payments: any[]; totalPaid: number; totalAmount: number; onReceiptClick: (p: any) => void;
}) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [stageReceiptImage, setStageReceiptImage] = useState<{ [stage: string]: string }>({});
  const [stageUploading, setStageUploading] = useState<{ [stage: string]: boolean }>({});

  const paymentSchedule = contract?.paymentSchedule || [];
  const allContractPayments = contract ? payments.filter((p: any) => p.contractId === contract.id) : [];
  const confirmedPayments = allContractPayments.filter((p: any) => p.status === "confirmed");

  const uploadMutation = useMutation({
    mutationFn: async ({ stage, imageData, amount }: { stage: string; imageData: string; amount: string }) => {
      const res = await apiRequest("POST", "/api/customer-portal/upload-receipt", {
        contractId: contract?.id,
        amount,
        receiptImage: imageData,
        paymentMethod: "bank_transfer",
        paymentStage: stage,
        notes: `تم رفع الوصل من بوابة العميل - مرحلة: ${stage}`,
      });
      return res.json();
    },
    onSuccess: (_, vars) => {
      toast({ title: t("تم رفع إيصال السداد بنجاح", "Receipt uploaded successfully") });
      setStageReceiptImage((prev) => { const n = { ...prev }; delete n[vars.stage]; return n; });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-portal/my-data"] });
    },
    onError: () => {
      toast({ title: t("حدث خطأ", "Error"), variant: "destructive" });
    },
  });

  const handleFileForStage = (stage: string, file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: t("الحد الأقصى 5 ميجابايت", "Max file size is 5MB"), variant: "destructive" });
      return;
    }
    setStageUploading((prev) => ({ ...prev, [stage]: true }));
    const reader = new FileReader();
    reader.onload = () => {
      setStageReceiptImage((prev) => ({ ...prev, [stage]: reader.result as string }));
      setStageUploading((prev) => ({ ...prev, [stage]: false }));
    };
    reader.readAsDataURL(file);
  };

  if (paymentSchedule.length === 0 && confirmedPayments.length === 0) return null;

  return (
    <div className="border rounded-lg p-2.5 bg-muted/30 space-y-2 mt-2" data-testid={`payment-schedule-${inv.id}`}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-muted-foreground">{t("جدول الدفعات", "Payment Schedule")}</p>
        <span className={`text-[11px] font-bold ${totalPaid >= totalAmount ? "text-green-600" : "text-amber-600"}`}>
          {totalPaid.toLocaleString()} / {totalAmount.toLocaleString()} {t("ريال", "SAR")}
        </span>
      </div>

      {paymentSchedule.length > 0 ? (
        <div className="space-y-2">
          {paymentSchedule.map((item: any, idx: number) => {
            const stagePayments = allContractPayments.filter((p: any) => p.paymentStage === (item.stage || "other"));
            const confirmedForStage = stagePayments.filter((p: any) => p.status === "confirmed");
            const pendingForStage = stagePayments.filter((p: any) => p.status === "pending");
            const stagePaid = confirmedForStage.reduce((s: number, p: any) => s + parseFloat(p.amount || 0), 0);
            const stageAmount = parseFloat(item.amount || 0);
            const isPaid = stagePaid >= stageAmount && stageAmount > 0;
            const hasPending = pendingForStage.length > 0;
            const canUpload = !isPaid && !hasPending;
            const stageKey = item.stage || `stage_${idx}`;
            const stageLabelsPortal: Record<string, { ar: string; en: string }> = {
              deposit: { ar: "عربون", en: "Deposit" },
              pre_manufacturing: { ar: "قبل التصنيع", en: "Pre-manufacturing" },
              delivery: { ar: "عند التوصيل", en: "Upon Delivery" },
              final: { ar: "الدفعة النهائية", en: "Final Payment" },
              other: { ar: "أخرى", en: "Other" },
            };

            return (
              <div
                key={idx}
                className={`rounded-lg border p-2.5 ${
                  isPaid ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800" :
                  hasPending ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800" :
                  "bg-background border-border"
                }`}
                data-testid={`schedule-stage-${inv.id}-${idx}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <p className="text-xs font-medium">{item.label || t(stageLabelsPortal[stageKey]?.ar || stageKey, stageLabelsPortal[stageKey]?.en || stageKey)}</p>
                    {item.dueDate && (
                      <p className="text-[10px] text-muted-foreground">
                        {t("استحقاق:", "Due:")} {new Date(item.dueDate).toLocaleDateString("ar-SA")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold">{stageAmount.toLocaleString()} {t("ريال", "SAR")}</span>
                    {isPaid ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                    ) : hasPending ? (
                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-muted-foreground/30" />
                    )}
                  </div>
                </div>

                {hasPending && (
                  <p className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">
                    {t("إيصالك قيد المراجعة", "Your receipt is being reviewed")}
                  </p>
                )}

                {isPaid && confirmedForStage.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between text-[10px] mt-1">
                    <span className="text-green-600 font-medium">{t("تم الدفع", "Paid")} {Number(p.amount).toLocaleString()} {t("ريال", "SAR")}</span>
                    <button
                      onClick={() => onReceiptClick(p)}
                      className="text-primary hover:underline"
                      data-testid={`button-receipt-stage-${inv.id}-${p.id}`}
                    >
                      {t("سند قبض", "Receipt")}
                    </button>
                  </div>
                ))}

                {canUpload && (
                  <div className="mt-2">
                    {stageReceiptImage[stageKey] ? (
                      <div className="space-y-1.5">
                        <div className="relative">
                          <img src={stageReceiptImage[stageKey]} alt="Receipt" className="w-full max-h-28 object-contain rounded border bg-white" />
                          <button
                            type="button"
                            onClick={() => setStageReceiptImage((prev) => { const n = { ...prev }; delete n[stageKey]; return n; })}
                            className="absolute top-0.5 end-0.5 bg-red-500 text-white rounded-full p-0.5"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                        <Button
                          size="sm"
                          className="w-full h-7 text-[10px] bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => uploadMutation.mutate({ stage: stageKey, imageData: stageReceiptImage[stageKey], amount: String(stageAmount) })}
                          disabled={uploadMutation.isPending}
                          data-testid={`button-upload-stage-${inv.id}-${idx}`}
                        >
                          {uploadMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin me-1" /> : <Upload className="w-3 h-3 me-1" />}
                          {t("إرسال الإيصال", "Submit Receipt")}
                        </Button>
                      </div>
                    ) : (
                      <label className="flex items-center gap-1.5 border border-dashed border-emerald-300 dark:border-emerald-700 rounded-md px-2 py-1.5 cursor-pointer hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-colors">
                        {stageUploading[stageKey] ? (
                          <Loader2 className="w-3 h-3 animate-spin text-emerald-500" />
                        ) : (
                          <Upload className="w-3 h-3 text-emerald-500" />
                        )}
                        <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">
                          {t("رفع إيصال الدفع", "Upload Receipt")}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileForStage(stageKey, f); }}
                          data-testid={`input-stage-receipt-${inv.id}-${idx}`}
                        />
                      </label>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : confirmedPayments.length > 0 ? (
        <div className="space-y-1.5">
          {confirmedPayments.map((p: any) => (
            <div key={p.id} className="flex items-center justify-between text-xs bg-green-50 dark:bg-green-950/20 rounded-md px-2.5 py-1.5 border border-green-200 dark:border-green-800" data-testid={`confirmed-payment-${p.id}`}>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3 text-green-600" />
                <span className="font-medium">{Number(p.amount).toLocaleString()} {t("ريال", "SAR")}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">{new Date(p.createdAt).toLocaleDateString("ar-SA")}</span>
                <button
                  onClick={() => onReceiptClick(p)}
                  className="text-primary hover:underline text-[10px]"
                  data-testid={`button-receipt-portal-${p.id}`}
                >
                  {t("سند قبض", "Receipt")}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function InvoicesTab({ invoices, contracts, payments, customerName }: { invoices: any[]; contracts: any[]; payments: any[]; customerName?: string }) {
  const { t } = useLanguage();
  const [previewInvoice, setPreviewInvoice] = useState<any | null>(null);
  const [receiptPayment, setReceiptPayment] = useState<any | null>(null);
  const [receiptContract, setReceiptContract] = useState<any | null>(null);

  if (!invoices.length) return <EmptyState icon={Receipt} titleAr="لا توجد فواتير" titleEn="No invoices yet" />;

  const sorted = [...invoices].sort((a, b) => new Date(b.issuedAt || b.createdAt || 0).getTime() - new Date(a.issuedAt || a.createdAt || 0).getTime());

  return (
    <>
      <div className="space-y-3">
        {sorted.map((inv: any) => {
          const isTaxInvoice = inv.type === "simplified_tax_invoice";
          const contract = contracts.find((c: any) => c.id === inv.contractId);
          const contractPayments = contract ? payments.filter((p: any) => p.contractId === contract.id && p.status === "confirmed") : [];
          const paymentSchedule = contract?.paymentSchedule || [];
          const totalPaid = contractPayments.reduce((s: number, p: any) => s + parseFloat(p.amount || 0), 0);
          const totalAmount = parseFloat(inv.totalWithVat || 0);

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

                  <PaymentScheduleSection
                    inv={inv}
                    contract={contract}
                    payments={payments}
                    totalPaid={totalPaid}
                    totalAmount={totalAmount}
                    onReceiptClick={(p) => { setReceiptPayment(p); setReceiptContract(contract); }}
                  />
                </div>

                <div className="px-4 pb-3 space-y-2">
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

      {receiptPayment && (
        <PaymentReceiptModal
          data={{
            receiptNumber: `RCP-${String(receiptPayment.id).padStart(5, "0")}`,
            customerName: customerName || "",
            amount: receiptPayment.amount,
            paymentMethod: receiptPayment.method,
            bankReference: receiptPayment.bankReference || "",
            paymentStage: receiptPayment.paymentStage,
            contractNumber: receiptContract?.contractNumber || "",
            date: receiptPayment.confirmedAt || receiptPayment.createdAt,
            notes: receiptPayment.notes || "",
          }}
          onClose={() => { setReceiptPayment(null); setReceiptContract(null); }}
        />
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
      <PortalHeader
        customerName={customerName || data.customer?.fullName || ""}
        customer={data.customer}
        orderCount={data.quotations?.length || 0}
      />

      <TabBar active={activeTab} onChange={setActiveTab} counts={counts} />

      <main className="max-w-2xl md:max-w-4xl lg:max-w-5xl mx-auto px-4 py-4 pb-20">
        {activeTab === "orders" && (
          <OrdersTab
            quotations={data.quotations || []}
            contracts={data.contracts || []}
            production={data.production || []}
            designs={data.designs || []}
            customerName={data.customer?.fullName}
          />
        )}
        {activeTab === "quotes" && (
          <QuotationsTab
            quotations={data.quotations || []}
            designs={data.designs || []}
            invoices={data.invoices || []}
            contracts={data.contracts || []}
            payments={data.payments || []}
            onApprove={(id) => approveMutation.mutate(id)}
            approving={approveMutation.isPending}
          />
        )}
        {activeTab === "invoices" && <InvoicesTab invoices={data.invoices || []} contracts={data.contracts || []} payments={data.payments || []} customerName={data.customer?.fullName} />}
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
