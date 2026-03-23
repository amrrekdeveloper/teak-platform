import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Loader2,
  Plus,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  User,
  MapPin,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Eye,
  FileText,
} from "lucide-react";

type ViewMode = "day" | "week" | "month";

const statusColors: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 border-blue-300",
  attended: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 border-green-300",
  no_show: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 border-red-300",
  client_refused: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300 border-orange-300",
  rescheduled: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 border-purple-300",
};

const statusLabels: Record<string, { ar: string; en: string }> = {
  scheduled: { ar: "مجدول", en: "Scheduled" },
  attended: { ar: "تم الحضور", en: "Attended" },
  no_show: { ar: "لم يحضر", en: "No Show" },
  client_refused: { ar: "رفض العميل", en: "Client Refused" },
  rescheduled: { ar: "أعيد جدولته", en: "Rescheduled" },
};

const failReasonLabels: Record<string, { ar: string; en: string }> = {
  lazy: { ar: "تأجيل شخصي", en: "Personal Postponement" },
  emergency: { ar: "طارئ", en: "Emergency" },
  client_not_available: { ar: "العميل لم يفتح", en: "Client Not Available" },
  client_cancelled: { ar: "العميل ألغى", en: "Client Cancelled" },
};

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getWeekDates(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const wd = new Date(d);
    wd.setDate(diff + i);
    dates.push(wd);
  }
  return dates;
}

function formatDate(d: Date) {
  return d.toISOString().split("T")[0];
}

