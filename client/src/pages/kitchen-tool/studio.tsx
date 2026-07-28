import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { ChevronRight, ChevronLeft, ChevronUp, ChevronDown, Home, Loader2, Trash2, Plus, Minus, Map as MapIcon, X, Lightbulb, Play, Pause, Presentation, Maximize, Minimize, PersonStanding, Grid2x2, Box, RotateCcw, Archive, PanelTop, Sofa, Palette, LayoutGrid, Camera } from "lucide-react";
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
import StudioScene, { COVE_DROP, type CameraViewRequest } from "@/components/kitchen-tool/studio-scene";
import {
  useKitchenToolStore,
  type KitchenLayout,
} from "@/components/kitchen-tool/store";
import {
  FLOOR_OPTIONS,
  WALL_OPTIONS,
  CEILING_OPTIONS,
  ENVIRONMENT_OPTIONS,
  adekoFinishForWoodType,
  ADEKO_TOP_FINISHES,
  ADEKO_DOOR_COLORS,
  DEFAULT_DOOR_COLOR,
  type MaterialOption,
  type AdekoFinish,
} from "@/components/kitchen-tool/materials";
import KitchenPlanSvg, { getWallSegments, getFloorBounds } from "@/components/kitchen-tool/plan-svg";
import EngineeringSheetDialog from "@/components/kitchen-tool/engineering-sheet";
import {
  DECOR_ITEMS,
  DECOR_CATEGORY_LABELS,
  findDecorItem,
  type DecorItem,
  type DecorCategory,
} from "@/components/kitchen-tool/decor-items";
import {
  findCabinetDef,
  findSlotForCabinet,
  findCornerSlot,
  blockedIntervals,
  getJunctions,
  doorClashAdvice,
  registerAdekoDef,
  adekoDefFromProduct,
  adekoPriceForGrade,
  EXTRA_CABINET_DEFS,
  type AdekoProductRow,
  type CabinetDef,
  type CabinetLevel,
} from "@/components/kitchen-tool/cabinets";
import {
  KITCHEN_TEMPLATES,
  buildTemplateCabinets,
  type KitchenTemplate,
} from "@/components/kitchen-tool/templates";
import { useQuery } from "@tanstack/react-query";
import {
  CabinetThumbFactory,
  useCabinetThumb,
} from "@/components/kitchen-tool/cabinet-thumbs";

interface KitchenToolMaterial {
  id: number;
  nameAr: string;
  nameEn: string;
  pricePerMeter: string;
  category: string | null;
  grade?: "economy" | "standard" | "premium";
}


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

function TotalPriceBar({ overlay = false }: { overlay?: boolean }) {
  const { t } = useLanguage();
  const placedCabinets = useKitchenToolStore((s) => s.placedCabinets ?? []);
  const { data: woodMaterials } = useQuery<KitchenToolMaterial[]>({
    queryKey: ["/api/kitchen-tool/materials"],
    staleTime: 5 * 60 * 1000,
  });

  const { total, count } = useMemo(() => {
    let sum = 0;
    let n = 0;
    for (const p of placedCabinets) {
      const def = findCabinetDef(p.catalogId);
      if (!def?.adeko) continue;
      const mat = (woodMaterials ?? []).find((w) => w.id === p.finishWoodTypeId);
      sum += adekoPriceForGrade(def.adeko, mat?.grade);
      n++;
    }
    return { total: sum, count: n };
  }, [placedCabinets, woodMaterials]);

  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    setPulse(true);
    const id = setTimeout(() => setPulse(false), 500);
    return () => clearTimeout(id);
  }, [total]);

  return (
    <div
      className={`ms-auto flex items-center gap-3 rounded-lg border px-3 py-1.5 transition-all duration-300 ${
        pulse ? "border-primary bg-primary/15 scale-[1.03]" : "border-border bg-card"
      } ${overlay ? (pulse ? "opacity-100" : "opacity-60 hover:opacity-100") : ""}`}
      data-testid={overlay ? "bar-total-price-overlay" : "bar-total-price"}
    >
      <div className="flex flex-col items-end leading-tight">
        <span className="text-sm font-extrabold text-primary whitespace-nowrap" dir="ltr" data-testid="text-total-price">
          {total.toLocaleString(undefined, { maximumFractionDigits: 0 })} {t("ر.س", "SAR")}
        </span>
        <span className="text-[9px] text-muted-foreground whitespace-nowrap">
          {t("شامل الضريبة 15% — سعر تقريبي", "Incl. 15% VAT — approximate price")}
        </span>
      </div>
      <span
        className="text-[10px] font-bold text-muted-foreground whitespace-nowrap border-s border-border ps-3"
        data-testid="text-cabinet-count"
      >
        {count} {t("خزانة", count === 1 ? "cabinet" : "cabinets")}
      </span>
    </div>
  );
}

/** Side-panel: room materials (floor / walls / ceiling). */
function MaterialsPanel() {
  const { t } = useLanguage();
  const floorMaterialId = useKitchenToolStore((s) => s.floorMaterialId);
  const wallMaterialId = useKitchenToolStore((s) => s.wallMaterialId);
  const setFloorMaterial = useKitchenToolStore((s) => s.setFloorMaterial);
  const setWallMaterial = useKitchenToolStore((s) => s.setWallMaterial);
  const ceilingMaterialId = useKitchenToolStore((s) => s.ceilingMaterialId);
  const setCeilingMaterial = useKitchenToolStore((s) => s.setCeilingMaterial);

  return (
    <div
      className="flex-1 overflow-y-auto p-3 flex flex-col gap-4"
      data-testid="panel-studio-materials"
    >
      <div className="flex flex-col gap-2">
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
      <div className="flex flex-col gap-2">
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
      <div className="flex flex-col gap-2">
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
  );
}

/** Side-panel: lighting & ambiance controls. */
function AmbiancePanel() {
  const { t } = useLanguage();
  const environmentId = useKitchenToolStore((s) => s.environmentId);
  const setEnvironment = useKitchenToolStore((s) => s.setEnvironment);
  const lightsOn = useKitchenToolStore((s) => s.lightsOn ?? false);
  const lightTemp = useKitchenToolStore((s) => s.lightTemp ?? "warm");
  const toggleLights = useKitchenToolStore((s) => s.toggleLights);
  const setLightTemp = useKitchenToolStore((s) => s.setLightTemp);
  const showSoffit = useKitchenToolStore((s) => s.showSoffit ?? true);
  const ledStrips = useKitchenToolStore((s) => s.ledStrips ?? true);
  const setLedStrips = useKitchenToolStore((s) => s.setLedStrips);
  const setShowSoffit = useKitchenToolStore((s) => s.setShowSoffit);

  return (
    <div
      className="flex-1 overflow-y-auto p-3 flex flex-col gap-4"
      data-testid="panel-studio-ambiance"
    >
      {ENVIRONMENT_OPTIONS.length > 1 && (
      <div className="flex flex-col gap-2">
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
      )}
      <div className="flex flex-col items-stretch gap-2">
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
        <label
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-bold text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors cursor-pointer select-none"
          data-testid="label-toggle-led"
        >
          <input
            type="checkbox"
            checked={ledStrips}
            onChange={(e) => setLedStrips(e.target.checked)}
            className="accent-primary w-3.5 h-3.5"
            data-testid="checkbox-toggle-led"
          />
          {t("إضاءة LED أسفل الخزائن العلوية", "Under-cabinet LED strips")}
        </label>
      </div>
    </div>
  );
}

/* ── Right icon rail: studio categories (mockup layout) ──── */
type StudioCategory =
  | "base"
  | "upper"
  | "decor"
  | "materials"
  | "ambiance"
  | "templates"
  | "plan";

