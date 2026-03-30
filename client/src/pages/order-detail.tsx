import type { ReactNode } from "react";
import { useState, useRef } from "react";
import { ORDER_STAGE_VALUES } from "@shared/schema";
import type { Quotation, Customer, Contract, Payment, WorkOrder, Appointment, SiteSurvey, User as SchemaUser } from "@shared/schema";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, ArrowRight, ArrowLeft, User, Phone, MapPin, Calendar,
  Clock, FileText, Package, Truck, CheckCircle2, Ban, AlertCircle,
  CalendarCheck, CalendarX, Ruler, Box, ChevronLeft, ChevronRight,
  ClipboardList, Banknote, Home, Zap, ThumbsDown, type LucideIcon,
  Paperclip, Download, Eye, Upload, Palette, X, MessageSquare, CreditCard, ReceiptText,
  Building2, Navigation,
} from "lucide-react";

type PipelineStage = "new" | "appointment_scheduled" | "survey_done" | "quote_draft" | "quote_sent" | "quote_approved" | "in_production" | "delivered" | "rejected" | "cancelled";

interface QuotationItem {
  description?: string;
  productType?: string;
  quantity?: number;
  unitPrice?: number;
}

const PIPELINE_STAGES: { key: PipelineStage; ar: string; en: string; color: string; icon: LucideIcon }[] = [
  { key: "new", ar: "جديد", en: "New", color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300", icon: Zap },
  { key: "appointment_scheduled", ar: "موعد مجدول", en: "Appointment", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300", icon: CalendarCheck },
  { key: "survey_done", ar: "مسح مكتمل", en: "Survey Done", color: "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300", icon: Ruler },
  { key: "quote_draft", ar: "مسودة عرض", en: "Draft Quote", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", icon: FileText },
  { key: "quote_sent", ar: "عرض مُرسل", en: "Quote Sent", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300", icon: FileText },
  { key: "quote_approved", ar: "عرض معتمد", en: "Approved", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300", icon: CheckCircle2 },
  { key: "in_production", ar: "في التصنيع", en: "In Production", color: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300", icon: Package },
  { key: "delivered", ar: "تم التسليم", en: "Delivered", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300", icon: Truck },
  { key: "rejected", ar: "مرفوض/منتهٍ", en: "Rejected/Expired", color: "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300", icon: ThumbsDown },
  { key: "cancelled", ar: "ملغى", en: "Cancelled", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300", icon: Ban },
];

function getOrderStage(
  q: Quotation,
  workOrdersAll: WorkOrder[],
  contractsAll: Contract[],
  siteSurveysAll: SiteSurvey[],
  apptByQuotation: Record<number, Appointment>
): PipelineStage {
  if (q.orderStage && (ORDER_STAGE_VALUES as readonly string[]).includes(q.orderStage)) return q.orderStage as PipelineStage;
  if (q.status === "cancelled") return "cancelled";
  if (q.status === "rejected" || q.status === "expired") return "rejected";
  if (q.status === "approved") {
    const contract = contractsAll.find(c => c.quotationId === q.id);
    if (contract) {
      const wo = workOrdersAll.find(w => w.contractId === contract.id);
      if (wo) {
        if (["completed", "delivered", "installed"].includes(wo.status ?? "")) return "delivered";
        return "in_production";
      }
    }
    return "quote_approved";
  }
  if (q.status === "sent") return "quote_sent";
  if (q.status === "draft" || q.status === "open") return "quote_draft";
  const hasSurvey = siteSurveysAll.some(s => s.quotationId === q.id);
  const appt = apptByQuotation[q.id];
  if (hasSurvey || appt?.status === "attended") return "survey_done";
  if (appt) return "appointment_scheduled";
  return "new";
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Icon className="w-4 h-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">{children}</CardContent>
    </Card>
  );
}

function InfoRow({ label, value, dir }: { label: string; value: ReactNode; dir?: "ltr" | "rtl" }) {
  return (
    <div className="flex items-start justify-between gap-2 py-1.5 border-b last:border-0">
      <span className="text-xs text-muted-foreground flex-shrink-0">{label}</span>
      <span className="text-xs font-medium text-end" dir={dir}>{value || "—"}</span>
    </div>
  );
}

const PIPELINE_STEP_KEYS: PipelineStage[] = ["new", "appointment_scheduled", "survey_done", "quote_draft", "quote_sent", "quote_approved", "in_production", "delivered"];

export default function OrderDetailPage() {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [, params] = useRoute("/orders/:id");
  const orderId = parseInt(params?.id || "0");

  const { data: quotation, isLoading } = useQuery<Quotation>({
    queryKey: ["/api/quotations", orderId],
    queryFn: async () => {
      const res = await fetch(`/api/quotations/${orderId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!orderId,
  });
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: usersData = [] } = useQuery<SchemaUser[]>({ queryKey: ["/api/users"] });
  const { data: workOrders = [] } = useQuery<WorkOrder[]>({ queryKey: ["/api/work-orders"] });
  const { data: contracts = [] } = useQuery<Contract[]>({ queryKey: ["/api/contracts"] });
  const { data: appointments = [] } = useQuery<Appointment[]>({ queryKey: ["/api/appointments"] });
  const { data: siteSurveys = [] } = useQuery<SiteSurvey[]>({ queryKey: ["/api/site-surveys"] });
  const linkedContractId = contracts.find(c => c.quotationId === orderId)?.id ?? null;
  const { data: orderPayments = [] } = useQuery<Payment[]>({
    queryKey: ["/api/contracts", linkedContractId, "payments"],
    enabled: !!linkedContractId,
  });

  const linkedSurveysTemp = (siteSurveys as SiteSurvey[]).filter(s => {
    const apptByQ: Record<number, Appointment> = {};
    for (const appt of appointments) {
      if (!appt.quotationId) continue;
      if (!apptByQ[appt.quotationId]) apptByQ[appt.quotationId] = appt;
    }
    const la = apptByQ[orderId] || null;
    return s.quotationId === orderId || (la && s.appointmentId === la.id);
  });
  const firstSurveyId = linkedSurveysTemp[0]?.id;

  const { data: surveyDesignFiles = [] } = useQuery<{
    id: number; file_name: string; file_label: string; file_url: string;
    mime_type: string; file_size: number; attach_to_quote: boolean; created_at: string;
  }[]>({
    queryKey: ["/api/site-surveys", firstSurveyId, "design-files"],
    queryFn: async () => {
      const res = await fetch(`/api/site-surveys/${firstSurveyId}/design-files`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!firstSurveyId,
  });

  interface BuildingVisit {
    id: number; rep_id: number; lat: string; lng: string;
    address: string | null; city: string | null; district: string | null;
    building_status: "interested" | "under_construction" | "not_suitable" | "follow_up";
    notes: string | null; quotation_id: number | null; visited_at: string;
  }

  const { toast } = useToast();
  const isManager = user && ["owner", "assistant", "it"].includes(user.role);
  const isDesigner = user?.role === "designer" || user?.role === "it";
  const isSalesRep = user?.role === "sales";

  const { data: allVisits = [] } = useQuery<BuildingVisit[]>({
    queryKey: ["/api/map/visits"],
    enabled: !!user && (isSalesRep || !!isManager),
  });

  const linkedVisits = allVisits.filter(v => v.quotation_id === orderId);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadLabel, setUploadLabel] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const uploadDesignMutation = useMutation({
    mutationFn: async ({ file, label }: { file: File; label: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      if (label) formData.append("fileLabel", label);
      const res = await fetch(`/api/site-surveys/${firstSurveyId}/design-files`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/site-surveys", firstSurveyId, "design-files"] });
      setSelectedFile(null);
      setUploadLabel("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast({ title: t("تم رفع الملف بنجاح", "File uploaded successfully"), variant: "default" });
    },
    onError: () => {
      toast({ title: t("فشل رفع الملف", "Upload failed"), variant: "destructive" });
    },
  });

  const [modifyDialog, setModifyDialog] = useState(false);
  const [approveDialog, setApproveDialog] = useState(false);
  const [modifyNotes, setModifyNotes] = useState("");
  const [receiptAmount, setReceiptAmount] = useState("");
  const [receiptMethod, setReceiptMethod] = useState("bank_transfer");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const receiptFileRef = useRef<HTMLInputElement>(null);

  const requestModificationsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/quotations/${orderId}`, {
        notes: `[تعديلات مطلوبة]: ${modifyNotes}`,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations", orderId] });
      setModifyDialog(false);
      setModifyNotes("");
      toast({ title: t("تم إرسال طلب التعديلات للمصمم", "Modification request sent to designer") });
    },
    onError: () => { toast({ title: t("حدث خطأ", "Error occurred"), variant: "destructive" }); },
  });

  const approveWithReceiptMutation = useMutation({
    mutationFn: async ({ base64, name }: { base64: string; name: string }) => {
      const res = await apiRequest("POST", `/api/quotations/${orderId}/approve`, {
        paymentReceiptData: base64,
        paymentReceiptName: name,
        paymentAmount: receiptAmount,
        paymentMethod: receiptMethod,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations", orderId] });
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      setApproveDialog(false);
      setReceiptFile(null);
      setReceiptAmount("");
      if (receiptFileRef.current) receiptFileRef.current.value = "";
      toast({ title: t("تم رفع الإيصال واعتماد الطلب بنجاح", "Receipt uploaded and order approved") });
    },
    onError: () => { toast({ title: t("حدث خطأ في الاعتماد", "Approval error"), variant: "destructive" }); },
  });

  const confirmPaymentMutation = useMutation({
    mutationFn: async (paymentId: number) => {
      const res = await apiRequest("PATCH", `/api/payments/${paymentId}/confirm`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", linkedContractId, "payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      toast({ title: t("تم تأكيد الدفعة وإرسال الطلب للإنتاج", "Payment confirmed and order sent to production") });
    },
    onError: () => { toast({ title: t("حدث خطأ في تأكيد الدفعة", "Payment confirmation error"), variant: "destructive" }); },
  });

  const notifyRepMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/quotations/${orderId}/designer-notify`, {
        notes: `[التصميم جاهز]: تم رفع ${surveyDesignFiles.length} ملف — يرجى مراجعة التصاميم والتواصل مع العميل`,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations", orderId] });
      toast({ title: t("تم إشعار المندوب بجاهزية التصميم", "Sales rep notified — design is ready") });
    },
    onError: () => { toast({ title: t("حدث خطأ", "Error occurred"), variant: "destructive" }); },
  });

  function handleApproveWithReceipt() {
    if (!receiptFile) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      approveWithReceiptMutation.mutate({ base64, name: receiptFile.name });
    };
    reader.readAsDataURL(receiptFile);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!quotation) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertCircle className="w-12 h-12 text-muted-foreground/30" />
        <p className="text-muted-foreground text-sm">{t("الطلب غير موجود", "Order not found")}</p>
        <Button variant="outline" size="sm" onClick={() => navigate("/my-orders")}>
          {t("العودة للطلبات", "Back to Orders")}
        </Button>
      </div>
    );
  }

  const customer = customers.find(c => c.id === quotation.customerId);
  const assignedUser = quotation.assignedTo ? usersData.find(u => u.id === quotation.assignedTo) : null;

  const apptByQuotation: Record<number, Appointment> = {};
  for (const appt of appointments) {
    if (!appt.quotationId) continue;
    const existing = apptByQuotation[appt.quotationId];
    if (!existing) {
      apptByQuotation[appt.quotationId] = appt;
    } else {
      const d1 = new Date(`${appt.appointmentDate}T${appt.startTime || "00:00"}`).getTime();
      const d2 = new Date(`${existing.appointmentDate}T${existing.startTime || "00:00"}`).getTime();
      if (d1 > d2) apptByQuotation[appt.quotationId] = appt;
    }
  }

  const stage = getOrderStage(quotation, workOrders, contracts, siteSurveys, apptByQuotation);
  const stageCfg = PIPELINE_STAGES.find(s => s.key === stage) || PIPELINE_STAGES[0];
  const StageIcon = stageCfg.icon;

  const linkedAppt = apptByQuotation[quotation.id] || null;
  const linkedSurveys = siteSurveys.filter(s => s.quotationId === quotation.id || (linkedAppt && s.appointmentId === linkedAppt.id));
  const linkedContract = contracts.find(c => c.quotationId === quotation.id);
  const linkedWorkOrder = linkedContract ? workOrders.find(w => w.contractId === linkedContract.id) : null;

  const allOrderAppts = appointments.filter(a => a.quotationId === quotation.id)
    .sort((a, b) => new Date(`${a.appointmentDate}T${a.startTime || "00:00"}`).getTime() - new Date(`${b.appointmentDate}T${b.startTime || "00:00"}`).getTime());

  function formatDate(d: string | null | undefined) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US", { year: "numeric", month: "long", day: "numeric" });
  }
  function formatDateTime(d: string | null | undefined) {
    if (!d) return "—";
    return new Date(d).toLocaleString(lang === "ar" ? "ar-SA" : "en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  function formatMoney(n: number | string | null | undefined) {
    return Number(n || 0).toLocaleString() + " " + t("ر.س", "SAR");
  }

  const currentStepIndex = PIPELINE_STEP_KEYS.indexOf(stage);

  return (
    <>
    <div className="space-y-4 max-w-2xl mx-auto" data-testid="page-order-detail">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="h-8 px-2 gap-1" onClick={() => navigate("/my-orders")} data-testid="button-back-to-orders">
          {lang === "ar" ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          {t("الطلبات", "Orders")}
        </Button>
        <Separator orientation="vertical" className="h-4" />
        <span className="text-sm text-muted-foreground">
          {t("الطلب", "Order")} #{quotation.quotationNumber || quotation.id}
        </span>
      </div>

      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" data-testid="text-order-detail-title">
            {customer?.fullName || t("عميل غير معروف", "Unknown Customer")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("طلب", "Order")} #{quotation.quotationNumber || quotation.id} · {formatDate(quotation.createdAt)}
          </p>
        </div>
        <Badge variant="secondary" className={`text-sm px-3 py-1 gap-1.5 inline-flex items-center ${stageCfg.color}`} data-testid="badge-order-stage">
          <StageIcon className="w-4 h-4" />
          {t(stageCfg.ar, stageCfg.en)}
        </Badge>
      </div>

      {stage !== "cancelled" && stage !== "delivered" && stage !== "rejected" && (
        <Card className="overflow-hidden">
          <CardContent className="p-3">
            <div className="flex items-center gap-0">
              {PIPELINE_STEP_KEYS.map((key, index) => {
                const cfg = PIPELINE_STAGES.find(s => s.key === key)!;
                const Ico = cfg.icon;
                const isDone = index < currentStepIndex;
                const isCurrent = index === currentStepIndex;
                const isLast = index === PIPELINE_STEP_KEYS.length - 1;
                return (
                  <div key={key} className="flex items-center flex-1 min-w-0">
                    <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${isDone ? "bg-green-500 text-white" : isCurrent ? "bg-primary text-primary-foreground ring-2 ring-primary/30" : "bg-muted text-muted-foreground/40"}`}>
                        {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Ico className="w-3.5 h-3.5" />}
                      </div>
                      <span className={`text-[9px] text-center leading-tight max-w-[54px] ${isCurrent ? "font-bold text-primary" : "text-transparent select-none"}`}>
                        {t(cfg.ar, cfg.en)}
                      </span>
                    </div>
                    {!isLast && (
                      <div className={`h-0.5 flex-1 mx-0.5 rounded-full ${isDone ? "bg-green-400" : "bg-muted"}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {stage === "cancelled" && (
        <Card className="border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <Ban className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-700 dark:text-red-400">{t("تم إلغاء الطلب", "Order Cancelled")}</p>
                {quotation.cancellationReason && <p className="text-sm mt-0.5">{quotation.cancellationReason}</p>}
                {quotation.cancelledAt && <p className="text-xs text-muted-foreground mt-1">{formatDateTime(quotation.cancelledAt)}</p>}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {stage === "rejected" && (
        <Card className="border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <ThumbsDown className="w-4 h-4 text-rose-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-rose-700 dark:text-rose-400">
                  {quotation.status === "expired" ? t("انتهت صلاحية العرض", "Quotation Expired") : t("تم رفض العرض", "Quotation Rejected")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <SectionCard title={t("بيانات العميل", "Customer Information")} icon={User}>
        <InfoRow label={t("الاسم", "Name")} value={customer?.fullName} />
        <InfoRow label={t("الجوال", "Phone")} value={customer?.phone} dir="ltr" />
        {(customer?.phone2) && <InfoRow label={t("هاتف 2", "Phone 2")} value={customer.phone2} dir="ltr" />}
        <InfoRow label={t("المدينة", "City")} value={quotation.city || customer?.city} />
        {customer?.address && <InfoRow label={t("العنوان", "Address")} value={customer.address} />}
        {assignedUser && (
          <InfoRow
            label={t("المندوب", "Sales Rep")}
            value={lang === "ar" ? assignedUser.fullNameAr : assignedUser.fullNameEn}
          />
        )}
      </SectionCard>

      <SectionCard title={t("عرض السعر", "Quotation")} icon={FileText}>
        <InfoRow label={t("رقم العرض", "Quote #")} value={quotation.quotationNumber || String(quotation.id)} />
        <InfoRow label={t("الحالة", "Status")} value={t(stageCfg.ar, stageCfg.en)} />
        <InfoRow label={t("المبلغ قبل الضريبة", "Amount (ex. VAT)")} value={formatMoney(quotation.totalPrice)} />
        {Number(quotation.discount || 0) > 0 && <InfoRow label={t("الخصم", "Discount")} value={formatMoney(quotation.discount)} />}
        <InfoRow label={t("ضريبة القيمة المضافة", "VAT (15%)")} value={formatMoney(Number(quotation.vatAmount || 0))} />
        <InfoRow label={t("الإجمالي شامل الضريبة", "Total incl. VAT")} value={<span className="font-bold text-primary">{formatMoney(quotation.finalPrice || quotation.totalPrice)}</span>} />
        {quotation.notes && (
          <div className="mt-2 pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-1">{t("ملاحظات", "Notes")}</p>
            <p className="text-xs">{quotation.notes}</p>
          </div>
        )}
        {quotation.items && quotation.items.length > 0 && (
          <div className="mt-2 pt-2 border-t">
            <p className="text-xs font-medium mb-2">{t("البنود", "Line Items")}</p>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-start px-2.5 py-1.5 font-medium">{t("الوصف", "Description")}</th>
                    <th className="text-center px-2.5 py-1.5 font-medium w-12">{t("كمية", "Qty")}</th>
                    <th className="text-end px-2.5 py-1.5 font-medium">{t("السعر", "Price")}</th>
                    <th className="text-end px-2.5 py-1.5 font-medium">{t("الإجمالي", "Total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(quotation.items as QuotationItem[]).map((item, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="px-2.5 py-1.5 max-w-[150px] truncate">{item.description || item.productType || "—"}</td>
                      <td className="px-2.5 py-1.5 text-center">{item.quantity || 1}</td>
                      <td className="px-2.5 py-1.5 text-end">{Number(item.unitPrice || 0).toLocaleString()}</td>
                      <td className="px-2.5 py-1.5 text-end font-medium">{Number((item.unitPrice || 0) * (item.quantity || 1)).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </SectionCard>

      {allOrderAppts.length > 0 && (
        <SectionCard title={t("المواعيد", "Appointments")} icon={Calendar}>
          <div className="space-y-3">
            {allOrderAppts.map((appt, idx) => {
              const isPast = new Date(`${appt.appointmentDate}T${appt.endTime || appt.startTime || "23:59"}`) < new Date();
              const isLatest = idx === allOrderAppts.length - 1;
              return (
                <div key={appt.id} className={`rounded-lg p-3 border text-xs space-y-1 ${
                  isLatest && !isPast ? "bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900" :
                  isPast ? "bg-muted/30 border-muted opacity-70" :
                  "bg-muted/30 border-muted"
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{appt.title || t("موعد", "Appointment")}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {appt.status === "scheduled" && !isPast ? t("مجدول", "Scheduled") :
                       appt.status === "attended" ? t("حضر", "Attended") :
                       appt.status === "rescheduled" ? t("أُعيد جدولته", "Rescheduled") :
                       appt.status === "cancelled" ? t("ملغى", "Cancelled") :
                       appt.status === "expired" ? t("منتهٍ", "Expired") :
                       isPast ? t("منتهٍ", "Expired") : t("مجدول", "Scheduled")}
                    </Badge>
                  </div>
                  <p className="flex items-center gap-1 text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    {formatDate(appt.appointmentDate)}
                  </p>
                  <p className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {appt.startTime?.slice(0, 5)} — {appt.endTime?.slice(0, 5)}
                  </p>
                  {appt.notes && <p className="text-muted-foreground border-t pt-1 mt-1">{appt.notes}</p>}
                  {appt.failNotes && <p className="text-amber-600 dark:text-amber-400 border-t pt-1 mt-1">{t("ملاحظة الفشل:", "Fail note:")} {appt.failNotes}</p>}
                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="outline" size="sm"
                      className="h-6 text-[10px] px-2 text-violet-600 border-violet-300 dark:border-violet-800"
                      onClick={() => navigate(`/site-survey/${appt.id}?returnTo=/orders/${orderId}`)}
                      data-testid={`button-detail-survey-${appt.id}`}
                    >
                      <Ruler className="w-3 h-3 me-1" />{t("المسح الميداني", "Site Survey")}
                    </Button>
                    {appt.status === "attended" && (
                      <Button
                        variant="outline" size="sm"
                        className="h-6 text-[10px] px-2 text-indigo-600 border-indigo-300 dark:border-indigo-800"
                        onClick={() => navigate(`/scene-3d?appointmentId=${appt.id}`)}
                        data-testid={`button-detail-3d-${appt.id}`}
                      >
                        <Box className="w-3 h-3 me-1" />{t("ثلاثي الأبعاد", "3D View")}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {linkedSurveys.length > 0 && (
        <SectionCard title={t("المسوحات الميدانية", "Site Surveys")} icon={Ruler}>
          <div className="space-y-3">
            {linkedSurveys.map((survey) => {
              const spaces: { id: string; name: string; length: string; width: string; height: string; walls?: { id: string; name: string; length: string }[] }[] =
                Array.isArray((survey as any).spaces) ? (survey as any).spaces : [];
              return (
                <div key={survey.id} className="rounded-lg border bg-violet-50/50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-900 text-xs overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-violet-200 dark:border-violet-800">
                    <span className="font-semibold">{survey.projectType || t("مسح ميداني", "Site Survey")} #{survey.id}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-violet-700 border-violet-300">{t("مكتمل", "Complete")}</Badge>
                  </div>
                  <div className="px-3 py-2 space-y-1">
                    {survey.city && <p className="flex items-center gap-1 text-muted-foreground"><MapPin className="w-3 h-3" />{survey.city}</p>}
                    {survey.totalArea && <InfoRow label={t("المساحة الكلية", "Total Area")} value={`${survey.totalArea} م²`} />}
                    {survey.roomsCount && <InfoRow label={t("عدد الغرف", "Rooms")} value={String(survey.roomsCount)} />}
                    {survey.notes && <p className="text-muted-foreground border-t pt-1 mt-1">{survey.notes}</p>}

                    {spaces.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-violet-200 dark:border-violet-800">
                        <p className="font-semibold text-violet-700 dark:text-violet-400 mb-1.5">{t("المساحات والمقاسات", "Spaces & Dimensions")}</p>
                        <div className="space-y-1.5">
                          {spaces.map((sp) => {
                            const spaceWalls = Array.isArray(sp.walls) ? sp.walls : [];
                            return (
                              <div key={sp.id} className="rounded border border-violet-200 dark:border-violet-700 bg-white/60 dark:bg-violet-950/30 p-2">
                                <p className="font-medium text-foreground mb-1">{sp.name}</p>
                                {(sp.length || sp.width || sp.height) ? (
                                  <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                                    {sp.length && <span>{t("ط", "L")}: <strong className="text-foreground">{sp.length}م</strong></span>}
                                    {sp.width && <span>{t("ع", "W")}: <strong className="text-foreground">{sp.width}م</strong></span>}
                                    {sp.height && <span>{t("ار", "H")}: <strong className="text-foreground">{sp.height}م</strong></span>}
                                  </div>
                                ) : (
                                  <p className="text-[10px] text-amber-600 dark:text-amber-400 italic">{t("لم تُدخل أبعاد المكان بعد", "Room dimensions not entered yet")}</p>
                                )}
                                {spaceWalls.length > 0 && (
                                  <div className="mt-1 pt-1 border-t border-violet-100 dark:border-violet-800">
                                    <p className="text-[10px] text-muted-foreground mb-0.5">{t("الجدران", "Walls")}:</p>
                                    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                                      {spaceWalls.map(w => (
                                        <span key={w.id} className="text-[10px]">
                                          <span className="text-muted-foreground">{w.name}</span>
                                          {w.length
                                            ? <strong className="text-foreground ms-1">{w.length}م</strong>
                                            : <span className="text-muted-foreground/50 ms-1">—</span>
                                          }
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="px-3 pb-2">
                    <Button
                      variant="outline" size="sm"
                      className="h-6 text-[10px] px-2 w-full border-violet-300 text-violet-700 hover:bg-violet-50"
                      onClick={() => navigate(`/site-survey/${survey.appointmentId || linkedAppt?.id}?returnTo=/orders/${orderId}`)}
                      data-testid={`button-detail-open-survey-${survey.id}`}
                    >
                      <Ruler className="w-3 h-3 me-1" />
                      {t("فتح نموذج المسح الميداني", "Open Survey Form")}
                    </Button>
                  </div>
                </div>
              );
            })}

            {surveyDesignFiles.length > 0 && (
              <div className="rounded-lg border bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900 overflow-hidden">
                <div className="flex items-center gap-1.5 px-3 py-2 border-b border-amber-200 dark:border-amber-800">
                  <Paperclip className="w-3.5 h-3.5 text-amber-600" />
                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">{t("المخططات والملفات المرفقة", "Attached Plans & Files")}</span>
                  <Badge className="ms-auto text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 border-amber-300 border">
                    {surveyDesignFiles.length}
                  </Badge>
                </div>
                <div className="px-3 py-2 space-y-1.5">
                  {surveyDesignFiles.map((file) => {
                    const filename = file.file_url ? file.file_url.split("/").pop() : (file.file_name || file.file_label || "");
                    const sizeKb = Math.round(file.file_size / 1024);
                    return (
                      <div key={file.id} className="flex items-center gap-2 rounded border border-amber-200 dark:border-amber-700 bg-white/60 dark:bg-amber-950/30 p-2 text-xs">
                        <FileText className="w-4 h-4 text-amber-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">{file.file_label || file.file_name}</p>
                          <p className="text-muted-foreground">{sizeKb > 0 ? `${sizeKb} KB` : ""}{file.attach_to_quote ? ` · ${t("مرفق بالعرض", "Attached to Quote")}` : ""}</p>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <Button
                            variant="outline" size="icon"
                            className="h-6 w-6 border-amber-300 hover:bg-amber-50"
                            title={t("فتح", "View")}
                            data-testid={`button-view-design-file-${file.id}`}
                            onClick={() => window.open(`/api/uploads/survey-files/${filename}`, "_blank")}
                          >
                            <Eye className="w-3 h-3 text-amber-600" />
                          </Button>
                          <Button
                            variant="outline" size="icon"
                            className="h-6 w-6 border-amber-300 hover:bg-amber-50"
                            title={t("تحميل", "Download")}
                            data-testid={`button-download-design-file-${file.id}`}
                            onClick={() => {
                              const a = document.createElement("a");
                              a.href = `/api/uploads/survey-files/${filename}`;
                              a.download = file.file_name;
                              a.click();
                            }}
                          >
                            <Download className="w-3 h-3 text-amber-600" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {firstSurveyId && surveyDesignFiles.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-1">
                {t("لا توجد مخططات مرفقة بهذه الزيارة", "No design files attached to this survey")}
              </p>
            )}
          </div>
        </SectionCard>
      )}

      {isDesigner && stage === "survey_done" && firstSurveyId && (
        <SectionCard title={t("رفع ملفات التصميم", "Upload Design Files")} icon={Palette}>
          <div className="space-y-3">
            {quotation?.notes?.includes("[تعديلات مطلوبة]") && (
              <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20 px-3 py-2 flex items-start gap-2">
                <MessageSquare className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                    {t("تعديلات مطلوبة من المندوب", "Modifications Requested by Sales Rep")}
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5 whitespace-pre-wrap">
                    {quotation.notes.replace("[تعديلات مطلوبة]: ", "")}
                  </p>
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {t("ارفع ملفات التصميم والمخططات لمراجعة المندوب والعميل", "Upload design files and plans for the rep and customer to review")}
            </p>
            {surveyDesignFiles.length > 0 && (
              <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20 px-3 py-2 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                <p className="text-xs text-green-700 dark:text-green-400">
                  {t(`تم رفع ${surveyDesignFiles.length} ملف`, `${surveyDesignFiles.length} file(s) uploaded`)}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-xs">{t("تسمية الملف (اختياري)", "File label (optional)")}</Label>
              <Input
                value={uploadLabel}
                onChange={(e) => setUploadLabel(e.target.value)}
                placeholder={t("مثال: مخطط المطبخ الرئيسي", "e.g. Main kitchen plan")}
                className="h-9 text-sm"
                data-testid="input-design-file-label"
              />
            </div>
            {selectedFile && (
              <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-xs">
                <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="flex-1 truncate font-medium">{selectedFile.name}</span>
                <span className="text-muted-foreground shrink-0">{Math.round(selectedFile.size / 1024)} KB</span>
                <Button
                  variant="ghost" size="icon"
                  className="h-5 w-5 shrink-0"
                  onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                  data-testid="button-clear-selected-file"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,application/pdf,.dwg,.dxf,.skp"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              data-testid="input-design-file-upload"
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-choose-design-file"
              >
                <Paperclip className="w-4 h-4 me-1" />
                {t("اختيار ملف", "Choose File")}
              </Button>
              <Button
                className="flex-1"
                disabled={!selectedFile || uploadDesignMutation.isPending}
                onClick={() => selectedFile && uploadDesignMutation.mutate({ file: selectedFile, label: uploadLabel })}
                data-testid="button-upload-design-file"
              >
                {uploadDesignMutation.isPending
                  ? <Loader2 className="w-4 h-4 me-1 animate-spin" />
                  : <Upload className="w-4 h-4 me-1" />}
                {t("رفع الملف", "Upload")}
              </Button>
            </div>
            {surveyDesignFiles.length > 0 && (
              <Button
                variant="outline"
                className="w-full h-9 text-xs border-violet-300 text-violet-700 dark:border-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30"
                onClick={() => notifyRepMutation.mutate()}
                disabled={notifyRepMutation.isPending}
                data-testid="button-notify-sales-rep"
              >
                {notifyRepMutation.isPending
                  ? <Loader2 className="w-3.5 h-3.5 me-1 animate-spin" />
                  : <CheckCircle2 className="w-3.5 h-3.5 me-1" />}
                {t("إرسال للمندوب — التصميم جاهز للمراجعة", "Notify Rep — Design Ready for Review")}
              </Button>
            )}
          </div>
        </SectionCard>
      )}

      {isSalesRep && stage === "survey_done" && (
        <Card className={`border-2 ${surveyDesignFiles.length > 0 ? "border-green-300 dark:border-green-700 bg-green-50/30 dark:bg-green-950/20" : "border-violet-200 dark:border-violet-800 bg-violet-50/30 dark:bg-violet-950/20"}`} data-testid="card-design-status">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              {surveyDesignFiles.length > 0 ? (
                <>
                  <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-green-800 dark:text-green-300 text-sm">
                      {t("التصميم جاهز للمراجعة", "Design Ready for Review")}
                    </h3>
                    <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                      {t(`رفع المصمم ${surveyDesignFiles.length} ملف — راجع المرفقات أعلاه وأبلغ العميل`, `Designer uploaded ${surveyDesignFiles.length} file(s) — review attachments above and notify the customer`)}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <Clock className="w-6 h-6 text-violet-500 shrink-0 mt-0.5 animate-pulse" />
                  <div>
                    <h3 className="font-semibold text-violet-700 dark:text-violet-400 text-sm">
                      {t("في انتظار التصميم", "Awaiting Design")}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("تم رفع المقاسات بنجاح — سيقوم المصمم بمراجعتها وإرسال التصميم قريباً", "Measurements uploaded — the designer will review them and send the design soon")}
                    </p>
                  </div>
                </>
              )}
            </div>
            {surveyDesignFiles.length > 0 && (
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-green-200 dark:border-green-800">
                <Button
                  variant="outline"
                  className="text-xs h-9 border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                  onClick={() => setModifyDialog(true)}
                  data-testid="button-request-modifications"
                >
                  <MessageSquare className="w-3.5 h-3.5 me-1" />
                  {t("طلب تعديلات", "Request Changes")}
                </Button>
                <Button
                  className="text-xs h-9 bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => setApproveDialog(true)}
                  data-testid="button-approve-design-upload-receipt"
                >
                  <ReceiptText className="w-3.5 h-3.5 me-1" />
                  {t("وافق العميل - رفع إيصال", "Client Approved - Upload Receipt")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {linkedWorkOrder && (
        <SectionCard title={t("أمر العمل", "Work Order")} icon={Package}>
          <InfoRow label={t("رقم الأمر", "Order #")} value={`WO-${String(linkedWorkOrder.id).padStart(4, "0")}`} />
          <InfoRow
            label={t("الحالة", "Status")}
            value={
              <Badge variant="secondary" className="text-[10px] px-2">
                {linkedWorkOrder.status === "pending" ? t("معلق", "Pending") :
                 linkedWorkOrder.status === "in_progress" ? t("قيد التنفيذ", "In Progress") :
                 linkedWorkOrder.status === "completed" ? t("مكتمل", "Completed") :
                 linkedWorkOrder.status === "delivered" ? t("تم التسليم", "Delivered") :
                 linkedWorkOrder.status}
              </Badge>
            }
          />
          {linkedWorkOrder.startDate && <InfoRow label={t("تاريخ البدء", "Start Date")} value={formatDate(linkedWorkOrder.startDate)} />}
          {linkedWorkOrder.dueDate && <InfoRow label={t("تاريخ الاستحقاق", "Due Date")} value={formatDate(linkedWorkOrder.dueDate)} />}
          {linkedWorkOrder.notes && (
            <div className="mt-2 pt-2 border-t">
              <p className="text-xs text-muted-foreground">{linkedWorkOrder.notes}</p>
            </div>
          )}
          <div className="mt-3">
            <Button
              variant="outline" size="sm"
              className="h-7 text-xs"
              onClick={() => navigate(`/work-orders/${linkedWorkOrder.id}`)}
              data-testid="button-detail-go-work-order"
            >
              <Package className="w-3.5 h-3.5 me-1" />
              {t("عرض أمر العمل", "View Work Order")}
            </Button>
          </div>
        </SectionCard>
      )}

      {(isSalesRep || isManager) && (linkedVisits.length > 0 || isSalesRep) && (
        <SectionCard title={t("الزيارات الميدانية المرتبطة", "Linked Field Visits")} icon={Building2}>
          {linkedVisits.length === 0 ? (
            <div className="text-center py-3">
              <p className="text-xs text-muted-foreground mb-2">{t("لا توجد زيارات ميدانية مرتبطة بهذا الطلب", "No field visits linked to this order")}</p>
              {isSalesRep && (
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => navigate("/dashboard/my-map")} data-testid="button-go-to-map">
                  <Navigation className="w-3 h-3" />
                  {t("اذهب للخريطة لتسجيل زيارة", "Go to Map to Record Visit")}
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {linkedVisits.map(v => {
                const STATUS_LABELS: Record<string, { ar: string; en: string; color: string }> = {
                  interested: { ar: "مهتم", en: "Interested", color: "text-green-600" },
                  follow_up: { ar: "متابعة", en: "Follow Up", color: "text-blue-600" },
                  not_suitable: { ar: "غير مناسب", en: "Not Suitable", color: "text-red-600" },
                  under_construction: { ar: "قيد الإنشاء", en: "Under Construction", color: "text-yellow-600" },
                };
                const cfg = STATUS_LABELS[v.building_status] ?? { ar: v.building_status, en: v.building_status, color: "text-muted-foreground" };
                return (
                  <div key={v.id} className="flex items-start gap-2 p-2 bg-muted/40 rounded-lg border border-border">
                    <Building2 className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-semibold ${cfg.color}`}>{lang === "ar" ? cfg.ar : cfg.en}</span>
                        {v.city && <span className="text-[10px] text-muted-foreground">{v.city}</span>}
                        {v.district && <span className="text-[10px] text-muted-foreground">· {v.district}</span>}
                      </div>
                      {v.address && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{v.address}</p>}
                      {v.notes && <p className="text-xs mt-0.5">{v.notes}</p>}
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(v.visited_at).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-GB", { year: "numeric", month: "short", day: "numeric" })}
                      </p>
                    </div>
                  </div>
                );
              })}
              {isSalesRep && (
                <Button variant="outline" size="sm" className="w-full h-7 text-xs gap-1 mt-1" onClick={() => navigate("/dashboard/my-map")} data-testid="button-add-more-visits">
                  <Navigation className="w-3 h-3" />
                  {t("إضافة زيارة أخرى", "Add Another Visit")}
                </Button>
              )}
            </div>
          )}
        </SectionCard>
      )}

      {orderPayments.length > 0 && (
        <SectionCard title={t("سجل الدفعات", "Payment History")} icon={Banknote}>
          <div className="space-y-2">
            {orderPayments.map((payment) => (
              <div key={payment.id} className="space-y-2">
                <div className={`flex items-center justify-between py-2 border-b last:border-0 ${payment.status === "pending" ? "opacity-80" : ""}`}>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium">{payment.paymentStage || t("دفعة", "Payment")}</p>
                      {payment.status === "pending" && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-amber-300 text-amber-700 dark:text-amber-400">
                          {t("بانتظار التأكيد", "Pending")}
                        </Badge>
                      )}
                      {payment.status === "confirmed" && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-green-300 text-green-700 dark:text-green-400">
                          {t("مؤكدة", "Confirmed")}
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">{formatDate(payment.paymentDate || payment.createdAt)}</p>
                    {payment.notes && <p className="text-[11px] text-muted-foreground mt-0.5">{payment.notes}</p>}
                  </div>
                  <div className="text-end">
                    <p className="text-xs font-bold text-green-700 dark:text-green-400">{formatMoney(payment.amount)}</p>
                    {payment.method && <p className="text-[10px] text-muted-foreground">{payment.method}</p>}
                  </div>
                </div>
                {payment.status === "pending" && (isManager || user?.role === "accountant") && (
                  <Button
                    size="sm"
                    className="w-full h-8 text-xs bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => confirmPaymentMutation.mutate(payment.id)}
                    disabled={confirmPaymentMutation.isPending}
                    data-testid={`button-confirm-payment-${payment.id}`}
                  >
                    {confirmPaymentMutation.isPending
                      ? <Loader2 className="w-3 h-3 me-1 animate-spin" />
                      : <CheckCircle2 className="w-3 h-3 me-1" />}
                    {t("تأكيد الدفعة وإرسال للإنتاج", "Confirm Payment & Send to Production")}
                  </Button>
                )}
              </div>
            ))}
            <div className="pt-2 flex justify-between text-xs font-semibold">
              <span>{t("إجمالي المدفوع", "Total Paid")}</span>
              <span className="text-green-700 dark:text-green-400">
                {formatMoney(orderPayments.reduce((s, p) => s + Number(p.amount ?? 0), 0))}
              </span>
            </div>
          </div>
        </SectionCard>
      )}

      <div className="flex flex-col gap-2 pb-6">
        {linkedSurveys.length > 0 && (
          <Button
            variant="outline"
            className="w-full h-10 text-violet-700 border-violet-300 dark:border-violet-700"
            onClick={() => {
              const s = linkedSurveys[0];
              const apptId = (s as any).appointmentId || linkedAppt?.id;
              if (apptId) window.open(`/dashboard/site-survey/${apptId}?print=1&returnTo=/orders/${orderId}`, "_blank");
            }}
            data-testid="button-detail-print-survey"
          >
            <ClipboardList className="w-4 h-4 me-1.5" />
            {t("طباعة تقرير المسح الميداني", "Print Site Survey Report")}
          </Button>
        )}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 h-11" onClick={() => navigate("/my-orders")} data-testid="button-detail-back">
            {lang === "ar" ? <ArrowRight className="w-4 h-4 me-1" /> : <ArrowLeft className="w-4 h-4 me-1" />}
            {t("العودة", "Back")}
          </Button>
          {stage !== "cancelled" && stage !== "rejected" && (quotation.assignedTo === user?.id || isManager) && (() => {
            const hasItems = Array.isArray((quotation as any).items) && (quotation as any).items.length > 0;
            if (["new", "appointment_scheduled"].includes(stage) && linkedAppt) {
              return (
                <Button
                  className="flex-1 h-11"
                  onClick={() => navigate(`/site-survey/${linkedAppt.id}?returnTo=/orders/${orderId}`)}
                  data-testid="button-detail-take-measurements"
                >
                  <Ruler className="w-4 h-4 me-1" />
                  {t("رفع المقاسات", "Take Measurements")}
                </Button>
              );
            }
            if (stage === "survey_done" && !hasItems) {
              if (isSalesRep) {
                return surveyDesignFiles.length > 0 ? (
                  <Button
                    className="flex-1 h-11 bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                    data-testid="button-detail-design-ready"
                  >
                    <CheckCircle2 className="w-4 h-4 me-1" />
                    {t("التصميم جاهز", "Design Ready")}
                  </Button>
                ) : (
                  <Button
                    className="flex-1 h-11"
                    disabled
                    variant="outline"
                    data-testid="button-detail-awaiting-design"
                  >
                    <Clock className="w-4 h-4 me-1 animate-pulse" />
                    {t("في انتظار التصميم", "Awaiting Design")}
                  </Button>
                );
              }
              return (
                <Button
                  className="flex-1 h-11"
                  onClick={() => navigate(`/quotation-builder?quotationId=${quotation.id}`)}
                  data-testid="button-detail-create-quotation"
                >
                  <FileText className="w-4 h-4 me-1" />
                  {t("إنشاء عرض سعر", "Create Quotation")}
                </Button>
              );
            }
            if (["survey_done", "quote_draft", "quote_sent", "quote_approved", "in_production", "delivered"].includes(stage) && hasItems ||
                ["quote_draft", "quote_sent", "quote_approved", "in_production", "delivered"].includes(stage)) {
              return (
                <Button
                  className="flex-1 h-11"
                  onClick={() => navigate(`/quotations/${quotation.id}/view?returnTo=/orders/${orderId}`)}
                  data-testid="button-detail-open-quotation"
                >
                  <FileText className="w-4 h-4 me-1" />
                  {t("مشاهدة العرض", "View Quote")}
                </Button>
              );
            }
            return null;
          })()}
        </div>
      </div>
    </div>

    <Dialog open={modifyDialog} onOpenChange={setModifyDialog}>
      <DialogContent className="max-w-sm" data-testid="dialog-request-modifications">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-amber-600" />
            {t("طلب تعديلات من المصمم", "Request Modifications from Designer")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-xs text-muted-foreground">
            {t("اكتب ملاحظاتك وسيتم إرسالها للمصمم لمراجعة التصميم", "Write your notes and they will be sent to the designer for review")}
          </p>
          <Textarea
            value={modifyNotes}
            onChange={(e) => setModifyNotes(e.target.value)}
            placeholder={t("مثال: تغيير لون المطبخ، تعديل أبعاد الدولاب...", "e.g. Change kitchen color, adjust cabinet dimensions...")}
            className="min-h-[100px] text-sm"
            data-testid="textarea-modify-notes"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setModifyDialog(false)} data-testid="button-cancel-modify">
            {t("إلغاء", "Cancel")}
          </Button>
          <Button
            className="bg-amber-600 hover:bg-amber-700 text-white"
            disabled={!modifyNotes.trim() || requestModificationsMutation.isPending}
            onClick={() => requestModificationsMutation.mutate()}
            data-testid="button-submit-modify-notes"
          >
            {requestModificationsMutation.isPending
              ? <Loader2 className="w-4 h-4 me-1 animate-spin" />
              : <MessageSquare className="w-4 h-4 me-1" />}
            {t("إرسال للمصمم", "Send to Designer")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={approveDialog} onOpenChange={setApproveDialog}>
      <DialogContent className="max-w-sm" data-testid="dialog-approve-upload-receipt">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ReceiptText className="w-4 h-4 text-green-600" />
            {t("موافقة العميل - رفع إيصال الدفع", "Client Approval - Upload Payment Receipt")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-xs text-muted-foreground">
            {t("ارفع صورة إيصال الدفع لإرسال الطلب للمحاسب وإعداده للإنتاج", "Upload payment receipt to send order to accountant for confirmation and production")}
          </p>
          <div className="space-y-1">
            <Label className="text-xs">{t("مبلغ الدفعة (ر.س)", "Payment Amount (SAR)")}</Label>
            <Input
              type="number"
              value={receiptAmount}
              onChange={(e) => setReceiptAmount(e.target.value)}
              placeholder="0.00"
              className="h-9 text-sm"
              data-testid="input-receipt-amount"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("طريقة الدفع", "Payment Method")}</Label>
            <Select value={receiptMethod} onValueChange={setReceiptMethod}>
              <SelectTrigger className="h-9 text-sm" data-testid="select-receipt-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bank_transfer">{t("تحويل بنكي", "Bank Transfer")}</SelectItem>
                <SelectItem value="cash">{t("نقدي", "Cash")}</SelectItem>
                <SelectItem value="pos">{t("نقطة بيع", "POS")}</SelectItem>
                <SelectItem value="check">{t("شيك", "Check")}</SelectItem>
                <SelectItem value="other">{t("أخرى", "Other")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("صورة الإيصال", "Receipt Image")}</Label>
            {receiptFile ? (
              <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-xs">
                <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="flex-1 truncate font-medium">{receiptFile.name}</span>
                <Button
                  variant="ghost" size="icon" className="h-5 w-5 shrink-0"
                  onClick={() => { setReceiptFile(null); if (receiptFileRef.current) receiptFileRef.current.value = ""; }}
                  data-testid="button-clear-receipt-file"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline" className="w-full h-9 text-xs"
                onClick={() => receiptFileRef.current?.click()}
                data-testid="button-choose-receipt-file"
              >
                <Upload className="w-3.5 h-3.5 me-1" />
                {t("اختيار صورة الإيصال", "Choose Receipt Image")}
              </Button>
            )}
            <input
              ref={receiptFileRef}
              type="file"
              className="hidden"
              accept="image/*,application/pdf"
              onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
              data-testid="input-receipt-file"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setApproveDialog(false)} data-testid="button-cancel-approve">
            {t("إلغاء", "Cancel")}
          </Button>
          <Button
            className="bg-green-600 hover:bg-green-700 text-white"
            disabled={!receiptFile || approveWithReceiptMutation.isPending}
            onClick={handleApproveWithReceipt}
            data-testid="button-submit-approve-receipt"
          >
            {approveWithReceiptMutation.isPending
              ? <Loader2 className="w-4 h-4 me-1 animate-spin" />
              : <CreditCard className="w-4 h-4 me-1" />}
            {t("رفع الإيصال واعتماد الطلب", "Upload Receipt & Approve Order")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
