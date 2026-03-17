import { useState, useMemo, useEffect } from "react";
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
  Loader2,
  Search,
  ClipboardList,
  UserCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Eye,
  Phone,
  MapPin,
  Calendar,
  Clock,
  Pencil,
  Plus,
  Hand,
  Zap,
  CalendarPlus,
  CalendarCheck,
  CalendarX,
  Filter,
  X,
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
  if (days > 0) return t(`${days} يوم ${hours % 24} ساعة`, `${days}d ${hours % 24}h`);
  if (hours > 0) return t(`${hours} ساعة ${mins % 60} دقيقة`, `${hours}h ${mins % 60}m`);
  return t(`${mins} دقيقة`, `${mins}m`);
}

type StageFilter = "all" | "open" | "mine" | "sent" | "approved" | "production" | "completed";

function getOrderStage(q: any, workOrders: any[], contracts: any[], userId: number): StageFilter {
  if (q.status === "rejected" || q.status === "expired") return "completed";
  if ((q.status === "requested" || q.status === "open") && !q.assignedTo) return "open";
  if (q.status === "approved") {
    const wo = workOrders.find((w: any) => {
      const contract = w._contract;
      return contract?.quotationId === q.id;
    });
    if (wo) {
      if (["completed", "delivered", "installed"].includes(wo.status)) return "completed";
      return "production";
    }
    return "approved";
  }
  if (q.status === "sent") return "sent";
  if (q.status === "draft" && q.assignedTo === userId) return "mine";
  return "mine";
}

