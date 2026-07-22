import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users, Clock, LogIn, LogOut, AlertTriangle, CheckCircle2, XCircle, MapPin,
  Pencil, Monitor, Factory, Building2, RefreshCw, Download, Filter, Map,
  ChevronDown, ChevronLeft, CalendarDays,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import AttendanceZonesMap from "@/components/attendance-zones-map";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

interface AttendanceRecord {
  id: number;
  employeeId: number | null;
  employeePhone: string | null;
  employeeNameAr: string | null;
  type: "check_in" | "check_out";
  checkTime: string;
  locationName: string | null;
  latitude: string | null;
  longitude: string | null;
  isOutOfZone: boolean;
  deviceInfo: Record<string, string> | null;
  deviceFingerprint: string | null;
  isManualEdit: boolean;
  editedBy: number | null;
  notes: string | null;
}

interface EmployeeInfo {
  id: number;
  employeeNumber: string;
  nameAr: string;
  phone: string | null;
  locationName: string;
}

interface MonitorData {
  records: AttendanceRecord[];
  permissions: unknown[];
  employees: EmployeeInfo[];
}

interface LocationZone {
  id: number;
  nameAr: string;
  type: string;
  isActive: boolean;
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function formatDate(ts: string) {
  return new Date(ts).toLocaleDateString("ar-SA", { weekday: "short", month: "short", day: "numeric" });
}

function getTodayRange() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { from: today.toISOString(), to: end.toISOString() };
}

function getDaysInRange(from: string, to: string): Date[] {
  const days: Date[] = [];
  const start = new Date(from); start.setHours(0, 0, 0, 0);
  const end = new Date(to); end.setHours(0, 0, 0, 0);
  const cur = new Date(start);
  let guard = 0;
  while (cur <= end && guard < 370) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
    guard++;
  }
  return days;
}

function recordsForDay(records: AttendanceRecord[], day: Date): AttendanceRecord[] {
  const start = new Date(day); start.setHours(0, 0, 0, 0);
  const end = new Date(day); end.setHours(23, 59, 59, 999);
  const s = start.getTime(), e = end.getTime();
  return records.filter(r => {
    const t = new Date(r.checkTime).getTime();
    return t >= s && t <= e;
  });
}

function formatDayShort(day: Date) {
  return day.toLocaleDateString("ar-SA", { weekday: "short", month: "short", day: "numeric" });
}

