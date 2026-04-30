import { useState, useCallback, useEffect } from "react";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Phone, KeyRound, Loader2, Users, AlertCircle, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LoadingTransition } from "@/components/loading-transition";
import teakLogo from "@assets/TEAK-LOGO_(1)_(1)_1772710617816.png";
import { useQuery } from "@tanstack/react-query";

export default function EmployeeLoginPage() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const isRTL = lang === "ar";

  const { data: existingUser, isLoading: checkingSession } = useQuery<{ id: number } | null>({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: 0,
  });

  useEffect(() => {
    if (existingUser && existingUser.id) {
      window.location.replace("/dashboard");
    }
  }, [existingUser]);

  const [step, setStep] = useState<"phone" | "pin">("phone");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [employeeName, setEmployeeName] = useState("");
  const [hasPinSet, setHasPinSet] = useState(false);
  const [error, setError] = useState("");
  const [showTransition, setShowTransition] = useState(false);

  const handleCheckPhone = useCallback(async () => {
    const trimmed = phone.trim();
    if (!trimmed) {
      setError(t("أدخل رقم الجوال", "Enter phone number"));
      return;
    }
    const digits = trimmed.replace(/\D/g, "");
    if (!/^(05\d{8}|5\d{8})$/.test(digits)) {
      setError(t("رقم الجوال غير صحيح. مثال: 05XXXXXXXX", "Invalid phone number. Example: 05XXXXXXXX"));
      return;
    }

    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/employee-auth/check-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: digits }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(lang === "ar" ? data.message : (data.messageEn || data.message));
        return;
      }
      setEmployeeName(lang === "ar" ? data.fullNameAr : (data.fullNameEn || data.fullNameAr));
      setHasPinSet(data.hasPinSet);
      setStep("pin");
    } catch {
      setError(t("حدث خطأ في الاتصال بالخادم", "Connection error, please try again"));
    } finally {
      setLoading(false);
    }
  }, [phone, lang, t]);

  const handleVerifyPin = useCallback(async () => {
    if (!pin.trim() || pin.length < 4) return;

    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/employee-auth/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.replace(/\D/g, ""), pin: pin.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(lang === "ar" ? data.message : (data.messageEn || data.message));
        return;
      }
      toast({
        title: t("مرحباً", "Welcome"),
        description: t(`مرحباً ${data.fullNameAr || ""}`, `Welcome ${data.fullNameEn || ""}`),
      });
      setShowTransition(true);
    } catch {
      setError(t("حدث خطأ في الاتصال بالخادم", "Connection error, please try again"));
    } finally {
      setLoading(false);
    }
  }, [phone, pin, lang, t, toast]);

  const maskedPhone = phone
    ? phone.replace(/\D/g, "").replace(/^(\d{4})\d+(\d{2})$/, "$1****$2")
    : "";

  if (checkingSession) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      className="min-h-[100dvh] bg-gradient-to-b from-background via-background to-muted/50 flex flex-col items-center justify-center px-4 py-6"
      dir={isRTL ? "rtl" : "ltr"}
    >
      <LoadingTransition
        show={showTransition}
        message={t("جاري تسجيل الدخول...", "Signing you in...")}
        subMessage={t("يتم تجهيز لوحة التحكم الخاصة بك", "Preparing your dashboard")}
        duration={1500}
        onComplete={() => { window.location.href = "/dashboard"; }}
      />
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center space-y-1.5">
          <img
            src={teakLogo}
            alt="Teak"
            className="w-16 h-16 mx-auto object-contain logo-auto"
            data-testid="img-employee-logo"
          />
          <h1 className="text-xl font-bold tracking-tight" data-testid="text-employee-login-title">
            {t("دخول الموظفين", "Employee Login")}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t("تيك للصناعات الخشبية — نظام دخول الموظفين", "Teak Wood Products — Employee Access")}
          </p>
        </div>

        <div className="rounded-2xl border bg-card text-card-foreground shadow-sm overflow-hidden">
          <div className="px-5 pt-5 pb-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h2 className="text-sm font-semibold">
                  {step === "phone"
                    ? t("تسجيل الدخول برقم الجوال", "Sign In with Phone")
                    : t("رمز الدخول", "Access PIN")}
                </h2>
                {step === "pin" && (
                  <p className="text-[11px] text-muted-foreground">
                    {maskedPhone}
                    {employeeName ? ` — ${employeeName}` : ""}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="px-5 py-4 space-y-3.5">
            {error && (
              <div className="bg-destructive/5 border border-destructive/15 rounded-lg px-3 py-2 flex items-start gap-2" data-testid="text-employee-error">
                <AlertCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                <p className="text-xs text-destructive leading-relaxed">{error}</p>
              </div>
            )}

            {step === "phone" ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground/80" data-testid="label-employee-phone">
                    {t("رقم الجوال", "Phone Number")}
                  </label>
                  <div className="relative">
                    <Phone className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                    <Input
                      type="tel"
                      placeholder="05XXXXXXXX"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value.replace(/\D/g, ""));
                        setError("");
                      }}
                      className="ps-10 h-11 text-base"
                      dir="ltr"
                      maxLength={10}
                      data-testid="input-employee-phone"
                      autoFocus
                      onKeyDown={(e) => e.key === "Enter" && handleCheckPhone()}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {t("أدخل رقم جوالك المسجل في النظام", "Enter your registered phone number")}
                  </p>
                </div>
                <Button
                  onClick={handleCheckPhone}
                  disabled={loading || !phone.trim()}
                  className="w-full h-11 text-sm font-medium"
                  data-testid="button-employee-next"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin me-2" />
                  ) : (
                    <ArrowRight className="w-4 h-4 me-2" />
                  )}
                  {t("التالي", "Next")}
                </Button>
              </>
            ) : (
              <>
                {employeeName && (
                  <div className="bg-primary/5 rounded-lg px-3 py-2.5 text-center">
                    <p className="text-[11px] text-muted-foreground">{t("مرحباً", "Welcome")}</p>
                    <p className="font-semibold text-base mt-0.5" data-testid="text-employee-name">{employeeName}</p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground/80" data-testid="label-employee-pin">
                    {t("رمز الدخول PIN", "Access PIN")}
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                    <Input
                      type="password"
                      inputMode="numeric"
                      placeholder="••••"
                      value={pin}
                      onChange={(e) => {
                        setPin(e.target.value.replace(/\D/g, ""));
                        setError("");
                      }}
                      className="ps-10 h-12 text-center tracking-[0.4em] text-lg"
                      maxLength={6}
                      dir="ltr"
                      autoFocus
                      data-testid="input-employee-pin"
                      onKeyDown={(e) => e.key === "Enter" && pin.length >= 4 && handleVerifyPin()}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {hasPinSet
                      ? t("أدخل رمز الدخول الخاص بك", "Enter your personal PIN")
                      : t("الرمز الافتراضي هو آخر 4 أرقام من رقم جوالك", "Default PIN is the last 4 digits of your phone number")}
                  </p>
                </div>

                <Button
                  onClick={handleVerifyPin}
                  disabled={loading || pin.length < 4}
                  className="w-full h-11 text-sm font-medium"
                  data-testid="button-employee-verify"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : null}
                  {t("تسجيل الدخول", "Sign In")}
                </Button>

                <div className="flex items-center justify-center pt-1">
                  <button
                    onClick={() => { setStep("phone"); setPin(""); setError(""); setEmployeeName(""); }}
                    className="text-xs text-muted-foreground hover:text-primary transition-colors"
                    data-testid="button-employee-back"
                  >
                    {t("← تغيير رقم الجوال", "← Change phone number")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="text-center">
          <button
            onClick={() => window.location.href = "/"}
            className="text-xs text-muted-foreground hover:text-primary transition-colors"
            data-testid="link-employee-home"
          >
            {t("العودة للموقع الرئيسي", "Back to Main Site")}
          </button>
        </div>
      </div>
    </div>
  );
}
