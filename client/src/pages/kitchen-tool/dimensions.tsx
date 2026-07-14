import { useEffect } from "react";
import { useLocation } from "wouter";
import { ChevronRight, ChevronLeft, Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/components/language-provider";
import DesktopGate from "@/components/kitchen-tool/desktop-gate";
import KitchenPlanSvg, { wallLabelAr, wallLabelEn } from "@/components/kitchen-tool/plan-svg";
import { ToolStages, ToolNav } from "@/components/kitchen-tool/tool-stages";
import {
  useKitchenToolStore,
  clampWallLength,
  clampCeilingHeight,
  WALL_MIN,
  WALL_MAX,
  CEILING_MIN,
  CEILING_MAX,
  canCloseLayout,
  isSyncedWall,
  type KitchenLayout,
} from "@/components/kitchen-tool/store";

const LAYOUT_OPTIONS: { value: KitchenLayout; ar: string; en: string }[] = [
  { value: "I", ar: "حرف I", en: "I-Shape" },
  { value: "L", ar: "حرف L", en: "L-Shape" },
  { value: "U", ar: "حرف U", en: "U-Shape" },
  { value: "parallel", ar: "على الجانبين", en: "Two Sides" },
];

export default function KitchenToolDimensionsPage() {
  const { t, isRTL } = useLanguage();
  const [, setLocation] = useLocation();
  const {
    answers,
    walls,
    closed,
    ceilingHeight,
    openings,
    setAnswer,
    ensureWalls,
    setClosed,
    setWallLength,
    setCeilingHeight,
  } = useKitchenToolStore();

  const layout: KitchenLayout = answers.layout ?? "L";

  useEffect(() => {
    if (!answers.layout) {
      setAnswer("layout", "L");
    }
    ensureWalls(layout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  const changeLayout = (value: KitchenLayout) => {
    setAnswer("layout", value);
    ensureWalls(value);
  };

  const BackIcon = isRTL ? ChevronRight : ChevronLeft;
  const NextIcon = isRTL ? ChevronLeft : ChevronRight;

  return (
    <DesktopGate>
      <div className="min-h-screen bg-background flex flex-col">
        <ToolNav homeTestId="link-dimensions-home" />

        <div className="max-w-6xl mx-auto w-full px-6 pt-6">
          <ToolStages current="dimensions" />
        </div>

        <div className="flex-1 max-w-6xl mx-auto w-full px-6 py-8 grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-8 items-start">
          {/* Controls */}
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold mb-1" data-testid="text-dimensions-title">
                {t("مقاسات المطبخ", "Kitchen Dimensions")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t(
                  "أدخل أطوال الجدران بالسنتيمتر وسيتحدّث المخطط مباشرة.",
                  "Enter wall lengths in centimeters — the plan updates live."
                )}
              </p>
            </div>

            <div className="space-y-2">
              <Label className="font-bold">{t("شكل التوزيع", "Layout")}</Label>
              <div className="grid grid-cols-4 gap-2">
                {LAYOUT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => changeLayout(opt.value)}
                    className={`rounded-lg border-2 px-2 py-2 text-sm font-bold transition-colors ${
                      layout === opt.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40"
                    }`}
                    data-testid={`button-layout-${opt.value}`}
                  >
                    {t(opt.ar, opt.en)}
                  </button>
                ))}
              </div>
              {canCloseLayout(layout) && (
                <label
                  className="mt-2 flex items-center gap-2 cursor-pointer"
                  data-testid="toggle-close-room-dimensions"
                >
                  <input
                    type="checkbox"
                    checked={closed}
                    onChange={(e) => setClosed(e.target.checked)}
                    className="w-4 h-4 accent-primary"
                    data-testid="checkbox-close-room-dimensions"
                  />
                  <span className="text-sm font-bold">
                    {t("أغلق الغرفة بالكامل", "Fully close the room")}
                  </span>
                </label>
              )}
            </div>

            <div className="space-y-4">
              {walls.map((wall) => {
                const synced = isSyncedWall(layout, closed, wall.id);
                return (
                <div key={wall.id} className="space-y-1.5">
                  <Label htmlFor={`wall-${wall.id}`} className="font-bold flex items-center gap-2">
                    <Ruler className="w-4 h-4 text-primary" />
                    {t(wallLabelAr(wall.id), wallLabelEn(wall.id))}
                    <span className="text-xs text-muted-foreground font-normal">
                      ({t("سم", "cm")})
                    </span>
                  </Label>
                  <Input
                    id={`wall-${wall.id}`}
                    type="number"
                    inputMode="numeric"
                    min={WALL_MIN}
                    max={WALL_MAX}
                    value={Number.isFinite(wall.length) ? wall.length : ""}
                    onChange={(e) => setWallLength(wall.id, e.target.valueAsNumber)}
                    onBlur={(e) =>
                      setWallLength(wall.id, clampWallLength(e.target.valueAsNumber))
                    }
                    disabled={synced}
                    className="text-lg font-bold disabled:opacity-60"
                    data-testid={`input-wall-${wall.id}`}
                  />
                  <p className="text-xs text-muted-foreground">
                    {synced
                      ? t("يتحدد تلقائيًا عند إغلاق الغرفة", "Set automatically when the room is closed")
                      : t(`من ${WALL_MIN} إلى ${WALL_MAX} سم`, `${WALL_MIN} to ${WALL_MAX} cm`)}
                  </p>
                </div>
                );
              })}
            </div>

            <div className="pt-2 border-t border-border/60">
              <div className="flex items-center gap-3">
                <Label htmlFor="ceiling-height" className="text-sm text-muted-foreground whitespace-nowrap">
                  {t("ارتفاع السقف (سم)", "Ceiling height (cm)")}
                </Label>
                <Input
                  id="ceiling-height"
                  type="number"
                  inputMode="numeric"
                  min={CEILING_MIN}
                  max={CEILING_MAX}
                  value={Number.isFinite(ceilingHeight) ? ceilingHeight : ""}
                  onChange={(e) => setCeilingHeight(e.target.valueAsNumber)}
                  onBlur={(e) => setCeilingHeight(clampCeilingHeight(e.target.valueAsNumber))}
                  className="w-24 h-8 text-sm"
                  data-testid="input-ceiling-height"
                />
              </div>
            </div>
          </div>

          {/* Live plan */}
          <div className="bg-card border border-border rounded-xl p-4 xl:p-8 min-h-[420px] flex items-center justify-center">
            <KitchenPlanSvg
              layout={layout}
              walls={walls}
              openings={openings}
              t={t}
              className="w-full max-h-[560px]"
            />
          </div>
        </div>

        <div className="border-t border-border/50 bg-background">
          <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
            <Button
              variant="outline"
              size="lg"
              onClick={() => setLocation("/kitchen-designer/setup")}
              className="font-bold min-w-[130px]"
              data-testid="button-dimensions-back"
            >
              <BackIcon className="w-4 h-4 me-1" />
              {t("السابق", "Back")}
            </Button>
            <Button
              size="lg"
              onClick={() => setLocation("/kitchen-designer/openings")}
              className="font-bold min-w-[130px]"
              data-testid="button-dimensions-next"
            >
              {t("التالي", "Next")}
              <NextIcon className="w-4 h-4 ms-1" />
            </Button>
          </div>
        </div>
      </div>
    </DesktopGate>
  );
}
