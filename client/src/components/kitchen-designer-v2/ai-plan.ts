/**
 * V2 intelligent kitchen designer — semantic design contract + engineering
 * guard + renderable adapter.
 *
 * Architecture:
 *   room + prefs  →  intelligent planner (server)  →  semantic KitchenDesignPlan
 *                 →  engineering guard (this module) →  legal editable cabinets
 *                 →  adapter maps Teak semantic families → currently renderable defs
 *
 * The plan is a *Teak design intent* document: semantic unit families with
 * parametric manufacturable widths and design meaning (sink base, cooktop
 * base, oven tower, refrigerator housing, tall pantry…). It is NOT a list
 * of Adeko product ids — the adapter (`defForUnit`) is the only place that
 * touches renderable catalog defs, and is replaceable without changing the
 * contract.
 *
 * The guard preserves as much of the intelligent design as possible: it
 * snaps a unit to the nearest legal offset on its requested wall, relocates
 * it if that wall cannot host it, and drops it only when it is impossible.
 * It never replaces the design with a fixed template. When the intelligent
 * service is completely unavailable, `buildFallbackPlan` produces a
 * deterministic, utility-aware plan from the room data itself.
 */
import type { WallSegment } from "@/components/kitchen-designer-v2/plan-svg";
import type {
  KitchenOpening,
  KitchenUtility,
  KitchenWall,
  KitchenLayout,
  PlacedCabinetState,
} from "@/components/kitchen-designer-v2/store";
import {
  blockedIntervals,
  resolveDragOffset,
  findSlotForCabinet,
  findCornerSlot,
  registerAdekoDef,
  verticalSpan,
  EXTRA_CABINET_DEFS,
  type CabinetDef,
  type PlacedCabinet,
} from "@/components/kitchen-designer-v2/cabinets";
import type { KitchenTemplate } from "@/components/kitchen-designer-v2/templates";

const CM = 0.01;

/* ── Semantic design contract (what the intelligent designer returns) ── */

/** Teak semantic unit families — design meaning, not catalog ids. */
export type TeakUnitFamily =
  | "cornerUnit"
  | "sinkBase"
  | "cooktopBase"
  | "ovenTower"
  | "tallPantry"
  | "fridgeHousing"
  | "drawerBase"
  | "baseCabinet"
  | "wallCabinet"
  | "filler";

/** Manufacturable parametric width range (cm) per family. */
export const FAMILY_WIDTH_RANGE: Record<TeakUnitFamily, [number, number]> = {
  cornerUnit: [90, 105],
  sinkBase: [60, 120],
  cooktopBase: [60, 90],
  ovenTower: [60, 60],
  tallPantry: [45, 90],
  fridgeHousing: [65, 90],
  drawerBase: [40, 100],
  baseCabinet: [30, 100],
  wallCabinet: [30, 100],
  filler: [5, 15],
};

/** Legacy aliases accepted from the model (v1 wire names). */
const FAMILY_ALIASES: Record<string, TeakUnitFamily> = {
  corner: "cornerUnit",
  sink: "sinkBase",
  cooktop: "cooktopBase",
  tower: "ovenTower",
  drawers: "drawerBase",
  base: "baseCabinet",
  upper: "wallCabinet",
};

export interface PlanUnit {
  /** Semantic family — the design meaning of the unit. */
  unit: TeakUnitFamily;
  /** Target wall id (A/B/C…). Optional — guard finds a legal wall when omitted. */
  wallId?: string;
  /** Desired distance (cm) from wall start to the unit's near edge. */
  offsetCm?: number;
  /** Desired parametric width (cm) — clamped to the family's manufacturable range. */
  widthCm?: number;
}

export interface KitchenDesignPlan {
  units: PlanUnit[];
  /** Designer's island judgement — honored only when the deterministic fit test agrees. */
  island?: boolean;
  /** Free-form designer notes (zoning rationale) — informational only. */
  designNotes?: string;
}

/** Backwards-compatible exports (earlier iteration of the contract). */
export type AiPlan = KitchenDesignPlan;
export type AiPlanUnit = PlanUnit;
export type AiUnitType = TeakUnitFamily;

