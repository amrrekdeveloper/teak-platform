import { Ruler, ArrowRight, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/language-provider";
import DesktopGate from "@/components/kitchen-tool/desktop-gate";

export default function KitchenToolDimensionsPage() {
  const { t } = useLanguage();

  return (
    <DesktopGate>
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
        <div className="relative mb-8">
          <div className="absolute inset-0 rounded-full bg-primary/10 blur-2xl scale-150" />
          <div className="relative w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
            <Ruler className="w-11 h-11 text-primary" />
          </div>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold mb-4" data-testid="text-dimensions-title">
          {t("قريباً — المرحلة التالية", "Coming Soon — Next Phase")}
        </h1>
        <p className="text-muted-foreground max-w-md leading-relaxed mb-10" data-testid="text-dimensions-message">
          {t(
            "تم حفظ تفضيلاتك بنجاح. في المرحلة القادمة ستتمكن من إدخال أبعاد مطبخك وبدء التصميم ثلاثي الأبعاد.",
            "Your preferences have been saved. In the next phase you will enter your kitchen dimensions and start the 3D design."
          )}
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <a href="/kitchen-designer/setup" data-testid="link-dimensions-back">
            <Button size="lg" variant="outline" className="font-bold min-w-[180px]">
              <ArrowRight className="w-4 h-4 me-2 rtl:rotate-0 ltr:rotate-180" />
              {t("تعديل إجاباتي", "Edit My Answers")}
            </Button>
          </a>
          <a href="/" data-testid="link-dimensions-home">
            <Button size="lg" className="font-bold min-w-[180px]">
              <Home className="w-4 h-4 me-2" />
              {t("العودة للرئيسية", "Back to Home")}
            </Button>
          </a>
        </div>
      </div>
    </DesktopGate>
  );
}
