import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import type { WorkOrder, Customer } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeliveryCountdown } from "@/components/delivery-countdown";
import {
  Loader2, Factory, AlertTriangle, CheckCircle2, Clock, Play,
  Package, TrendingUp, PackageCheck
} from "lucide-react";

const statusGroups = [
  {
    key: "pending",
    ar: "في الانتظار",
    en: "Pending",
    color: "border-gray-400",
    bgColor: "bg-gray-50 dark:bg-gray-900/30",
    icon: Clock,
  },
  {
    key: "in_production",
    ar: "قيد التصنيع",
    en: "In Production",
    color: "border-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-900/20",
    icon: Play,
  },
  {
    key: "quality_check",
    ar: "فحص الجودة",
    en: "Quality Check",
    color: "border-yellow-400",
    bgColor: "bg-yellow-50 dark:bg-yellow-900/20",
    icon: CheckCircle2,
  },
  {
    key: "ready",
    ar: "جاهز للتسليم",
    en: "Ready",
    color: "border-green-400",
    bgColor: "bg-green-50 dark:bg-green-900/20",
    icon: Package,
  },
];

export default function ProductionPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: workOrders = [], isLoading } = useQuery<WorkOrder[]>({
    queryKey: ["/api/work-orders"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const advanceStageMutation = useMutation({
    mutationFn: (woId: number) => apiRequest("PATCH", `/api/work-orders/${woId}/advance-stage`, {}),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      toast({ title: data?.message || t("تم تحديث مرحلة الطلب", "Stage advanced") });
    },
    onError: (err: any) => {
      toast({ title: err?.message || t("حدث خطأ", "Error"), variant: "destructive" });
    },
  });

  const canAdvanceProduction = user && ["owner", "assistant", "production"].includes(user.role);

  const getCustomerName = (customerId: number | null) => {
    if (!customerId) return "";
    return customers.find(c => c.id === customerId)?.fullName || "";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalOrders = workOrders.length;
  const inProduction = workOrders.filter(w => w.status === "in_production").length;
  const completedToday = workOrders.filter(w =>
    w.status === "completed" && w.completedDate &&
    new Date(w.completedDate).toDateString() === new Date().toDateString()
  ).length;
  const urgentOrders = workOrders.filter(w => w.priority === "urgent" && !["completed", "delivered", "installed"].includes(w.status)).length;

  const activeStatuses = ["pending", "in_production", "quality_check", "ready"];
  const activeOrders = workOrders.filter(wo => activeStatuses.includes(wo.status));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-production-title">
          <Factory className="w-6 h-6" />
          {t("لوحة الإنتاج", "Production Board")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("نظرة عامة على حالة التصنيع", "Manufacturing status overview")}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp className="w-6 h-6 mx-auto mb-1 text-primary" />
            <p className="text-2xl font-bold" data-testid="stat-total">{totalOrders}</p>
            <p className="text-xs text-muted-foreground">{t("إجمالي الأوامر", "Total Orders")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Play className="w-6 h-6 mx-auto mb-1 text-blue-500" />
            <p className="text-2xl font-bold" data-testid="stat-in-production">{inProduction}</p>
            <p className="text-xs text-muted-foreground">{t("قيد التصنيع", "In Production")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle2 className="w-6 h-6 mx-auto mb-1 text-green-500" />
            <p className="text-2xl font-bold" data-testid="stat-completed">{completedToday}</p>
            <p className="text-xs text-muted-foreground">{t("مكتمل اليوم", "Completed Today")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <AlertTriangle className="w-6 h-6 mx-auto mb-1 text-red-500" />
            <p className="text-2xl font-bold" data-testid="stat-urgent">{urgentOrders}</p>
            <p className="text-xs text-muted-foreground">{t("عاجل", "Urgent")}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statusGroups.map(group => {
          const GroupIcon = group.icon;
          const groupOrders = activeOrders.filter(wo => wo.status === group.key);
          return (
            <div key={group.key} className={`rounded-xl border-t-4 ${group.color} ${group.bgColor} p-3`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <GroupIcon className="w-4 h-4" />
                  <h3 className="font-semibold text-sm">{t(group.ar, group.en)}</h3>
                </div>
                <Badge variant="secondary" className="text-xs">{groupOrders.length}</Badge>
              </div>
              <div className="space-y-2">
                {groupOrders.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    {t("لا توجد أوامر", "No orders")}
                  </p>
                ) : (
                  groupOrders.map(wo => (
                    <Card key={wo.id} className="cursor-pointer hover:shadow-sm transition-shadow" data-testid={`board-card-${wo.id}`}>
                      <CardContent className="p-3">
                        <Link href={`/work-orders/${wo.id}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold">#{wo.orderNumber}</span>
                            {wo.priority === "urgent" && (
                              <AlertTriangle className="w-3 h-3 text-red-500" />
                            )}
                          </div>
                          <p className="text-xs font-medium truncate">{getCustomerName(wo.customerId)}</p>
                          {(wo as any).productionStartDate && (wo as any).deliveryDays ? (
                            <div className="mt-1">
                              <DeliveryCountdown
                                deliveryDays={(wo as any).deliveryDays}
                                productionStartDate={(wo as any).productionStartDate}
                                compact
                              />
                            </div>
                          ) : wo.dueDate ? (
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {new Date(wo.dueDate).toLocaleDateString("ar-SA")}
                            </p>
                          ) : null}
                        </Link>
                        {canAdvanceProduction && wo.status === "in_production" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full mt-2 h-7 text-xs text-green-700 border-green-300 hover:bg-green-50"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              advanceStageMutation.mutate(wo.id);
                            }}
                            disabled={advanceStageMutation.isPending}
                            data-testid={`button-ready-${wo.id}`}
                          >
                            {advanceStageMutation.isPending
                              ? <Loader2 className="w-3 h-3 animate-spin me-1" />
                              : <PackageCheck className="w-3 h-3 me-1" />
                            }
                            {t("جاهز للتوصيل", "Ready for Delivery")}
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
