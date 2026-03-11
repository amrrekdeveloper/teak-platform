import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { LoadingTransition } from "@/components/loading-transition";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Loader2,
  Search,
  ClipboardList,
  Sparkles,
  UserCheck,
  Send,
  CheckCircle2,
  Factory,
  PackageCheck,
  XCircle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Eye,
  Forward,
  Phone,
  MapPin,
  Calendar,
  User,
  FileText,
  Clock,
  Pencil,
  CalendarCheck,
  RotateCcw,
  Plus,
  AlertCircle,
  Wallet,
  Ban,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

type StageFilter = "all" | "new" | "sales" | "sent" | "awaiting_payment" | "approved" | "production" | "completed" | "cancelled";

const stageConfig: Record<StageFilter, { ar: string; en: string; icon: typeof ClipboardList; color: string; bgColor: string }> = {
  all: { ar: "الكل", en: "All", icon: ClipboardList, color: "text-foreground", bgColor: "bg-muted" },
  new: { ar: "جديد", en: "New", icon: Sparkles, color: "text-amber-600", bgColor: "bg-amber-50 dark:bg-amber-950" },
  sales: { ar: "لدى المبيعات", en: "With Sales", icon: UserCheck, color: "text-blue-600", bgColor: "bg-blue-50 dark:bg-blue-950" },
  sent: { ar: "مرسل للعميل", en: "Sent to Client", icon: Send, color: "text-indigo-600", bgColor: "bg-indigo-50 dark:bg-indigo-950" },
  awaiting_payment: { ar: "لدى العميل للسداد", en: "Awaiting Payment", icon: Wallet, color: "text-purple-600", bgColor: "bg-purple-50 dark:bg-purple-950" },
  approved: { ar: "مدفوع", en: "Paid", icon: CheckCircle2, color: "text-green-600", bgColor: "bg-green-50 dark:bg-green-950" },
  production: { ar: "تحت التصنيع", en: "In Production", icon: Factory, color: "text-orange-600", bgColor: "bg-orange-50 dark:bg-orange-950" },
  completed: { ar: "مسلّم / منتهي", en: "Delivered / Done", icon: PackageCheck, color: "text-emerald-600", bgColor: "bg-emerald-50 dark:bg-emerald-950" },
  cancelled: { ar: "ملغي", en: "Cancelled", icon: XCircle, color: "text-red-600", bgColor: "bg-red-50 dark:bg-red-950" },
};

function getOrderStage(q: any, workOrders: any[], contracts: any[]): StageFilter {
  if (q.status === "rejected" || q.status === "expired") return "cancelled";
  if (q.status === "requested") return "new";
  if (q.status === "draft") return q.assignedTo ? "sales" : "new";
  if (q.status === "sent") return "sent";
  if (q.status === "approved") {
    const wo = workOrders.find((w: any) => {
      const contract = w._contract;
      return contract?.quotationId === q.id;
    });
    if (wo) {
      if (["completed", "delivered", "installed"].includes(wo.status)) return "completed";
      return "production";
    }
    const contract = contracts.find((c: any) => c.quotationId === q.id);
    if (!contract || Number(contract.paidAmount || 0) === 0) return "awaiting_payment";
    return "approved";
  }
  return "new";
}