/** Parse + sanity check the raw planner response. Null when unusable. */
export function parseAiPlan(raw: unknown): KitchenDesignPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const units = (raw as { units?: unknown }).units;
  if (!Array.isArray(units) || units.length === 0) return null;
  const valid: PlanUnit[] = [];
  for (const u of units) {
    if (!u || typeof u !== "object") continue;
    const rawName = String((u as { unit?: unknown }).unit ?? "");
    const family: TeakUnitFamily | undefined =
      rawName in FAMILY_WIDTH_RANGE
        ? (rawName as TeakUnitFamily)
        : FAMILY_ALIASES[rawName];
    if (!family) continue;
    const wallId =
      typeof (u as PlanUnit).wallId === "string" ? (u as PlanUnit).wallId : undefined;
    const offsetCm = Number((u as PlanUnit).offsetCm);
    let widthCm: number | undefined = Number((u as PlanUnit).widthCm);
    if (Number.isFinite(widthCm)) {
      const [lo, hi] = FAMILY_WIDTH_RANGE[family];
      widthCm = Math.min(hi, Math.max(lo, widthCm as number));
    } else widthCm = undefined;
    valid.push({
      unit: family,
      wallId,
      offsetCm: Number.isFinite(offsetCm) ? offsetCm : undefined,
      widthCm,
    });
  }
  if (valid.length === 0) return null;
  const notes = (raw as KitchenDesignPlan).designNotes;
  return {
    units: valid.slice(0, 28),
    island: (raw as KitchenDesignPlan).island === true,
    designNotes: typeof notes === "string" ? notes.slice(0, 500) : undefined,
  };
}

/* ── Room summary (what the intelligent designer receives) ── */

export interface AiRoomSummary {
  layout: KitchenLayout;
  ceilingCm: number;
  walls: { id: string; lengthCm: number }[];
  openings: {
    wallId: string;
    type: "door" | "window";
    widthCm: number;
    fromWallStartCm: number;
    swing?: string;
  }[];
  utilities: { kind: string; wallId?: string; fromWallStartCm?: number }[];
  prefs: { styleAr: string; island: "yes" | "no" | "auto" };
}

export function buildRoomSummary(
  layout: KitchenLayout,
  walls: KitchenWall[],
  ceilingHeight: number,
  openings: KitchenOpening[],
  utilities: KitchenUtility[],
  styleAr: string,
  island: "yes" | "no" | "auto"
): AiRoomSummary {
  return {
    layout,
    ceilingCm: Math.round(ceilingHeight),
    walls: walls.map((w) => ({ id: w.id, lengthCm: Math.round(w.length) })),
    openings: openings.map((o) => ({
      wallId: o.wallId,
      type: o.type,
      widthCm: Math.round(o.width),
      fromWallStartCm: Math.round(o.distanceFromWallStart),
      swing: o.type === "door" ? (o.swing ?? "in") : undefined,
    })),
    utilities: utilities.map((u) => ({
      kind: u.kind,
      wallId: u.wallId,
      fromWallStartCm:
        u.positionAlongWall != null ? Math.round(u.positionAlongWall) : undefined,
    })),
    prefs: { styleAr, island },
  };
}

/* ── Adapter: semantic family → currently renderable def ──
 * Temporary bridge until the Teak parametric cabinet model renders
 * directly. Replaceable without touching the design contract. */

type Kind = NonNullable<CabinetDef["adeko"]>["kind"];
const kindOf = (d: CabinetDef): Kind | undefined => d.adeko?.kind ?? d.parametricKind;

const isBaseDoors = (d: CabinetDef) => {
  const k = kindOf(d);
  return !!k && k.place === "base" && !d.corner && !k.filler && !k.open && k.doors > 0 && k.drawers === 0 && !k.feature;
};
const isDrawers = (d: CabinetDef) => {
  const k = kindOf(d);
  return !!k && k.place === "base" && !d.corner && k.drawers >= 2 && !k.feature;
};
const isUpper = (d: CabinetDef) => {
  const k = kindOf(d);
  return !!k && k.place === "wall" && !d.corner && !k.filler && !k.open && !k.glass;
};
const isCorner = (d: CabinetDef) =>
  !!d.corner && d.level === "base" && /^corner/i.test(d.nameEn);
const isTallPlain = (d: CabinetDef) => {
  const k = kindOf(d);
  return !!k && k.place === "tall" && !d.corner && !k.feature && k.doors > 0;
};
const isFiller = (d: CabinetDef) => {
  const k = kindOf(d);
  return !!k && !!k.filler;
};

/** Closest-width def matching a predicate. */
function pickWidth(
  defs: CabinetDef[],
  wantM: number,
  pred: (d: CabinetDef) => boolean
): CabinetDef | undefined {
  let best: CabinetDef | undefined;
  let bestDiff = Infinity;
  for (const d of defs) {
    if (!pred(d)) continue;
    const diff = Math.abs(d.width - wantM);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = d;
    }
  }
  return best;
}

