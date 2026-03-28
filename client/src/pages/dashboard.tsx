import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users, FileText, FolderOpen, CreditCard, Loader2,
  Factory, Package, AlertTriangle, Truck, Wrench,
  Shield, UserCheck, TrendingUp, Clock,
  CheckCircle2, ArrowLeft, ArrowRight, ClipboardList, Sparkles,
  CalendarCheck, CalendarDays, Palette, MessageSquare,
  ClipboardCheck, Calendar, BarChart3, Receipt, ShoppingCart,
  UserCircle, MapPin, Star, Phone, MessageCircle, Store,
} from "lucide-react";

import teakLogo from "@assets/TEAK-LOGO_(1)_(1)_1772710617816.png";

function SarIcon({ className }: { className?: string }) {
  return (
    <span
      className={`font-bold leading-none flex items-center justify-center ${className || ""}`}
      aria-label="SAR"
      style={{ fontSize: "0.85em", letterSpacing: "-0.02em" }}
    >
      ر.س
    </span>
  );
}

const stageLabels: Record<string, { ar: string; en: string }> = {
  deposit: { ar: "عربون", en: "Deposit" },
  pre_manufacturing: { ar: "قبل التصنيع", en: "Pre-Manufacturing" },
  delivery: { ar: "عند التوصيل", en: "Delivery" },
  final: { ar: "نهائية", en: "Final" },
};

const methodLabels: Record<string, { ar: string; en: string }> = {
  bank_transfer: { ar: "تحويل بنكي", en: "Bank Transfer" },
  cash: { ar: "نقداً", en: "Cash" },
  card: { ar: "بطاقة", en: "Card" },
};

