import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  ChevronRight,
  ChevronLeft,
  Droplets,
  Plug,
  Lightbulb,
  Waves,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/components/language-provider";
import DesktopGate from "@/components/kitchen-tool/desktop-gate";
import KitchenPlanSvg, {
  getWallSegments,
  getFloorBounds,
  wallLabelAr,
  wallLabelEn,
  type PlanPoint,
} from "@/components/kitchen-tool/plan-svg";
import { ToolStages, ToolNav } from "@/components/kitchen-tool/tool-stages";
import {
  useKitchenToolStore,
  UTILITY_DEFAULT_HEIGHT,
  type KitchenLayout,
  type KitchenUtility,
  type UtilityKind,
} from "@/components/kitchen-tool/store";

/** Drains snap to a wall when dropped/dragged within this distance (cm). */
const WALL_SNAP_CM = 60;
/** Keep floor drains at least this far (cm) inside the floor edges. */
const FLOOR_MARGIN_CM = 8;

let utilityCounter = 0;
function newUtilityId(): string {
  utilityCounter += 1;
  return `ut-${Date.now().toString(36)}-${utilityCounter}`;
}

const KIND_LABELS: Record<UtilityKind, { ar: string; en: string }> = {
  water: { ar: "تغذية مياه", en: "Water Supply" },
  outlet: { ar: "فيش كهرباء", en: "Power Outlet" },
  switch: { ar: "مفتاح إضاءة", en: "Light Switch" },
  drain: { ar: "تصريف", en: "Drain" },
};

