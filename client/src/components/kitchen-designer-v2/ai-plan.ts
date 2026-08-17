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
  PlacedDecorState,
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
  | "dishwasherBase"
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
  dishwasherBase: [45, 60],
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
  dishwasher: "dishwasherBase",
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

export interface PlanLighting {
  /** Under-cabinet LED strips under the wall run. */
  underCabinetLed?: boolean;
  /** Warm vs cool recessed downlight temperature. */
  temp?: "warm" | "cool";
}

export interface KitchenDesignPlan {
  units: PlanUnit[];
  /** Designer's island judgement — honored only when the deterministic fit test agrees. */
  island?: boolean;
  /** Designer's lighting intent — applied to the studio scene state. */
  lighting?: PlanLighting;
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
  const rawLighting = (raw as KitchenDesignPlan).lighting;
  const lighting: PlanLighting | undefined =
    rawLighting && typeof rawLighting === "object"
      ? {
          underCabinetLed: rawLighting.underCabinetLed !== false,
          temp: rawLighting.temp === "cool" ? "cool" : "warm",
        }
      : undefined;
  return {
    units: valid.slice(0, 28),
    island: (raw as KitchenDesignPlan).island === true,
    lighting,
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
    /** Windows: sill height + window height (cm) so the designer can judge
        whether wall cabinets conflict with the glass. */
    sillCm?: number;
    heightCm?: number;
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
      sillCm: o.type === "window" && o.sillHeight != null ? Math.round(o.sillHeight) : undefined,
      heightCm: o.type === "window" && o.height != null ? Math.round(o.height) : undefined,
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
    case "dishwasherBase":
      return defs.find((d) => d.id === "adeko-x-dishwasher-60");
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

/* ── Utility-aware plan normalization (deterministic guard, part 1) ──
 * Runs BEFORE geometric compilation. Enforces functional correctness that
 * the model cannot be trusted with:
 *  - exactly one sinkBase (extras demoted to baseCabinet; inserted if missing);
 *  - sink pinned to the water/drain point when the room declares one;
 *  - exactly one cooktopBase (same dedupe/insert), pinned to the gas point
 *    when declared, and kept >= 60cm of worktop away from the sink;
 *  - at most one ovenTower and one fridgeHousing. */

const SINK_UTILS = ["water", "drain"];
const COOK_UTILS = ["gas", "electricity", "electric", "outlet"];
/** Narrow physical service envelope (cm): flexible supply hoses / drain
 * extensions / gas hoses realistically span ~60cm from the rough-in. */
const UTILITY_TOLERANCE_CM = 60;
const MIN_SINK_COOKTOP_GAP_CM = 60;

/** Combined service constraint for one functional unit.
 *
 * mode "all": the unit must satisfy EVERY declared point (water + drain
 * rough-ins, gas). All points must share one wall — cross-wall required
 * services make the design infeasible rather than silently dropping one.
 * Floor drains (no wallId, x/y position) are deliberately excluded: a
 * floor drain connects via flexible under-cabinet piping and does not
 * constrain the sink's lateral position.
 *
 * mode "any": the unit must be near AT LEAST ONE of the points — used for
 * electrical outlets powering an electric cooktop (any outlet can serve). */
export interface ServicePin {
  mode: "all" | "any";
  /** mode "all": the single service wall. */
  wallId: string;
  /** mode "all": point positions (cm from wall start) on that wall. */
  points: number[];
  /** mode "any": candidate service points across walls. */
  options: { wallId: string; posCm: number }[];
  /** Preferred center position (cm) on `wallId`. */
  targetCenterCm: number;
  /** False when required points cannot be served by one unit. */
  feasible: boolean;
}

function allPointsPin(
  kinds: string[],
  segments: WallSegment[],
  utilities: KitchenUtility[]
): ServicePin | null {
  const utils = utilities.filter(
    (x) => kinds.includes(x.kind) && x.wallId && segments.some((s) => s.id === x.wallId)
  );
  if (utils.length === 0) return null;
  const wallIds = Array.from(new Set(utils.map((x) => x.wallId!)));
  const wallId = wallIds[0];
  const seg = segments.find((s) => s.id === wallId)!;
  const points = utils
    .filter((x) => x.wallId === wallId)
    .map((x) => x.positionAlongWall ?? seg.length / 2);
  const min = Math.min(...points);
  const max = Math.max(...points);
  return {
    mode: "all",
    wallId,
    points,
    options: [],
    targetCenterCm: (min + max) / 2,
    // Cross-wall required services (e.g. water on A, drain on B) cannot be
    // served by a single unit → infeasible, never silently ignored.
    feasible: wallIds.length === 1 && max - min <= 2 * UTILITY_TOLERANCE_CM,
  };
}

export function servicePinFor(
  kinds: string[],
  segments: WallSegment[],
  utilities: KitchenUtility[]
): ServicePin | null {
  if (kinds === COOK_UTILS || kinds.some((k) => COOK_UTILS.includes(k))) {
    // Cooktop: gas rough-ins are hard "all" constraints. Without gas, an
    // electric cooktop may use ANY declared outlet.
    const gas = allPointsPin(["gas"], segments, utilities);
    if (gas) return gas;
    const outletKinds = ["outlet", "electricity", "electric"];
    const outlets = utilities.filter(
      (x) => outletKinds.includes(x.kind as string) &&
        x.wallId && segments.some((s) => s.id === x.wallId)
    );
    if (outlets.length === 0) return null;
    const options = outlets.map((x) => {
      const seg = segments.find((s) => s.id === x.wallId)!;
      return { wallId: x.wallId!, posCm: x.positionAlongWall ?? seg.length / 2 };
    });
    return {
      mode: "any",
      wallId: options[0].wallId,
      points: [options[0].posCm],
      options,
      targetCenterCm: options[0].posCm,
      feasible: true,
    };
  }
  return allPointsPin(kinds, segments, utilities);
}

/** True when a unit center (on wall `wallId`) satisfies the pin. */
function centerSatisfiesPin(centerCm: number, pin: ServicePin, wallId?: string): boolean {
  if (pin.mode === "any") {
    return pin.options.some(
      (o) => (wallId === undefined || o.wallId === wallId) &&
        Math.abs(centerCm - o.posCm) <= UTILITY_TOLERANCE_CM
    );
  }
  if (wallId !== undefined && wallId !== pin.wallId) return false;
  return pin.points.every((p) => Math.abs(centerCm - p) <= UTILITY_TOLERANCE_CM);
}

export function normalizePlan(
  plan: KitchenDesignPlan,
  segments: WallSegment[],
  utilities: KitchenUtility[]
): KitchenDesignPlan {
  const units: PlanUnit[] = [];
  let sink: PlanUnit | null = null;
  let cook: PlanUnit | null = null;
  let towers = 0;
  let fridges = 0;
  for (const u of plan.units) {
    if (u.unit === "sinkBase") {
      if (sink) units.push({ ...u, unit: "baseCabinet" });
      else { sink = { ...u }; units.push(sink); }
    } else if (u.unit === "cooktopBase") {
      if (cook) units.push({ ...u, unit: "baseCabinet" });
      else { cook = { ...u }; units.push(cook); }
    } else if (u.unit === "ovenTower") {
      if (++towers <= 1) units.push(u);
    } else if (u.unit === "fridgeHousing") {
      if (++fridges <= 1) units.push(u);
    } else units.push(u);
  }
  if (!sink) { sink = { unit: "sinkBase", widthCm: 80 }; units.unshift(sink); }
  if (!cook) { cook = { unit: "cooktopBase", widthCm: 60 }; units.push(cook); }

  // Complete-kitchen rule: roomy kitchens always get a dishwasher, even
  // when the model omitted it (adjacency to the sink enforced below and
  // again at compile time).
  const totalWallCm = segments.reduce((s, x) => s + x.length, 0);
  if (totalWallCm >= 450 && !units.some((u) => u.unit === "dishwasherBase")) {
    units.push({ unit: "dishwasherBase", widthCm: 60 });
  }

  const pin = (unit: PlanUnit, kinds: string[], halfWidthCm: number) => {
    const sp = servicePinFor(kinds, segments, utilities);
    if (!sp) return;
    const ok =
      unit.wallId != null &&
      unit.offsetCm != null &&
      centerSatisfiesPin(unit.offsetCm + halfWidthCm, sp, unit.wallId);
    if (ok) return;
    if (sp.mode === "any") {
      // Any outlet can serve — keep the option nearest the designer's
      // requested position when one was given.
      const want = unit.offsetCm != null ? unit.offsetCm + halfWidthCm : null;
      const best = [...sp.options].sort((a, b) => {
        if (want == null) return 0;
        const da = (a.wallId === unit.wallId ? 0 : 10_000) + Math.abs(a.posCm - want);
        const db = (b.wallId === unit.wallId ? 0 : 10_000) + Math.abs(b.posCm - want);
        return da - db;
      })[0];
      unit.wallId = best.wallId;
      unit.offsetCm = Math.max(0, Math.round(best.posCm - halfWidthCm));
    } else {
      unit.wallId = sp.wallId;
      unit.offsetCm = Math.max(0, Math.round(sp.targetCenterCm - halfWidthCm));
    }
  };
  pin(sink, SINK_UTILS, (sink.widthCm ?? 80) / 2);
  pin(cook, COOK_UTILS, (cook.widthCm ?? 60) / 2);

  // Dishwasher relationship: a dishwasher must sit adjacent to the sink
  // (shared plumbing). Deterministic rule, not model-dependent.
  const dish = units.find((u) => u.unit === "dishwasherBase");
  if (dish && sink.wallId && sink.offsetCm != null) {
    const sinkW = sink.widthCm ?? 80;
    const dishW = dish.widthCm ?? 60;
    const seg = segments.find((s) => s.id === sink!.wallId);
    const wallLen = seg?.length ?? 0;
    const after = sink.offsetCm + sinkW;
    dish.wallId = sink.wallId;
    dish.offsetCm = after + dishW <= wallLen ? after : Math.max(0, sink.offsetCm - dishW);
  }

  // Worktop gap between sink and cooktop on the same wall.
  // Conscious precedence rule: service-point fidelity outranks the
  // ergonomic gap. A gas-pinned cooktop may only shift within the flexible
  // service tolerance around the gas point; an unpinned cooktop may move
  // freely (even to another wall).
  const cookPin = servicePinFor(COOK_UTILS, segments, utilities);
  const cookPinned = cookPin != null;
  if (
    sink.wallId && sink.wallId === cook.wallId &&
    sink.offsetCm != null && cook.offsetCm != null
  ) {
    const sinkW = sink.widthCm ?? 80;
    const cookW = cook.widthCm ?? 60;
    const gap = cook.offsetCm >= sink.offsetCm
      ? cook.offsetCm - (sink.offsetCm + sinkW)
      : sink.offsetCm - (cook.offsetCm + cookW);
    if (gap < MIN_SINK_COOKTOP_GAP_CM) {
      const seg = segments.find((s) => s.id === cook!.wallId);
      const wallLen = seg?.length ?? 0;
      const after = sink.offsetCm + sinkW + MIN_SINK_COOKTOP_GAP_CM;
      const before = sink.offsetCm - MIN_SINK_COOKTOP_GAP_CM - cookW;
      if (cookPinned && cookPin) {
        const within = (off: number) =>
          off >= 0 && off + cookW <= wallLen &&
          centerSatisfiesPin(off + cookW / 2, cookPin, cook!.wallId);
        if (within(after)) cook.offsetCm = after;
        else if (within(before)) cook.offsetCm = before;
        // else: keep the service position — fidelity to the gas point wins
        // over the ergonomic gap (documented precedence rule).
      } else {
        if (after + cookW <= wallLen) cook.offsetCm = after;
        else if (before >= 0) cook.offsetCm = before;
        else {
          const other = segments.find((s) => s.id !== sink!.wallId && s.length >= cookW);
          if (other) { cook.wallId = other.id; cook.offsetCm = Math.round(other.length / 2 - cookW / 2); }
        }
      }
    }
  }

  return { ...plan, units };
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
  rawPlan: KitchenDesignPlan,
  segments: WallSegment[],
  openings: KitchenOpening[],
  adekoDefs: CabinetDef[],
  template: KitchenTemplate,
  utilities: KitchenUtility[] = []
): PlacedCabinetState[] {
  // Deterministic functional guard first: unique sink/cooktop, pinned to
  // declared water/gas points, worktop gap enforced — regardless of what
  // the model returned.
  const plan = normalizePlan(rawPlan, segments, utilities);

  // Service pins are HARD constraints: a pinned sink/cooktop may only be
  // placed on its service wall within UTILITY_TOLERANCE_CM of the point.
  // If no legal position exists there, the whole design is infeasible ([]).
  const pinFor = (family: TeakUnitFamily) => {
    const kinds = family === "sinkBase" ? SINK_UTILS : family === "cooktopBase" ? COOK_UTILS : null;
    if (!kinds) return null;
    return servicePinFor(kinds, segments, utilities);
  };
  // Multi-point services (water + drain) must be jointly reachable by one
  // unit; otherwise the room's declared services are contradictory.
  for (const fam of ["sinkBase", "cooktopBase"] as const) {
    const p = pinFor(fam);
    if (p && !p.feasible) {
      console.warn(`compile: ${fam} service points too far apart — design infeasible`);
      return [];
    }
  }
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

  // Placement priority guarantees the functional core is never crowded
  // out: corners claim junctions, then sink → cooktop → dishwasher (the
  // mandatory work core), then tall units, base run, wall cabinets.
  const rank = (u: PlanUnit) =>
    u.unit === "cornerUnit" ? 0
    : u.unit === "sinkBase" ? 1
    : u.unit === "cooktopBase" ? 2
    : u.unit === "dishwasherBase" ? 3
    : u.unit === "ovenTower" || u.unit === "tallPantry" || u.unit === "fridgeHousing" ? 4
    : u.unit === "wallCabinet" ? 6
    : 5;
  const ordered = [...plan.units].sort((a, b) => rank(a) - rank(b));

  for (const u of ordered) {
    const def = defForUnit(u, defs, totalWallM);
    if (!def) continue;

    const pin = pinFor(u.unit);

    let slot: { wallId: string; offset: number } | null = null;
    if (u.unit === "dishwasherBase") {
      // Dishwasher ONLY ships adjacent to the sink (shared plumbing). Try
      // both sides of the placed sink; when neither is legal the unit is
      // deliberately omitted (reported), never relocated elsewhere.
      const sinkCab = out.find((c) => /sink/.test(c.catalogId));
      const sinkDef = sinkCab ? defs.find((d) => d.id === sinkCab.catalogId) : undefined;
      if (sinkCab && sinkDef) {
        const seg = segments.find((s) => s.id === sinkCab.wallId)!;
        const len = seg.length * CM;
        const intervals = blockedIntervals(seg.id, verticalSpan(def), placed, segments, openings);
        for (const off of [sinkCab.offset + sinkDef.width, sinkCab.offset - def.width]) {
          if (
            off >= -1e-6 &&
            off + def.width <= len + 1e-6 &&
            !intervals.some((iv) => off < iv.b - 1e-6 && iv.a < off + def.width - 1e-6)
          ) {
            slot = { wallId: seg.id, offset: off };
            break;
          }
        }
      }
      if (!slot) {
        console.warn("compile: no legal slot adjacent to the sink — dishwasher omitted");
        continue;
      }
    } else if (def.corner) {
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
            // Pinned unit: the legal offset must keep the unit's center
            // within the service tolerance, on the service wall.
            if (pin) {
              const centerCm = (off + def.width / 2) / CM;
              if (centerSatisfiesPin(centerCm, pin, seg.id)) {
                slot = { wallId: seg.id, offset: off };
              }
            } else {
              slot = { wallId: seg.id, offset: off };
            }
          }
        }
      }
      // Unpinned units may relocate anywhere legal. Pinned units may NOT:
      // losing the service link makes the whole design infeasible.
      if (!slot && !pin) slot = findSlotForCabinet(def, placed, segments, openings);
    }
    if (!slot && pin) {
      console.warn(`compile: ${u.unit} cannot reach its service point — design infeasible`);
      return [];
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

  // Mandatory-core invariant: a generated kitchen without a sink or
  // without a cooktop is not a kitchen — infeasible, never a silent drop.
  if (!out.some((c) => /sink/.test(c.catalogId)) || !out.some((c) => /cooktop/.test(c.catalogId))) {
    console.warn("compile: sink or cooktop could not be placed — design infeasible");
    return [];
  }

  // Post-compilation validation: the FINAL rendered positions of pinned
  // sink/cooktop must still honor their service link. Defense in depth —
  // any violation invalidates the whole design instead of shipping a
  // kitchen whose sink is away from the water point.
  for (const fam of ["sinkBase", "cooktopBase"] as const) {
    const pin = pinFor(fam);
    if (!pin) continue;
    const featureMatch = fam === "sinkBase" ? /sink/ : /cooktop/;
    const placedUnit = out.find((c) => featureMatch.test(c.catalogId));
    if (!placedUnit) continue; // unit dropped entirely → handled by caller (length check)
    const def = defs.find((d) => d.id === placedUnit.catalogId)!;
    const centerCm = (placedUnit.offset + def.width / 2) / CM;
    if (!centerSatisfiesPin(centerCm, pin, placedUnit.wallId)) {
      console.warn(`compile: final ${fam} position lost its service link — design infeasible`);
      return [];
    }
  }

  // Dishwasher adjacency invariant (defense in depth): a shipped dishwasher
  // must touch the sink; otherwise it is removed rather than shipped remote.
  const dishIdx = out.findIndex((c) => /dishwasher/.test(c.catalogId));
  if (dishIdx >= 0) {
    const dishCab = out[dishIdx];
    const sinkCab = out.find((c) => /sink/.test(c.catalogId))!;
    const dishDef = defs.find((d) => d.id === dishCab.catalogId)!;
    const sinkDef = defs.find((d) => d.id === sinkCab.catalogId)!;
    const touching =
      dishCab.wallId === sinkCab.wallId &&
      (Math.abs(dishCab.offset - (sinkCab.offset + sinkDef.width)) <= 0.02 ||
        Math.abs(sinkCab.offset - (dishCab.offset + dishDef.width)) <= 0.02);
    if (!touching) {
      console.warn("compile: dishwasher lost sink adjacency — omitted");
      out.splice(dishIdx, 1);
    }
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
  const gas = findUtil(["gas", "electricity", "electric", "outlet"]);
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

  // Dishwasher next to the sink on roomy kitchens (adjacency enforced by
  // the guard's dishwasher relationship rule).
  if (totalCm >= 450) units.push({ unit: "dishwasherBase", widthCm: 60 });

  return {
    units,
    island: island === "yes" ? true : island === "no" ? false : totalCm >= 700,
    lighting: { underCabinetLed: true, temp: "warm" },
    designNotes: "fallback: deterministic utility-aware plan",
  };
}

/* ── Auto decor: appliances the design implies (hood over cooktop) ──
 * The generated kitchen must be complete on first render: any cooktop is
 * automatically paired with a range hood decor item centered above it. */

export function buildAutoDecor(
  cabinets: PlacedCabinetState[],
  defs: CabinetDef[]
): PlacedDecorState[] {
  const out: PlacedDecorState[] = [];
  const cook = cabinets.find((c) => /cooktop/.test(c.catalogId));
  if (cook) {
    const def = defs.find((d) => d.id === cook.catalogId);
    const cookW = def?.width ?? 0.6;
    const HOOD_W = 0.76; // decor-range-hood target width (m)
    out.push({
      id: "decor-auto-hood",
      decorId: "decor-range-hood",
      wallId: cook.wallId,
      offset: Math.max(0, cook.offset + (cookW - HOOD_W) / 2),
      mountY: 1.45,
    });
  }
  return out;
}