function StatusBadge({ stage }: { stage: StageFilter }) {
  const { t } = useLanguage();
  const cfg = stageConfig[stage];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.bgColor} ${cfg.color}`} data-testid={`badge-stage-${stage}`}>
      <cfg.icon className="w-3 h-3" />
      {t(cfg.ar, cfg.en)}
    </span>
  );
}

export default function OrderCenterPage() {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();

  const isManager = user?.role === "owner" || user?.role === "assistant";
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [salesFilter, setSalesFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [perPage, setPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [assignDialog, setAssignDialog] = useState<any | null>(null);
  const [selectedSalesUser, setSelectedSalesUser] = useState<string>("");
  const [viewOrder, setViewOrder] = useState<any | null>(null);
  const [showAssignTransition, setShowAssignTransition] = useState(false);
  const [showInspectionPicker, setShowInspectionPicker] = useState(false);
  const [inspDay, setInspDay] = useState<string>("");
  const [inspMonth, setInspMonth] = useState<string>("");
  const [inspYear, setInspYear] = useState<string>("");
  const [designPreviewImg, setDesignPreviewImg] = useState<string | null>(null);
  const [designPreviewBoth, setDesignPreviewBoth] = useState<{ img2d?: string; img3d?: string } | null>(null);
  const now = useElapsedTime();

  const { data: quotations = [], isLoading: loadingQuotations } = useQuery<any[]>({
    queryKey: ["/api/quotations"],
  });
  const { data: customers = [] } = useQuery<any[]>({ queryKey: ["/api/customers"] });
  const { data: usersData = [] } = useQuery<any[]>({ queryKey: ["/api/users"] });
  const { data: workOrders = [] } = useQuery<any[]>({ queryKey: ["/api/work-orders"] });
  const { data: contracts = [] } = useQuery<any[]>({ queryKey: ["/api/contracts"] });
  const { data: inspections = [] } = useQuery<any[]>({ queryKey: ["/api/inspections"] });
  const { data: designAssignments = [] } = useQuery<any[]>({ queryKey: ["/api/design-assignments"] });

  const [inspectionsOpen, setInspectionsOpen] = useState(true);
  const [newOrderDialog, setNewOrderDialog] = useState(false);
  const [newOrderForm, setNewOrderForm] = useState({ fullName: "", phone: "", productDescription: "", notes: "" });
  const [showNewOrderTransition, setShowNewOrderTransition] = useState(false);

  const upcomingInspections = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return inspections
      .filter((insp: any) => {
        const d = new Date(insp.inspectionDate);
        d.setHours(0, 0, 0, 0);
        return d >= today;
      })
      .sort((a: any, b: any) => new Date(a.inspectionDate).getTime() - new Date(b.inspectionDate).getTime());
  }, [inspections]);

  const workOrdersWithContract = useMemo(() => {
    return workOrders.map((wo: any) => ({
      ...wo,
      _contract: contracts.find((c: any) => c.id === wo.contractId),
    }));
  }, [workOrders, contracts]);

  const salesUsers = useMemo(() => {
    return usersData.filter((u: any) => 
      ["sales", "owner", "assistant", "designer"].includes(u.role) && u.username !== "admin"
    );
  }, [usersData]);

  const assignMutation = useMutation({
    mutationFn: async ({ id, assignedTo, status }: { id: number; assignedTo: number; status?: string }) => {
      const body: any = { assignedTo };
      if (status) body.status = status;
      return apiRequest("PATCH", `/api/quotations/${id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      setAssignDialog(null);
      setSelectedSalesUser("");
      setShowAssignTransition(true);
    },
    onError: () => {
      toast({ title: t("فشل التحويل", "Assignment failed"), variant: "destructive" });
    },
  });

  const inspectionMutation = useMutation({
    mutationFn: async ({ id, inspectionDate }: { id: number; inspectionDate: string }) => {
      return apiRequest("PATCH", `/api/quotations/${id}/inspection-date`, { inspectionDate });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inspections"] });
      setShowInspectionPicker(false);
      toast({ title: t("تم حفظ موعد المعاينة", "Inspection date saved") });
    },
    onError: () => {
      toast({ title: t("فشل حفظ الموعد", "Failed to save date"), variant: "destructive" });
    },
  });

  const cancelOrderMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("PATCH", `/api/quotations/${id}`, { status: "expired" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      setViewOrder(null);
      toast({ title: t("تم إلغاء الطلب", "Order cancelled") });
    },
    onError: () => {
      toast({ title: t("فشل إلغاء الطلب", "Failed to cancel order"), variant: "destructive" });
    },
  });

  const [confirmCancel, setConfirmCancel] = useState(false);

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

  const enrichedOrders = useMemo(() => {
    return quotations.map((q: any) => {
      const customer = customers.find((c: any) => c.id === q.customerId);
      const assignedUser = q.assignedTo ? usersData.find((u: any) => u.id === q.assignedTo) : null;
      const stage = getOrderStage(q, workOrdersWithContract, contracts);
      return { ...q, customer, assignedUser, stage };
    });
  }, [quotations, customers, usersData, workOrdersWithContract, contracts]);

  const stageCounts = useMemo(() => {
    const counts: Record<StageFilter, number> = { all: 0, new: 0, sales: 0, sent: 0, awaiting_payment: 0, approved: 0, production: 0, completed: 0, cancelled: 0 };
    enrichedOrders.forEach((o: any) => {
      counts[o.stage as StageFilter]++;
      counts.all++;
    });
    return counts;
  }, [enrichedOrders]);

  const filtered = useMemo(() => {
    let list = enrichedOrders;
    if (stageFilter !== "all") list = list.filter((o: any) => o.stage === stageFilter);
    if (salesFilter !== "all") list = list.filter((o: any) => String(o.assignedTo) === salesFilter);
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
  }, [enrichedOrders, stageFilter, salesFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  const handleStageFilter = (stage: StageFilter) => {
    setStageFilter(stage);
    setCurrentPage(1);
  };

  if (loadingQuotations) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="page-order-center">
      <LoadingTransition
        show={showAssignTransition}
        message={t("جاري تحويل الطلب...", "Assigning order...")}
        subMessage={t("يتم تحديث حالة الطلب", "Updating order status")}
        duration={1200}
        onComplete={() => {
          setShowAssignTransition(false);
          toast({ title: t("تم التحويل بنجاح", "Assigned successfully") });
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
          <h1 className="text-xl font-bold" data-testid="text-order-center-title">
            {t("مركز الطلبات", "Order Center")}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("إدارة ومتابعة جميع الطلبات من مكان واحد", "Manage and track all orders from one place")}
          </p>
        </div>
        {(user?.role === "owner" || user?.role === "sales" || user?.role === "assistant") && (
          <Button onClick={() => setNewOrderDialog(true)} data-testid="button-new-order">
            <Plus className="w-4 h-4 me-1.5" />
            {t("طلب جديد", "New Order")}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
        {(Object.keys(stageConfig) as StageFilter[]).filter(k => k !== "all").map((stage) => {
          const cfg = stageConfig[stage];
          const count = stageCounts[stage];
          const isActive = stageFilter === stage;
          return (
            <button
              key={stage}
              onClick={() => handleStageFilter(isActive ? "all" : stage)}
              className={`relative flex flex-col items-center gap-1 p-3 rounded-xl border transition-all text-center ${
                isActive
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "border-border hover:border-primary/30 hover:bg-muted/50"
              }`}
              data-testid={`kpi-${stage}`}
            >
              <cfg.icon className={`w-5 h-5 ${cfg.color}`} />
              <span className={`text-lg font-bold ${cfg.color}`}>{count}</span>
              <span className="text-[10px] text-muted-foreground leading-tight">{t(cfg.ar, cfg.en)}</span>
              {stage === "new" && count > 0 && (
                <span className="absolute -top-1.5 -end-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {upcomingInspections.length > 0 && (
        <Collapsible open={inspectionsOpen} onOpenChange={setInspectionsOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <button
                className="flex items-center justify-between gap-2 w-full px-4 py-3 text-start"
                data-testid="button-toggle-inspections"
              >
                <div className="flex items-center gap-2">
                  <CalendarCheck className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold">
                    {t("مواعيد المعاينة القادمة", "Upcoming Inspections")}
                  </span>
                  <Badge variant="secondary" className="text-[10px]">
                    {upcomingInspections.length}
                  </Badge>
                </div>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${inspectionsOpen ? "rotate-180" : ""}`} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="px-4 pb-4 pt-0">
                <div className="flex gap-3 overflow-x-auto pb-1" data-testid="list-upcoming-inspections">
                  {upcomingInspections.map((insp: any) => {
                    const inspDate = new Date(insp.inspectionDate);
                    const isToday = (() => {
                      const today = new Date();
                      return inspDate.getFullYear() === today.getFullYear() &&
                        inspDate.getMonth() === today.getMonth() &&
                        inspDate.getDate() === today.getDate();
                    })();
                    const dayName = inspDate.toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US", { weekday: "long" });
                    const dateStr = inspDate.toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    });
                    return (
                      <div
                        key={insp.quotationId}
                        className={`flex-shrink-0 w-[220px] border rounded-lg p-3 space-y-2 ${
                          isToday
                            ? "border-primary bg-primary/5"
                            : "border-border"
                        }`}
                        data-testid={`card-inspection-${insp.quotationId}`}
                      >
                        <div className="flex items-center gap-1.5">
                          <Calendar className={`w-3.5 h-3.5 ${isToday ? "text-primary" : "text-muted-foreground"}`} />
                          <span className={`text-xs font-semibold ${isToday ? "text-primary" : ""}`}>
                            {dayName}
                          </span>
                          {isToday && (
                            <Badge variant="default" className="text-[9px] px-1.5 py-0">
                              {t("اليوم", "Today")}
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">{dateStr}</p>
                        <div className="space-y-1">
                          <p className="text-xs font-medium truncate flex items-center gap-1">
                            <User className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                            {insp.customer?.fullName || "—"}
                          </p>
                          {insp.customer?.phone && (
                            <p className="text-[11px] text-muted-foreground flex items-center gap-1" dir="ltr">
                              <Phone className="w-3 h-3 flex-shrink-0" />
                              {insp.customer.phone}
                            </p>
                          )}
                          {insp.items?.[0]?.description && (
                            <p className="text-[11px] text-muted-foreground truncate" title={insp.items[0].description}>
                              {insp.items[0].description}
                            </p>
                          )}
                          {insp.assignedUser && (
                            <p className="text-[11px] text-blue-600 dark:text-blue-400 flex items-center gap-1 mt-1">
                              <UserCheck className="w-3 h-3 flex-shrink-0" />
                              {lang === "ar" ? insp.assignedUser.fullNameAr : insp.assignedUser.fullNameEn}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("بحث بالاسم أو الهاتف أو رقم الطلب...", "Search by name, phone or order #...")}
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            className="ps-9 h-9 text-sm"
            data-testid="input-search-orders"
          />
        </div>
        {isManager && (
          <Select value={salesFilter} onValueChange={(v) => { setSalesFilter(v); setCurrentPage(1); }}>
            <SelectTrigger className="w-full sm:w-[200px] h-9 text-sm" data-testid="select-sales-filter">
              <SelectValue placeholder={t("جميع الموظفين", "All Staff")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("جميع الموظفين", "All Staff")}</SelectItem>
              {salesUsers.map((u: any) => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {t(u.fullNameAr, u.fullNameEn)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={String(perPage)} onValueChange={(v) => { setPerPage(Number(v)); setCurrentPage(1); }}>
          <SelectTrigger className="w-full sm:w-[100px] h-9 text-sm" data-testid="select-per-page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10</SelectItem>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-orders">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-start px-4 py-3 font-semibold text-xs text-muted-foreground whitespace-nowrap" data-testid="th-order-num">
                    {t("#", "#")}
                  </th>
                  <th className="text-start px-4 py-3 font-semibold text-xs text-muted-foreground whitespace-nowrap" data-testid="th-customer">
                    {t("العميل", "Customer")}
                  </th>
                  <th className="text-start px-4 py-3 font-semibold text-xs text-muted-foreground whitespace-nowrap" data-testid="th-product">
                    {t("المنتج", "Product")}
                  </th>
                  <th className="text-start px-4 py-3 font-semibold text-xs text-muted-foreground whitespace-nowrap" data-testid="th-amount">
                    {t("المبلغ", "Amount")}
                  </th>
                  <th className="text-start px-4 py-3 font-semibold text-xs text-muted-foreground whitespace-nowrap" data-testid="th-stage">
                    {t("الحالة", "Status")}
                  </th>
                  {isManager && (
                    <th className="text-start px-4 py-3 font-semibold text-xs text-muted-foreground whitespace-nowrap" data-testid="th-assigned">
                      {t("المسؤول", "Assigned To")}
                    </th>
                  )}
                  <th className="text-start px-4 py-3 font-semibold text-xs text-muted-foreground whitespace-nowrap" data-testid="th-date">
                    {t("التاريخ", "Date")}
                  </th>
                  <th className="text-start px-4 py-3 font-semibold text-xs text-muted-foreground whitespace-nowrap" data-testid="th-actions">
                    {t("إجراءات", "Actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={isManager ? 8 : 7} className="text-center py-12 text-muted-foreground text-sm">
                      <ClipboardList className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                      {t("لا توجد طلبات", "No orders found")}
                    </td>
                  </tr>
                ) : (
                  paginated.map((order: any) => {
                    const itemDesc = order.items?.[0]?.description || order.items?.[0]?.productType || "—";
                    const amount = Number(order.finalPrice || order.totalPrice || 0);
                    return (
                      <tr key={order.id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors" data-testid={`row-order-${order.id}`}>
                        <td className="px-4 py-3 font-mono text-xs font-bold whitespace-nowrap">
                          {order.quotationNumber || order.id}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="font-medium text-sm">{order.customer?.fullName || "—"}</span>
                            {order.customer?.phone && (
                              <span className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5" dir="ltr">
                                <Phone className="w-3 h-3" />
                                {order.customer.phone}
                              </span>
                            )}
                            {order.customer?.city && (
                              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {order.customer.city}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs max-w-[160px] truncate" title={itemDesc}>
                          {itemDesc}
                        </td>
                        <td className="px-4 py-3 font-semibold text-xs whitespace-nowrap">
                          {amount > 0 ? `${amount.toLocaleString()} ${t("ر.س", "SAR")}` : (
                            <span className="text-muted-foreground">{t("لم يُحدد", "TBD")}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <StatusBadge stage={order.stage} />
                            {(() => {
                              const da = designAssignments.find((d: any) => d.quotationId === order.id);
                              if (!da) return null;
                              if (da.customerApproval === "approved") return (
                                <span className="text-[9px] font-medium text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-950/40 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 w-fit" data-testid={`badge-design-approved-${order.id}`}>
                                  <CheckCircle2 className="w-2.5 h-2.5" />
                                  {t("تصميم معتمد", "Design Approved")}
                                </span>
                              );
                              if (da.customerApproval === "revision_requested") return (
                                <span className="text-[9px] font-medium text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/40 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 w-fit" data-testid={`badge-design-revision-${order.id}`}>
                                  <AlertCircle className="w-2.5 h-2.5" />
                                  {t("طلب تعديل", "Revision")}
                                </span>
                              );
                              if (da.status === "completed") return (
                                <span className="text-[9px] font-medium text-yellow-700 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-950/40 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 w-fit" data-testid={`badge-design-pending-${order.id}`}>
                                  <Clock className="w-2.5 h-2.5" />
                                  {t("بانتظار اعتماد", "Awaiting Approval")}
                                </span>
                              );
                              return null;
                            })()}
                          </div>
                        </td>
                        {isManager && (
                          <td className="px-4 py-3 whitespace-nowrap text-xs">
                            {order.assignedUser ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="flex items-center gap-1 font-medium">
                                  <User className="w-3 h-3 text-muted-foreground" />
                                  {t(order.assignedUser.fullNameAr, order.assignedUser.fullNameEn)}
                                </span>
                                {order.assignedAt && (
                                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                    <Clock className="w-2.5 h-2.5" />
                                    {t("منذ", "Since")} {formatElapsed(order.assignedAt, now, t)}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">{t("غير مُعيّن", "Unassigned")}</span>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {order.createdAt ? new Date(order.createdAt).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          }) : "—"}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            {isManager && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => setAssignDialog(order)}
                                data-testid={`button-assign-${order.id}`}
                              >
                                <Forward className="w-3.5 h-3.5 me-1" />
                                {t("تحويل", "Assign")}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => setViewOrder(order)}
                              data-testid={`button-view-${order.id}`}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {filtered.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
              <p className="text-xs text-muted-foreground">
                {t(
                  `عرض ${(currentPage - 1) * perPage + 1} - ${Math.min(currentPage * perPage, filtered.length)} من ${filtered.length}`,
                  `Showing ${(currentPage - 1) * perPage + 1} - ${Math.min(currentPage * perPage, filtered.length)} of ${filtered.length}`
                )}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(currentPage - 1)}
                  data-testid="button-prev-page"
                >
                  {lang === "ar" ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
                </Button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  let page: number;
                  if (totalPages <= 5) {
                    page = i + 1;
                  } else if (currentPage <= 3) {
                    page = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    page = totalPages - 4 + i;
                  } else {
                    page = currentPage - 2 + i;
                  }
                  return (
                    <Button
                      key={page}
                      variant={page === currentPage ? "default" : "outline"}
                      size="sm"
                      className="h-7 w-7 p-0 text-xs"
                      onClick={() => setCurrentPage(page)}
                      data-testid={`button-page-${page}`}
                    >
                      {page}
                    </Button>
                  );
                })}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(currentPage + 1)}
                  data-testid="button-next-page"
                >
                  {lang === "ar" ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {viewOrder && (
        <Dialog open onOpenChange={() => { setViewOrder(null); setConfirmCancel(false); setShowInspectionPicker(false); setInspDay(""); setInspMonth(""); setInspYear(""); }}>
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
                  <StatusBadge stage={viewOrder.stage} />
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {viewOrder.createdAt ? new Date(viewOrder.createdAt).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US", { year: "numeric", month: "long", day: "numeric" }) : "—"}
                  </p>
                  {viewOrder.assignedAt && (
                    <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mt-1.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {t("في هذه المرحلة منذ", "In this stage for")} {formatElapsed(viewOrder.assignedAt, now, t)}
                    </p>
                  )}
                </div>
              </div>

              {viewOrder.assignedUser && (
                <div className="bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-3">
                  <p className="text-[11px] text-blue-600 dark:text-blue-400 font-medium mb-1.5">{t("تم التحويل للمبيعات", "Assigned to Sales")}</p>
                  <p className="text-sm font-semibold flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-blue-500" />
                    {t(viewOrder.assignedUser.fullNameAr, viewOrder.assignedUser.fullNameEn)}
                  </p>
                  {viewOrder.assignedAt && (
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(viewOrder.assignedAt).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="flex items-center gap-1 font-medium text-blue-600 dark:text-blue-400">
                        <Clock className="w-3 h-3" />
                        {t("منذ", "Since")} {formatElapsed(viewOrder.assignedAt, now, t)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {(() => {
                const existingInspDate = viewOrder.inspectionDate;
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const monthNames = {
                  ar: ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"],
                  en: ["January","February","March","April","May","June","July","August","September","October","November","December"],
                };
                const dayNames = {
                  ar: ["الأحد","الإثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"],
                  en: ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"],
                };

                const currentYear = today.getFullYear();
                const yearOptions = [currentYear, currentYear + 1, currentYear + 2];

                const selectedYear = inspYear ? Number(inspYear) : 0;
                const selectedMonth = inspMonth ? Number(inspMonth) : 0;
                const daysInMonth = selectedYear && selectedMonth ? new Date(selectedYear, selectedMonth, 0).getDate() : 31;

                const isDateValid = inspDay && inspMonth && inspYear && (() => {
                  const d = new Date(Number(inspYear), Number(inspMonth) - 1, Number(inspDay));
                  return d >= today;
                })();

                const selectedFullDate = inspDay && inspMonth && inspYear
                  ? new Date(Number(inspYear), Number(inspMonth) - 1, Number(inspDay))
                  : null;

                const formatFullDate = (dateStr: string | Date) => {
                  const d = new Date(dateStr);
                  const dayName = lang === "ar" ? dayNames.ar[d.getDay()] : dayNames.en[d.getDay()];
                  const monthName = lang === "ar" ? monthNames.ar[d.getMonth()] : monthNames.en[d.getMonth()];
                  return `${dayName} ${d.getDate()} ${monthName} ${d.getFullYear()}`;
                };

                const isDayDisabled = (day: number) => {
                  if (!inspMonth || !inspYear) return false;
                  const d = new Date(Number(inspYear), Number(inspMonth) - 1, day);
                  return d < today;
                };

                return (
                  <div className="border rounded-lg p-3" data-testid="section-inspection-scheduling">
                    {existingInspDate && !showInspectionPicker ? (
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <CalendarCheck className="w-4 h-4 text-green-600" />
                          <div>
                            <p className="text-[11px] text-muted-foreground">{t("موعد المعاينة", "Inspection Date")}</p>
                            <p className="text-sm font-semibold">{formatFullDate(existingInspDate)}</p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const d = new Date(existingInspDate);
                            setInspDay(String(d.getDate()));
                            setInspMonth(String(d.getMonth() + 1));
                            setInspYear(String(d.getFullYear()));
                            setShowInspectionPicker(true);
                          }}
                          data-testid="button-reschedule-inspection"
                        >
                          <RotateCcw className="w-3.5 h-3.5 me-1" />
                          {t("إعادة جدولة", "Reschedule")}
                        </Button>
                      </div>
                    ) : showInspectionPicker ? (
                      <div className="space-y-3">
                        <p className="text-xs font-semibold flex items-center gap-1.5">
                          <CalendarCheck className="w-3.5 h-3.5" />
                          {t("تحديد موعد المعاينة", "Schedule Inspection")}
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                          <Select value={inspYear} onValueChange={(v) => { setInspYear(v); setInspDay(""); }}>
                            <SelectTrigger data-testid="select-inspection-year">
                              <SelectValue placeholder={t("السنة", "Year")} />
                            </SelectTrigger>
                            <SelectContent>
                              {yearOptions.map((y) => (
                                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select value={inspMonth} onValueChange={(v) => { setInspMonth(v); setInspDay(""); }}>
                            <SelectTrigger data-testid="select-inspection-month">
                              <SelectValue placeholder={t("الشهر", "Month")} />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 12 }, (_, i) => {
                                const mIdx = i + 1;
                                const mName = lang === "ar" ? monthNames.ar[i] : monthNames.en[i];
                                return (
                                  <SelectItem key={mIdx} value={String(mIdx)}>{mName}</SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                          <Select value={inspDay} onValueChange={setInspDay}>
                            <SelectTrigger data-testid="select-inspection-day">
                              <SelectValue placeholder={t("اليوم", "Day")} />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: daysInMonth }, (_, i) => {
                                const day = i + 1;
                                const disabled = isDayDisabled(day);
                                return (
                                  <SelectItem key={day} value={String(day)} disabled={disabled}>
                                    {day}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                        {selectedFullDate && isDateValid && (
                          <p className="text-xs text-green-600 dark:text-green-400 font-medium" data-testid="text-selected-date">
                            {formatFullDate(selectedFullDate)}
                          </p>
                        )}
                        {selectedFullDate && !isDateValid && (
                          <p className="text-xs text-red-500" data-testid="text-invalid-date">
                            {t("لا يمكن اختيار تاريخ في الماضي", "Cannot select a past date")}
                          </p>
                        )}
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            disabled={!isDateValid || inspectionMutation.isPending}
                            onClick={() => {
                              const dateStr = `${inspYear}-${String(inspMonth).padStart(2, "0")}-${String(inspDay).padStart(2, "0")}`;
                              inspectionMutation.mutate({ id: viewOrder.id, inspectionDate: dateStr });
                              setViewOrder({ ...viewOrder, inspectionDate: dateStr });
                            }}
                            data-testid="button-save-inspection"
                          >
                            {inspectionMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin me-1" />}
                            {t("حفظ الموعد", "Save Date")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setShowInspectionPicker(false); setInspDay(""); setInspMonth(""); setInspYear(""); }}
                            data-testid="button-cancel-inspection"
                          >
                            {t("إلغاء", "Cancel")}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          const defaultYear = currentYear < 2026 ? 2026 : currentYear;
                          setInspYear(String(defaultYear));
                          setInspMonth("");
                          setInspDay("");
                          setShowInspectionPicker(true);
                        }}
                        data-testid="button-schedule-inspection"
                      >
                        <CalendarCheck className="w-3.5 h-3.5 me-1.5" />
                        {t("تحديد موعد المعاينة", "Schedule Inspection")}
                      </Button>
                    )}
                  </div>
                );
              })()}

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
                          <th className="text-start px-3 py-2 font-medium">{t("الإجمالي", "Total")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewOrder.items.map((item: any, idx: number) => (
                          <tr key={idx} className="border-t">
                            <td className="px-3 py-2">{item.description || item.productType || "—"}</td>
                            <td className="px-3 py-2">{item.quantity || 1}</td>
                            <td className="px-3 py-2">{Number(item.unitPrice || 0).toLocaleString()}</td>
                            <td className="px-3 py-2">{Number(item.amount || 0).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-muted/50 rounded-lg p-2">
                  <p className="text-[10px] text-muted-foreground">{t("الإجمالي قبل الضريبة", "Subtotal")}</p>
                  <p className="text-sm font-bold">{Number(viewOrder.subtotal || 0).toLocaleString()}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-2">
                  <p className="text-[10px] text-muted-foreground">{t("الضريبة", "VAT")} {viewOrder.vatRate || 15}%</p>
                  <p className="text-sm font-bold">{Number(viewOrder.vatAmount || 0).toLocaleString()}</p>
                </div>
                <div className="bg-primary/10 rounded-lg p-2">
                  <p className="text-[10px] text-primary">{t("الإجمالي النهائي", "Final Total")}</p>
                  <p className="text-sm font-bold text-primary">{Number(viewOrder.finalPrice || viewOrder.totalPrice || 0).toLocaleString()} {t("ر.س", "SAR")}</p>
                </div>
              </div>

              {viewOrder.notes && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-[11px] text-muted-foreground mb-1">{t("ملاحظات", "Notes")}</p>
                  <p className="text-xs">{viewOrder.notes}</p>
                </div>
              )}

              {(() => {
                const da = designAssignments.find((d: any) => d.quotationId === viewOrder.id);
                if (!da) return null;
                const isCompleted = da.status === "completed";
                const hasImages = da.sketchImage || da.screenshot3d;
                return (
                  <div className="border rounded-lg p-3 space-y-2" data-testid="design-section-order-detail">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold flex items-center gap-1.5">
                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                        {t("التصميم", "Design")}
                      </p>
                      {isCompleted ? (
                        <span className="text-[10px] font-medium text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-950/40 px-2 py-0.5 rounded-full flex items-center gap-1" data-testid="badge-design-completed">
                          <CheckCircle2 className="w-3 h-3" />
                          {t("مكتمل", "Completed")}
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-yellow-700 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-950/40 px-2 py-0.5 rounded-full flex items-center gap-1" data-testid="badge-design-inprogress">
                          <Clock className="w-3 h-3" />
                          {da.status === "pending" ? t("معلّق", "Pending") : t("قيد التصميم", "In Progress")}
                        </span>
                      )}
                    </div>
                    {da.customerApproval === "approved" && (
                      <span className="text-[10px] font-medium text-green-700 dark:text-green-400 bg-green-100/60 dark:bg-green-950/30 px-2 py-0.5 rounded-full flex items-center gap-1 w-fit" data-testid="badge-customer-approved-detail">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        {t("معتمد من العميل", "Customer Approved")}
                      </span>
                    )}
                    {da.customerApproval === "revision_requested" && (
                      <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md p-2 space-y-1">
                        <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1" data-testid="badge-customer-revision-detail">
                          <AlertCircle className="w-2.5 h-2.5" />
                          {t("العميل طلب تعديل", "Customer Requested Revision")}
                        </span>
                        {da.customerApprovalNotes && (
                          <p className="text-[10px] text-amber-800 dark:text-amber-300 ps-4" data-testid="text-revision-notes">
                            "{da.customerApprovalNotes}"
                          </p>
                        )}
                      </div>
                    )}
                    {isCompleted && hasImages && (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          {da.sketchImage && (
                            <div
                              className="border rounded-md overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all bg-white dark:bg-muted/20 relative group"
                              onClick={() => setDesignPreviewImg(da.sketchImage)}
                              data-testid="img-design-2d-order"
                            >
                              <img src={da.sketchImage} alt="2D Plan" className="w-full h-20 object-contain" />
                              <span className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[9px] text-center py-0.5">{t("المخطط 2D", "2D Plan")}</span>
                            </div>
                          )}
                          {da.screenshot3d && (
                            <div
                              className="border rounded-md overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all bg-white dark:bg-muted/20 relative group"
                              onClick={() => setDesignPreviewImg(da.screenshot3d)}
                              data-testid="img-design-3d-order"
                            >
                              <img src={da.screenshot3d} alt="3D View" className="w-full h-20 object-contain" />
                              <span className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[9px] text-center py-0.5">{t("العرض 3D", "3D View")}</span>
                            </div>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => setDesignPreviewBoth({ img2d: da.sketchImage, img3d: da.screenshot3d })}
                          data-testid="button-view-design"
                        >
                          <Eye className="w-3.5 h-3.5 me-1.5" />
                          {t("استعراض التصميم", "View Design")}
                        </Button>
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewOrder(null)} data-testid="button-close-view">
                {t("إغلاق", "Close")}
              </Button>
              {viewOrder.assignedTo && (
                viewOrder.inspectionDate ? (
                  <Button
                    variant="secondary"
                    onClick={() => { window.location.href = `/dashboard/design-studio/${viewOrder.id}`; }}
                    data-testid="button-open-design-studio"
                  >
                    <Pencil className="w-3.5 h-3.5 me-1.5" />
                    {t("استوديو التصميم", "Design Studio")}
                  </Button>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          variant="outline"
                          disabled
                          data-testid="button-open-design-studio-disabled"
                        >
                          <Pencil className="w-3.5 h-3.5 me-1.5" />
                          {t("استوديو التصميم", "Design Studio")}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      {t("يجب تحديد موعد المعاينة أولاً", "Schedule an inspection first")}
                    </TooltipContent>
                  </Tooltip>
                )
              )}
              {isManager && (
                <Button onClick={() => { setViewOrder(null); setAssignDialog(viewOrder); }} data-testid="button-assign-from-view">
                  <Forward className="w-3.5 h-3.5 me-1.5" />
                  {t("تحويل", "Assign")}
                </Button>
              )}
              {isManager && viewOrder.status !== "approved" && viewOrder.status !== "rejected" && viewOrder.status !== "expired" && (
                confirmCancel ? (
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => { cancelOrderMutation.mutate(viewOrder.id); setConfirmCancel(false); }}
                      disabled={cancelOrderMutation.isPending}
                      data-testid="button-confirm-cancel-order"
                    >
                      {cancelOrderMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin me-1" /> : null}
                      {t("تأكيد الإلغاء", "Confirm Cancel")}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmCancel(false)} data-testid="button-undo-cancel">
                      {t("تراجع", "Undo")}
                    </Button>
                  </div>
                ) : (
                  <Button variant="ghost" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setConfirmCancel(true)} data-testid="button-cancel-order">
                    <Ban className="w-3.5 h-3.5 me-1.5" />
                    {t("إلغاء الطلب", "Cancel Order")}
                  </Button>
                )
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {designPreviewImg && (
        <Dialog open onOpenChange={() => setDesignPreviewImg(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] p-2">
            <div className="flex items-center justify-center min-h-[300px] bg-white dark:bg-muted/20 rounded-lg overflow-auto">
              <img
                src={designPreviewImg}
                alt="Design Preview"
                className="max-w-full max-h-[80vh] object-contain"
                data-testid="img-design-fullscreen"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {designPreviewBoth && (
        <Dialog open onOpenChange={() => setDesignPreviewBoth(null)}>
          <DialogContent className="max-w-5xl max-h-[90vh] p-4">
            <DialogHeader>
              <DialogTitle>{t("استعراض التصميم", "Design Preview")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 overflow-y-auto flex-1">
              {designPreviewBoth.img2d && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">{t("المخطط ثنائي الأبعاد", "2D Plan")}</p>
                  <div className="border rounded-lg bg-white dark:bg-muted/20 p-2 flex items-center justify-center">
                    <img src={designPreviewBoth.img2d} alt="2D Plan" className="max-w-full max-h-[35vh] object-contain" data-testid="img-preview-2d" />
                  </div>
                </div>
              )}
              {designPreviewBoth.img3d && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">{t("العرض الثلاثي الأبعاد", "3D View")}</p>
                  <div className="border rounded-lg bg-white dark:bg-muted/20 p-2 flex items-center justify-center">
                    <img src={designPreviewBoth.img3d} alt="3D View" className="max-w-full max-h-[35vh] object-contain" data-testid="img-preview-3d" />
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {assignDialog && (
        <Dialog open onOpenChange={() => { setAssignDialog(null); setSelectedSalesUser(""); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("تحويل الطلب", "Assign Order")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="font-semibold">{t("طلب", "Order")} #{assignDialog.quotationNumber || assignDialog.id}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="w-3.5 h-3.5" />
                  {assignDialog.customer?.fullName || "—"}
                </div>
                {assignDialog.items?.[0]?.description && (
                  <div className="text-xs text-muted-foreground">
                    {assignDialog.items[0].description}
                  </div>
                )}
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">{t("تحويل إلى", "Assign to")}</label>
                <Select value={selectedSalesUser} onValueChange={setSelectedSalesUser}>
                  <SelectTrigger data-testid="select-assign-user">
                    <SelectValue placeholder={t("اختر الموظف", "Select staff member")} />
                  </SelectTrigger>
                  <SelectContent>
                    {salesUsers.map((u: any) => {
                      const roleLabel = t(
                        u.role === "owner" ? "مالك" :
                        u.role === "sales" || u.role === "designer" ? "المبيعات والتصميم" :
                        u.role === "assistant" ? "مساعد المدير" :
                        u.role,
                        u.role === "owner" ? "Owner" :
                        u.role === "sales" || u.role === "designer" ? "Sales & Design" :
                        u.role === "assistant" ? "Assistant Manager" :
                        u.role
                      );
                      return (
                        <SelectItem key={u.id} value={String(u.id)}>
                          {t(u.fullNameAr, u.fullNameEn)} — {roleLabel}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setAssignDialog(null); setSelectedSalesUser(""); }} data-testid="button-cancel-assign">
                {t("إلغاء", "Cancel")}
              </Button>
              <Button
                disabled={!selectedSalesUser || assignMutation.isPending}
                onClick={() => {
                  const newStatus = assignDialog.status === "requested" ? "draft" : undefined;
                  assignMutation.mutate({
                    id: assignDialog.id,
                    assignedTo: Number(selectedSalesUser),
                    status: newStatus,
                  });
                }}
                data-testid="button-confirm-assign"
              >
                {assignMutation.isPending && <Loader2 className="w-4 h-4 animate-spin me-2" />}
                {t("تحويل", "Assign")}
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
                <Label htmlFor="new-order-name">{t("اسم العميل", "Customer Name")} *</Label>
                <Input
                  id="new-order-name"
                  value={newOrderForm.fullName}
                  onChange={(e) => setNewOrderForm({ ...newOrderForm, fullName: e.target.value })}
                  placeholder={t("أدخل اسم العميل", "Enter customer name")}
                  data-testid="input-new-order-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-order-phone">{t("رقم الجوال", "Phone Number")} *</Label>
                <Input
                  id="new-order-phone"
                  value={newOrderForm.phone}
                  onChange={(e) => setNewOrderForm({ ...newOrderForm, phone: e.target.value })}
                  placeholder="05XXXXXXXX"
                  dir="ltr"
                  data-testid="input-new-order-phone"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-order-product">{t("وصف المنتج", "Product Description")} *</Label>
                <Input
                  id="new-order-product"
                  value={newOrderForm.productDescription}
                  onChange={(e) => setNewOrderForm({ ...newOrderForm, productDescription: e.target.value })}
                  placeholder={t("مطبخ، دولاب، باب...", "Kitchen, wardrobe, door...")}
                  data-testid="input-new-order-product"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-order-notes">{t("ملاحظات", "Notes")}</Label>
                <Textarea
                  id="new-order-notes"
                  value={newOrderForm.notes}
                  onChange={(e) => setNewOrderForm({ ...newOrderForm, notes: e.target.value })}
                  placeholder={t("ملاحظات إضافية (اختياري)", "Additional notes (optional)")}
                  className="resize-none"
                  rows={3}
                  data-testid="input-new-order-notes"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setNewOrderDialog(false); setNewOrderForm({ fullName: "", phone: "", productDescription: "", notes: "" }); }} data-testid="button-cancel-new-order">
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
