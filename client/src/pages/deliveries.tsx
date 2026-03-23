import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type { Delivery, WorkOrder, Customer } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Truck, CheckCircle2, XCircle, Navigation, PackageCheck, Camera, Calendar, Image, AlertCircle } from "lucide-react";

type DeliveryWithPhotos = Delivery & { deliveryPhotos: string[] | null };

const statusConfig: Record<string, { ar: string; en: string; color: string }> = {
  scheduled: { ar: "مجدول", en: "Scheduled", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  in_transit: { ar: "في الطريق", en: "In Transit", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" },
  delivered: { ar: "تم التوصيل", en: "Delivered", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  failed: { ar: "فشل التوصيل", en: "Failed", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
};

export default function DeliveriesPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();
  const [filter, setFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<DeliveryWithPhotos | null>(null);
  const [form, setForm] = useState({ workOrderId: "", scheduledDate: "", notes: "" });
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const { data: deliveries = [], isLoading } = useQuery<DeliveryWithPhotos[]>({ queryKey: ["/api/deliveries"] });
  const { data: workOrders = [] } = useQuery<WorkOrder[]>({ queryKey: ["/api/work-orders"] });
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });

  const scheduledWorkOrderIds = new Set(deliveries.map(d => d.workOrderId));

  const readyWorkOrders = workOrders.filter(
    wo => wo.status === "ready" && !scheduledWorkOrderIds.has(wo.id)
  );

  const getCustomer = (customerId: number | null) => {
    if (!customerId) return null;
    return customers.find(c => c.id === customerId) || null;
  };

  const getWorkOrder = (workOrderId: number) => workOrders.find(w => w.id === workOrderId);

  const createMutation = useMutation({
    mutationFn: async (data: { workOrderId: number; scheduledDate: string; notes: string }) => {
      const res = await apiRequest("POST", "/api/deliveries", data);
      return res.json() as Promise<DeliveryWithPhotos>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deliveries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      setCreateOpen(false);
      setForm({ workOrderId: "", scheduledDate: "", notes: "" });
      toast({ title: t("تمت جدولة التوصيل", "Delivery scheduled") });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<DeliveryWithPhotos> }) => {
      const res = await apiRequest("PATCH", `/api/deliveries/${id}`, data);
      return res.json() as Promise<DeliveryWithPhotos>;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["/api/deliveries"] });
      setDetailItem(updated);
      toast({ title: t("تم تحديث التوصيل", "Delivery updated") });
    },
  });

  const advanceStageMutation = useMutation({
    mutationFn: async (woId: number) => {
      const res = await apiRequest("PATCH", `/api/work-orders/${woId}/advance-stage`, {});
      return res.json() as Promise<{ message?: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-orders"] });
      toast({ title: data?.message || t("تم تحديث مرحلة الطلب", "Stage advanced") });
    },
    onError: (err: Error) => {
      toast({ title: err?.message || t("حدث خطأ", "Error"), variant: "destructive" });
    },
  });

  const canAdvance = user && ["owner", "assistant", "delivery"].includes(user.role);

  const filtered = filter === "all" ? deliveries : deliveries.filter(d => d.status === filter);

  const handlePhotoUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !detailItem) return;
    setUploadingPhotos(true);
    try {
      const formData = new FormData();
      Array.from(files).forEach(f => formData.append("photos", f));
      const res = await fetch(`/api/deliveries/${detailItem.id}/photos`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const updated: DeliveryWithPhotos = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/deliveries"] });
      setDetailItem(updated);
      toast({ title: t("تم رفع الصور بنجاح", "Photos uploaded successfully") });
    } catch {
      toast({ title: t("فشل رفع الصور", "Failed to upload photos"), variant: "destructive" });
    } finally {
      setUploadingPhotos(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const openQuickSchedule = (wo: WorkOrder) => {
    setForm({ workOrderId: wo.id.toString(), scheduledDate: "", notes: "" });
    setCreateOpen(true);
  };

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-deliveries-title">{t("التوصيل", "Deliveries")}</h1>
          <p className="text-muted-foreground text-sm">{t("إدارة عمليات التوصيل", "Manage delivery operations")}</p>
        </div>
        <Dialog open={createOpen} onOpenChange={o => { setCreateOpen(o); if (!o) setForm({ workOrderId: "", scheduledDate: "", notes: "" }); }}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-delivery" onClick={() => setForm({ workOrderId: "", scheduledDate: "", notes: "" })}>
              <Plus className="w-4 h-4 me-2" />{t("جدولة توصيل", "Schedule Delivery")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("جدولة توصيل جديد", "Schedule New Delivery")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>{t("أمر العمل", "Work Order")} *</Label>
                <Select value={form.workOrderId} onValueChange={v => setForm({ ...form, workOrderId: v })}>
                  <SelectTrigger data-testid="select-delivery-wo">
                    <SelectValue placeholder={t("اختر أمر العمل", "Select work order")} />
                  </SelectTrigger>
                  <SelectContent>
                    {workOrders.filter(wo => wo.status === "ready" || wo.status === "quality_check").map(wo => {
                      const cust = getCustomer(wo.customerId);
                      return (
                        <SelectItem key={wo.id} value={wo.id.toString()}>
                          #{wo.orderNumber}{cust ? ` — ${cust.fullName}` : ""}
                        </SelectItem>
                      );
                    })}
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
              <Button
                className="w-full"
                onClick={() => createMutation.mutate({ workOrderId: parseInt(form.workOrderId), scheduledDate: form.scheduledDate, notes: form.notes })}
                disabled={!form.workOrderId || !form.scheduledDate || createMutation.isPending}
                data-testid="button-create-delivery"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("جدولة", "Schedule")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {readyWorkOrders.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertCircle className="w-5 h-5" />
              {t("طلبات جاهزة للتوصيل", "Ready for Delivery")}
              <Badge className="bg-amber-500 text-white ms-1">{readyWorkOrders.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {readyWorkOrders.map(wo => {
                const cust = getCustomer(wo.customerId);
                return (
                  <Card key={wo.id} className="bg-white dark:bg-background border shadow-sm" data-testid={`card-ready-wo-${wo.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900 flex items-center justify-center">
                          <Truck className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                        </div>
                        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 text-xs">
                          {t("جاهز", "Ready")}
                        </Badge>
                      </div>
                      <p className="font-semibold text-sm" data-testid={`text-ready-wo-number-${wo.id}`}>
                        {t("أمر", "Order")} #{wo.orderNumber}
                      </p>
                      {cust && (
                        <p className="text-sm text-muted-foreground mt-0.5" data-testid={`text-ready-customer-${wo.id}`}>
                          {cust.fullName}
                        </p>
                      )}
                      {wo.dueDate && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {wo.dueDate}
                        </p>
                      )}
                      <Button
                        size="sm"
                        className="w-full mt-3"
                        onClick={() => openQuickSchedule(wo)}
                        data-testid={`button-schedule-wo-${wo.id}`}
                      >
                        <Plus className="w-3 h-3 me-1" />
                        {t("جدولة التوصيل", "Schedule Delivery")}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2 overflow-x-auto pb-2 flex-nowrap">
        {[{ key: "all", ar: "الكل", en: "All" }, ...Object.entries(statusConfig).map(([k, v]) => ({ key: k, ar: v.ar, en: v.en }))].map(tab => (
          <Button key={tab.key} size="sm" variant={filter === tab.key ? "default" : "outline"} onClick={() => setFilter(tab.key)} data-testid={`button-filter-${tab.key}`}>
            {t(tab.ar, tab.en)}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t("لا توجد عمليات توصيل", "No deliveries found")}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("رقم الطلب", "Order #")}</TableHead>
                    <TableHead>{t("اسم العميل", "Customer")}</TableHead>
                    <TableHead>{t("تاريخ التوصيل", "Delivery Date")}</TableHead>
                    <TableHead>{t("الحالة", "Status")}</TableHead>
                    <TableHead>{t("الصور", "Photos")}</TableHead>
                    <TableHead className="text-center">{t("الإجراءات", "Actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(d => {
                    const wo = getWorkOrder(d.workOrderId);
                    const cust = wo ? getCustomer(wo.customerId) : null;
                    const status = statusConfig[d.status] || statusConfig.scheduled;
                    const photoCount = d.deliveryPhotos?.length ?? 0;
                    return (
                      <TableRow key={d.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetailItem(d)} data-testid={`row-delivery-${d.id}`}>
                        <TableCell className="font-medium">
                          #{wo?.orderNumber || d.workOrderId}
                        </TableCell>
                        <TableCell>
                          {cust ? (
                            <span data-testid={`text-delivery-customer-${d.id}`}>{cust.fullName}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {d.scheduledDate || <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          <Badge className={status.color}>{t(status.ar, status.en)}</Badge>
                        </TableCell>
                        <TableCell>
                          {photoCount > 0 ? (
                            <span className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Image className="w-4 h-4" />
                              {photoCount}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); setDetailItem(d); }} data-testid={`button-detail-${d.id}`}>
                            {t("تفاصيل", "Details")}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!detailItem} onOpenChange={o => { if (!o) setDetailItem(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("تفاصيل التوصيل", "Delivery Details")}</DialogTitle>
          </DialogHeader>
          {detailItem && (() => {
            const wo = getWorkOrder(detailItem.workOrderId);
            const cust = wo ? getCustomer(wo.customerId) : null;
            const photos = detailItem.deliveryPhotos ?? [];
            const showPhotoUpload = detailItem.status === "in_transit" || detailItem.status === "delivered";
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground block">{t("رقم الطلب", "Order #")}</span>
                    <span className="font-medium">#{wo?.orderNumber || detailItem.workOrderId}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">{t("العميل", "Customer")}</span>
                    <span className="font-medium">{cust?.fullName || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">{t("التاريخ المجدول", "Scheduled Date")}</span>
                    <span>{detailItem.scheduledDate || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">{t("الحالة", "Status")}</span>
                    <Badge className={statusConfig[detailItem.status]?.color}>
                      {t(statusConfig[detailItem.status]?.ar, statusConfig[detailItem.status]?.en)}
                    </Badge>
                  </div>
                </div>

                {detailItem.notes && (
                  <div>
                    <span className="text-muted-foreground text-sm">{t("ملاحظات", "Notes")}:</span>
                    <p className="text-sm mt-1">{detailItem.notes}</p>
                  </div>
                )}

                {showPhotoUpload && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Camera className="w-4 h-4" />
                      {t("صور التوصيل", "Delivery Photos")}
                    </Label>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={e => handlePhotoUpload(e.target.files)}
                      data-testid="input-delivery-photos"
                    />
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => photoInputRef.current?.click()}
                      disabled={uploadingPhotos}
                      data-testid="button-upload-photos"
                    >
                      {uploadingPhotos ? (
                        <Loader2 className="w-4 h-4 me-2 animate-spin" />
                      ) : (
                        <Camera className="w-4 h-4 me-2" />
                      )}
                      {t("رفع صور التوصيل", "Upload Delivery Photos")}
                    </Button>

                    {photos.length > 0 && (
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        {photos.map((src, i) => (
                          <a key={i} href={src} target="_blank" rel="noopener noreferrer" data-testid={`img-delivery-photo-${detailItem.id}-${i}`}>
                            <img
                              src={src}
                              alt={`delivery-photo-${i + 1}`}
                              className="w-full h-20 object-cover rounded-md border hover:opacity-80 transition-opacity"
                            />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-2 flex-wrap">
                  {detailItem.status === "scheduled" && (
                    <Button
                      className="flex-1"
                      onClick={() => updateMutation.mutate({ id: detailItem.id, data: { status: "in_transit" } as Partial<DeliveryWithPhotos> })}
                      disabled={updateMutation.isPending}
                      data-testid="button-start-transit"
                    >
                      <Navigation className="w-4 h-4 me-1" />
                      {t("بدء التوصيل", "Start Transit")}
                    </Button>
                  )}
                  {detailItem.status === "in_transit" && (
                    <>
                      <Button
                        className="flex-1"
                        onClick={async () => {
                          await updateMutation.mutateAsync({
                            id: detailItem.id,
                            data: { status: "delivered", deliveredDate: new Date().toISOString().split("T")[0] } as Partial<DeliveryWithPhotos>,
                          });
                          if (canAdvance && detailItem.workOrderId) {
                            const wo2 = workOrders.find(w => w.id === detailItem.workOrderId);
                            if (wo2 && wo2.status === "ready") {
                              advanceStageMutation.mutate(detailItem.workOrderId);
                            }
                          }
                        }}
                        disabled={updateMutation.isPending || advanceStageMutation.isPending}
                        data-testid="button-mark-delivered"
                      >
                        <CheckCircle2 className="w-4 h-4 me-1" />
                        {t("تم التسليم", "Mark Delivered")}
                      </Button>
                      <Button
                        variant="destructive"
                        className="flex-1"
                        onClick={() => updateMutation.mutate({ id: detailItem.id, data: { status: "failed" } as Partial<DeliveryWithPhotos> })}
                        disabled={updateMutation.isPending}
                        data-testid="button-mark-failed"
                      >
                        <XCircle className="w-4 h-4 me-1" />
                        {t("فشل", "Failed")}
                      </Button>
                    </>
                  )}
                  {detailItem.status === "delivered" && canAdvance && (() => {
                    const wo2 = workOrders.find(w => w.id === detailItem.workOrderId);
                    if (wo2 && wo2.status === "ready") {
                      return (
                        <Button
                          className="flex-1 bg-teal-600 hover:bg-teal-700 text-white"
                          onClick={() => advanceStageMutation.mutate(detailItem.workOrderId)}
                          disabled={advanceStageMutation.isPending}
                          data-testid="button-advance-wo-delivered"
                        >
                          <PackageCheck className="w-4 h-4 me-1" />
                          {t("تحديث أمر العمل: تم التسليم", "Advance WO to Delivered")}
                        </Button>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
