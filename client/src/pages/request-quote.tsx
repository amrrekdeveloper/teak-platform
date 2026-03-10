import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/components/language-provider";
import { useTheme } from "@/components/theme-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sun, Moon, Loader2, CheckCircle2, ArrowLeft, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import teakLogo from "@assets/TEAK-LOGO_(1)_(1)_1772710617816.png";

export default function RequestQuotePage() {
  const { lang, toggleLang, t, isRTL } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [submitted, setSubmitted] = useState(false);

  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    city: "",
    productInterest: "",
    notes: "",
  });

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
    onSuccess: () => setSubmitted(true),
  });

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  return (
    <div className="min-h-screen bg-background" dir={isRTL ? "rtl" : "ltr"}>
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
                      mutation.mutate(form);
                    }}
                    className="space-y-4"
                  >
                    <div className="space-y-2">
                      <Label>{t("الاسم الكامل", "Full Name")} *</Label>
                      <Input
                        value={form.fullName}
                        onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                        required
                        data-testid="input-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("رقم الجوال", "Phone Number")} *</Label>
                      <Input
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        required
                        placeholder="05XXXXXXXX"
                        dir="ltr"
                        data-testid="input-phone"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("المدينة", "City")}</Label>
                      <Input
                        value={form.city}
                        onChange={(e) => setForm({ ...form, city: e.target.value })}
                        data-testid="input-city"
                      />
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
                          <SelectItem value="kitchen">{t("مطبخ", "Kitchen")}</SelectItem>
                          <SelectItem value="wardrobe">{t("خزانة ملابس", "Wardrobe")}</SelectItem>
                          <SelectItem value="door">{t("أبواب", "Doors")}</SelectItem>
                          <SelectItem value="decoration">{t("ديكورات", "Decorations")}</SelectItem>
                          <SelectItem value="hotel">{t("تجهيز فنادق", "Hotel Furnishing")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("ملاحظات إضافية", "Additional Notes")}</Label>
                      <Textarea
                        value={form.notes}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        rows={3}
                        data-testid="input-notes"
                      />
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