const stageBadgeConfig: Record<string, { ar: string; en: string; className: string }> = {
  open: { ar: "مفتوح", en: "Open", className: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
  mine: { ar: "مسودة", en: "Draft", className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  sent: { ar: "مُرسل", en: "Sent", className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  approved: { ar: "معتمد", en: "Approved", className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  production: { ar: "قيد التصنيع", en: "In Production", className: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300" },
  completed: { ar: "مكتمل", en: "Completed", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" },
};

const fallbackBadge = { ar: "غير محدد", en: "Unknown", className: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" };

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

  const [activeTab, setActiveTab] = useState<"open" | "mine">("mine");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [viewOrder, setViewOrder] = useState<any | null>(null);
  const [showClaimTransition, setShowClaimTransition] = useState(false);
  const [newOrderDialog, setNewOrderDialog] = useState(false);
  const [newOrderForm, setNewOrderForm] = useState({ fullName: "", phone: "", productDescription: "", notes: "" });
  const [showNewOrderTransition, setShowNewOrderTransition] = useState(false);
  const [appointmentDialog, setAppointmentDialog] = useState<any | null>(null);
  const [editingApptId, setEditingApptId] = useState<number | null>(null);
  const [rescheduleReason, setRescheduleReason] = useState("");

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

  const [sortCol, setSortCol] = useState<string>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [apptFilter, setApptFilter] = useState<string>("all");

  const perPage = 10;

  const { data: quotations = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/quotations"],
    refetchInterval: 10000,
  });
  const { data: customers = [] } = useQuery<any[]>({ queryKey: ["/api/customers"] });
  const { data: usersData = [] } = useQuery<any[]>({ queryKey: ["/api/users"] });
  const { data: workOrders = [] } = useQuery<any[]>({ queryKey: ["/api/work-orders"] });
  const { data: contracts = [] } = useQuery<any[]>({ queryKey: ["/api/contracts"] });
  const { data: designAssignments = [] } = useQuery<any[]>({ queryKey: ["/api/design-assignments"] });
  const { data: appointments = [] } = useQuery<any[]>({ queryKey: ["/api/appointments"] });

  const workOrdersWithContract = useMemo(() => {
    return workOrders.map((wo: any) => ({
      ...wo,
      _contract: contracts.find((c: any) => c.id === wo.contractId),
    }));
  }, [workOrders, contracts]);

  const claimMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("POST", `/api/quotations/${id}/claim`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setShowClaimTransition(true);
    },
    onError: (error: any) => {
      toast({ title: error?.message || t("فشل التقاط الطلب", "Failed to claim order"), variant: "destructive" });
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: async (data: { fullName: string; phone: string; productDescription: string; notes: string }) => {
      return apiRequest("POST", "/api/orders/create-direct", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setNewOrderDialog(false);
      setNewOrderForm({ fullName: "", phone: "", productDescription: "", notes: "" });
      setShowNewOrderTransition(true);
    },
    onError: (error: any) => {
      toast({ title: error?.message || t("فشل إنشاء الطلب", "Failed to create order"), variant: "destructive" });
    },
  });

  function isAppointmentPast(appt: any): boolean {
    if (!appt?.appointmentDate) return false;
    const apptDateTime = new Date(`${appt.appointmentDate}T${appt.endTime || appt.startTime || "23:59"}`);
    return apptDateTime < new Date();
  }

  function formatApptCountdown(appt: any, nowTs: number): { label: string; urgent: boolean; past: boolean } {
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
    if (days > 0) return { label: t(`بعد ${days} يوم و${hrs} ساعة`, `In ${days}d ${hrs}h`), urgent: days <= 1, past: false };
    if (hrs > 0) return { label: t(`بعد ${hrs} ساعة و${mins} دقيقة`, `In ${hrs}h ${mins}m`), urgent: true, past: false };
    return { label: t(`بعد ${mins} دقيقة`, `In ${mins}m`), urgent: true, past: false };
  }

  function formatApptFullDate(appt: any): string {
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

  const appointmentMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/appointments", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      setAppointmentDialog(null);
      resetApptForm();
      toast({ title: t("تم حجز الموعد بنجاح!", "Appointment booked successfully!") });
    },
    onError: (error: any) => {
      const msg = error?.message || "";
      if (msg.includes("تعارض") || msg.includes("conflict")) {
        toast({ title: t("يوجد تعارض مع موعد آخر في نفس الوقت", "Time conflict with another appointment"), variant: "destructive" });
      } else {
        toast({ title: t("فشل حجز الموعد", "Failed to book appointment"), variant: "destructive" });
      }
    },
  });

  const updateAppointmentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return apiRequest("PATCH", `/api/appointments/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      setAppointmentDialog(null);
      resetApptForm();
      toast({ title: t("تم تعديل الموعد بنجاح!", "Appointment updated successfully!") });
    },
    onError: (error: any) => {
      const msg = error?.message || "";
      if (msg.includes("تعارض") || msg.includes("conflict")) {
        toast({ title: t("يوجد تعارض مع موعد آخر في نفس الوقت", "Time conflict with another appointment"), variant: "destructive" });
      } else {
        toast({ title: t("فشل تعديل الموعد", "Failed to update appointment"), variant: "destructive" });
      }
    },
  });

  const appointmentByQuotation = useMemo(() => {
    const map: Record<number, any> = {};
    for (const appt of appointments as any[]) {
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

  const enrichedOrders = useMemo(() => {
    if (!user) return [];
    return quotations.map((q: any) => {
      const customer = customers.find((c: any) => c.id === q.customerId);
      const assignedUser = q.assignedTo ? usersData.find((u: any) => u.id === q.assignedTo) : null;
      const stage = getOrderStage(q, workOrdersWithContract, contracts, user.id);
      const _appointment = appointmentByQuotation[q.id] || null;
      return { ...q, customer, assignedUser, stage, _appointment };
    });
  }, [quotations, customers, usersData, workOrdersWithContract, contracts, user, appointmentByQuotation]);

  const openOrders = useMemo(() => {
    return enrichedOrders.filter((o: any) => o.stage === "open");
  }, [enrichedOrders]);

  const myOrders = useMemo(() => {
    if (!user) return [];
    return enrichedOrders.filter((o: any) => o.assignedTo === user.id && o.stage !== "open");
  }, [enrichedOrders, user]);

  const currentList = activeTab === "open" ? openOrders : myOrders;

  function handleSortClick(col: string) {
    if (sortCol === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
    setCurrentPage(1);
  }

  const filtered = useMemo(() => {
    let list = currentList;

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((o: any) =>
        o.customer?.fullName?.toLowerCase().includes(q) ||
        o.customer?.phone?.includes(q) ||
        String(o.id).includes(q) ||
        String(o.quotationNumber).includes(q)
      );
    }

    if (stageFilter !== "all") {
      list = list.filter((o: any) => o.stage === stageFilter);
    }

    if (apptFilter === "booked") {
      list = list.filter((o: any) => !!o._appointment);
    } else if (apptFilter === "not-booked") {
      list = list.filter((o: any) => !o._appointment);
    }

    return [...list].sort((a: any, b: any) => {
      let valA: any, valB: any;
      if (sortCol === "id") {
        valA = a.quotationNumber || a.id;
        valB = b.quotationNumber || b.id;
      } else if (sortCol === "customer") {
        valA = a.customer?.fullName || "";
        valB = b.customer?.fullName || "";
      } else if (sortCol === "stage") {
        valA = a.stage || "";
        valB = b.stage || "";
      } else if (sortCol === "amount") {
        valA = Number(a.finalPrice || a.totalPrice || 0);
        valB = Number(b.finalPrice || b.totalPrice || 0);
      } else if (sortCol === "appt") {
        valA = a._appointment ? new Date(a._appointment.appointmentDate).getTime() : 0;
        valB = b._appointment ? new Date(b._appointment.appointmentDate).getTime() : 0;
      } else {
        valA = new Date(a.createdAt).getTime();
        valB = new Date(b.createdAt).getTime();
      }
      if (typeof valA === "string") {
        return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortDir === "asc" ? valA - valB : valB - valA;
    });
  }, [currentList, searchQuery, stageFilter, apptFilter, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  function addMinutesToTime(h: number, m: number, mins: number): string {
    const total = h * 60 + m + mins;
    return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  function openAppointmentDialog(order: any) {
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
      updateAppointmentMutation.mutate({
        id: editingApptId,
        data: { status: "rescheduled", failNotes: rescheduleReason || t("إعادة تعيين بدون سبب", "Rescheduled without reason") },
      }, {
        onSuccess: () => {
          appointmentMutation.mutate(payload);
        },
      });
    } else if (editingApptId) {
      updateAppointmentMutation.mutate({ id: editingApptId, data: payload });
    } else {
      appointmentMutation.mutate(payload);
    }
  }

  function formatDate(dateStr: string) {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US", {
      month: "short",
      day: "numeric",
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="page-my-orders">
      <LoadingTransition
        show={showClaimTransition}
        message={t("جاري التقاط الطلب...", "Claiming order...")}
        subMessage={t("يتم تحديث حالة الطلب", "Updating order status")}
        duration={1200}
        onComplete={() => {
          setShowClaimTransition(false);
          setActiveTab("mine");
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
            {t("طلباتي", "My Orders")}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("إدارة ومتابعة طلباتك", "Manage and track your orders")}
          </p>
        </div>
        <Button onClick={() => setNewOrderDialog(true)} data-testid="button-new-order-my">
          <Plus className="w-4 h-4 me-1.5" />
          {t("طلب جديد", "New Order")}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card
          className={`cursor-pointer transition-all ${activeTab === "open" ? "border-primary ring-1 ring-primary/20" : "hover:border-primary/30"}`}
          onClick={() => { setActiveTab("open"); setCurrentPage(1); }}
          data-testid="card-open-pool"
        >
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
              <Zap className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <p className="text-2xl font-bold text-amber-600">{openOrders.length}</p>
              <p className="text-xs text-muted-foreground">{t("طلبات مفتوحة", "Open Orders")}</p>
            </div>
            {openOrders.length > 0 && (
              <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            )}
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-all ${activeTab === "mine" ? "border-primary ring-1 ring-primary/20" : "hover:border-primary/30"}`}
          onClick={() => { setActiveTab("mine"); setCurrentPage(1); }}
          data-testid="card-my-orders-count"
        >
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <p className="text-2xl font-bold text-blue-600">{myOrders.length}</p>
              <p className="text-xs text-muted-foreground">{t("طلباتي", "My Orders")}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("بحث بالاسم أو الهاتف أو رقم الطلب...", "Search by name, phone or order #...")}
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            className="ps-9 h-9 text-sm"
            data-testid="input-search-my-orders"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Filter className="w-3.5 h-3.5" />
            {t("تصفية:", "Filter:")}
          </div>
          <Select value={stageFilter} onValueChange={(v) => { setStageFilter(v); setCurrentPage(1); }}>
            <SelectTrigger className="h-7 text-xs w-[130px]" data-testid="select-stage-filter">
              <SelectValue placeholder={t("المرحلة", "Stage")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("كل المراحل", "All Stages")}</SelectItem>
              <SelectItem value="mine">{t("مسودة", "Draft")}</SelectItem>
              <SelectItem value="sent">{t("مُرسل", "Sent")}</SelectItem>
              <SelectItem value="approved">{t("معتمد", "Approved")}</SelectItem>
              <SelectItem value="production">{t("قيد التصنيع", "In Production")}</SelectItem>
              <SelectItem value="completed">{t("مكتمل", "Completed")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={apptFilter} onValueChange={(v) => { setApptFilter(v); setCurrentPage(1); }}>
            <SelectTrigger className="h-7 text-xs w-[140px]" data-testid="select-appt-filter">
              <SelectValue placeholder={t("المواعيد", "Appointments")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("كل الطلبات", "All Orders")}</SelectItem>
              <SelectItem value="booked">{t("تم حجز موعد", "Appointment Booked")}</SelectItem>
              <SelectItem value="not-booked">{t("بدون موعد", "No Appointment")}</SelectItem>
            </SelectContent>
          </Select>
          {(stageFilter !== "all" || apptFilter !== "all" || searchQuery) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => { setStageFilter("all"); setApptFilter("all"); setSearchQuery(""); setCurrentPage(1); }}
              data-testid="button-clear-filters"
            >
              <X className="w-3 h-3 me-1" />
              {t("مسح الفلاتر", "Clear")}
            </Button>
          )}
          {filtered.length > 0 && (
            <span className="text-xs text-muted-foreground ms-auto">
              {t(`${filtered.length} طلب`, `${filtered.length} orders`)}
            </span>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {activeTab === "open" && openOrders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
              {t("لا توجد طلبات مفتوحة حالياً", "No open orders available")}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <ClipboardList className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
              {t("لا توجد طلبات", "No orders found")}
            </div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-orders">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      {[
                        { col: "id", labelAr: "#", labelEn: "#", cls: "w-16" },
                        { col: "customer", labelAr: "العميل", labelEn: "Customer", cls: "" },
                        { col: "none", labelAr: "الهاتف", labelEn: "Phone", cls: "" },
                        { col: "none2", labelAr: "المنتج", labelEn: "Product", cls: "" },
                        { col: "amount", labelAr: "المبلغ", labelEn: "Amount", cls: "" },
                        { col: "stage", labelAr: "المرحلة", labelEn: "Stage", cls: "" },
                        { col: "date", labelAr: "التاريخ", labelEn: "Date", cls: "" },
                        { col: "appt", labelAr: "الموعد", labelEn: "Appointment", cls: "" },
                        { col: "actions", labelAr: "إجراءات", labelEn: "Actions", cls: "w-24" },
                      ].map(({ col, labelAr, labelEn, cls }) => (
                        <th
                          key={col}
                          className={`text-start px-4 py-3 font-semibold text-xs text-muted-foreground select-none ${cls} ${!["none", "none2", "actions"].includes(col) ? "cursor-pointer hover:text-foreground transition-colors" : ""}`}
                          onClick={() => !["none", "none2", "actions"].includes(col) && handleSortClick(col)}
                          data-testid={`th-${col}`}
                        >
                          <span className="inline-flex items-center gap-1">
                            {t(labelAr, labelEn)}
                            {sortCol === col && (
                              sortDir === "asc"
                                ? <ChevronUp className="w-3 h-3" />
                                : <ChevronDown className="w-3 h-3" />
                            )}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {paginated.map((order: any) => {
                      const itemDesc = order.items?.[0]?.description || order.items?.[0]?.productType || "—";
                      const amount = Number(order.finalPrice || order.totalPrice || 0);
                      const isOpen = order.stage === "open";
                      const badgeCfg = stageBadgeConfig[order.stage] || fallbackBadge;
                      const appt = order._appointment;
                      return (
                        <tr
                          key={order.id}
                          className={`hover:bg-muted/30 transition-colors ${isOpen ? "bg-amber-50/30 dark:bg-amber-950/10" : ""}`}
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
                            {order.customer?.city && (
                              <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                <MapPin className="w-3 h-3" />{order.customer.city}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {order.customer?.phone ? (
                              <span className="text-xs text-muted-foreground" dir="ltr">{order.customer.phone}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-xs truncate max-w-[140px]" title={itemDesc}>{itemDesc}</p>
                          </td>
                          <td className="px-4 py-3">
                            {amount > 0 ? (
                              <span className="text-xs font-semibold">{amount.toLocaleString()} {t("ر.س", "SAR")}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="secondary" className={`text-[10px] px-2 py-0.5 ${badgeCfg.className}`} data-testid={`badge-status-${order.id}`}>
                              {t(badgeCfg.ar, badgeCfg.en)}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</span>
                          </td>
                          <td className="px-4 py-3" data-testid={`td-appt-${order.id}`}>
                            {appt ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full w-fit">
                                  <CalendarCheck className="w-3 h-3" />
                                  {t("تم الحجز", "Booked")}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  {formatDate(appt.appointmentDate)} {appt.startTime ? appt.startTime.slice(0, 5) : ""}
                                </span>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                <CalendarX className="w-3 h-3" />
                                {t("لا يوجد", "None")}
                              </span>
                            )}
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
                                  {claimMutation.isPending ? (
                                    <Loader2 className="w-3 h-3 animate-spin me-1" />
                                  ) : (
                                    <Hand className="w-3 h-3 me-1" />
                                  )}
                                  {t("التقاط", "Claim")}
                                </Button>
                              ) : (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    onClick={() => setViewOrder(order)}
                                    title={t("عرض التفاصيل", "View Details")}
                                    data-testid={`button-view-my-${order.id}`}
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className={`h-7 w-7 p-0 ${appt ? "text-emerald-600 hover:text-emerald-700" : "text-primary hover:text-primary"}`}
                                    onClick={() => openAppointmentDialog(order)}
                                    title={appt ? t("تعديل الموعد", "Edit Appointment") : t("حجز موعد", "Book Appointment")}
                                    data-testid={`button-book-appt-${order.id}`}
                                  >
                                    {appt ? <CalendarCheck className="w-3.5 h-3.5" /> : <CalendarPlus className="w-3.5 h-3.5" />}
                                  </Button>
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

              <div className="md:hidden divide-y">
                {paginated.map((order: any) => {
                  const itemDesc = order.items?.[0]?.description || order.items?.[0]?.productType || "—";
                  const amount = Number(order.finalPrice || order.totalPrice || 0);
                  const isOpen = order.stage === "open";
                  const badgeCfg = stageBadgeConfig[order.stage] || fallbackBadge;
                  const appt = order._appointment;
                  return (
                    <div
                      key={order.id}
                      className={`p-4 hover:bg-muted/30 transition-colors ${isOpen ? "bg-amber-50/30 dark:bg-amber-950/10" : ""}`}
                      data-testid={`card-order-${order.id}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-muted-foreground">
                            #{order.quotationNumber || order.id}
                          </span>
                          <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${badgeCfg.className}`}>
                            {t(badgeCfg.ar, badgeCfg.en)}
                          </Badge>
                          {appt && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0 rounded-full">
                              <CalendarCheck className="w-2.5 h-2.5" />
                              {formatDate(appt.appointmentDate)}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground">{formatDate(order.createdAt)}</span>
                      </div>
                      <p className="font-medium text-sm truncate" data-testid={`text-customer-mobile-${order.id}`}>
                        {order.customer?.fullName || "—"}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                        {order.customer?.phone && (
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1" dir="ltr">
                            <Phone className="w-3 h-3" />{order.customer.phone}
                          </span>
                        )}
                        {order.customer?.city && (
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <MapPin className="w-3 h-3" />{order.customer.city}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 truncate" title={itemDesc}>{itemDesc}</p>
                      {amount > 0 && (
                        <p className="text-xs font-semibold mt-1">{amount.toLocaleString()} {t("ر.س", "SAR")}</p>
                      )}
                      <div className="flex items-center gap-2 mt-3 pt-2 border-t">
                        {isOpen ? (
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white h-8 flex-1"
                            onClick={() => claimMutation.mutate(order.id)}
                            disabled={claimMutation.isPending}
                            data-testid={`button-claim-mobile-${order.id}`}
                          >
                            {claimMutation.isPending ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin me-1" />
                            ) : (
                              <Hand className="w-3.5 h-3.5 me-1" />
                            )}
                            {t("التقاط", "Claim")}
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 flex-1 text-xs"
                              onClick={() => setViewOrder(order)}
                              data-testid={`button-view-mobile-${order.id}`}
                            >
                              <Eye className="w-3.5 h-3.5 me-1" />
                              {t("عرض", "View")}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className={`h-8 flex-1 text-xs ${appt ? "text-emerald-700 border-emerald-300 dark:border-emerald-800" : "text-primary border-primary/30"}`}
                              onClick={() => openAppointmentDialog(order)}
                              data-testid={`button-book-appt-mobile-${order.id}`}
                            >
                              {appt ? <CalendarCheck className="w-3.5 h-3.5 me-1" /> : <CalendarPlus className="w-3.5 h-3.5 me-1" />}
                              {appt ? t("تعديل الموعد", "Edit Appt") : t("حجز موعد", "Book Appt")}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {filtered.length > perPage && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
              <p className="text-xs text-muted-foreground">
                {t(
                  `عرض ${(currentPage - 1) * perPage + 1} - ${Math.min(currentPage * perPage, filtered.length)} من ${filtered.length}`,
                  `Showing ${(currentPage - 1) * perPage + 1} - ${Math.min(currentPage * perPage, filtered.length)} of ${filtered.length}`
                )}
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={currentPage <= 1} onClick={() => setCurrentPage(currentPage - 1)} data-testid="button-prev-page-my">
                  {lang === "ar" ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
                </Button>
                <span className="text-xs text-muted-foreground px-2">{currentPage}/{totalPages}</span>
                <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(currentPage + 1)} data-testid="button-next-page-my">
                  {lang === "ar" ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {viewOrder && (
        <Dialog open onOpenChange={() => setViewOrder(null)}>
          <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>{t("تفاصيل الطلب", "Order Details")} #{viewOrder.quotationNumber || viewOrder.id}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2 overflow-y-auto flex-1 pe-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-[11px] text-muted-foreground mb-1">{t("العميل", "Customer")}</p>
                  <p className="text-sm font-semibold">{viewOrder.customer?.fullName || "—"}</p>
                  {viewOrder.customer?.phone && (
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1" dir="ltr">
                      <Phone className="w-3 h-3" /> {viewOrder.customer.phone}
                    </p>
                  )}
                  {viewOrder.customer?.city && (
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {viewOrder.customer.city}
                    </p>
                  )}
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-[11px] text-muted-foreground mb-1">{t("الحالة", "Status")}</p>
                  <p className="text-sm font-semibold">{viewOrder.status}</p>
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {viewOrder.createdAt ? new Date(viewOrder.createdAt).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US", { year: "numeric", month: "long", day: "numeric" }) : "—"}
                  </p>
                </div>
              </div>

              {viewOrder.items && viewOrder.items.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-2">{t("المنتجات", "Products")}</p>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/50">
                          <th className="text-start px-3 py-2 font-medium">{t("الوصف", "Description")}</th>
                          <th className="text-start px-3 py-2 font-medium">{t("الكمية", "Qty")}</th>
                          <th className="text-start px-3 py-2 font-medium">{t("السعر", "Price")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewOrder.items.map((item: any, idx: number) => (
                          <tr key={idx} className="border-t">
                            <td className="px-3 py-2">{item.description || item.productType || "—"}</td>
                            <td className="px-3 py-2">{item.quantity || 1}</td>
                            <td className="px-3 py-2">{Number(item.unitPrice || 0).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {viewOrder.notes && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-[11px] text-muted-foreground mb-1">{t("ملاحظات", "Notes")}</p>
                  <p className="text-xs">{viewOrder.notes}</p>
                </div>
              )}

              {viewOrder.claimedAt && (
                <div className="bg-green-50/50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg p-3">
                  <p className="text-[11px] text-green-600 dark:text-green-400 font-medium mb-1">{t("تم الالتقاط", "Claimed")}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(viewOrder.claimedAt).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              )}

              {(() => {
                const appt = viewOrder._appointment;
                if (!appt) return null;
                const countdown = formatApptCountdown(appt, now);
                return (
                  <div className={`rounded-lg p-3 border ${countdown.past ? "bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900" : "bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900"}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className={`text-[11px] font-semibold flex items-center gap-1 ${countdown.past ? "text-amber-700 dark:text-amber-400" : "text-blue-700 dark:text-blue-400"}`}>
                        {countdown.past
                          ? <><CalendarX className="w-3.5 h-3.5" />{t("موعد منتهٍ — يحتاج إعادة تعيين", "Expired Appointment — Needs Reschedule")}</>
                          : <><CalendarCheck className="w-3.5 h-3.5" />{t("موعد محجوز", "Appointment Booked")}</>
                        }
                      </p>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${countdown.past ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" : countdown.urgent ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" : "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"}`}>
                        {countdown.label}
                      </span>
                    </div>
                    <p className="text-xs font-medium">{appt.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatApptFullDate(appt)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {appt.startTime?.slice(0, 5)} — {appt.endTime?.slice(0, 5)}
                    </p>
                    {appt.notes && (
                      <p className="text-[11px] text-muted-foreground mt-1 border-t pt-1">{appt.notes}</p>
                    )}
                  </div>
                );
              })()}
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setViewOrder(null)} data-testid="button-close-view-my">
                {t("إغلاق", "Close")}
              </Button>
              {viewOrder.assignedTo === user?.id && (() => {
                const appt = viewOrder._appointment;
                if (viewOrder.inspectionDate) {
                  return (
                    <Button variant="secondary" onClick={() => { window.location.href = `/dashboard/design-studio/${viewOrder.id}`; }} data-testid="button-design-studio-my">
                      <Pencil className="w-3.5 h-3.5 me-1.5" />
                      {t("استوديو التصميم", "Design Studio")}
                    </Button>
                  );
                }
                if (!appt) {
                  return (
                    <Button variant="default" onClick={() => { setViewOrder(null); openAppointmentDialog(viewOrder); }} data-testid="button-book-from-view">
                      <CalendarPlus className="w-3.5 h-3.5 me-1.5" />
                      {t("حجز موعد رفع مقاسات", "Book Measurement")}
                    </Button>
                  );
                }
                const isPast = isAppointmentPast(appt);
                if (isPast) {
                  return (
                    <Button
                      className="bg-amber-600 hover:bg-amber-700 text-white"
                      onClick={() => { setViewOrder(null); openAppointmentDialog(viewOrder); }}
                      data-testid="button-reschedule-from-view"
                    >
                      <CalendarPlus className="w-3.5 h-3.5 me-1.5" />
                      {t("إعادة تعيين موعد جديد", "Reschedule Appointment")}
                    </Button>
                  );
                }
                return (
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => { setViewOrder(null); openAppointmentDialog(viewOrder); }}
                    data-testid="button-edit-appt-from-view"
                  >
                    <CalendarCheck className="w-3.5 h-3.5 me-1.5" />
                    {t("تعديل الموعد المحجوز", "Edit Appointment")}
                  </Button>
                );
              })()}
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
                    ? <><CalendarPlus className="w-4 h-4 text-amber-600" />{t("إعادة تعيين موعد جديد", "Reschedule Appointment")}</>
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
                    {appointmentDialog.customer?.phone && (
                      <p className="text-[11px] text-muted-foreground" dir="ltr">{appointmentDialog.customer.phone}</p>
                    )}
                  </div>
                </div>

                {existingAppt && existingCountdown && (
                  <div className={`rounded-lg p-3 border text-xs space-y-1 ${isPastAppt ? "bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800" : "bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800"}`}>
                    <div className="flex items-center justify-between">
                      <span className={`font-semibold flex items-center gap-1 ${isPastAppt ? "text-amber-700 dark:text-amber-400" : "text-blue-700 dark:text-blue-400"}`}>
                        {isPastAppt
                          ? <><CalendarX className="w-3.5 h-3.5" />{t("الموعد السابق — منتهٍ", "Previous Appt — Expired")}</>
                          : <><CalendarCheck className="w-3.5 h-3.5" />{t("الموعد الحالي", "Current Appointment")}</>
                        }
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${isPastAppt ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" : "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"}`}>
                        {existingCountdown.label}
                      </span>
                    </div>
                    <p className="font-medium">{existingAppt.title}</p>
                    <p className="text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" />{formatApptFullDate(existingAppt)}
                    </p>
                    <p className="text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />{existingAppt.startTime?.slice(0, 5)} — {existingAppt.endTime?.slice(0, 5)}
                    </p>
                  </div>
                )}

                {isRescheduleMode && (
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
                      <span>{t("سبب إعادة التعيين", "Reason for Reschedule")}</span>
                      <span className="text-red-500 text-xs">*</span>
                    </Label>
                    <Textarea
                      value={rescheduleReason}
                      onChange={(e) => setRescheduleReason(e.target.value)}
                      placeholder={t("اذكر السبب: لم تتم الزيارة / تغيير مفاجئ / طلب العميل...", "Reason: visit not done / sudden change / client request...")}
                      className="resize-none border-amber-300 dark:border-amber-700 focus:ring-amber-400"
                      rows={2}
                      data-testid="input-reschedule-reason"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>{t("نوع الموعد", "Appointment Type")}</Label>
                  <Select value={apptTitle} onValueChange={setApptTitle}>
                    <SelectTrigger data-testid="select-appt-type">
                      <SelectValue />
                    </SelectTrigger>
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
                        <SelectTrigger className="h-9" data-testid="select-appt-day">
                          <SelectValue />
                        </SelectTrigger>
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
                        <SelectTrigger className="h-9" data-testid="select-appt-month">
                          <SelectValue />
                        </SelectTrigger>
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
                        <SelectTrigger className="h-9" data-testid="select-appt-hour">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                            <SelectItem key={h} value={String(h)}>{String(h).padStart(2, "0")}:00</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-1">{t("الدقيقة", "Minute")}</p>
                      <Select value={apptMinute} onValueChange={setApptMinute}>
                        <SelectTrigger className="h-9" data-testid="select-appt-minute">
                          <SelectValue />
                        </SelectTrigger>
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
                    <SelectTrigger data-testid="select-appt-duration">
                      <SelectValue />
                    </SelectTrigger>
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
                  disabled={
                    appointmentMutation.isPending || updateAppointmentMutation.isPending ||
                    (isRescheduleMode && !rescheduleReason.trim())
                  }
                  onClick={submitAppointment}
                  className={
                    isRescheduleMode
                      ? "bg-amber-600 hover:bg-amber-700 text-white"
                      : editingApptId
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                        : ""
                  }
                  data-testid="button-submit-appt"
                >
                  {(appointmentMutation.isPending || updateAppointmentMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin me-2" />}
                  {isRescheduleMode
                    ? t("تأكيد إعادة التعيين", "Confirm Reschedule")
                    : editingApptId
                      ? t("تعديل الموعد", "Update Appointment")
                      : t("حجز الموعد", "Book Appointment")
                  }
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {newOrderDialog && (
        <Dialog open onOpenChange={() => { setNewOrderDialog(false); setNewOrderForm({ fullName: "", phone: "", productDescription: "", notes: "" }); }}>
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
                <Label htmlFor="my-order-product">{t("وصف المنتج", "Product Description")} *</Label>
                <Input
                  id="my-order-product"
                  value={newOrderForm.productDescription}
                  onChange={(e) => setNewOrderForm({ ...newOrderForm, productDescription: e.target.value })}
                  placeholder={t("مطبخ، دولاب، باب...", "Kitchen, wardrobe, door...")}
                  data-testid="input-my-order-product"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="my-order-notes">{t("ملاحظات", "Notes")}</Label>
                <Textarea
                  id="my-order-notes"
                  value={newOrderForm.notes}
                  onChange={(e) => setNewOrderForm({ ...newOrderForm, notes: e.target.value })}
                  placeholder={t("ملاحظات إضافية (اختياري)", "Additional notes (optional)")}
                  className="resize-none"
                  rows={3}
                  data-testid="input-my-order-notes"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setNewOrderDialog(false); setNewOrderForm({ fullName: "", phone: "", productDescription: "", notes: "" }); }} data-testid="button-cancel-my-new-order">
                {t("إلغاء", "Cancel")}
              </Button>
              <Button
                disabled={!newOrderForm.fullName.trim() || !newOrderForm.phone.trim() || !newOrderForm.productDescription.trim() || createOrderMutation.isPending}
                onClick={() => createOrderMutation.mutate(newOrderForm)}
                data-testid="button-submit-my-new-order"
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