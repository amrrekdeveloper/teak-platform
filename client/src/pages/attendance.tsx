import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Fingerprint, LogIn, LogOut, Clock, CheckCircle2, AlertCircle, ChevronRight,
  Building2, Factory, MapPin, Calendar, RotateCcw, FileText, Shield,
} from "lucide-react";
import teakLogo from "@assets/TEAK-LOGO_(1)_(1)_1772710617816.png";

type Step = "password" | "lookup" | "action" | "fingerprint" | "success" | "history";

interface EmployeeInfo {
  id: number;
  employeeNumber: string;
  nameAr: string;
  phone: string;
  locationName: string;
  attendanceEnabled: boolean;
  lastRecord: { type: string; checkTime: string } | null;
}

interface AttendanceRecord {
  id: number;
  type: "check_in" | "check_out";
  checkTime: string;
  locationName: string | null;
  isOutOfZone: boolean;
  isManualEdit: boolean;
}

function getDeviceInfo() {
  const ua = navigator.userAgent;
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(ua);
  const isTablet = /iPad|Tablet/i.test(ua);
  const browser = ua.includes("Chrome") ? "Chrome" : ua.includes("Safari") ? "Safari" : ua.includes("Firefox") ? "Firefox" : "Unknown";
  const os = ua.includes("Windows") ? "Windows" : ua.includes("Mac") ? "macOS" : ua.includes("Android") ? "Android" : ua.includes("iPhone") || ua.includes("iPad") ? "iOS" : "Linux";
  return { ua, type: isTablet ? "tablet" : isMobile ? "mobile" : "desktop", browser, os };
}

function getCanvasFingerprint(): string {
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return "no-canvas";
    ctx.textBaseline = "top";
    ctx.font = "14px Arial";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("تيك للتصنيع 2024", 2, 15);
    ctx.fillStyle = "rgba(102,204,0,0.7)";
    ctx.fillText("attendance", 4, 45);
    const data = canvas.toDataURL();
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = (hash << 5) - hash + data.charCodeAt(i);
      hash |= 0;
    }
    return String(Math.abs(hash));
  } catch { return "error"; }
}

function FingerprintAnimation({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<"idle" | "scanning" | "done">("idle");
  const [touched, setTouched] = useState(false);

  const handleTouch = useCallback(() => {
    if (phase !== "idle") return;
    setTouched(true);
    setPhase("scanning");
    setTimeout(() => {
      setPhase("done");
      setTimeout(onComplete, 800);
    }, 2000);
  }, [phase, onComplete]);

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <p className="text-lg font-medium text-center text-foreground">
        {phase === "idle" ? "ضع إصبعك على البصمة للتسجيل" : phase === "scanning" ? "جاري التحقق..." : "تم التحقق بنجاح ✓"}
      </p>

      <div
        className={`relative w-40 h-40 rounded-full flex items-center justify-center cursor-pointer select-none transition-all duration-300 ${
          phase === "idle" ? "bg-primary/10 hover:bg-primary/20 active:scale-95" :
          phase === "scanning" ? "bg-primary/20" : "bg-green-500/20"
        }`}
        onMouseDown={handleTouch}
        onTouchStart={handleTouch}
        data-testid="button-fingerprint"
      >
        {/* Pulse rings */}
        {phase === "scanning" && (
          <>
            {[0, 1, 2].map(i => (
              <motion.div
                key={i}
                className="absolute inset-0 rounded-full border-2 border-primary/40"
                initial={{ scale: 1, opacity: 0.6 }}
                animate={{ scale: 1.8 + i * 0.3, opacity: 0 }}
                transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.4, ease: "easeOut" }}
              />
            ))}
          </>
        )}
        <motion.div
          animate={phase === "scanning" ? { scale: [1, 1.05, 1] } : {}}
          transition={{ repeat: Infinity, duration: 0.8 }}
        >
          {phase === "done" ? (
            <CheckCircle2 className="w-20 h-20 text-green-500" />
          ) : (
            <Fingerprint
              className={`w-20 h-20 transition-colors ${
                phase === "scanning" ? "text-primary" : touched ? "text-primary" : "text-muted-foreground"
              }`}
            />
          )}
        </motion.div>
      </div>

      {phase === "scanning" && (
        <motion.div className="w-48 h-1.5 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-primary rounded-full"
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: 2, ease: "easeInOut" }}
          />
        </motion.div>
      )}
    </div>
  );
}

function AttendanceStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    present: { label: "حاضر", variant: "default" },
    late: { label: "متأخر", variant: "secondary" },
    absent: { label: "غائب", variant: "destructive" },
    incomplete: { label: "ناقص", variant: "outline" },
    permission: { label: "إذن", variant: "secondary" },
  };
  const s = map[status] || { label: status, variant: "outline" as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function formatDate(ts: string) {
  return new Date(ts).toLocaleDateString("ar-SA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function groupRecordsByDay(records: AttendanceRecord[]) {
  const map = new Map<string, AttendanceRecord[]>();
  records.forEach(r => {
    const day = new Date(r.checkTime).toISOString().split("T")[0];
    const arr = map.get(day) || [];
    arr.push(r);
    map.set(day, arr);
  });
  return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
}

function getDayStatus(records: AttendanceRecord[]) {
  if (!records.length) return "absent";
  const hasIn = records.some(r => r.type === "check_in");
  const hasOut = records.some(r => r.type === "check_out");
  if (!hasIn) return "absent";
  if (hasIn && !hasOut) return "incomplete";
  return "present";
}

export default function AttendancePage() {
  const [step, setStep] = useState<Step>("password");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [employee, setEmployee] = useState<EmployeeInfo | null>(null);
  const [actionType, setActionType] = useState<"check_in" | "check_out">("check_in");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [permissionDialog, setPermissionDialog] = useState(false);
  const [permReason, setPermReason] = useState("");
  const [permType, setPermType] = useState("permission");
  const [permHours, setPermHours] = useState("1");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();
  const deviceInfo = useRef(getDeviceInfo());
  const deviceFingerprint = useRef(getCanvasFingerprint());

  const { data: employeesList = [] } = useQuery<EmployeeInfo[]>({
    queryKey: ["/api/attendance/employees-list"],
    enabled: step === "lookup",
  });

  const { data: myRecords = [] } = useQuery<AttendanceRecord[]>({
    queryKey: ["/api/attendance/my-records", employee?.id, historyFrom, historyTo],
    queryFn: () => {
      const params = new URLSearchParams();
      if (employee?.id) params.set("employeeId", String(employee.id));
      else if (employee?.phone) params.set("employeePhone", employee.phone);
      if (historyFrom) params.set("from", new Date(historyFrom).toISOString());
      if (historyTo) {
        const to = new Date(historyTo);
        to.setHours(23, 59, 59);
        params.set("to", to.toISOString());
      }
      return fetch(`/api/attendance/my-records?${params}`).then(r => r.json());
    },
    enabled: step === "history" && !!employee,
  });

  const verifyMutation = useMutation({
    mutationFn: (pwd: string) => apiRequest("POST", "/api/attendance/verify-password", { password: pwd }),
    onSuccess: () => setStep("lookup"),
    onError: () => toast({ title: "كلمة المرور خاطئة", description: "أدخل كلمة المرور الصحيحة", variant: "destructive" }),
  });

  const lookupMutation = useMutation({
    mutationFn: (ph: string) => fetch(`/api/attendance/employee-lookup?phone=${ph}`).then(async r => { if (!r.ok) throw new Error((await r.json()).message); return r.json(); }),
    onSuccess: (data: EmployeeInfo) => {
      setEmployee(data);
      const nextType = data.lastRecord?.type === "check_in" ? "check_out" : "check_in";
      setActionType(nextType);
      setStep("action");
    },
    onError: (err: Error) => toast({ title: "خطأ", description: err.message, variant: "destructive" }),
  });

  const recordMutation = useMutation({
    mutationFn: (data: object) => apiRequest("POST", "/api/attendance/record", data),
    onSuccess: () => {
      setStep("success");
      qc.invalidateQueries({ queryKey: ["/api/attendance/my-records"] });
    },
    onError: () => toast({ title: "خطأ", description: "تعذّر تسجيل الحضور", variant: "destructive" }),
  });

  const permMutation = useMutation({
    mutationFn: (data: object) => apiRequest("POST", "/api/attendance/permission", data),
    onSuccess: () => {
      setPermissionDialog(false);
      toast({ title: "تم إرسال طلب الاستئذان", description: "تمت الموافقة تلقائياً" });
    },
  });

  const handleSelectEmployee = useCallback((empId: string) => {
    setSelectedEmployeeId(empId);
    const emp = employeesList.find(e => String(e.id) === empId);
    if (!emp) return;
    setEmployee(emp);
    const nextType = emp.lastRecord?.type === "check_in" ? "check_out" : "check_in";
    setActionType(nextType);
    setStep("action");
  }, [employeesList]);

  const requestLocation = useCallback(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setLocation(null),
        { timeout: 5000 }
      );
    }
  }, []);

  const handleProceedToFingerprint = useCallback(() => {
    requestLocation();
    setStep("fingerprint");
  }, [requestLocation]);

  const handleFingerprintComplete = useCallback(() => {
    if (!employee) return;
    recordMutation.mutate({
      employeeId: employee.id,
      employeePhone: employee.phone,
      employeeNameAr: employee.nameAr,
      type: actionType,
      locationName: employee.locationName,
      latitude: location?.lat ?? null,
      longitude: location?.lng ?? null,
      deviceInfo: deviceInfo.current,
      deviceFingerprint: deviceFingerprint.current,
    });
  }, [employee, actionType, location, recordMutation]);

  const handleReset = useCallback(() => {
    setStep("lookup");
    setEmployee(null);
    setPhone("");
    setSelectedEmployeeId("");
    setLocation(null);
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      {/* Header */}
      <div className="bg-primary text-primary-foreground py-4 px-6 flex items-center gap-3 shadow-md">
        <img src={teakLogo} alt="Teak" className="w-10 h-10 object-contain brightness-0 invert" />
        <div>
          <h1 className="font-bold text-lg leading-tight">نظام مراقبة الدوام</h1>
          <p className="text-primary-foreground/70 text-sm">تيك للتصنيع والتجارة</p>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <Shield className="w-5 h-5 opacity-60" />
          <span className="text-sm opacity-70">بوابة الموظفين</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <AnimatePresence mode="wait">

            {/* Step 1: Password */}
            {step === "password" && (
              <motion.div key="password" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                <div className="bg-card border rounded-2xl p-8 shadow-lg space-y-6">
                  <div className="text-center space-y-2">
                    <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto">
                      <Shield className="w-8 h-8 text-primary" />
                    </div>
                    <h2 className="text-2xl font-bold">تسجيل الدوام</h2>
                    <p className="text-muted-foreground text-sm">أدخل كلمة المرور للمتابعة</p>
                  </div>
                  <div className="space-y-3">
                    <Input
                      type="password"
                      placeholder="كلمة المرور"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && verifyMutation.mutate(password)}
                      className="text-center text-2xl tracking-widest h-14"
                      data-testid="input-attendance-password"
                    />
                    <Button
                      className="w-full h-12 text-base"
                      onClick={() => verifyMutation.mutate(password)}
                      disabled={verifyMutation.isPending || !password}
                      data-testid="button-attendance-login"
                    >
                      {verifyMutation.isPending ? "جاري التحقق..." : "دخول"}
                      <ChevronRight className="w-4 h-4 ms-1" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 2: Lookup */}
            {step === "lookup" && (
              <motion.div key="lookup" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                <div className="bg-card border rounded-2xl p-8 shadow-lg space-y-6">
                  <div className="text-center space-y-2">
                    <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto">
                      <Fingerprint className="w-8 h-8 text-primary" />
                    </div>
                    <h2 className="text-xl font-bold">تعريف الموظف</h2>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">ابحث برقم الجوال</label>
                      <div className="flex gap-2">
                        <Input
                          type="tel"
                          placeholder="05XXXXXXXX"
                          value={phone}
                          onChange={e => setPhone(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && phone && lookupMutation.mutate(phone)}
                          className="text-center"
                          data-testid="input-attendance-phone"
                        />
                        <Button
                          onClick={() => phone && lookupMutation.mutate(phone)}
                          disabled={lookupMutation.isPending || !phone}
                          data-testid="button-attendance-lookup"
                        >
                          {lookupMutation.isPending ? "..." : "بحث"}
                        </Button>
                      </div>
                      {lookupMutation.isError && (
                        <p className="text-destructive text-sm text-center flex items-center gap-1 justify-center">
                          <AlertCircle className="w-4 h-4" />
                          {(lookupMutation.error as Error).message}
                        </p>
                      )}
                    </div>

                    <div className="relative">
                      <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
                      <div className="relative flex justify-center text-xs text-muted-foreground"><span className="bg-card px-2">أو اختر من القائمة</span></div>
                    </div>

                    <Select value={selectedEmployeeId} onValueChange={handleSelectEmployee}>
                      <SelectTrigger className="w-full" data-testid="select-attendance-employee">
                        <SelectValue placeholder="اختر اسمك من القائمة" />
                      </SelectTrigger>
                      <SelectContent>
                        {employeesList.map(emp => (
                          <SelectItem key={emp.id} value={String(emp.id)} data-testid={`option-employee-${emp.id}`}>
                            <div className="flex items-center gap-2">
                              <span>{emp.nameAr}</span>
                              <span className="text-muted-foreground text-xs">
                                {emp.locationName === "معرض" ? <Building2 className="w-3 h-3 inline" /> : <Factory className="w-3 h-3 inline" />}
                                {" "}{emp.locationName}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 3: Action */}
            {step === "action" && employee && (
              <motion.div key="action" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                <div className="bg-card border rounded-2xl p-8 shadow-lg space-y-6">
                  {/* Employee Card */}
                  <div className="bg-primary/5 rounded-xl p-4 flex items-center gap-3">
                    <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center text-xl font-bold text-primary">
                      {employee.nameAr[0]}
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-lg">{employee.nameAr}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {employee.locationName === "معرض" ? <Building2 className="w-3.5 h-3.5" /> : <Factory className="w-3.5 h-3.5" />}
                        <span>{employee.locationName}</span>
                        <span>·</span>
                        <span>{employee.employeeNumber}</span>
                      </div>
                    </div>
                  </div>

                  {/* Last record */}
                  {employee.lastRecord && (
                    <div className="text-center text-sm text-muted-foreground">
                      آخر تسجيل: <span className="font-medium text-foreground">
                        {employee.lastRecord.type === "check_in" ? "دخول" : "خروج"}
                      </span> في {formatTime(employee.lastRecord.checkTime)}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      className={`rounded-xl p-5 flex flex-col items-center gap-2 border-2 transition-all ${
                        actionType === "check_in"
                          ? "border-green-500 bg-green-500/10 text-green-600"
                          : "border-border bg-muted/30 text-muted-foreground hover:border-green-300"
                      }`}
                      onClick={() => setActionType("check_in")}
                      data-testid="button-check-in"
                    >
                      <LogIn className="w-8 h-8" />
                      <span className="font-bold">تسجيل دخول</span>
                    </button>
                    <button
                      className={`rounded-xl p-5 flex flex-col items-center gap-2 border-2 transition-all ${
                        actionType === "check_out"
                          ? "border-orange-500 bg-orange-500/10 text-orange-600"
                          : "border-border bg-muted/30 text-muted-foreground hover:border-orange-300"
                      }`}
                      onClick={() => setActionType("check_out")}
                      data-testid="button-check-out"
                    >
                      <LogOut className="w-8 h-8" />
                      <span className="font-bold">تسجيل خروج</span>
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <Button className="flex-1 h-12 text-base" onClick={handleProceedToFingerprint} data-testid="button-proceed-fingerprint">
                      متابعة للبصمة
                      <Fingerprint className="w-5 h-5 ms-2" />
                    </Button>
                    <Button variant="outline" onClick={handleReset} data-testid="button-reset-lookup">
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="flex justify-between">
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground underline"
                      onClick={() => { setStep("history"); }}
                      data-testid="link-view-history"
                    >
                      عرض سجل حضوري
                    </button>
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground underline"
                      onClick={() => setPermissionDialog(true)}
                      data-testid="link-request-permission"
                    >
                      طلب استئذان
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 4: Fingerprint */}
            {step === "fingerprint" && (
              <motion.div key="fingerprint" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
                <div className="bg-card border rounded-2xl p-8 shadow-lg space-y-4">
                  <div className="text-center">
                    <h2 className="text-xl font-bold">
                      {actionType === "check_in" ? "تسجيل دخول" : "تسجيل خروج"}
                    </h2>
                    <p className="text-muted-foreground text-sm mt-1">{employee?.nameAr}</p>
                  </div>
                  {location && (
                    <div className="flex items-center justify-center gap-1.5 text-xs text-green-600 bg-green-50 dark:bg-green-950/30 rounded-lg py-2">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>تم تحديد موقعك الجغرافي</span>
                    </div>
                  )}
                  <FingerprintAnimation onComplete={handleFingerprintComplete} />
                  {recordMutation.isPending && (
                    <p className="text-center text-sm text-muted-foreground animate-pulse">جاري حفظ البيانات...</p>
                  )}
                </div>
              </motion.div>
            )}

            {/* Step 5: Success */}
            {step === "success" && (
              <motion.div key="success" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                <div className="bg-card border rounded-2xl p-8 shadow-lg space-y-6 text-center">
                  <motion.div
                    className="w-24 h-24 bg-green-500/10 rounded-full flex items-center justify-center mx-auto"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 15 }}
                  >
                    <CheckCircle2 className="w-14 h-14 text-green-500" />
                  </motion.div>
                  <div>
                    <h2 className="text-2xl font-bold text-green-600">
                      {actionType === "check_in" ? "تم تسجيل الدخول" : "تم تسجيل الخروج"}
                    </h2>
                    <p className="text-muted-foreground mt-1">{employee?.nameAr}</p>
                    <p className="text-lg font-mono font-medium mt-2 text-foreground">
                      {new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}
                    </p>
                    <div className="flex items-center justify-center gap-1.5 mt-1 text-sm text-muted-foreground">
                      {employee?.locationName === "معرض" ? <Building2 className="w-4 h-4" /> : <Factory className="w-4 h-4" />}
                      <span>{employee?.locationName}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={handleReset} data-testid="button-new-record">
                      تسجيل جديد
                    </Button>
                    <Button className="flex-1" onClick={() => setStep("history")} data-testid="button-view-my-history">
                      <FileText className="w-4 h-4 me-1" />
                      سجلاتي
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 6: History */}
            {step === "history" && employee && (
              <motion.div key="history" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div className="bg-card border rounded-2xl shadow-lg overflow-hidden">
                  <div className="p-4 border-b flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => setStep("action")} data-testid="button-back-to-action">
                      <ChevronRight className="w-5 h-5" />
                    </Button>
                    <div>
                      <p className="font-bold">سجل الحضور</p>
                      <p className="text-xs text-muted-foreground">{employee.nameAr}</p>
                    </div>
                    <Button variant="ghost" size="sm" className="ms-auto" onClick={() => setPermissionDialog(true)} data-testid="button-request-permission-history">
                      <FileText className="w-4 h-4 me-1" />
                      استئذان
                    </Button>
                  </div>

                  {/* Date filters */}
                  <div className="p-3 bg-muted/30 border-b flex gap-2">
                    <Input
                      type="date"
                      value={historyFrom}
                      onChange={e => setHistoryFrom(e.target.value)}
                      className="flex-1 h-8 text-xs"
                      placeholder="من"
                      data-testid="input-history-from"
                    />
                    <Input
                      type="date"
                      value={historyTo}
                      onChange={e => setHistoryTo(e.target.value)}
                      className="flex-1 h-8 text-xs"
                      placeholder="إلى"
                      data-testid="input-history-to"
                    />
                  </div>

                  <div className="divide-y max-h-[60vh] overflow-y-auto">
                    {myRecords.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground">
                        <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p>لا توجد سجلات</p>
                      </div>
                    ) : (
                      groupRecordsByDay(myRecords).map(([day, recs]) => (
                        <div key={day}>
                          <div className="px-4 py-2 bg-muted/20 flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">{formatDate(recs[0].checkTime)}</span>
                            <AttendanceStatusBadge status={getDayStatus(recs)} />
                          </div>
                          {recs.map(rec => (
                            <div key={rec.id} className="px-4 py-3 flex items-center gap-3" data-testid={`row-attendance-${rec.id}`}>
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                rec.type === "check_in" ? "bg-green-100 dark:bg-green-950" : "bg-orange-100 dark:bg-orange-950"
                              }`}>
                                {rec.type === "check_in"
                                  ? <LogIn className="w-4 h-4 text-green-600" />
                                  : <LogOut className="w-4 h-4 text-orange-600" />
                                }
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-medium">
                                  {rec.type === "check_in" ? "تسجيل دخول" : "تسجيل خروج"}
                                </p>
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formatTime(rec.checkTime)}
                                  {rec.locationName && <> · {rec.locationName}</>}
                                  {rec.isManualEdit && <Badge variant="outline" className="text-[9px] h-4">تعديل يدوي</Badge>}
                                </p>
                              </div>
                              {rec.isOutOfZone && (
                                <span title="خارج النطاق الجغرافي">
                                  <MapPin className="w-4 h-4 text-orange-500" />
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>

      {/* Permission Dialog */}
      <Dialog open={permissionDialog} onOpenChange={setPermissionDialog}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>طلب استئذان</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">نوع الإذن</label>
              <Select value={permType} onValueChange={setPermType}>
                <SelectTrigger data-testid="select-permission-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="permission">استئذان</SelectItem>
                  <SelectItem value="leave">إجازة</SelectItem>
                  <SelectItem value="sick">إجازة مرضية</SelectItem>
                  <SelectItem value="official">مهمة رسمية</SelectItem>
                  <SelectItem value="remote">عمل عن بُعد</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">عدد الساعات</label>
              <Select value={permHours} onValueChange={setPermHours}>
                <SelectTrigger data-testid="select-permission-hours">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["0.5", "1", "1.5", "2", "3", "4", "8"].map(h => (
                    <SelectItem key={h} value={h}>{h === "8" ? "يوم كامل" : `${h} ساعة`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">السبب</label>
              <Textarea
                placeholder="اكتب سبب الاستئذان..."
                value={permReason}
                onChange={e => setPermReason(e.target.value)}
                data-testid="input-permission-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPermissionDialog(false)}>إلغاء</Button>
            <Button
              onClick={() => {
                const today = new Date().toISOString().split("T")[0];
                permMutation.mutate({
                  employeeId: employee?.id,
                  employeePhone: employee?.phone,
                  date: today,
                  type: permType,
                  hoursRequested: permHours,
                  reason: permReason,
                });
              }}
              disabled={permMutation.isPending}
              data-testid="button-submit-permission"
            >
              {permMutation.isPending ? "جاري الإرسال..." : "إرسال الطلب"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <div className="text-center py-3 text-xs text-muted-foreground border-t">
        تيك للتصنيع والتجارة © {new Date().getFullYear()}
      </div>
    </div>
  );
}