const quotationStatusLabels: Record<string, { ar: string; en: string; color: string }> = {
  draft: { ar: "مسودة", en: "Draft", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  requested: { ar: "طلب جديد", en: "New Request", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
  open: { ar: "مفتوح", en: "Open", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  sent: { ar: "أُرسل", en: "Sent", color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
  approved: { ar: "مُعتمد", en: "Approved", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  rejected: { ar: "مرفوض", en: "Rejected", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
  expired: { ar: "منتهي", en: "Expired", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  converted: { ar: "محوّل لعقد", en: "Converted", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" },
};

const roleSubtitles: Record<string, { ar: string; en: string }> = {
  owner: { ar: "نظرة عامة على أداء المصنع", en: "Factory performance overview" },
  assistant: { ar: "نظرة عامة على أداء المصنع", en: "Factory performance overview" },
  it: { ar: "لوحة التحكم التقنية", en: "Technical Dashboard" },
  sales: { ar: "لوحة أداء المبيعات الخاصة بك", en: "Your personal sales performance" },
  designer: { ar: "ملخص مهام التصميم الخاصة بك", en: "Your design tasks summary" },
  production: { ar: "لوحة مراقبة الإنتاج", en: "Production monitoring dashboard" },
  accountant: { ar: "لوحة الحسابات المالية", en: "Financial accounts dashboard" },
  warehouse: { ar: "لوحة إدارة المخزون", en: "Inventory management dashboard" },
  purchasing: { ar: "لوحة المشتريات والموردين", en: "Purchasing & suppliers dashboard" },
  delivery: { ar: "لوحة متابعة التوصيل", en: "Delivery tracking dashboard" },
  installation: { ar: "لوحة التركيب والصيانة", en: "Installation & maintenance dashboard" },
  quality: { ar: "لوحة ضمان الجودة", en: "Quality assurance dashboard" },
  hr: { ar: "لوحة الموارد البشرية", en: "Human resources dashboard" },
  customer_service: { ar: "لوحة خدمة العملاء", en: "Customer service dashboard" },
};

export default function DashboardPage() {
  const { t, lang } = useLanguage();
  const { user } = useAuth();

  const role = user?.role || "sales";
  const isFullAccess = ["owner", "assistant", "it"].includes(role);
  const isSales = role === "sales";
  const isDesigner = role === "designer";
  const isProduction = role === "production";
  const isAccountant = role === "accountant";
  const isWarehouse = role === "warehouse" || role === "purchasing";
  const isDelivery = role === "delivery";
  const isInstallation = role === "installation";
  const isQuality = role === "quality";
  const isHR = role === "hr";
  const isCustomerService = role === "customer_service";

  const { data: stats, isLoading: statsLoading } = useQuery<any>({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: quotations = [], isLoading: quotationsLoading } = useQuery<any[]>({
    queryKey: ["/api/quotations"],
    enabled: isSales || isDesigner || isAccountant || isFullAccess,
  });

  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ["/api/customers"],
    enabled: isSales || isCustomerService || isFullAccess,
  });

  const { data: inspections = [] } = useQuery<any[]>({
    queryKey: ["/api/inspections"],
    enabled: isSales || isFullAccess,
  });

  const { data: designAssignments = [] } = useQuery<any[]>({
    queryKey: ["/api/design-assignments"],
    enabled: isDesigner || isFullAccess,
  });

  const { data: workOrders = [] } = useQuery<any[]>({
    queryKey: ["/api/work-orders"],
    enabled: isProduction || isFullAccess,
  });

  const { data: deliveries = [] } = useQuery<any[]>({
    queryKey: ["/api/deliveries"],
    enabled: isDelivery || isFullAccess,
  });

  const { data: maintenanceList = [] } = useQuery<any[]>({
    queryKey: ["/api/maintenance"],
    enabled: isInstallation || isCustomerService || isFullAccess,
  });

  const { data: qualityChecks = [] } = useQuery<any[]>({
    queryKey: ["/api/quality-checks"],
    enabled: isQuality || isFullAccess,
  });

  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ["/api/employees"],
    enabled: isHR || isFullAccess,
  });

  const isLoading = statsLoading;
  const ArrowIcon = lang === "ar" ? ArrowLeft : ArrowRight;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="relative w-20 h-20 flex items-center justify-center">
          <div className="w-20 h-20 rounded-full border-[3px] border-muted border-t-primary animate-spin absolute inset-0" />
          <img src={teakLogo} alt="Teak" className="w-12 h-12 object-contain logo-auto animate-pulse relative z-10" />
        </div>
        <p className="text-sm text-muted-foreground animate-pulse">{t("جاري تحميل لوحة التحكم...", "Loading dashboard...")}</p>
      </div>
    );
  }

  const subtitle = roleSubtitles[role] || roleSubtitles.sales;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-dashboard-title">
          {t(`مرحباً ${user?.fullNameAr || ""}`, `Welcome ${user?.fullNameEn || ""}`)}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t(subtitle.ar, subtitle.en)}
        </p>
      </div>

      {/* ========== OWNER / ASSISTANT / IT — FULL DASHBOARD ========== */}
      {isFullAccess && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Link href="/order-center">
              <Card className={`cursor-pointer hover:shadow-md transition-shadow ${(stats?.newOrders || 0) > 0 ? "border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20" : ""}`} data-testid="stat-new-orders">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center relative ${(stats?.newOrders || 0) > 0 ? "bg-red-500/10" : "bg-muted"}`}>
                    <Sparkles className={`w-5 h-5 ${(stats?.newOrders || 0) > 0 ? "text-red-500" : "text-muted-foreground"}`} />
                    {(stats?.newOrders || 0) > 0 && (
                      <span className="absolute -top-1 -end-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center animate-pulse">
                        {stats.newOrders}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className={`text-lg font-bold ${(stats?.newOrders || 0) > 0 ? "text-red-600 dark:text-red-400" : ""}`}>{stats?.newOrders || 0}</p>
                    <p className="text-[11px] text-muted-foreground">{t("طلبات جديدة", "New Orders")}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
            <StatCard icon={Users} color="text-blue-500" bg="bg-blue-500/10" value={stats?.totalCustomers || 0} label={t("العملاء", "Customers")} testId="stat-customers" />
            <StatCard icon={FileText} color="text-amber-500" bg="bg-amber-500/10" value={stats?.totalQuotations || 0} label={t("عروض الأسعار", "Quotations")} testId="stat-quotations" />
            <StatCard icon={FolderOpen} color="text-green-500" bg="bg-green-500/10" value={stats?.activeContracts || 0} label={t("العقود النشطة", "Active Contracts")} testId="stat-contracts" />
            <StatCard icon={SarIcon} color="text-primary" bg="bg-primary/10" value={`${(stats?.totalRevenue || 0).toLocaleString()}`} subValue={t("ر.س", "SAR")} label={t("إجمالي الإيرادات", "Total Revenue")} testId="stat-revenue" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <WorkOrderStatusCard stats={stats} t={t} ArrowIcon={ArrowIcon} />
            <PaymentsByStageCard stats={stats} t={t} ArrowIcon={ArrowIcon} stageLabels={stageLabels} methodLabels={methodLabels} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <MiniCard icon={Factory} value={stats?.inProductionOrders || 0} label={t("قيد التصنيع", "In Production")} color="text-blue-500" testId="mini-production" />
            <MiniCard icon={AlertTriangle} value={stats?.lowStockItems || 0} label={t("مخزون منخفض", "Low Stock")} color="text-orange-500" testId="mini-lowstock" />
            <MiniCard icon={Truck} value={stats?.pendingDeliveries || 0} label={t("توصيلات معلقة", "Pending Deliveries")} color="text-purple-500" testId="mini-deliveries" />
            <MiniCard icon={Wrench} value={stats?.pendingMaintenance || 0} label={t("صيانة معلقة", "Pending Maintenance")} color="text-red-500" testId="mini-maintenance" />
            <MiniCard icon={Shield} value={`${stats?.qualityPassRate || 0}%`} label={t("نسبة النجاح", "Pass Rate")} color="text-green-600" testId="mini-quality" />
          </div>

          <InspectionScheduleSection inspections={inspections} t={t} lang={lang} />

          <Card data-testid="card-order-competition">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-primary" />
                {t("توزيع الطلبات على المناديب", "Order Distribution")}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center p-3 rounded-lg bg-red-50 dark:bg-red-950/30">
                  <p className="text-2xl font-bold text-red-600" data-testid="text-open-pool-count">{stats?.openPoolCount || 0}</p>
                  <p className="text-xs text-muted-foreground">{t("طلبات مفتوحة", "Open Pool")}</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                  <p className="text-2xl font-bold text-blue-600" data-testid="text-assigned-count">{(stats?.totalQuotations || 0) - (stats?.openPoolCount || 0)}</p>
                  <p className="text-xs text-muted-foreground">{t("مع المناديب", "With Agents")}</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30">
                  <p className="text-2xl font-bold text-amber-600" data-testid="text-transferred-count">{stats?.transferredCount || 0}</p>
                  <p className="text-xs text-muted-foreground">{t("تم تحويلها", "Transferred")}</p>
                </div>
              </div>
              {(stats?.agentDistribution || []).length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">{t("توزيع حسب المندوب", "Per Agent")}</p>
                  {(stats?.agentDistribution || []).map((agent: any) => (
                    <div key={agent.userId} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                      <span>{lang === "ar" ? agent.nameAr : agent.nameEn}</span>
                      <Badge variant="secondary" data-testid={`badge-agent-count-${agent.userId}`}>{agent.orderCount}</Badge>
                    </div>
                  ))}
                </div>
              )}
              <Link href="/order-center">
                <Button variant="ghost" size="sm" className="w-full mt-3" data-testid="link-view-order-center">
                  {t("مركز الطلبات", "Order Center")} <ArrowIcon className="w-4 h-4 ms-1" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          <DesignApprovalSection designAssignments={designAssignments} t={t} lang={lang} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-primary" />
                  {t("الموظفون", "Employees")}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center p-3 rounded-lg bg-muted/50">
                    <p className="text-2xl font-bold" data-testid="text-active-employees">{stats?.activeEmployees || 0}</p>
                    <p className="text-xs text-muted-foreground">{t("موظف نشط", "Active")}</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/50">
                    <p className="text-2xl font-bold">{(stats?.totalSalaries || 0).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{t("إجمالي الرواتب", "Total Salaries")}</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-950/30">
                    <p className="text-xl font-bold text-green-600">{stats?.saudiEmployees || 0}</p>
                    <p className="text-xs text-muted-foreground">{t("سعودي", "Saudi")}</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                    <p className="text-xl font-bold text-blue-600">{stats?.residentEmployees || 0}</p>
                    <p className="text-xs text-muted-foreground">{t("مقيم", "Resident")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="w-5 h-5 text-primary" />
                  {t("آخر المدفوعات", "Recent Payments")}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                {(stats?.recentPayments?.length || 0) === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">{t("لا توجد مدفوعات بعد", "No payments yet")}</p>
                ) : (
                  <div className="space-y-2.5">
                    {stats.recentPayments.map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{p.customerName}</p>
                          <p className="text-xs text-muted-foreground">
                            {t(stageLabels[p.stage]?.ar || p.stage, stageLabels[p.stage]?.en || p.stage)}
                          </p>
                        </div>
                        <div className="text-end shrink-0 ms-3">
                          <p className="font-semibold">{parseFloat(p.amount).toLocaleString()} {t("ر.س", "SAR")}</p>
                          <Badge variant="secondary" className="text-[10px]">
                            {t(methodLabels[p.method]?.ar || p.method, methodLabels[p.method]?.en || p.method)}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <QuickLinkCard href="/quotations" icon={FileText} color="bg-amber-500/10" iconColor="text-amber-500" value={stats?.pendingQuotations || 0} label={t("عروض أسعار معلقة", "Pending Quotations")} ArrowIcon={ArrowIcon} testId="card-pending-quotes" />
            <QuickLinkCard href="/inventory" icon={Package} color="bg-orange-500/10" iconColor="text-orange-500" value={stats?.totalInventoryItems || 0} label={t("مواد في المخزون", "Inventory Items")} ArrowIcon={ArrowIcon} testId="card-inventory-alert" />
            <QuickLinkCard href="/work-orders" icon={TrendingUp} color="bg-blue-500/10" iconColor="text-blue-500" value={stats?.totalWorkOrders || 0} label={t("إجمالي أوامر العمل", "Total Work Orders")} ArrowIcon={ArrowIcon} testId="card-production-overview" />
          </div>
        </>
      )}

      {/* ========== SALES DASHBOARD ========== */}
      {isSales && (
        <SalesDashboard
          quotations={quotations}
          customers={customers}
          inspections={inspections}
          stats={stats}
          t={t}
          lang={lang}
          ArrowIcon={ArrowIcon}
          quotationStatusLabels={quotationStatusLabels}
        />
      )}

      {/* ========== DESIGNER DASHBOARD ========== */}
      {isDesigner && (
        <DesignerDashboard
          designAssignments={designAssignments}
          quotations={quotations}
          t={t}
          lang={lang}
          ArrowIcon={ArrowIcon}
        />
      )}

      {/* ========== PRODUCTION DASHBOARD ========== */}
      {isProduction && (
        <ProductionDashboard
          stats={stats}
          workOrders={workOrders}
          t={t}
          lang={lang}
          ArrowIcon={ArrowIcon}
        />
      )}

      {/* ========== ACCOUNTANT DASHBOARD ========== */}
      {isAccountant && (
        <AccountantDashboard
          stats={stats}
          t={t}
          lang={lang}
          ArrowIcon={ArrowIcon}
          stageLabels={stageLabels}
          methodLabels={methodLabels}
        />
      )}

      {/* ========== WAREHOUSE / PURCHASING DASHBOARD ========== */}
      {isWarehouse && (
        <WarehouseDashboard
          stats={stats}
          t={t}
          lang={lang}
          ArrowIcon={ArrowIcon}
          role={role}
        />
      )}

      {/* ========== DELIVERY DASHBOARD ========== */}
      {isDelivery && (
        <DeliveryDashboard
          stats={stats}
          deliveries={deliveries}
          t={t}
          lang={lang}
          ArrowIcon={ArrowIcon}
        />
      )}

      {/* ========== INSTALLATION DASHBOARD ========== */}
      {isInstallation && (
        <InstallationDashboard
          stats={stats}
          maintenanceList={maintenanceList}
          t={t}
          lang={lang}
          ArrowIcon={ArrowIcon}
        />
      )}

      {/* ========== QUALITY DASHBOARD ========== */}
      {isQuality && (
        <QualityDashboard
          stats={stats}
          qualityChecks={qualityChecks}
          t={t}
          lang={lang}
          ArrowIcon={ArrowIcon}
        />
      )}

      {/* ========== HR DASHBOARD ========== */}
      {isHR && (
        <HRDashboard
          stats={stats}
          employees={employees}
          t={t}
          lang={lang}
          ArrowIcon={ArrowIcon}
        />
      )}

      {/* ========== CUSTOMER SERVICE DASHBOARD ========== */}
      {isCustomerService && (
        <CustomerServiceDashboard
          customers={customers}
          maintenanceList={maintenanceList}
          stats={stats}
          t={t}
          lang={lang}
          ArrowIcon={ArrowIcon}
        />
      )}
    </div>
  );
}

// ================================================================
// ROLE-SPECIFIC DASHBOARD SECTIONS
// ================================================================

function SalesDashboard({ quotations, customers, inspections, stats, t, lang, ArrowIcon, quotationStatusLabels }: any) {
  const today = new Date().toISOString().split("T")[0];

  const myTotal = quotations.length;
  const myPending = quotations.filter((q: any) => ["draft", "sent", "open", "requested"].includes(q.status)).length;
  const myApproved = quotations.filter((q: any) => q.status === "approved" || q.status === "converted").length;
  const myRevenue = quotations
    .filter((q: any) => q.status === "converted" || q.status === "approved")
    .reduce((sum: number, q: any) => sum + parseFloat(q.totalAmount || q.netAmount || "0"), 0);

  const todayInspections = inspections.filter((i: any) => i.inspectionDate === today);
  const upcomingInspections = inspections.filter((i: any) => i.inspectionDate >= today).slice(0, 5);
  const recentQuotations = [...quotations]
    .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, 6);

  return (
    <div className="space-y-6">
      {/* My Performance Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={FileText} color="text-blue-500" bg="bg-blue-500/10" value={myTotal} label={t("إجمالي طلباتي", "My Total Orders")} testId="stat-my-total" />
        <StatCard icon={Clock} color="text-amber-500" bg="bg-amber-500/10" value={myPending} label={t("معلقة", "Pending")} testId="stat-my-pending" />
        <StatCard icon={CheckCircle2} color="text-green-500" bg="bg-green-500/10" value={myApproved} label={t("مُعتمدة", "Approved")} testId="stat-my-approved" />
        <StatCard icon={Users} color="text-purple-500" bg="bg-purple-500/10" value={customers.length} label={t("عملائي", "My Customers")} testId="stat-my-customers" />
      </div>

      {/* Revenue card */}
      <Card data-testid="card-my-revenue">
        <CardContent className="p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <SarIcon className="w-6 h-6 text-primary text-base" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-2xl font-bold">{myRevenue.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">{t("ر.س", "SAR")}</span></p>
            <p className="text-sm text-muted-foreground">{t("إيراداتي من الطلبات المُعتمدة", "Revenue from approved orders")}</p>
          </div>
          <Link href="/payments">
            <Button variant="outline" size="sm">{t("المدفوعات", "Payments")}</Button>
          </Link>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Today's Appointments */}
        <Card data-testid="card-today-appointments">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarCheck className="w-5 h-5 text-primary" />
              {t("مواعيد اليوم", "Today's Appointments")}
              <Badge className="ms-auto">{todayInspections.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            {todayInspections.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t("لا توجد مواعيد اليوم", "No appointments today")}</p>
            ) : (
              <div className="space-y-2">
                {todayInspections.map((insp: any) => (
                  <div key={insp.quotationId} className="flex items-center gap-3 p-2.5 rounded-lg bg-primary/5 border border-primary/10" data-testid={`appointment-today-${insp.quotationId}`}>
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <MapPin className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{insp.customer?.fullName || "—"}</p>
                      <p className="text-xs text-muted-foreground">{insp.inspectionDate}</p>
                    </div>
                    <Badge variant="default" className="shrink-0 text-[10px]">{t("اليوم", "Today")}</Badge>
                  </div>
                ))}
              </div>
            )}
            <Link href="/my-calendar">
              <Button variant="ghost" size="sm" className="w-full mt-3" data-testid="link-my-calendar">
                {t("فتح التقويم", "Open Calendar")} <ArrowIcon className="w-4 h-4 ms-1" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Upcoming Inspections */}
        <Card data-testid="card-upcoming-inspections">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-primary" />
              {t("المواعيد القادمة", "Upcoming Appointments")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            {upcomingInspections.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t("لا توجد مواعيد قادمة", "No upcoming appointments")}</p>
            ) : (
              <div className="space-y-2">
                {upcomingInspections.map((insp: any) => (
                  <div key={insp.quotationId} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0" data-testid={`inspection-upcoming-${insp.quotationId}`}>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{insp.customer?.fullName || "—"}</p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 ms-2">{insp.inspectionDate}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Quotations */}
      <Card data-testid="card-my-recent-quotations">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            {t("آخر عروض أسعاري", "My Recent Quotations")}
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          {recentQuotations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">{t("لا توجد عروض أسعار بعد", "No quotations yet")}</p>
          ) : (
            <div className="space-y-2">
              {recentQuotations.map((q: any) => {
                const statusInfo = quotationStatusLabels[q.status] || { ar: q.status, en: q.status, color: "bg-gray-100 text-gray-700" };
                return (
                  <div key={q.id} className="flex items-center gap-3 py-2 border-b last:border-0" data-testid={`quotation-row-${q.id}`}>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{q.title || `#${q.id}`}</p>
                      <p className="text-xs text-muted-foreground truncate">{q.customer?.fullName || q.customerName || "—"}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusInfo.color}`}>
                        {lang === "ar" ? statusInfo.ar : statusInfo.en}
                      </span>
                      {q.netAmount && (
                        <span className="text-xs font-semibold">{parseFloat(q.netAmount).toLocaleString()} {t("ر.س", "SAR")}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <Link href="/my-orders">
            <Button variant="ghost" size="sm" className="w-full mt-3" data-testid="link-my-orders">
              {t("عرض كل طلباتي", "View All My Orders")} <ArrowIcon className="w-4 h-4 ms-1" />
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <QuickLinkCard href="/my-orders" icon={ClipboardCheck} color="bg-blue-500/10" iconColor="text-blue-500" value={myTotal} label={t("طلباتي", "My Orders")} ArrowIcon={ArrowIcon} testId="quick-my-orders" />
        <QuickLinkCard href="/customers" icon={Users} color="bg-purple-500/10" iconColor="text-purple-500" value={customers.length} label={t("عملائي", "My Customers")} ArrowIcon={ArrowIcon} testId="quick-my-customers" />
        <QuickLinkCard href="/quotations" icon={FileText} color="bg-amber-500/10" iconColor="text-amber-500" value={myPending} label={t("عروض معلقة", "Pending Quotes")} ArrowIcon={ArrowIcon} testId="quick-pending-quotes" />
        <QuickLinkCard href="/my-calendar" icon={Calendar} color="bg-green-500/10" iconColor="text-green-500" value={todayInspections.length} label={t("مواعيد اليوم", "Today's Appts")} ArrowIcon={ArrowIcon} testId="quick-calendar" />
      </div>

      {/* Daily Performance Quick Link */}
      <Link href="/daily-performance">
        <Card className="cursor-pointer hover:shadow-md transition-shadow border-primary/20 bg-primary/5" data-testid="card-daily-performance-link">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm">{t("تسجيل أداء اليوم", "Log Today's Performance")}</p>
              <p className="text-xs text-muted-foreground">{t("اتصالات · واتس آب · زيارات المعرض", "Calls · WhatsApp · Showroom visits")}</p>
            </div>
            <ArrowIcon className="w-4 h-4 text-muted-foreground shrink-0" />
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}

function DesignerDashboard({ designAssignments, quotations, t, lang, ArrowIcon }: any) {
  const myAssignments = designAssignments;
  const pending = myAssignments.filter((d: any) => d.status === "pending" || d.status === "in_progress").length;
  const completed = myAssignments.filter((d: any) => d.status === "completed").length;
  const awaitingApproval = myAssignments.filter((d: any) => d.status === "completed" && !d.customerApproval).length;
  const approved = myAssignments.filter((d: any) => d.customerApproval === "approved").length;
  const revisions = myAssignments.filter((d: any) => d.customerApproval === "revision_requested").length;
  const recentDesigns = [...myAssignments]
    .sort((a: any, b: any) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Palette} color="text-purple-500" bg="bg-purple-500/10" value={myAssignments.length} label={t("إجمالي مهامي", "Total Tasks")} testId="stat-design-total" />
        <StatCard icon={Clock} color="text-amber-500" bg="bg-amber-500/10" value={pending} label={t("جارية", "In Progress")} testId="stat-design-pending" />
        <StatCard icon={CheckCircle2} color="text-green-500" bg="bg-green-500/10" value={completed} label={t("مكتملة", "Completed")} testId="stat-design-completed" />
        <StatCard icon={MessageSquare} color="text-blue-500" bg="bg-blue-500/10" value={revisions} label={t("تعديلات مطلوبة", "Revisions Needed")} testId="stat-design-revisions" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="text-center p-4 rounded-xl bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800">
          <p className="text-3xl font-bold text-yellow-600" data-testid="text-awaiting-approval">{awaitingApproval}</p>
          <p className="text-sm text-muted-foreground mt-1">{t("بانتظار موافقة العميل", "Awaiting Customer Approval")}</p>
        </div>
        <div className="text-center p-4 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
          <p className="text-3xl font-bold text-green-600" data-testid="text-approved-designs">{approved}</p>
          <p className="text-sm text-muted-foreground mt-1">{t("موافق عليها", "Approved by Customer")}</p>
        </div>
        <div className="text-center p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          <p className="text-3xl font-bold text-amber-600" data-testid="text-revision-designs">{revisions}</p>
          <p className="text-sm text-muted-foreground mt-1">{t("تحتاج تعديل", "Need Revision")}</p>
        </div>
      </div>

      <Card data-testid="card-my-design-assignments">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="w-5 h-5 text-primary" />
            {t("مهام التصميم الأخيرة", "Recent Design Tasks")}
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          {recentDesigns.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">{t("لا توجد مهام بعد", "No tasks yet")}</p>
          ) : (
            <div className="space-y-2">
              {recentDesigns.map((da: any) => {
                const statusColor = da.status === "completed" ? "text-green-600" : da.status === "in_progress" ? "text-blue-600" : "text-gray-600";
                const approvalBadge = da.customerApproval === "approved"
                  ? <Badge className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400 text-[10px]">{t("معتمد", "Approved")}</Badge>
                  : da.customerApproval === "revision_requested"
                  ? <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 text-[10px]">{t("تعديل", "Revision")}</Badge>
                  : da.status === "completed"
                  ? <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400 text-[10px]">{t("بالانتظار", "Pending")}</Badge>
                  : null;
                return (
                  <div key={da.id} className="flex items-center gap-3 py-2 border-b last:border-0" data-testid={`design-row-${da.id}`}>
                    <span className="font-mono text-xs text-muted-foreground shrink-0">#{da.quotationId || da.id}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${statusColor}`}>
                        {da.status === "completed" ? t("مكتمل", "Completed") : da.status === "in_progress" ? t("جاري", "In Progress") : t("معلق", "Pending")}
                      </p>
                    </div>
                    {approvalBadge}
                  </div>
                );
              })}
            </div>
          )}
          <Link href="/quotations">
            <Button variant="ghost" size="sm" className="w-full mt-3" data-testid="link-design-quotations">
              {t("عرض عروض الأسعار", "View Quotations")} <ArrowIcon className="w-4 h-4 ms-1" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function ProductionDashboard({ stats, workOrders, t, lang, ArrowIcon }: any) {
  const myInProd = workOrders.filter((w: any) => w.status === "in_production").length;
  const myQuality = workOrders.filter((w: any) => w.status === "quality_check").length;
  const myReady = workOrders.filter((w: any) => w.status === "ready").length;
  const myPending = workOrders.filter((w: any) => w.status === "pending").length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Clock} color="text-gray-500" bg="bg-gray-500/10" value={myPending} label={t("في الانتظار", "Pending")} testId="stat-prod-pending" />
        <StatCard icon={Factory} color="text-blue-500" bg="bg-blue-500/10" value={myInProd} label={t("قيد التصنيع", "In Production")} testId="stat-prod-inprod" />
        <StatCard icon={Shield} color="text-yellow-500" bg="bg-yellow-500/10" value={myQuality} label={t("فحص الجودة", "Quality Check")} testId="stat-prod-quality" />
        <StatCard icon={CheckCircle2} color="text-green-500" bg="bg-green-500/10" value={myReady} label={t("جاهزة للتسليم", "Ready to Deliver")} testId="stat-prod-ready" />
      </div>

      <WorkOrderStatusCard stats={stats} t={t} ArrowIcon={ArrowIcon} />

      <div className="grid grid-cols-2 gap-3">
        <QuickLinkCard href="/work-orders" icon={ClipboardCheck} color="bg-blue-500/10" iconColor="text-blue-500" value={workOrders.length} label={t("أوامر العمل", "Work Orders")} ArrowIcon={ArrowIcon} testId="quick-work-orders" />
        <QuickLinkCard href="/production" icon={Factory} color="bg-purple-500/10" iconColor="text-purple-500" value={myInProd} label={t("خط الإنتاج", "Production Line")} ArrowIcon={ArrowIcon} testId="quick-production" />
      </div>
    </div>
  );
}