function defForUnit(
  u: PlanUnit,
  defs: CabinetDef[],
  totalWallM: number
): CabinetDef | undefined {
  const wantM = u.widthCm ? u.widthCm * CM : 0.6;
  switch (u.unit) {
    case "sinkBase":
      return defs.find(
        (d) => d.id === (wantM >= 0.95 || totalWallM >= 6 ? "adeko-x-sink2-100" : "adeko-x-sink1-80")
      );
    case "cooktopBase":
      return defs.find(
        (d) => d.id === (wantM >= 0.8 || totalWallM >= 7 ? "adeko-x-cooktop-90" : "adeko-x-cooktop-60")
      );
    case "ovenTower":
      return defs.find((d) => d.id === "adeko-x-tower-60");
    case "tallPantry":
      return (
        pickWidth(defs, wantM || 0.6, (d) => isTallPlain(d) && !/fridge|refriger/i.test(d.nameEn)) ??
        defs.find((d) => d.id === "adeko-x-pantry-60")
      );
    case "fridgeHousing":
      return (
        defs.find((d) => d.id === "adeko-x-fridge-70") ??
        pickWidth(defs, wantM || 0.7, isTallPlain)
      );
    case "cornerUnit":
      return pickWidth(defs, 0.9, isCorner);
    case "drawerBase":
      return pickWidth(defs, wantM || 0.6, isDrawers);
    case "wallCabinet":
      return pickWidth(defs, wantM || 0.8, isUpper);
    case "filler":
      return pickWidth(defs, wantM || 0.1, isFiller);
    case "baseCabinet":
    default:
      return pickWidth(defs, wantM || 0.8, isBaseDoors);
  }
}

/* ── Engineering guard: KitchenDesignPlan → legal PlacedCabinetState[] ── */

/**
 * Deterministically compile a semantic plan into legal placed cabinets.
 * Guard behavior (design-preserving):
 *  1. try the designer's exact wall + offset (snapped to nearest legal offset);
 *  2. else first legal slot anywhere (unit survives, position corrected);
 *  3. else drop only that unit.
 * Returns [] when nothing could be placed at all (caller invokes the
 * deterministic fallback planner).
 */
export function compileAiPlan(
  plan: KitchenDesignPlan,
  segments: WallSegment[],
  openings: KitchenOpening[],
  adekoDefs: CabinetDef[],
  template: KitchenTemplate
): PlacedCabinetState[] {
  const defs = [
    ...adekoDefs,
    ...EXTRA_CABINET_DEFS.filter((x) => !adekoDefs.some((d) => d.id === x.id)),
  ];
  // Collision checks resolve defs by id — make sure every def is known.
  defs.forEach(registerAdekoDef);

  const totalWallM = segments.reduce((s, seg) => s + seg.length, 0) / 100;
  const placed: PlacedCabinet[] = [];
  const out: PlacedCabinetState[] = [];
  let n = 0;

  // Corner units claim junctions first; tall units next (they anchor runs);
  // then base run; wall cabinets last (they follow the base rhythm).
  const rank = (u: PlanUnit) =>
    u.unit === "cornerUnit" ? 0
    : u.unit === "ovenTower" || u.unit === "tallPantry" || u.unit === "fridgeHousing" ? 1
    : u.unit === "wallCabinet" ? 3
    : 2;
  const ordered = [...plan.units].sort((a, b) => rank(a) - rank(b));

  for (const u of ordered) {
    const def = defForUnit(u, defs, totalWallM);
    if (!def) continue;

    let slot: { wallId: string; offset: number } | null = null;
    if (def.corner) {
      slot = findCornerSlot(def, placed, segments, openings);
    } else {
      const seg = u.wallId ? segments.find((s) => s.id === u.wallId) : undefined;
      if (seg) {
        const len = seg.length * CM;
        if (def.width <= len + 1e-6) {
          const intervals = blockedIntervals(seg.id, verticalSpan(def), placed, segments, openings);
          const desired = (u.offsetCm ?? 0) * CM;
          const off = resolveDragOffset(len, intervals, desired, def.width);
          // resolveDragOffset can only be trusted when the resolved span is
          // actually inside the wall and clear of every blocked interval.
          if (
            off !== null &&
            off >= -1e-6 &&
            off + def.width <= len + 1e-6 &&
            !intervals.some((iv) => off < iv.b - 1e-6 && iv.a < off + def.width - 1e-6)
          ) {
            slot = { wallId: seg.id, offset: off };
          }
        }
      }
      if (!slot) slot = findSlotForCabinet(def, placed, segments, openings);
    }
    if (!slot) continue;

    // Final safety: the chosen wall must actually contain the unit.
    const wallSeg = segments.find((s) => s.id === slot!.wallId);
    if (!wallSeg || def.width > wallSeg.length * CM + 1e-6) continue;

    n += 1;
    const p: PlacedCabinetState = {
      id: `cab-ai-${Date.now().toString(36)}-${n}`,
      catalogId: def.id,
      wallId: slot.wallId,
      offset: slot.offset,
      doorPattern: template.doorPattern,
      finishColor: template.doorColorHex,
      topFinishId: template.topFinishId,
      handleColor: template.handleColor,
      handleStyle: "bar",
    };
    out.push(p);
    placed.push({ id: p.id, catalogId: def.id, wallId: slot.wallId, offset: slot.offset });
  }

  return out;
}