export default function MyCalendarPage() {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const isManager = user?.role === "owner" || user?.role === "assistant";
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedUserId, setSelectedUserId] = useState<string>("all");
  const [createDialog, setCreateDialog] = useState(false);
  const [detailDialog, setDetailDialog] = useState<any>(null);
  const [failDialog, setFailDialog] = useState<any>(null);
  const [rescheduleDialog, setRescheduleDialog] = useState<any>(null);

  const [formData, setFormData] = useState({
    title: "",
    appointmentDate: formatDate(new Date()),
    startTime: "09:00",
    endTime: "10:00",
    assignedTo: user?.id?.toString() || "",
    customerId: "",
    quotationId: "",
    notes: "",
  });

  const [failData, setFailData] = useState({
    failReason: "",
    failNotes: "",
  });

  const [rescheduleData, setRescheduleData] = useState({
    appointmentDate: "",
    startTime: "09:00",
    endTime: "10:00",
    notes: "",
  });

  const queryParams = isManager && selectedUserId !== "all" ? `?assignedTo=${selectedUserId}` : "";
  const { data: appointments = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/appointments", queryParams],
  });
  const { data: usersData = [] } = useQuery<any[]>({ queryKey: ["/api/users"] });
  const { data: customers = [] } = useQuery<any[]>({ queryKey: ["/api/customers"] });
  const { data: quotations = [] } = useQuery<any[]>({ queryKey: ["/api/quotations"] });

  const salesUsers = useMemo(() => {
    return usersData.filter((u: any) =>
      ["sales", "owner", "assistant"].includes(u.role)
    );
  }, [usersData]);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/appointments", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      setCreateDialog(false);
      resetForm();
      toast({ title: t("تم إنشاء الموعد", "Appointment created") });
    },
    onError: (error: any) => {
      toast({ title: error.message || t("فشل إنشاء الموعد", "Failed to create"), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/appointments/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      setDetailDialog(null);
      setFailDialog(null);
      toast({ title: t("تم تحديث الموعد", "Appointment updated") });
    },
    onError: () => {
      toast({ title: t("حدث خطأ", "Error"), variant: "destructive" });
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("POST", `/api/appointments/${id}/reschedule`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      setRescheduleDialog(null);
      toast({ title: t("تمت إعادة الجدولة", "Rescheduled successfully") });
    },
    onError: (error: any) => {
      toast({ title: error.message || t("فشل إعادة الجدولة", "Reschedule failed"), variant: "destructive" });
    },
  });

  function resetForm() {
    setFormData({
      title: "",
      appointmentDate: formatDate(new Date()),
      startTime: "09:00",
      endTime: "10:00",
      assignedTo: user?.id?.toString() || "",
      customerId: "",
      quotationId: "",
      notes: "",
    });
  }

  function navigateDate(direction: number) {
    const d = new Date(currentDate);
    if (viewMode === "day") d.setDate(d.getDate() + direction);
    else if (viewMode === "week") d.setDate(d.getDate() + direction * 7);
    else d.setMonth(d.getMonth() + direction);
    setCurrentDate(d);
  }

  function getDateLabel() {
    if (viewMode === "day") {
      return currentDate.toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
      });
    }
    if (viewMode === "week") {
      const week = getWeekDates(currentDate);
      return `${week[0].toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US", { month: "short", day: "numeric" })} - ${week[6].toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    }
    return currentDate.toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US", {
      year: "numeric", month: "long",
    });
  }

  const filteredAppointments = useMemo(() => {
    return appointments.filter((app: any) => {
      const appDate = new Date(app.appointmentDate);
      if (viewMode === "day") {
        return formatDate(appDate) === formatDate(currentDate);
      } else if (viewMode === "week") {
        const week = getWeekDates(currentDate);
        const start = formatDate(week[0]);
        const end = formatDate(week[6]);
        const current = formatDate(appDate);
        return current >= start && current <= end;
      } else {
        return appDate.getMonth() === currentDate.getMonth() &&
               appDate.getFullYear() === currentDate.getFullYear();
      }
    });
  }, [appointments, currentDate, viewMode]);

  return (
    <div className="container mx-auto p-4 md:p-6 pb-24">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t("التقويم الذكي", "Smart Calendar")}</h1>
          <p className="text-muted-foreground">{t("إدارة ومتابعة مواعيد الزيارات الميدانية", "Manage and track site visit appointments")}</p>
        </div>
        <div className="flex items-center gap-2">
          {isManager && (
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="w-[180px]" data-testid="select-sales-filter">
                <SelectValue placeholder={t("تصفية حسب المندوب", "Filter by sales")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("جميع المناديب", "All Sales")}</SelectItem>
                {salesUsers.map((u: any) => (
                  <SelectItem key={u.id} value={u.id.toString()}>
                    {u.fullNameAr || u.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button onClick={() => setCreateDialog(true)} data-testid="button-new-appointment">
            <Plus className="w-4 h-4 me-1" />
            {t("موعد جديد", "New Appointment")}
          </Button>
        </div>
      </div>

      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="icon" className="shrink-0 h-8 w-8" onClick={() => navigateDate(-1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button variant="outline" className="flex-1 min-w-0 justify-center font-normal text-sm h-8 px-2">
                <CalendarIcon className="w-3.5 h-3.5 me-1.5 text-muted-foreground shrink-0" />
                <span className="truncate">{getDateLabel()}</span>
              </Button>
              <Button variant="outline" size="icon" className="shrink-0 h-8 w-8" onClick={() => navigateDate(1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" className="shrink-0 h-8 px-2 text-sm" onClick={() => setCurrentDate(new Date())}>
                {t("اليوم", "Today")}
              </Button>
            </div>
            <div className="flex bg-muted p-1 rounded-lg w-full">
              <Button
                variant={viewMode === "day" ? "secondary" : "ghost"}
                size="sm"
                className="flex-1"
                onClick={() => setViewMode("day")}
              >
                {t("يوم", "Day")}
              </Button>
              <Button
                variant={viewMode === "week" ? "secondary" : "ghost"}
                size="sm"
                className="flex-1"
                onClick={() => setViewMode("week")}
              >
                {t("أسبوع", "Week")}
              </Button>
              <Button
                variant={viewMode === "month" ? "secondary" : "ghost"}
                size="sm"
                className="flex-1"
                onClick={() => setViewMode("month")}
              >
                {t("شهر", "Month")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-4">
          {viewMode === "month" ? (
            <div className="grid grid-cols-7 gap-px bg-muted border rounded-lg overflow-hidden">
              {["الأحد", "الأثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"].map((day) => (
                <div key={day} className="bg-background p-2 text-center text-xs font-medium text-muted-foreground">
                  {t(day, day)}
                </div>
              ))}
              {(() => {
                const year = currentDate.getFullYear();
                const month = currentDate.getMonth();
                const firstDay = new Date(year, month, 1).getDay();
                const daysInMonth = getDaysInMonth(year, month);
                const cells = [];
                for (let i = 0; i < firstDay; i++) {
                  cells.push(<div key={`empty-\${i}`} className="bg-muted/50 min-h-[100px]" />);
                }
                for (let d = 1; d <= daysInMonth; d++) {
                  const dateStr = formatDate(new Date(year, month, d));
                  const dayApps = appointments.filter((a: any) => a.appointmentDate === dateStr);
                  const isToday = formatDate(new Date()) === dateStr;
                  cells.push(
                    <div key={d} className={`bg-background min-h-[100px] p-2 border-t border-r \${isToday ? "bg-primary/5" : ""}`}>
                      <span className={`text-xs font-medium \${isToday ? "text-primary bg-primary/10 w-6 h-6 flex items-center justify-center rounded-full" : ""}`}>
                        {d}
                      </span>
                      <div className="mt-1 space-y-1">
                        {dayApps.map((app: any) => (
                          <div
                            key={app.id}
                            className={`text-[10px] p-1 rounded border truncate cursor-pointer \${statusColors[app.status]}`}
                            onClick={() => setDetailDialog(app)}
                          >
                            {app.startTime} {app.title}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }
                return cells;
              })()}
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredAppointments.length === 0 ? (
                <div className="text-center p-12 border rounded-lg bg-muted/20">
                  <CalendarIcon className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">{t("لا توجد مواعيد في هذه الفترة", "No appointments for this period")}</p>
                </div>
              ) : (
                filteredAppointments.sort((a: any, b: any) => a.startTime.localeCompare(b.startTime)).map((app: any) => (
                  <Card key={app.id} className="cursor-pointer hover:border-primary transition-colors" onClick={() => setDetailDialog(app)}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="text-center min-w-[60px]">
                            <div className="text-sm font-bold">{app.startTime}</div>
                            <div className="text-[10px] text-muted-foreground">{app.endTime}</div>
                          </div>
                          <div className="w-px h-8 bg-border" />
                          <div>
                            <div className="font-medium">{app.title}</div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                              <MapPin className="w-3 h-3" />
                              {(() => {
                                const customer = customers.find((c: any) => c.id === app.customerId);
                                return customer ? customer.fullName : t("عميل غير محدد", "Unknown Customer");
                              })()}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={statusColors[app.status]}>
                            {t(statusLabels[app.status]?.ar || "", statusLabels[app.status]?.en || "")}
                          </Badge>
                          <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </div>
      )}

      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" data-testid="dialog-create-appointment">
          <DialogHeader>
            <DialogTitle>{t("إضافة موعد جديد", "Add New Appointment")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("نوع الموعد", "Appointment Type")}</Label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { ar: "زيارة رفع المقاسات", en: "Measurement Visit" },
                  { ar: "عرض المنتجات", en: "Product Showcase" },
                  { ar: "متابعة عميل", en: "Client Follow-up" },
                  { ar: "تسليم مشروع", en: "Project Delivery" },
                ].map((type) => (
                  <button
                    key={type.ar}
                    type="button"
                    onClick={() => setFormData({ ...formData, title: lang === "ar" ? type.ar : type.en })}
                    className={`text-xs p-2 border rounded-lg text-start transition-colors ${formData.title === (lang === "ar" ? type.ar : type.en) ? "border-primary bg-primary/10 text-primary font-semibold" : "hover:bg-muted/50"}`}
                    data-testid={`button-type-${type.en.toLowerCase().replace(/ /g, "-")}`}
                  >
                    {lang === "ar" ? type.ar : type.en}
                  </button>
                ))}
              </div>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder={t("أو اكتب عنواناً مخصصاً...", "Or type a custom title...")}
                data-testid="input-appointment-title"
              />
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label>{t("التاريخ", "Date")}</Label>
                <Input
                  type="date"
                  value={formData.appointmentDate}
                  onChange={(e) => setFormData({ ...formData, appointmentDate: e.target.value })}
                  data-testid="input-appointment-date"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label>{t("وقت البدء", "Start Time")}</Label>
                  <Input
                    type="time"
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    data-testid="input-appointment-start"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("وقت الانتهاء", "End Time")}</Label>
                  <Input
                    type="time"
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    data-testid="input-appointment-end"
                  />
                </div>
              </div>
            </div>
            {isManager && (
              <div className="space-y-2">
                <Label>{t("إسناد إلى", "Assign To")}</Label>
                <Select
                  value={formData.assignedTo}
                  onValueChange={(v) => setFormData({ ...formData, assignedTo: v })}
                >
                  <SelectTrigger data-testid="select-assigned-to">
                    <SelectValue placeholder={t("اختر المندوب", "Select sales")} />
                  </SelectTrigger>
                  <SelectContent>
                    {salesUsers.map((u: any) => (
                      <SelectItem key={u.id} value={u.id.toString()}>
                        {u.fullNameAr || u.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>{t("العميل", "Customer")} <span className="text-destructive">*</span></Label>
              <Select
                value={formData.customerId}
                onValueChange={(v) => setFormData({ ...formData, customerId: v, quotationId: "" })}
              >
                <SelectTrigger data-testid="select-customer">
                  <SelectValue placeholder={t("اختر العميل (مطلوب)", "Select customer (required)")} />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c: any) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {formData.customerId && (
              <div className="space-y-2">
                <Label>{t("عرض السعر المرتبط (اختياري)", "Linked Quotation (Optional)")}</Label>
                <Select
                  value={formData.quotationId}
                  onValueChange={(v) => setFormData({ ...formData, quotationId: v })}
                >
                  <SelectTrigger data-testid="select-quotation">
                    <SelectValue placeholder={t("اختر العرض", "Select quotation")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("بدون عرض", "No Quotation")}</SelectItem>
                    {quotations.filter((q: any) => q.customerId?.toString() === formData.customerId).map((q: any) => (
                      <SelectItem key={q.id} value={q.id.toString()}>
                        {t(`عرض #${q.id}`, `Quote #${q.id}`)} - {q.status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>{t("ملاحظات", "Notes")}</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder={t("أي تفاصيل إضافية", "Any additional details")}
                data-testid="input-appointment-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialog(false)}>
              {t("إلغاء", "Cancel")}
            </Button>
            <Button
              onClick={() => {
                const data: any = {
                  title: formData.title,
                  appointmentDate: formData.appointmentDate,
                  startTime: formData.startTime,
                  endTime: formData.endTime,
                  assignedTo: parseInt(formData.assignedTo) || user?.id,
                  notes: formData.notes || null,
                };
                if (formData.customerId) data.customerId = parseInt(formData.customerId);
                if (formData.quotationId && formData.quotationId !== "none") data.quotationId = parseInt(formData.quotationId);
                createMutation.mutate(data);
              }}
              disabled={createMutation.isPending || !formData.title || !formData.appointmentDate || !formData.customerId}
              data-testid="button-save-appointment"
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 me-1 animate-spin" />}
              {t("حفظ", "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {detailDialog && (
        <Dialog open={!!detailDialog} onOpenChange={() => setDetailDialog(null)}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" data-testid="dialog-appointment-detail">
            <DialogHeader>
              <DialogTitle>{detailDialog.title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge className={statusColors[detailDialog.status]}>
                  {t(statusLabels[detailDialog.status]?.ar || "", statusLabels[detailDialog.status]?.en || "")}
                </Badge>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                  <span>{new Date(detailDialog.appointmentDate + "T00:00:00").toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span>{detailDialog.startTime} - {detailDialog.endTime}</span>
                </div>
                {(() => {
                  const customer = customers.find((c: any) => c.id === detailDialog.customerId);
                  return customer ? (
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span>{customer.fullName} - {customer.phone}</span>
                    </div>
                  ) : null;
                })()}
                {detailDialog.notes && (
                  <div className="text-muted-foreground bg-muted/50 p-2 rounded text-xs">{detailDialog.notes}</div>
                )}
                {detailDialog.failReason && (
                  <div className="flex items-center gap-2 text-orange-600">
                    <AlertTriangle className="w-4 h-4" />
                    <span>{t(failReasonLabels[detailDialog.failReason]?.ar || "", failReasonLabels[detailDialog.failReason]?.en || "")}</span>
                  </div>
                )}
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              {detailDialog.status === "scheduled" && (
                <>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => navigate(`/site-survey/\${detailDialog.id}`)}
                    data-testid="button-start-survey"
                  >
                    <FileText className="w-4 h-4 me-1" />
                    {t("بدء الزيارة", "Start Survey")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setRescheduleData({
                        appointmentDate: "",
                        startTime: detailDialog.startTime,
                        endTime: detailDialog.endTime,
                        notes: "",
                      });
                      setRescheduleDialog(detailDialog);
                      setDetailDialog(null);
                    }}
                    data-testid="button-reschedule"
                  >
                    <RotateCcw className="w-4 h-4 me-1" />
                    {t("إعادة جدولة", "Reschedule")}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      setFailData({ failReason: "", failNotes: "" });
                      setFailDialog(detailDialog);
                      setDetailDialog(null);
                    }}
                    data-testid="button-cant-visit"
                  >
                    <XCircle className="w-4 h-4 me-1" />
                    {t("لم أتمكن من الزيارة", "Unable to Visit")}
                  </Button>
                </>
              )}
              {detailDialog.status === "attended" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/site-survey/\${detailDialog.id}`)}
                  data-testid="button-view-survey"
                >
                  <Eye className="w-4 h-4 me-1" />
                  {t("عرض نموذج الزيارة", "View Survey")}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {failDialog && (
        <Dialog open={!!failDialog} onOpenChange={() => setFailDialog(null)}>
          <DialogContent className="max-w-sm" data-testid="dialog-fail-reason">
            <DialogHeader>
              <DialogTitle>{t("سبب عدم الزيارة", "Reason for Not Visiting")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>{t("السبب", "Reason")}</Label>
                <Select
                  value={failData.failReason}
                  onValueChange={(v) => setFailData({ ...failData, failReason: v })}
                >
                  <SelectTrigger data-testid="select-fail-reason">
                    <SelectValue placeholder={t("اختر السبب", "Select reason")} />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(failReasonLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {t(label.ar, label.en)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("ملاحظات", "Notes")}</Label>
                <Textarea
                  value={failData.failNotes}
                  onChange={(e) => setFailData({ ...failData, failNotes: e.target.value })}
                  placeholder={t("تفاصيل إضافية", "Additional details")}
                  data-testid="input-fail-notes"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setFailDialog(null)}>
                {t("إلغاء", "Cancel")}
              </Button>
              <Button
                variant="destructive"
                disabled={!failData.failReason || updateMutation.isPending}
                onClick={() => {
                  const status = failData.failReason === "client_cancelled" ? "client_refused" : "no_show";
                  updateMutation.mutate({
                    id: failDialog.id,
                    data: {
                      status,
                      failReason: failData.failReason,
                      failNotes: failData.failNotes || null,
                    },
                  });
                }}
                data-testid="button-confirm-fail"
              >
                {updateMutation.isPending && <Loader2 className="w-4 h-4 me-1 animate-spin" />}
                {t("تأكيد", "Confirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {rescheduleDialog && (
        <Dialog open={!!rescheduleDialog} onOpenChange={() => setRescheduleDialog(null)}>
          <DialogContent className="max-w-sm" data-testid="dialog-reschedule">
            <DialogHeader>
              <DialogTitle>{t("إعادة جدولة الموعد", "Reschedule Appointment")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>{t("التاريخ الجديد", "New Date")}</Label>
                <Input
                  type="date"
                  value={rescheduleData.appointmentDate}
                  onChange={(e) => setRescheduleData({ ...rescheduleData, appointmentDate: e.target.value })}
                  data-testid="input-reschedule-date"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>{t("من", "From")}</Label>
                  <Input
                    type="time"
                    value={rescheduleData.startTime}
                    onChange={(e) => setRescheduleData({ ...rescheduleData, startTime: e.target.value })}
                    data-testid="input-reschedule-start"
                  />
                </div>
                <div>
                  <Label>{t("إلى", "To")}</Label>
                  <Input
                    type="time"
                    value={rescheduleData.endTime}
                    onChange={(e) => setRescheduleData({ ...rescheduleData, endTime: e.target.value })}
                    data-testid="input-reschedule-end"
                  />
                </div>
              </div>
              <div>
                <Label>{t("ملاحظات", "Notes")}</Label>
                <Textarea
                  value={rescheduleData.notes}
                  onChange={(e) => setRescheduleData({ ...rescheduleData, notes: e.target.value })}
                  data-testid="input-reschedule-notes"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRescheduleDialog(null)}>
                {t("إلغاء", "Cancel")}
              </Button>
              <Button
                disabled={!rescheduleData.appointmentDate || rescheduleMutation.isPending}
                onClick={() => {
                  rescheduleMutation.mutate({
                    id: rescheduleDialog.id,
                    data: rescheduleData,
                  });
                }}
                data-testid="button-confirm-reschedule"
              >
                {rescheduleMutation.isPending && <Loader2 className="w-4 h-4 me-1 animate-spin" />}
                {t("إعادة الجدولة", "Reschedule")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