function AccountantDashboard({ stats, t, lang, ArrowIcon, stageLabels, methodLabels }: any) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard icon={SarIcon} color="text-primary" bg="bg-primary/10" value={`${(stats?.totalRevenue || 0).toLocaleString()}`} subValue={t("ر.س", "SAR")} label={t("إجمالي الإيرادات", "Total Revenue")} testId="stat-acc-revenue" />
        <StatCard icon={CreditCard} color="text-green-500" bg="bg-green-500/10" value={stats?.totalPayments || 0} label={t("المدفوعات", "Payments")} testId="stat-acc-payments" />
        <StatCard icon={FolderOpen} color="text-amber-500" bg="bg-amber-500/10" value={stats?.activeContracts || 0} label={t("العقود النشطة", "Active Contracts")} testId="stat-acc-contracts" />
      </div>

      <PaymentsByStageCard stats={stats} t={t} ArrowIcon={ArrowIcon} stageLabels={stageLabels} methodLabels={methodLabels} />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <QuickLinkCard href="/payments" icon={CreditCard} color="bg-green-500/10" iconColor="text-green-500" value={stats?.totalPayments || 0} label={t("المدفوعات", "Payments")} ArrowIcon={ArrowIcon} testId="quick-acc-payments" />
        <QuickLinkCard href="/invoices" icon={Receipt} color="bg-blue-500/10" iconColor="text-blue-500" value={""} label={t("الفواتير", "Invoices")} ArrowIcon={ArrowIcon} testId="quick-acc-invoices" />
        <QuickLinkCard href="/finance" icon={BarChart3} color="bg-purple-500/10" iconColor="text-purple-500" value={""} label={t("التقارير المالية", "Financial Reports")} ArrowIcon={ArrowIcon} testId="quick-acc-finance" />
      </div>
    </div>
  );
}

