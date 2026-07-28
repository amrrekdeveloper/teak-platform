import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  ChevronRight,
  ChevronLeft,
  DoorOpen,
  AppWindow,
  X,
  ArrowLeftRight,
  FlipHorizontal2,
  Droplets,
  Plug,
  Lightbulb,
  Waves,
  Flame,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
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
  clampWallLength,
  DOOR_DEFAULT_WIDTH,
  WINDOW_DEFAULT_WIDTH,
  OPENING_MIN_WIDTH,
  OPENING_MAX_WIDTH,
  UTILITY_DEFAULT_HEIGHT,
  type KitchenLayout,
  type KitchenOpening,
  type OpeningType,
  type KitchenUtility,
  type UtilityKind,
} from "@/components/kitchen-tool/store";

/** Free gaps [start, maxStart] where an opening of `width` can be placed on the wall. */
function freeGaps(
  openings: KitchenOpening[],
  wallId: string,
  wallLength: number,
  width: number,
  excludeId?: string
): [number, number][] {
  const others = openings
    .filter((o) => o.wallId === wallId && o.id !== excludeId)
    .sort((a, b) => a.distanceFromWallStart - b.distanceFromWallStart);
  const gaps: [number, number][] = [];
  let cursor = 0;
  for (const o of others) {
    if (o.distanceFromWallStart - cursor >= width) {
      gaps.push([cursor, o.distanceFromWallStart - width]);
    }
    cursor = Math.max(cursor, o.distanceFromWallStart + o.width);
  }
  if (wallLength - cursor >= width) {
    gaps.push([cursor, wallLength - width]);
  }
  return gaps;
}