function StudioRail({
  active,
  onSelect,
}: {
  active: StudioCategory;
  onSelect: (c: StudioCategory) => void;
}) {
  const { t } = useLanguage();
  const items: { id: StudioCategory; icon: ReactNode; ar: string; en: string }[] = [
    { id: "base", icon: <Archive className="w-5 h-5" />, ar: "الخزائن السفلية", en: "Base Cabinets" },
    { id: "upper", icon: <PanelTop className="w-5 h-5" />, ar: "الخزائن العلوية", en: "Wall Cabinets" },
    { id: "decor", icon: <Sofa className="w-5 h-5" />, ar: "الديكور", en: "Decor" },
    { id: "materials", icon: <Palette className="w-5 h-5" />, ar: "الجدران والأرضيات", en: "Walls & Floors" },
    { id: "ambiance", icon: <Lightbulb className="w-5 h-5" />, ar: "الإضاءة", en: "Lighting" },
    { id: "templates", icon: <LayoutGrid className="w-5 h-5" />, ar: "القوالب", en: "Templates" },
    { id: "plan", icon: <MapIcon className="w-5 h-5" />, ar: "المخطط", en: "Plan" },
  ];
  return (
    <div
      className="w-[76px] shrink-0 rounded-xl border border-border bg-card py-2 px-1.5 flex flex-col items-stretch gap-1.5 overflow-y-auto"
      data-testid="rail-studio-categories"
    >
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={() => onSelect(it.id)}
          title={t(it.ar, it.en)}
          className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-2 transition-colors ${
            active === it.id
              ? "border-primary bg-primary/5 text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60"
          }`}
          data-testid={`button-rail-${it.id}`}
        >
          {it.icon}
          <span className="text-[9px] font-bold leading-tight text-center">
            {t(it.ar, it.en)}
          </span>
        </button>
      ))}
    </div>
  );
}

/* ── Bottom quick-finish bar: one-click finishes for the whole kitchen ── */
function QuickFinishBar() {
  const { t } = useLanguage();
  const placedCabinets = useKitchenToolStore((s) => s.placedCabinets ?? []);
  const updatePlacedCabinet = useKitchenToolStore((s) => s.updatePlacedCabinet);
  const [tab, setTab] = useState<"base" | "upper" | "tops" | "handles">("base");
  const [open, setOpen] = useState(true);

  const applyAll = (
    filter: (def: CabinetDef) => boolean,
    patch: Parameters<typeof updatePlacedCabinet>[1]
  ) => {
    for (const p of placedCabinets) {
      const def = findCabinetDef(p.catalogId);
      if (!def) continue;
      if (!filter(def)) continue;
      updatePlacedCabinet(p.id, patch);
    }
  };

  /** Common value across the filtered cabinets, or undefined when mixed/empty. */
  const commonValue = <K extends string | undefined>(
    filter: (def: CabinetDef) => boolean,
    pick: (p: (typeof placedCabinets)[number]) => K
  ): K | undefined => {
    let val: K | undefined;
    let seen = false;
    for (const p of placedCabinets) {
      const def = findCabinetDef(p.catalogId);
      if (!def || !filter(def)) continue;
      const v = pick(p);
      if (!seen) {
        val = v;
        seen = true;
      } else if (v !== val) return undefined;
    }
    return seen ? val : undefined;
  };

  const levelFilter = (level: CabinetLevel) => (def: CabinetDef) => def.level === level;
  const baseFilter = levelFilter("base");
  const upperFilter = levelFilter("upper");
  const allFilter = () => true;

  const tabs = [
    { id: "base" as const, ar: "الخزائن السفلية", en: "Base cabinets" },
    { id: "upper" as const, ar: "الخزائن العلوية", en: "Wall cabinets" },
    { id: "tops" as const, ar: "الأسطح", en: "Countertops" },
    { id: "handles" as const, ar: "المقابض", en: "Handles" },
  ];

  const doorTab = tab === "base" || tab === "upper";
  const doorFilter = tab === "base" ? baseFilter : upperFilter;
  const activeColor = doorTab
    ? commonValue(doorFilter, (p) => p.finishColor ?? DEFAULT_DOOR_COLOR.hex)
    : undefined;
  const activePattern = doorTab
    ? commonValue(doorFilter, (p) => p.doorPattern ?? "wood")
    : undefined;
  const activeTop = commonValue(baseFilter, (p) => p.topFinishId ?? ADEKO_TOP_FINISHES[0].id);
  const activeHandle = commonValue(allFilter, (p) => p.handleStyle ?? "bar");
  const activeHandleColor = commonValue(allFilter, (p) => p.handleColor ?? "gray");

  return (
    <div
      className="rounded-xl border border-border bg-card"
      data-testid="bar-quick-finishes"
    >
      <div className="flex items-center gap-1 px-3 pt-2">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            type="button"
            onClick={() => {
              setTab(tb.id);
              setOpen(true);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              tab === tb.id && open
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`button-finishbar-tab-${tb.id}`}
          >
            {t(tb.ar, tb.en)}
          </button>
        ))}
        <span className="ms-auto text-[10px] text-muted-foreground hidden md:block">
          {t("يُطبَّق على كل المطبخ بنقرة واحدة", "Applies to the whole kitchen in one click")}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ms-1 w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60"
          title={open ? t("طي الشريط", "Collapse") : t("فتح الشريط", "Expand")}
          data-testid="button-finishbar-toggle"
        >
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>
      {open && (
        <div className="px-3 pb-3 pt-2">
          {placedCabinets.length === 0 ? (
            <p className="text-[11px] text-muted-foreground py-1">
              {t(
                "أضف خزائن أو ابدأ من قالب جاهز لتغيير التشطيبات من هنا.",
                "Add cabinets or start from a template to change finishes here."
              )}
            </p>
          ) : doorTab ? (
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant={activePattern === "wood" ? "default" : "outline"}
                  className="h-7 px-3 text-[11px] font-bold"
                  onClick={() => applyAll(doorFilter, { doorPattern: "wood" })}
                  data-testid="button-finishbar-pattern-wood"
                >
                  {t("ملمس خشبي", "Wood grain")}
                </Button>
                <Button
                  size="sm"
                  variant={activePattern === "solid" ? "default" : "outline"}
                  className="h-7 px-3 text-[11px] font-bold"
                  onClick={() => applyAll(doorFilter, { doorPattern: "solid" })}
                  data-testid="button-finishbar-pattern-solid"
                >
                  {t("سادة", "Solid")}
                </Button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {ADEKO_DOOR_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    title={t(c.nameAr, c.nameEn)}
                    onClick={() => applyAll(doorFilter, { finishColor: c.hex })}
                    className={`flex flex-col items-center gap-0.5 group`}
                    data-testid={`button-finishbar-color-${c.hex.slice(1)}`}
                  >
                    <span
                      className={`w-9 h-9 rounded-lg border-2 transition-all ${
                        activeColor === c.hex
                          ? "border-primary ring-2 ring-primary/30 scale-105"
                          : "border-border group-hover:border-primary/50"
                      }`}
                      style={{ background: c.hex }}
                    />
                    <span
                      className={`text-[9px] font-bold leading-tight max-w-[52px] truncate ${
                        activeColor === c.hex ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {t(c.nameAr, c.nameEn)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : tab === "tops" ? (
            <div className="flex items-center gap-2 flex-wrap">
              {ADEKO_TOP_FINISHES.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  title={t(f.nameAr, f.nameEn)}
                  onClick={() => applyAll(baseFilter, { topFinishId: f.id })}
                  className="flex flex-col items-center gap-0.5 group"
                  data-testid={`button-finishbar-top-${f.id}`}
                >
                  <span
                    className={`w-9 h-9 rounded-lg border-2 transition-all ${
                      activeTop === f.id
                        ? "border-primary ring-2 ring-primary/30 scale-105"
                        : "border-border group-hover:border-primary/50"
                    }`}
                    style={{ background: f.swatch }}
                  />
                  <span
                    className={`text-[9px] font-bold leading-tight max-w-[56px] truncate ${
                      activeTop === f.id ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {t(f.nameAr, f.nameEn)}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <Button
                size="sm"
                variant={activeHandle === "bar" ? "default" : "outline"}
                className="h-7 px-3 text-[11px] font-bold"
                onClick={() => applyAll(allFilter, { handleStyle: "bar" })}
                data-testid="button-finishbar-handle-bar"
              >
                {t("مقبض", "Bar")}
              </Button>
              <Button
                size="sm"
                variant={activeHandle === "none" ? "default" : "outline"}
                className="h-7 px-3 text-[11px] font-bold"
                onClick={() => applyAll(allFilter, { handleStyle: "none" })}
                data-testid="button-finishbar-handle-none"
              >
                {t("بدون (ضغط للفتح)", "None (push-to-open)")}
              </Button>
              <div className="flex items-center gap-1.5">
                {(["black", "white", "gray"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => applyAll(allFilter, { handleColor: c, handleStyle: "bar" })}
                    className={`w-6 h-6 rounded-full border-2 ${
                      activeHandleColor === c && activeHandle === "bar"
                        ? "border-primary scale-110"
                        : "border-border"
                    }`}
                    style={{
                      background:
                        c === "black" ? "#232427" : c === "white" ? "#f2f2ef" : "#c9ccd1",
                    }}
                    data-testid={`button-finishbar-handle-color-${c}`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Strip size digits/codes so same-family English names collapse together. */
function familyEnglishName(nameEn: string): string {
  return nameEn
    .replace(/\b\d+(\s*[xX×]\s*\d+)*\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

interface CabinetFamily {
  key: string;
  nameAr: string;
  nameEn: string;
  thumbnail?: string | null;
  corner: boolean;
  defs: CabinetDef[];
}

/** 3D-rendered wood-finish thumbnail for a catalog family (with fallback). */
function FamilyThumb({
  def,
  fallback,
}: {
  def: CabinetDef;
  fallback?: string | null;
}) {
  const thumb = useCabinetThumb(def);
  const src = thumb ?? fallback ?? undefined;
  if (!src) {
    return (
      <span className="block w-full aspect-square rounded-lg border border-border bg-muted/60 animate-pulse" />
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className="w-full aspect-square rounded-lg border border-border object-cover bg-[#f6f4f0]"
    />
  );
}

function CabinetCatalog({
  onAdd,
  onAddDecor,
  adekoDefs,
  overlay = false,
  forcedTab,
}: {
  onAdd: (def: CabinetDef) => void;
  onAddDecor: (item: DecorItem) => void;
  adekoDefs: CabinetDef[];
  /** Fullscreen overlay variant: transparent bg, fills its wrapper. */
  overlay?: boolean;
  /** When set (side-rail layout), the category comes from outside and the internal tabs are hidden. */
  forcedTab?: CabinetLevel | "decor";
}) {
  const { t } = useLanguage();
  const [ownTab, setOwnTab] = useState<CabinetLevel | "decor">("base");
  const tab = forcedTab ?? ownTab;
  const setTab = setOwnTab;
  const [search, setSearch] = useState("");
  const [openFamily, setOpenFamily] = useState<string | null>(null);
  const q = search.trim().toLowerCase();

  // Merge products of the same family into one card with a size picker.
  const families = useMemo(() => {
    const map = new Map<string, CabinetFamily>();
    for (const d of adekoDefs) {
      const key = `${d.level}|${d.nameAr}`;
      let fam = map.get(key);
      if (!fam) {
        fam = {
          key,
          nameAr: d.nameAr,
          nameEn: familyEnglishName(d.nameEn),
          thumbnail: d.adeko?.thumbnail,
          corner: !!d.corner,
          defs: [],
        };
        map.set(key, fam);
      }
      if (!fam.thumbnail && d.adeko?.thumbnail) fam.thumbnail = d.adeko.thumbnail;
      fam.defs.push(d);
    }
    const all = Array.from(map.values());
    for (const fam of all) {
      fam.defs.sort((a, b) => a.width - b.width || a.height - b.height);
    }
    return all;
  }, [adekoDefs]);

  const shownDecor = DECOR_ITEMS.filter(
    (d) =>
      !q ||
      d.nameAr.toLowerCase().includes(q) ||
      d.nameEn.toLowerCase().includes(q)
  );

  const shownFamilies = families.filter(
    (f) =>
      f.defs[0].level === tab &&
      (!q ||
        f.nameAr.toLowerCase().includes(q) ||
        f.nameEn.toLowerCase().includes(q) ||
        f.defs.some((d) =>
          (d.adeko?.code ?? "").toLowerCase().includes(q) ||
          d.nameEn.toLowerCase().includes(q)
        ))
  );

  return (
    <div
      className={`${overlay ? "w-56" : "w-full"} shrink-0 flex flex-col overflow-hidden ${
        overlay ? "h-full bg-transparent" : "h-full"
      }`}
      data-testid={overlay ? "panel-cabinet-catalog-overlay" : "panel-cabinet-catalog"}
    >
      <div className={`flex border-b border-border ${forcedTab ? "hidden" : ""}`}>
        {(
          [
            { id: "base" as const, ar: "سفلية", en: "Base" },
            { id: "upper" as const, ar: "علوية", en: "Wall" },
            { id: "decor" as const, ar: "ديكور", en: "Decor" },
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
      <div className="p-2 pb-0">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("ابحث في المنتجات...", "Search products...")}
          className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:border-primary"
          data-testid="input-catalog-search"
        />
      </div>
      {tab === "decor" ? (
        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
          {(Object.keys(DECOR_CATEGORY_LABELS) as DecorCategory[]).map((cat) => {
            const items = shownDecor.filter((d) => d.category === cat);
            if (items.length === 0) return null;
            return (
              <div key={cat} className="flex flex-col gap-1.5">
                <p className="text-[10px] font-bold text-muted-foreground px-1 pt-1">
                  {t(DECOR_CATEGORY_LABELS[cat].ar, DECOR_CATEGORY_LABELS[cat].en)}
                </p>
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onAddDecor(item)}
                    className="w-full flex items-center gap-2 px-2 py-2 text-start rounded-lg border border-border bg-background hover:bg-primary/5 hover:border-primary/60 transition-colors"
                    data-testid={`button-add-decor-${item.id}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-bold leading-tight truncate">
                        {t(item.nameAr, item.nameEn)}
                      </span>
                      <span className="block text-[10px] text-muted-foreground mt-0.5 truncate" dir="ltr">
                        {Math.round(item.width * 100)}×{Math.round(item.height * 100)} {t("سم", "cm")}
                      </span>
                    </span>
                    <Plus className="w-4 h-4 shrink-0 text-primary" />
                  </button>
                ))}
              </div>
            );
          })}
          {shownDecor.length === 0 && (
            <p className="text-[11px] text-muted-foreground text-center py-4">
              {t("لا توجد نتائج", "No results")}
            </p>
          )}
        </div>
      ) : (
      <div className={`flex-1 overflow-y-auto p-2 grid ${overlay ? "grid-cols-1" : "grid-cols-2"} gap-2 content-start`}>
        {shownFamilies.map((fam) => {
          const isOpen = openFamily === fam.key;
          const single = fam.defs.length === 1;
          return (
            <div
              key={fam.key}
              className={`rounded-xl border transition-colors ${
                isOpen ? "border-primary/60 bg-primary/5" : "border-border bg-background hover:border-primary/50"
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  if (single) onAdd(fam.defs[0]);
                  else setOpenFamily(isOpen ? null : fam.key);
                }}
                className="w-full flex flex-col items-stretch p-1.5 text-start rounded-xl transition-colors"
                data-testid={`button-family-${fam.key}`}
              >
                <FamilyThumb def={fam.defs[0]} fallback={fam.thumbnail} />
                <span className="flex items-start gap-1 mt-1.5 px-0.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-bold leading-tight truncate">
                      {t(fam.nameAr, fam.nameEn)}
                    </span>
                    <span className="block text-[10px] text-muted-foreground mt-0.5 truncate">
                      {single
                        ? `${Math.round(fam.defs[0].width * 100)} ${t("سم", "cm")}`
                        : t(`${fam.defs.length} مقاسات`, `${fam.defs.length} sizes`)}
                      {fam.corner ? t(" • ركن", " • corner") : ""}
                    </span>
                  </span>
                  <Plus className="w-3.5 h-3.5 shrink-0 text-primary mt-0.5" />
                </span>
              </button>
              {isOpen && !single && (
                <div className="flex flex-wrap gap-1 px-1.5 pb-1.5">
                  {fam.defs.map((def) => (
                    <button
                      key={def.id}
                      type="button"
                      onClick={() => onAdd(def)}
                      title={def.nameEn}
                      className="rounded-md border border-border bg-card px-1.5 py-1 text-[10px] font-bold hover:border-primary hover:text-primary transition-colors"
                      dir="ltr"
                      data-testid={`button-add-cabinet-${def.id}`}
                    >
                      {Math.round(def.width * 100)}×{Math.round(def.height * 100)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {shownFamilies.length === 0 && (
          <p className="col-span-2 text-[11px] text-muted-foreground text-center py-4">
            {t("لا توجد نتائج", "No results")}
          </p>
        )}
      </div>
      )}
      <p className="px-3 py-2 text-[10px] text-muted-foreground border-t border-border leading-relaxed">
        {t(
          "اضغط على المنتج لاختيار المقاس، ثم اسحبه في المشهد لتحريكه على الجدران.",
          "Click a product to pick a size, then drag it in the scene to move it along the walls."
        )}
      </p>
    </div>
  );
}

/* ── Idle-fade wrapper (video-player style, fullscreen only) ── */
function IdleFadePanel({
  children,
  idleMs = 3000,
  idleOpacityClass = "opacity-35",
  className = "",
  testId,
}: {
  children: ReactNode;
  idleMs?: number;
  idleOpacityClass?: string;
  className?: string;
  testId?: string;
}) {
  const [idle, setIdle] = useState(false);
  const [hovered, setHovered] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bump = useCallback(() => {
    setIdle(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setIdle(true), idleMs);
  }, [idleMs]);

  useEffect(() => {
    bump();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [bump]);

  return (
    <div
      className={`transition-opacity duration-500 ${
        hovered || !idle ? "opacity-100" : idleOpacityClass
      } ${className}`}
      onMouseEnter={() => {
        setHovered(true);
        bump();
      }}
      onMouseLeave={() => setHovered(false)}
      onMouseMove={bump}
      onFocusCapture={bump}
      onPointerDown={bump}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

/* ── Fade-out on unmount (fullscreen toolbars) ───────────── */
function FadeOutMount({
  show,
  enabled,
  children,
}: {
  show: boolean;
  /** When false, behaves like a plain conditional render (normal mode). */
  enabled: boolean;
  children: ReactNode;
}) {
  const [render, setRender] = useState(show);
  const lastChildren = useRef<ReactNode>(children);
  if (show) lastChildren.current = children;

  useEffect(() => {
    if (show) {
      setRender(true);
      return;
    }
    const id = setTimeout(() => setRender(false), 350);
    return () => clearTimeout(id);
  }, [show]);

  if (!enabled) return show ? <>{children}</> : null;
  if (!render && !show) return null;
  return (
    <div
      className={`transition-opacity duration-300 ${
        show ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      {show ? children : lastChildren.current}
    </div>
  );
}

/* ── Camera preset toolbar (normal + fullscreen) ─────────── */
function CameraToolbar({
  onView,
  isFullscreen,
  onToggleFullscreen,
}: {
  onView: (mode: CameraViewRequest["mode"]) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  const { t } = useLanguage();
  const btns: {
    mode: CameraViewRequest["mode"];
    icon: ReactNode;
    ar: string;
    en: string;
  }[] = [
    {
      mode: "person",
      icon: <PersonStanding className="w-4 h-4" />,
      ar: "منظور طبيعي (مستوى النظر)",
      en: "Natural view (eye level)",
    },
    {
      mode: "top",
      icon: <Grid2x2 className="w-4 h-4" />,
      ar: "مخطط علوي",
      en: "Top view",
    },
    {
      mode: "iso",
      icon: <Box className="w-4 h-4" />,
      ar: "منظور إيزومتري",
      en: "Isometric view",
    },
    {
      mode: "reset",
      icon: <RotateCcw className="w-4 h-4" />,
      ar: "إعادة تعيين الكاميرا",
      en: "Reset camera",
    },
  ];
  return (
    <div
      className="absolute top-3 end-3 z-10 flex flex-col gap-1.5"
      data-testid="toolbar-camera-views"
    >
      <button
        type="button"
        onClick={onToggleFullscreen}
        title={isFullscreen ? t("خروج من الشاشة الكاملة", "Exit fullscreen") : t("شاشة كاملة", "Fullscreen")}
        className="w-9 h-9 flex items-center justify-center rounded-lg border border-border bg-card/95 backdrop-blur shadow-md hover:border-primary hover:text-primary transition-colors"
        data-testid="button-scene-fullscreen"
      >
        {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
      </button>
      <div className="h-px bg-border/70 mx-1" />
      {btns.map((b) => (
        <button
          key={b.mode}
          type="button"
          onClick={() => onView(b.mode)}
          title={t(b.ar, b.en)}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-border bg-card/95 backdrop-blur shadow-md hover:border-primary hover:text-primary transition-colors"
          data-testid={`button-camera-${b.mode}`}
        >
          {b.icon}
        </button>
      ))}
    </div>
  );
}

/* ── Presentation mode: clean fullscreen client view ─────── */
function PresentationOverlay({
  layout,
  walls,
  ceilingHeight,
  openings,
  utilities,
  adekoFinishById,
  onExit,
}: {
  layout: KitchenLayout;
  walls: ReturnType<typeof useKitchenToolStore.getState>["walls"];
  ceilingHeight: number;
  openings: ReturnType<typeof useKitchenToolStore.getState>["openings"];
  utilities: ReturnType<typeof useKitchenToolStore.getState>["utilities"];
  adekoFinishById?: Record<number, AdekoFinish>;
  onExit: () => void;
}) {
  const { t } = useLanguage();
  const [tourActive, setTourActive] = useState(true);
  const lightsOn = useKitchenToolStore((s) => s.lightsOn ?? false);
  const lightTemp = useKitchenToolStore((s) => s.lightTemp ?? "warm");
  const toggleLights = useKitchenToolStore((s) => s.toggleLights);
  const setLightTemp = useKitchenToolStore((s) => s.setLightTemp);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  return (
    <div className="fixed inset-0 z-50 bg-black" data-testid="overlay-presentation">
      <SceneErrorBoundary fallback={<SceneFallback />}>
        <Suspense fallback={null}>
          <StudioScene
            layout={layout}
            walls={walls}
            ceilingHeight={ceilingHeight}
            openings={openings}
            utilities={utilities}
            adekoFinishById={adekoFinishById}
            presentation
            tourActive={tourActive}
            onTourEnd={() => setTourActive(false)}
          />
        </Suspense>
      </SceneErrorBoundary>

      {/* Top bar */}
      <div className="absolute top-4 inset-x-0 flex items-center justify-center pointer-events-none">
        <span className="rounded-full bg-black/55 backdrop-blur text-white/90 text-xs font-bold px-4 py-1.5">
          {tourActive
            ? t("جولة تلقائية — المس الشاشة للتحكم بنفسك", "Auto tour — touch to take control")
            : t("اسحب للدوران وعجلة التمرير للتقريب", "Drag to orbit, scroll to zoom")}
        </span>
      </div>

      {/* Bottom controls */}
      <div className="absolute bottom-5 inset-x-0 flex items-center justify-center gap-2 flex-wrap px-4">
        <button
          type="button"
          onClick={() => setTourActive((v) => !v)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold backdrop-blur transition-colors ${
            tourActive
              ? "bg-primary text-primary-foreground"
              : "bg-black/55 text-white hover:bg-black/70"
          }`}
          data-testid="button-presentation-tour"
        >
          {tourActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          {tourActive ? t("إيقاف الجولة", "Pause tour") : t("جولة تلقائية", "Auto tour")}
        </button>
        <button
          type="button"
          onClick={toggleLights}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold backdrop-blur transition-colors ${
            lightsOn
              ? "bg-primary text-primary-foreground"
              : "bg-black/55 text-white hover:bg-black/70"
          }`}
          data-testid="button-presentation-lights"
        >
          <Lightbulb className="w-3.5 h-3.5" />
          {lightsOn ? t("الإضاءة تعمل", "Lights on") : t("تشغيل الإضاءة", "Lights")}
        </button>
        {lightsOn && (
          <>
            <button
              type="button"
              onClick={() => setLightTemp("warm")}
              className={`px-3 py-2 rounded-full text-xs font-bold backdrop-blur transition-colors ${
                lightTemp === "warm"
                  ? "bg-primary text-primary-foreground"
                  : "bg-black/55 text-white hover:bg-black/70"
              }`}
              data-testid="button-presentation-warm"
            >
              {t("دافئ", "Warm")}
            </button>
            <button
              type="button"
              onClick={() => setLightTemp("cool")}
              className={`px-3 py-2 rounded-full text-xs font-bold backdrop-blur transition-colors ${
                lightTemp === "cool"
                  ? "bg-primary text-primary-foreground"
                  : "bg-black/55 text-white hover:bg-black/70"
              }`}
              data-testid="button-presentation-cool"
            >
              {t("بارد", "Cool")}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onExit}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold bg-black/55 text-white hover:bg-black/70 backdrop-blur transition-colors"
          data-testid="button-presentation-exit"
        >
          <X className="w-3.5 h-3.5" />
          {t("خروج", "Exit")}
        </button>
      </div>
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
  const updatePlacedCabinet = useKitchenToolStore((s) => s.updatePlacedCabinet);
  const [selectedCabinetId, setSelectedCabinetId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<StudioCategory>("base");
  const placedDecor = useKitchenToolStore((s) => s.placedDecor ?? []);
  const addPlacedDecor = useKitchenToolStore((s) => s.addPlacedDecor);
  const updatePlacedDecor = useKitchenToolStore((s) => s.updatePlacedDecor);
  const removePlacedDecor = useKitchenToolStore((s) => s.removePlacedDecor);
  const [selectedDecorId, setSelectedDecorId] = useState<string | null>(null);
  const [presentationMode, setPresentationMode] = useState(false);
  const sceneBoxRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewRequest, setViewRequest] = useState<CameraViewRequest | null>(null);
  // Ready-made templates: offered once when the studio opens empty.
  const [templatesOpen, setTemplatesOpen] = useState(
    () => (useKitchenToolStore.getState().placedCabinets ?? []).length === 0
  );
  // High-res snapshot: bump the counter to request a capture from the scene.
  const [snapshotRequest, setSnapshotRequest] = useState(0);
  const handleSnapshot = useCallback((dataUrl: string) => {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `teak-kitchen-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
  }, []);

  useEffect(() => {
    const onFsChange = () =>
      setIsFullscreen(document.fullscreenElement === sceneBoxRef.current);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement === sceneBoxRef.current) {
      document.exitFullscreen().catch(() => undefined);
    } else {
      sceneBoxRef.current?.requestFullscreen().catch(() => {
        toast({
          title: t("الشاشة الكاملة غير مدعومة", "Fullscreen not supported"),
          description: t(
            "المتصفح منع تفعيل وضع الشاشة الكاملة على هذا الجهاز.",
            "The browser blocked fullscreen mode on this device."
          ),
          variant: "destructive",
        });
      });
    }
  }, [toast, t]);

  const requestView = useCallback((mode: CameraViewRequest["mode"]) => {
    setViewRequest({ mode, nonce: Date.now() });
  }, []);

  // Full Adeko catalog — every renderable product becomes a parametric cabinet.
  const { data: adekoProducts } = useQuery<AdekoProductRow[]>({
    queryKey: ["/api/kitchen-tool/products"],
    staleTime: 5 * 60 * 1000,
  });
  const adekoDefs = useMemo(() => {
    const defs: CabinetDef[] = [];
    for (const p of adekoProducts ?? []) {
      const def = adekoDefFromProduct(p);
      if (def) defs.push(def);
    }
    // Register synchronously (idempotent) so collision checks never see a
    // placed cabinet with an unknown def during the first render.
    defs.forEach(registerAdekoDef);
    // Static functional units (sinks, laundry, cooktop+oven, appliance tower)
    // complete the catalog — appended after the live Adeko products.
    for (const x of EXTRA_CABINET_DEFS) {
      if (!defs.some((d) => d.id === x.id)) defs.push(x);
    }
    return defs;
  }, [adekoProducts]);

  // Factory wood types = material/finish choices for the Adeko pilot cabinet.
  const { data: woodMaterials } = useQuery<KitchenToolMaterial[]>({
    queryKey: ["/api/kitchen-tool/materials"],
    staleTime: 5 * 60 * 1000,
  });
  const adekoFinishById = useMemo(() => {
    const map: Record<number, AdekoFinish> = {};
    for (const w of woodMaterials ?? []) {
      map[w.id] = adekoFinishForWoodType(w.nameAr, w.nameEn);
    }
    return map;
  }, [woodMaterials]);
  const layout: KitchenLayout = answers.layout ?? "L";
  const BackIcon = isRTL ? ChevronRight : ChevronLeft;

  const segments = useMemo(() => getWallSegments(layout, walls), [layout, walls]);

  useEffect(() => {
    ensureWalls(layout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  // One-time cleanup: drop saved placements from the removed legacy GLB
  // catalog (their ids never start with "adeko-"), so they don't linger
  // as invisible ghost entries in counts and collision checks.
  useEffect(() => {
    for (const p of placedCabinets) {
      if (!p.catalogId.startsWith("adeko-")) removePlacedCabinet(p.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddCabinet = (def: CabinetDef) => {
    const slot = def.corner
      ? findCornerSlot(def, placedCabinets, segments, openings)
      : findSlotForCabinet(def, placedCabinets, segments, openings);
    if (!slot) {
      const hasJunction = def.corner && getJunctions(segments).length > 0;
      toast({
        title: def.corner
          ? hasJunction
            ? t("الأركان مشغولة", "Corners are occupied")
            : t("لا يوجد ركن في هذا التخطيط", "No corner in this layout")
          : t("لا توجد مساحة كافية", "Not enough space"),
        description: def.corner
          ? hasJunction
            ? t(
                "الزاوية بين الجدارين مشغولة بخزائن — حرّك أو احذف الخزائن القريبة من الركن ثم أعد المحاولة.",
                "The corner between the walls is occupied — move or remove the cabinets near the corner and try again."
              )
            : t(
                "الوحدات الركنية تُركّب فقط في زاوية يلتقي فيها جداران.",
                "Corner units only fit where two walls meet."
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
    setSelectedDecorId(null);
    if (doorClashAdvice(def, slot.wallId, slot.offset, placedCabinets, segments)) {
      toast({
        title: t("اقتراح: أضف سدادة (فلر)", "Tip: add a filler strip"),
        description: t(
          "هذه الخزانة ملاصقة لخزانة الركن — باب الخزانة قد يصطدم بها عند الفتح. نقترح ترك سدادة بعرض 5-10 سم بينهما.",
          "This cabinet sits flush against the corner unit — its door may hit it when opening. We suggest a 5-10 cm filler strip between them."
        ),
      });
    }
  };

  const applyTemplate = (template: KitchenTemplate) => {
    const cabs = buildTemplateCabinets(template, segments, openings, adekoDefs);
    if (cabs.length === 0) {
      toast({
        title: t("تعذّر بناء القالب", "Could not build the template"),
        description: t(
          "لا توجد مساحة كافية على الجدران المُدخلة — جرّب البدء من الصفر.",
          "Not enough space on the entered walls — try starting from scratch."
        ),
        variant: "destructive",
      });
      return;
    }
    clearPlacedCabinets();
    for (const c of cabs) addPlacedCabinet(c);
    setTemplatesOpen(false);
    setSelectedCabinetId(null);
    toast({
      title: t("تم بناء المطبخ من القالب", "Kitchen built from template"),
      description: t(
        "عدّل بحرية: أضف أو احذف خزائن وغيّر الألوان والأسطح.",
        "Edit freely: add or remove cabinets and change colors and tops."
      ),
    });
  };

  const handleDeleteSelected = () => {
    if (!selectedCabinetId) return;
    removePlacedCabinet(selectedCabinetId);
    setSelectedCabinetId(null);
  };

  const handleAddDecor = (item: DecorItem) => {
    const id = `dec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    if (item.placement === "wall") {
      const seg =
        segments.slice().sort((a, b) => b.length - a.length)[0] ?? segments[0];
      if (!seg) return;
      const wallLenM = seg.length / 100;
      const offset = Math.max((wallLenM - item.width) / 2, 0);
      addPlacedDecor({ id, decorId: item.id, wallId: seg.id, offset });
    } else {
      const b = getFloorBounds(segments);
      addPlacedDecor({
        id,
        decorId: item.id,
        x: ((b.minX + b.maxX) / 2) / 100,
        z: ((b.minY + b.maxY) / 2) / 100,
        rotY: 0,
      });
    }
    setSelectedDecorId(id);
    setSelectedCabinetId(null);
    toast({
      title: t("تمت الإضافة", "Added"),
      description: t(
        "اسحب القطعة في المشهد لتغيير مكانها.",
        "Drag the item in the scene to reposition it."
      ),
    });
  };

  const selectedDecorPlaced = selectedDecorId
    ? placedDecor.find((d) => d.id === selectedDecorId)
    : undefined;
  const selectedDecorItem = selectedDecorPlaced
    ? findDecorItem(selectedDecorPlaced.decorId)
    : undefined;

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
    // Reject height changes that would make this cabinet overlap another
    // cabinet or an opening on the same wall.
    const intervals = blockedIntervals(
      selectedPlaced.wallId,
      { y0: next, y1: next + selectedDef.height },
      placedCabinets,
      segments,
      openings,
      selectedPlaced.id
    );
    const a = selectedPlaced.offset;
    const b = selectedPlaced.offset + selectedDef.width;
    if (intervals.some((iv) => a < iv.b - 1e-4 && b > iv.a + 1e-4)) {
      toast({
        title: t("لا يمكن التحريك", "Cannot move"),
        description: t(
          "الارتفاع الجديد يتعارض مع خزانة أو فتحة أخرى.",
          "The new height collides with another cabinet or opening."
        ),
        variant: "destructive",
      });
      return;
    }
    setPlacedCabinetHeight(selectedPlaced.id, next);
  };

  return (
    <DesktopGate>
      {presentationMode && (
        <PresentationOverlay
          layout={layout}
          walls={walls}
          ceilingHeight={ceilingHeight}
          openings={openings}
          utilities={utilities}
          adekoFinishById={adekoFinishById}
          onExit={() => setPresentationMode(false)}
        />
      )}
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
            <div className="flex items-center gap-2 flex-wrap">
              <TotalPriceBar />
              <Button
                onClick={() => setPresentationMode(true)}
                className="font-bold"
                data-testid="button-presentation-mode"
              >
                <Presentation className="w-4 h-4 me-1" />
                {t("عرض للعميل", "Client View")}
              </Button>
              <Button
                variant="outline"
                className="font-bold"
                onClick={() => setSnapshotRequest((n) => n + 1)}
                data-testid="button-snapshot"
              >
                <Camera className="w-4 h-4 me-1" />
                {t("صورة عالية الدقة", "HD Snapshot")}
              </Button>
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
                onClick={() => setLocation("/kitchen-designer/details")}
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

          <div className="flex gap-3 h-[calc(100vh-300px)] min-h-[440px]">
            <StudioRail active={activeCategory} onSelect={setActiveCategory} />
            <div
              ref={sceneBoxRef}
              className={`relative flex-1 rounded-xl overflow-hidden border border-border ${
                isFullscreen ? "bg-background" : "bg-muted/30"
              }`}
              data-testid="container-studio-3d"
            >
              {/* Unmounted while presentation overlay is open — never render
                  two WebGL canvases at the same time. */}
              {!presentationMode && (
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
                      selectedDecorId={selectedDecorId}
                      onSelectDecor={setSelectedDecorId}
                      adekoFinishById={adekoFinishById}
                      viewRequest={viewRequest}
                      snapshotRequest={snapshotRequest}
                      onSnapshot={handleSnapshot}
                    />
                  </Suspense>
                </SceneErrorBoundary>
              )}
              <CameraToolbar
                onView={requestView}
                isFullscreen={isFullscreen}
                onToggleFullscreen={toggleFullscreen}
              />
              {isFullscreen && (
                <>
                  <IdleFadePanel
                    className="absolute top-3 start-3 bottom-3 z-20 w-56"
                    testId="overlay-fullscreen-catalog"
                  >
                    <div className="h-full rounded-xl overflow-hidden border border-border/60 shadow-lg backdrop-blur-md bg-card/80 flex flex-col">
                      <CabinetCatalog
                        onAdd={handleAddCabinet}
                        onAddDecor={handleAddDecor}
                        adekoDefs={adekoDefs}
                        overlay
                      />
                    </div>
                  </IdleFadePanel>
                  <div
                    className="absolute bottom-3 inset-x-0 z-20 flex justify-center pointer-events-none"
                    data-testid="overlay-fullscreen-price"
                  >
                    <div className="pointer-events-auto rounded-lg shadow-lg backdrop-blur-md">
                      <TotalPriceBar overlay />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    title={t("خروج من الشاشة الكاملة (Esc)", "Exit fullscreen (Esc)")}
                    className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 rounded-full bg-black/55 text-white text-xs font-bold px-4 py-1.5 backdrop-blur hover:bg-black/70 transition-colors"
                    data-testid="button-exit-fullscreen"
                  >
                    <X className="w-3.5 h-3.5" />
                    {t("خروج من الشاشة الكاملة", "Exit fullscreen")}
                  </button>
                </>
              )}
              <FadeOutMount show={!!(selectedCabinetId && selectedDef)} enabled={isFullscreen}>
              {selectedCabinetId && selectedDef && (
                <div
                  className={`absolute top-3 z-30 flex items-center gap-2 rounded-lg border border-border bg-card/95 backdrop-blur px-3 py-2 shadow-md ${isFullscreen ? "start-[248px]" : "start-3"}`}
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
              </FadeOutMount>
              <FadeOutMount show={!!(selectedDecorPlaced && selectedDecorItem)} enabled={isFullscreen}>
              {selectedDecorPlaced && selectedDecorItem && (
                <div
                  className={`absolute top-3 z-30 flex items-center gap-2 rounded-lg border border-border bg-card/95 backdrop-blur px-3 py-2 shadow-md ${isFullscreen ? "start-[248px]" : "start-3"}`}
                  data-testid="bar-selected-decor"
                >
                  <span className="text-xs font-bold" data-testid="text-selected-decor">
                    {t(selectedDecorItem.nameAr, selectedDecorItem.nameEn)}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 font-bold"
                    onClick={() =>
                      updatePlacedDecor(
                        selectedDecorPlaced.id,
                        selectedDecorItem.placement === "wall"
                          ? {
                              rotY:
                                (selectedDecorPlaced.rotY ?? 0) === 0 ? Math.PI : 0,
                            }
                          : {
                              rotY:
                                ((selectedDecorPlaced.rotY ?? 0) + Math.PI / 2) %
                                (Math.PI * 2),
                            }
                      )
                    }
                    data-testid="button-rotate-decor"
                  >
                    {selectedDecorItem.placement === "wall"
                      ? t("عكس الاتجاه", "Flip 180°")
                      : t("تدوير 90°", "Rotate 90°")}
                  </Button>
                  {selectedDecorItem.recolorable && (
                    <div className="flex items-center gap-1" data-testid="row-decor-colors">
                      {[
                        ["#f4f4f2", "أبيض"],
                        ["#2e2e30", "أسود"],
                        ["#b9bec4", "ستانلس"],
                        ["#8a8f94", "رمادي"],
                        ["#c9a06a", "خشبي"],
                        ["#6f4a2c", "بني"],
                        ["#7d1f24", "نبيتي"],
                      ].map(([hex, name]) => (
                        <button
                          key={hex}
                          title={name}
                          className={`w-5 h-5 rounded-full border-2 ${
                            selectedDecorPlaced.tint === hex
                              ? "border-primary scale-110"
                              : "border-white/70"
                          }`}
                          style={{ backgroundColor: hex }}
                          onClick={() =>
                            updatePlacedDecor(selectedDecorPlaced.id, { tint: hex })
                          }
                          data-testid={`button-decor-tint-${hex.slice(1)}`}
                        />
                      ))}
                      {selectedDecorPlaced.tint && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-1.5 text-[11px] font-bold"
                          onClick={() =>
                            updatePlacedDecor(selectedDecorPlaced.id, { tint: undefined })
                          }
                          data-testid="button-decor-tint-reset"
                        >
                          {t("الأصل", "Original")}
                        </Button>
                      )}
                    </div>
                  )}
                  {selectedDecorItem.placement === "wall" && (() => {
                    const currentY =
                      selectedDecorPlaced.mountY ??
                      selectedDecorItem.defaultMountY ??
                      0;
                    const maxY = Math.max(
                      ceilingM - COVE_DROP - 0.03 - selectedDecorItem.height,
                      0
                    );
                    const nudge = (d: number) =>
                      updatePlacedDecor(selectedDecorPlaced.id, {
                        mountY: Math.min(Math.max(currentY + d, 0), maxY),
                      });
                    return (
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 w-7 p-0 font-bold"
                          onClick={() => nudge(0.05)}
                          disabled={currentY >= maxY - 1e-4}
                          data-testid="button-decor-raise"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </Button>
                        <span
                          className="text-[11px] font-bold text-muted-foreground min-w-[52px] text-center"
                          data-testid="text-decor-height"
                        >
                          {t(
                            `${Math.round(currentY * 100)} سم`,
                            `${Math.round(currentY * 100)} cm`
                          )}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 w-7 p-0 font-bold"
                          onClick={() => nudge(-0.05)}
                          disabled={currentY <= 1e-4}
                          data-testid="button-decor-lower"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    );
                  })()}
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 px-2 font-bold"
                    onClick={() => {
                      removePlacedDecor(selectedDecorPlaced.id);
                      setSelectedDecorId(null);
                    }}
                    data-testid="button-delete-decor"
                  >
                    <Trash2 className="w-3.5 h-3.5 me-1" />
                    {t("حذف", "Delete")}
                  </Button>
                </div>
              )}
              </FadeOutMount>
              <FadeOutMount show={!!(selectedPlaced && selectedDef?.adeko)} enabled={isFullscreen}>
              {selectedPlaced && selectedDef?.adeko && (
                <div
                  className={`absolute top-16 z-30 w-[250px] rounded-lg border border-border bg-card/95 backdrop-blur p-3 shadow-md flex flex-col gap-3 ${isFullscreen ? "start-[248px] max-h-[70vh] overflow-y-auto" : "start-3"}`}
                  data-testid="panel-adeko-options"
                >
                  <div>
                    <p className="text-[11px] font-bold text-muted-foreground mb-1.5">
                      {t("نمط الأبواب والواجهات", "Door & front style")}
                    </p>
                    <p className="text-[10px] text-muted-foreground leading-relaxed mb-1.5">
                      {t(
                        "الخامة: شيبورد مقاوم للرطوبة — جسم الخزانة دائماً أوف-وايت مطفي.",
                        "Material: moisture-resistant chipboard — the carcass is always matte off-white."
                      )}
                    </p>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Button
                        size="sm"
                        variant={(selectedPlaced.doorPattern ?? "wood") === "wood" ? "default" : "outline"}
                        className="h-7 px-3 text-[11px] font-bold flex-1"
                        onClick={() =>
                          updatePlacedCabinet(selectedPlaced.id, { doorPattern: "wood" })
                        }
                        data-testid="button-pattern-wood"
                      >
                        {t("ملمس خشبي", "Wood grain")}
                      </Button>
                      <Button
                        size="sm"
                        variant={selectedPlaced.doorPattern === "solid" ? "default" : "outline"}
                        className="h-7 px-3 text-[11px] font-bold flex-1"
                        onClick={() =>
                          updatePlacedCabinet(selectedPlaced.id, { doorPattern: "solid" })
                        }
                        data-testid="button-pattern-solid"
                      >
                        {t("سادة", "Solid")}
                      </Button>
                    </div>
                    {(() => {
                      if (!selectedDef?.adeko) return null;
                      const mat = (woodMaterials ?? []).find(
                        (w) => w.id === selectedPlaced.finishWoodTypeId
                      );
                      const total = adekoPriceForGrade(selectedDef.adeko, mat?.grade);
                      if (!Number.isFinite(total) || total <= 0) return null;
                      return (
                        <div
                          className="mt-2 flex items-center justify-between rounded-md bg-primary/10 px-2 py-1.5"
                          data-testid="text-cabinet-total"
                        >
                          <span className="text-[11px] font-bold">
                            {t("سعر الوحدة (شامل الضريبة)", "Unit price (incl. VAT)")}
                          </span>
                          <span className="text-[12px] font-bold text-primary" dir="ltr">
                            {total.toLocaleString(undefined, { maximumFractionDigits: 0 })}{" "}
                            {t("ر.س", "SAR")}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-muted-foreground mb-1.5">
                      {t("لون الأبواب والواجهات", "Door & front color")}
                    </p>
                    <div className="grid grid-cols-6 gap-1.5">
                      {ADEKO_DOOR_COLORS.map((c) => {
                        const active =
                          (selectedPlaced.finishColor ?? DEFAULT_DOOR_COLOR.hex) === c.hex;
                        return (
                          <button
                            key={c.hex}
                            type="button"
                            title={t(c.nameAr, c.nameEn)}
                            onClick={() =>
                              updatePlacedCabinet(selectedPlaced.id, {
                                finishColor: c.hex,
                                doorPattern: selectedPlaced.doorPattern ?? "wood",
                              })
                            }
                            className={`w-7 h-7 rounded-full border-2 ${
                              active ? "border-primary scale-110" : "border-border"
                            }`}
                            style={{ background: c.hex }}
                            data-testid={`button-finish-color-${c.hex.slice(1)}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                  {selectedDef.adeko?.kind.place === "base" &&
                    !selectedDef.adeko?.kind.filler && (
                  <div>
                    <p className="text-[11px] font-bold text-muted-foreground mb-1.5">
                      {t("سطح الرخامة", "Countertop")}
                    </p>
                    <div className="grid grid-cols-5 gap-1.5">
                      {ADEKO_TOP_FINISHES.map((f) => {
                        const active =
                          (selectedPlaced.topFinishId ?? ADEKO_TOP_FINISHES[0].id) === f.id;
                        return (
                          <button
                            key={f.id}
                            type="button"
                            title={t(f.nameAr, f.nameEn)}
                            onClick={() =>
                              updatePlacedCabinet(selectedPlaced.id, { topFinishId: f.id })
                            }
                            className={`flex flex-col items-center gap-0.5 rounded-md border p-1 transition-colors ${
                              active
                                ? "border-primary bg-primary/10"
                                : "border-border hover:border-primary/50"
                            }`}
                            data-testid={`button-top-finish-${f.id}`}
                          >
                            <span
                              className="w-6 h-6 rounded border border-black/10"
                              style={{ background: f.swatch }}
                            />
                            <span className="text-[8px] leading-tight text-center">
                              {t(f.nameAr, f.nameEn)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  )}
                  <div>
                    <p className="text-[11px] font-bold text-muted-foreground mb-1.5">
                      {t("المقبض", "Handle")}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant={(selectedPlaced.handleStyle ?? "bar") === "bar" ? "default" : "outline"}
                        className="h-7 px-2 text-[11px] font-bold"
                        onClick={() => updatePlacedCabinet(selectedPlaced.id, { handleStyle: "bar" })}
                        data-testid="button-handle-bar"
                      >
                        {t("مقبض", "Bar")}
                      </Button>
                      <Button
                        size="sm"
                        variant={selectedPlaced.handleStyle === "none" ? "default" : "outline"}
                        className="h-7 px-2 text-[11px] font-bold"
                        onClick={() => updatePlacedCabinet(selectedPlaced.id, { handleStyle: "none" })}
                        data-testid="button-handle-none"
                      >
                        {t("بدون", "None")}
                      </Button>
                      {(selectedPlaced.handleStyle ?? "bar") === "bar" && (
                        <div className="flex items-center gap-1 ms-1">
                          {(["black", "white", "gray"] as const).map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() =>
                                updatePlacedCabinet(selectedPlaced.id, { handleColor: c })
                              }
                              className={`w-5 h-5 rounded-full border-2 ${
                                (selectedPlaced.handleColor ?? "gray") === c
                                  ? "border-primary"
                                  : "border-border"
                              }`}
                              style={{
                                background:
                                  c === "black" ? "#232427" : c === "white" ? "#f2f2ef" : "#c9ccd1",
                              }}
                              data-testid={`button-handle-color-${c}`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {(selectedDef.adeko?.kind.doors ?? 0) > 0 && (
                    <div>
                      <p className="text-[11px] font-bold text-muted-foreground mb-1.5">
                        {t("اتجاه فتح الباب", "Door opening direction")}
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {selectedDef.adeko?.kind.doors === 1 && (
                          <>
                            <Button
                              size="sm"
                              variant={
                                (selectedPlaced.doorHinge ?? "left") === "left"
                                  ? "default"
                                  : "outline"
                              }
                              className="h-7 px-2 text-[11px] font-bold"
                              onClick={() =>
                                updatePlacedCabinet(selectedPlaced.id, { doorHinge: "left" })
                              }
                              data-testid="button-hinge-left"
                            >
                              {t("مفصلة يسار", "Hinge left")}
                            </Button>
                            <Button
                              size="sm"
                              variant={
                                selectedPlaced.doorHinge === "right" ? "default" : "outline"
                              }
                              className="h-7 px-2 text-[11px] font-bold"
                              onClick={() =>
                                updatePlacedCabinet(selectedPlaced.id, { doorHinge: "right" })
                              }
                              data-testid="button-hinge-right"
                            >
                              {t("مفصلة يمين", "Hinge right")}
                            </Button>
                          </>
                        )}
                        {selectedDef.adeko?.kind.place === "wall" && (
                          <Button
                            size="sm"
                            variant={selectedPlaced.doorHinge === "top" ? "default" : "outline"}
                            className="h-7 px-2 text-[11px] font-bold"
                            onClick={() =>
                              updatePlacedCabinet(selectedPlaced.id, { doorHinge: "top" })
                            }
                            data-testid="button-hinge-top"
                          >
                            {t("فتح علوي", "Lift-up")}
                          </Button>
                        )}
                        {selectedDef.adeko?.kind.doors !== 1 &&
                          selectedPlaced.doorHinge === "top" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px] font-bold"
                              onClick={() =>
                                updatePlacedCabinet(selectedPlaced.id, { doorHinge: "left" })
                              }
                              data-testid="button-hinge-side"
                            >
                              {t("فتح جانبي", "Side opening")}
                            </Button>
                          )}
                      </div>
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    {t(
                      "اضغط على باب الخزانة في المشهد لفتحه وإغلاقه.",
                      "Click the cabinet door in the scene to open and close it."
                    )}
                  </p>
                </div>
              )}
              </FadeOutMount>
            </div>
            <div
              className="w-64 shrink-0 rounded-xl border border-border bg-card flex flex-col overflow-hidden"
              data-testid="panel-studio-side"
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-sm font-bold" data-testid="text-panel-title">
                  {
                    {
                      base: t("الخزائن السفلية", "Base Cabinets"),
                      upper: t("الخزائن العلوية", "Wall Cabinets"),
                      decor: t("الديكور", "Decor"),
                      materials: t("الجدران والأرضيات", "Walls & Floors"),
                      ambiance: t("الإضاءة والأجواء", "Lighting & Ambiance"),
                      templates: t("قوالب جاهزة", "Templates"),
                      plan: t("المخطط ثنائي الأبعاد", "2D Plan"),
                    }[activeCategory]
                  }
                </span>
              </div>
              {(activeCategory === "base" ||
                activeCategory === "upper" ||
                activeCategory === "decor") && (
                <CabinetCatalog
                  onAdd={handleAddCabinet}
                  onAddDecor={handleAddDecor}
                  adekoDefs={adekoDefs}
                  forcedTab={activeCategory}
                />
              )}
              {activeCategory === "materials" && <MaterialsPanel />}
              {activeCategory === "ambiance" && <AmbiancePanel />}
              {activeCategory === "templates" && (
                <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2" data-testid="panel-templates">
                  <p className="text-[11px] text-muted-foreground leading-relaxed px-1">
                    {t(
                      "اختر تصميماً جاهزاً وسنبنيه على مقاسات غرفتك — ثم عدّل عليه بحرية.",
                      "Pick a ready design and we'll build it for your room — then edit freely."
                    )}
                  </p>
                  {KITCHEN_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => applyTemplate(tpl)}
                      className="flex items-start gap-2.5 rounded-xl border border-border p-2.5 text-start hover:border-primary hover:bg-primary/5 transition-colors"
                      data-testid={`button-template-${tpl.id}`}
                    >
                      <span className="flex shrink-0 mt-0.5">
                        <span
                          className="w-5 h-5 rounded-full border border-black/10"
                          style={{ background: tpl.swatches[0] }}
                        />
                        <span
                          className="w-5 h-5 rounded-full border border-black/10 -ms-1.5"
                          style={{ background: tpl.swatches[1] }}
                        />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-bold">
                          {t(tpl.nameAr, tpl.nameEn)}
                        </span>
                        <span className="block text-[10px] text-muted-foreground leading-relaxed mt-0.5">
                          {t(tpl.descriptionAr, tpl.descriptionEn)}
                        </span>
                      </span>
                    </button>
                  ))}
                  {placedCabinets.length > 0 && (
                    <p className="text-[10px] text-muted-foreground px-1">
                      {t(
                        "اختيار قالب سيستبدل التصميم الحالي.",
                        "Picking a template replaces the current design."
                      )}
                    </p>
                  )}
                </div>
              )}
              {activeCategory === "plan" && (
                <div className="flex-1 overflow-y-auto p-2" data-testid="panel-studio-plan">
                  <button
                    type="button"
                    onClick={() => setSheetOpen(true)}
                    title={t("عرض المخطط الهندسي الرسمي", "Open formal engineering drawing")}
                    className="block w-full cursor-zoom-in rounded hover:ring-2 hover:ring-primary/40 transition-shadow"
                    data-testid="button-open-engineering-sheet"
                  >
                    <KitchenPlanSvg
                      layout={layout}
                      walls={walls}
                      openings={openings}
                      utilities={utilities}
                      placedCabinets={placedCabinets}
                      t={t}
                      className="w-full pointer-events-none"
                    />
                    <span className="block text-center text-[10px] font-bold text-muted-foreground pt-1">
                      {t("اضغط لعرض المخطط الهندسي الرسمي", "Click to open the engineering drawing")}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
          <QuickFinishBar />
        </div>
        <div className="pb-6" />
      </div>
      <CabinetThumbFactory defs={adekoDefs} paused={presentationMode || isFullscreen} />
      {templatesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          data-testid="dialog-templates"
        >
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h2 className="text-lg font-bold mb-1">
              {t("ابدأ من قالب جاهز", "Start from a ready-made template")}
            </h2>
            <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
              {t(
                "اختر التصميم الأقرب لذوقك وسنبني المطبخ تلقائياً على مقاسات غرفتك — ويمكنك التعديل عليه بحرية بعد ذلك.",
                "Pick the design closest to your taste and we'll build the kitchen automatically for your room — you can edit it freely afterwards."
              )}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {KITCHEN_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => applyTemplate(tpl)}
                  className="flex items-start gap-3 rounded-xl border border-border p-3 text-start hover:border-primary hover:bg-primary/5 transition-colors"
                  data-testid={`button-template-${tpl.id}`}
                >
                  <span className="flex shrink-0 mt-0.5">
                    <span
                      className="w-6 h-6 rounded-full border border-black/10"
                      style={{ background: tpl.swatches[0] }}
                    />
                    <span
                      className="w-6 h-6 rounded-full border border-black/10 -ms-2"
                      style={{ background: tpl.swatches[1] }}
                    />
                  </span>
                  <span>
                    <span className="block text-sm font-bold">
                      {t(tpl.nameAr, tpl.nameEn)}
                    </span>
                    <span className="block text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                      {t(tpl.descriptionAr, tpl.descriptionEn)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-between items-center">
              <Button
                variant="ghost"
                className="font-bold"
                onClick={() => setTemplatesOpen(false)}
                data-testid="button-start-from-scratch"
              >
                {t("ابدأ من الصفر", "Start from scratch")}
              </Button>
              {placedCabinets.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {t(
                    "اختيار قالب سيستبدل التصميم الحالي.",
                    "Picking a template replaces the current design."
                  )}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
      <EngineeringSheetDialog
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        layout={layout}
        walls={walls}
        openings={openings}
        utilities={utilities}
        placedCabinets={placedCabinets}
        woodMaterials={woodMaterials ?? []}
      />
    </DesktopGate>
  );
}
