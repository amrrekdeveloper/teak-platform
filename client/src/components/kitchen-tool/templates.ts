/**
 * Ready-made kitchen templates — shown when the customer enters the studio
 * with an empty design. Each template adapts to the room layout and wall
 * lengths: cabinets are placed through the same collision engine as manual
 * placement, so a template can never produce an illegal design.
 */
import type { WallSegment } from "@/components/kitchen-tool/plan-svg";
import type {
  KitchenOpening,
  KitchenUtility,
  PlacedCabinetState,
} from "@/components/kitchen-tool/store";
import {
  findSlotForCabinet,
  findCornerSlot,
  blockedIntervals,
  verticalSpan,
  EXTRA_CABINET_DEFS,
  type CabinetDef,
  type PlacedCabinet,
} from "@/components/kitchen-tool/cabinets";

const CM = 0.01;

/** Wall-anchored utility target (meters along a wall). */
interface UtilityTarget {
  wallId: string;
  posM: number;
}

/** First wall-mounted utility of any of the given kinds. */
function utilityTarget(
  utilities: KitchenUtility[],
  kinds: KitchenUtility["kind"][]
): UtilityTarget | null {
  for (const kind of kinds) {
    const u = utilities.find((x) => x.kind === kind && x.wallId != null);
    if (u) return { wallId: u.wallId!, posM: (u.positionAlongWall ?? 0) * CM };
  }
  return null;
}

/**
 * Legal slot closest to a wall-anchored utility (e.g. sink over the water
 * feed, cooktop by the gas point). Scans the free gaps of the target wall
 * and centers the cabinet on the utility when possible; falls back to the
 * generic first-fit scan when the target wall has no room.
 */
function findSlotNear(
  def: CabinetDef,
  placed: PlacedCabinet[],
  segments: WallSegment[],
  openings: KitchenOpening[],
  target: UtilityTarget | null
): { wallId: string; offset: number } | null {
  if (target) {
    const seg = segments.find((s) => s.id === target.wallId);
    if (seg) {
      const len = seg.length * CM;
      const intervals = blockedIntervals(
        seg.id,
        verticalSpan(def),
        placed,
        segments,
        openings
      );
      // Build free gaps [a,b) from the sorted blocked intervals.
      const sorted = [...intervals].sort((p, q) => p.a - q.a);
      let cursor = 0;
      let best: number | null = null;
      let bestDist = Infinity;
      const gaps: Array<{ a: number; b: number }> = [];
      for (const iv of sorted) {
        if (iv.a > cursor) gaps.push({ a: cursor, b: iv.a });
        cursor = Math.max(cursor, iv.b);
      }
      if (cursor < len) gaps.push({ a: cursor, b: len });
      for (const g of gaps) {
        if (g.b - g.a < def.width - 1e-6) continue;
        // Desired: cabinet centered on the utility, clamped into the gap.
        const desired = target.posM - def.width / 2;
        const off = Math.min(Math.max(desired, g.a), g.b - def.width);
        const dist = Math.abs(off + def.width / 2 - target.posM);
        if (dist < bestDist) {
          bestDist = dist;
          best = off;
        }
      }
      if (best !== null) return { wallId: seg.id, offset: best };
    }
  }
  return findSlotForCabinet(def, placed, segments, openings);
}

export interface KitchenTemplate {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  /** Door surface pattern for the whole kitchen. */
  doorPattern: "wood" | "solid";
  /** Door/front color (hex, from ADEKO_DOOR_COLORS). */
  doorColorHex: string;
  /** Countertop finish id (ADEKO_TOP_FINISHES). */
  topFinishId: string;
  handleColor: "black" | "white" | "gray";
  /** UI swatches: door color + top color. */
  swatches: [string, string];
}

export const KITCHEN_TEMPLATES: KitchenTemplate[] = [
  {
    id: "warm-oak",
    nameAr: "دفء البلوط",
    nameEn: "Warm Oak",
    descriptionAr: "أبواب بملمس خشبي فاتح مع رخام أبيض — إحساس دافئ وطبيعي",
    descriptionEn: "Light wood-grain doors with white marble — warm and natural",
    doorPattern: "wood",
    doorColorHex: "#e5c496",
    topFinishId: "marble-white",
    handleColor: "black",
    swatches: ["#e5c496", "#e9e7e2"],
  },
  {
    id: "modern-white",
    nameAr: "أبيض عصري",
    nameEn: "Modern White",
    descriptionAr: "أبواب سادة بيضاء مع جرانيت غامق — نظيف وعصري",
    descriptionEn: "Solid white doors with dark granite — clean and modern",
    doorPattern: "solid",
    doorColorHex: "#f7f6f2",
    topFinishId: "granite-dark",
    handleColor: "gray",
    swatches: ["#f7f6f2", "#3a3a3c"],
  },
  {
    id: "graphite",
    nameAr: "جرافيت أنيق",
    nameEn: "Elegant Graphite",
    descriptionAr: "أبواب سادة جرافيت مع سطح حجر رمادي — جريء وفخم",
    descriptionEn: "Solid graphite doors with grey stone top — bold and premium",
    doorPattern: "solid",
    doorColorHex: "#585a5c",
    topFinishId: "grey-stone",
    handleColor: "black",
    swatches: ["#585a5c", "#9a9b9d"],
  },
  {
    id: "sage-walnut",
    nameAr: "زيتي هادئ",
    nameEn: "Calm Sage",
    descriptionAr: "أبواب زيتية سادة مع سطح خشب بلوط — هادئ ومريح",
    descriptionEn: "Sage solid doors with oak wood top — calm and cozy",
    doorPattern: "solid",
    doorColorHex: "#a8b096",
    topFinishId: "oak-wood",
    handleColor: "black",
    swatches: ["#a8b096", "#b78a5a"],
  },
];

