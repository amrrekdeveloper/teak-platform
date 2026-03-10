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
  Shield, UserCheck, TrendingUp, DollarSign, Clock,
  CheckCircle2, ArrowLeft, ArrowRight, ClipboardList, Sparkles
} from "lucide-react";
import teakLogo from "@assets/TEAK-LOGO_(1)_(1)_1772710617816.png";

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

export default function DashboardPage() {
  const { t, lang } = useLanguage();
  const { user } = useAuth();

  const { data: stats, isLoading } = useQuery<any>({
    queryKey: ["/api/dashboard/stats"],
  });

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

  const ArrowIcon = lang === "ar" ? ArrowLeft : ArrowRight;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-dashboard-title">
          {t(`مرحباً ${user?.fullNameAr || ""}`, `Welcome ${user?.fullNameEn || ""}`)}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t("نظرة عامة على أداء المصنع", "Factory performance overview")}
        </p>
      </div>

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
        <StatCard icon={DollarSign} color="text-primary" bg="bg-primary/10" value={`${(stats?.totalRevenue || 0).toLocaleString()}`} subValue={t("ر.س", "SAR")} label={t("إجمالي الإيرادات", "Total Revenue")} testId="stat-revenue" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary" />
              {t("المدفوعات حسب المرحلة", "Payments by Stage")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="space-y-3">
              {Object.entries(stageLabels).map(([key, label]) => (
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
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MiniCard icon={Factory} value={stats?.inProductionOrders || 0} label={t("قيد التصنيع", "In Production")} color="text-blue-500" testId="mini-production" />
        <MiniCard icon={AlertTriangle} value={stats?.lowStockItems || 0} label={t("مخزون منخفض", "Low Stock")} color="text-orange-500" testId="mini-lowstock" />
        <MiniCard icon={Truck} value={stats?.pendingDeliveries || 0} label={t("توصيلات معلقة", "Pending Deliveries")} color="text-purple-500" testId="mini-deliveries" />
        <MiniCard icon={Wrench} value={stats?.pendingMaintenance || 0} label={t("صيانة معلقة", "Pending Maintenance")} color="text-red-500" testId="mini-maintenance" />
        <MiniCard icon={Shield} value={`${stats?.qualityPassRate || 0}%`} label={t("نسبة النجاح", "Pass Rate")} color="text-green-600" testId="mini-quality" />
      </div>

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
        <Link href="/quotations">
          <Card className="cursor-pointer transition-shadow" data-testid="card-pending-quotes">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-amber-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold">{stats?.pendingQuotations || 0}</p>
                <p className="text-xs text-muted-foreground truncate">{t("عروض أسعار معلقة", "Pending Quotations")}</p>
              </div>
              <ArrowIcon className="w-4 h-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/inventory">
          <Card className="cursor-pointer transition-shadow" data-testid="card-inventory-alert">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <Package className="w-5 h-5 text-orange-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold">{stats?.totalInventoryItems || 0}</p>
                <p className="text-xs text-muted-foreground truncate">{t("مواد في المخزون", "Inventory Items")}</p>
              </div>
              <ArrowIcon className="w-4 h-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/production">
          <Card className="cursor-pointer transition-shadow" data-testid="card-production-overview">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold">{stats?.totalWorkOrders || 0}</p>
                <p className="text-xs text-muted-foreground truncate">{t("إجمالي أوامر العمل", "Total Work Orders")}</p>
              </div>
              <ArrowIcon className="w-4 h-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
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

function WoStatusBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold">{count}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
