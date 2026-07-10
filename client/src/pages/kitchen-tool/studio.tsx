import { useLocation } from "wouter";
import { Box, ChevronRight, ChevronLeft, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/language-provider";
import DesktopGate from "@/components/kitchen-tool/desktop-gate";
import { ToolStages, ToolNav } from "@/components/kitchen-tool/tool-stages";

export default function KitchenToolStudioPage() {
  const { t, isRTL } = useLanguage();
  const [, setLocation] = useLocation();
  const BackIcon = isRTL ? ChevronRight : ChevronLeft;

  return (
    <DesktopGate>
      <div className="min-h-screen bg-background flex flex-col">
        <ToolNav homeTestId="link-studio-home" />
        <div className="max-w-6xl mx-auto w-full px-6 pt-6">
          <ToolStages current="studio" />
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="relative mb-8">
            <div className="absolute inset-0 rounded-full bg-primary/10 blur-2xl scale-150" />
            <div className="relative w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
              <Box className="w-11 h-11 text-primary" />
            </div>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-4" data-testid="text-studio-title">
            {t("قريباً — الاستوديو ثلاثي الأبعاد", "Coming Soon — 3D Studio")}
          </h1>
          <p className="text-muted-foreground max-w-md leading-relaxed mb-10" data-testid="text-studio-message">
            {t(
              "تم حفظ مقاسات مطبخك وفتحاته بنجاح. في المرحلة القادمة ستشاهد مطبخك بتصميم ثلاثي الأبعاد تفاعلي.",
              "Your kitchen dimensions and openings have been saved. In the next phase you will see your kitchen in an interactive 3D design."
            )}
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              size="lg"
              variant="outline"
              className="font-bold min-w-[180px]"
              onClick={() => setLocation("/kitchen-designer/utilities")}
              data-testid="button-studio-back"
            >
              <BackIcon className="w-4 h-4 me-2" />
              {t("العودة للفتحات", "Back to Openings")}
            </Button>
            <a href="/" data-testid="link-studio-home-cta">
              <Button size="lg" className="font-bold min-w-[180px]">
                <Home className="w-4 h-4 me-2" />
                {t("العودة للرئيسية", "Back to Home")}
              </Button>
            </a>
          </div>
        </div>
        <div className="pb-10" />
      </div>
    </DesktopGate>
  );
}
