import { useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { useTheme } from "@/components/theme-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  Loader2, Search, Package, Truck, Wrench, CheckCircle2,
  Clock, Factory, Shield, Sun, Moon, ArrowRight, ArrowLeft
} from "lucide-react";
import teakLogo from "@assets/image_1772704803717.png";

const statusSteps = [
  { key: "pending", ar: "في الانتظار", en: "Pending", icon: Clock },
  { key: "in_production", ar: "قيد التصنيع", en: "In Production", icon: Factory },
  { key: "quality_check", ar: "فحص الجودة", en: "Quality Check", icon: Shield },
  { key: "ready", ar: "جاهز للتسليم", en: "Ready", icon: Package },
  { key: "shipped", ar: "تم الشحن", en: "Shipped", icon: Truck },
  { key: "delivered", ar: "تم التوصيل", en: "Delivered", icon: Truck },
  { key: "installed", ar: "تم التركيب", en: "Installed", icon: Wrench },
  { key: "completed", ar: "مكتمل", en: "Completed", icon: CheckCircle2 },
];

export default function TrackOrderPage() {
  const { t, lang, toggleLang } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [contractNumber, setContractNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const currentLogo = teakLogo;
  const ArrowIcon = lang === "ar" ? ArrowLeft : ArrowRight;

  const handleSearch = async () => {
    if (!contractNumber || !phone) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch(`/api/track-order?contractNumber=${encodeURIComponent(contractNumber)}&phone=${encodeURIComponent(phone)}`);
      if (!res.ok) {
        const err = await res.json();
        setError(err.message || t("لم يتم العثور على الطلب", "Order not found"));
        return;
      }
      setResult(await res.json());
    } catch {
      setError(t("حدث خطأ في الاتصال", "Connection error"));
    } finally {
      setLoading(false);
    }
  };

  const getStepIndex = (status: string) => statusSteps.findIndex(s => s.key === status);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/">
            <img src={currentLogo} alt="Teak" className="h-8 object-contain cursor-pointer" data-testid="img-track-logo" />
          </Link>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={toggleLang} data-testid="button-track-lang">
              <span className="text-xs font-bold">{lang === "ar" ? "EN" : "ع"}</span>
            </Button>
            <Button size="icon" variant="ghost" onClick={toggleTheme} data-testid="button-track-theme">
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="text-center space-y-2">
          <Package className="w-12 h-12 mx-auto text-primary" />
          <h1 className="text-2xl font-bold" data-testid="text-track-title">{t("تتبع طلبك", "Track Your Order")}</h1>
          <p className="text-muted-foreground text-sm">{t("أدخل رقم العقد ورقم الجوال المسجل", "Enter your contract number and registered phone")}</p>
        </div>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("رقم العقد", "Contract Number")}</label>
              <Input
                value={contractNumber}
                onChange={e => setContractNumber(e.target.value)}
                placeholder={t("مثال: CNT-001", "e.g. CNT-001")}
                data-testid="input-track-contract"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("رقم الجوال", "Phone Number")}</label>
              <Input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder={t("05xxxxxxxx", "05xxxxxxxx")}
                data-testid="input-track-phone"
              />
            </div>
            <Button className="w-full" onClick={handleSearch} disabled={loading || !contractNumber || !phone} data-testid="button-track-search">
              {loading ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <Search className="w-4 h-4 me-2" />}
              {t("بحث", "Search")}
            </Button>
          </CardContent>
        </Card>

        {error && (
          <Card className="border-destructive">
            <CardContent className="p-4 text-center text-destructive" data-testid="text-track-error">
              {error}
            </CardContent>
          </Card>
        )}

        {result && (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-lg">{t("تفاصيل الطلب", "Order Details")}</h2>
                  <Badge variant="secondary">{result.contractNumber}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">{t("العميل", "Customer")}:</span><p className="font-medium">{result.customerName}</p></div>
                  <div><span className="text-muted-foreground">{t("حالة العقد", "Contract Status")}:</span><p className="font-medium">{t(result.status === "active" ? "نشط" : result.status === "completed" ? "مكتمل" : "ملغي", result.status)}</p></div>
                </div>
              </CardContent>
            </Card>

            {result.workOrders && result.workOrders.length > 0 && (
              <Card>
                <CardContent className="p-4 space-y-4">
                  <h3 className="font-bold">{t("حالة التصنيع", "Manufacturing Status")}</h3>
                  {result.workOrders.map((wo: any, i: number) => {
                    const currentIdx = getStepIndex(wo.status);
                    return (
                      <div key={i} className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{t("أمر عمل", "Work Order")} #{wo.orderNumber}</span>
                          <Badge className="bg-primary/10 text-primary">{t(statusSteps.find(s => s.key === wo.status)?.ar || wo.status, statusSteps.find(s => s.key === wo.status)?.en || wo.status)}</Badge>
                        </div>
                        <div className="flex items-center gap-1 overflow-x-auto pb-2">
                          {statusSteps.map((step, idx) => {
                            const StepIcon = step.icon;
                            const isComplete = idx <= currentIdx;
                            const isCurrent = idx === currentIdx;
                            return (
                              <div key={step.key} className="flex items-center shrink-0">
                                <div className={`flex flex-col items-center gap-1 ${isCurrent ? "scale-110" : ""}`}>
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isComplete ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"} ${isCurrent ? "ring-2 ring-primary ring-offset-2" : ""}`}>
                                    <StepIcon className="w-4 h-4" />
                                  </div>
                                  <span className={`text-[9px] text-center max-w-[50px] leading-tight ${isComplete ? "text-primary font-medium" : "text-muted-foreground"}`}>{t(step.ar, step.en)}</span>
                                </div>
                                {idx < statusSteps.length - 1 && (
                                  <div className={`w-4 h-0.5 mx-0.5 mt-[-14px] ${idx < currentIdx ? "bg-primary" : "bg-muted"}`} />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

          </div>
        )}
      </main>
    </div>
  );
}