/** Closest-width def matching a predicate (undefined when none matches). */
function pick(
  defs: CabinetDef[],
  wantWidth: number,
  pred: (d: CabinetDef) => boolean
): CabinetDef | undefined {
  let best: CabinetDef | undefined;
  for (const d of defs) {
    if (!pred(d)) continue;
    if (!best || Math.abs(d.width - wantWidth) < Math.abs(best.width - wantWidth)) best = d;
  }
  return best;
}

const kindOf = (d: CabinetDef) => d.adeko?.kind ?? d.parametricKind;

/**
 * Build a full kitchen for a template: corner unit (L/U), sink, cooktop+oven,
 * appliance tower, drawers, door bases, then upper cabinets — each through
 * the collision engine, skipping whatever doesn't fit the entered room.
 */
export function buildTemplateCabinets(
  template: KitchenTemplate,
  segments: WallSegment[],
  openings: KitchenOpening[],
  adekoDefs: CabinetDef[],
  utilities: KitchenUtility[] = []
): PlacedCabinetState[] {
  const defs = [...adekoDefs, ...EXTRA_CABINET_DEFS.filter(
    (x) => !adekoDefs.some((d) => d.id === x.id)
  )];
  const placed: PlacedCabinet[] = [];
  const out: PlacedCabinetState[] = [];
  let n = 0;

  const totalWallM = segments.reduce((s, seg) => s + seg.length, 0) / 100;

  const add = (def: CabinetDef | undefined, near?: UtilityTarget | null) => {
    if (!def) return false;
    const slot = def.corner
      ? findCornerSlot(def, placed, segments, openings)
      : near !== undefined
        ? findSlotNear(def, placed, segments, openings, near)
        : findSlotForCabinet(def, placed, segments, openings);
    if (!slot) return false;
    n += 1;
    const p: PlacedCabinetState = {
      id: `cab-tpl-${Date.now().toString(36)}-${n}`,
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
    return true;
  };

  const isBaseDoors = (d: CabinetDef) => {
    const k = kindOf(d);
    return (
      !!k && k.place === "base" && !d.corner && !k.filler && !k.open &&
      k.doors > 0 && k.drawers === 0 && !k.feature
    );
  };
  const isDrawers = (d: CabinetDef) => {
    const k = kindOf(d);
    return !!k && k.place === "base" && !d.corner && k.drawers >= 2 && !k.feature;
  };
  const isUpper = (d: CabinetDef) => {
    const k = kindOf(d);
    return !!k && k.place === "wall" && !d.corner && !k.filler && !k.open && !k.glass;
  };

  // Corner first (L/U rooms) so it claims the junction.
  if (segments.length >= 2) {
    add(pick(defs, 0.9, (d) => !!d.corner && d.level === "base" && /^corner/i.test(d.nameEn)));
  }

  // Functional wall: sink (double when roomy), cooktop with built-in oven.
  // When the customer marked real utility points, the sink snaps to the
  // water/drain feed and the cooktop to the gas point.
  add(
    defs.find((d) => d.id === (totalWallM >= 6 ? "adeko-x-sink2-100" : "adeko-x-sink1-80")),
    utilityTarget(utilities, ["water", "drain"])
  );
  add(
    defs.find((d) => d.id === (totalWallM >= 7 ? "adeko-x-cooktop-90" : "adeko-x-cooktop-60")),
    utilityTarget(utilities, ["gas"])
  );

  // Appliance tower for bigger kitchens.
  if (totalWallM >= 5.5) add(defs.find((d) => d.id === "adeko-x-tower-60"));

  // Storage: one drawer stack, then door bases until walls are ~full.
  add(pick(defs, 0.6, isDrawers));
  for (let i = 0; i < 8; i++) {
    if (!add(pick(defs, i === 0 ? 0.8 : 0.6, isBaseDoors))) break;
  }

  // Uppers: fill with wall units.
  for (let i = 0; i < 8; i++) {
    if (!add(pick(defs, i === 0 ? 0.8 : 0.6, isUpper))) break;
  }

  return out;
}
