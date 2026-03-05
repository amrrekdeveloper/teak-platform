import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Installation, MaintenanceRequest, WorkOrder, Customer } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Plus, Wrench, AlertTriangle, CheckCircle2, Clock, Calendar, Play } from "lucide-react";

const installStatusConfig: Record<string, { ar: string; en: string; color: string }> = {
  scheduled: { ar: "مجدول", en: "Scheduled", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  in_progress: { ar: "قيد التنفيذ", en: "In Progress", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" },
  completed: { ar: "مكتمل", en: "Completed", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  rescheduled: { ar: "أعيدت جدولته", en: "Rescheduled", color: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300" },
};

const maintStatusConfig: Record<string, { ar: string; en: string; color: string }> = {
  pending: { ar: "في الانتظار", en: "Pending", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  scheduled: { ar: "مجدول", en: "Scheduled", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  in_progress: { ar: "قيد التنفيذ", en: "In Progress", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" },
  completed: { ar: "مكتمل", en: "Completed", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  cancelled: { ar: "ملغي", en: "Cancelled", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
};

const priorityConfig: Record<string, { ar: string; en: string; color: string }> = {
  low: { ar: "منخفض", en: "Low", color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  normal: { ar: "عادي", en: "Normal", color: "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400" },
  high: { ar: "عالي", en: "High", color: "bg-orange-100 text-orange-600 dark:bg-orange-900 dark:text-orange-400" },
  urgent: { ar: "عاجل", en: "Urgent", color: "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400" },
};

export default function InstallationsPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [tab, setTab] = useState("installations");
  const [installDialog, setInstallDialog] = useState(false);
  const [maintDialog, setMaintDialog] = useState(false);
  const [detailInstall, setDetailInstall] = useState<Installation | null>(null);
  const [detailMaint, setDetailMaint] = useState<MaintenanceRequest | null>(null);

  const [installForm, setInstallForm] = useState({ workOrderId: "", scheduledDate: "", notes: "" });
  const [maintForm, setMaintForm] = useState({ customerId: "", description: "", priority: "normal" });

  const { data: installations = [], isLoading: loadingI } = useQuery<Installation[]>({ queryKey: ["/api/installations"] });
  const { data: maintenanceRequests = [], isLoading: loadingM } = useQuery<MaintenanceRequest[]>({ queryKey: ["/api/maintenance-requests"] });
  const { data: workOrders = [] } = useQuery<WorkOrder[]>({ queryKey: ["/api/work-orders"] });
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });

  const createInstallMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/installations", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/installations"] }); setInstallDialog(false); setInstallForm({ workOrderId: "", scheduledDate: "", notes: "" }); toast({ title: t("تمت جدولة التركيب", "Installation scheduled") }); },
  });

  const updateInstallMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/installations/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/installations"] }); setDetailInstall(null); toast({ title: t("تم التحديث", "Updated") }); },
  });

  const createMaintMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/maintenance-requests", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/maintenance-requests"] }); setMaintDialog(false); setMaintForm({ customerId: "", description: "", priority: "normal" }); toast({ title: t("تم إنشاء طلب الصيانة", "Maintenance request created") }); },
  });

  const updateMaintMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/maintenance-requests/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/maintenance-requests"] }); setDetailMaint(null); toast({ title: t("تم التحديث", "Updated") }); },
  });

  const getCustomerName = (id: number | null) => { if (!id) return ""; return customers.find(c => c.id === id)?.fullName || ""; };

  if (loadingI || loadingM) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <h1 className="text-2xl font-bold" data-testid="text-installations-title">{t("التركيب والصيانة", "Installation & Maintenance")}</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="installations" data-testid="tab-installations">
            {t("التركيب", "Installations")} <Badge variant="secondary" className="ms-1.5 text-[10px]">{installations.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="maintenance" data-testid="tab-maintenance">
            {t("الصيانة", "Maintenance")} <Badge variant="secondary" className="ms-1.5 text-[10px]">{maintenanceRequests.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="installations" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={installDialog} onOpenChange={setInstallDialog}>
              <DialogTrigger asChild><Button data-testid="button-new-installation"><Plus className="w-4 h-4 me-2" />{t("جدولة تركيب", "Schedule Installation")}</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{t("جدولة تركيب جديد", "Schedule New Installation")}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>{t("أمر العمل", "Work Order")}</Label>
                    <Select value={installForm.workOrderId} onValueChange={v => setInstallForm({ ...installForm, workOrderId: v })}>
                      <SelectTrigger data-testid="select-install-wo"><SelectValue placeholder={t("اختر", "Select")} /></SelectTrigger>
                      <SelectContent>{workOrders.map(wo => <SelectItem key={wo.id} value={wo.id.toString()}>#{wo.orderNumber}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1"><Label>{t("التاريخ", "Date")}</Label><Input type="date" value={installForm.scheduledDate} onChange={e => setInstallForm({ ...installForm, scheduledDate: e.target.value })} data-testid="input-install-date" /></div>
                  <div className="space-y-1"><Label>{t("ملاحظات", "Notes")}</Label><Textarea value={installForm.notes} onChange={e => setInstallForm({ ...installForm, notes: e.target.value })} data-testid="input-install-notes" /></div>
                  <Button className="w-full" onClick={() => createInstallMutation.mutate({ workOrderId: parseInt(installForm.workOrderId), scheduledDate: installForm.scheduledDate, notes: installForm.notes })} disabled={!installForm.workOrderId || !installForm.scheduledDate || createInstallMutation.isPending} data-testid="button-create-installation">
                    {createInstallMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("جدولة", "Schedule")}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {installations.length === 0 ? <Card><CardContent className="p-8 text-center text-muted-foreground">{t("لا توجد عمليات تركيب", "No installations")}</CardContent></Card> : (
            <div className="space-y-3">
              {installations.map(inst => {
                const s = installStatusConfig[inst.status] || installStatusConfig.scheduled;
                return (
                  <Card key={inst.id} className="cursor-pointer" onClick={() => setDetailInstall(inst)} data-testid={`card-installation-${inst.id}`}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><Wrench className="w-5 h-5 text-primary" /></div>
                        <div>
                          <h3 className="font-semibold">{t("تركيب - أمر عمل", "Install - WO")} #{inst.workOrderId}</h3>
                          <p className="text-xs text-muted-foreground">{inst.scheduledDate && `${t("مجدول", "Scheduled")}: ${inst.scheduledDate}`}</p>
                        </div>
                      </div>
                      <Badge className={s.color}>{t(s.ar, s.en)}</Badge>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="maintenance" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={maintDialog} onOpenChange={setMaintDialog}>
              <DialogTrigger asChild><Button data-testid="button-new-maintenance"><Plus className="w-4 h-4 me-2" />{t("طلب صيانة", "Maintenance Request")}</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{t("طلب صيانة جديد", "New Maintenance Request")}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>{t("العميل", "Customer")}</Label>
                    <Select value={maintForm.customerId} onValueChange={v => setMaintForm({ ...maintForm, customerId: v })}>
                      <SelectTrigger data-testid="select-maint-customer"><SelectValue placeholder={t("اختر العميل", "Select customer")} /></SelectTrigger>
                      <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.fullName}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1"><Label>{t("الوصف", "Description")}</Label><Textarea value={maintForm.description} onChange={e => setMaintForm({ ...maintForm, description: e.target.value })} data-testid="input-maint-description" /></div>
                  <div className="space-y-1">
                    <Label>{t("الأولوية", "Priority")}</Label>
                    <Select value={maintForm.priority} onValueChange={v => setMaintForm({ ...maintForm, priority: v })}>
                      <SelectTrigger data-testid="select-maint-priority"><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(priorityConfig).map(([k, v]) => <SelectItem key={k} value={k}>{t(v.ar, v.en)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <Button className="w-full" onClick={() => createMaintMutation.mutate({ customerId: parseInt(maintForm.customerId), description: maintForm.description, priority: maintForm.priority })} disabled={!maintForm.customerId || !maintForm.description || createMaintMutation.isPending} data-testid="button-create-maintenance">
                    {createMaintMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("إنشاء", "Create")}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {maintenanceRequests.length === 0 ? <Card><CardContent className="p-8 text-center text-muted-foreground">{t("لا توجد طلبات صيانة", "No maintenance requests")}</CardContent></Card> : (
            <div className="space-y-3">
              {maintenanceRequests.map(mr => {
                const s = maintStatusConfig[mr.status] || maintStatusConfig.pending;
                const p = priorityConfig[mr.priority] || priorityConfig.normal;
                return (
                  <Card key={mr.id} className="cursor-pointer" onClick={() => setDetailMaint(mr)} data-testid={`card-maintenance-${mr.id}`}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900 flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400" /></div>
                        <div>
                          <h3 className="font-semibold">{t("طلب صيانة", "Maintenance")} #{mr.requestNumber}</h3>
                          <p className="text-xs text-muted-foreground">{getCustomerName(mr.customerId)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={p.color}>{t(p.ar, p.en)}</Badge>
                        <Badge className={s.color}>{t(s.ar, s.en)}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!detailInstall} onOpenChange={o => { if (!o) setDetailInstall(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("تفاصيل التركيب", "Installation Details")}</DialogTitle></DialogHeader>
          {detailInstall && (
            <div className="space-y-4">
              <div className="flex justify-between"><span className="text-muted-foreground">{t("أمر العمل", "Work Order")}</span><span>#{detailInstall.workOrderId}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("الحالة", "Status")}</span><Badge className={installStatusConfig[detailInstall.status]?.color}>{t(installStatusConfig[detailInstall.status]?.ar, installStatusConfig[detailInstall.status]?.en)}</Badge></div>
              <div className="flex gap-2">
                {detailInstall.status === "scheduled" && <Button className="flex-1" onClick={() => updateInstallMutation.mutate({ id: detailInstall.id, data: { status: "in_progress" } })} data-testid="button-start-install"><Play className="w-4 h-4 me-1" />{t("بدء التركيب", "Start")}</Button>}
                {detailInstall.status === "in_progress" && <Button className="flex-1" onClick={() => updateInstallMutation.mutate({ id: detailInstall.id, data: { status: "completed", completedDate: new Date().toISOString().split("T")[0] } })} data-testid="button-complete-install"><CheckCircle2 className="w-4 h-4 me-1" />{t("إتمام", "Complete")}</Button>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailMaint} onOpenChange={o => { if (!o) setDetailMaint(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("تفاصيل طلب الصيانة", "Maintenance Request Details")} #{detailMaint?.requestNumber}</DialogTitle></DialogHeader>
          {detailMaint && (
            <div className="space-y-4">
              <div className="flex justify-between"><span className="text-muted-foreground">{t("العميل", "Customer")}</span><span>{getCustomerName(detailMaint.customerId)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("الأولوية", "Priority")}</span><Badge className={priorityConfig[detailMaint.priority]?.color}>{t(priorityConfig[detailMaint.priority]?.ar, priorityConfig[detailMaint.priority]?.en)}</Badge></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("الحالة", "Status")}</span><Badge className={maintStatusConfig[detailMaint.status]?.color}>{t(maintStatusConfig[detailMaint.status]?.ar, maintStatusConfig[detailMaint.status]?.en)}</Badge></div>
              <div><span className="text-muted-foreground text-sm">{t("الوصف", "Description")}:</span><p className="text-sm mt-1">{detailMaint.description}</p></div>
              <div className="flex gap-2">
                {detailMaint.status === "pending" && <Button className="flex-1" onClick={() => updateMaintMutation.mutate({ id: detailMaint.id, data: { status: "scheduled" } })} data-testid="button-schedule-maint"><Calendar className="w-4 h-4 me-1" />{t("جدولة", "Schedule")}</Button>}
                {detailMaint.status === "scheduled" && <Button className="flex-1" onClick={() => updateMaintMutation.mutate({ id: detailMaint.id, data: { status: "in_progress" } })} data-testid="button-start-maint"><Play className="w-4 h-4 me-1" />{t("بدء", "Start")}</Button>}
                {detailMaint.status === "in_progress" && <Button className="flex-1" onClick={() => updateMaintMutation.mutate({ id: detailMaint.id, data: { status: "completed", completedDate: new Date().toISOString().split("T")[0] } })} data-testid="button-complete-maint"><CheckCircle2 className="w-4 h-4 me-1" />{t("إتمام", "Complete")}</Button>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
