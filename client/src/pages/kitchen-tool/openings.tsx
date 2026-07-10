import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ChevronRight, ChevronLeft, DoorOpen, AppWindow, X, ArrowLeftRight, FlipHorizontal2 } from "lucide-react";
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
import KitchenPlanSvg, { wallLabelAr, wallLabelEn } from "@/components/kitchen-tool/plan-svg";
import { ToolStages, ToolNav } from "@/components/kitchen-tool/tool-stages";
import {
  useKitchenToolStore,
  clampWallLength,
  DOOR_DEFAULT_WIDTH,
  WINDOW_DEFAULT_WIDTH,
  OPENING_MIN_WIDTH,
  OPENING_MAX_WIDTH,
  type KitchenLayout,
  type KitchenOpening,
  type OpeningType,
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

let openingCounter = 0;
function newOpeningId(): string {
  openingCounter += 1;
  return `op-${Date.now().toString(36)}-${openingCounter}`;
}

export default function KitchenToolOpeningsPage() {
  const { t, isRTL } = useLanguage();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { answers, walls, openings, addOpening, updateOpening, removeOpening, ensureWalls } =
    useKitchenToolStore();

  const layout: KitchenLayout = answers.layout ?? "L";
  const [selectedWallId, setSelectedWallId] = useState<string>(walls[0]?.id ?? "A");
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(null);
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

  const selectedOpening = useMemo(
    () => openings.find((o) => o.id === selectedOpeningId) ?? null,
    [openings, selectedOpeningId]
  );

  const wallById = useMemo(() => new Map(walls.map((w) => [w.id, w])), [walls]);

  const handleAdd = (type: OpeningType) => {
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
      id: newOpeningId(),
      wallId: wall.id,
      type,
      width,
      distanceFromWallStart: placed,
    };
    addOpening(opening);
    setSelectedOpeningId(opening.id);
  };

  const handleDrag = (id: string, desired: number) => {
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
    // Silently shrink the width until it fits into a free gap near the current position
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
    handleDrag(selectedOpening.id, Math.trunc(raw));
  };

  const handleDelete = () => {
    if (!selectedOpening) return;
    removeOpening(selectedOpening.id);
    setSelectedOpeningId(null);
  };

  const BackIcon = isRTL ? ChevronRight : ChevronLeft;
  const NextIcon = isRTL ? ChevronLeft : ChevronRight;

  return (
    <DesktopGate>
      <div className="min-h-screen bg-background flex flex-col">
        <ToolNav homeTestId="link-openings-home" />
        <div className="max-w-6xl mx-auto w-full px-6 pt-6">
          <ToolStages current="openings" />
        </div>

        <div className="flex-1 max-w-6xl mx-auto w-full px-6 py-8 grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-8 items-start">
          {/* Controls */}
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold mb-1" data-testid="text-openings-title">
                {t("الأبواب والنوافذ", "Doors & Windows")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t(
                  "أضف الفتحات ثم اسحبها على المخطط لتحديد موضعها بدقة.",
                  "Add openings, then drag them on the plan to position them precisely."
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

            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="font-bold border-primary/40 text-primary hover:bg-primary/10"
                onClick={() => handleAdd("door")}
                data-testid="button-add-door"
              >
                <DoorOpen className="w-4 h-4 me-2" />
                {t("أضف باباً", "Add Door")}
              </Button>
              <Button
                variant="outline"
                className="font-bold border-sky-500/40 text-sky-600 hover:bg-sky-500/10"
                onClick={() => handleAdd("window")}
                data-testid="button-add-window"
              >
                <AppWindow className="w-4 h-4 me-2" />
                {t("أضف نافذة", "Add Window")}
              </Button>
            </div>

            {selectedOpening ? (
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
                    onClick={handleDelete}
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
            ) : (
              <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3" data-testid="text-openings-hint">
                {t(
                  "اضغط على فتحة في المخطط لتحديدها وتعديل عرضها أو حذفها.",
                  "Click an opening on the plan to select, resize, or delete it."
                )}
              </p>
            )}

            {openings.length > 0 && (
              <p className="text-xs text-muted-foreground" data-testid="text-openings-count">
                {t(`عدد الفتحات: ${openings.length}`, `Openings: ${openings.length}`)}
              </p>
            )}
          </div>

          {/* Interactive plan */}
          <div
            className="bg-card border border-border rounded-xl p-4 xl:p-8 min-h-[420px] flex items-center justify-center select-none"
            onClick={() => setSelectedOpeningId(null)}
          >
            <div onClick={(e) => e.stopPropagation()} className="w-full">
              <KitchenPlanSvg
                layout={layout}
                walls={walls}
                openings={openings}
                selectedOpeningId={selectedOpeningId}
                onSelectOpening={setSelectedOpeningId}
                onDragOpening={handleDrag}
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
              onClick={() => setLocation("/kitchen-designer/dimensions")}
              className="font-bold min-w-[130px]"
              data-testid="button-openings-back"
            >
              <BackIcon className="w-4 h-4 me-1" />
              {t("السابق", "Back")}
            </Button>
            <Button
              size="lg"
              onClick={() => setLocation("/kitchen-designer/utilities")}
              className="font-bold min-w-[130px]"
              data-testid="button-openings-next"
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
