/**
 * AI kitchen planner — plan schema + deterministic compiler.
 *
 * The AI proposes a *plan* (unit type, wall, position, width). It never
 * draws anything. This module compiles that plan into legal
 * `PlacedCabinetState[]` through the exact same collision engine used by
 * manual placement, so an AI plan can never produce an illegal design:
 * every unit is snapped to the nearest legal offset or dropped.
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

/* ── Plan schema (what the AI returns) ───────────────────── */

export type AiUnitType =
  | "corner"
  | "sink"
  | "cooktop"
  | "tower"
  | "drawers"
  | "base"
  | "upper";

export interface AiPlanUnit {
  /** Functional unit family — mapped to a real catalog def, never a mesh. */
  unit: AiUnitType;
  /** Target wall id (A/B/C…). Optional — first legal wall when omitted. */
  wallId?: string;
  /** Desired distance (cm) from wall start to the unit's near edge. */
  offsetCm?: number;
  /** Desired width (cm) — snapped to the closest manufacturable width. */
  widthCm?: number;
}

export interface AiPlan {
  units: AiPlanUnit[];
  /** AI's island opinion — only honored when the deterministic fit test agrees. */
  island?: boolean;
}

/** Parse + sanity check the raw AI response. Null when unusable. */
export function parseAiPlan(raw: unknown): AiPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const units = (raw as { units?: unknown }).units;
  if (!Array.isArray(units) || units.length === 0) return null;
  const valid: AiPlanUnit[] = [];
  const types: AiUnitType[] = ["corner", "sink", "cooktop", "tower", "drawers", "base", "upper"];
  for (const u of units) {
    if (!u || typeof u !== "object") continue;
    const t = (u as AiPlanUnit).unit;
    if (!types.includes(t)) continue;
    const wallId = typeof (u as AiPlanUnit).wallId === "string" ? (u as AiPlanUnit).wallId : undefined;
    const offsetCm = Number((u as AiPlanUnit).offsetCm);
    const widthCm = Number((u as AiPlanUnit).widthCm);
    valid.push({
      unit: t,
      wallId,
      offsetCm: Number.isFinite(offsetCm) ? offsetCm : undefined,
      widthCm: Number.isFinite(widthCm) ? widthCm : undefined,
    });
  }
  if (valid.length === 0) return null;
  return { units: valid.slice(0, 24), island: (raw as AiPlan).island === true };
}

/* ── Room summary (what the AI receives) ─────────────────── */

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
      fromWallStartCm: u.positionAlongWall != null ? Math.round(u.positionAlongWall) : undefined,
    })),
    prefs: { styleAr, island },
  };
}

/* ── Compiler: AiPlan → PlacedCabinetState[] ─────────────── */

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

function defForUnit(u: AiPlanUnit, defs: CabinetDef[], totalWallM: number): CabinetDef | undefined {
  const wantM = u.widthCm ? u.widthCm * CM : 0.6;
  switch (u.unit) {
    case "sink":
      return defs.find((d) => d.id === (wantM >= 0.95 || totalWallM >= 6 ? "adeko-x-sink2-100" : "adeko-x-sink1-80"));
    case "cooktop":
      return defs.find((d) => d.id === (wantM >= 0.8 || totalWallM >= 7 ? "adeko-x-cooktop-90" : "adeko-x-cooktop-60"));
    case "tower":
      return defs.find((d) => d.id === "adeko-x-tower-60");
    case "corner":
      return pickWidth(defs, 0.9, isCorner);
    case "drawers":
      return pickWidth(defs, wantM || 0.6, isDrawers);
    case "upper":
      return pickWidth(defs, wantM || 0.8, isUpper);
    case "base":
    default:
      return pickWidth(defs, wantM || 0.8, isBaseDoors);
  }
}

/**
 * Deterministically compile an AI plan into legal placed cabinets.
 * Every unit passes through the collision engine: nearest legal offset on
 * the requested wall, else first-fit anywhere, else dropped. Returns []
 * when nothing could be placed (caller falls back to smart templates).
 */
export function compileAiPlan(
  plan: AiPlan,
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

  // Corner units first so they claim junctions before straight runs.
  const ordered = [...plan.units].sort(
    (a, b) => (a.unit === "corner" ? -1 : 0) - (b.unit === "corner" ? -1 : 0)
  );

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
        const intervals = blockedIntervals(seg.id, verticalSpan(def), placed, segments, openings);
        const desired = (u.offsetCm ?? 0) * CM;
        const off = resolveDragOffset(len, intervals, desired, def.width);
        if (off !== null) slot = { wallId: seg.id, offset: off };
      }
      if (!slot) slot = findSlotForCabinet(def, placed, segments, openings);
    }
    if (!slot) continue;

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
