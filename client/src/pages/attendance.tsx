import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage, LanguageToggle } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Fingerprint, LogIn, LogOut, Clock, CheckCircle2, AlertCircle, ChevronRight,
  Building2, Factory, MapPin, Calendar, RotateCcw, FileText, Shield, Loader2,
} from "lucide-react";
import teakLogo from "@assets/TEAK-LOGO_(1)_(1)_1772710617816.png";

type Step = "password" | "lookup" | "action" | "pin" | "fingerprint" | "success" | "history";

interface EmployeeInfo {
  id: number;
  employeeNumber: string;
  nameAr: string;
  phone: string;
  locationName: string;
  attendanceEnabled: boolean;
  hasPin?: boolean;
  lastRecord: { type: string; checkTime: string } | null;
}

interface AttendanceRecord {
  id: number;
  type: "check_in" | "check_out";
  checkTime: string;
  locationName: string | null;
  latitude: string | null;
  longitude: string | null;
  isOutOfZone: boolean;
  isManualEdit: boolean;
  notes: string | null;
}

function getDeviceInfo() {
  const ua = navigator.userAgent;
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(ua);
  const isTablet = /iPad|Tablet/i.test(ua);
  const browser = ua.includes("Chrome") ? "Chrome" : ua.includes("Safari") ? "Safari" : ua.includes("Firefox") ? "Firefox" : "Unknown";
  const os = ua.includes("Windows") ? "Windows" : ua.includes("Mac") ? "macOS" : ua.includes("Android") ? "Android" : ua.includes("iPhone") || ua.includes("iPad") ? "iOS" : "Linux";
  return { ua, type: isTablet ? "tablet" : isMobile ? "mobile" : "desktop", browser, os };
}

function getDeviceId(): string {
  const KEY = "teak_device_id";
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = "dev-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10)
        + "-" + (navigator.hardwareConcurrency || 0)
        + "-" + screen.width + "x" + screen.height;
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "dev-" + navigator.userAgent.length + "-" + screen.width + "x" + screen.height;
  }
}

