import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks,
  addMonths, subMonths, startOfMonth, endOfMonth, isSameDay, isSameMonth,
  parseISO, getHours, getMinutes, isToday,
} from "date-fns";
import { ar } from "date-fns/locale";
import {
  ChevronLeft, ChevronRight, Plus, Calendar, Clock,
  CheckCircle, XCircle, AlertCircle, RotateCcw, Link2
} from "lucide-react";
import { Link } from "wouter";

type ViewMode = "week" | "month";

const STATUS_CONFIG: Record<string, { labelAr: string; labelEn: string; color: string; icon: any }> = {
  scheduled: { labelAr: "مجدول", labelEn: "Scheduled", color: "bg-blue-100 text-blue-800 border-blue-200", icon: Clock },
  attended: { labelAr: "تمت الزيارة", labelEn: "Attended", color: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle },
  no_show: { labelAr: "لم يحضر", labelEn: "No Show", color: "bg-orange-100 text-orange-800 border-orange-200", icon: AlertCircle },
  client_refused: { labelAr: "العميل رفض", labelEn: "Client Refused", color: "bg-red-100 text-red-800 border-red-200", icon: XCircle },
  rescheduled: { labelAr: "أعيد جدولته", labelEn: "Rescheduled", color: "bg-purple-100 text-purple-800 border-purple-200", icon: RotateCcw },
  cancelled: { labelAr: "ملغي", labelEn: "Cancelled", color: "bg-gray-100 text-gray-500 border-gray-200", icon: XCircle },
};

const HOURS = Array.from({ length: 13 }, (_, i) => i + 7); // 7am-7pm

