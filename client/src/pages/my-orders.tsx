import { useState, useMemo, useEffect } from "react";
import { ORDER_STAGE_VALUES } from "@shared/schema";
import type { Quotation, Customer, Contract, WorkOrder, Appointment, SiteSurvey, User as SchemaUser } from "@shared/schema";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { LoadingTransition } from "@/components/loading-transition";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Search, ClipboardList, CheckCircle2,
  ChevronLeft, ChevronRight, Eye, Phone, MapPin, Calendar,
  Clock, Plus, Hand, Zap, CalendarPlus, CalendarCheck,
  CalendarX, Filter, X, Ruler, Box, Ban, AlertCircle, ArrowRight,
  FileText, Package, Truck, ThumbsDown, type LucideIcon,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function useElapsedTime() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function formatElapsed(fromDate: string | Date, now: number, t: (ar: string, en: string) => string): string {
  const ms = now - new Date(fromDate).getTime();
  if (ms < 0) return "";
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return t(`منذ ${days} يوم`, `${days}d ago`);
  if (hours > 0) return t(`منذ ${hours} ساعة`, `${hours}h ago`);
  return t(`منذ ${mins} د`, `${mins}m ago`);
}

type PipelineStage = "all" | "new" | "appointment_scheduled" | "survey_done" | "quote_draft" | "quote_sent" | "quote_approved" | "in_production" | "delivered" | "rejected" | "cancelled";

interface EnrichedOrder extends Quotation {
  customer: Customer | undefined;
  assignedUser: SchemaUser | undefined;
  stage: PipelineStage;
  _appointment: Appointment | null;
}

type WorkOrderWithContract = WorkOrder & { _contract: Contract | undefined };

function getLastActivityDate(order: EnrichedOrder): Date {
  const candidates = [
    order.updatedAt,
    order.cancelledAt,
    order.claimedAt,
    order._appointment?.createdAt,
    order.createdAt,
  ];
  const dates = candidates.filter(Boolean).map(d => new Date(d as string).getTime()).filter(n => !isNaN(n));
  const latest = Math.max(...dates);
  return isFinite(latest) ? new Date(latest) : new Date(order.createdAt ?? 0);
}

const CANCEL_REASONS = [
  { value: "لم يرد العميل على التواصل", ar: "لم يرد العميل على التواصل", en: "Customer not responding" },
  { value: "العميل غيّر رأيه", ar: "العميل غيّر رأيه", en: "Customer changed mind" },
  { value: "مضى وقت طويل بدون استجابة", ar: "مضى وقت طويل بدون استجابة", en: "Too long without response" },
  { value: "عرض السعر لا يتناسب مع ميزانية العميل", ar: "عرض السعر لا يتناسب مع ميزانية العميل", en: "Price doesn't fit budget" },
  { value: "العميل اختار جهة أخرى", ar: "العميل اختار جهة أخرى", en: "Customer chose another provider" },
  { value: "طلب خارج نطاق عملنا", ar: "طلب خارج نطاق عملنا", en: "Out of scope" },
  { value: "أخرى", ar: "أخرى", en: "Other" },
];

