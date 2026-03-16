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

const statusBadgeConfig: Record<string, { ar: string; en: string; className: string }> = {
  draft: { ar: "مسودة", en: "Draft", className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  requested: { ar: "طلب جديد", en: "Requested", className: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
  open: { ar: "مفتوح", en: "Open", className: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
  sent: { ar: "مُرسل", en: "Sent", className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  approved: { ar: "معتمد", en: "Approved", className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  rejected: { ar: "مرفوض", en: "Rejected", className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
  expired: { ar: "منتهي", en: "Expired", className: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" },
  revision: { ar: "مراجعة", en: "Revision", className: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" },
};

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
  const [appointmentForm, setAppointmentForm] = useState({
    title: "زيارة رفع المقاسات",
    appointmentDate: new Date().toISOString().split("T")[0],
    startTime: "09:00",
    endTime: "10:00",
    notes: "",
  });
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

  const appointmentMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/appointments", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      setAppointmentDialog(null);
      setAppointmentForm({
        title: "زيارة رفع المقاسات",
        appointmentDate: new Date().toISOString().split("T")[0],
        startTime: "09:00",
        endTime: "10:00",
        notes: "",
      });
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

  const enrichedOrders = useMemo(() => {
    if (!user) return [];
    return quotations.map((q: any) => {
      const customer = customers.find((c: any) => c.id === q.customerId);
      const assignedUser = q.assignedTo ? usersData.find((u: any) => u.id === q.assignedTo) : null;
      const stage = getOrderStage(q, workOrdersWithContract, contracts, user.id);
      return { ...q, customer, assignedUser, stage };
    });
  }, [quotations, customers, usersData, workOrdersWithContract, contracts, user]);

  const openOrders = useMemo(() => {
    return enrichedOrders.filter((o: any) => o.stage === "open");
  }, [enrichedOrders]);

  const myOrders = useMemo(() => {
    if (!user) return [];
    return enrichedOrders.filter((o: any) => o.assignedTo === user.id && o.stage !== "open");
  }, [enrichedOrders, user]);

  const currentList = activeTab === "open" ? openOrders : myOrders;

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
    return list.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [currentList, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  function openAppointmentDialog(order: any) {
    setAppointmentDialog(order);
    setAppointmentForm({
      title: "زيارة رفع المقاسات",
      appointmentDate: new Date().toISOString().split("T")[0],
      startTime: "09:00",
      endTime: "10:00",
      notes: t(
        `طلب #${order.quotationNumber || order.id} — ${order.customer?.fullName || ""}`,
        `Order #${order.quotationNumber || order.id} — ${order.customer?.fullName || ""}`
      ),
    });
  }

  function submitAppointment() {
    if (!appointmentDialog || !user) return;
    appointmentMutation.mutate({
      title: appointmentForm.title,
      appointmentDate: appointmentForm.appointmentDate,
      startTime: appointmentForm.startTime,
      endTime: appointmentForm.endTime,
      customerId: appointmentDialog.customerId || null,
      quotationId: appointmentDialog.id,
      assignedTo: user.id,
      notes: appointmentForm.notes,
    });
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
                      <th className="text-start px-4 py-3 font-semibold text-xs text-muted-foreground">#</th>
                      <th className="text-start px-4 py-3 font-semibold text-xs text-muted-foreground">{t("العميل", "Customer")}</th>
                      <th className="text-start px-4 py-3 font-semibold text-xs text-muted-foreground">{t("الهاتف", "Phone")}</th>
                      <th className="text-start px-4 py-3 font-semibold text-xs text-muted-foreground">{t("المنتج", "Product")}</th>
                      <th className="text-start px-4 py-3 font-semibold text-xs text-muted-foreground">{t("المبلغ", "Amount")}</th>
                      <th className="text-start px-4 py-3 font-semibold text-xs text-muted-foreground">{t("الحالة", "Status")}</th>
                      <th className="text-start px-4 py-3 font-semibold text-xs text-muted-foreground">{t("التاريخ", "Date")}</th>
                      <th className="text-start px-4 py-3 font-semibold text-xs text-muted-foreground">{t("الإجراءات", "Actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {paginated.map((order: any) => {
                      const itemDesc = order.items?.[0]?.description || order.items?.[0]?.productType || "—";
                      const amount = Number(order.finalPrice || order.totalPrice || 0);
                      const isOpen = order.stage === "open";
                      const statusCfg = statusBadgeConfig[order.status] || statusBadgeConfig.draft;
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
                            <Badge variant="secondary" className={`text-[10px] px-2 py-0.5 ${statusCfg.className}`} data-testid={`badge-status-${order.id}`}>
                              {t(statusCfg.ar, statusCfg.en)}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</span>
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
                                    className="h-7 w-7 p-0 text-primary hover:text-primary"
                                    onClick={() => openAppointmentDialog(order)}
                                    title={t("حجز موعد", "Book Appointment")}
                                    data-testid={`button-book-appt-${order.id}`}
                                  >
                                    <CalendarPlus className="w-3.5 h-3.5" />
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
                  const statusCfg = statusBadgeConfig[order.status] || statusBadgeConfig.draft;
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
                          <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${statusCfg.className}`}>
                            {t(statusCfg.ar, statusCfg.en)}
                          </Badge>
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
                              className="h-8 flex-1 text-xs text-primary border-primary/30"
                              onClick={() => openAppointmentDialog(order)}
                              data-testid={`button-book-appt-mobile-${order.id}`}
                            >
                              <CalendarPlus className="w-3.5 h-3.5 me-1" />
                              {t("حجز موعد", "Book Appt")}
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
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setViewOrder(null)} data-testid="button-close-view-my">
                {t("إغلاق", "Close")}
              </Button>
              {viewOrder.assignedTo === user?.id && !viewOrder.inspectionDate && (
                <Button
                  variant="default"
                  onClick={() => { setViewOrder(null); openAppointmentDialog(viewOrder); }}
                  data-testid="button-book-from-view"
                >
                  <CalendarPlus className="w-3.5 h-3.5 me-1.5" />
                  {t("حجز موعد رفع مقاسات", "Book Measurement")}
                </Button>
              )}
              {viewOrder.assignedTo === user?.id && viewOrder.inspectionDate && (
                <Button
                  variant="secondary"
                  onClick={() => { window.location.href = `/dashboard/design-studio/${viewOrder.id}`; }}
                  data-testid="button-design-studio-my"
                >
                  <Pencil className="w-3.5 h-3.5 me-1.5" />
                  {t("استوديو التصميم", "Design Studio")}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {appointmentDialog && (
        <Dialog open onOpenChange={() => setAppointmentDialog(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("حجز موعد", "Book Appointment")}</DialogTitle>
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

              <div className="space-y-1.5">
                <Label>{t("نوع الموعد", "Appointment Type")}</Label>
                <Select value={appointmentForm.title} onValueChange={(val) => setAppointmentForm({ ...appointmentForm, title: val })}>
                  <SelectTrigger data-testid="select-appt-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {appointmentTypes.map((at) => (
                      <SelectItem key={at.value} value={at.value}>
                        {t(at.ar, at.en)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>{t("التاريخ", "Date")}</Label>
                <Input
                  type="date"
                  value={appointmentForm.appointmentDate}
                  onChange={(e) => setAppointmentForm({ ...appointmentForm, appointmentDate: e.target.value })}
                  min={new Date().toISOString().split("T")[0]}
                  data-testid="input-appt-date"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("وقت البدء", "Start Time")}</Label>
                  <Input
                    type="time"
                    value={appointmentForm.startTime}
                    onChange={(e) => setAppointmentForm({ ...appointmentForm, startTime: e.target.value })}
                    data-testid="input-appt-start"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("وقت الانتهاء", "End Time")}</Label>
                  <Input
                    type="time"
                    value={appointmentForm.endTime}
                    onChange={(e) => setAppointmentForm({ ...appointmentForm, endTime: e.target.value })}
                    data-testid="input-appt-end"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>{t("ملاحظات", "Notes")}</Label>
                <Textarea
                  value={appointmentForm.notes}
                  onChange={(e) => setAppointmentForm({ ...appointmentForm, notes: e.target.value })}
                  placeholder={t("ملاحظات إضافية...", "Additional notes...")}
                  className="resize-none"
                  rows={2}
                  data-testid="input-appt-notes"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAppointmentDialog(null)} data-testid="button-cancel-appt">
                {t("إلغاء", "Cancel")}
              </Button>
              <Button
                disabled={!appointmentForm.appointmentDate || !appointmentForm.startTime || !appointmentForm.endTime || appointmentMutation.isPending}
                onClick={submitAppointment}
                data-testid="button-submit-appt"
              >
                {appointmentMutation.isPending && <Loader2 className="w-4 h-4 animate-spin me-2" />}
                {t("حفظ الموعد", "Save Appointment")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

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