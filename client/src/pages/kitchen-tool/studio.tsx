import { Component, Suspense, useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { ChevronRight, ChevronLeft, Home, Loader2 } from "lucide-react";
import { useProgress } from "@react-three/drei";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/language-provider";
import DesktopGate from "@/components/kitchen-tool/desktop-gate";
import { ToolStages, ToolNav } from "@/components/kitchen-tool/tool-stages";
import StudioScene from "@/components/kitchen-tool/studio-scene";
import {
  useKitchenToolStore,
  type KitchenLayout,
} from "@/components/kitchen-tool/store";

function LoadingOverlay() {
  const { t } = useLanguage();
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-background/85 backdrop-blur-sm rounded-xl"
      data-testid="overlay-studio-loading"
    >
      <Loader2 className="w-10 h-10 text-primary animate-spin" />
      <p className="font-bold text-lg">
        {t("جاري تجهيز الاستوديو ثلاثي الأبعاد...", "Preparing the 3D studio...")}
      </p>
      <p className="text-sm text-muted-foreground" data-testid="text-loading-progress">
        {t(`${Math.round(progress)}٪`, `${Math.round(progress)}%`)}
      </p>
    </div>
  );
}

class SceneErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function SceneFallback() {
  const { t } = useLanguage();
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-8"
      data-testid="fallback-studio-3d"
    >
      <p className="font-bold text-lg">
        {t("تعذّر تشغيل العرض ثلاثي الأبعاد", "The 3D view could not start")}
      </p>
      <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
        {t(
          "يبدو أن هذا الجهاز أو المتصفح لا يدعم WebGL. جرّب متصفحاً أو جهازاً آخر — بياناتك محفوظة ولن تفقد شيئاً.",
          "This device or browser does not seem to support WebGL. Try another browser or device — your data is saved."
        )}
      </p>
    </div>
  );
}

export default function KitchenToolStudioPage() {
  const { t, isRTL } = useLanguage();
  const [, setLocation] = useLocation();
  const { answers, walls, ceilingHeight, openings, utilities, ensureWalls } =
    useKitchenToolStore();
  const layout: KitchenLayout = answers.layout ?? "L";
  const BackIcon = isRTL ? ChevronRight : ChevronLeft;

  useEffect(() => {
    ensureWalls(layout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  return (
    <DesktopGate>
      <div className="min-h-screen bg-background flex flex-col">
        <ToolNav homeTestId="link-studio-home" />
        <div className="max-w-6xl mx-auto w-full px-6 pt-6">
          <ToolStages current="studio" />
        </div>

        <div className="flex-1 max-w-6xl mx-auto w-full px-6 py-6 flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-studio-title">
                {t("الاستوديو ثلاثي الأبعاد", "3D Studio")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t(
                  "مطبخك بمقاساتك الحقيقية — حرّك الفأرة للدوران وعجلة التمرير للتقريب.",
                  "Your kitchen at real scale — drag to orbit and scroll to zoom."
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setLocation("/kitchen-designer/utilities")}
                className="font-bold"
                data-testid="button-studio-back"
              >
                <BackIcon className="w-4 h-4 me-1" />
                {t("السابق", "Back")}
              </Button>
              <a href="/" data-testid="link-studio-home-cta">
                <Button variant="ghost" className="font-bold">
                  <Home className="w-4 h-4 me-1" />
                  {t("الرئيسية", "Home")}
                </Button>
              </a>
            </div>
          </div>

          <div
            className="relative flex-1 min-h-[520px] rounded-xl overflow-hidden border border-border bg-muted/30"
            data-testid="container-studio-3d"
          >
            <SceneErrorBoundary fallback={<SceneFallback />}>
              <LoadingOverlay />
              <Suspense fallback={null}>
                <StudioScene
                  layout={layout}
                  walls={walls}
                  ceilingHeight={ceilingHeight}
                  openings={openings}
                  utilities={utilities}
                />
              </Suspense>
            </SceneErrorBoundary>
          </div>
        </div>
        <div className="pb-6" />
      </div>
    </DesktopGate>
  );
}
