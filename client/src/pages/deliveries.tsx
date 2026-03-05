import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Delivery, WorkOrder } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Truck, Clock, CheckCircle2, XCircle, Navigation } from "lucide-react";

const statusConfig: Record<string, { ar: string; en: string; color: string }> = {
  scheduled: { ar: "مجدول", en: "Scheduled", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  in_transit: { ar: "في الطريق", en: "In Transit", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" },
  delivered: { ar: "تم التوصيل", en: "Delivered", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  failed: { ar: "فشل التوصيل", en: "Failed", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
};

export default function DeliveriesPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [filter, setFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<Delivery | null>(null);
  const [form, setForm] = useState({ workOrderId: "", scheduledDate: "", notes: "" });

  const { data: deliveries = [], isLoading } = useQuery<Delivery[]>({ queryKey: ["/api/deliveries"] });
  const { data: workOrders = [] } = useQuery<WorkOrder[]>({ queryKey: ["/api/work-orders"] });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/deliveries", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deliveries"] });
      setCreateOpen(false);
      setForm({ workOrderId: "", scheduledDate: "", notes: "" });
      toast({ title: t("تمت جدولة التوصيل", "Delivery scheduled") });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/deliveries/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deliveries"] });
      setDetailItem(null);
      toast({ title: t("تم تحديث التوصيل", "Delivery updated") });
    },
  });

  const filtered = filter === "all" ? deliveries : deliveries.filter(d => d.status === filter);

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-deliveries-title">{t("التوصيل", "Deliveries")}</h1>
          <p className="text-muted-foreground text-sm">{t("إدارة عمليات التوصيل", "Manage delivery operations")}</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-delivery"><Plus className="w-4 h-4 me-2" />{t("جدولة توصيل", "Schedule Delivery")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("جدولة توصيل جديد", "Schedule New Delivery")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>{t("أمر العمل", "Work Order")} *</Label>
                <Select value={form.workOrderId} onValueChange={v => setForm({ ...form, workOrderId: v })}>
                  <SelectTrigger data-testid="select-delivery-wo"><SelectValue placeholder={t("اختر أمر العمل", "Select work order")} /></SelectTrigger>
                  <SelectContent>
                    {workOrders.filter(wo => wo.status === "ready" || wo.status === "quality_check").map(wo => (
                      <SelectItem key={wo.id} value={wo.id.toString()}>#{wo.orderNumber}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t("تاريخ التوصيل", "Delivery Date")} *</Label>
                <Input type="date" value={form.scheduledDate} onChange={e => setForm({ ...form, scheduledDate: e.target.value })} data-testid="input-delivery-date" />
              </div>
              <div className="space-y-1">
                <Label>{t("ملاحظات", "Notes")}</Label>
                <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} data-testid="input-delivery-notes" />
              </div>
              <Button className="w-full" onClick={() => createMutation.mutate({ workOrderId: parseInt(form.workOrderId), scheduledDate: form.scheduledDate, notes: form.notes })} disabled={!form.workOrderId || !form.scheduledDate || createMutation.isPending} data-testid="button-create-delivery">
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("جدولة", "Schedule")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 flex-nowrap">
        {[{ key: "all", ar: "الكل", en: "All" }, ...Object.entries(statusConfig).map(([k, v]) => ({ key: k, ar: v.ar, en: v.en }))].map(tab => (
          <Button key={tab.key} size="sm" variant={filter === tab.key ? "default" : "outline"} onClick={() => setFilter(tab.key)} data-testid={`button-filter-${tab.key}`}>{t(tab.ar, tab.en)}</Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t("لا توجد عمليات توصيل", "No deliveries found")}</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(d => {
            const status = statusConfig[d.status] || statusConfig.scheduled;
            return (
              <Card key={d.id} className="cursor-pointer" onClick={() => setDetailItem(d)} data-testid={`card-delivery-${d.id}`}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><Truck className="w-5 h-5 text-primary" /></div>
                    <div>
                      <h3 className="font-semibold">{t("أمر عمل", "WO")} #{d.workOrderId}</h3>
                      <p className="text-xs text-muted-foreground">{d.scheduledDate && `${t("مجدول", "Scheduled")}: ${d.scheduledDate}`}</p>
                    </div>
                  </div>
                  <Badge className={status.color}>{t(status.ar, status.en)}</Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!detailItem} onOpenChange={o => { if (!o) setDetailItem(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("تفاصيل التوصيل", "Delivery Details")}</DialogTitle></DialogHeader>
          {detailItem && (
            <div className="space-y-4">
              <div className="flex justify-between"><span className="text-muted-foreground">{t("أمر العمل", "Work Order")}</span><span>#{detailItem.workOrderId}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("التاريخ المجدول", "Scheduled")}</span><span>{detailItem.scheduledDate || "-"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("الحالة", "Status")}</span><Badge className={statusConfig[detailItem.status]?.color}>{t(statusConfig[detailItem.status]?.ar, statusConfig[detailItem.status]?.en)}</Badge></div>
              {detailItem.notes && <div><span className="text-muted-foreground text-sm">{t("ملاحظات", "Notes")}:</span><p className="text-sm mt-1">{detailItem.notes}</p></div>}
              <div className="flex gap-2">
                {detailItem.status === "scheduled" && (
                  <Button className="flex-1" onClick={() => updateMutation.mutate({ id: detailItem.id, data: { status: "in_transit" } })} disabled={updateMutation.isPending} data-testid="button-start-transit">
                    <Navigation className="w-4 h-4 me-1" />{t("بدء التوصيل", "Start Transit")}
                  </Button>
                )}
                {detailItem.status === "in_transit" && (
                  <>
                    <Button className="flex-1" onClick={() => updateMutation.mutate({ id: detailItem.id, data: { status: "delivered", deliveredDate: new Date().toISOString().split("T")[0] } })} disabled={updateMutation.isPending} data-testid="button-mark-delivered">
                      <CheckCircle2 className="w-4 h-4 me-1" />{t("تم التوصيل", "Delivered")}
                    </Button>
                    <Button variant="destructive" className="flex-1" onClick={() => updateMutation.mutate({ id: detailItem.id, data: { status: "failed" } })} disabled={updateMutation.isPending} data-testid="button-mark-failed">
                      <XCircle className="w-4 h-4 me-1" />{t("فشل", "Failed")}
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