/** Clamp a desired position into the nearest valid free gap; null if none fits. */
function clampIntoGaps(gaps: [number, number][], desired: number): number | null {
  if (gaps.length === 0) return null;
  let best: number | null = null;
  let bestDist = Infinity;
  for (const [lo, hi] of gaps) {
    const c = Math.min(Math.max(desired, lo), hi);
    const dist = Math.abs(c - desired);
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return best;
}

let idCounter = 0;
function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

/** Drains snap to a wall when dropped/dragged within this distance (cm). */
const WALL_SNAP_CM = 12;
/** Keep floor drains at least this far (cm) inside the floor edges. */
const FLOOR_MARGIN_CM = 8;

const KIND_LABELS: Record<UtilityKind, { ar: string; en: string }> = {
  water: { ar: "تغذية مياه", en: "Water Supply" },
  outlet: { ar: "فيش كهرباء", en: "Power Outlet" },
  switch: { ar: "مفتاح إضاءة", en: "Light Switch" },
  drain: { ar: "تصريف", en: "Drain" },
  gas: { ar: "مخرج غاز", en: "Gas Outlet" },
};

export default function KitchenToolDetailsPage() {
  const { t, isRTL } = useLanguage();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const {
    answers,
    walls,
    openings,
    utilities,
    addOpening,
    updateOpening,
    removeOpening,
    addUtility,
    updateUtility,
    removeUtility,
    ensureWalls,
  } = useKitchenToolStore();
  const ceilingHeight = useKitchenToolStore((s) => s.ceilingHeight);

  const layout: KitchenLayout = answers.layout ?? "L";
  const [selectedWallId, setSelectedWallId] = useState<string>(walls[0]?.id ?? "A");
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(null);
  const [selectedUtilityId, setSelectedUtilityId] = useState<string | null>(null);
  const [placementKind, setPlacementKind] = useState<UtilityKind | null>(null);
  const [commitBump, setCommitBump] = useState(0);

  useEffect(() => {
    ensureWalls(layout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  useEffect(() => {
    if (walls.length > 0 && !walls.some((w) => w.id === selectedWallId)) {
      setSelectedWallId(walls[0].id);
    }
  }, [walls, selectedWallId]);

  const wallById = useMemo(() => new Map(walls.map((w) => [w.id, w])), [walls]);
  const segments = useMemo(() => getWallSegments(layout, walls), [layout, walls]);
  const segById = useMemo(() => new Map(segments.map((s) => [s.id, s])), [segments]);

  const selectedOpening = useMemo(
    () => openings.find((o) => o.id === selectedOpeningId) ?? null,
    [openings, selectedOpeningId]
  );
  const selectedUtility = useMemo(
    () => utilities.find((u) => u.id === selectedUtilityId) ?? null,
    [utilities, selectedUtilityId]
  );
  const hasWater = utilities.some((u) => u.kind === "water");

  /* ── Openings handlers ── */
  const handleAddOpening = (type: OpeningType) => {
    const wall = wallById.get(selectedWallId) ?? walls[0];
    if (!wall) return;
    const wallLength = clampWallLength(wall.length);
    const width = type === "door" ? DOOR_DEFAULT_WIDTH : WINDOW_DEFAULT_WIDTH;
    const gaps = freeGaps(openings, wall.id, wallLength, width);
    const placed = clampIntoGaps(gaps, (wallLength - width) / 2);
    if (placed === null) {
      toast({
        title: t("لا توجد مساحة كافية", "Not enough space"),
        description: t(
          `لا يمكن إضافة ${type === "door" ? "باب" : "نافذة"} على هذا الجدار — المساحة ممتلئة.`,
          `Cannot add a ${type} on this wall — no free space.`
        ),
        variant: "destructive",
      });
      return;
    }
    const opening: KitchenOpening = {
      id: newId("op"),
      wallId: wall.id,
      type,
      width,
      distanceFromWallStart: placed,
    };
    addOpening(opening);
    setSelectedOpeningId(opening.id);
    setSelectedUtilityId(null);
    setPlacementKind(null);
  };

  const handleDragOpening = (id: string, desired: number) => {
    const opening = openings.find((o) => o.id === id);
    if (!opening) return;
    const wall = wallById.get(opening.wallId);
    if (!wall) return;
    const wallLength = clampWallLength(wall.length);
    const gaps = freeGaps(openings, opening.wallId, wallLength, opening.width, id);
    const clamped = clampIntoGaps(gaps, desired);
    if (clamped === null) return;
    updateOpening(id, { distanceFromWallStart: Math.round(clamped) });
  };

  const handleWidthChange = (raw: number) => {
    if (!selectedOpening) return;
    const wall = wallById.get(selectedOpening.wallId);
    if (!wall) return;
    const wallLength = clampWallLength(wall.length);
    if (!Number.isFinite(raw)) return;
    let width = Math.min(Math.max(Math.trunc(raw), OPENING_MIN_WIDTH), OPENING_MAX_WIDTH);
    width = Math.min(width, wallLength);
    let pos: number | null = null;
    while (width >= OPENING_MIN_WIDTH) {
      const gaps = freeGaps(openings, selectedOpening.wallId, wallLength, width, selectedOpening.id);
      pos = clampIntoGaps(gaps, selectedOpening.distanceFromWallStart);
      if (pos !== null) break;
      width -= 10;
    }
    if (pos === null || width < OPENING_MIN_WIDTH) {
      toast({
        title: t("لا توجد مساحة كافية", "Not enough space"),
        description: t(
          "لا توجد مساحة كافية على الجدار لهذا العرض.",
          "Not enough free space on the wall for this width."
        ),
        variant: "destructive",
      });
      return;
    }
    updateOpening(selectedOpening.id, { width, distanceFromWallStart: Math.round(pos) });
  };

  const handleDistanceChange = (raw: number) => {
    if (!selectedOpening || !Number.isFinite(raw)) return;
    handleDragOpening(selectedOpening.id, Math.trunc(raw));
  };

  /* ── Utilities handlers ── */
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

  const handlePlaceUtility = (p: PlanPoint) => {
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
        id: newId("ut"),
        kind,
        x: Math.round(c.x),
        y: Math.round(c.y),
        heightFromFloor: 0,
      };
    } else {
      const wp = wallPatchFromPoint(p);
      if (!wp) return;
      utility = {
        id: newId("ut"),
        kind,
        ...wp,
        heightFromFloor: UTILITY_DEFAULT_HEIGHT[kind],
      };
    }
    addUtility(utility);
    setSelectedUtilityId(utility.id);
    setSelectedOpeningId(null);
    setPlacementKind(null);
  };

  const handleDragUtility = (id: string, p: PlanPoint) => {
    const utility = utilities.find((u) => u.id === id);
    if (!utility) return;
    if (utility.kind === "drain") {
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

  const handleUtilityDistanceChange = (raw: number) => {
    if (!selectedUtility || !selectedUtility.wallId || !Number.isFinite(raw)) return;
    const seg = segById.get(selectedUtility.wallId);
    if (!seg) return;
    const pos = Math.round(Math.min(Math.max(Math.trunc(raw), 0), seg.length));
    updateUtility(selectedUtility.id, { positionAlongWall: pos });
  };

  const handleUtilityHeightChange = (raw: number) => {
    if (!selectedUtility || !selectedUtility.wallId || !Number.isFinite(raw)) return;
    const h = Math.round(Math.min(Math.max(Math.trunc(raw), 0), 300));
    updateUtility(selectedUtility.id, { heightFromFloor: h });
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
    { kind: "gas", icon: Flame, color: "border-orange-500/40 text-orange-600 hover:bg-orange-500/10", testid: "button-util-gas" },
  ];

  const selectedKindLabel = selectedUtility
    ? t(KIND_LABELS[selectedUtility.kind].ar, KIND_LABELS[selectedUtility.kind].en)
    : "";

  return (
    <DesktopGate>
      <div className="min-h-screen bg-background flex flex-col">
        <ToolNav homeTestId="link-details-home" />
        <div className="max-w-6xl mx-auto w-full px-6 pt-6">
          <ToolStages current="details" />
        </div>

        <div className="flex-1 max-w-6xl mx-auto w-full px-6 py-8 grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-8 items-start">
          {/* Controls */}
          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-bold mb-1" data-testid="text-details-title">
                {t("تفاصيل المكان", "Place Details")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t(
                  "أضف الأبواب والنوافذ ونقاط الخدمات على الجدران — اسحبها على المخطط لتحديد موضعها بدقة.",
                  "Add doors, windows and utility points on the walls — drag them on the plan to position them precisely."
                )}
              </p>
            </div>

            <div className="space-y-2">
              <Label className="font-bold">{t("اختر الجدار", "Choose Wall")}</Label>
              <Select value={selectedWallId} onValueChange={setSelectedWallId}>
                <SelectTrigger data-testid="select-opening-wall">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {walls.map((w) => (
                    <SelectItem key={w.id} value={w.id} data-testid={`select-wall-${w.id}`}>
                      {t(wallLabelAr(w.id), wallLabelEn(w.id))} —{" "}
                      {Math.round(clampWallLength(w.length))} {t("سم", "cm")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="font-bold">{t("الأبواب والنوافذ", "Doors & Windows")}</Label>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="font-bold border-primary/40 text-primary hover:bg-primary/10"
                  onClick={() => handleAddOpening("door")}
                  data-testid="button-add-door"
                >
                  <DoorOpen className="w-4 h-4 me-2" />
                  {t("أضف باباً", "Add Door")}
                </Button>
                <Button
                  variant="outline"
                  className="font-bold border-sky-500/40 text-sky-600 hover:bg-sky-500/10"
                  onClick={() => handleAddOpening("window")}
                  data-testid="button-add-window"
                >
                  <AppWindow className="w-4 h-4 me-2" />
                  {t("أضف نافذة", "Add Window")}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-bold">{t("نقاط الخدمات", "Utility Points")}</Label>
              <div className="grid grid-cols-2 gap-3">
                {paletteButtons.map(({ kind, icon: Icon, color, testid }) => {
                  const disabled = kind === "water" && hasWater;
                  const active = placementKind === kind;
                  return (
                    <Button
                      key={kind}
                      variant={active ? "default" : "outline"}
                      className={`h-auto py-2.5 font-bold ${active ? "" : color}`}
                      disabled={disabled}
                      title={
                        disabled
                          ? t("يمكن إضافة تغذية واحدة", "Only one water supply allowed")
                          : undefined
                      }
                      onClick={() => {
                        setPlacementKind(active ? null : kind);
                        setSelectedUtilityId(null);
                        setSelectedOpeningId(null);
                      }}
                      data-testid={testid}
                    >
                      <Icon className="w-4 h-4 me-2 shrink-0" />
                      {t(KIND_LABELS[kind].ar, KIND_LABELS[kind].en)}
                    </Button>
                  );
                })}
              </div>
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

            {selectedOpening && (
              <div className="rounded-xl border border-border bg-card p-4 space-y-4" data-testid="panel-selected-opening">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm">
                    {selectedOpening.type === "door" ? t("باب محدد", "Selected Door") : t("نافذة محددة", "Selected Window")}
                    {" — "}
                    {t(wallLabelAr(selectedOpening.wallId), wallLabelEn(selectedOpening.wallId))}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      removeOpening(selectedOpening.id);
                      setSelectedOpeningId(null);
                    }}
                    data-testid="button-delete-opening"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="opening-width" className="text-xs text-muted-foreground">
                      {t("العرض (سم)", "Width (cm)")}
                    </Label>
                    <Input
                      key={`w-${selectedOpening.id}-${selectedOpening.width}-${commitBump}`}
                      id="opening-width"
                      type="number"
                      inputMode="numeric"
                      min={OPENING_MIN_WIDTH}
                      max={OPENING_MAX_WIDTH}
                      defaultValue={selectedOpening.width}
                      onBlur={(e) => {
                        handleWidthChange(e.target.valueAsNumber);
                        setCommitBump((n) => n + 1);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                      className="h-9"
                      data-testid="input-opening-width"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="opening-distance" className="text-xs text-muted-foreground">
                      {t("البعد عن بداية الجدار (سم)", "From wall start (cm)")}
                    </Label>
                    <Input
                      key={`d-${selectedOpening.id}-${Math.round(selectedOpening.distanceFromWallStart)}-${commitBump}`}
                      id="opening-distance"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      defaultValue={Math.round(selectedOpening.distanceFromWallStart)}
                      onBlur={(e) => {
                        handleDistanceChange(e.target.valueAsNumber);
                        setCommitBump((n) => n + 1);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                      className="h-9"
                      data-testid="input-opening-distance"
                    />
                  </div>
                </div>
                {selectedOpening.type === "window" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="opening-sill" className="text-xs text-muted-foreground">
                        {t("ارتفاع الجلسة من الأرضية (سم)", "Sill height from floor (cm)")}
                      </Label>
                      <Input
                        key={`s-${selectedOpening.id}-${selectedOpening.sillHeight ?? 90}-${commitBump}`}
                        id="opening-sill"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={ceilingHeight - 40}
                        defaultValue={selectedOpening.sillHeight ?? 90}
                        onBlur={(e) => {
                          const v = e.target.valueAsNumber;
                          if (Number.isFinite(v)) {
                            const sill = Math.min(Math.max(Math.round(v), 0), ceilingHeight - 40);
                            const h = Math.min(
                              selectedOpening.height ?? 120,
                              ceilingHeight - sill - 10
                            );
                            updateOpening(selectedOpening.id, { sillHeight: sill, height: h });
                          }
                          setCommitBump((n) => n + 1);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                        className="h-9"
                        data-testid="input-opening-sill"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="opening-height" className="text-xs text-muted-foreground">
                        {t("ارتفاع النافذة (سم)", "Window height (cm)")}
                      </Label>
                      <Input
                        key={`h-${selectedOpening.id}-${selectedOpening.height ?? 120}-${commitBump}`}
                        id="opening-height"
                        type="number"
                        inputMode="numeric"
                        min={30}
                        max={ceilingHeight - 10}
                        defaultValue={selectedOpening.height ?? 120}
                        onBlur={(e) => {
                          const v = e.target.valueAsNumber;
                          if (Number.isFinite(v)) {
                            const sill = selectedOpening.sillHeight ?? 90;
                            const h = Math.min(
                              Math.max(Math.round(v), 30),
                              Math.max(ceilingHeight - sill - 10, 30)
                            );
                            updateOpening(selectedOpening.id, { height: h });
                          }
                          setCommitBump((n) => n + 1);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                        className="h-9"
                        data-testid="input-opening-height"
                      />
                    </div>
                    <p className="col-span-2 text-[11px] text-muted-foreground leading-relaxed">
                      {t(
                        `أعلى النافذة: ${(selectedOpening.sillHeight ?? 90) + (selectedOpening.height ?? 120)} سم من الأرضية — الخزائن العلوية تركب فوق النافذة إذا كان أعلاها منخفضاً بما يكفي، والسفلية تحت الجلسة.`,
                        `Window top: ${(selectedOpening.sillHeight ?? 90) + (selectedOpening.height ?? 120)} cm from floor — upper cabinets fit above the window if its top is low enough, base cabinets fit under the sill.`
                      )}
                    </p>
                  </div>
                )}
                {selectedOpening.type === "door" && (
                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full font-bold"
                      onClick={() =>
                        updateOpening(selectedOpening.id, {
                          swing: (selectedOpening.swing ?? "in") === "in" ? "out" : "in",
                        })
                      }
                      data-testid="button-toggle-swing"
                    >
                      <ArrowLeftRight className="w-4 h-4 me-2" />
                      {t("عكس اتجاه الفتح", "Flip Swing Direction")}
                      <span className="text-xs text-muted-foreground font-normal ms-2">
                        {(selectedOpening.swing ?? "in") === "in"
                          ? t("(للداخل)", "(inward)")
                          : t("(للخارج)", "(outward)")}
                      </span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full font-bold"
                      onClick={() =>
                        updateOpening(selectedOpening.id, {
                          hinge:
                            (selectedOpening.hinge ?? "start") === "start" ? "end" : "start",
                        })
                      }
                      data-testid="button-toggle-hinge"
                    >
                      <FlipHorizontal2 className="w-4 h-4 me-2" />
                      {t("عكس جهة المفصلة", "Flip Hinge Side")}
                      <span className="text-xs text-muted-foreground font-normal ms-2">
                        {(selectedOpening.hinge ?? "start") === "start"
                          ? t("(يسار)", "(left)")
                          : t("(يمين)", "(right)")}
                      </span>
                    </Button>
                  </div>
                )}
              </div>
            )}

            {selectedUtility && (
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
                    onClick={() => {
                      removeUtility(selectedUtility.id);
                      setSelectedUtilityId(null);
                    }}
                    data-testid="button-delete-utility"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                {selectedUtility.wallId ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">
                        {t("البعد عن بداية الجدار (سم)", "Distance from wall start (cm)")}
                      </Label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        value={Math.round(selectedUtility.positionAlongWall ?? 0)}
                        onChange={(e) => handleUtilityDistanceChange(Number(e.target.value))}
                        data-testid="input-utility-distance"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">
                        {t("الارتفاع من الأرضية (سم)", "Height from floor (cm)")}
                      </Label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        value={Math.round(selectedUtility.heightFromFloor)}
                        onChange={(e) => handleUtilityHeightChange(Number(e.target.value))}
                        data-testid="input-utility-height"
                      />
                    </div>
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
            )}

            {!selectedOpening && !selectedUtility && !placementKind && (
              <p
                className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3"
                data-testid="text-details-hint"
              >
                {t(
                  "اضغط على عنصر في المخطط لتحديده وتعديله، أو أضف عنصراً جديداً من الأزرار — يمكنك تخطي هذه الخطوة.",
                  "Click an item on the plan to select and edit it, or add a new one from the buttons — you can skip this step."
                )}
              </p>
            )}
          </div>

          {/* Interactive plan */}
          <div
            className="bg-card border border-border rounded-xl p-4 xl:p-8 min-h-[420px] flex items-center justify-center select-none"
            onClick={() => {
              setSelectedOpeningId(null);
              setSelectedUtilityId(null);
            }}
          >
            <div onClick={(e) => e.stopPropagation()} className="w-full">
              <KitchenPlanSvg
                layout={layout}
                walls={walls}
                openings={openings}
                utilities={utilities}
                selectedOpeningId={selectedOpeningId}
                onSelectOpening={(id) => {
                  setSelectedOpeningId(id);
                  if (id) setSelectedUtilityId(null);
                }}
                onDragOpening={handleDragOpening}
                selectedUtilityId={selectedUtilityId}
                onSelectUtility={(id) => {
                  setSelectedUtilityId(id);
                  if (id) setSelectedOpeningId(null);
                }}
                onDragUtilityPoint={handleDragUtility}
                placementActive={placementKind !== null}
                onPlacePoint={handlePlaceUtility}
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
              onClick={() => setLocation("/kitchen-designer/space")}
              className="font-bold min-w-[130px]"
              data-testid="button-details-back"
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
                data-testid="button-skip-details"
              >
                {t("تخطي هذه الخطوة", "Skip this step")}
              </Button>
              <Button
                size="lg"
                onClick={() => setLocation("/kitchen-designer/studio")}
                className="font-bold min-w-[130px]"
                data-testid="button-details-next"
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
