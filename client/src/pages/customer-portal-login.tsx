import { useState, useCallback, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useLanguage } from "@/components/language-provider";
import { auth, RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Phone, KeyRound, ArrowLeft, Loader2, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import logoAr from "@assets/logo_teak1_1772689915503.png";
import logoEn from "@assets/logo_teak2_1772689894105.png";

export default function CustomerPortalLogin() {
  const { t, lang } = useLanguage();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const currentLogo = lang === "ar" ? logoAr : logoEn;

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [customerName, setCustomerName] = useState("");
  const recaptchaRef = useRef<HTMLDivElement>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    return () => {
      if (recaptchaVerifierRef.current) {
        try { recaptchaVerifierRef.current.clear(); } catch (_e) { /* ignore */ }
      }
    };
  }, []);

  const formatPhone = (input: string): string => {
    let cleaned = input.replace(/[^\d+]/g, "");
    if (cleaned.startsWith("05")) {
      cleaned = "+966" + cleaned.substring(1);
    } else if (cleaned.startsWith("5")) {
      cleaned = "+966" + cleaned;
    } else if (cleaned.startsWith("966")) {
      cleaned = "+" + cleaned;
    }
    return cleaned;
  };

  const verifyPhoneExists = async (phoneNumber: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/customer-auth/verify-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneNumber }),
      });
      if (res.ok) {
        const data = await res.json();
        setCustomerName(data.name || "");
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const handleSendOTP = useCallback(async () => {
    if (!phone.trim()) {
      toast({ title: t("خطأ", "Error"), description: t("أدخل رقم الجوال", "Enter phone number"), variant: "destructive" });
      return;
    }

    setLoading(true);
    const formattedPhone = formatPhone(phone);

    const exists = await verifyPhoneExists(formattedPhone);
    if (!exists) {
      toast({
        title: t("غير مسجل", "Not Registered"),
        description: t("رقم الجوال غير مسجل في النظام. تواصل مع المبيعات.", "Phone number not registered. Contact sales."),
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    try {
      if (recaptchaVerifierRef.current) {
        try { recaptchaVerifierRef.current.clear(); } catch (_e) { /* ignore */ }
      }

      recaptchaVerifierRef.current = new RecaptchaVerifier(auth, recaptchaRef.current!, {
        size: "invisible",
        callback: () => {},
      });

      const result = await signInWithPhoneNumber(auth, formattedPhone, recaptchaVerifierRef.current);
      setConfirmationResult(result);
      setStep("otp");
      toast({
        title: t("تم الإرسال", "Code Sent"),
        description: t("تم إرسال رمز التحقق إلى جوالك", "Verification code sent to your phone"),
      });
    } catch (error: any) {
      console.error("OTP Error:", error);
      let errorMessage = t("حدث خطأ في إرسال الرمز", "Error sending verification code");
      if (error.code === "auth/too-many-requests") {
        errorMessage = t("محاولات كثيرة. حاول لاحقاً", "Too many attempts. Try later");
      } else if (error.code === "auth/invalid-phone-number") {
        errorMessage = t("رقم الجوال غير صالح", "Invalid phone number");
      }
      toast({ title: t("خطأ", "Error"), description: errorMessage, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [phone, toast, t]);

  const handleVerifyOTP = useCallback(async () => {
    if (!otp.trim() || !confirmationResult) return;

    setLoading(true);
    try {
      await confirmationResult.confirm(otp);
      const formattedPhone = formatPhone(phone);
      sessionStorage.setItem("portalPhone", formattedPhone);
      sessionStorage.setItem("portalCustomerName", customerName);
      toast({
        title: t("مرحباً", "Welcome"),
        description: t(`مرحباً ${customerName}`, `Welcome ${customerName}`),
      });
      setLocation("/portal");
    } catch (error: any) {
      console.error("Verify Error:", error);
      toast({
        title: t("خطأ", "Error"),
        description: t("رمز التحقق غير صحيح", "Invalid verification code"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [otp, confirmationResult, phone, customerName, toast, t, setLocation]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted flex items-center justify-center p-4" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <img src={currentLogo} alt="Teak" className="w-24 h-24 mx-auto object-contain mb-4" data-testid="img-portal-logo" />
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
                      onChange={(e) => setPhone(e.target.value)}
                      className="ps-10"
                      dir="ltr"
                      data-testid="input-phone"
                      onKeyDown={(e) => e.key === "Enter" && handleSendOTP()}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("أدخل رقم الجوال المسجل لدينا", "Enter your registered phone number")}
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
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                      className="ps-10 text-center tracking-widest text-lg"
                      maxLength={6}
                      dir="ltr"
                      data-testid="input-otp"
                      onKeyDown={(e) => e.key === "Enter" && handleVerifyOTP()}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("أدخل الرمز المرسل إلى جوالك", "Enter the code sent to your phone")}
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
                <Button
                  variant="ghost"
                  onClick={() => { setStep("phone"); setOtp(""); }}
                  className="w-full"
                  data-testid="button-back"
                >
                  <ArrowLeft className="w-4 h-4 me-2" />
                  {t("رجوع", "Back")}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <div className="text-center">
          <Button variant="link" onClick={() => window.location.href = "/"} data-testid="link-home">
            {t("العودة للموقع الرئيسي", "Back to Main Site")}
          </Button>
        </div>
      </div>

      <div ref={recaptchaRef} id="recaptcha-container" />
    </div>
  );
}
