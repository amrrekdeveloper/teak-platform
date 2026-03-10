import { useState, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { LoadingTransition } from "@/components/loading-transition";
import { useTheme } from "@/components/theme-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { QuoteProductCategory } from "@shared/schema";
import { Sun, Moon, Loader2, CheckCircle2, ArrowLeft, ArrowRight, MapPin } from "lucide-react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import teakLogo from "@assets/TEAK-LOGO_(1)_(1)_1772710617816.png";

export default function RequestQuotePage() {
  const { lang, toggleLang, t, isRTL } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [showTransition, setShowTransition] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);

  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    city: "",
    productInterest: "",
  });

  const { data: productCategories } = useQuery<QuoteProductCategory[]>({
    queryKey: ["/api/quote-product-categories"],
  });

  const [errors, setErrors] = useState<{ fullName?: string; phone?: string }>({});

  const namePattern = /^[\u0600-\u06FF\u0750-\u077Fa-zA-Z\s\-']+$/;
  const phonePattern = /^05\d{8}$/;

  const validateName = (value: string): string | undefined => {
    if (!value.trim()) {
      return t("الاسم مطلوب", "Name is required");
    }
    if (!namePattern.test(value)) {
      return t("يرجى إدخال حروف عربية أو إنجليزية فقط", "Please enter Arabic or English letters only");
    }
    return undefined;
  };

  const validatePhone = (value: string): string | undefined => {
    if (!value.trim()) {
      return t("رقم الجوال مطلوب", "Phone number is required");
    }
    if (!phonePattern.test(value)) {
      return t("يرجى إدخال رقم جوال صحيح (05XXXXXXXX)", "Please enter a valid phone number (05XXXXXXXX)");
    }
    return undefined;
  };

  const handleNameChange = (value: string) => {
    setForm({ ...form, fullName: value });
    if (errors.fullName) {
      setErrors({ ...errors, fullName: validateName(value) });
    }
  };

  const handleNameBlur = () => {
    if (form.fullName) {
      setErrors({ ...errors, fullName: validateName(form.fullName) });
    }
  };

  const handlePhoneChange = (value: string) => {
    const digitsOnly = value.replace(/\D/g, "");
    setForm({ ...form, phone: digitsOnly });
    if (errors.phone) {
      setErrors({ ...errors, phone: validatePhone(digitsOnly) });
    }
  };

  const handlePhoneBlur = () => {
    if (form.phone) {
      setErrors({ ...errors, phone: validatePhone(form.phone) });
    }
  };

  const validateForm = (): boolean => {
    const nameError = validateName(form.fullName);
    const phoneError = validatePhone(form.phone);
    setErrors({ fullName: nameError, phone: phoneError });
    return !nameError && !phoneError;
  };

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await fetch("/api/quote-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => setShowTransition(true),
  });

  const handleDetectCity = () => {
    if (!navigator.geolocation) {
      toast({
        title: t("خطأ", "Error"),
        description: t("المتصفح لا يدعم تحديد الموقع", "Geolocation is not supported by your browser"),
        variant: "destructive",
      });
      return;
    }

    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const acceptLang = lang === "ar" ? "ar" : "en";
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=${acceptLang}`,
            { headers: { "User-Agent": "TeakManufacturing/1.0" } }
          );
          if (!res.ok) throw new Error("Geocoding failed");
          const data = await res.json();
          const city =
            data.address?.city ||
            data.address?.town ||
            data.address?.village ||
            data.address?.state ||
            "";
          if (city) {
            setForm((prev) => ({ ...prev, city }));
          } else {
            toast({
              title: t("تنبيه", "Notice"),
              description: t("لم نتمكن من تحديد المدينة", "Could not determine your city"),
              variant: "destructive",
            });
          }
        } catch {
          toast({
            title: t("خطأ", "Error"),
            description: t("فشل في تحديد المدينة", "Failed to detect city"),
            variant: "destructive",
          });
        } finally {
          setGeoLoading(false);
        }
      },
      (error) => {
        setGeoLoading(false);
        let message: string;
        switch (error.code) {
          case error.PERMISSION_DENIED:
            message = t("تم رفض إذن الوصول للموقع", "Location permission denied");
            break;
          case error.POSITION_UNAVAILABLE:
            message = t("معلومات الموقع غير متوفرة", "Location information unavailable");
            break;
          case error.TIMEOUT:
            message = t("انتهت مهلة طلب الموقع", "Location request timed out");
            break;
          default:
            message = t("فشل في تحديد الموقع", "Failed to detect location");
        }
        toast({
          title: t("خطأ", "Error"),
          description: message,
          variant: "destructive",
        });
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  };

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  return (
    <div className="min-h-screen bg-background" dir={isRTL ? "rtl" : "ltr"}>
      <LoadingTransition
        show={showTransition}
        message={t("جاري إرسال طلبك...", "Submitting your request...")}
        subMessage={t("يتم حفظ بيانات الطلب", "Saving your request details")}
        duration={1500}
        onComplete={() => { setShowTransition(false); setSubmitted(true); }}
      />
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/">
              <div className="flex items-center gap-2 cursor-pointer" data-testid="link-home">
                <BackIcon className="w-4 h-4" />
                <img src={teakLogo} alt="Teak" className="w-8 h-8 object-contain logo-auto transition-all duration-300" />
                <span className="font-bold hidden sm:inline">{t("تيك للتصنيع", "Teak Manufacturing")}</span>
              </div>
            </Link>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" onClick={toggleLang} data-testid="button-lang">
                <span className="text-xs font-bold">{lang === "ar" ? "EN" : "ع"}</span>
              </Button>
              <Button size="icon" variant="ghost" onClick={toggleTheme} data-testid="button-theme">
                {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-lg mx-auto px-4 py-12">
        <AnimatePresence mode="wait">
          {submitted ? (
            <motion.div
              key="success"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center py-16"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
              >
                <CheckCircle2 className="w-20 h-20 mx-auto text-green-500 mb-6" />
              </motion.div>
              <h2 className="text-2xl font-bold mb-2" data-testid="text-success-title">
                {t("تم إرسال طلبك بنجاح!", "Your request has been submitted!")}
              </h2>
              <p className="text-muted-foreground mb-8">
                {t(
                  "سيتواصل معك فريق المبيعات في أقرب وقت ممكن",
                  "Our sales team will contact you as soon as possible"
                )}
              </p>
              <div className="flex gap-3 justify-center flex-wrap">
                <Link href="/">
                  <Button variant="outline" data-testid="button-back-home">
                    {t("الصفحة الرئيسية", "Home")}
                  </Button>
                </Link>
                <Link href="/portal/login">
                  <Button variant="default" data-testid="button-customer-portal">
                    {t("بوابة العملاء", "Customer Portal")}
                  </Button>
                </Link>
                <Link href="/products">
                  <Button variant="outline" data-testid="button-view-products">
                    {t("تصفح المنتجات", "Browse Products")}
                  </Button>
                </Link>
              </div>
            </motion.div>
          ) : (
            <motion.div key="form" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <Card>
                <CardHeader className="text-center">
                  <img src={teakLogo} alt="Teak" className="w-16 h-16 mx-auto mb-2 object-contain logo-auto transition-all duration-300" />
                  <CardTitle className="text-2xl" data-testid="text-form-title">
                    {t("طلب عرض سعر", "Request a Quote")}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t("أخبرنا بما تحتاجه وسنتواصل معك", "Tell us what you need and we'll reach out")}
                  </p>
                </CardHeader>
                <CardContent>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!validateForm()) return;
                      mutation.mutate(form);
                    }}
                    className="space-y-4"
                  >
                    <div className="space-y-2">
                      <Label>{t("الاسم الكامل", "Full Name")} *</Label>
                      <Input
                        value={form.fullName}
                        onChange={(e) => handleNameChange(e.target.value)}
                        onBlur={handleNameBlur}
                        className={errors.fullName ? "border-destructive" : ""}
                        data-testid="input-name"
                      />
                      {errors.fullName && (
                        <p className="text-sm text-destructive" data-testid="text-error-name">{errors.fullName}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>{t("رقم الجوال", "Phone Number")} *</Label>
                      <Input
                        value={form.phone}
                        onChange={(e) => handlePhoneChange(e.target.value)}
                        onBlur={handlePhoneBlur}
                        type="tel"
                        inputMode="numeric"
                        maxLength={10}
                        placeholder="05XXXXXXXX"
                        dir="ltr"
                        className={errors.phone ? "border-destructive" : ""}
                        data-testid="input-phone"
                      />
                      {errors.phone && (
                        <p className="text-sm text-destructive" data-testid="text-error-phone">{errors.phone}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>{t("المدينة", "City")}</Label>
                      <div className="flex gap-2">
                        <Input
                          value={form.city}
                          onChange={(e) => setForm({ ...form, city: e.target.value })}
                          className="flex-1"
                          data-testid="input-city"
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          onClick={handleDetectCity}
                          disabled={geoLoading}
                          data-testid="button-detect-city"
                        >
                          {geoLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <MapPin className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("المنتج المطلوب", "Product Interest")}</Label>
                      <Select
                        value={form.productInterest}
                        onValueChange={(v) => setForm({ ...form, productInterest: v })}
                      >
                        <SelectTrigger data-testid="select-product">
                          <SelectValue placeholder={t("اختر المنتج", "Select product")} />
                        </SelectTrigger>
                        <SelectContent>
                          {(productCategories || [])
                            .filter(c => c.active)
                            .map(cat => (
                              <SelectItem key={cat.id} value={String(cat.id)}>
                                {t(cat.nameAr, cat.nameEn)}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={mutation.isPending}
                      data-testid="button-submit"
                    >
                      {mutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        t("إرسال الطلب", "Submit Request")
                      )}
                    </Button>
                    {mutation.isError && (
                      <p className="text-sm text-destructive text-center" data-testid="text-error">
                        {t("حدث خطأ، يرجى المحاولة مرة أخرى", "An error occurred, please try again")}
                      </p>
                    )}
                  </form>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
