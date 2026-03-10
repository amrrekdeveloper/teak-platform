import { useState, useCallback, useEffect, useRef } from "react";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Phone, KeyRound, ArrowLeft, Loader2, Shield, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { auth, RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from "@/lib/firebase";
import teakLogo from "@assets/TEAK-LOGO_(1)_(1)_1772710617816.png";

export default function CustomerPortalLogin() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);

  const confirmationRef = useRef<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    return () => {
      if (recaptchaRef.current) {
        try { recaptchaRef.current.clear(); } catch (_e) {}
        recaptchaRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const setupRecaptcha = useCallback(() => {
    if (recaptchaRef.current) {
      recaptchaRef.current.clear();
      recaptchaRef.current = null;
    }
    recaptchaRef.current = new RecaptchaVerifier(auth, "recaptcha-container", {
      size: "invisible",
      callback: () => {},
      "expired-callback": () => {
        setError(t("انتهت صلاحية التحقق. أعد المحاولة", "Verification expired. Try again"));
      },
    });
    return recaptchaRef.current;
  }, [t]);

  const formatPhoneForFirebase = (localPhone: string): string => {
    let cleaned = localPhone.replace(/\D/g, "");
    if (cleaned.startsWith("0")) cleaned = cleaned.substring(1);
    return `+966${cleaned}`;
  };

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
      const verifyRes = await fetch("/api/customer-auth/verify-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: digits }),
      });

      if (!verifyRes.ok) {
        const data = await verifyRes.json();
        setError(lang === "ar" ? data.message : (data.messageEn || data.message));
        setLoading(false);
        return;
      }

      const verifyData = await verifyRes.json();
      setCustomerName(verifyData.name || "");

      const recaptchaVerifier = setupRecaptcha();
      const firebasePhone = formatPhoneForFirebase(digits);
      const confirmation = await signInWithPhoneNumber(auth, firebasePhone, recaptchaVerifier);
      confirmationRef.current = confirmation;

      setStep("otp");
      setCountdown(60);
      toast({
        title: t("تم الإرسال", "Code Sent"),
        description: t("تم إرسال رمز التحقق عبر رسالة نصية SMS", "Verification code sent via SMS"),
      });
    } catch (error: any) {
      console.error("Firebase send OTP error:", error);
      let msg = t("حدث خطأ في إرسال الرمز", "Error sending verification code");
      if (error?.code === "auth/too-many-requests") {
        msg = t("محاولات كثيرة. حاول لاحقاً", "Too many attempts. Try again later");
      } else if (error?.code === "auth/invalid-phone-number") {
        msg = t("رقم الجوال غير صحيح", "Invalid phone number");
      } else if (error?.code === "auth/quota-exceeded") {
        msg = t("تم تجاوز حد الإرسال. حاول لاحقاً", "SMS quota exceeded. Try again later");
      }
      setError(msg);

      if (recaptchaRef.current) {
        try { recaptchaRef.current.clear(); } catch (_e) {}
        recaptchaRef.current = null;
      }
    } finally {
      setLoading(false);
    }
  }, [phone, toast, t, lang, setupRecaptcha]);

  const handleVerifyOTP = useCallback(async () => {
    if (!otp.trim() || otp.length < 6) return;

    if (!confirmationRef.current) {
      setError(t("أعد إرسال رمز التحقق", "Please resend the verification code"));
      return;
    }

    setError("");
    setLoading(true);

    try {
      const result = await confirmationRef.current.confirm(otp.trim());
      const idToken = await result.user.getIdToken();

      const res = await fetch("/api/customer-auth/firebase-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(lang === "ar" ? data.message : (data.messageEn || data.message));
        return;
      }

      if (recaptchaRef.current) {
        try { recaptchaRef.current.clear(); } catch (_e) {}
        recaptchaRef.current = null;
      }
      sessionStorage.setItem("portalPhone", phone.trim());
      sessionStorage.setItem("portalCustomerName", data.name || customerName);
      toast({
        title: t("مرحباً", "Welcome"),
        description: t(`مرحباً ${data.name || customerName}`, `Welcome ${data.name || customerName}`),
      });
      window.location.href = "/portal";
    } catch (error: any) {
      console.error("Firebase verify OTP error:", error);
      let msg = t("رمز التحقق غير صحيح", "Invalid verification code");
      if (error?.code === "auth/invalid-verification-code") {
        msg = t("رمز التحقق غير صحيح. تأكد من إدخال الرمز الصحيح", "Invalid verification code. Make sure you entered the correct code");
      } else if (error?.code === "auth/code-expired") {
        msg = t("انتهت صلاحية الرمز. أعد الإرسال", "Code expired. Please resend");
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [otp, phone, customerName, toast, t, lang]);

  const handleResendOTP = useCallback(() => {
    setStep("phone");
    setOtp("");
    setError("");
    confirmationRef.current = null;
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted flex items-center justify-center p-4" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <img src={teakLogo} alt="Teak" className="w-24 h-24 mx-auto object-contain mb-4 logo-auto transition-all duration-300" data-testid="img-portal-logo" />
          <h1 className="text-2xl font-bold" data-testid="text-portal-title">
            {t("بوابة العملاء", "Customer Portal")}
          </h1>
          <p className="text-muted-foreground mt-2">
            {t("تيك للتصنيع — متابعة طلباتك", "Teak Manufacturing — Track Your Orders")}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shield className="w-5 h-5 text-primary" />
              {step === "phone"
                ? t("تسجيل الدخول", "Sign In")
                : t("رمز التحقق", "Verification Code")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-start gap-2" data-testid="text-error">
                <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {step === "phone" ? (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium" data-testid="label-phone">
                    {t("رقم الجوال", "Phone Number")}
                  </label>
                  <div className="relative">
                    <Phone className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="tel"
                      placeholder={t("05xxxxxxxx", "05xxxxxxxx")}
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value.replace(/\D/g, ""));
                        setError("");
                      }}
                      className="ps-10"
                      dir="ltr"
                      maxLength={10}
                      data-testid="input-phone"
                      onKeyDown={(e) => e.key === "Enter" && handleSendOTP()}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("أدخل رقم الجوال المسجل لدينا — سيتم إرسال رمز التحقق عبر SMS", "Enter your registered phone number — a verification code will be sent via SMS")}
                  </p>
                </div>
                <Button
                  onClick={handleSendOTP}
                  disabled={loading || !phone.trim()}
                  className="w-full"
                  data-testid="button-send-otp"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : null}
                  {t("إرسال رمز التحقق", "Send Verification Code")}
                </Button>
              </>
            ) : (
              <>
                {customerName && (
                  <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-center">
                    <p className="text-sm text-muted-foreground">{t("مرحباً", "Welcome")}</p>
                    <p className="font-semibold text-lg" data-testid="text-customer-name">{customerName}</p>
                  </div>
                )}

                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <p className="text-sm text-blue-800 dark:text-blue-200 text-center">
                    {t(
                      "تم إرسال رمز التحقق عبر رسالة نصية SMS إلى رقمك",
                      "A verification code has been sent via SMS to your phone number"
                    )}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" data-testid="label-otp">
                    {t("رمز التحقق", "Verification Code")}
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="123456"
                      value={otp}
                      onChange={(e) => {
                        setOtp(e.target.value.replace(/\D/g, ""));
                        setError("");
                      }}
                      className="ps-10 text-center tracking-widest text-lg"
                      maxLength={6}
                      dir="ltr"
                      data-testid="input-otp"
                      onKeyDown={(e) => e.key === "Enter" && handleVerifyOTP()}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("أدخل الرمز المكون من 6 أرقام", "Enter the 6-digit code")}
                  </p>
                </div>
                <Button
                  onClick={handleVerifyOTP}
                  disabled={loading || otp.length < 6}
                  className="w-full"
                  data-testid="button-verify-otp"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : null}
                  {t("تأكيد", "Verify")}
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    onClick={handleResendOTP}
                    disabled={countdown > 0}
                    className="flex-1"
                    data-testid="button-resend"
                  >
                    <ArrowLeft className="w-4 h-4 me-2" />
                    {countdown > 0
                      ? t(`إعادة الإرسال بعد ${countdown} ثانية`, `Resend in ${countdown}s`)
                      : t("إعادة إرسال الرمز", "Resend Code")}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div id="recaptcha-container" data-testid="recaptcha-container"></div>

        <div className="text-center">
          <Button variant="link" onClick={() => window.location.href = "/"} data-testid="link-home">
            {t("العودة للموقع الرئيسي", "Back to Main Site")}
          </Button>
        </div>
      </div>
    </div>
  );
}
