import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2, Phone, Lock, ChevronLeft, CheckCircle2 } from "lucide-react";
import teakLogo from "@assets/TEAK-LOGO_(1)_(1)_1772710617816.png";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";

type Step = "phone" | "pin" | "done";

export default function FinanceLoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [fetchedPin, setFetchedPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [error, setError] = useState("");

  const lookupMutation = useMutation({
    mutationFn: async (phone: string) => {
      const res = await apiRequest("POST", "/api/finance-auth/lookup", { phone });
      return res.json() as Promise<{ nameAr: string; pin: string }>;
    },
    onSuccess: (data) => {
      setNameAr(data.nameAr);
      setFetchedPin(data.pin);
      setStep("pin");
      setError("");
    },
    onError: (err: any) => {
      const msg = err?.message || "رقم الجوال غير مسجّل كمحاسب في النظام";
      setError(msg);
    },
  });

  const loginMutation = useMutation({
    mutationFn: ({ phone, pin }: { phone: string; pin: string }) =>
      apiRequest("POST", "/api/finance-auth/login", { phone, pin }),
    onSuccess: async () => {
      setStep("done");
      await qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setTimeout(() => setLocation("/finance"), 1200);
    },
    onError: (err: any) => {
      const msg = err?.message || "كلمة المرور غير صحيحة";
      setError(msg);
    },
  });

  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const cleaned = phone.trim().replace(/\s/g, "");
    if (!cleaned) return;
    lookupMutation.mutate(cleaned);
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!pinInput.trim()) return;
    loginMutation.mutate({ phone: phone.trim(), pin: pinInput.trim() });
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4"
      dir="rtl"
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center ring-2 ring-primary/20">
            <img
              src={teakLogo}
              alt="Teak"
              className="w-12 h-12 object-contain logo-auto"
              data-testid="img-finance-logo"
            />
          </div>
          <h1 className="text-2xl font-bold" data-testid="text-finance-login-title">
            النظام المالي
          </h1>
          <p className="text-sm text-muted-foreground mt-1">تيك للتصنيع — دخول المحاسبين</p>
        </div>

        <div className="bg-card border rounded-2xl shadow-sm p-6 space-y-5">
          <AnimatePresence mode="wait">
            {step === "phone" && (
              <motion.div
                key="phone"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
              >
                <form onSubmit={handlePhoneSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="finance-phone" className="text-sm font-medium">
                      رقم الجوال
                    </Label>
                    <div className="relative">
                      <Phone className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="finance-phone"
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="05XXXXXXXX"
                        className="h-11 pr-10 text-left font-mono"
                        dir="ltr"
                        autoFocus
                        data-testid="input-finance-phone"
                      />
                    </div>
                  </div>

                  {error && (
                    <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg" data-testid="text-finance-error">
                      {error}
                    </p>
                  )}

                  <Button
                    type="submit"
                    className="w-full h-11"
                    disabled={lookupMutation.isPending || !phone.trim()}
                    data-testid="btn-finance-lookup"
                  >
                    {lookupMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin ml-2" />
                    ) : null}
                    متابعة
                  </Button>
                </form>
              </motion.div>
            )}

            {step === "pin" && (
              <motion.div
                key="pin"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
              >
                <form onSubmit={handlePinSubmit} className="space-y-4">
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                      <span className="text-primary font-bold text-sm">
                        {nameAr.slice(0, 1)}
                      </span>
                    </div>
                    <div>
                      <p className="font-semibold text-sm" data-testid="text-finance-name">{nameAr}</p>
                      <p className="text-xs text-muted-foreground">محاسب</p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">كلمة المرور الحالية</Label>
                      <button
                        type="button"
                        onClick={() => setShowPin(!showPin)}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                        data-testid="btn-toggle-pin-visibility"
                      >
                        {showPin ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        {showPin ? "إخفاء" : "إظهار"}
                      </button>
                    </div>
                    <div className="flex items-center gap-2 bg-muted/60 border rounded-lg px-3 py-2.5">
                      <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span
                        className="font-mono text-sm tracking-widest flex-1"
                        data-testid="text-current-pin"
                      >
                        {showPin ? fetchedPin : "•".repeat(fetchedPin.length)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      يمكنك تغيير كلمة المرور من داخل لوحتك بعد الدخول
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="finance-pin" className="text-sm font-medium">
                      أدخل كلمة المرور
                    </Label>
                    <Input
                      id="finance-pin"
                      type="password"
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                      placeholder="أدخل كلمة المرور"
                      className="h-11 font-mono tracking-widest text-center"
                      autoFocus
                      data-testid="input-finance-pin"
                    />
                  </div>

                  {error && (
                    <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg" data-testid="text-finance-pin-error">
                      {error}
                    </p>
                  )}

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11"
                      onClick={() => { setStep("phone"); setError(""); setPinInput(""); }}
                      data-testid="btn-finance-back"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1 h-11"
                      disabled={loginMutation.isPending || !pinInput.trim()}
                      data-testid="btn-finance-login"
                    >
                      {loginMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin ml-2" />
                      ) : null}
                      دخول النظام المالي
                    </Button>
                  </div>
                </form>
              </motion.div>
            )}

            {step === "done" && (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-4 space-y-3"
              >
                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
                <p className="font-semibold text-lg">أهلاً {nameAr}</p>
                <p className="text-sm text-muted-foreground">جاري الانتقال إلى النظام المالي...</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          للدخول عبر حسابك الرئيسي{" "}
          <button
            onClick={() => setLocation("/login")}
            className="text-primary hover:underline"
            data-testid="link-main-login"
          >
            انقر هنا
          </button>
        </p>
      </div>
    </div>
  );
}
