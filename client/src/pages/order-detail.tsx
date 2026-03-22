import type { ReactNode } from "react";
import { ORDER_STAGE_VALUES } from "@shared/schema";
import type { Quotation, Customer, Contract, Payment, WorkOrder, Appointment, SiteSurvey, User as SchemaUser } from "@shared/schema";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Loader2, ArrowRight, ArrowLeft, User, Phone, MapPin, Calendar,
  Clock, FileText, Package, Truck, CheckCircle2, Ban, AlertCircle,
  CalendarCheck, CalendarX, Ruler, Box, ChevronLeft, ChevronRight,
  ClipboardList, Banknote, Home, Zap, ThumbsDown, type LucideIcon,
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

  const isManager = user && ["owner", "assistant"].includes(user.role);

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
                    <div className="flex flex-col items-center gap-1 flex-shrink-0">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${isDone ? "bg-green-500 text-white" : isCurrent ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground/50"}`}>
                        {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Ico className="w-3.5 h-3.5" />}
                      </div>
                      <span className={`text-[9px] text-center leading-tight max-w-[48px] truncate ${isCurrent ? "font-semibold text-primary" : isDone ? "text-green-600 dark:text-green-400" : "text-muted-foreground/50"}`}>
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
          <div className="space-y-2">
            {linkedSurveys.map((survey) => (
              <div key={survey.id} className="rounded-lg p-3 border bg-violet-50/50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-900 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{survey.projectType || t("مسح", "Survey")} #{survey.id}</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-violet-700 border-violet-300">
                    {t("مكتمل", "Complete")}
                  </Badge>
                </div>
                {survey.city && <p className="flex items-center gap-1 text-muted-foreground"><MapPin className="w-3 h-3" />{survey.city}</p>}
                {survey.totalArea && <InfoRow label={t("المساحة الكلية", "Total Area")} value={`${survey.totalArea} م²`} />}
                {survey.roomsCount && <InfoRow label={t("عدد الغرف", "Rooms")} value={String(survey.roomsCount)} />}
                {survey.notes && <p className="text-muted-foreground border-t pt-1 mt-1">{survey.notes}</p>}
                <Button
                  variant="outline" size="sm"
                  className="h-6 text-[10px] px-2 mt-1"
                  onClick={() => navigate(`/site-survey/${survey.appointmentId || linkedAppt?.id}?returnTo=/orders/${orderId}`)}
                  data-testid={`button-detail-open-survey-${survey.id}`}
                >
                  {t("عرض المسح الكامل", "View Full Survey")}
                </Button>
              </div>
            ))}
          </div>
        </SectionCard>
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

      {orderPayments.length > 0 && (
        <SectionCard title={t("سجل الدفعات", "Payment History")} icon={Banknote}>
          <div className="space-y-2">
            {orderPayments.map((payment) => (
              <div key={payment.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="text-xs font-medium">{payment.paymentType || t("دفعة", "Payment")}</p>
                  <p className="text-[11px] text-muted-foreground">{formatDate(payment.paymentDate || payment.createdAt)}</p>
                  {payment.notes && <p className="text-[11px] text-muted-foreground mt-0.5">{payment.notes}</p>}
                </div>
                <div className="text-end">
                  <p className="text-xs font-bold text-green-700 dark:text-green-400">{formatMoney(payment.amount)}</p>
                  {payment.method && <p className="text-[10px] text-muted-foreground">{payment.method}</p>}
                </div>
              </div>
            ))}
            <div className="pt-2 flex justify-between text-xs font-semibold">
              <span>{t("إجمالي المدفوع", "Total Paid")}</span>
              <span className="text-green-700 dark:text-green-400">
                {formatMoney(orderPayments.reduce((s, p) => s + Number(p.amount || 0), 0))}
              </span>
            </div>
          </div>
        </SectionCard>
      )}

      <div className="flex gap-2 pb-4">
        <Button variant="outline" className="flex-1 h-9" onClick={() => navigate("/my-orders")} data-testid="button-detail-back">
          {lang === "ar" ? <ArrowRight className="w-4 h-4 me-1" /> : <ArrowLeft className="w-4 h-4 me-1" />}
          {t("العودة للطلبات", "Back to Orders")}
        </Button>
        {stage !== "cancelled" && (quotation.assignedTo === user?.id || isManager) && (
          <Button
            className="flex-1 h-9"
            onClick={() => navigate(`/quotation-builder?quotationId=${quotation.id}`)}
            data-testid="button-detail-open-quotation"
          >
            <FileText className="w-4 h-4 me-1" />
            {t("عرض السعر التفصيلي", "Detailed Quotation")}
          </Button>
        )}
      </div>
    </div>
  );
}