/* ── Deterministic utility-aware fallback planner ──
 * Used only when the intelligent service is completely unavailable.
 * Produces a sensible semantic plan from the room data itself — sink near
 * the water point, cooktop near gas and away from the sink, corner unit on
 * multi-wall layouts, tall units at run ends, drawers near the cooktop,
 * wall cabinets over the base run. NOT a fixed template. */

export function buildFallbackPlan(
  segments: WallSegment[],
  openings: KitchenOpening[],
  utilities: KitchenUtility[],
  island: "yes" | "no" | "auto"
): KitchenDesignPlan {
  const units: PlanUnit[] = [];
  const byLen = [...segments].sort((a, b) => b.length - a.length);
  const longest = byLen[0];
  if (!longest) return { units: [], island: false };

  const findUtil = (kinds: string[]) =>
    utilities.find((u) => kinds.includes(u.kind) && u.wallId);

  // Corner unit when two or more walls meet.
  if (segments.length >= 2) units.push({ unit: "cornerUnit" });

  // Sink at the water/drain point (or centered on the longest wall).
  const water = findUtil(["water", "drain"]);
  units.push({
    unit: "sinkBase",
    wallId: water?.wallId ?? longest.id,
    offsetCm: water?.positionAlongWall != null
      ? Math.max(0, Math.round(water.positionAlongWall - 40))
      : Math.round(longest.length / 2 - 40),
    widthCm: 80,
  });

  // Cooktop at the gas point, ≥60cm from the sink.
  const gas = findUtil(["gas", "electricity", "electric"]);
  const cookWall = gas?.wallId ?? (byLen[1] ?? longest).id;
  let cookOff = gas?.positionAlongWall != null
    ? Math.max(0, Math.round(gas.positionAlongWall - 30))
    : 60;
  if (cookWall === (water?.wallId ?? longest.id)) {
    const sinkOff = units[units.length - 1].offsetCm ?? 0;
    if (Math.abs(cookOff - sinkOff) < 140) cookOff = sinkOff + 140;
  }
  units.push({ unit: "cooktopBase", wallId: cookWall, offsetCm: cookOff, widthCm: 60 });

  const totalCm = segments.reduce((s, x) => s + x.length, 0);

  // Tall zone on generous rooms: oven tower + fridge housing at a run end.
  if (totalCm >= 550) {
    units.push({ unit: "ovenTower", wallId: byLen[1]?.id ?? longest.id, offsetCm: 0 });
    units.push({ unit: "fridgeHousing", wallId: byLen[1]?.id ?? longest.id });
  } else if (totalCm >= 400) {
    units.push({ unit: "fridgeHousing", wallId: byLen[1]?.id ?? longest.id });
  }

  // Drawers near the cooktop, then fill with base + wall cabinets.
  units.push({ unit: "drawerBase", wallId: cookWall, offsetCm: cookOff + 70, widthCm: 60 });
  units.push({ unit: "baseCabinet", wallId: longest.id, widthCm: 80 });
  if (totalCm >= 350) units.push({ unit: "baseCabinet", wallId: byLen[1]?.id ?? longest.id, widthCm: 60 });
  units.push({ unit: "wallCabinet", wallId: longest.id, widthCm: 80 });
  units.push({ unit: "wallCabinet", wallId: cookWall, widthCm: 60 });
  if (totalCm >= 450) units.push({ unit: "wallCabinet", wallId: longest.id, widthCm: 60 });

  return {
    units,
    island: island === "yes" ? true : island === "no" ? false : totalCm >= 700,
    designNotes: "fallback: deterministic utility-aware plan",
  };
}
