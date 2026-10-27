import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import type { WorkOrder, Contract, Customer } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Factory, AlertTriangle, Calendar, User } from "lucide-react";

const statusConfig: Record<string, { ar: string; en: string; color: string }> = {
  pending: { ar: "في الانتظار", en: "Pending", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  in_production: { ar: "قيد التصنيع", en: "In Production", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  quality_check: { ar: "فحص الجودة", en: "Quality Check", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" },
  ready: { ar: "جاهز", en: "Ready", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  shipped: { ar: "تم الشحن", en: "Shipped", color: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" },
  delivered: { ar: "تم التوصيل", en: "Delivered", color: "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300" },
  installed: { ar: "تم التركيب", en: "Installed", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300" },
  completed: { ar: "مكتمل", en: "Completed", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" },
};

const priorityConfig: Record<string, { ar: string; en: string; color: string }> = {
  normal: { ar: "عادي", en: "Normal", color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  urgent: { ar: "عاجل", en: "Urgent", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
};

export default function WorkOrdersPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const [createDialog, setCreateDialog] = useState(false);
  const [newOrder, setNewOrder] = useState({ contractId: "", priority: "normal", notes: "", dueDate: "" });

  const { data: workOrders = [], isLoading } = useQuery<WorkOrder[]>({
    queryKey: ["/api/work-orders"],
  });

  const { data: contracts = [] } = useQuery<Contract[]>({
    queryKey: ["/api/contracts"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const contract = contracts.find(c => c.id === parseInt(data.contractId));
      return apiRequest("POST", "/api/work-orders", {
        contractId: parseInt(data.contractId),
        customerId: contract?.customerId,
        priority: data.priority,
        notes: data.notes || undefined,
        dueDate: data.dueDate || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      toast({ title: t("تم إنشاء أمر العمل بنجاح", "Work order created successfully") });
      setCreateDialog(false);
      setNewOrder({ contractId: "", priority: "normal", notes: "", dueDate: "" });
    },
    onError: () => {
      toast({ title: t("حدث خطأ", "Error occurred"), variant: "destructive" });
    },
  });

  const getCustomerName = (customerId: number | null) => {
    if (!customerId) return "";
    return customers.find(c => c.id === customerId)?.fullName || "";
  };

  const getContractNumber = (contractId: number | null) => {
    return contracts.find(c => c.id === contractId)?.contractNumber || "";
  };

  const filtered = statusFilter === "all" ? workOrders : workOrders.filter(wo => wo.status === statusFilter);

  const activeContracts = contracts.filter(c => c.status === "active");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-work-orders-title">
            <Factory className="w-6 h-6" />
            {t("أوامر العمل", "Work Orders")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t(`${workOrders.length} أمر عمل`, `${workOrders.length} work orders`)}
          </p>
        </div>
        <Dialog open={createDialog} onOpenChange={setCreateDialog}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-work-order">
              <Plus className="w-4 h-4 me-2" />
              {t("أمر عمل جديد", "New Work Order")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("إنشاء أمر عمل جديد", "Create New Work Order")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("العقد", "Contract")}</Label>
                <Select value={newOrder.contractId} onValueChange={v => setNewOrder(prev => ({ ...prev, contractId: v }))}>
                  <SelectTrigger data-testid="select-contract">
                    <SelectValue placeholder={t("اختر العقد", "Select contract")} />
                  </SelectTrigger>
                  <SelectContent>
                    {activeContracts.map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.contractNumber} — {getCustomerName(c.customerId)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("الأولوية", "Priority")}</Label>
                <Select value={newOrder.priority} onValueChange={v => setNewOrder(prev => ({ ...prev, priority: v }))}>
                  <SelectTrigger data-testid="select-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">{t("عادي", "Normal")}</SelectItem>
                    <SelectItem value="urgent">{t("عاجل", "Urgent")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("تاريخ التسليم المتوقع", "Expected Due Date")}</Label>
                <Input
                  type="date"
                  value={newOrder.dueDate}
                  onChange={e => setNewOrder(prev => ({ ...prev, dueDate: e.target.value }))}
                  data-testid="input-due-date"
                />
              </div>
              <div className="space-y-2">
                <Label>{t("ملاحظات", "Notes")}</Label>
                <Textarea
                  value={newOrder.notes}
                  onChange={e => setNewOrder(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder={t("ملاحظات إضافية...", "Additional notes...")}
                  data-testid="input-notes"
                />
              </div>
              <Button
                className="w-full"
                disabled={!newOrder.contractId || createMutation.isPending}
                onClick={() => createMutation.mutate(newOrder)}
                data-testid="button-submit-work-order"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("إنشاء", "Create")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-2 flex-nowrap">
        {[
          { value: "all", ar: "الكل", en: "All" },
          { value: "pending", ar: "في الانتظار", en: "Pending" },
          { value: "in_production", ar: "قيد التصنيع", en: "In Production" },
          { value: "quality_check", ar: "فحص الجودة", en: "Quality Check" },
          { value: "ready", ar: "جاهز", en: "Ready" },
          { value: "completed", ar: "مكتمل", en: "Completed" },
        ].map(tab => (
          <Button
            key={tab.value}
            variant={statusFilter === tab.value ? "default" : "outline"}
            size="sm"
            className="shrink-0 whitespace-nowrap"
            onClick={() => setStatusFilter(tab.value)}
            data-testid={`filter-${tab.value}`}
          >
            {t(tab.ar, tab.en)}
            {tab.value !== "all" && (
              <Badge variant="secondary" className="ms-1.5 text-xs">
                {workOrders.filter(wo => wo.status === tab.value).length}
              </Badge>
            )}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Factory className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{t("لا توجد أوامر عمل", "No work orders")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(wo => {
            const status = statusConfig[wo.status] || statusConfig.pending;
            const priority = priorityConfig[wo.priority] || priorityConfig.normal;
            return (
              <Link key={wo.id} href={`/work-orders/${wo.id}`}>
                <Card className="cursor-pointer hover:border-primary/30 transition-colors h-full" data-testid={`card-work-order-${wo.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Factory className="w-4 h-4 text-primary" />
                        <span className="font-bold text-sm" data-testid={`text-order-number-${wo.id}`}>
                          #{wo.orderNumber}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {wo.priority === "urgent" && (
                          <Badge className={priority.color}>
                            <AlertTriangle className="w-3 h-3 me-1" />
                            {t(priority.ar, priority.en)}
                          </Badge>
                        )}
                        <Badge className={status.color}>
                          {t(status.ar, status.en)}
                        </Badge>
                      </div>
                    </div>
                    <div className="space-y-1.5 text-sm">
                      <p className="font-medium">{getCustomerName(wo.customerId)}</p>
                      <p className="text-muted-foreground text-xs">
                        {t("العقد: ", "Contract: ")}{getContractNumber(wo.contractId)}
                      </p>
                      {wo.dueDate && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          <span>{new Date(wo.dueDate).toLocaleDateString("ar-SA")}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
