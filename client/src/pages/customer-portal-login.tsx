import { useState, useCallback } from "react";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Phone, KeyRound, ArrowLeft, Loader2, Shield, MessageCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import logoAr from "@assets/logo_teak1_1772689915503.png";
import logoEn from "@assets/logo_teak2_1772689894105.png";

export default function CustomerPortalLogin() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const currentLogo = lang === "ar" ? logoAr : logoEn;

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [whatsappPhone, setWhatsappPhone] = useState("");

  const handleSendOTP = useCallback(async () => {
    if (!phone.trim()) {
      toast({ title: t("خطأ", "Error"), description: t("أدخل رقم الجوال", "Enter phone number"), variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/customer-auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast({
          title: t("خطأ", "Error"),
          description: data.message || data.messageEn || t("حدث خطأ", "An error occurred"),
          variant: "destructive",
        });
        return;
      }

      setCustomerName(data.name || "");
      setWhatsappPhone(data.whatsappHint || "");
      setStep("otp");
      toast({
        title: t("تم الإرسال", "Code Sent"),
        description: t("سيتم إرسال رمز التحقق عبر الواتساب", "Verification code will be sent via WhatsApp"),
      });
    } catch (error) {
      console.error("Send OTP Error:", error);
      toast({
        title: t("خطأ", "Error"),
        description: t("حدث خطأ في إرسال الرمز", "Error sending verification code"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [phone, toast, t]);

  const handleVerifyOTP = useCallback(async () => {
    if (!otp.trim() || otp.length < 6) return;

    setLoading(true);
    try {
      const res = await fetch("/api/customer-auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), code: otp.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast({
          title: t("خطأ", "Error"),
          description: data.message || data.messageEn || t("رمز التحقق غير صحيح", "Invalid verification code"),
          variant: "destructive",
        });
        return;
      }

      sessionStorage.setItem("portalPhone", phone.trim());
      sessionStorage.setItem("portalCustomerName", data.name || customerName);
      toast({
        title: t("مرحباً", "Welcome"),
        description: t(`مرحباً ${data.name || customerName}`, `Welcome ${data.name || customerName}`),
      });
      window.location.href = "/portal";
    } catch (error) {
      console.error("Verify OTP Error:", error);
      toast({
        title: t("خطأ", "Error"),
        description: t("حدث خطأ في التحقق", "Error verifying code"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [otp, phone, customerName, toast, t]);

  const whatsappMessage = t(
    `مرحباً، أحتاج رمز التحقق لبوابة العملاء. رقمي: ${whatsappPhone}`,
    `Hello, I need my portal verification code. My number: ${whatsappPhone}`
  );
  const whatsappLink = `https://wa.me/966558090498?text=${encodeURIComponent(whatsappMessage)}`;

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

                <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3">
                  <p className="text-sm text-green-800 dark:text-green-200 text-center mb-2">
                    {t(
                      "سيتم إرسال رمز التحقق عبر الواتساب من فريق تيك",
                      "The verification code will be sent via WhatsApp by the Teak team"
                    )}
                  </p>
                  <a
                    href={whatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 text-sm font-medium text-green-700 dark:text-green-300 hover:underline"
                    data-testid="link-whatsapp-otp"
                  >
                    <MessageCircle className="w-4 h-4" />
                    {t("تواصل عبر الواتساب لاستلام الرمز", "Contact via WhatsApp to receive code")}
                  </a>
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
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
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
    </div>
  );
}