const PIPELINE_STAGES: { key: PipelineStage; ar: string; en: string; color: string; icon: LucideIcon }[] = [
  { key: "all", ar: "الكل", en: "All", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300", icon: ClipboardList },
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
  workOrdersWithContract: WorkOrderWithContract[],
  contracts: Contract[],
  siteSurveys: SiteSurvey[],
  apptByQuotation: Record<number, Appointment>
): PipelineStage {
  if (q.orderStage && (ORDER_STAGE_VALUES as readonly string[]).includes(q.orderStage)) {
    return q.orderStage as PipelineStage;
  }
  if (q.status === "cancelled") return "cancelled";
  if (q.status === "rejected" || q.status === "expired") return "rejected";

  if (q.status === "approved") {
    const contract = contracts.find(c => c.quotationId === q.id);
    if (contract) {
      const wo = workOrdersWithContract.find(w => w.contractId === contract.id);
      if (wo) {
        if (["completed", "delivered", "installed"].includes(wo.status ?? "")) return "delivered";
        return "in_production";
      }
    }
    return "quote_approved";
  }

  if (q.status === "sent") return "quote_sent";
  if (q.status === "draft" || q.status === "open") return "quote_draft";

  const hasSurvey = siteSurveys.some(s => s.quotationId === q.id);
  const appt = apptByQuotation[q.id];
  if (hasSurvey || appt?.status === "attended") return "survey_done";
  if (appt) return "appointment_scheduled";
  return "new";
}

function getNextAction(stage: PipelineStage, order: EnrichedOrder, t: (ar: string, en: string) => string): { label: string; urgent: boolean } {
  switch (stage) {
    case "new":
      return { label: t("احجز موعد رفع المقاسات", "Book measurement appointment"), urgent: true };
    case "appointment_scheduled": {
      const appt = order._appointment;
      if (appt) {
        const isPast = new Date(`${appt.appointmentDate}T${appt.endTime || "23:59"}`) < new Date();
        if (isPast) return { label: t("سجّل نتيجة الموعد أو أعد جدولته", "Record appointment result or reschedule"), urgent: true };
      }
      return { label: t("انتظار تاريخ الموعد", "Waiting for appointment"), urgent: false };
    }
    case "survey_done":
      return { label: t("أعد عرض السعر وأرسله للعميل", "Prepare and send quote to customer"), urgent: true };
    case "quote_draft":
      return { label: t("راجع المسودة وأرسل العرض للعميل", "Review draft and send quote"), urgent: true };
    case "quote_sent":
      return { label: t("انتظار موافقة العميل", "Awaiting customer approval"), urgent: false };
    case "quote_approved":
      return { label: t("أنشئ أمر العمل لبدء الإنتاج", "Create work order to start production"), urgent: true };
    case "in_production":
      return { label: t("متابعة مراحل التصنيع", "Follow up on production stages"), urgent: false };
    case "delivered":
      return { label: t("تم التسليم — الطلب مكتمل", "Delivered — Order complete"), urgent: false };
    case "rejected":
      return { label: t("العرض مرفوض أو منتهٍ", "Quote rejected or expired"), urgent: false };
    case "cancelled":
      return { label: t("الطلب ملغى", "Order cancelled"), urgent: false };
    default:
      return { label: t("تحديث حالة الطلب", "Update order status"), urgent: false };
  }
}

const appointmentTypes = [
  { value: "زيارة رفع المقاسات", ar: "زيارة رفع المقاسات", en: "Site Measurement" },
  { value: "عرض المنتجات", ar: "عرض المنتجات", en: "Product Showcase" },
  { value: "متابعة عميل", ar: "متابعة عميل", en: "Customer Follow-up" },
  { value: "تسليم مشروع", ar: "تسليم مشروع", en: "Project Delivery" },
];

export default function MyOrdersPage() {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const now = useElapsedTime();

  const [, navigate] = useLocation();
  const [activeStage, setActiveStage] = useState<PipelineStage>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showClaimTransition, setShowClaimTransition] = useState(false);
  const [newOrderDialog, setNewOrderDialog] = useState(false);
  const [newOrderForm, setNewOrderForm] = useState({ fullName: "", phone: "", productDescription: "", notes: "", city: "" });
  const [showNewOrderTransition, setShowNewOrderTransition] = useState(false);
  const [appointmentDialog, setAppointmentDialog] = useState<EnrichedOrder | null>(null);
  const [editingApptId, setEditingApptId] = useState<number | null>(null);
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [cancelDialog, setCancelDialog] = useState<EnrichedOrder | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelNotes, setCancelNotes] = useState("");
  const [repFilter, setRepFilter] = useState<string>("all");

  const _today = new Date();
  const _currentYear = _today.getFullYear();
  const _currentMonth = _today.getMonth() + 1;
  const _currentDay = _today.getDate();

  const [apptTitle, setApptTitle] = useState("زيارة رفع المقاسات");
  const [apptNotes, setApptNotes] = useState("");
  const [apptDay, setApptDay] = useState(String(_currentDay));
  const [apptMonth, setApptMonth] = useState(String(_currentMonth));
  const [apptHour, setApptHour] = useState("9");
  const [apptMinute, setApptMinute] = useState("00");
  const [apptDuration, setApptDuration] = useState("60");

  const perPage = 15;

  const { data: quotations = [], isLoading } = useQuery<Quotation[]>({
    queryKey: ["/api/quotations"],
    refetchInterval: 15000,
  });
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: usersData = [] } = useQuery<SchemaUser[]>({ queryKey: ["/api/users"] });
  const { data: workOrders = [] } = useQuery<WorkOrder[]>({ queryKey: ["/api/work-orders"] });
  const { data: contracts = [] } = useQuery<Contract[]>({ queryKey: ["/api/contracts"] });
  const { data: appointments = [] } = useQuery<Appointment[]>({ queryKey: ["/api/appointments"] });
  const { data: siteSurveys = [] } = useQuery<SiteSurvey[]>({ queryKey: ["/api/site-surveys"] });

  const isManager = user && ["owner", "assistant"].includes(user.role);

  useEffect(() => {
    const expired = appointments.filter(appt => {
      if (appt.status !== "scheduled") return false;
      const endDt = new Date(`${appt.appointmentDate}T${appt.endTime || appt.startTime || "23:59"}`);
      return endDt < new Date();
    });
    expired.forEach(appt => {
      apiRequest("POST", `/api/appointments/${appt.id}/expire`).then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      }).catch(() => {});
    });
  }, [now, appointments]);

  const workOrdersWithContract = useMemo((): WorkOrderWithContract[] => {
    return workOrders.map(wo => ({
      ...wo,
      _contract: contracts.find(c => c.id === wo.contractId),
    }));
  }, [workOrders, contracts]);

  const claimMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("POST", `/api/quotations/${id}/claim`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setActiveStage("quote_draft");
      setShowClaimTransition(true);
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : "";
      toast({ title: msg || t("فشل التقاط الطلب", "Failed to claim order"), variant: "destructive" });
    },
  });

  type NewOrderData = { fullName: string; phone: string; productDescription: string; notes: string; city: string };
  const createOrderMutation = useMutation({
    mutationFn: async (data: NewOrderData) => apiRequest("POST", "/api/orders/create-direct", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setNewOrderDialog(false);
      setNewOrderForm({ fullName: "", phone: "", productDescription: "", notes: "", city: "" });
      setShowNewOrderTransition(true);
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : "";
      toast({ title: msg || t("فشل إنشاء الطلب", "Failed to create order"), variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async ({ id, reason, notes }: { id: number; reason: string; notes: string }) =>
      apiRequest("POST", `/api/quotations/${id}/cancel`, { reason, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      setCancelDialog(null);
      setCancelReason("");
      setCancelNotes("");
      toast({ title: t("تم إلغاء الطلب", "Order cancelled") });
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : "";
      toast({ title: msg || t("فشل إلغاء الطلب", "Failed to cancel order"), variant: "destructive" });
    },
  });

  type AppointmentPayload = { title: string; appointmentDate: string; startTime: string; endTime: string; customerId: number | null; quotationId: number; assignedTo: number; notes: string };
  type AppointmentUpdatePayload = Partial<AppointmentPayload> & { status?: string; failNotes?: string };
  const appointmentMutation = useMutation({
    mutationFn: async (data: AppointmentPayload) => apiRequest("POST", "/api/appointments", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      setAppointmentDialog(null);
      resetApptForm();
      toast({ title: t("تم حجز الموعد بنجاح!", "Appointment booked successfully!") });
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : "";
      if (msg.includes("تعارض") || msg.includes("conflict")) {
        toast({ title: t("يوجد تعارض مع موعد آخر في نفس الوقت", "Time conflict with another appointment"), variant: "destructive" });
      } else {
        toast({ title: t("فشل حجز الموعد", "Failed to book appointment"), variant: "destructive" });
      }
    },
  });

  const updateAppointmentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: AppointmentUpdatePayload }) => apiRequest("PATCH", `/api/appointments/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      setAppointmentDialog(null);
      resetApptForm();
      toast({ title: t("تم تعديل الموعد بنجاح!", "Appointment updated successfully!") });
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : "";
      if (msg.includes("تعارض") || msg.includes("conflict")) {
        toast({ title: t("يوجد تعارض مع موعد آخر في نفس الوقت", "Time conflict with another appointment"), variant: "destructive" });
      } else {
        toast({ title: t("فشل تعديل الموعد", "Failed to update appointment"), variant: "destructive" });
      }
    },
  });

  const appointmentByQuotation = useMemo((): Record<number, Appointment> => {
    const map: Record<number, Appointment> = {};
    for (const appt of appointments) {
      if (!appt.quotationId) continue;
      const existing = map[appt.quotationId];
      if (!existing) {
        map[appt.quotationId] = appt;
      } else {
        const apptDate = new Date(`${appt.appointmentDate}T${appt.startTime || "00:00"}`).getTime();
        const existingDate = new Date(`${existing.appointmentDate}T${existing.startTime || "00:00"}`).getTime();
        if (apptDate > existingDate) map[appt.quotationId] = appt;
      }
    }
    return map;
  }, [appointments]);

  const salesReps = useMemo(() => {
    return usersData.filter(u => u.role === "sales");
  }, [usersData]);

  const enrichedOrders = useMemo((): EnrichedOrder[] => {
    if (!user) return [];
    return quotations.map(q => {
      const customer = customers.find(c => c.id === q.customerId);
      const assignedUser = q.assignedTo ? usersData.find(u => u.id === q.assignedTo) : undefined;
      const _appointment = appointmentByQuotation[q.id] || null;
      const stage = getOrderStage(q, workOrdersWithContract, contracts, siteSurveys, appointmentByQuotation);
      return { ...q, customer, assignedUser, stage, _appointment };
    });
  }, [quotations, customers, usersData, workOrdersWithContract, contracts, siteSurveys, user, appointmentByQuotation]);

  const visibleOrders = useMemo((): EnrichedOrder[] => {
    if (!user) return [];
    if (isManager) {
      if (repFilter === "all") return enrichedOrders;
      if (repFilter === "unassigned") return enrichedOrders.filter(o => !o.assignedTo);
      return enrichedOrders.filter(o => o.assignedTo === parseInt(repFilter));
    }
    return enrichedOrders.filter(o => {
      const claimableStatuses = ["requested", "open", "draft"];
      const isUnassignedAndClaimable = !o.assignedTo && claimableStatuses.includes(o.status ?? "");
      return o.assignedTo === user.id || isUnassignedAndClaimable;
    });
  }, [enrichedOrders, user, isManager, repFilter]);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: visibleOrders.length };
    for (const stage of PIPELINE_STAGES.filter(s => s.key !== "all")) {
      counts[stage.key] = visibleOrders.filter(o => o.stage === stage.key).length;
    }
    return counts;
  }, [visibleOrders]);

  const openCount = useMemo(() => enrichedOrders.filter(o => o.stage === "new" && !o.assignedTo).length, [enrichedOrders]);

  const filtered = useMemo((): EnrichedOrder[] => {
    let list = activeStage === "all" ? visibleOrders : visibleOrders.filter(o => o.stage === activeStage);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(o =>
        o.customer?.fullName?.toLowerCase().includes(q) ||
        o.customer?.phone?.includes(q) ||
        String(o.id).includes(q) ||
        String(o.quotationNumber).includes(q)
      );
    }
    return [...list].sort((a, b) => {
      if (a.stage === "new" && !a.assignedTo && (b.stage !== "new" || b.assignedTo)) return -1;
      if (b.stage === "new" && !b.assignedTo && (a.stage !== "new" || a.assignedTo)) return 1;
      return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
    });
  }, [visibleOrders, activeStage, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  function isAppointmentPast(appt: Appointment): boolean {
    if (!appt?.appointmentDate) return false;
    const apptDateTime = new Date(`${appt.appointmentDate}T${appt.endTime || appt.startTime || "23:59"}`);
    return apptDateTime < new Date();
  }

  function formatApptCountdown(appt: Appointment, nowTs: number): { label: string; urgent: boolean; past: boolean } {
    if (!appt?.appointmentDate) return { label: "", urgent: false, past: false };
    const apptDateTime = new Date(`${appt.appointmentDate}T${appt.startTime || "09:00"}`);
    const diffMs = apptDateTime.getTime() - nowTs;
    if (diffMs <= 0) {
      const pastMs = Math.abs(diffMs);
      const pastDays = Math.floor(pastMs / 86400000);
      if (pastDays > 0) return { label: t(`منذ ${pastDays} يوم`, `${pastDays}d ago`), urgent: false, past: true };
      const pastHrs = Math.floor(pastMs / 3600000);
      if (pastHrs > 0) return { label: t(`منذ ${pastHrs} ساعة`, `${pastHrs}h ago`), urgent: false, past: true };
      return { label: t("منذ قليل", "Just passed"), urgent: false, past: true };
    }
    const days = Math.floor(diffMs / 86400000);
    const hrs = Math.floor((diffMs % 86400000) / 3600000);
    const mins = Math.floor((diffMs % 3600000) / 60000);
    if (days > 0) return { label: t(`بعد ${days} يوم`, `In ${days}d`), urgent: days <= 1, past: false };
    if (hrs > 0) return { label: t(`بعد ${hrs} ساعة`, `In ${hrs}h`), urgent: true, past: false };
    return { label: t(`بعد ${mins} دقيقة`, `In ${mins}m`), urgent: true, past: false };
  }

  function formatApptFullDate(appt: Appointment): string {
    if (!appt?.appointmentDate) return "—";
    return new Date(appt.appointmentDate).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
  }

  function resetApptForm() {
    const d = new Date();
    setEditingApptId(null);
    setRescheduleReason("");
    setApptTitle("زيارة رفع المقاسات");
    setApptNotes("");
    setApptDay(String(d.getDate()));
    setApptMonth(String(d.getMonth() + 1));
    setApptHour("9");
    setApptMinute("00");
    setApptDuration("60");
  }

  function openAppointmentDialog(order: EnrichedOrder) {
    const existingAppt = order._appointment;
    setAppointmentDialog(order);
    if (existingAppt) {
      setEditingApptId(existingAppt.id);
      setApptTitle(existingAppt.title || "زيارة رفع المقاسات");
      setApptNotes(existingAppt.notes || "");
      if (existingAppt.appointmentDate) {
        const parts = existingAppt.appointmentDate.split("-");
        setApptMonth(String(parseInt(parts[1])));
        setApptDay(String(parseInt(parts[2])));
      }
      if (existingAppt.startTime) {
        const timeParts = existingAppt.startTime.split(":");
        setApptHour(String(parseInt(timeParts[0])));
        setApptMinute(timeParts[1] || "00");
      }
      const startMins = existingAppt.startTime ? parseInt(existingAppt.startTime.split(":")[0]) * 60 + parseInt(existingAppt.startTime.split(":")[1] || "0") : 0;
      const endMins = existingAppt.endTime ? parseInt(existingAppt.endTime.split(":")[0]) * 60 + parseInt(existingAppt.endTime.split(":")[1] || "0") : 0;
      const diff = endMins - startMins;
      const durOptions = [30, 60, 90, 120, 180];
      setApptDuration(String(durOptions.includes(diff) ? diff : 60));
    } else {
      const d = new Date();
      setEditingApptId(null);
      setApptTitle("زيارة رفع المقاسات");
      setApptNotes(t(
        `طلب #${order.quotationNumber || order.id} — ${order.customer?.fullName || ""}`,
        `Order #${order.quotationNumber || order.id} — ${order.customer?.fullName || ""}`
      ));
      setApptDay(String(d.getDate()));
      setApptMonth(String(d.getMonth() + 1));
      setApptHour("9");
      setApptMinute("00");
      setApptDuration("60");
    }
  }

  function addMinutesToTime(h: number, m: number, mins: number): string {
    const total = h * 60 + m + mins;
    return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  async function submitAppointment() {
    if (!appointmentDialog || !user) return;
    const y = _currentYear;
    const mm = parseInt(apptMonth);
    const dd = parseInt(apptDay);
    const h = parseInt(apptHour);
    const m = parseInt(apptMinute);
    const dur = parseInt(apptDuration);
    const appointmentDate = `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    const startTime = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const endTime = addMinutesToTime(h, m, dur);
    const payload = {
      title: apptTitle,
      appointmentDate,
      startTime,
      endTime,
      customerId: appointmentDialog.customerId || null,
      quotationId: appointmentDialog.id,
      assignedTo: user.id,
      notes: apptNotes,
    };
    const existingAppt = appointmentDialog._appointment;
    const isPast = existingAppt && isAppointmentPast(existingAppt);
    if (editingApptId && isPast) {
      updateAppointmentMutation.mutate(
        { id: editingApptId, data: { status: "rescheduled", failNotes: rescheduleReason || t("إعادة تعيين بدون سبب", "Rescheduled without reason") } },
        { onSuccess: () => { appointmentMutation.mutate(payload); } }
      );
    } else if (editingApptId) {
      updateAppointmentMutation.mutate({ id: editingApptId, data: payload });
    } else {
      appointmentMutation.mutate(payload);
    }
  }

  function formatDate(dateStr: string) {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US", { month: "short", day: "numeric" });
  }
  function formatDateTime(dateStr: string) {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString(lang === "ar" ? "ar-SA" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="page-my-orders">
      <LoadingTransition
        show={showClaimTransition}
        message={t("جاري التقاط الطلب...", "Claiming order...")}
        subMessage={t("يتم تحديث حالة الطلب", "Updating order status")}
        duration={1200}
        onComplete={() => {
          setShowClaimTransition(false);
          setActiveStage("new");
          toast({ title: t("تم التقاط الطلب بنجاح!", "Order claimed successfully!") });
        }}
      />
      <LoadingTransition
        show={showNewOrderTransition}
        message={t("جاري إنشاء الطلب...", "Creating order...")}
        subMessage={t("يتم تسجيل الطلب والعميل", "Registering order and customer")}
        duration={1200}
        onComplete={() => {
          setShowNewOrderTransition(false);
          toast({ title: t("تم إنشاء الطلب بنجاح", "Order created successfully") });
        }}
      />

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" data-testid="text-my-orders-title">
            {isManager ? t("لوحة الطلبات", "Orders Board") : t("طلباتي", "My Orders")}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("تتبع طلباتك عبر مراحل العمل", "Track your orders across pipeline stages")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {openCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-950/30"
              onClick={() => { setActiveStage("new"); setCurrentPage(1); }}
              data-testid="button-view-open-orders"
            >
              <Zap className="w-3.5 h-3.5 me-1 animate-pulse" />
              {t(`${openCount} طلب مفتوح`, `${openCount} open`)}
            </Button>
          )}
          <Button onClick={() => setNewOrderDialog(true)} size="sm" className="h-8 text-xs" data-testid="button-new-order-my">
            <Plus className="w-3.5 h-3.5 me-1" />
            {t("طلب جديد", "New Order")}
          </Button>
        </div>
      </div>

      {isManager && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" />
            {t("المندوب:", "Rep:")}
          </span>
          <Select value={repFilter} onValueChange={(v) => { setRepFilter(v); setCurrentPage(1); }}>
            <SelectTrigger className="h-7 text-xs w-[180px]" data-testid="select-rep-filter">
              <SelectValue placeholder={t("كل المناديب", "All Reps")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("كل المناديب", "All Reps")}</SelectItem>
              <SelectItem value="unassigned">{t("غير مُسندة", "Unassigned")}</SelectItem>
              {salesReps.map((rep) => (
                <SelectItem key={rep.id} value={String(rep.id)}>
                  {lang === "ar" ? rep.fullNameAr : rep.fullNameEn}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="overflow-x-auto pb-1 -mx-1 px-1">
        <div className="flex gap-1.5 min-w-max">
          {PIPELINE_STAGES.map((stage) => {
            const Icon = stage.icon;
            const count = stageCounts[stage.key] || 0;
            const isActive = activeStage === stage.key;
            return (
              <button
                key={stage.key}
                onClick={() => { setActiveStage(stage.key); setCurrentPage(1); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? `${stage.color} ring-2 ring-offset-1 ring-current/30 shadow-sm`
                    : "bg-muted/50 text-muted-foreground hover:bg-muted"
                }`}
                data-testid={`tab-stage-${stage.key}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t(stage.ar, stage.en)}
                {count > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0 rounded-full ${isActive ? "bg-white/50 dark:bg-black/20" : "bg-muted"}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={t("بحث بالاسم أو الهاتف أو رقم الطلب...", "Search by name, phone or order #...")}
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
          className="ps-9 h-9 text-sm"
          data-testid="input-search-my-orders"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            data-testid="button-clear-search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ClipboardList className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground text-sm">
              {activeStage === "all"
                ? t("لا توجد طلبات", "No orders found")
                : t(`لا توجد طلبات في مرحلة "${PIPELINE_STAGES.find(s => s.key === activeStage)?.ar}"`, `No orders in "${PIPELINE_STAGES.find(s => s.key === activeStage)?.en}" stage`)
              }
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="hidden md:block">
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-orders">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-start px-4 py-3 font-semibold text-xs text-muted-foreground w-16">#</th>
                        <th className="text-start px-4 py-3 font-semibold text-xs text-muted-foreground">{t("العميل", "Customer")}</th>
                        <th className="text-start px-4 py-3 font-semibold text-xs text-muted-foreground">{t("المبلغ", "Amount")}</th>
                        <th className="text-start px-4 py-3 font-semibold text-xs text-muted-foreground">{t("المرحلة", "Stage")}</th>
                        <th className="text-start px-4 py-3 font-semibold text-xs text-muted-foreground">{t("الإجراء التالي", "Next Action")}</th>
                        {isManager && <th className="text-start px-4 py-3 font-semibold text-xs text-muted-foreground">{t("المندوب", "Rep")}</th>}
                        <th className="text-start px-4 py-3 font-semibold text-xs text-muted-foreground">{t("تاريخ", "Date")}</th>
                        <th className="text-start px-4 py-3 font-semibold text-xs text-muted-foreground w-36">{t("إجراءات", "Actions")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {paginated.map((order) => {
                        const amount = Number(order.finalPrice || order.totalPrice || 0);
                        const isOpen = order.stage === "new" && !order.assignedTo;
                        const stageCfg = PIPELINE_STAGES.find(s => s.key === order.stage) || PIPELINE_STAGES[0];
                        const StageIcon = stageCfg.icon;
                        const nextAction = getNextAction(order.stage, order, t);
                        const isCancelled = order.stage === "cancelled";
                        const isDelivered = order.stage === "delivered";
                        const isMine = order.assignedTo === user?.id;
                        const canCancel = !isCancelled && !isDelivered && (isManager || isMine);
                        const appt = order._appointment;
                        const apptPast = appt && isAppointmentPast(appt);
                        return (
                          <tr
                            key={order.id}
                            className={`hover:bg-muted/30 transition-colors ${isOpen ? "bg-amber-50/40 dark:bg-amber-950/10" : ""} ${isCancelled ? "opacity-60" : ""}`}
                            data-testid={`row-order-${order.id}`}
                          >
                            <td className="px-4 py-3">
                              <span className="font-mono text-xs font-bold text-muted-foreground">
                                {order.quotationNumber || order.id}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-medium text-sm truncate max-w-[160px]" data-testid={`text-customer-${order.id}`}>
                                {order.customer?.fullName || "—"}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                                {order.customer?.phone && <span dir="ltr">{order.customer.phone}</span>}
                                {(order.city || order.customer?.city) && (
                                  <span className="flex items-center gap-0.5">
                                    <MapPin className="w-2.5 h-2.5" />{order.city || order.customer?.city}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {amount > 0 ? (
                                <span className="text-xs font-semibold">{amount.toLocaleString()} {t("ر.س", "SAR")}</span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="secondary" className={`text-[10px] px-2 py-0.5 gap-1 inline-flex items-center ${stageCfg.color}`} data-testid={`badge-status-${order.id}`}>
                                <StageIcon className="w-2.5 h-2.5" />
                                {t(stageCfg.ar, stageCfg.en)}
                              </Badge>
                              {isCancelled && order.cancelledAt && (
                                <div className="mt-0.5">
                                  <span className="text-[10px] text-red-600 dark:text-red-400">{formatDateTime(order.cancelledAt)}</span>
                                </div>
                              )}
                              {isCancelled && order.cancellationReason && (
                                <div className="mt-0.5">
                                  <span className="text-[10px] text-muted-foreground line-clamp-1 max-w-[140px]" title={order.cancellationReason}>{order.cancellationReason}</span>
                                </div>
                              )}
                              {appt && !isCancelled && (
                                <div className="mt-0.5">
                                  <span className={`text-[10px] ${apptPast ? "text-amber-600 dark:text-amber-400" : "text-blue-600 dark:text-blue-400"}`}>
                                    {apptPast ? "⚠ " : "📅 "}
                                    {formatDate(appt.appointmentDate)} {appt.startTime?.slice(0, 5)}
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-[11px] flex items-center gap-1 ${nextAction.urgent ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground"}`}>
                                {nextAction.urgent && <AlertCircle className="w-3 h-3 flex-shrink-0" />}
                                {nextAction.label}
                              </span>
                            </td>
                            {isManager && (
                              <td className="px-4 py-3">
                                <span className="text-xs text-muted-foreground">
                                  {order.assignedUser
                                    ? (lang === "ar" ? order.assignedUser.fullNameAr : order.assignedUser.fullNameEn)
                                    : <span className="text-amber-600 dark:text-amber-400 font-medium">{t("غير مُسند", "Unassigned")}</span>
                                  }
                                </span>
                              </td>
                            )}
                            <td className="px-4 py-3">
                              <span className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</span>
                              {order.claimedAt && (
                                <p className="text-[10px] text-muted-foreground/60">{t("التقاط:", "Claimed:")} {formatDate(order.claimedAt)}</p>
                              )}
                              <p className="text-[10px] text-muted-foreground/70 flex items-center gap-0.5 mt-0.5">
                                <Clock className="w-2.5 h-2.5" />
                                {formatElapsed(getLastActivityDate(order), now, t)}
                              </p>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                {isOpen ? (
                                  <Button
                                    size="sm"
                                    className="bg-green-600 hover:bg-green-700 text-white h-7 px-2.5 text-xs"
                                    onClick={() => claimMutation.mutate(order.id)}
                                    disabled={claimMutation.isPending}
                                    data-testid={`button-claim-${order.id}`}
                                  >
                                    {claimMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin me-1" /> : <Hand className="w-3 h-3 me-1" />}
                                    {t("التقاط", "Claim")}
                                  </Button>
                                ) : (
                                  <>
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => navigate(`/orders/${order.id}`)} title={t("عرض التفاصيل", "View Details")} data-testid={`button-view-my-${order.id}`}>
                                      <Eye className="w-3.5 h-3.5" />
                                    </Button>
                                    {!isCancelled && !isDelivered && (isMine || isManager) && (
                                      <>
                                        <Button
                                          variant="ghost" size="sm"
                                          className={`h-7 w-7 p-0 ${appt ? "text-emerald-600" : "text-primary"}`}
                                          onClick={() => openAppointmentDialog(order)}
                                          title={appt ? t("تعديل الموعد", "Edit Appt") : t("حجز موعد", "Book Appt")}
                                          data-testid={`button-book-appt-${order.id}`}
                                        >
                                          {appt ? <CalendarCheck className="w-3.5 h-3.5" /> : <CalendarPlus className="w-3.5 h-3.5" />}
                                        </Button>
                                        <Button
                                          variant="ghost" size="sm"
                                          className={`h-7 w-7 p-0 ${appt ? "text-violet-600" : "text-muted-foreground/30 cursor-not-allowed"}`}
                                          onClick={() => appt && navigate(`/site-survey/${appt.id}?returnTo=/my-orders`)}
                                          disabled={!appt}
                                          title={appt ? t("المسح الميداني", "Site Survey") : t("يجب حجز موعد أولاً", "Book appointment first")}
                                          data-testid={`button-survey-${order.id}`}
                                        >
                                          <Ruler className="w-3.5 h-3.5" />
                                        </Button>
                                        {appt?.status === "attended" && (
                                          <Button
                                            variant="ghost" size="sm"
                                            className="h-7 w-7 p-0 text-indigo-600"
                                            onClick={() => navigate(`/scene-3d?appointmentId=${appt.id}`)}
                                            title={t("التصور ثلاثي الأبعاد", "3D Preview")}
                                            data-testid={`button-3d-${order.id}`}
                                          >
                                            <Box className="w-3.5 h-3.5" />
                                          </Button>
                                        )}
                                      </>
                                    )}
                                    {canCancel && (
                                      <Button
                                        variant="ghost" size="sm"
                                        className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                                        onClick={() => { setCancelDialog(order); setCancelReason(""); setCancelNotes(""); }}
                                        title={t("إلغاء الطلب", "Cancel Order")}
                                        data-testid={`button-cancel-${order.id}`}
                                      >
                                        <Ban className="w-3.5 h-3.5" />
                                      </Button>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="md:hidden space-y-2">
            {paginated.map((order) => {
              const amount = Number(order.finalPrice || order.totalPrice || 0);
              const isOpen = order.stage === "new" && !order.assignedTo;
              const stageCfg = PIPELINE_STAGES.find(s => s.key === order.stage) || PIPELINE_STAGES[0];
              const StageIcon = stageCfg.icon;
              const nextAction = getNextAction(order.stage, order, t);
              const isCancelled = order.stage === "cancelled";
              const isDelivered = order.stage === "delivered";
              const isMine = order.assignedTo === user?.id;
              const canCancel = !isCancelled && !isDelivered && (isManager || isMine);
              const appt = order._appointment;
              const apptPast = appt && isAppointmentPast(appt);
              return (
                <Card
                  key={order.id}
                  className={`${isOpen ? "border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-950/10" : ""} ${isCancelled ? "opacity-60" : ""}`}
                  data-testid={`card-order-${order.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-muted-foreground">#{order.quotationNumber || order.id}</span>
                        <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 gap-1 inline-flex items-center ${stageCfg.color}`}>
                          <StageIcon className="w-2.5 h-2.5" />
                          {t(stageCfg.ar, stageCfg.en)}
                        </Badge>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{formatDate(order.createdAt)}</span>
                    </div>

                    <p className="font-medium text-sm" data-testid={`text-customer-mobile-${order.id}`}>
                      {order.customer?.fullName || "—"}
                    </p>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70 mt-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      {t("آخر نشاط:", "Last activity:")} {formatElapsed(getLastActivityDate(order), now, t)}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
                      {order.customer?.phone && <span dir="ltr" className="flex items-center gap-0.5"><Phone className="w-2.5 h-2.5" />{order.customer.phone}</span>}
                      {(order.city || order.customer?.city) && <span className="flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{order.city || order.customer?.city}</span>}
                      {amount > 0 && <span className="font-semibold text-foreground">{amount.toLocaleString()} {t("ر.س", "SAR")}</span>}
                    </div>

                    {isManager && order.assignedUser && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {t("المندوب:", "Rep:")} {lang === "ar" ? order.assignedUser.fullNameAr : order.assignedUser.fullNameEn}
                      </p>
                    )}

                    {appt && !isCancelled && (
                      <div className={`mt-1.5 flex items-center gap-1 text-[11px] ${apptPast ? "text-amber-600 dark:text-amber-400" : "text-blue-600 dark:text-blue-400"}`}>
                        {apptPast ? <CalendarX className="w-3 h-3" /> : <CalendarCheck className="w-3 h-3" />}
                        {formatDate(appt.appointmentDate)} {appt.startTime?.slice(0, 5)}
                        {apptPast && <span className="text-[10px]">{t("— منتهٍ", "— expired")}</span>}
                      </div>
                    )}

                    {isCancelled && order.cancellationReason && (
                      <div className="mt-1.5 bg-red-50/60 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded px-2 py-1">
                        <p className="text-[10px] text-red-600 dark:text-red-400">{t("سبب الإلغاء:", "Reason:")} {order.cancellationReason}</p>
                      </div>
                    )}

                    {!isCancelled && !isDelivered && (
                      <div className={`mt-1.5 flex items-center gap-1 text-[11px] ${nextAction.urgent ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground"}`}>
                        {nextAction.urgent && <AlertCircle className="w-3 h-3 flex-shrink-0" />}
                        <ArrowRight className="w-3 h-3 flex-shrink-0" />
                        {nextAction.label}
                      </div>
                    )}

                    <div className="flex items-center gap-2 mt-3 pt-2 border-t flex-wrap">
                      {isOpen ? (
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white h-8 flex-1"
                          onClick={() => claimMutation.mutate(order.id)}
                          disabled={claimMutation.isPending}
                          data-testid={`button-claim-mobile-${order.id}`}
                        >
                          {claimMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin me-1" /> : <Hand className="w-3.5 h-3.5 me-1" />}
                          {t("التقاط", "Claim")}
                        </Button>
                      ) : (
                        <>
                          <Button variant="outline" size="sm" className="h-8 text-xs flex-1" onClick={() => navigate(`/orders/${order.id}`)} data-testid={`button-view-mobile-${order.id}`}>
                            <Eye className="w-3.5 h-3.5 me-1" />{t("عرض", "View")}
                          </Button>
                          {!isCancelled && !isDelivered && (isMine || isManager) && (
                            <Button
                              variant="outline" size="sm"
                              className={`h-8 text-xs flex-1 ${appt ? "text-emerald-700 border-emerald-300 dark:border-emerald-800" : ""}`}
                              onClick={() => openAppointmentDialog(order)}
                              data-testid={`button-book-appt-mobile-${order.id}`}
                            >
                              {appt ? <CalendarCheck className="w-3.5 h-3.5 me-1" /> : <CalendarPlus className="w-3.5 h-3.5 me-1" />}
                              {appt ? t("الموعد", "Appt") : t("حجز موعد", "Book Appt")}
                            </Button>
                          )}
                          {!isCancelled && !isDelivered && appt && (isMine || isManager) && (
                            <Button
                              variant="outline" size="sm"
                              className="h-8 text-xs flex-1 text-violet-700 border-violet-300 dark:border-violet-800"
                              onClick={() => navigate(`/site-survey/${appt.id}?returnTo=/my-orders`)}
                              data-testid={`button-survey-mobile-${order.id}`}
                            >
                              <Ruler className="w-3.5 h-3.5 me-1" />{t("المسح", "Survey")}
                            </Button>
                          )}
                          {canCancel && (
                            <Button
                              variant="outline" size="sm"
                              className="h-8 text-xs text-red-600 border-red-300 dark:border-red-800"
                              onClick={() => { setCancelDialog(order); setCancelReason(""); setCancelNotes(""); }}
                              data-testid={`button-cancel-mobile-${order.id}`}
                            >
                              <Ban className="w-3.5 h-3.5 me-1" />{t("إلغاء", "Cancel")}
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} data-testid="button-prev-page">
                <ChevronRight className="w-4 h-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                {t(`${currentPage} / ${totalPages}`, `${currentPage} / ${totalPages}`)}
              </span>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} data-testid="button-next-page">
                <ChevronLeft className="w-4 h-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {cancelDialog && (
        <Dialog open onOpenChange={() => { setCancelDialog(null); setCancelReason(""); setCancelNotes(""); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <Ban className="w-4 h-4" />
                {t("إلغاء الطلب", "Cancel Order")}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="bg-muted/50 rounded-lg p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center flex-shrink-0">
                  <ClipboardList className="w-4 h-4 text-red-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{t("الطلب", "Order")} #{cancelDialog.quotationNumber || cancelDialog.id}</p>
                  <p className="text-sm font-semibold truncate">{cancelDialog.customer?.fullName || "—"}</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">
                  {t("سبب الإلغاء", "Cancellation Reason")}
                  <span className="text-red-500 ms-1">*</span>
                </Label>
                <Select value={cancelReason} onValueChange={setCancelReason}>
                  <SelectTrigger data-testid="select-cancel-reason">
                    <SelectValue placeholder={t("اختر سبب الإلغاء...", "Select reason...")} />
                  </SelectTrigger>
                  <SelectContent>
                    {CANCEL_REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{t(r.ar, r.en)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">{t("تفاصيل إضافية (اختياري)", "Additional Details (optional)")}</Label>
                <Textarea
                  value={cancelNotes}
                  onChange={(e) => setCancelNotes(e.target.value)}
                  placeholder={t("أي تفاصيل إضافية تود ذكرها...", "Any additional details...")}
                  className="resize-none"
                  rows={2}
                  data-testid="input-cancel-notes"
                />
              </div>
              <div className="bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg p-3">
                <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  {t("سيُسجَّل الإلغاء مع السبب والتاريخ وسيبقى الطلب مرئياً في تبويب \"ملغى\".", "Cancellation will be recorded with reason and date. The order will remain visible in the \"Cancelled\" tab.")}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setCancelDialog(null); setCancelReason(""); setCancelNotes(""); }} data-testid="button-cancel-dialog-close">
                {t("تراجع", "Go Back")}
              </Button>
              <Button
                variant="destructive"
                disabled={!cancelReason || cancelMutation.isPending}
                onClick={() => cancelMutation.mutate({ id: cancelDialog.id, reason: cancelReason, notes: cancelNotes })}
                data-testid="button-confirm-cancel"
              >
                {cancelMutation.isPending && <Loader2 className="w-4 h-4 animate-spin me-2" />}
                {t("تأكيد الإلغاء", "Confirm Cancellation")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}


      {appointmentDialog && (() => {
        const monthNames = [
          { num: 1, ar: "يناير", en: "Jan" }, { num: 2, ar: "فبراير", en: "Feb" },
          { num: 3, ar: "مارس", en: "Mar" }, { num: 4, ar: "أبريل", en: "Apr" },
          { num: 5, ar: "مايو", en: "May" }, { num: 6, ar: "يونيو", en: "Jun" },
          { num: 7, ar: "يوليو", en: "Jul" }, { num: 8, ar: "أغسطس", en: "Aug" },
          { num: 9, ar: "سبتمبر", en: "Sep" }, { num: 10, ar: "أكتوبر", en: "Oct" },
          { num: 11, ar: "نوفمبر", en: "Nov" }, { num: 12, ar: "ديسمبر", en: "Dec" },
        ];
        const availableMonths = monthNames.filter(m => m.num >= _currentMonth);
        const selectedMonthNum = parseInt(apptMonth);
        const isCurrentMonth = selectedMonthNum === _currentMonth;
        const daysInSelectedMonth = new Date(_currentYear, selectedMonthNum, 0).getDate();
        const minDay = isCurrentMonth ? _currentDay : 1;
        const availableDays = Array.from({ length: daysInSelectedMonth - minDay + 1 }, (_, i) => minDay + i);
        const selectedDay = parseInt(apptDay);
        const safeDay = availableDays.includes(selectedDay) ? selectedDay : minDay;
        const h = parseInt(apptHour);
        const m = parseInt(apptMinute);
        const dur = parseInt(apptDuration);
        const startLabel = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        const endLabel = addMinutesToTime(h, m, dur);
        const existingAppt = appointmentDialog._appointment;
        const isPastAppt = existingAppt && isAppointmentPast(existingAppt);
        const existingCountdown = existingAppt ? formatApptCountdown(existingAppt, now) : null;
        const isRescheduleMode = !!(editingApptId && isPastAppt);
        return (
          <Dialog open onOpenChange={() => { setAppointmentDialog(null); resetApptForm(); }}>
            <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {isRescheduleMode
                    ? <><CalendarPlus className="w-4 h-4 text-amber-600" />{t("إعادة جدولة الموعد", "Reschedule Appointment")}</>
                    : editingApptId
                      ? <><CalendarCheck className="w-4 h-4 text-emerald-600" />{t("تعديل الموعد", "Edit Appointment")}</>
                      : <><CalendarPlus className="w-4 h-4 text-primary" />{t("حجز موعد جديد", "Book New Appointment")}</>
                  }
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="bg-muted/50 rounded-lg p-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <ClipboardList className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("للطلب", "For Order")} #{appointmentDialog.quotationNumber || appointmentDialog.id}</p>
                    <p className="text-sm font-semibold truncate">{appointmentDialog.customer?.fullName || "—"}</p>
                    {appointmentDialog.customer?.phone && <p className="text-[11px] text-muted-foreground" dir="ltr">{appointmentDialog.customer.phone}</p>}
                  </div>
                </div>

                {existingAppt && existingCountdown && (
                  <div className={`rounded-lg p-3 border text-xs space-y-1 ${isPastAppt ? "bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800" : "bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800"}`}>
                    <div className="flex items-center justify-between">
                      <span className={`font-semibold flex items-center gap-1 ${isPastAppt ? "text-amber-700 dark:text-amber-400" : "text-blue-700 dark:text-blue-400"}`}>
                        {isPastAppt ? <><CalendarX className="w-3.5 h-3.5" />{t("الموعد السابق — منتهٍ", "Previous Appt — Expired")}</> : <><CalendarCheck className="w-3.5 h-3.5" />{t("الموعد الحالي", "Current Appointment")}</>}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${isPastAppt ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" : "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"}`}>
                        {existingCountdown.label}
                      </span>
                    </div>
                    <p className="font-medium">{existingAppt.title}</p>
                    <p className="text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" />{formatApptFullDate(existingAppt)}</p>
                    <p className="text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />{existingAppt.startTime?.slice(0, 5)} — {existingAppt.endTime?.slice(0, 5)}</p>
                  </div>
                )}

                {isRescheduleMode && (
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
                      {t("سبب إعادة الجدولة", "Reschedule Reason")}
                      <span className="text-red-500 text-xs">*</span>
                    </Label>
                    <Textarea
                      value={rescheduleReason}
                      onChange={(e) => setRescheduleReason(e.target.value)}
                      placeholder={t("اذكر السبب...", "State the reason...")}
                      className="resize-none border-amber-300 dark:border-amber-700"
                      rows={2}
                      data-testid="input-reschedule-reason"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>{t("نوع الموعد", "Appointment Type")}</Label>
                  <Select value={apptTitle} onValueChange={setApptTitle}>
                    <SelectTrigger data-testid="select-appt-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {appointmentTypes.map((at) => (
                        <SelectItem key={at.value} value={at.value}>{t(at.ar, at.en)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>{t("التاريخ", "Date")}</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-1">{t("اليوم", "Day")}</p>
                      <Select value={String(safeDay)} onValueChange={(v) => setApptDay(v)}>
                        <SelectTrigger className="h-9" data-testid="select-appt-day"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {availableDays.map((d) => (
                            <SelectItem key={d} value={String(d)}>{d}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-1">{t("الشهر", "Month")}</p>
                      <Select value={String(selectedMonthNum)} onValueChange={(v) => {
                        setApptMonth(v);
                        const newMonth = parseInt(v);
                        const newIsCurrentMonth = newMonth === _currentMonth;
                        const newMinDay = newIsCurrentMonth ? _currentDay : 1;
                        if (parseInt(apptDay) < newMinDay) setApptDay(String(newMinDay));
                      }}>
                        <SelectTrigger className="h-9" data-testid="select-appt-month"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {availableMonths.map((mo) => (
                            <SelectItem key={mo.num} value={String(mo.num)}>{t(mo.ar, mo.en)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-1">{t("السنة", "Year")}</p>
                      <div className="h-9 flex items-center px-3 border rounded-md bg-muted/50 text-sm font-medium" data-testid="text-appt-year">
                        {_currentYear}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>{t("وقت البدء", "Start Time")}</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-1">{t("الساعة", "Hour")}</p>
                      <Select value={apptHour} onValueChange={setApptHour}>
                        <SelectTrigger className="h-9" data-testid="select-appt-hour"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, i) => i).map((hh) => (
                            <SelectItem key={hh} value={String(hh)}>{String(hh).padStart(2, "0")}:00</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-1">{t("الدقيقة", "Minute")}</p>
                      <Select value={apptMinute} onValueChange={setApptMinute}>
                        <SelectTrigger className="h-9" data-testid="select-appt-minute"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["00", "15", "30", "45"].map((min) => (
                            <SelectItem key={min} value={min}>{min}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>{t("المدة", "Duration")}</Label>
                  <Select value={apptDuration} onValueChange={setApptDuration}>
                    <SelectTrigger data-testid="select-appt-duration"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">{t("30 دقيقة", "30 min")}</SelectItem>
                      <SelectItem value="60">{t("ساعة واحدة", "1 hour")}</SelectItem>
                      <SelectItem value="90">{t("ساعة ونصف", "1.5 hours")}</SelectItem>
                      <SelectItem value="120">{t("ساعتان", "2 hours")}</SelectItem>
                      <SelectItem value="180">{t("ثلاث ساعات", "3 hours")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
                    <Clock className="w-3 h-3" />
                    {t(`من ${startLabel} إلى ${endLabel}`, `From ${startLabel} to ${endLabel}`)}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label>{t("ملاحظات", "Notes")}</Label>
                  <Textarea
                    value={apptNotes}
                    onChange={(e) => setApptNotes(e.target.value)}
                    placeholder={t("ملاحظات إضافية...", "Additional notes...")}
                    className="resize-none"
                    rows={2}
                    data-testid="input-appt-notes"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setAppointmentDialog(null); resetApptForm(); }} data-testid="button-cancel-appt">
                  {t("إلغاء", "Cancel")}
                </Button>
                <Button
                  disabled={appointmentMutation.isPending || updateAppointmentMutation.isPending || (isRescheduleMode && !rescheduleReason.trim())}
                  onClick={submitAppointment}
                  className={isRescheduleMode ? "bg-amber-600 hover:bg-amber-700 text-white" : editingApptId ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}
                  data-testid="button-submit-appt"
                >
                  {(appointmentMutation.isPending || updateAppointmentMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin me-2" />}
                  {isRescheduleMode ? t("تأكيد إعادة الجدولة", "Confirm Reschedule") : editingApptId ? t("تعديل الموعد", "Update Appointment") : t("حجز الموعد", "Book Appointment")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {newOrderDialog && (
        <Dialog open onOpenChange={() => { setNewOrderDialog(false); setNewOrderForm({ fullName: "", phone: "", productDescription: "", notes: "", city: "" }); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("طلب جديد", "New Order")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="my-order-name">{t("اسم العميل", "Customer Name")} *</Label>
                <Input
                  id="my-order-name"
                  value={newOrderForm.fullName}
                  onChange={(e) => setNewOrderForm({ ...newOrderForm, fullName: e.target.value })}
                  placeholder={t("أدخل اسم العميل", "Enter customer name")}
                  data-testid="input-my-order-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="my-order-phone">{t("رقم الجوال", "Phone Number")} *</Label>
                <Input
                  id="my-order-phone"
                  value={newOrderForm.phone}
                  onChange={(e) => setNewOrderForm({ ...newOrderForm, phone: e.target.value })}
                  placeholder="05XXXXXXXX"
                  dir="ltr"
                  data-testid="input-my-order-phone"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("المدينة", "City")}</Label>
                <Select value={newOrderForm.city || "none"} onValueChange={(v) => setNewOrderForm({ ...newOrderForm, city: v === "none" ? "" : v })}>
                  <SelectTrigger data-testid="select-my-order-city">
                    <SelectValue placeholder={t("اختر المدينة (اختياري)", "Select city (optional)")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("— غير محددة —", "— Not specified —")}</SelectItem>
                    {["الرياض","جدة","مكة المكرمة","المدينة المنورة","الدمام","الخبر","أبها","خميس مشيط","تبوك","بريدة","حائل","نجران","جازان","ينبع","الطائف","القطيف","الأحساء"].map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="my-order-product">{t("وصف المنتج / الخدمة", "Product / Service Description")}</Label>
                <Input
                  id="my-order-product"
                  value={newOrderForm.productDescription}
                  onChange={(e) => setNewOrderForm({ ...newOrderForm, productDescription: e.target.value })}
                  placeholder={t("مثال: مطبخ، دولاب، غرفة نوم...", "E.g. kitchen, wardrobe, bedroom...")}
                  data-testid="input-my-order-product"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="my-order-notes">{t("ملاحظات", "Notes")}</Label>
                <Textarea
                  id="my-order-notes"
                  value={newOrderForm.notes}
                  onChange={(e) => setNewOrderForm({ ...newOrderForm, notes: e.target.value })}
                  placeholder={t("أي ملاحظات إضافية...", "Any additional notes...")}
                  className="resize-none"
                  rows={2}
                  data-testid="input-my-order-notes"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewOrderDialog(false)} data-testid="button-cancel-new-order">
                {t("إلغاء", "Cancel")}
              </Button>
              <Button
                disabled={!newOrderForm.fullName.trim() || !newOrderForm.phone.trim() || !newOrderForm.productDescription.trim() || createOrderMutation.isPending}
                onClick={() => createOrderMutation.mutate(newOrderForm)}
                data-testid="button-submit-new-order"
              >
                {createOrderMutation.isPending && <Loader2 className="w-4 h-4 animate-spin me-2" />}
                {t("إنشاء الطلب", "Create Order")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