export default function MyCalendarPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [view, setView] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedAppt, setSelectedAppt] = useState<any>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [filterSalesPerson, setFilterSalesPerson] = useState<string>("all");

  const isManager = user?.role === "owner" || user?.role === "assistant";

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);

  const dateFrom = view === "week" ? weekStart : monthStart;
  const dateTo = view === "week" ? weekEnd : monthEnd;

  const { data: appointments = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/appointments", format(dateFrom, "yyyy-MM-dd"), format(dateTo, "yyyy-MM-dd"), filterSalesPerson],
    queryFn: async () => {
      const params = new URLSearchParams({
        dateFrom: dateFrom.toISOString(),
        dateTo: dateTo.toISOString(),
      });
      if (isManager && filterSalesPerson !== "all") params.set("salesPersonId", filterSalesPerson);
      const res = await fetch(`/api/appointments?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 30000,
  });

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
    enabled: isManager,
    staleTime: 60000,
  });

  const { data: quotations = [] } = useQuery<any[]>({
    queryKey: ["/api/quotations"],
    staleTime: 60000,
  });

  const salesUsers = (users as any[]).filter(u => u.role === "sales");

  const [form, setForm] = useState({
    title: "",
    dateStart: "",
    dateEnd: "",
    quotationId: "",
    notes: "",
    salesPersonId: "",
  });

  const createAppt = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/appointments", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/appointments"] });
      setShowAddDialog(false);
      setForm({ title: "", dateStart: "", dateEnd: "", quotationId: "", notes: "", salesPersonId: "" });
      toast({ title: t("تم إضافة الموعد", "Appointment added") });
    },
    onError: (e: any) => toast({ title: e.message || t("خطأ", "Error"), variant: "destructive" }),
  });

  const updateAppt = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/appointments/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/appointments"] });
      setShowStatusDialog(false);
      setSelectedAppt(null);
      toast({ title: t("تم تحديث الموعد", "Appointment updated") });
    },
    onError: (e: any) => toast({ title: e.message || t("خطأ", "Error"), variant: "destructive" }),
  });

  const handleCreate = () => {
    if (!form.title || !form.dateStart || !form.dateEnd)
      return toast({ title: t("يرجى ملء جميع الحقول المطلوبة", "Fill required fields"), variant: "destructive" });
    createAppt.mutate({
      title: form.title,
      dateStart: new Date(form.dateStart).toISOString(),
      dateEnd: new Date(form.dateEnd).toISOString(),
      quotationId: form.quotationId ? parseInt(form.quotationId) : null,
      notes: form.notes || null,
      salesPersonId: isManager && form.salesPersonId ? parseInt(form.salesPersonId) : undefined,
    });
  };

  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const getApptForDay = (day: Date) =>
    appointments.filter(a => isSameDay(parseISO(a.dateStart), day));

  const getApptForDayHour = (day: Date, hour: number) =>
    appointments.filter(a => {
      const s = parseISO(a.dateStart);
      return isSameDay(s, day) && getHours(s) === hour;
    });

  const prev = () => view === "week" ? setCurrentDate(subWeeks(currentDate, 1)) : setCurrentDate(subMonths(currentDate, 1));
  const next = () => view === "week" ? setCurrentDate(addWeeks(currentDate, 1)) : setCurrentDate(addMonths(currentDate, 1));

  const headerLabel = view === "week"
    ? `${format(weekStart, "d MMM", { locale: ar })} - ${format(weekEnd, "d MMM yyyy", { locale: ar })}`
    : format(currentDate, "MMMM yyyy", { locale: ar });

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("التقويم الذكي", "Smart Calendar")}</h1>
          <p className="text-muted-foreground text-sm">{t("إدارة مواعيد الزيارات الميدانية", "Manage site visit appointments")}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isManager && (
            <Select value={filterSalesPerson} onValueChange={setFilterSalesPerson}>
              <SelectTrigger className="w-36 h-8 text-sm" data-testid="select-filter-salesperson">
                <SelectValue placeholder={t("كل المناديب", "All Sales")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("كل المناديب", "All Sales")}</SelectItem>
                {salesUsers.map(u => (
                  <SelectItem key={u.id} value={String(u.id)}>{u.fullNameAr}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex border rounded-lg overflow-hidden">
            <Button variant={view === "week" ? "default" : "ghost"} size="sm" onClick={() => setView("week")} data-testid="btn-view-week">
              {t("أسبوعي", "Week")}
            </Button>
            <Button variant={view === "month" ? "default" : "ghost"} size="sm" onClick={() => setView("month")} data-testid="btn-view-month">
              {t("شهري", "Month")}
            </Button>
          </div>
          <Button size="sm" onClick={() => setShowAddDialog(true)} data-testid="btn-add-appointment">
            <Plus className="h-4 w-4 me-1" />
            {t("موعد جديد", "New Appointment")}
          </Button>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon" onClick={prev} data-testid="btn-prev"><ChevronRight className="h-4 w-4" /></Button>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold text-base">{headerLabel}</span>
        </div>
        <Button variant="outline" size="icon" onClick={next} data-testid="btn-next"><ChevronLeft className="h-4 w-4" /></Button>
      </div>

      {/* Week View */}
      {view === "week" && (
        <div className="overflow-x-auto">
          <div className="min-w-[700px]">
            {/* Day headers */}
            <div className="grid grid-cols-8 border-b">
              <div className="p-2 text-xs text-muted-foreground text-center" />
              {weekDays.map(day => (
                <div key={day.toISOString()} className={`p-2 text-center border-s ${isToday(day) ? "bg-primary/5" : ""}`}>
                  <div className="text-xs text-muted-foreground">{format(day, "EEE", { locale: ar })}</div>
                  <div className={`text-sm font-bold mt-0.5 w-7 h-7 rounded-full flex items-center justify-center mx-auto ${isToday(day) ? "bg-primary text-primary-foreground" : ""}`}>
                    {format(day, "d")}
                  </div>
                </div>
              ))}
            </div>
            {/* Time slots */}
            {HOURS.map(hour => (
              <div key={hour} className="grid grid-cols-8 border-b min-h-[60px]">
                <div className="p-1 text-xs text-muted-foreground text-center border-e py-2">
                  {hour}:00
                </div>
                {weekDays.map(day => {
                  const appts = getApptForDayHour(day, hour);
                  return (
                    <div key={day.toISOString()} className={`border-s p-1 relative ${isToday(day) ? "bg-primary/5" : ""}`}>
                      {appts.map(a => {
                        const cfg = STATUS_CONFIG[a.status] || STATUS_CONFIG.scheduled;
                        return (
                          <div
                            key={a.id}
                            className={`text-xs rounded px-1 py-0.5 mb-0.5 border cursor-pointer truncate ${cfg.color}`}
                            onClick={() => { setSelectedAppt(a); setShowStatusDialog(true); }}
                            data-testid={`appt-block-${a.id}`}
                          >
                            {format(parseISO(a.dateStart), "HH:mm")} {a.title}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Month View */}
      {view === "month" && (
        <div>
          <div className="grid grid-cols-7 border-b">
            {["أحد", "اثن", "ثلا", "أرب", "خمي", "جمع", "سبت"].map(d => (
              <div key={d} className="p-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {/* Leading blanks */}
            {Array.from({ length: monthStart.getDay() }).map((_, i) => (
              <div key={`blank-${i}`} className="border p-1 min-h-[80px] bg-muted/10" />
            ))}
            {monthDays.map(day => {
              const dayAppts = getApptForDay(day);
              return (
                <div key={day.toISOString()} className={`border p-1 min-h-[80px] ${!isSameMonth(day, currentDate) ? "bg-muted/10" : ""} ${isToday(day) ? "bg-primary/5" : ""}`}>
                  <div className={`text-xs font-semibold mb-1 w-6 h-6 rounded-full flex items-center justify-center ${isToday(day) ? "bg-primary text-primary-foreground" : ""}`}>
                    {format(day, "d")}
                  </div>
                  {dayAppts.slice(0, 3).map(a => {
                    const cfg = STATUS_CONFIG[a.status] || STATUS_CONFIG.scheduled;
                    return (
                      <div
                        key={a.id}
                        className={`text-[10px] rounded px-1 mb-0.5 border truncate cursor-pointer ${cfg.color}`}
                        onClick={() => { setSelectedAppt(a); setShowStatusDialog(true); }}
                        data-testid={`month-appt-${a.id}`}
                      >
                        {format(parseISO(a.dateStart), "HH:mm")} {a.title}
                      </div>
                    );
                  })}
                  {dayAppts.length > 3 && (
                    <div className="text-[10px] text-muted-foreground">+{dayAppts.length - 3}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Upcoming appointments list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("المواعيد القادمة", "Upcoming Appointments")}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-sm text-center py-4">{t("جاري التحميل...", "Loading...")}</p>
          ) : appointments.filter(a => a.status === "scheduled").length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">{t("لا توجد مواعيد مجدولة", "No scheduled appointments")}</p>
          ) : (
            <div className="space-y-2">
              {appointments.filter(a => a.status === "scheduled").map(a => {
                const cfg = STATUS_CONFIG[a.status];
                const Icon = cfg.icon;
                return (
                  <div key={a.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                    onClick={() => { setSelectedAppt(a); setShowStatusDialog(true); }}
                    data-testid={`appt-row-${a.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="h-4 w-4 text-blue-500 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-sm">{a.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(parseISO(a.dateStart), "yyyy/MM/dd HH:mm")} - {format(parseISO(a.dateEnd), "HH:mm")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {a.quotationId && (
                        <Link href={`/quotations/${a.quotationId}`} onClick={e => e.stopPropagation()}>
                          <Badge variant="outline" className="text-xs gap-1"><Link2 className="h-3 w-3" />#{a.quotationId}</Badge>
                        </Link>
                      )}
                      <Badge className={`text-xs border ${cfg.color}`}>{t(cfg.labelAr, cfg.labelEn)}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Appointment Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("إضافة موعد جديد", "Add New Appointment")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("عنوان الموعد *", "Appointment Title *")}</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder={t("مثال: زيارة ميدانية - أحمد التميمي", "e.g. Site Visit - Ahmed")}
                data-testid="input-appt-title" />
            </div>
            {isManager && (
              <div>
                <Label>{t("المندوب", "Sales Person")}</Label>
                <Select value={form.salesPersonId} onValueChange={v => setForm(f => ({ ...f, salesPersonId: v }))}>
                  <SelectTrigger data-testid="select-appt-salesperson">
                    <SelectValue placeholder={t("اختر المندوب", "Select sales person")} />
                  </SelectTrigger>
                  <SelectContent>
                    {salesUsers.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.fullNameAr}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>{t("وقت البداية *", "Start Time *")}</Label>
                <Input type="datetime-local" value={form.dateStart}
                  onChange={e => setForm(f => ({ ...f, dateStart: e.target.value }))}
                  data-testid="input-appt-start" />
              </div>
              <div>
                <Label>{t("وقت النهاية *", "End Time *")}</Label>
                <Input type="datetime-local" value={form.dateEnd}
                  onChange={e => setForm(f => ({ ...f, dateEnd: e.target.value }))}
                  data-testid="input-appt-end" />
              </div>
            </div>
            <div>
              <Label>{t("ربط بطلب (اختياري)", "Link to Order (Optional)")}</Label>
              <Select value={form.quotationId || "none"} onValueChange={v => setForm(f => ({ ...f, quotationId: v === "none" ? "" : v }))}>
                <SelectTrigger data-testid="select-appt-quotation">
                  <SelectValue placeholder={t("اختر الطلب", "Select order")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("بدون ربط", "No link")}</SelectItem>
                  {(quotations as any[]).map(q => (
                    <SelectItem key={q.id} value={String(q.id)}>#{q.quotationNumber}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("ملاحظات", "Notes")}</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2} data-testid="textarea-appt-notes" />
            </div>
          </div>
          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>{t("إلغاء", "Cancel")}</Button>
            <Button onClick={handleCreate} disabled={createAppt.isPending} data-testid="btn-confirm-add-appt">
              {createAppt.isPending ? t("جاري الحفظ...", "Saving...") : t("إضافة الموعد", "Add Appointment")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status Update Dialog */}
      {selectedAppt && (
        <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{selectedAppt.title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                <p>{format(parseISO(selectedAppt.dateStart), "yyyy/MM/dd HH:mm")} — {format(parseISO(selectedAppt.dateEnd), "HH:mm")}</p>
                {selectedAppt.notes && <p className="mt-1">{selectedAppt.notes}</p>}
              </div>
              <div>
                <Label>{t("تحديث الحالة", "Update Status")}</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {Object.entries(STATUS_CONFIG).filter(([k]) => k !== "scheduled").map(([k, cfg]) => (
                    <Button key={k} variant="outline" size="sm"
                      className={selectedAppt.status === k ? "ring-2 ring-primary" : ""}
                      onClick={() => updateAppt.mutate({ id: selectedAppt.id, data: { status: k } })}
                      disabled={updateAppt.isPending}
                      data-testid={`btn-status-${k}`}
                    >
                      {t(cfg.labelAr, cfg.labelEn)}
                    </Button>
                  ))}
                </div>
              </div>
              {selectedAppt.status === "attended" && (
                <div className="pt-2 border-t">
                  <Link href={`/site-survey?appointmentId=${selectedAppt.id}&quotationId=${selectedAppt.quotationId || ""}`}>
                    <Button className="w-full" data-testid="btn-start-survey">
                      {t("بدء نموذج الزيارة الميدانية", "Start Site Survey Form")}
                    </Button>
                  </Link>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowStatusDialog(false); setSelectedAppt(null); }}>
                {t("إغلاق", "Close")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
