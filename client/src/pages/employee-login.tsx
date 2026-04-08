import { useState, useCallback, useEffect } from "react";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Phone, KeyRound, Loader2, Users, AlertCircle, ArrowRight, RotateCcw } from "lucide-react";
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

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [employeeName, setEmployeeName] = useState("");
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [showTransition, setShowTransition] = useState(false);
  const [devMode, setDevMode] = useState(false);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSendOTP = useCallback(async () => {
    const trimmed = phone.trim();
    if (!trimmed) {
      setError(t("أدخل رقم الجوال", "Enter phone number"));
      return;
    }

    const digits = trimmed.replace(/\D/g, "");
    if (!/^05\d{8}$/.test(digits)) {
      setError(t("رقم الجوال غير صحيح. يجب أن يبدأ بـ 05 ويتكون من 10 أرقام", "Invalid phone number. Must start with 05 and be 10 digits"));
      return;
    }

    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/employee-auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: digits }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(lang === "ar" ? data.message : (data.messageEn || data.message));
        setLoading(false);
        return;
      }

      setDevMode(!!data.devMode);
      setStep("otp");
      setCountdown(60);
      toast({
        title: t("تم الإرسال", "Code Sent"),
        description: t("تم إرسال رمز التحقق عبر رسالة نصية SMS", "Verification code sent via SMS"),
      });
    } catch (err) {
      console.error("Send OTP error:", err);
      setError(t("حدث خطأ في إرسال الرمز. حاول مجدداً", "Error sending code. Please try again"));
    } finally {
      setLoading(false);
    }
  }, [phone, toast, t, lang]);

  const handleVerifyOTP = useCallback(async () => {
    if (!otp.trim() || otp.length < 6) return;

    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/employee-auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), code: otp.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(lang === "ar" ? data.message : (data.messageEn || data.message));
        return;
      }

      setEmployeeName(data.fullNameAr || data.fullNameEn || "");
      toast({
        title: t("مرحباً", "Welcome"),
        description: t(`مرحباً ${data.fullNameAr || ""}`, `Welcome ${data.fullNameEn || ""}`),
      });
      setShowTransition(true);
    } catch (err) {
      console.error("Verify OTP error:", err);
      setError(t("حدث خطأ. حاول مجدداً", "An error occurred. Please try again"));
    } finally {
      setLoading(false);
    }
  }, [otp, phone, toast, t, lang]);

  const handleResendOTP = useCallback(() => {
    setStep("phone");
    setOtp("");
    setError("");
    setDevMode(false);
  }, []);

  const maskedPhone = phone ? `${phone.substring(0, 4)}****${phone.substring(8)}` : "";

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
                    : t("رمز التحقق", "Verification Code")}
                </h2>
                {step === "otp" && (
                  <p className="text-[11px] text-muted-foreground">
                    {t(`تم الإرسال إلى ${maskedPhone}`, `Sent to ${maskedPhone}`)}
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

            {devMode && step === "otp" && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-300" data-testid="text-dev-mode-notice">
                {t("وضع التطوير: الرمز يظهر في سجل الخادم (console)", "Dev mode: code printed in server console")}
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
                      placeholder="05xxxxxxxx"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value.replace(/\D/g, ""));
                        setError("");
                      }}
                      className="ps-10 h-11 text-base"
                      dir="ltr"
                      maxLength={10}
                      data-testid="input-employee-phone"
                      onKeyDown={(e) => e.key === "Enter" && handleSendOTP()}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {t("أدخل رقم جوالك المسجل في النظام — سيصلك رمز التحقق عبر SMS", "Enter your registered phone number — you'll receive a code via SMS")}
                  </p>
                </div>
                <Button
                  onClick={handleSendOTP}
                  disabled={loading || !phone.trim()}
                  className="w-full h-11 text-sm font-medium"
                  data-testid="button-employee-send-otp"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin me-2" />
                  ) : (
                    <ArrowRight className="w-4 h-4 me-2" />
                  )}
                  {t("إرسال رمز التحقق", "Send Verification Code")}
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
                  <label className="text-xs font-medium text-foreground/80" data-testid="label-employee-otp">
                    {t("رمز التحقق", "Verification Code")}
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="------"
                      value={otp}
                      onChange={(e) => {
                        setOtp(e.target.value.replace(/\D/g, ""));
                        setError("");
                      }}
                      className="ps-10 h-12 text-center tracking-[0.4em] text-lg font-mono"
                      maxLength={6}
                      dir="ltr"
                      autoFocus
                      data-testid="input-employee-otp"
                      onKeyDown={(e) => e.key === "Enter" && handleVerifyOTP()}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {t("أدخل الرمز المكون من 6 أرقام", "Enter the 6-digit code")}
                  </p>
                </div>

                <Button
                  onClick={handleVerifyOTP}
                  disabled={loading || otp.length < 6}
                  className="w-full h-11 text-sm font-medium"
                  data-testid="button-employee-verify"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : null}
                  {t("تأكيد الدخول", "Confirm Login")}
                </Button>

                <div className="flex items-center justify-center pt-1">
                  <button
                    onClick={handleResendOTP}
                    disabled={countdown > 0}
                    className="text-xs text-muted-foreground hover:text-primary disabled:opacity-50 disabled:cursor-default transition-colors flex items-center gap-1.5"
                    data-testid="button-employee-resend"
                  >
                    <RotateCcw className="w-3 h-3" />
                    {countdown > 0
                      ? t(`إعادة الإرسال بعد ${countdown} ث`, `Resend in ${countdown}s`)
                      : t("إعادة إرسال الرمز", "Resend Code")}
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