function FingerprintAnimation({ onComplete, t }: { onComplete: () => void; t: (ar: string, en: string) => string }) {
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
        {phase === "idle" ? t("ضع إصبعك على البصمة للتسجيل", "Place your finger on the scanner") : phase === "scanning" ? t("جاري التحقق...", "Verifying...") : t("تم التحقق بنجاح ✓", "Verified successfully ✓")}
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

function AttendanceStatusBadge({ status, t }: { status: string; t: (ar: string, en: string) => string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    present: { label: t("حاضر", "Present"), variant: "default" },
    late: { label: t("متأخر", "Late"), variant: "secondary" },
    absent: { label: t("غائب", "Absent"), variant: "destructive" },
    missing_checkout: { label: t("نقص خروج", "Missing check-out"), variant: "outline" },
    missing_checkin: { label: t("نقص دخول", "Missing check-in"), variant: "outline" },
    permission: { label: t("إذن", "Permission"), variant: "secondary" },
  };
  const s = map[status] || { label: status, variant: "outline" as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

function formatTime(ts: string, locale: string) {
  return new Date(ts).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: true });
}

function formatDate(ts: string, locale: string) {
  return new Date(ts).toLocaleDateString(locale, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
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
  if (!hasIn) return hasOut ? "missing_checkin" : "absent";
  if (hasIn && !hasOut) return "missing_checkout";
  return "present";
}

export default function AttendancePage() {
  const [step, setStep] = useState<Step>("password");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [pin, setPin] = useState("");
  const [employee, setEmployee] = useState<EmployeeInfo | null>(null);
  const [actionType, setActionType] = useState<"check_in" | "check_out">("check_in");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationPermDenied, setLocationPermDenied] = useState(false);
  const [locationReady, setLocationReady] = useState(false);
  const [fingerprintDone, setFingerprintDone] = useState(false);
  const [permissionDialog, setPermissionDialog] = useState(false);
  const [permReason, setPermReason] = useState("");
  const [permType, setPermType] = useState("permission");
  const [permHours, setPermHours] = useState("1");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const { toast } = useToast();
  const { t, lang, toggleLang, isRTL } = useLanguage();
  const timeLocale = lang === "ar" ? "ar-SA" : "en-US";
  const qc = useQueryClient();
  const pickMsg = (body: any, fallback: string) => (lang === "en" && body?.messageEn) || body?.message || fallback;
  const deviceInfo = useRef(getDeviceInfo());
  const deviceFingerprint = useRef(getDeviceId());

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
    onError: () => toast({ title: t("كلمة المرور خاطئة", "Wrong password"), description: t("أدخل كلمة المرور الصحيحة", "Enter the correct password"), variant: "destructive" }),
  });

  const lookupMutation = useMutation({
    mutationFn: (ph: string) => fetch(`/api/attendance/employee-lookup?phone=${ph}`).then(async r => { if (!r.ok) throw new Error(pickMsg(await r.json(), t("حدث خطأ", "An error occurred"))); return r.json(); }),
    onSuccess: (data: EmployeeInfo) => {
      setEmployee(data);
      const nextType = data.lastRecord?.type === "check_in" ? "check_out" : "check_in";
      setActionType(nextType);
      setStep("action");
    },
    onError: (err: Error) => toast({ title: t("خطأ", "Error"), description: err.message, variant: "destructive" }),
  });

  const recordMutation = useMutation({
    mutationFn: async (data: object) => {
      const r = await fetch("/api/attendance/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw Object.assign(new Error(pickMsg(body, t("تعذّر تسجيل الحضور", "Could not record attendance"))), { requirePin: body.requirePin });
      }
      return r.json();
    },
    onSuccess: () => {
      setStep("success");
      qc.invalidateQueries({ queryKey: ["/api/attendance/my-records"] });
    },
    onError: (err: Error & { requirePin?: boolean }) => {
      if (err.requirePin) {
        setPin("");
        setStep("pin");
      }
      toast({ title: t("خطأ", "Error"), description: err.message, variant: "destructive" });
    },
  });

  const verifyPinMutation = useMutation({
    mutationFn: (p: string) => fetch("/api/attendance/verify-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId: employee?.id, employeePhone: employee?.phone, pin: p, type: actionType }),
    }).then(async r => { if (!r.ok) throw new Error(pickMsg(await r.json(), t("حدث خطأ", "An error occurred"))); return r.json(); }),
    onSuccess: () => {
      setPin("");
      setFingerprintDone(false);
      setStep("fingerprint");
    },
    onError: (err: Error) => toast({ title: t("خطأ", "Error"), description: err.message, variant: "destructive" }),
  });

  const permMutation = useMutation({
    mutationFn: (data: object) => apiRequest("POST", "/api/attendance/permission", data),
    onSuccess: () => {
      setPermissionDialog(false);
      toast({ title: t("تم إرسال طلب الاستئذان", "Permission request sent"), description: t("تمت الموافقة تلقائياً", "Approved automatically") });
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
    setLocationReady(false);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setLocationPermDenied(false);
          setLocationReady(true);
        },
        (err) => {
          setLocation(null);
          setLocationPermDenied(err.code === err.PERMISSION_DENIED);
          setLocationReady(true);
        },
        { timeout: 6000 }
      );
    } else {
      setLocationReady(true);
    }
  }, []);

  useEffect(() => {
    if (step === "action") {
      setLocation(null);
      setLocationPermDenied(false);
      setLocationReady(false);
      requestLocation();
    }
  }, [step]);

  const handleProceedToFingerprint = useCallback(() => {
    if (locationPermDenied) return;
    if (!locationReady) return;
    if (employee?.hasPin) {
      setPin("");
      setStep("pin");
      return;
    }
    setFingerprintDone(false);
    setStep("fingerprint");
  }, [locationPermDenied, locationReady, employee]);

  const handleFingerprintComplete = useCallback(() => {
    setFingerprintDone(true);
  }, []);

  useEffect(() => {
    if (!fingerprintDone || !locationReady || !employee) return;
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
      notes: locationPermDenied ? "رُفض الإذن" : null,
    });
  }, [fingerprintDone, locationReady]);

  const handleReset = useCallback(() => {
    setStep("lookup");
    setEmployee(null);
    setPhone("");
    setSelectedEmployeeId("");
    setEmployeeSearch("");
    setPin("");
    setLocation(null);
    setLocationPermDenied(false);
    setLocationReady(false);
    setFingerprintDone(false);
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col" dir={isRTL ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="bg-primary text-primary-foreground py-4 px-6 flex items-center gap-3 shadow-md">
        <img src={teakLogo} alt="Teak" className="w-10 h-10 object-contain brightness-0 invert" />
        <div>
          <h1 className="font-bold text-lg leading-tight">{t("نظام مراقبة الدوام", "Attendance System")}</h1>
          <p className="text-primary-foreground/70 text-sm">{t("تيك للتصنيع والتجارة", "Teak Manufacturing & Trading")}</p>
        </div>
        <div className="ms-auto flex items-center gap-2">
          <Shield className="w-5 h-5 opacity-60 hidden sm:block" />
          <span className="text-sm opacity-70 hidden sm:block">{t("بوابة الموظفين", "Employee Portal")}</span>
          <LanguageToggle testId="button-toggle-language" />
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
                    <h2 className="text-2xl font-bold">{t("تسجيل الدوام", "Attendance Check-in")}</h2>
                    <p className="text-muted-foreground text-sm">{t("أدخل كلمة المرور للمتابعة", "Enter the password to continue")}</p>
                  </div>
                  <div className="space-y-3">
                    <Input
                      type="password"
                      placeholder={t("كلمة المرور", "Password")}
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
                      {verifyMutation.isPending ? t("جاري التحقق...", "Verifying...") : t("دخول", "Enter")}
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
                    <h2 className="text-xl font-bold">{t("تعريف الموظف", "Employee Identification")}</h2>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">{t("ابحث برقم الجوال", "Search by phone number")}</label>
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
                          {lookupMutation.isPending ? "..." : t("بحث", "Search")}
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
                      <div className="relative flex justify-center text-xs text-muted-foreground"><span className="bg-card px-2">{t("أو اختر اسمك من القائمة", "Or pick your name from the list")}</span></div>
                    </div>

                    <div className="space-y-2">
                      <Input
                        type="text"
                        placeholder={t("ابحث بالاسم...", "Search by name...")}
                        value={employeeSearch}
                        onChange={e => setEmployeeSearch(e.target.value)}
                        data-testid="input-employee-search"
                      />
                      <div className="max-h-64 overflow-y-auto rounded-xl border divide-y" data-testid="list-attendance-employees">
                        {employeesList
                          .filter(emp => emp.nameAr.toLowerCase().includes(employeeSearch.trim().toLowerCase()))
                          .map(emp => (
                            <button
                              key={emp.id}
                              onClick={() => handleSelectEmployee(String(emp.id))}
                              className="w-full flex items-center gap-3 px-3 py-3 text-start hover:bg-muted/40 active:bg-muted/60 transition-colors"
                              data-testid={`option-employee-${emp.id}`}
                            >
                              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                                {emp.nameAr[0]}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{emp.nameAr}</p>
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  {emp.locationName === "معرض" ? <Building2 className="w-3 h-3" /> : <Factory className="w-3 h-3" />}
                                  {emp.locationName}
                                </p>
                              </div>
                              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                            </button>
                          ))}
                        {employeesList.filter(emp => emp.nameAr.toLowerCase().includes(employeeSearch.trim().toLowerCase())).length === 0 && (
                          <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("لا يوجد موظف مطابق", "No matching employee")}</p>
                        )}
                      </div>
                    </div>
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
                      {t("آخر تسجيل:", "Last record:")} <span className="font-medium text-foreground">
                        {employee.lastRecord.type === "check_in" ? t("دخول", "Check-in") : t("خروج", "Check-out")}
                      </span> {t("في", "at")} {formatTime(employee.lastRecord.checkTime, timeLocale)}
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
                      <span className="font-bold">{t("تسجيل دخول", "Check In")}</span>
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
                      <span className="font-bold">{t("تسجيل خروج", "Check Out")}</span>
                    </button>
                  </div>

                  {/* Location status - mandatory */}
                  {!locationReady && (
                    <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-3 text-sm text-blue-700 dark:text-blue-300">
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      <span>{t("جاري تحديد موقعك الجغرافي...", "Detecting your location...")}</span>
                    </div>
                  )}
                  {locationReady && location && (
                    <div className="flex items-center gap-2 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl p-3 text-sm text-green-700 dark:text-green-300">
                      <MapPin className="w-4 h-4 shrink-0" />
                      <span>{t("تم تحديد موقعك بنجاح ✓", "Location detected successfully ✓")}</span>
                    </div>
                  )}
                  {locationReady && locationPermDenied && (
                    <div className="bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800 rounded-xl p-4 space-y-2">
                      <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-semibold">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <span>{t("مخالفة: رُفض الإذن بتحديد الموقع", "Violation: location permission denied")}</span>
                      </div>
                      <p className="text-sm text-red-600 dark:text-red-300">
                        {t(
                          "لقد رفضت السماح بتحديد الموقع. هذا يُعدّ مخالفة لشروط العمل. لا يقبل النظام تسجيل الدوام بدون تحديد الموقع الجغرافي. يجب السماح بتحديد الموقع من إعدادات المتصفح ثم إعادة المحاولة.",
                          "You denied location access. This is considered a work-policy violation. The system does not accept attendance records without a location. Allow location access in your browser settings, then try again.",
                        )}
                      </p>
                      <Button size="sm" variant="outline" className="border-red-400 text-red-700 hover:bg-red-100" onClick={requestLocation} data-testid="button-retry-location">
                        <MapPin className="w-4 h-4 me-1" /> {t("إعادة المحاولة", "Try again")}
                      </Button>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      className="flex-1 h-12 text-base"
                      onClick={handleProceedToFingerprint}
                      disabled={!locationReady || locationPermDenied || !location}
                      data-testid="button-proceed-fingerprint"
                    >
                      {!locationReady ? <Loader2 className="w-4 h-4 animate-spin ms-2" /> : <ChevronRight className="w-5 h-5 ms-2" />}
                      {t("متابعة", "Continue")}
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
                      {t("عرض سجل حضوري", "View my attendance history")}
                    </button>
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground underline"
                      onClick={() => setPermissionDialog(true)}
                      data-testid="link-request-permission"
                    >
                      {t("طلب استئذان", "Request permission")}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 3.5: PIN confirmation */}
            {step === "pin" && employee && (
              <motion.div key="pin" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                <div className="bg-card border rounded-2xl p-8 shadow-lg space-y-6">
                  <div className="text-center space-y-2">
                    <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto">
                      <Shield className="w-8 h-8 text-primary" />
                    </div>
                    <h2 className="text-xl font-bold">{t("تأكيد الهوية", "Identity Confirmation")}</h2>
                    <p className="text-muted-foreground text-sm">
                      {employee.nameAr} — {t("أدخل الرقم السري الوظيفي لتأكيد", "enter your employee PIN to confirm")} {actionType === "check_in" ? t("تسجيل الدخول", "check-in") : t("تسجيل الخروج", "check-out")}
                    </p>
                  </div>
                  <div className="space-y-3">
                    <Input
                      type="password"
                      inputMode="numeric"
                      placeholder={t("الرقم السري الوظيفي", "Employee PIN")}
                      value={pin}
                      onChange={e => setPin(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && pin && verifyPinMutation.mutate(pin)}
                      className="text-center text-2xl tracking-widest h-14"
                      autoFocus
                      data-testid="input-attendance-pin"
                    />
                    {verifyPinMutation.isError && (
                      <p className="text-destructive text-sm text-center flex items-center gap-1 justify-center">
                        <AlertCircle className="w-4 h-4" />
                        {(verifyPinMutation.error as Error).message}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        className="flex-1 h-12 text-base"
                        onClick={() => pin && verifyPinMutation.mutate(pin)}
                        disabled={verifyPinMutation.isPending || !pin}
                        data-testid="button-verify-pin"
                      >
                        {verifyPinMutation.isPending ? t("جاري التحقق...", "Verifying...") : t("تأكيد ومتابعة", "Confirm & continue")}
                        <ChevronRight className="w-4 h-4 ms-1" />
                      </Button>
                      <Button variant="outline" onClick={() => setStep("action")} data-testid="button-pin-back">
                        {t("رجوع", "Back")}
                      </Button>
                    </div>
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
                      {actionType === "check_in" ? t("تسجيل دخول", "Check In") : t("تسجيل خروج", "Check Out")}
                    </h2>
                    <p className="text-muted-foreground text-sm mt-1">{employee?.nameAr}</p>
                  </div>
                  {locationReady ? (
                    location ? (
                      <div className="flex items-center justify-center gap-1.5 text-xs text-green-600 bg-green-50 dark:bg-green-950/30 rounded-lg py-2">
                        <MapPin className="w-3.5 h-3.5" />
                        <span>{t("تم تحديد موقعك الجغرافي", "Your location was detected")}</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-1.5 text-xs text-orange-600 bg-orange-50 dark:bg-orange-950/30 rounded-lg py-2">
                        <MapPin className="w-3.5 h-3.5" />
                        <span>{t("لم يتم تحديد الموقع — سيُسجَّل بدون إحداثيات", "Location not detected — will be recorded without coordinates")}</span>
                      </div>
                    )
                  ) : (
                    <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground bg-muted/30 rounded-lg py-2">
                      <MapPin className="w-3.5 h-3.5 animate-pulse" />
                      <span>{t("للدقة في تسجيل موقع البصمة، اسمح للمتصفح بتحديد موقعك", "For accurate location logging, allow the browser to access your location")}</span>
                    </div>
                  )}
                  <FingerprintAnimation onComplete={handleFingerprintComplete} t={t} />
                  {(recordMutation.isPending || (fingerprintDone && !locationReady)) && (
                    <p className="text-center text-sm text-muted-foreground animate-pulse">
                      {fingerprintDone && !locationReady ? t("جاري تحديد الموقع...", "Detecting location...") : t("جاري حفظ البيانات...", "Saving...")}
                    </p>
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
                      {actionType === "check_in" ? t("تم تسجيل الدخول", "Checked in successfully") : t("تم تسجيل الخروج", "Checked out successfully")}
                    </h2>
                    <p className="text-muted-foreground mt-1">{employee?.nameAr}</p>
                    <p className="text-lg font-mono font-medium mt-2 text-foreground">
                      {new Date().toLocaleTimeString(timeLocale, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}
                    </p>
                    <div className="flex items-center justify-center gap-1.5 mt-1 text-sm text-muted-foreground">
                      {employee?.locationName === "معرض" ? <Building2 className="w-4 h-4" /> : <Factory className="w-4 h-4" />}
                      <span>{employee?.locationName}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={handleReset} data-testid="button-new-record">
                      {t("تسجيل جديد", "New record")}
                    </Button>
                    <Button className="flex-1" onClick={() => setStep("history")} data-testid="button-view-my-history">
                      <FileText className="w-4 h-4 me-1" />
                      {t("سجلاتي", "My records")}
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
                      <p className="font-bold">{t("سجل الحضور", "Attendance History")}</p>
                      <p className="text-xs text-muted-foreground">{employee.nameAr}</p>
                    </div>
                    <Button variant="ghost" size="sm" className="ms-auto" onClick={() => setPermissionDialog(true)} data-testid="button-request-permission-history">
                      <FileText className="w-4 h-4 me-1" />
                      {t("استئذان", "Permission")}
                    </Button>
                  </div>

                  {/* Date filters */}
                  <div className="p-3 bg-muted/30 border-b flex gap-2">
                    <Input
                      type="date"
                      value={historyFrom}
                      onChange={e => setHistoryFrom(e.target.value)}
                      className="flex-1 h-8 text-xs"
                      placeholder={t("من", "From")}
                      data-testid="input-history-from"
                    />
                    <Input
                      type="date"
                      value={historyTo}
                      onChange={e => setHistoryTo(e.target.value)}
                      className="flex-1 h-8 text-xs"
                      placeholder={t("إلى", "To")}
                      data-testid="input-history-to"
                    />
                  </div>

                  <div className="divide-y max-h-[60vh] overflow-y-auto">
                    {myRecords.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground">
                        <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p>{t("لا توجد سجلات", "No records")}</p>
                      </div>
                    ) : (
                      groupRecordsByDay(myRecords).map(([day, recs]) => (
                        <div key={day}>
                          <div className="px-4 py-2 bg-muted/20 flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">{formatDate(recs[0].checkTime, timeLocale)}</span>
                            <AttendanceStatusBadge status={getDayStatus(recs)} t={t} />
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
                                  {rec.type === "check_in" ? t("تسجيل دخول", "Check-in") : t("تسجيل خروج", "Check-out")}
                                </p>
                                <p className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
                                  <Clock className="w-3 h-3" />
                                  {formatTime(rec.checkTime, timeLocale)}
                                  {rec.locationName && <> · {rec.locationName}</>}
                                  {rec.isManualEdit && <Badge variant="outline" className="text-[9px] h-4">{t("تعديل يدوي", "Manual edit")}</Badge>}
                                  {rec.notes && <Badge variant="secondary" className="text-[9px] h-4">{rec.notes}</Badge>}
                                </p>
                              </div>
                              {rec.isOutOfZone ? (
                                <span title={t("خارج النطاق الجغرافي", "Out of allowed zone")} className="flex items-center gap-0.5 text-orange-500 text-xs">
                                  <MapPin className="w-3.5 h-3.5" />
                                  ⚠️
                                </span>
                              ) : rec.latitude ? (
                                <span title={t("داخل النطاق الجغرافي", "Within allowed zone")} className="text-green-500 text-sm">✅</span>
                              ) : (
                                <span title={t("لا توجد بيانات موقع", "No location data")} className="text-muted-foreground text-sm">➖</span>
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
        <DialogContent dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle>{t("طلب استئذان", "Permission Request")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">{t("نوع الإذن", "Permission type")}</label>
              <Select value={permType} onValueChange={setPermType}>
                <SelectTrigger data-testid="select-permission-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="permission">{t("استئذان", "Permission")}</SelectItem>
                  <SelectItem value="leave">{t("إجازة", "Leave")}</SelectItem>
                  <SelectItem value="sick">{t("إجازة مرضية", "Sick leave")}</SelectItem>
                  <SelectItem value="official">{t("مهمة رسمية", "Official assignment")}</SelectItem>
                  <SelectItem value="remote">{t("عمل عن بُعد", "Remote work")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t("عدد الساعات", "Hours")}</label>
              <Select value={permHours} onValueChange={setPermHours}>
                <SelectTrigger data-testid="select-permission-hours">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["0.5", "1", "1.5", "2", "3", "4", "8"].map(h => (
                    <SelectItem key={h} value={h}>{h === "8" ? t("يوم كامل", "Full day") : t(`${h} ساعة`, `${h} hour(s)`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">{t("السبب", "Reason")}</label>
              <Textarea
                placeholder={t("اكتب سبب الاستئذان...", "Write the reason...")}
                value={permReason}
                onChange={e => setPermReason(e.target.value)}
                data-testid="input-permission-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPermissionDialog(false)}>{t("إلغاء", "Cancel")}</Button>
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
              {permMutation.isPending ? t("جاري الإرسال...", "Sending...") : t("إرسال الطلب", "Submit request")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <div className="text-center py-3 text-xs text-muted-foreground border-t">
        {t("تيك للتصنيع والتجارة", "Teak Manufacturing & Trading")} © {new Date().getFullYear()}
      </div>
    </div>
  );
}