export default function KitchenToolUtilitiesPage() {
  const { t, isRTL } = useLanguage();
  const [, setLocation] = useLocation();
  const {
    answers,
    walls,
    openings,
    utilities,
    addUtility,
    updateUtility,
    removeUtility,
    ensureWalls,
  } = useKitchenToolStore();

  const layout: KitchenLayout = answers.layout ?? "L";
  const [placementKind, setPlacementKind] = useState<UtilityKind | null>(null);
  const [selectedUtilityId, setSelectedUtilityId] = useState<string | null>(null);

  useEffect(() => {
    ensureWalls(layout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  const segments = useMemo(() => getWallSegments(layout, walls), [layout, walls]);
  const segById = useMemo(() => new Map(segments.map((s) => [s.id, s])), [segments]);

  const selectedUtility = useMemo(
    () => utilities.find((u) => u.id === selectedUtilityId) ?? null,
    [utilities, selectedUtilityId]
  );

  const hasWater = utilities.some((u) => u.kind === "water");

  const clampToFloor = (x: number, y: number) => {
    const fb = getFloorBounds(segments);
    return {
      x: Math.min(Math.max(x, fb.minX + FLOOR_MARGIN_CM), fb.maxX - FLOOR_MARGIN_CM),
      y: Math.min(Math.max(y, fb.minY + FLOOR_MARGIN_CM), fb.maxY - FLOOR_MARGIN_CM),
    };
  };

  const wallPatchFromPoint = (p: PlanPoint) => {
    if (!p.nearestWallId) return null;
    const seg = segById.get(p.nearestWallId);
    if (!seg) return null;
    const pos = Math.round(Math.min(Math.max(p.distanceAlongWall, 0), seg.length));
    return { wallId: seg.id, positionAlongWall: pos };
  };

  const handlePlace = (p: PlanPoint) => {
    if (!placementKind) return;
    const kind = placementKind;
    if (kind === "water" && hasWater) {
      setPlacementKind(null);
      return;
    }
    let utility: KitchenUtility | null = null;
    if (kind === "drain" && p.perpDistance > WALL_SNAP_CM) {
      const c = clampToFloor(p.x, p.y);
      utility = {
        id: newUtilityId(),
        kind,
        x: Math.round(c.x),
        y: Math.round(c.y),
        heightFromFloor: 0,
      };
    } else {
      const wp = wallPatchFromPoint(p);
      if (!wp) return;
      utility = {
        id: newUtilityId(),
        kind,
        ...wp,
        heightFromFloor: UTILITY_DEFAULT_HEIGHT[kind],
      };
    }
    addUtility(utility);
    setSelectedUtilityId(utility.id);
    setPlacementKind(null);
  };

  const handleDragUtility = (id: string, p: PlanPoint) => {
    const utility = utilities.find((u) => u.id === id);
    if (!utility) return;
    if (utility.kind === "drain") {
      // Drains float between floor and wall: snap to a wall when close, free on the floor otherwise
      if (p.perpDistance <= WALL_SNAP_CM) {
        const wp = wallPatchFromPoint(p);
        if (!wp) return;
        updateUtility(id, {
          ...wp,
          x: undefined,
          y: undefined,
          heightFromFloor: UTILITY_DEFAULT_HEIGHT.drain,
        });
      } else {
        const c = clampToFloor(p.x, p.y);
        updateUtility(id, {
          wallId: undefined,
          positionAlongWall: undefined,
          x: Math.round(c.x),
          y: Math.round(c.y),
          heightFromFloor: 0,
        });
      }
    } else {
      const wp = wallPatchFromPoint(p);
      if (!wp) return;
      updateUtility(id, wp);
    }
  };

  const handleDistanceChange = (raw: number) => {
    if (!selectedUtility || !selectedUtility.wallId || !Number.isFinite(raw)) return;
    const seg = segById.get(selectedUtility.wallId);
    if (!seg) return;
    const pos = Math.round(Math.min(Math.max(Math.trunc(raw), 0), seg.length));
    updateUtility(selectedUtility.id, { positionAlongWall: pos });
  };

  const handleDelete = () => {
    if (!selectedUtility) return;
    removeUtility(selectedUtility.id);
    setSelectedUtilityId(null);
  };

  const BackIcon = isRTL ? ChevronRight : ChevronLeft;
  const NextIcon = isRTL ? ChevronLeft : ChevronRight;

  const paletteButtons: {
    kind: UtilityKind;
    icon: typeof Droplets;
    color: string;
    testid: string;
  }[] = [
    { kind: "water", icon: Droplets, color: "border-sky-500/40 text-sky-600 hover:bg-sky-500/10", testid: "button-util-water" },
    { kind: "outlet", icon: Plug, color: "border-amber-500/40 text-amber-600 hover:bg-amber-500/10", testid: "button-util-outlet" },
    { kind: "switch", icon: Lightbulb, color: "border-violet-500/40 text-violet-600 hover:bg-violet-500/10", testid: "button-util-switch" },
    { kind: "drain", icon: Waves, color: "border-teal-500/40 text-teal-600 hover:bg-teal-500/10", testid: "button-util-drain" },
  ];

  const selectedKindLabel = selectedUtility
    ? t(KIND_LABELS[selectedUtility.kind].ar, KIND_LABELS[selectedUtility.kind].en)
    : "";

  return (
    <DesktopGate>
      <div className="min-h-screen bg-background flex flex-col">
        <ToolNav homeTestId="link-utilities-home" />
        <div className="max-w-6xl mx-auto w-full px-6 pt-6">
          <ToolStages current="utilities" />
        </div>

        <div className="flex-1 max-w-6xl mx-auto w-full px-6 py-8 grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-8 items-start">
          {/* Controls */}
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold mb-1" data-testid="text-utilities-title">
                {t("المرافق", "Utilities")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t(
                  "حدد أماكن المياه والكهرباء والتصريف إن وجدت — يمكنك تخطي هذه الخطوة.",
                  "Mark water, electricity and drainage locations if any — you can skip this step."
                )}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {paletteButtons.map(({ kind, icon: Icon, color, testid }) => {
                const disabled = kind === "water" && hasWater;
                const active = placementKind === kind;
                return (
                  <Button
                    key={kind}
                    variant={active ? "default" : "outline"}
                    className={`h-auto py-3 font-bold ${active ? "" : color}`}
                    disabled={disabled}
                    title={
                      disabled
                        ? t("يمكن إضافة تغذية واحدة", "Only one water supply allowed")
                        : undefined
                    }
                    onClick={() => {
                      setPlacementKind(active ? null : kind);
                      setSelectedUtilityId(null);
                    }}
                    data-testid={testid}
                  >
                    <Icon className="w-4 h-4 me-2 shrink-0" />
                    {t(KIND_LABELS[kind].ar, KIND_LABELS[kind].en)}
                  </Button>
                );
              })}
            </div>

            {placementKind && (
              <p
                className="text-sm text-primary bg-primary/5 border border-primary/20 rounded-lg p-3"
                data-testid="text-placement-hint"
              >
                {placementKind === "drain"
                  ? t(
                      "اضغط على أرضية المطبخ أو على جدار في المخطط لوضع التصريف.",
                      "Click on the kitchen floor or a wall in the plan to place the drain."
                    )
                  : t(
                      "اضغط على جدار في المخطط لوضع العنصر — سيلتصق بالجدار تلقائياً.",
                      "Click a wall on the plan to place the item — it will snap to the wall."
                    )}
              </p>
            )}

            {selectedUtility ? (
              <div
                className="rounded-xl border border-border bg-card p-4 space-y-4"
                data-testid="panel-selected-utility"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm" data-testid="text-selected-utility">
                    {selectedKindLabel}
                    {selectedUtility.wallId
                      ? ` — ${t(wallLabelAr(selectedUtility.wallId), wallLabelEn(selectedUtility.wallId))}`
                      : ` — ${t("الأرضية", "Floor")}`}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10 h-8 w-8"
                    onClick={handleDelete}
                    data-testid="button-delete-utility"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                {selectedUtility.wallId ? (
                  <div className="space-y-2">
                    <Label className="text-xs">
                      {t("البعد عن بداية الجدار (سم)", "Distance from wall start (cm)")}
                    </Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={Math.round(selectedUtility.positionAlongWall ?? 0)}
                      onChange={(e) => handleDistanceChange(Number(e.target.value))}
                      data-testid="input-utility-distance"
                    />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground" data-testid="text-floor-position">
                    {t(
                      "اسحب الرمز على المخطط لتحديد موقعه — تظهر المسافات أثناء السحب.",
                      "Drag the symbol on the plan to position it — distances show while dragging."
                    )}
                  </p>
                )}
              </div>
            ) : (
              !placementKind && (
                <p
                  className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3"
                  data-testid="text-utilities-hint"
                >
                  {t(
                    "اختر عنصراً من الأزرار ثم اضغط على المخطط لوضعه، أو اضغط على عنصر موجود لتعديله.",
                    "Pick an item from the buttons then click the plan to place it, or click an existing item to edit it."
                  )}
                </p>
              )
            )}

            {utilities.length > 0 && (
              <p className="text-xs text-muted-foreground" data-testid="text-utilities-count">
                {t(`عدد العناصر: ${utilities.length}`, `Items: ${utilities.length}`)}
              </p>
            )}
          </div>

          {/* Interactive plan */}
          <div
            className="bg-card border border-border rounded-xl p-4 xl:p-8 min-h-[420px] flex items-center justify-center select-none"
            onClick={() => setSelectedUtilityId(null)}
          >
            <div onClick={(e) => e.stopPropagation()} className="w-full">
              <KitchenPlanSvg
                layout={layout}
                walls={walls}
                openings={openings}
                utilities={utilities}
                selectedUtilityId={selectedUtilityId}
                onSelectUtility={setSelectedUtilityId}
                onDragUtilityPoint={handleDragUtility}
                placementActive={placementKind !== null}
                onPlacePoint={handlePlace}
                t={t}
                className="w-full max-h-[560px]"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-border/50 bg-background">
          <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
            <Button
              variant="outline"
              size="lg"
              onClick={() => setLocation("/kitchen-designer/openings")}
              className="font-bold min-w-[130px]"
              data-testid="button-utilities-back"
            >
              <BackIcon className="w-4 h-4 me-1" />
              {t("السابق", "Back")}
            </Button>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="lg"
                onClick={() => setLocation("/kitchen-designer/studio")}
                className="font-bold text-muted-foreground"
                data-testid="button-skip-utilities"
              >
                {t("تخطي هذه الخطوة", "Skip this step")}
              </Button>
              <Button
                size="lg"
                onClick={() => setLocation("/kitchen-designer/studio")}
                className="font-bold min-w-[130px]"
                data-testid="button-utilities-next"
              >
                {t("التالي", "Next")}
                <NextIcon className="w-4 h-4 ms-1" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </DesktopGate>
  );
}
