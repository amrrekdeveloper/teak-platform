import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { ChevronRight, ChevronLeft, Home, Loader2, Trash2, Plus, Minus, Map, X, Lightbulb } from "lucide-react";
import { useProgress } from "@react-three/drei";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/components/language-provider";
import DesktopGate from "@/components/kitchen-tool/desktop-gate";
import { ToolStages, ToolNav } from "@/components/kitchen-tool/tool-stages";
import StudioScene, { COVE_DROP } from "@/components/kitchen-tool/studio-scene";
import {
  useKitchenToolStore,
  type KitchenLayout,
} from "@/components/kitchen-tool/store";
import {
  FLOOR_OPTIONS,
  WALL_OPTIONS,
  CEILING_OPTIONS,
  ENVIRONMENT_OPTIONS,
  type MaterialOption,
} from "@/components/kitchen-tool/materials";
import KitchenPlanSvg, { getWallSegments } from "@/components/kitchen-tool/plan-svg";
import {
  CABINET_DEFS,
  findCabinetDef,
  findSlotForCabinet,
  findCornerSlot,
  type CabinetDef,
  type CabinetLevel,
} from "@/components/kitchen-tool/cabinets";

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

function MaterialSwatch({
  opt,
  active,
  onSelect,
  group,
}: {
  opt: MaterialOption;
  active: boolean;
  onSelect: () => void;
  group: string;
}) {
  const { t } = useLanguage();
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex flex-col items-center gap-1 shrink-0 focus:outline-none group`}
      title={t(opt.nameAr, opt.nameEn)}
      data-testid={`button-material-${group}-${opt.id}`}
    >
      <span
        className={`block w-11 h-11 rounded-lg border-2 overflow-hidden transition-all ${
          active
            ? "border-primary ring-2 ring-primary/30 scale-105"
            : "border-border group-hover:border-primary/50"
        }`}
        style={!opt.thumb ? { backgroundColor: opt.color } : undefined}
      >
        {opt.thumb && (
          <img
            src={opt.thumb}
            alt={t(opt.nameAr, opt.nameEn)}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        )}
      </span>
      <span
        className={`text-[10px] leading-tight font-bold max-w-[64px] text-center ${
          active ? "text-primary" : "text-muted-foreground"
        }`}
      >
        {t(opt.nameAr, opt.nameEn)}
      </span>
    </button>
  );
}

function MaterialBar() {
  const { t } = useLanguage();
  const floorMaterialId = useKitchenToolStore((s) => s.floorMaterialId);
  const wallMaterialId = useKitchenToolStore((s) => s.wallMaterialId);
  const setFloorMaterial = useKitchenToolStore((s) => s.setFloorMaterial);
  const setWallMaterial = useKitchenToolStore((s) => s.setWallMaterial);
  const ceilingMaterialId = useKitchenToolStore((s) => s.ceilingMaterialId);
  const setCeilingMaterial = useKitchenToolStore((s) => s.setCeilingMaterial);
  const environmentId = useKitchenToolStore((s) => s.environmentId);
  const setEnvironment = useKitchenToolStore((s) => s.setEnvironment);
  const lightsOn = useKitchenToolStore((s) => s.lightsOn ?? false);
  const lightTemp = useKitchenToolStore((s) => s.lightTemp ?? "warm");
  const toggleLights = useKitchenToolStore((s) => s.toggleLights);
  const setLightTemp = useKitchenToolStore((s) => s.setLightTemp);
  const showSoffit = useKitchenToolStore((s) => s.showSoffit ?? true);
  const setShowSoffit = useKitchenToolStore((s) => s.setShowSoffit);
  const [tab, setTab] = useState<"materials" | "ambiance">("materials");

  return (
    <div
      className="rounded-xl border border-border bg-card px-4 py-3"
      data-testid="bar-studio-materials"
    >
      <div className="flex items-center gap-2 mb-3">
        {(
          [
            { id: "materials", ar: "الخامات والألوان", en: "Materials & Colors" },
            { id: "ambiance", ar: "الإضاءة والأجواء", en: "Lighting & Ambiance" },
          ] as const
        ).map((tb) => (
          <button
            key={tb.id}
            type="button"
            onClick={() => setTab(tb.id)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${
              tab === tb.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
            }`}
            data-testid={`button-materialbar-tab-${tb.id}`}
          >
            {t(tb.ar, tb.en)}
          </button>
        ))}
      </div>
      {tab === "materials" && (
      <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs font-bold text-foreground whitespace-nowrap">
          {t("الأرضية:", "Floor:")}
        </span>
        <div className="flex items-start gap-2 flex-wrap">
          {FLOOR_OPTIONS.map((opt) => (
            <MaterialSwatch
              key={opt.id}
              opt={opt}
              group="floor"
              active={opt.id === floorMaterialId}
              onSelect={() => setFloorMaterial(opt.id)}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs font-bold text-foreground whitespace-nowrap">
          {t("الجدران:", "Walls:")}
        </span>
        <div className="flex items-start gap-2 flex-wrap">
          {WALL_OPTIONS.map((opt) => (
            <MaterialSwatch
              key={opt.id}
              opt={opt}
              group="wall"
              active={opt.id === wallMaterialId}
              onSelect={() => setWallMaterial(opt.id)}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs font-bold text-foreground whitespace-nowrap">
          {t("السقف:", "Ceiling:")}
        </span>
        <div className="flex items-start gap-2 flex-wrap">
          {CEILING_OPTIONS.map((opt) => (
            <MaterialSwatch
              key={opt.id}
              opt={opt}
              group="ceiling"
              active={opt.id === ceilingMaterialId}
              onSelect={() => setCeilingMaterial(opt.id)}
            />
          ))}
        </div>
      </div>
      </div>
      )}
      {tab === "ambiance" && (
      <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs font-bold text-foreground whitespace-nowrap">
          {t("الإضاءة والأجواء:", "Lighting & Ambiance:")}
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          {ENVIRONMENT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setEnvironment(opt.id)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${
                opt.id === environmentId
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
              data-testid={`button-environment-${opt.id}`}
            >
              {t(opt.nameAr, opt.nameEn)}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={toggleLights}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${
            lightsOn
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
          }`}
          data-testid="button-toggle-lights"
        >
          <Lightbulb className="w-3.5 h-3.5" />
          {lightsOn ? t("تشغيل الإضاءة", "Lights on") : t("بدون إضاءة", "Lights off")}
        </button>
        {lightsOn && (
          <div className="flex items-center gap-1.5">
            {(
              [
                { id: "warm", nameAr: "دافئ", nameEn: "Warm", swatch: "#ffcc80" },
                { id: "cool", nameAr: "بارد", nameEn: "Cool", swatch: "#eaf2ff" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setLightTemp(opt.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-colors ${
                  lightTemp === opt.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                }`}
                data-testid={`button-light-temp-${opt.id}`}
              >
                <span
                  className="w-3 h-3 rounded-full border border-border"
                  style={{ backgroundColor: opt.swatch }}
                />
                {t(opt.nameAr, opt.nameEn)}
              </button>
            ))}
          </div>
        )}
        <label
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-bold text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors cursor-pointer select-none"
          data-testid="label-toggle-soffit"
        >
          <input
            type="checkbox"
            checked={showSoffit}
            onChange={(e) => setShowSoffit(e.target.checked)}
            className="accent-primary w-3.5 h-3.5"
            data-testid="checkbox-toggle-soffit"
          />
          {t("إظهار صندوق الجبس فوق الخزائن", "Show cabinet soffit box")}
        </label>
      </div>
      </div>
      )}
    </div>
  );
}