function WarehouseDashboard({ stats, t, lang, ArrowIcon, role }: any) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard icon={Package} color="text-blue-500" bg="bg-blue-500/10" value={stats?.totalInventoryItems || 0} label={t("مواد في المخزون", "Inventory Items")} testId="stat-wh-items" />
        <StatCard icon={AlertTriangle} color="text-orange-500" bg="bg-orange-500/10" value={stats?.lowStockItems || 0} label={t("مخزون منخفض", "Low Stock")} testId="stat-wh-lowstock" />
        <StatCard icon={ShoppingCart} color="text-purple-500" bg="bg-purple-500/10" value={""} label={t("طلبات الشراء", "Purchase Orders")} testId="stat-wh-purchases" />
      </div>

      {(stats?.lowStockItems || 0) > 0 && (
        <Card className="border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0" />
            <p className="text-sm font-medium text-orange-700 dark:text-orange-300">
              {t(`تنبيه: ${stats.lowStockItems} صنف بمخزون منخفض يحتاج إعادة طلب`, `Alert: ${stats.lowStockItems} items need reorder`)}
            </p>
            <Link href="/inventory" className="ms-auto">
              <Button size="sm" variant="outline">{t("المخزون", "Inventory")}</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <QuickLinkCard href="/inventory" icon={Package} color="bg-blue-500/10" iconColor="text-blue-500" value={stats?.totalInventoryItems || 0} label={t("المخزون", "Inventory")} ArrowIcon={ArrowIcon} testId="quick-wh-inventory" />
        <QuickLinkCard href="/suppliers" icon={Users} color="bg-purple-500/10" iconColor="text-purple-500" value={""} label={t("الموردون", "Suppliers")} ArrowIcon={ArrowIcon} testId="quick-wh-suppliers" />
        {role === "purchasing" && (
          <QuickLinkCard href="/purchases" icon={ShoppingCart} color="bg-green-500/10" iconColor="text-green-500" value={""} label={t("المشتريات", "Purchases")} ArrowIcon={ArrowIcon} testId="quick-wh-purchases" />
        )}
      </div>
    </div>
  );
}

