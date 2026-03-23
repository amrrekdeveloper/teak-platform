import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useRoute, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import type { WorkOrder, ProductionStage, Customer, Contract } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2, ArrowLeft, ArrowRight, Factory, Scissors, Layers,
  Wrench, Paintbrush, CheckCircle2, Clock, Pause, Play, AlertTriangle,
  PackageCheck, Truck, Hammer, Star, ChevronRight
} from "lucide-react";
import { DeliveryCountdown } from "@/components/delivery-countdown";

const statusConfig: Record<string, { ar: string; en: string; color: string }> = {
  pending:        { ar: "في الانتظار",   en: "Pending",            color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  in_production:  { ar: "قيد التصنيع",   en: "In Production",      color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  quality_check:  { ar: "فحص الجودة",    en: "Quality Check",      color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" },
  ready:          { ar: "جاهز للتوصيل", en: "Ready for Delivery",  color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  shipped:        { ar: "تم الشحن",      en: "Shipped",             color: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" },
  delivered:      { ar: "تم التسليم",    en: "Delivered",           color: "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300" },
  installed:      { ar: "تم التركيب",    en: "Installed",           color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300" },
  completed:      { ar: "مكتمل",         en: "Completed",           color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" },
};

const stageConfig: Record<string, { ar: string; en: string; icon: any; color: string }> = {
  cutting:  { ar: "القص",      en: "Cutting",  icon: Scissors,   color: "border-blue-400" },
  edging:   { ar: "الحواف",    en: "Edging",   icon: Layers,     color: "border-orange-400" },
  assembly: { ar: "التجميع",   en: "Assembly", icon: Wrench,     color: "border-purple-400" },
  finishing:{ ar: "التشطيب",   en: "Finishing",icon: Paintbrush, color: "border-green-400" },
};

const stageStatusConfig: Record<string, { ar: string; en: string; icon: any; color: string }> = {
  pending:     { ar: "في الانتظار", en: "Pending",     icon: Clock,         color: "text-gray-500" },
  in_progress: { ar: "قيد التنفيذ", en: "In Progress", icon: Play,          color: "text-blue-500" },
  completed:   { ar: "مكتمل",       en: "Completed",   icon: CheckCircle2,  color: "text-green-500" },
  on_hold:     { ar: "معلّق",       en: "On Hold",     icon: Pause,         color: "text-yellow-500" },
};

const LIFECYCLE_STEPS = [
  { status: "pending",       ar: "في الانتظار",   en: "Pending",           icon: Clock },
  { status: "in_production", ar: "قيد التصنيع",   en: "In Production",     icon: Factory },
  { status: "ready",         ar: "جاهز للتوصيل",  en: "Ready for Delivery",icon: PackageCheck },
  { status: "delivered",     ar: "تم التسليم",    en: "Delivered",          icon: Truck },
  { status: "installed",     ar: "تم التركيب",    en: "Installed",          icon: Hammer },
  { status: "completed",     ar: "مكتمل",         en: "Completed",          icon: Star },
];

const ADVANCE_ACTION: Record<string, { ar: string; en: string; allowedRoles: string[] }> = {
  pending:       { ar: "بدء التصنيع",         en: "Start Production",    allowedRoles: ["owner","assistant","production"] },
  in_production: { ar: "جاهز للتوصيل",        en: "Mark Ready",          allowedRoles: ["owner","assistant","production"] },
  ready:         { ar: "تم التسليم",           en: "Mark Delivered",      allowedRoles: ["owner","assistant","delivery"] },
  delivered:     { ar: "تم التركيب",           en: "Mark Installed",      allowedRoles: ["owner","assistant","installation"] },
  installed:     { ar: "اعتماد الإكمال",       en: "Confirm Completion",  allowedRoles: ["owner","assistant"] },
};

export default function WorkOrderDetailPage() {
  const { t, isRTL } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();
  const [, params] = useRoute("/work-orders/:id");
  const id = params?.id;
  const [stageDialog, setStageDialog] = useState<ProductionStage | null>(null);
  const [stageNotes, setStageNotes] = useState("");
  const [woStatusDialog, setWoStatusDialog] = useState(false);
  const [newWoStatus, setNewWoStatus] = useState("");

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  const { data: workOrder, isLoading } = useQuery<WorkOrder>({
    queryKey: ["/api/work-orders", id],
    enabled: !!id,
  });

  const { data: stages = [] } = useQuery<ProductionStage[]>({
    queryKey: ["/api/work-orders", id, "stages"],
    enabled: !!id,
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: contracts = [] } = useQuery<Contract[]>({
    queryKey: ["/api/contracts"],
  });

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  const { data: warranties = [] } = useQuery<any[]>({
    queryKey: ["/api/warranties"],
  });

  const updateStageMutation = useMutation({
    mutationFn: async ({ stageId, status, notes }: { stageId: number; status: string; notes?: string }) => {
      return apiRequest("PATCH", `/api/production-stages/${stageId}`, { status, notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders", id, "stages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      toast({ title: t("تم تحديث المرحلة", "Stage updated") });
      setStageDialog(null);
      setStageNotes("");
    },
    onError: () => {
      toast({ title: t("حدث خطأ", "Error"), variant: "destructive" });
    },
  });

  const updateWoStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      return apiRequest("PATCH", `/api/work-orders/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      toast({ title: t("تم تحديث حالة أمر العمل", "Work order status updated") });
      setWoStatusDialog(false);
    },
    onError: () => {
      toast({ title: t("حدث خطأ", "Error"), variant: "destructive" });
    },
  });

  const advanceStageMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/work-orders/${id}/advance-stage`, {});
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/warranties"] });
      toast({ title: data?.message || t("تم تحديث المرحلة", "Stage advanced") });
    },
    onError: (error: any) => {
      const msg = error?.message || t("حدث خطأ", "Error");
      toast({ title: msg, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!workOrder) {
    return <div className="text-center py-12 text-muted-foreground">{t("أمر العمل غير موجود", "Work order not found")}</div>;
  }

  const customer = customers.find(c => c.id === workOrder.customerId);
  const contract = contracts.find(c => c.id === workOrder.contractId);
  const status = statusConfig[workOrder.status] || statusConfig.pending;
  const completedStages = stages.filter(s => s.status === "completed").length;
  const progressPercent = stages.length > 0 ? Math.round((completedStages / stages.length) * 100) : 0;

  const getNextStageStatus = (currentStatus: string) => {
    const flow: Record<string, string> = {
      pending: "in_progress",
      in_progress: "completed",
      on_hold: "in_progress",
    };
    return flow[currentStatus];
  };

  const getUserName = (userId: number | null) => {
    if (!userId) return "";
    const u = users.find((u: any) => u.id === userId);
    return u ? (t(u.fullNameAr, u.fullNameEn) || u.username) : "";
  };

  const currentLifecycleIdx = LIFECYCLE_STEPS.findIndex(s => s.status === workOrder.status);
  const advanceAction = ADVANCE_ACTION[workOrder.status];
  const userRole = user?.role || "";
  const canAdvance = advanceAction && advanceAction.allowedRoles.includes(userRole);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/work-orders">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <BackIcon className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold" data-testid="text-wo-title">
              {t("أمر عمل", "Work Order")} #{workOrder.orderNumber}
            </h1>
            <Badge className={status.color}>{t(status.ar, status.en)}</Badge>
            {workOrder.priority === "urgent" && (
              <Badge className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
                <AlertTriangle className="w-3 h-3 me-1" />
                {t("عاجل", "Urgent")}
              </Badge>
            )}
          </div>
        </div>
        <Button variant="outline" onClick={() => { setNewWoStatus(workOrder.status); setWoStatusDialog(true); }} data-testid="button-change-status">
          {t("تغيير الحالة", "Change Status")}
        </Button>
      </div>

      {/* Lifecycle Stepper */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex items-center justify-between overflow-x-auto pb-1 gap-0" data-testid="lifecycle-stepper">
            {LIFECYCLE_STEPS.map((step, idx) => {
              const StepIcon = step.icon;
              const isDone = idx < currentLifecycleIdx;
              const isCurrent = idx === currentLifecycleIdx;
              const isLast = idx === LIFECYCLE_STEPS.length - 1;
              return (
                <div key={step.status} className="flex items-center shrink-0">
                  <div className="flex flex-col items-center gap-1 min-w-[60px]">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-colors ${
                      isDone ? "bg-primary border-primary text-white"
                      : isCurrent ? "bg-primary/10 border-primary text-primary"
                      : "bg-muted border-muted-foreground/30 text-muted-foreground"
                    }`} data-testid={`stepper-step-${step.status}`}>
                      {isDone ? <CheckCircle2 className="w-4 h-4" /> : <StepIcon className="w-4 h-4" />}
                    </div>
                    <span className={`text-[10px] text-center leading-tight ${isCurrent ? "font-semibold text-primary" : isDone ? "text-primary/70" : "text-muted-foreground"}`}>
                      {t(step.ar, step.en)}
                    </span>
                  </div>
                  {!isLast && (
                    <div className={`h-0.5 w-6 mx-0.5 shrink-0 ${idx < currentLifecycleIdx ? "bg-primary" : "bg-muted-foreground/20"}`} />
                  )}
                </div>
              );
            })}
          </div>

          {canAdvance && workOrder.status !== "completed" && (
            <div className="mt-4 flex justify-end">
              <Button
                className="gap-2"
                onClick={() => advanceStageMutation.mutate()}
                disabled={advanceStageMutation.isPending}
                data-testid="button-advance-lifecycle"
              >
                {advanceStageMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <ChevronRight className="w-4 h-4" />
                }
                {t(advanceAction.ar, advanceAction.en)}
              </Button>
            </div>
          )}

          {workOrder.status === "completed" && (() => {
            const wo_warranty = warranties.find((w: any) => w.workOrderId === workOrder.id);
            if (wo_warranty) {
              const endDate = wo_warranty.endDate ? new Date(wo_warranty.endDate) : null;
              const now = new Date();
              const isExpired = endDate && endDate < now;
              const daysLeft = endDate ? Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
              const startDate = wo_warranty.startDate ? new Date(wo_warranty.startDate) : null;
              const totalDays = startDate && endDate ? Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) : null;
              const consumed = totalDays && daysLeft !== null && !isExpired ? Math.round(((totalDays - Math.max(0, daysLeft)) / totalDays) * 100) : 100;
              return (
                <div className="mt-4 p-3 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/10" data-testid="warranty-badge">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-semibold text-sm">
                      <Star className="w-4 h-4 fill-current" />
                      {t("شهادة ضمان نشطة", "Active Warranty Certificate")} #{wo_warranty.id}
                    </div>
                    {!isExpired && daysLeft !== null && (
                      <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400" data-testid="text-warranty-days">
                        {daysLeft} {t("يوم متبقٍّ", "days left")}
                      </span>
                    )}
                    {isExpired && <span className="text-xs text-red-500">{t("منتهي الصلاحية", "Expired")}</span>}
                  </div>
                  {totalDays && (
                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isExpired ? "bg-red-400" : consumed < 50 ? "bg-emerald-500" : consumed < 80 ? "bg-yellow-500" : "bg-red-400"}`}
                        style={{ width: `${consumed}%` }}
                        data-testid="bar-warranty-progress"
                      />
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-1.5 text-[10px] text-muted-foreground">
                    <span>{wo_warranty.startDate ? new Date(wo_warranty.startDate).toLocaleDateString("ar-SA") : "-"}</span>
                    <span>{wo_warranty.endDate ? new Date(wo_warranty.endDate).toLocaleDateString("ar-SA") : "-"}</span>
                  </div>
                </div>
              );
            }
            return (
              <div className="mt-4 flex items-center justify-center gap-2 text-emerald-600 font-semibold text-sm">
                <Star className="w-4 h-4 fill-current" />
                {t("الطلب مكتمل — تم إنشاء شهادة الضمان", "Order completed — warranty certificate issued")}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">{t("العميل", "Customer")}</p>
            <p className="font-semibold" data-testid="text-wo-customer">{customer?.fullName || "-"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">{t("العقد", "Contract")}</p>
            <p className="font-semibold">{contract?.contractNumber || "-"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">{t("تاريخ التسليم", "Due Date")}</p>
            <p className="font-semibold">{workOrder.dueDate ? new Date(workOrder.dueDate).toLocaleDateString("ar-SA") : t("غير محدد", "Not set")}</p>
          </CardContent>
        </Card>
      </div>

      {(workOrder as any).productionStartDate && (workOrder as any).deliveryDays && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <DeliveryCountdown
              deliveryDays={(workOrder as any).deliveryDays}
              productionStartDate={(workOrder as any).productionStartDate}
            />
          </CardContent>
        </Card>
      )}

      {workOrder.notes && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">{t("ملاحظات", "Notes")}</p>
            <p className="text-sm">{workOrder.notes}</p>
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Factory className="w-5 h-5" />
            {t("تقدم الإنتاج", "Production Progress")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-sm font-bold text-primary" data-testid="text-progress">{progressPercent}%</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {stages.map((stage, idx) => {
              const config = stageConfig[stage.stage] || stageConfig.cutting;
              const stageStatus = stageStatusConfig[stage.status] || stageStatusConfig.pending;
              const StageIcon = config.icon;
              const StatusIcon = stageStatus.icon;
              const nextStatus = getNextStageStatus(stage.status);

              return (
                <Card
                  key={stage.id}
                  className={`border-t-4 ${config.color} cursor-pointer hover:shadow-md transition-shadow`}
                  onClick={() => { setStageDialog(stage); setStageNotes(stage.notes || ""); }}
                  data-testid={`card-stage-${stage.stage}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <StageIcon className="w-5 h-5 text-muted-foreground" />
                        <span className="font-semibold text-sm">{t(config.ar, config.en)}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{idx + 1}/4</span>
                    </div>

                    <div className="flex items-center gap-1.5 mb-2">
                      <StatusIcon className={`w-4 h-4 ${stageStatus.color}`} />
                      <span className={`text-xs font-medium ${stageStatus.color}`}>
                        {t(stageStatus.ar, stageStatus.en)}
                      </span>
                    </div>

                    {stage.startedAt && (
                      <p className="text-xs text-muted-foreground">
                        {t("بدأ: ", "Started: ")}{new Date(stage.startedAt).toLocaleDateString("ar-SA")}
                      </p>
                    )}
                    {stage.completedAt && (
                      <p className="text-xs text-muted-foreground">
                        {t("اكتمل: ", "Completed: ")}{new Date(stage.completedAt).toLocaleDateString("ar-SA")}
                      </p>
                    )}

                    {nextStatus && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full mt-3"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateStageMutation.mutate({ stageId: stage.id, status: nextStatus });
                        }}
                        disabled={updateStageMutation.isPending}
                        data-testid={`button-advance-${stage.stage}`}
                      >
                        {nextStatus === "in_progress" ? t("ابدأ", "Start") : t("أكمل", "Complete")}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!stageDialog} onOpenChange={(open) => { if (!open) setStageDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {stageDialog && t(stageConfig[stageDialog.stage]?.ar || "", stageConfig[stageDialog.stage]?.en || "")}
            </DialogTitle>
          </DialogHeader>
          {stageDialog && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("الحالة", "Status")}</Label>
                <Select
                  value={stageDialog.status}
                  onValueChange={(v) => {
                    updateStageMutation.mutate({ stageId: stageDialog.id, status: v, notes: stageNotes || undefined });
                  }}
                >
                  <SelectTrigger data-testid="select-stage-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">{t("في الانتظار", "Pending")}</SelectItem>
                    <SelectItem value="in_progress">{t("قيد التنفيذ", "In Progress")}</SelectItem>
                    <SelectItem value="completed">{t("مكتمل", "Completed")}</SelectItem>
                    <SelectItem value="on_hold">{t("معلّق", "On Hold")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("ملاحظات", "Notes")}</Label>
                <Textarea
                  value={stageNotes}
                  onChange={e => setStageNotes(e.target.value)}
                  placeholder={t("أضف ملاحظات...", "Add notes...")}
                  data-testid="input-stage-notes"
                />
              </div>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => {
                  updateStageMutation.mutate({
                    stageId: stageDialog.id,
                    status: stageDialog.status,
                    notes: stageNotes || undefined,
                  });
                }}
                disabled={updateStageMutation.isPending}
                data-testid="button-save-stage-notes"
              >
                {updateStageMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("حفظ الملاحظات", "Save Notes")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={woStatusDialog} onOpenChange={setWoStatusDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("تغيير حالة أمر العمل", "Change Work Order Status")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={newWoStatus} onValueChange={setNewWoStatus}>
              <SelectTrigger data-testid="select-wo-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(statusConfig).map(([key, val]) => (
                  <SelectItem key={key} value={key}>{t(val.ar, val.en)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="w-full"
              onClick={() => updateWoStatusMutation.mutate(newWoStatus)}
              disabled={updateWoStatusMutation.isPending}
              data-testid="button-confirm-status"
            >
              {updateWoStatusMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("تحديث", "Update")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