function CabinetCatalog({
  onAdd,
}: {
  onAdd: (def: CabinetDef) => void;
}) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<CabinetLevel>("base");
  const items = CABINET_DEFS.filter((d) => d.level === tab);

  return (
    <div
      className="w-56 shrink-0 rounded-xl border border-border bg-card flex flex-col overflow-hidden"
      data-testid="panel-cabinet-catalog"
    >
      <div className="flex border-b border-border">
        {(
          [
            { id: "base" as const, ar: "سفلية", en: "Base" },
            { id: "upper" as const, ar: "علوية", en: "Wall" },
          ]
        ).map((tb) => (
          <button
            key={tb.id}
            type="button"
            onClick={() => setTab(tb.id)}
            className={`flex-1 py-2.5 text-sm font-bold transition-colors ${
              tab === tb.id
                ? "bg-primary/10 text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`tab-cabinets-${tb.id}`}
          >
            {t(tb.ar, tb.en)}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
        {items.map((def) => (
          <button
            key={def.id}
            type="button"
            onClick={() => onAdd(def)}
            className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-start hover:border-primary/60 hover:bg-primary/5 transition-colors"
            data-testid={`button-add-cabinet-${def.id}`}
          >
            <span className="min-w-0">
              <span className="block text-xs font-bold leading-tight">
                {t(def.nameAr, def.nameEn)}
              </span>
              <span className="block text-[10px] text-muted-foreground mt-0.5">
                {Math.round(def.width * 100)} {t("سم", "cm")}
                {def.corner ? t(" • ركن", " • corner") : ""}
              </span>
            </span>
            <Plus className="w-4 h-4 shrink-0 text-primary" />
          </button>
        ))}
      </div>
      <p className="px-3 py-2 text-[10px] text-muted-foreground border-t border-border leading-relaxed">
        {t(
          "اضغط لإضافة الخزانة، ثم اسحبها في المشهد لتحريكها على الجدران.",
          "Click to add a cabinet, then drag it in the scene to move it along the walls."
        )}
      </p>
    </div>
  );
}

export default function KitchenToolStudioPage() {
  const { t, isRTL } = useLanguage();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { answers, walls, ceilingHeight, openings, utilities, ensureWalls } =
    useKitchenToolStore();
  const placedCabinets = useKitchenToolStore((s) => s.placedCabinets ?? []);
  const addPlacedCabinet = useKitchenToolStore((s) => s.addPlacedCabinet);
  const removePlacedCabinet = useKitchenToolStore((s) => s.removePlacedCabinet);
  const clearPlacedCabinets = useKitchenToolStore((s) => s.clearPlacedCabinets);
  const setPlacedCabinetHeight = useKitchenToolStore((s) => s.setPlacedCabinetHeight);
  const [selectedCabinetId, setSelectedCabinetId] = useState<string | null>(null);
  const [showPlan, setShowPlan] = useState(true);
  const layout: KitchenLayout = answers.layout ?? "L";
  const BackIcon = isRTL ? ChevronRight : ChevronLeft;

  const segments = useMemo(() => getWallSegments(layout, walls), [layout, walls]);

  useEffect(() => {
    ensureWalls(layout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  const handleAddCabinet = (def: CabinetDef) => {
    const slot = def.corner
      ? findCornerSlot(def, placedCabinets, segments, openings)
      : findSlotForCabinet(def, placedCabinets, segments, openings);
    if (!slot) {
      toast({
        title: def.corner
          ? t("لا يوجد ركن متاح", "No free corner")
          : t("لا توجد مساحة كافية", "Not enough space"),
        description: def.corner
          ? t(
              "الوحدات الركنية تُركّب فقط في زاوية بين جدارين متاحة.",
              "Corner units only fit in a free corner between two walls."
            )
          : t(
              "الجدران ممتلئة — احذف خزانة أو حرّك الموجود لإفساح مكان.",
              "The walls are full — remove or move a cabinet to make room."
            ),
        variant: "destructive",
      });
      return;
    }
    const id = `cab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    addPlacedCabinet({ id, catalogId: def.id, wallId: slot.wallId, offset: slot.offset });
    setSelectedCabinetId(id);
  };

  const handleDeleteSelected = () => {
    if (!selectedCabinetId) return;
    removePlacedCabinet(selectedCabinetId);
    setSelectedCabinetId(null);
  };

  const selectedPlaced = selectedCabinetId
    ? placedCabinets.find((c) => c.id === selectedCabinetId)
    : undefined;
  const selectedDef = selectedPlaced
    ? findCabinetDef(selectedPlaced.catalogId)
    : undefined;

  const ceilingM = ceilingHeight / 100;
  const heightBounds = selectedDef
    ? {
        min: 0.9,
        max: Math.max(ceilingM - COVE_DROP - 0.03 - selectedDef.height, 0.9),
      }
    : null;
  const effectiveMountY =
    selectedPlaced && selectedDef
      ? selectedPlaced.mountY ?? selectedDef.mountY
      : 0;

  const nudgeHeight = (deltaM: number) => {
    if (!selectedPlaced || !selectedDef || !heightBounds) return;
    const next = Math.min(
      Math.max(effectiveMountY + deltaM, heightBounds.min),
      Math.max(heightBounds.max, heightBounds.min)
    );
    setPlacedCabinetHeight(selectedPlaced.id, next);
  };

  return (
    <DesktopGate>
      <div className="min-h-screen bg-background flex flex-col">
        <ToolNav homeTestId="link-studio-home" />
        <div className="max-w-6xl mx-auto w-full px-6 pt-6">
          <ToolStages current="studio" />
        </div>

        <div className="flex-1 w-full px-4 md:px-6 py-6 flex flex-col gap-4">
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
              {placedCabinets.length > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      className="font-bold"
                      data-testid="button-clear-cabinets"
                    >
                      <Trash2 className="w-4 h-4 me-1" />
                      {t("حذف كل الخزائن", "Delete All Cabinets")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {t("حذف كل الخزائن؟", "Delete all cabinets?")}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {t(
                          `سيتم حذف ${placedCabinets.length} خزانة (علوية وسفلية) من التصميم. الجدران والأبواب والنوافذ لن تتأثر.`,
                          `${placedCabinets.length} cabinets (upper and base) will be removed from the design. Walls, doors and windows are not affected.`
                        )}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel data-testid="button-clear-cabinets-cancel">
                        {t("إلغاء", "Cancel")}
                      </AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => {
                          clearPlacedCabinets();
                          setSelectedCabinetId(null);
                        }}
                        data-testid="button-clear-cabinets-confirm"
                      >
                        {t("حذف الكل", "Delete All")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
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

          <MaterialBar />

          <div className="flex gap-4 h-[calc(100vh-340px)] min-h-[400px]">
            <div
              className="relative flex-1 rounded-xl overflow-hidden border border-border bg-muted/30"
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
                    selectedCabinetId={selectedCabinetId}
                    onSelectCabinet={setSelectedCabinetId}
                  />
                </Suspense>
              </SceneErrorBoundary>
              <div className="absolute bottom-3 start-3 z-10">
                {showPlan ? (
                  <div
                    className="rounded-lg border border-border bg-card/95 backdrop-blur shadow-md p-2 w-[280px]"
                    data-testid="panel-studio-plan"
                  >
                    <div className="flex items-center justify-between mb-1 px-1">
                      <span className="text-[11px] font-bold text-muted-foreground">
                        {t("المخطط ثنائي الأبعاد", "2D Plan")}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowPlan(false)}
                        className="text-muted-foreground hover:text-foreground"
                        data-testid="button-hide-plan"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <KitchenPlanSvg
                      layout={layout}
                      walls={walls}
                      openings={openings}
                      utilities={utilities}
                      placedCabinets={placedCabinets}
                      t={t}
                      className="w-full max-h-[200px] pointer-events-none"
                    />
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="font-bold bg-card/95 backdrop-blur"
                    onClick={() => setShowPlan(true)}
                    data-testid="button-show-plan"
                  >
                    <Map className="w-4 h-4 me-1" />
                    {t("المخطط", "2D Plan")}
                  </Button>
                )}
              </div>
              {selectedCabinetId && selectedDef && (
                <div
                  className="absolute top-3 start-3 z-10 flex items-center gap-2 rounded-lg border border-border bg-card/95 backdrop-blur px-3 py-2 shadow-md"
                  data-testid="bar-selected-cabinet"
                >
                  <span className="text-xs font-bold" data-testid="text-selected-cabinet">
                    {t(selectedDef.nameAr, selectedDef.nameEn)}
                  </span>
                  {selectedDef.level === "upper" && (
                    <div
                      className="flex items-center gap-1 border-e border-border pe-2 me-1"
                      data-testid="control-cabinet-height"
                    >
                      <span className="text-[10px] text-muted-foreground font-bold whitespace-nowrap">
                        {t("الارتفاع من الأرضية (سم)", "Height from floor (cm)")}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 w-7 p-0"
                        onClick={() => nudgeHeight(-0.05)}
                        data-testid="button-height-down"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </Button>
                      <span
                        className="text-xs font-bold tabular-nums w-8 text-center"
                        data-testid="text-cabinet-height"
                      >
                        {Math.round(effectiveMountY * 100)}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 w-7 p-0"
                        onClick={() => nudgeHeight(0.05)}
                        data-testid="button-height-up"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 px-2 font-bold"
                    onClick={handleDeleteSelected}
                    data-testid="button-delete-cabinet"
                  >
                    <Trash2 className="w-3.5 h-3.5 me-1" />
                    {t("حذف", "Delete")}
                  </Button>
                </div>
              )}
            </div>
            <CabinetCatalog onAdd={handleAddCabinet} />
          </div>
        </div>
        <div className="pb-6" />
      </div>
    </DesktopGate>
  );
}