function DeliveryDashboard({ stats, deliveries, t, lang, ArrowIcon }: any) {
  const today = new Date().toISOString().split("T")[0];
  const todayDeliveries = deliveries.filter((d: any) => d.scheduledDate === today).length;
  const pendingCount = deliveries.filter((d: any) => d.status === "scheduled" || d.status === "in_transit").length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard icon={Truck} color="text-purple-500" bg="bg-purple-500/10" value={pendingCount} label={t("توصيلات معلقة", "Pending Deliveries")} testId="stat-del-pending" />
        <StatCard icon={CalendarCheck} color="text-blue-500" bg="bg-blue-500/10" value={todayDeliveries} label={t("توصيلات اليوم", "Today's Deliveries")} testId="stat-del-today" />
        <StatCard icon={CheckCircle2} color="text-green-500" bg="bg-green-500/10" value={deliveries.filter((d: any) => d.status === "delivered").length} label={t("تم التوصيل", "Delivered")} testId="stat-del-done" />
      </div>
      <QuickLinkCard href="/deliveries" icon={Truck} color="bg-purple-500/10" iconColor="text-purple-500" value={pendingCount} label={t("كل التوصيلات", "All Deliveries")} ArrowIcon={ArrowIcon} testId="quick-deliveries" />
    </div>
  );
}