function getDayStatus(records: AttendanceRecord[], employeeId: number) {
  const empRecords = records.filter(r => r.employeeId === employeeId);
  if (!empRecords.length) return { status: "absent", in: null, out: null, duration: null, outOfZone: false };
  const checkIn = empRecords.filter(r => r.type === "check_in").sort((a, b) => new Date(a.checkTime).getTime() - new Date(b.checkTime).getTime())[0];
  const checkOut = empRecords.filter(r => r.type === "check_out").sort((a, b) => new Date(b.checkTime).getTime() - new Date(a.checkTime).getTime())[0];
  let status = "present";
  if (checkIn && !checkOut) status = "incomplete";
  if (!checkIn) status = checkOut ? "checkout_only" : "absent";
  let duration: string | null = null;
  if (checkIn && checkOut) {
    const mins = (new Date(checkOut.checkTime).getTime() - new Date(checkIn.checkTime).getTime()) / 60000;
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    duration = `${h}س ${m}د`;
  }
  const outOfZone = empRecords.some(r => r.isOutOfZone);
  return { status, in: checkIn, out: checkOut, duration, outOfZone };
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
    present: { label: "حاضر", icon: <CheckCircle2 className="w-3 h-3" />, className: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" },
    absent: { label: "غائب", icon: <XCircle className="w-3 h-3" />, className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
    incomplete: { label: "ناقص", icon: <AlertTriangle className="w-3 h-3" />, className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400" },
    checkout_only: { label: "خروج فقط", icon: <AlertTriangle className="w-3 h-3" />, className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400" },
    late: { label: "متأخر", icon: <Clock className="w-3 h-3" />, className: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400" },
  };
  const s = map[status] || { label: status, icon: null, className: "bg-muted text-muted-foreground" };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.className}`}>
      {s.icon}{s.label}
    </span>
  );
}

export default function AttendanceMonitorPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dateRange, setDateRange] = useState(getTodayRange());
  const [locationFilter, setLocationFilter] = useState("all");
  const [outOfZoneOnly, setOutOfZoneOnly] = useState(false);
  const [expandedEmployees, setExpandedEmployees] = useState<Set<number>>(new Set());
  const [editRecord, setEditRecord] = useState<AttendanceRecord | null>(null);
  const [editTime, setEditTime] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [locationPopup, setLocationPopup] = useState<{ lat: string; lng: string; name: string | null; isOutOfZone: boolean } | null>(null);
  const miniMapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!locationPopup || !miniMapRef.current) return;
    const lat = parseFloat(locationPopup.lat);
    const lng = parseFloat(locationPopup.lng);
    const mapsKey = import.meta.env.VITE_GOOGLE_MAPS_KEY as string;
    const container = miniMapRef.current;
    if (!mapsKey) {
      container.innerHTML = `<p class="text-muted-foreground text-xs p-4 text-center">مفتاح الخرائط غير مضبوط</p>`;
      return;
    }
    container.innerHTML = "";
    setOptions({ key: mapsKey, v: "weekly" });
    importLibrary("maps").then((mapsLib: google.maps.MapsLibrary) => {
      const map = new mapsLib.Map(container, {
        center: { lat, lng },
        zoom: 16,
        disableDefaultUI: true,
        zoomControl: true,
      });
      importLibrary("marker").then((markerLib: google.maps.MarkerLibrary) => {
        new markerLib.Marker({ position: { lat, lng }, map });
      }).catch(() => {
        new google.maps.Marker({ position: { lat, lng }, map });
      });
    }).catch(() => {
      container.innerHTML = `<p class="text-muted-foreground text-xs p-4 text-center">تعذّر تحميل الخريطة</p>`;
    });
  }, [locationPopup]);

  const { data, isLoading, refetch } = useQuery<MonitorData>({
    queryKey: ["/api/attendance/monitor", dateRange.from, dateRange.to],
    queryFn: () => {
      const params = new URLSearchParams({ from: dateRange.from, to: dateRange.to });
      return fetch(`/api/attendance/monitor?${params}`).then(r => r.json());
    },
    refetchInterval: 60000,
  });

  const { data: zones = [] } = useQuery<LocationZone[]>({
    queryKey: ["/api/attendance/zones"],
  });

  const { data: deviceReport = [] } = useQuery<{ fingerprint: string; employees: string[] }[]>({
    queryKey: ["/api/attendance/device-report"],
    refetchInterval: 120000,
  });

  const editMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: number; checkTime: string; notes: string }) =>
      apiRequest("PATCH", `/api/attendance/record/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/attendance/monitor"] });
      setEditRecord(null);
      toast({ title: "تم التعديل بنجاح" });
    },
  });

  const records = data?.records || [];
  const employees = data?.employees || [];

  const days = useMemo(() => getDaysInRange(dateRange.from, dateRange.to), [dateRange.from, dateRange.to]);
  const isMultiDay = days.length > 1;

  // Location options = active zones + any location names seen on employees/records
  const locationOptions = useMemo(() => {
    const set = new Set<string>();
    zones.filter(z => z.isActive !== false).forEach(z => z.nameAr && set.add(z.nameAr));
    employees.forEach(e => e.locationName && set.add(e.locationName));
    records.forEach(r => r.locationName && set.add(r.locationName));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ar"));
  }, [zones, employees, records]);

  // Does an employee belong to the selected location? (by home location OR by any record there)
  const employeeMatchesLocation = (e: EmployeeInfo) => {
    if (locationFilter === "all") return true;
    if (e.locationName === locationFilter) return true;
    return records.some(r => r.employeeId === e.id && r.locationName === locationFilter);
  };

  // Records filtered by selected location only (used for status/summary calculations)
  const locRecords = useMemo(() => {
    if (locationFilter === "all") return records;
    return records.filter(r => r.locationName === locationFilter);
  }, [records, locationFilter]);

  const filteredEmployees = useMemo(() => {
    let result = employees.filter(employeeMatchesLocation);
    if (outOfZoneOnly) result = result.filter(e => locRecords.some(r => r.employeeId === e.id && r.isOutOfZone));
    return result;
  }, [employees, locationFilter, outOfZoneOnly, records, locRecords]);

  // Records for the detailed records tab (location + out-of-zone filters)
  const filteredRecords = useMemo(() => {
    let result = locRecords;
    if (outOfZoneOnly) result = result.filter(r => r.isOutOfZone);
    return result;
  }, [locRecords, outOfZoneOnly]);

  const summary = useMemo(() => {
    let present = 0, absent = 0, incomplete = 0;
    if (isMultiDay) {
      // Sum statuses across employee × day
      filteredEmployees.forEach(emp => {
        days.forEach(day => {
          const dayRecs = recordsForDay(locRecords, day);
          const st = getDayStatus(dayRecs, emp.id).status;
          if (st === "present") present++;
          else if (st === "incomplete" || st === "checkout_only") incomplete++;
          else absent++;
        });
      });
    } else {
      present = filteredEmployees.filter(e => getDayStatus(locRecords, e.id).status === "present").length;
      absent = filteredEmployees.filter(e => getDayStatus(locRecords, e.id).status === "absent").length;
      incomplete = filteredEmployees.filter(e => ["incomplete", "checkout_only"].includes(getDayStatus(locRecords, e.id).status)).length;
    }
    const outOfZone = locRecords.filter(r => r.isOutOfZone).length;
    return { present, absent, incomplete, outOfZone, total: filteredEmployees.length };
  }, [locRecords, filteredEmployees, isMultiDay, days]);

  const handleSetToday = () => setDateRange(getTodayRange());
  const handleSetWeek = () => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    setDateRange({ from: start.toISOString(), to: end.toISOString() });
  };
  const handleSetMonth = () => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    setDateRange({ from: start.toISOString(), to: end.toISOString() });
  };

  const todayRange = getTodayRange();
  const isTodayActive = dateRange.from.split("T")[0] === todayRange.from.split("T")[0]
    && dateRange.to.split("T")[0] === todayRange.to.split("T")[0];

  const toggleExpand = (id: number) => {
    setExpandedEmployees(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const openEditDialog = (rec: AttendanceRecord) => {
    setEditRecord(rec);
    const dt = new Date(rec.checkTime);
    setEditTime(`${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`);
    setEditNotes(rec.notes || "");
  };

  const handleEdit = () => {
    if (!editRecord) return;
    const original = new Date(editRecord.checkTime);
    const [h, m] = editTime.split(":").map(Number);
    original.setHours(h, m, 0, 0);
    editMutation.mutate({ id: editRecord.id, checkTime: original.toISOString(), notes: editNotes });
  };

  const exportCSV = () => {
    const rows = [["اسم الموظف", "التاريخ", "وقت الدخول", "وقت الخروج", "المدة", "الموقع", "الحالة"]];
    filteredEmployees.forEach(emp => {
      days.forEach(day => {
        const dayRecs = recordsForDay(locRecords, day);
        const s = getDayStatus(dayRecs, emp.id);
        rows.push([
          emp.nameAr,
          day.toISOString().split("T")[0],
          s.in ? formatTime(s.in.checkTime) : "—",
          s.out ? formatTime(s.out.checkTime) : "—",
          s.duration || "—",
          (s.in?.locationName) || emp.locationName,
          s.status === "present" ? "حاضر" : s.status === "absent" ? "غائب" : s.status === "checkout_only" ? "خروج فقط" : "ناقص",
        ]);
      });
    });
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `تقرير_الدوام_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("مراقبة الدوام", "Attendance Monitor")}</h1>
          <p className="text-muted-foreground text-sm">{t("تتبع حضور وانصراف الموظفين", "Track employee attendance")}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-attendance">
            <RefreshCw className="w-4 h-4 me-1" />
            {t("تحديث", "Refresh")}
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} data-testid="button-export-attendance">
            <Download className="w-4 h-4 me-1" />
            {t("تصدير", "Export")}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center bg-muted/30 rounded-xl p-3">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <Button
          size="sm"
          variant={isTodayActive ? "default" : "outline"}
          onClick={handleSetToday}
          data-testid="button-filter-today"
        >
          اليوم
        </Button>
        <Button size="sm" variant="outline" onClick={handleSetWeek} data-testid="button-filter-week">
          آخر 7 أيام
        </Button>
        <Button size="sm" variant="outline" onClick={handleSetMonth} data-testid="button-filter-month">
          آخر 30 يوم
        </Button>
        <div className="flex gap-1 items-center">
          <Input
            type="date"
            value={dateRange.from.split("T")[0]}
            onChange={e => {
              const v = e.target.value;
              if (!v) return;
              const d = new Date(v + "T00:00:00");
              if (isNaN(d.getTime())) return;
              setDateRange(prev => ({ ...prev, from: d.toISOString() }));
            }}
            className="h-8 text-xs w-32"
            data-testid="input-filter-from"
          />
          <span className="text-muted-foreground text-xs">إلى</span>
          <Input
            type="date"
            value={dateRange.to.split("T")[0]}
            onChange={e => {
              const v = e.target.value;
              if (!v) return;
              const d = new Date(v + "T23:59:59");
              if (isNaN(d.getTime())) return;
              setDateRange(prev => ({ ...prev, to: d.toISOString() }));
            }}
            className="h-8 text-xs w-32"
            data-testid="input-filter-to"
          />
        </div>
        <Select value={locationFilter} onValueChange={setLocationFilter}>
          <SelectTrigger className="h-8 w-36 text-xs" data-testid="select-filter-location">
            <SelectValue placeholder="الموقع" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع المواقع</SelectItem>
            {locationOptions.map(loc => (
              <SelectItem key={loc} value={loc} data-testid={`option-location-${loc}`}>{loc}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant={outOfZoneOnly ? "destructive" : "outline"}
          onClick={() => setOutOfZoneOnly(v => !v)}
          data-testid="button-filter-out-of-zone"
          className="gap-1"
        >
          <MapPin className="w-3.5 h-3.5" />
          خارج النطاق فقط
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card data-testid="card-present-count">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">{summary.present}</p>
              <p className="text-xs text-muted-foreground">حاضر</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-absent-count">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center">
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{summary.absent}</p>
              <p className="text-xs text-muted-foreground">غائب</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-incomplete-count">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-950 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-yellow-600">{summary.incomplete}</p>
              <p className="text-xs text-muted-foreground">ناقص</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-outofzone-count">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-950 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-orange-600">{summary.outOfZone}</p>
              <p className="text-xs text-muted-foreground">خارج النطاق</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="daily">
        <TabsList className="mb-4 flex-wrap h-auto gap-1">
          <TabsTrigger value="daily" data-testid="tab-daily">
            <Users className="w-4 h-4 me-1" />
            الحضور اليومي
          </TabsTrigger>
          <TabsTrigger value="records" data-testid="tab-records">
            <Clock className="w-4 h-4 me-1" />
            السجلات التفصيلية
          </TabsTrigger>
          <TabsTrigger value="zones" data-testid="tab-zones">
            <Map className="w-4 h-4 me-1" />
            مناطق الدوام
          </TabsTrigger>
          {deviceReport.length > 0 && (
            <TabsTrigger value="devices" data-testid="tab-devices">
              <Monitor className="w-4 h-4 me-1" />
              أجهزة مشتركة
              <span className="ms-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center">
                {deviceReport.length}
              </span>
            </TabsTrigger>
          )}
        </TabsList>

        {/* Daily Summary Tab */}
        <TabsContent value="daily">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-muted-foreground" />
                {isMultiDay
                  ? `حالة الموظفين — ${formatDate(dateRange.from)} ← ${formatDate(dateRange.to)} (${days.length} يوم)`
                  : `حالة الموظفين - ${formatDate(dateRange.from)}`}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground animate-pulse">جاري التحميل...</div>
              ) : filteredEmployees.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">لا يوجد موظفون مطابقون للتصفية</div>
              ) : isMultiDay ? (
                <div className="divide-y" data-testid="list-multiday-employees">
                  {filteredEmployees.map(emp => {
                    const empDays = days.map(day => ({ day, s: getDayStatus(recordsForDay(locRecords, day), emp.id) }));
                    const presentDays = empDays.filter(d => d.s.status === "present").length;
                    const incompleteDays = empDays.filter(d => ["incomplete", "checkout_only"].includes(d.s.status)).length;
                    const absentDays = empDays.filter(d => d.s.status === "absent").length;
                    const expanded = expandedEmployees.has(emp.id);
                    return (
                      <div key={emp.id} data-testid={`row-employee-${emp.id}`}>
                        <button
                          onClick={() => toggleExpand(emp.id)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-right hover:bg-muted/20 transition-colors"
                          data-testid={`button-expand-employee-${emp.id}`}
                        >
                          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronLeft className="w-4 h-4 text-muted-foreground shrink-0" />}
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                            {emp.nameAr[0]}
                          </div>
                          <div className="flex-1 min-w-0 text-right">
                            <p className="font-medium truncate">{emp.nameAr}</p>
                            <p className="text-xs text-muted-foreground">{emp.locationName}</p>
                          </div>
                          <div className="flex items-center gap-2 text-xs shrink-0">
                            <span className="inline-flex items-center gap-1 text-green-600" title="أيام الحضور"><CheckCircle2 className="w-3.5 h-3.5" />{presentDays}</span>
                            <span className="inline-flex items-center gap-1 text-yellow-600" title="أيام ناقصة"><AlertTriangle className="w-3.5 h-3.5" />{incompleteDays}</span>
                            <span className="inline-flex items-center gap-1 text-red-600" title="أيام الغياب"><XCircle className="w-3.5 h-3.5" />{absentDays}</span>
                          </div>
                        </button>
                        {expanded && (
                          <div className="overflow-x-auto bg-muted/10 border-t">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-right text-xs text-muted-foreground">
                                  <th className="px-4 py-2 font-medium">اليوم</th>
                                  <th className="px-4 py-2 font-medium">الدخول</th>
                                  <th className="px-4 py-2 font-medium">الخروج</th>
                                  <th className="px-4 py-2 font-medium">المدة</th>
                                  <th className="px-4 py-2 font-medium">الموقع</th>
                                  <th className="px-4 py-2 font-medium">الحالة</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {empDays.map(({ day, s }) => (
                                  <tr key={day.toISOString()} className="hover:bg-muted/20" data-testid={`row-day-${emp.id}-${day.toISOString().split("T")[0]}`}>
                                    <td className="px-4 py-2 whitespace-nowrap">{formatDayShort(day)}</td>
                                    <td className="px-4 py-2">
                                      {s.in ? (
                                        <span className="inline-flex items-center gap-1">
                                          <LogIn className="w-3.5 h-3.5 text-green-500" />{formatTime(s.in.checkTime)}
                                          {s.in.isManualEdit && <Pencil className="w-3 h-3 text-muted-foreground" />}
                                        </span>
                                      ) : <span className="text-muted-foreground">—</span>}
                                    </td>
                                    <td className="px-4 py-2">
                                      {s.out ? (
                                        <span className="inline-flex items-center gap-1">
                                          <LogOut className="w-3.5 h-3.5 text-orange-500" />{formatTime(s.out.checkTime)}
                                          {s.out.isManualEdit && <Pencil className="w-3 h-3 text-muted-foreground" />}
                                        </span>
                                      ) : <span className="text-muted-foreground">—</span>}
                                    </td>
                                    <td className="px-4 py-2 font-mono">{s.duration || "—"}</td>
                                    <td className="px-4 py-2 text-xs text-muted-foreground">
                                      {s.in?.locationName || "—"}
                                      {s.outOfZone && <MapPin className="w-3 h-3 text-orange-500 inline ms-1" />}
                                    </td>
                                    <td className="px-4 py-2"><StatusBadge status={s.status} /></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30 text-right">
                        <th className="px-4 py-3 font-medium">الموظف</th>
                        <th className="px-4 py-3 font-medium">الموقع</th>
                        <th className="px-4 py-3 font-medium">الدخول</th>
                        <th className="px-4 py-3 font-medium">الخروج</th>
                        <th className="px-4 py-3 font-medium">المدة</th>
                        <th className="px-4 py-3 font-medium">الحالة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredEmployees.map(emp => {
                        const s = getDayStatus(locRecords, emp.id);
                        return (
                          <tr key={emp.id} className="hover:bg-muted/20 transition-colors" data-testid={`row-employee-${emp.id}`}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                                  {emp.nameAr[0]}
                                </div>
                                <div>
                                  <p className="font-medium">{emp.nameAr}</p>
                                  <p className="text-xs text-muted-foreground">{emp.employeeNumber}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {!s.in ? (
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  {emp.locationName === "معرض" ? <Building2 className="w-3.5 h-3.5" /> : <Factory className="w-3.5 h-3.5" />}
                                  <span className="text-xs">{emp.locationName}</span>
                                </div>
                              ) : !s.in.latitude ? (
                                <span className="text-muted-foreground text-xs flex items-center gap-1">
                                  <MapPin className="w-3.5 h-3.5" />
                                  ➖ بلا موقع
                                </span>
                              ) : s.in.isOutOfZone ? (
                                <button
                                  className="flex items-center gap-1 text-orange-600 text-xs hover:underline"
                                  onClick={() => s.in?.latitude && s.in?.longitude && setLocationPopup({
                                    lat: s.in.latitude,
                                    lng: s.in.longitude,
                                    name: s.in.locationName,
                                    isOutOfZone: true,
                                  })}
                                  data-testid={`button-daily-location-${emp.id}`}
                                >
                                  <MapPin className="w-3.5 h-3.5" />
                                  خارج النطاق ⚠️
                                </button>
                              ) : (
                                <button
                                  className="flex items-center gap-1 text-green-600 text-xs hover:underline"
                                  onClick={() => s.in?.latitude && s.in?.longitude && setLocationPopup({
                                    lat: s.in.latitude,
                                    lng: s.in.longitude,
                                    name: s.in.locationName,
                                    isOutOfZone: false,
                                  })}
                                  data-testid={`button-daily-location-in-${emp.id}`}
                                >
                                  <MapPin className="w-3.5 h-3.5" />
                                  {s.in.locationName || "✅ داخل النطاق"}
                                </button>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {s.in ? (
                                <div className="flex items-center gap-1">
                                  <LogIn className="w-3.5 h-3.5 text-green-500" />
                                  <span>{formatTime(s.in.checkTime)}</span>
                                  {s.in.isManualEdit && <Pencil className="w-3 h-3 text-muted-foreground" />}
                                  {s.in.isOutOfZone && <span title="خارج النطاق"><MapPin className="w-3 h-3 text-orange-500" /></span>}
                                </div>
                              ) : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              {s.out ? (
                                <div className="flex items-center gap-1">
                                  <LogOut className="w-3.5 h-3.5 text-orange-500" />
                                  <span>{formatTime(s.out.checkTime)}</span>
                                  {s.out.isManualEdit && <Pencil className="w-3 h-3 text-muted-foreground" />}
                                </div>
                              ) : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-4 py-3 font-mono text-sm">{s.duration || "—"}</td>
                            <td className="px-4 py-3">
                              <StatusBadge status={s.status} />
                              {s.outOfZone && (
                                <span className="ms-1" title="بصمة خارج النطاق">
                                  <MapPin className="w-3.5 h-3.5 text-orange-500 inline" />
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Detailed Records Tab */}
        <TabsContent value="records">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                السجلات التفصيلية ({filteredRecords.length})
                {outOfZoneOnly && <span className="ms-2 text-xs font-normal text-orange-600">• خارج النطاق فقط</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-right">
                      <th className="px-4 py-3 font-medium">الموظف</th>
                      <th className="px-4 py-3 font-medium">النوع</th>
                      <th className="px-4 py-3 font-medium">التاريخ والوقت</th>
                      <th className="px-4 py-3 font-medium">الموقع</th>
                      <th className="px-4 py-3 font-medium">الجهاز</th>
                      <th className="px-4 py-3 font-medium">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredRecords.map(rec => (
                      <tr key={rec.id} className="hover:bg-muted/20" data-testid={`row-record-${rec.id}`}>
                        <td className="px-4 py-3">
                          <p className="font-medium">{rec.employeeNameAr || rec.employeePhone || `#${rec.employeeId}`}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {rec.type === "check_in"
                              ? <><LogIn className="w-4 h-4 text-green-500" /><span className="text-green-600">دخول</span></>
                              : <><LogOut className="w-4 h-4 text-orange-500" /><span className="text-orange-600">خروج</span></>
                            }
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p>{formatDate(rec.checkTime)}</p>
                          <p className="text-muted-foreground text-xs font-mono">{formatTime(rec.checkTime)}</p>
                          {rec.isManualEdit && <Badge variant="outline" className="text-[9px] h-4 mt-0.5">تعديل يدوي</Badge>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 flex-wrap">
                            {rec.isOutOfZone ? (
                              <span className="inline-flex items-center gap-0.5 text-orange-600 text-xs font-medium">
                                <MapPin className="w-3.5 h-3.5" />
                                خارج النطاق ⚠️
                              </span>
                            ) : rec.latitude && rec.longitude ? (
                              <span className="inline-flex items-center gap-0.5 text-green-600 text-xs">
                                <MapPin className="w-3.5 h-3.5" />
                                {rec.locationName || "داخل النطاق"}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">{rec.locationName || "—"}</span>
                            )}
                          </div>
                          {rec.latitude && rec.longitude && (
                            <button
                              onClick={() => setLocationPopup({
                                lat: rec.latitude!,
                                lng: rec.longitude!,
                                name: rec.locationName,
                                isOutOfZone: rec.isOutOfZone,
                              })}
                              className="text-xs text-primary hover:underline mt-0.5"
                              data-testid={`button-show-location-${rec.id}`}
                            >
                              عرض الموقع الدقيق
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {rec.deviceInfo?.type && <p>{rec.deviceInfo.type} · {rec.deviceInfo.browser}</p>}
                          {rec.deviceInfo?.os && <p>{rec.deviceInfo.os}</p>}
                          {rec.notes && <p className="text-orange-600 mt-0.5">{rec.notes}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <Button size="sm" variant="ghost" onClick={() => openEditDialog(rec)} data-testid={`button-edit-record-${rec.id}`}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {filteredRecords.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                        {outOfZoneOnly ? "لا توجد بصمات خارج النطاق في هذه الفترة" : "لا توجد سجلات في هذه الفترة"}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Zones Management Tab */}
        <TabsContent value="zones">
          <Card>
            <CardContent className="p-4 md:p-6">
              <AttendanceZonesMap />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Shared Devices Tab */}
        {deviceReport.length > 0 && (
          <TabsContent value="devices">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-red-600">
                  <AlertTriangle className="w-5 h-5" />
                  تحذير: أجهزة مشتركة بين موظفين
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {deviceReport.map((item, i) => (
                    <div key={i} className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-4" data-testid={`alert-shared-device-${i}`}>
                      <p className="text-sm font-medium text-red-700 dark:text-red-400 mb-2">
                        جهاز واحد استُخدم لتسجيل {item.employees.length} موظفين في نفس اليوم
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {item.employees.map((name, j) => (
                          <Badge key={j} variant="destructive">{name}</Badge>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2 font-mono">بصمة الجهاز: {item.fingerprint.slice(0, 12)}...</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Location Mini-Map Popup */}
      <Dialog open={!!locationPopup} onOpenChange={open => !open && setLocationPopup(null)}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className={`w-4 h-4 ${locationPopup?.isOutOfZone ? "text-orange-500" : "text-green-500"}`} />
              {locationPopup?.isOutOfZone ? "موقع خارج النطاق الجغرافي" : "موقع البصمة"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {locationPopup?.isOutOfZone && (
              <div className="flex items-center gap-2 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 rounded-lg px-3 py-2 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>هذه البصمة سُجّلت من موقع خارج نطاقات الدوام المحددة</span>
              </div>
            )}
            {locationPopup?.name && (
              <p className="text-sm"><span className="font-medium">الموقع:</span> {locationPopup.name}</p>
            )}
            <div ref={miniMapRef} className="w-full rounded-lg overflow-hidden border min-h-[220px] bg-muted/20 flex items-center justify-center">
              <p className="text-muted-foreground text-xs animate-pulse">جاري تحميل الخريطة...</p>
            </div>
            <div className="flex justify-between items-center">
              <p className="text-xs text-muted-foreground font-mono">
                {locationPopup?.lat}, {locationPopup?.lng}
              </p>
              <a
                href={`https://maps.google.com/?q=${locationPopup?.lat},${locationPopup?.lng}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary hover:underline"
              >
                فتح في Google Maps
              </a>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Record Dialog */}
      <Dialog open={!!editRecord} onOpenChange={open => !open && setEditRecord(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل سجل الحضور</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-muted/30 rounded-lg p-3 text-sm">
              <p><span className="font-medium">الموظف:</span> {editRecord?.employeeNameAr}</p>
              <p><span className="font-medium">النوع:</span> {editRecord?.type === "check_in" ? "دخول" : "خروج"}</p>
              <p><span className="font-medium">التاريخ:</span> {editRecord && formatDate(editRecord.checkTime)}</p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">الوقت المعدَّل</label>
              <Input
                type="time"
                value={editTime}
                onChange={e => setEditTime(e.target.value)}
                data-testid="input-edit-time"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">ملاحظة (سبب التعديل)</label>
              <Textarea
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                placeholder="اكتب سبب التعديل..."
                data-testid="input-edit-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRecord(null)}>إلغاء</Button>
            <Button onClick={handleEdit} disabled={editMutation.isPending} data-testid="button-save-edit">
              {editMutation.isPending ? "جاري الحفظ..." : "حفظ التعديل"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
