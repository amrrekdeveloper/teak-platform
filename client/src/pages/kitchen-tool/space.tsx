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
  type MeasureAccuracy,
} from "@/components/kitchen-tool/store";

const LAYOUT_OPTIONS: { value: KitchenLayout; ar: string; en: string }[] = [
  { value: "L", ar: "حرف L", en: "L-Shape" },
  { value: "I", ar: "جدار واحد", en: "Single Wall" },
  { value: "U", ar: "حرف U", en: "U-Shape" },
  { value: "parallel", ar: "جداران متقابلان", en: "Two Facing Walls" },
];

export default function KitchenToolSpacePage({ v2 = false }: { v2?: boolean }) {
  const { t, isRTL } = useLanguage();
  const [, setLocation] = useLocation();
  const {
    answers,
    walls,
    closed,
    measureAccuracy,
    ceilingHeight,
    openings,
    setAnswer,
    ensureWalls,
    setClosed,
    setMeasureAccuracy,
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
        <ToolNav homeTestId="link-space-home" />

        <div className="max-w-6xl mx-auto w-full px-6 pt-6">
          <ToolStages current="space" v2={v2} />
        </div>

        <div className="flex-1 max-w-6xl mx-auto w-full px-6 py-8 grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-8 items-start">
          {/* Controls */}
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold mb-1" data-testid="text-space-title">
                {t("المساحة", "The Space")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t(
                  "اختر شكل توزيع المطبخ وأدخل مقاسات جدران الغرفة — تتحدث المعاينة مباشرة.",
                  "Pick the kitchen layout and enter the room wall measurements — the preview updates live."
                )}
              </p>
            </div>

            <div className="space-y-2">
              <Label className="font-bold">{t("شكل توزيع المطبخ", "Kitchen Layout")}</Label>
              <div className="grid grid-cols-2 gap-2">
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
                  data-testid="toggle-close-room-space"
                >
                  <input
                    type="checkbox"
                    checked={closed}
                    onChange={(e) => setClosed(e.target.checked)}
                    className="w-4 h-4 accent-primary"
                    data-testid="checkbox-close-room-space"
                  />
                  <span className="text-sm font-bold">
                    {t("غرفة مغلقة بالكامل", "Fully closed room")}
                  </span>
                </label>
              )}
            </div>

            <div className="space-y-4">
              <Label className="font-bold block">
                {t("مقاسات جدران الغرفة", "Room Wall Measurements")}
              </Label>
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

            <div className="pt-2 border-t border-border/60 space-y-2">
              <Label className="font-bold">{t("دقة القياسات", "Measurement Accuracy")}</Label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: "exact", ar: "مقاسات دقيقة", en: "Precise" },
                  { value: "approx", ar: "مقاسات تقريبية", en: "Approximate" },
                ] as { value: MeasureAccuracy; ar: string; en: string }[]).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setMeasureAccuracy(opt.value)}
                    className={`rounded-lg border-2 px-2 py-2 text-sm font-bold transition-colors ${
                      measureAccuracy === opt.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40"
                    }`}
                    data-testid={`button-accuracy-${opt.value}`}
                  >
                    {t(opt.ar, opt.en)}
                  </button>
                ))}
              </div>
              {measureAccuracy === "approx" && (
                <p className="text-xs text-muted-foreground" data-testid="text-accuracy-note">
                  {t(
                    "سيقوم فريق تيك بأخذ المقاسات النهائية الدقيقة قبل التصنيع.",
                    "The Teak team will take final precise measurements before manufacturing."
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Live preview: 2D top plan */}
          <div className="bg-card border border-border rounded-xl p-4 xl:p-6 min-h-[480px] flex flex-col">
            <div className="flex items-center justify-end mb-3">
              <span className="text-sm font-bold text-muted-foreground" data-testid="text-preview-plan-label">
                {t("مسقط علوي", "Top Plan")}
              </span>
            </div>
            <div className="flex-1 flex items-center justify-center">
              <KitchenPlanSvg
                layout={layout}
                walls={walls}
                openings={openings}
                t={t}
                className="w-full max-h-[520px]"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-border/50 bg-background">
          <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
            <Button
              variant="outline"
              size="lg"
              onClick={() => setLocation("/kitchen-designer")}
              className="font-bold min-w-[130px]"
              data-testid="button-space-back"
            >
              <BackIcon className="w-4 h-4 me-1" />
              {t("السابق", "Back")}
            </Button>
            <Button
              size="lg"
              onClick={() => setLocation(v2 ? "/kitchen-designer-v2/details" : "/kitchen-designer/details")}
              className="font-bold min-w-[130px]"
              data-testid="button-space-next"
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