function InstallationDashboard({ stats, maintenanceList, t, lang, ArrowIcon }: any) {
  const pendingInstall = stats?.pendingMaintenance || 0;
  const pendingMaint = maintenanceList.filter((m: any) => m.status === "pending" || m.status === "scheduled").length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={Wrench} color="text-blue-500" bg="bg-blue-500/10" value={pendingInstall} label={t("تركيبات معلقة", "Pending Installations")} testId="stat-inst-pending" />
        <StatCard icon={AlertTriangle} color="text-orange-500" bg="bg-orange-500/10" value={pendingMaint} label={t("صيانة معلقة", "Pending Maintenance")} testId="stat-inst-maintenance" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <QuickLinkCard href="/installations" icon={Wrench} color="bg-blue-500/10" iconColor="text-blue-500" value={pendingInstall} label={t("التركيب", "Installations")} ArrowIcon={ArrowIcon} testId="quick-installations" />
        <QuickLinkCard href="/installations" icon={AlertTriangle} color="bg-orange-500/10" iconColor="text-orange-500" value={pendingMaint} label={t("الصيانة", "Maintenance")} ArrowIcon={ArrowIcon} testId="quick-maintenance" />
      </div>
    </div>
  );
}

function QualityDashboard({ stats, qualityChecks, t, lang, ArrowIcon }: any) {
  const passCount = qualityChecks.filter((q: any) => q.result === "pass").length;
  const failCount = qualityChecks.filter((q: any) => q.result === "fail").length;
  const passRate = stats?.qualityPassRate || 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard icon={Shield} color="text-green-500" bg="bg-green-500/10" value={`${passRate}%`} label={t("نسبة النجاح", "Pass Rate")} testId="stat-q-rate" />
        <StatCard icon={CheckCircle2} color="text-blue-500" bg="bg-blue-500/10" value={passCount} label={t("اجتاز الفحص", "Passed")} testId="stat-q-pass" />
        <StatCard icon={AlertTriangle} color="text-red-500" bg="bg-red-500/10" value={failCount} label={t("فشل الفحص", "Failed")} testId="stat-q-fail" />
      </div>

      {/* Pass Rate Visual */}
      <Card data-testid="card-quality-rate">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">{t("معدل اجتياز الجودة", "Quality Pass Rate")}</span>
            <span className="text-2xl font-bold text-green-600">{passRate}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-3">
            <div
              className="bg-green-500 h-3 rounded-full transition-all duration-500"
              style={{ width: `${passRate}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {t(`${passCount} نجح من أصل ${qualityChecks.length} فحص`, `${passCount} passed out of ${qualityChecks.length} checks`)}
          </p>
        </CardContent>
      </Card>

      <QuickLinkCard href="/quality" icon={Shield} color="bg-green-500/10" iconColor="text-green-500" value={qualityChecks.length} label={t("كل فحوصات الجودة", "All Quality Checks")} ArrowIcon={ArrowIcon} testId="quick-quality" />
    </div>
  );
}

function HRDashboard({ stats, employees, t, lang, ArrowIcon }: any) {
  const active = employees.filter((e: any) => e.status === "active").length;
  const saudi = employees.filter((e: any) => e.nationality === "saudi" && e.status === "active").length;
  const resident = employees.filter((e: any) => e.nationality !== "saudi" && e.status === "active").length;
  const totalSalaries = employees
    .filter((e: any) => e.status === "active")
    .reduce((sum: number, e: any) => sum + parseFloat(e.monthlySalary || "0"), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={UserCheck} color="text-blue-500" bg="bg-blue-500/10" value={active} label={t("موظف نشط", "Active Employees")} testId="stat-hr-active" />
        <StatCard icon={Star} color="text-green-500" bg="bg-green-500/10" value={saudi} label={t("سعودي", "Saudi")} testId="stat-hr-saudi" />
        <StatCard icon={UserCircle} color="text-purple-500" bg="bg-purple-500/10" value={resident} label={t("مقيم", "Resident")} testId="stat-hr-resident" />
        <StatCard icon={SarIcon} color="text-primary" bg="bg-primary/10" value={`${totalSalaries.toLocaleString()}`} subValue={t("ر.س", "SAR")} label={t("إجمالي الرواتب", "Total Salaries")} testId="stat-hr-salaries" />
      </div>

      <Card data-testid="card-hr-summary">
        <CardContent className="p-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-3 rounded-xl bg-green-50 dark:bg-green-950/30">
              <p className="text-3xl font-bold text-green-600">{saudi}</p>
              <p className="text-sm text-muted-foreground mt-1">{t("سعوديون", "Saudi")}</p>
              <p className="text-xs text-muted-foreground">{active > 0 ? Math.round((saudi / active) * 100) : 0}%</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30">
              <p className="text-3xl font-bold text-blue-600">{resident}</p>
              <p className="text-sm text-muted-foreground mt-1">{t("مقيمون", "Residents")}</p>
              <p className="text-xs text-muted-foreground">{active > 0 ? Math.round((resident / active) * 100) : 0}%</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <QuickLinkCard href="/employees" icon={UserCheck} color="bg-blue-500/10" iconColor="text-blue-500" value={active} label={t("إدارة الموظفين", "Manage Employees")} ArrowIcon={ArrowIcon} testId="quick-employees" />
    </div>
  );
}

function CustomerServiceDashboard({ customers, maintenanceList, stats, t, lang, ArrowIcon }: any) {
  const pendingMaint = maintenanceList.filter((m: any) => m.status === "pending" || m.status === "scheduled").length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard icon={Users} color="text-blue-500" bg="bg-blue-500/10" value={customers.length} label={t("العملاء", "Customers")} testId="stat-cs-customers" />
        <StatCard icon={Wrench} color="text-orange-500" bg="bg-orange-500/10" value={pendingMaint} label={t("صيانة معلقة", "Pending Maintenance")} testId="stat-cs-maintenance" />
        <StatCard icon={FileText} color="text-green-500" bg="bg-green-500/10" value={stats?.activeContracts || 0} label={t("عقود نشطة", "Active Contracts")} testId="stat-cs-contracts" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <QuickLinkCard href="/customers" icon={Users} color="bg-blue-500/10" iconColor="text-blue-500" value={customers.length} label={t("العملاء", "Customers")} ArrowIcon={ArrowIcon} testId="quick-cs-customers" />
        <QuickLinkCard href="/installations" icon={Wrench} color="bg-orange-500/10" iconColor="text-orange-500" value={pendingMaint} label={t("الصيانة", "Maintenance")} ArrowIcon={ArrowIcon} testId="quick-cs-maintenance" />
        <QuickLinkCard href="/contracts" icon={FolderOpen} color="bg-green-500/10" iconColor="text-green-500" value={stats?.activeContracts || 0} label={t("العقود", "Contracts")} ArrowIcon={ArrowIcon} testId="quick-cs-contracts" />
      </div>
    </div>
  );
}

// ================================================================
// SHARED SUB-COMPONENTS
// ================================================================

function WoStatusBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{count}</span>
      </div>
      <div className="w-full bg-muted rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function WorkOrderStatusCard({ stats, t, ArrowIcon }: any) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Factory className="w-5 h-5 text-primary" />
          {t("حالة أوامر العمل", "Work Order Status")}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="space-y-3">
          <WoStatusBar label={t("في الانتظار", "Pending")} count={stats?.woByStatus?.pending || 0} total={stats?.totalWorkOrders || 1} color="bg-gray-400" />
          <WoStatusBar label={t("قيد التصنيع", "In Production")} count={stats?.woByStatus?.in_production || 0} total={stats?.totalWorkOrders || 1} color="bg-blue-500" />
          <WoStatusBar label={t("فحص الجودة", "Quality Check")} count={stats?.woByStatus?.quality_check || 0} total={stats?.totalWorkOrders || 1} color="bg-yellow-500" />
          <WoStatusBar label={t("جاهز", "Ready")} count={stats?.woByStatus?.ready || 0} total={stats?.totalWorkOrders || 1} color="bg-green-500" />
          <WoStatusBar label={t("مكتمل", "Completed")} count={stats?.woByStatus?.completed || 0} total={stats?.totalWorkOrders || 1} color="bg-emerald-600" />
        </div>
        <Link href="/work-orders">
          <Button variant="ghost" size="sm" className="w-full mt-3" data-testid="link-view-work-orders">
            {t("عرض أوامر العمل", "View Work Orders")} <ArrowIcon className="w-4 h-4 ms-1" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function PaymentsByStageCard({ stats, t, ArrowIcon, stageLabels, methodLabels }: any) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-primary" />
          {t("المدفوعات حسب المرحلة", "Payments by Stage")}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="space-y-3">
          {Object.entries(stageLabels).map(([key, label]: any) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t(label.ar, label.en)}</span>
              <span className="font-semibold text-sm">
                {(stats?.paymentsByStage?.[key] || 0).toLocaleString()} {t("ر.س", "SAR")}
              </span>
            </div>
          ))}
          <div className="border-t pt-2 flex items-center justify-between">
            <span className="font-semibold text-sm">{t("الإجمالي", "Total")}</span>
            <span className="font-bold text-primary">
              {(stats?.totalRevenue || 0).toLocaleString()} {t("ر.س", "SAR")}
            </span>
          </div>
        </div>
        <Link href="/payments">
          <Button variant="ghost" size="sm" className="w-full mt-3" data-testid="link-view-payments">
            {t("عرض المدفوعات", "View Payments")} <ArrowIcon className="w-4 h-4 ms-1" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function InspectionScheduleSection({ inspections, t, lang }: { inspections: any[]; t: (ar: string, en: string) => string; lang: string }) {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndStr = `${weekEnd.getFullYear()}-${String(weekEnd.getMonth() + 1).padStart(2, "0")}-${String(weekEnd.getDate()).padStart(2, "0")}`;

  const upcoming = inspections.filter(i => i.inspectionDate >= todayStr);
  const todayInspections = upcoming.filter(i => i.inspectionDate === todayStr);
  const thisWeekInspections = upcoming.filter(i => i.inspectionDate <= weekEndStr);

  const ArrowIcon = lang === "ar" ? ArrowLeft : ArrowRight;

  return (
    <Card data-testid="card-inspection-schedule">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarCheck className="w-5 h-5 text-primary" />
          {t("جدول المعاينات", "Inspection Schedule")}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="text-center p-3 rounded-lg bg-primary/10">
            <p className="text-2xl font-bold" data-testid="text-inspections-today">{todayInspections.length}</p>
            <p className="text-xs text-muted-foreground">{t("معاينات اليوم", "Today's Inspections")}</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <p className="text-2xl font-bold" data-testid="text-inspections-week">{thisWeekInspections.length}</p>
            <p className="text-xs text-muted-foreground">{t("هذا الأسبوع", "This Week")}</p>
          </div>
        </div>
        {todayInspections.length > 0 && (
          <div className="mb-4">
            <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4 text-primary" />
              {t("معاينات اليوم", "Today's Inspections")}
            </p>
            <div className="space-y-2">
              {todayInspections.map((insp: any) => (
                <div key={insp.quotationId} className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/10" data-testid={`inspection-today-${insp.quotationId}`}>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{insp.customer?.fullName || "—"}</p>
                    <p className="text-xs text-muted-foreground truncate">{t(insp.assignedUser?.fullNameAr || "", insp.assignedUser?.fullNameEn || "")}</p>
                  </div>
                  <Badge variant="default" className="shrink-0">{t("اليوم", "Today")}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
        {upcoming.length > 0 ? (
          <div>
            <p className="text-sm font-semibold mb-2">{t("المعاينات القادمة", "Upcoming Inspections")}</p>
            <div className="space-y-2">
              {upcoming.filter(i => i.inspectionDate !== todayStr).slice(0, 5).map((insp: any) => (
                <div key={insp.quotationId} className="flex items-center justify-between gap-2 text-sm" data-testid={`inspection-upcoming-${insp.quotationId}`}>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{insp.customer?.fullName || "—"}</p>
                    <p className="text-xs text-muted-foreground truncate">{t(insp.assignedUser?.fullNameAr || "", insp.assignedUser?.fullNameEn || "")}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{insp.inspectionDate}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-2">{t("لا توجد معاينات قادمة", "No upcoming inspections")}</p>
        )}
        <Link href="/order-center">
          <Button variant="ghost" size="sm" className="w-full mt-3" data-testid="link-view-inspections">
            {t("عرض مركز الطلبات", "View Order Center")} <ArrowIcon className="w-4 h-4 ms-1" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function DesignApprovalSection({ designAssignments, t, lang }: { designAssignments: any[]; t: (ar: string, en: string) => string; lang: string }) {
  const recentDesigns = designAssignments
    .filter((da: any) => da.status === "completed" || da.customerApproval)
    .sort((a: any, b: any) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
    .slice(0, 6);

  if (recentDesigns.length === 0) return null;

  const approved = recentDesigns.filter((d: any) => d.customerApproval === "approved").length;
  const revisions = recentDesigns.filter((d: any) => d.customerApproval === "revision_requested").length;
  const pending = recentDesigns.filter((d: any) => d.status === "completed" && !d.customerApproval).length;

  return (
    <Card data-testid="card-design-approvals">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Palette className="w-5 h-5 text-primary" />
          {t("اعتمادات التصميم", "Design Approvals")}
          <div className="flex gap-1.5 ms-auto">
            {approved > 0 && (
              <Badge className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400 text-[10px]" data-testid="badge-designs-approved">
                <CheckCircle2 className="w-3 h-3 me-0.5" /> {approved}
              </Badge>
            )}
            {pending > 0 && (
              <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400 text-[10px]" data-testid="badge-designs-pending">
                <Clock className="w-3 h-3 me-0.5" /> {pending}
              </Badge>
            )}
            {revisions > 0 && (
              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 text-[10px]" data-testid="badge-designs-revisions">
                <MessageSquare className="w-3 h-3 me-0.5" /> {revisions}
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="space-y-2">
          {recentDesigns.map((da: any) => (
            <div key={da.id} className="flex items-center justify-between text-xs border rounded-lg px-3 py-2" data-testid={`design-approval-row-${da.id}`}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono font-bold text-muted-foreground">#{da.quotationId || da.id}</span>
                <span className="truncate">{da.customerName || lang === "ar" ? da.assignedUser?.fullNameAr : da.assignedUser?.fullNameEn}</span>
              </div>
              {da.customerApproval === "approved" ? (
                <Badge className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400 shrink-0">{t("معتمد", "Approved")}</Badge>
              ) : da.customerApproval === "revision_requested" ? (
                <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 shrink-0">{t("تعديل", "Revision")}</Badge>
              ) : (
                <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400 shrink-0">{t("بالانتظار", "Pending")}</Badge>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({ icon: Icon, color, bg, value, subValue, label, testId }: {
  icon: any; color: string; bg: string; value: string | number; subValue?: string; label: string; testId: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardContent className="p-3 md:p-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 shrink-0 rounded-lg ${bg} flex items-center justify-center ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-lg md:text-2xl font-bold truncate">
              {value} {subValue && <span className="text-xs font-normal text-muted-foreground">{subValue}</span>}
            </p>
            <p className="text-[11px] md:text-xs text-muted-foreground truncate">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniCard({ icon: Icon, value, label, color, testId }: {
  icon: any; value: string | number; label: string; color: string; testId: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardContent className="p-3 text-center">
        <Icon className={`w-5 h-5 mx-auto mb-1 ${color}`} />
        <p className="text-lg font-bold">{value}</p>
        <p className="text-[10px] md:text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function QuickLinkCard({ href, icon: Icon, color, iconColor, value, label, ArrowIcon, testId }: {
  href: string; icon: any; color: string; iconColor: string; value: string | number; label: string; ArrowIcon: any; testId: string;
}) {
  return (
    <Link href={href}>
      <Card className="cursor-pointer hover:shadow-md transition-shadow" data-testid={testId}>
        <CardContent className="p-4 flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center`}>
            <Icon className={`w-5 h-5 ${iconColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            {value !== "" && <p className="font-semibold">{value}</p>}
            <p className="text-xs text-muted-foreground truncate">{label}</p>
          </div>
          <ArrowIcon className="w-4 h-4 text-muted-foreground shrink-0" />
        </CardContent>
      </Card>
    </Link>
  );
}
