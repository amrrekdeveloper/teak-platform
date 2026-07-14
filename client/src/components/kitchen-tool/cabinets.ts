/**
 * Cabinet catalog + placement engine for the kitchen designer studio.
 * Pure logic — all lengths in METERS along walls unless noted.
 * Overlap is impossible by construction: every add/move goes through
 * the collision engine here.
 */
import type { WallSegment } from "@/components/kitchen-tool/plan-svg";
import type { KitchenOpening } from "@/components/kitchen-tool/store";

const ASSETS = "/kitchen-tool-assets";
const CM = 1 / 100;
/** Safety gap between a cabinet and a door opening (m). */
const DOOR_MARGIN = 0.02;
const EPS = 1e-4;

export type CabinetLevel = "base" | "upper";

export interface CabinetDef {
  id: string;
  url: string;
  nameAr: string;
  nameEn: string;
  level: CabinetLevel;
  /** Width along the wall (m). */
  width: number;
  /** Depth away from the wall (m). */
  depth: number;
  height: number;
  /** Height of the cabinet bottom above the floor (m). */
  mountY: number;
  /** Corner units live only at wall junctions and occupy both walls. */
  corner?: boolean;
  /** Extra Y-rotation fix (radians) for models with baked rotations. */
  rotYFix?: number;
  /** Real product from the Adeko catalog — rendered parametrically (no GLB). */
  adeko?: {
    productId: number;
    code: string;
    priceAfterVat: number;
    thumbnail?: string | null;
    kind: AdekoKind;
  };
}

/** How to build a parametric 3D cabinet for an Adeko catalog product. */
export interface AdekoKind {
  /** Vertical placement family. */
  place: "base" | "wall" | "tall";
  /** Number of hinged doors (0 = none). */
  doors: number;
  /** Number of full-front drawer faces (drawer stack units). */
  drawers: number;
  /** One top drawer band above the doors (e.g. A1C1K). */
  topDrawer: boolean;
  /** Doors have glass center panels. */
  glass: boolean;
  /** Open unit — no fronts, visible shelves. */
  open: boolean;
  /** Thin filler strip — plain slab, no fronts. */
  filler: boolean;
}

/** Raw product row from /api/kitchen-tool/products. */
export interface AdekoProductRow {
  id: number;
  code: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  groupCode: string;
  designW: number;
  designH: number;
  designD: number;
  priceAfterVat: number;
  thumbnail: string | null;
}

/**
 * Classify a catalog product into a renderable parametric kind, or null when
 * the product can't be rendered sensibly (panels, parametric-height rows...).
 */
export function classifyAdekoProduct(p: AdekoProductRow): AdekoKind | null {
  const wM = p.designW / 100;
  const hM = p.designH / 100;
  const dM = p.designD / 100;
  if (!Number.isFinite(wM) || !Number.isFinite(hM) || !Number.isFinite(dM)) return null;
  // Skip shelf/panel accessories and rows with implausible dims (param heights).
  if (p.groupCode === "TK6") return null;
  if (wM < 0.05 || hM < 0.25 || hM > 2.5 || dM < 0.1) return null;

  const desc = (p.descriptionEn || "").toLowerCase();
  const code = p.code.toUpperCase();

  const filler = /filler/.test(desc) || /(^|\s)(KPM|UKP|BKPM)\b/.test(code);
  const glass = /gla[sd]s/.test(desc) || /^(AG|UG|TGD|HKSC|HKC|HLC)/.test(code);
  const open =
    !filler &&
    (/open|shelf unit|bottleholder|trolly/.test(desc) ||
      /^(ARAF|UARAF|RAF|AS |US |S\d+ MKNZ)/.test(code));

  // Vertical family.
  let place: "base" | "wall" | "tall";
  if (hM >= 1.3) place = "tall";
  else if (p.groupCode === "TK3") place = "wall";
  else if (dM <= 0.4 && /wall/.test(desc)) place = "wall";
  else place = "base";

  // Drawer stacks: 2C.../3C... codes or "N drawers" descriptions.
  let drawers = 0;
  if (/^3C|three drawers/.test(code.startsWith("3C") ? code : desc)) drawers = 3;
  else if (/^2C/.test(code) || /two drawers|double metal sided drawer/.test(desc)) drawers = 2;
  else if (/drawer unit/.test(desc)) drawers = 3;

  // One top drawer over doors (A1C1K / A1C2K / "Base 1 Drawer").
  const topDrawer = drawers === 0 && (/^A1C/.test(code) || /\b1 drawer\b/.test(desc));

  // Door count.
  let doors = 0;
  if (!open && !filler && drawers === 0) {
    if (/double/.test(desc) || /^(A2K|U2K|E2K|AG2K|UG2K)/.test(code)) doors = 2;
    else doors = wM >= 0.7 ? 2 : 1;
  } else if (topDrawer) {
    doors = wM >= 0.7 ? 2 : 1;
  }

  return { place, doors, drawers, topDrawer, glass, open, filler };
}

/** Default bottom height (m) for a wall unit: top aligned near 2.2m. */
export function defaultWallMountY(heightM: number): number {
  return Math.min(Math.max(2.2 - heightM, 0.95), 1.9);
}

/** Clear generated Arabic name, e.g. "خزانة سفلية بباب" — DB names are English. */
export function arabicNameForProduct(p: AdekoProductRow, kind: AdekoKind): string {
  const desc = (p.descriptionEn || "").toLowerCase();
  const corner = /corner/.test(desc);
  const isSink = /sink/.test(desc);

  const family =
    kind.place === "wall" ? "علوية" : kind.place === "tall" ? "طويلة" : "سفلية";

  if (kind.filler) return `سدادة ${family}`;
  if (kind.open) return `وحدة أرفف مفتوحة ${family}`;

  let base = isSink ? "خزانة حوض" : `خزانة ${family}`;
  if (corner) base += " ركنية";

  const parts: string[] = [];
  if (kind.drawers === 2) parts.push("بدرجين");
  else if (kind.drawers > 2) parts.push(`بـ${kind.drawers} أدراج`);
  else if (kind.drawers === 1) parts.push("بدرج");

  if (kind.doors === 1) parts.push(kind.glass ? "بباب زجاجي" : "بباب");
  else if (kind.doors === 2) parts.push(kind.glass ? "ببابين زجاجيين" : "ببابين");

  if (kind.topDrawer) parts.push("ودرج علوي");

  return parts.length ? `${base} ${parts.join(" ")}` : base;
}

/** Build a CabinetDef from a catalog product row (cm → m). Null if unrenderable. */
export function adekoDefFromProduct(p: AdekoProductRow): CabinetDef | null {
  const kind = classifyAdekoProduct(p);
  if (!kind) return null;
  const width = p.designW / 100;
  const height = p.designH / 100;
  const depth = p.designD / 100;
  const corner = /corner/i.test(p.descriptionEn || "");
  return {
    id: `adeko-${p.id}`,
    url: "",
    nameAr: arabicNameForProduct(p, kind),
    nameEn: p.descriptionEn || p.code,
    level: kind.place === "wall" ? "upper" : "base",
    width,
    depth,
    height,
    mountY: kind.place === "wall" ? defaultWallMountY(height) : 0,
    corner: corner || undefined,
    adeko: {
      productId: p.id,
      code: p.code,
      priceAfterVat: p.priceAfterVat,
      thumbnail: p.thumbnail,
      kind,
    },
  };
}

export const CABINET_DEFS: CabinetDef[] = [
  // ── Base (سفلية) ──
  { id: "lower-standard", url: `${ASSETS}/cabinet-lower-standard.glb`, nameAr: "خزانة سفلية بباب", nameEn: "Base Cabinet", level: "base", width: 0.61, depth: 0.65, height: 0.88, mountY: 0 },
  { id: "lower-standard-glass", url: `${ASSETS}/cabinet-lower-standard-glass.glb`, nameAr: "سفلية بباب زجاجي", nameEn: "Base Glass Door", level: "base", width: 0.61, depth: 0.65, height: 0.88, mountY: 0 },
  { id: "lower-drawers", url: `${ASSETS}/cabinet-lower-drawers.glb`, nameAr: "وحدة أدراج", nameEn: "Drawer Unit", level: "base", width: 0.61, depth: 0.65, height: 0.88, mountY: 0 },
  { id: "lower-sink", url: `${ASSETS}/cabinet-lower-sink.glb`, nameAr: "خزانة المغسلة", nameEn: "Sink Cabinet", level: "base", width: 0.61, depth: 0.65, height: 0.88, mountY: 0 },
  { id: "lower-large", url: `${ASSETS}/cabinet-lower-large.glb`, nameAr: "سفلية بباب كبير", nameEn: "Base Large Door", level: "base", width: 0.61, depth: 0.65, height: 0.88, mountY: 0 },
  { id: "lower-corner", url: `${ASSETS}/cabinet-lower-corner.glb`, nameAr: "سفلية ركنية", nameEn: "Base Corner", level: "base", width: 0.84, depth: 0.84, height: 0.88, mountY: 0, corner: true },
  { id: "lower-left-cap", url: `${ASSETS}/cabinet-lower-left-cap.glb`, nameAr: "طرف يسار", nameEn: "Left End Cap", level: "base", width: 0.62, depth: 0.61, height: 0.88, mountY: 0 },
  { id: "lower-right-cap", url: `${ASSETS}/cabinet-lower-right-cap.glb`, nameAr: "طرف يمين", nameEn: "Right End Cap", level: "base", width: 0.62, depth: 0.61, height: 0.88, mountY: 0, rotYFix: Math.PI / 2 },
  // ── Upper (علوية) ──
  { id: "upper-standard", url: `${ASSETS}/cabinet-upper-standard.glb`, nameAr: "علوية بباب", nameEn: "Wall Cabinet", level: "upper", width: 0.61, depth: 0.35, height: 1.07, mountY: 1.05 },
  { id: "upper-standard-glass", url: `${ASSETS}/cabinet-upper-standard-glass.glb`, nameAr: "علوية بباب زجاجي", nameEn: "Wall Glass Door", level: "upper", width: 0.61, depth: 0.35, height: 1.07, mountY: 1.05 },
  { id: "upper-shelves", url: `${ASSETS}/cabinet-upper-shelves.glb`, nameAr: "أرفف مفتوحة", nameEn: "Open Shelves", level: "upper", width: 0.61, depth: 0.31, height: 1.07, mountY: 1.05 },
  { id: "upper-corner", url: `${ASSETS}/cabinet-upper-corner.glb`, nameAr: "علوية ركنية", nameEn: "Wall Corner", level: "upper", width: 0.54, depth: 0.54, height: 1.07, mountY: 1.05, corner: true },
  { id: "upper-short", url: `${ASSETS}/cabinet-upper-short.glb`, nameAr: "علوية قصيرة برف نبيذ", nameEn: "Short Wall Cabinet", level: "upper", width: 0.91, depth: 0.35, height: 0.66, mountY: 1.4 },
  { id: "upper-small-dish", url: `${ASSETS}/cabinet-upper-small-dish.glb`, nameAr: "علوية بمصفاة صحون", nameEn: "Dish Rack Cabinet", level: "upper", width: 0.91, depth: 0.35, height: 0.9, mountY: 1.17 },
  { id: "upper-small-shelves", url: `${ASSETS}/cabinet-upper-small-shelves.glb`, nameAr: "علوية بأرفف", nameEn: "Shelved Wall Cabinet", level: "upper", width: 0.91, depth: 0.35, height: 0.9, mountY: 1.17 },
  { id: "upper-small-wine", url: `${ASSETS}/cabinet-upper-small-wine.glb`, nameAr: "علوية بأرفف زجاجات", nameEn: "Bottle Rack Cabinet", level: "upper", width: 0.91, depth: 0.35, height: 0.9, mountY: 1.17 },
];

/** Dynamic defs built from the real Adeko catalog (registered at runtime). */
const ADEKO_DEFS: CabinetDef[] = [];

/** Register (or replace) a catalog-backed def. Idempotent by id. */
export function registerAdekoDef(def: CabinetDef) {
  const i = ADEKO_DEFS.findIndex((d) => d.id === def.id);
  if (i >= 0) ADEKO_DEFS[i] = def;
  else ADEKO_DEFS.push(def);
}

export function findCabinetDef(id: string): CabinetDef | undefined {
  return CABINET_DEFS.find((d) => d.id === id) ?? ADEKO_DEFS.find((d) => d.id === id);
}

export interface PlacedCabinet {
  id: string;
  catalogId: string;
  wallId: string;
  /** Distance (m) from wall start to the cabinet's near edge. */
  offset: number;
}

/* ── Junctions (corners between adjacent walls) ──────────── */
export interface WallJunction {
  aId: string;
  aEnd: "start" | "end";
  bId: string;
  bEnd: "start" | "end";
  /** Corner point in plan cm. */
  x: number;
  y: number;
}

export function getJunctions(segments: WallSegment[]): WallJunction[] {
  const out: WallJunction[] = [];
  const pts = (s: WallSegment) =>
    [
      { end: "start" as const, x: s.x1, y: s.y1 },
      { end: "end" as const, x: s.x2, y: s.y2 },
    ];
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      for (const pa of pts(segments[i])) {
        for (const pb of pts(segments[j])) {
          if (Math.abs(pa.x - pb.x) < 0.5 && Math.abs(pa.y - pb.y) < 0.5) {
            out.push({
              aId: segments[i].id,
              aEnd: pa.end,
              bId: segments[j].id,
              bEnd: pb.end,
              x: pa.x,
              y: pa.y,
            });
          }
        }
      }
    }
  }
  return out;
}

/** The junction a placed corner cabinet occupies (or null). */
export function junctionOfPlaced(
  placed: PlacedCabinet,
  def: CabinetDef,
  segments: WallSegment[]
): WallJunction | null {
  if (!def.corner) return null;
  const seg = segments.find((s) => s.id === placed.wallId);
  if (!seg) return null;
  const atStart = placed.offset <= EPS;
  const wallEnd: "start" | "end" = atStart ? "start" : "end";
  return (
    getJunctions(segments).find(
      (jn) =>
        (jn.aId === placed.wallId && jn.aEnd === wallEnd) ||
        (jn.bId === placed.wallId && jn.bEnd === wallEnd)
    ) ?? null
  );
}

/* ── Blocked intervals per wall & level ──────────────────── */
export interface Interval {
  a: number;
  b: number;
}

function cornerIntervalOn(
  wallId: string,
  end: "start" | "end",
  width: number,
  segments: WallSegment[]
): Interval {
  const seg = segments.find((s) => s.id === wallId)!;
  const len = seg.length * CM;
  return end === "start" ? { a: 0, b: width } : { a: len - width, b: len };
}

/**
 * Every occupied interval on a wall at a level: placed cabinets on the wall,
 * corner cabinets spilling over from adjacent walls, and door/window openings.
 */
export function blockedIntervals(
  wallId: string,
  level: CabinetLevel,
  placed: PlacedCabinet[],
  segments: WallSegment[],
  openings: KitchenOpening[],
  excludeId?: string
): Interval[] {
  const out: Interval[] = [];

  for (const p of placed) {
    if (p.id === excludeId) continue;
    const def = findCabinetDef(p.catalogId);
    if (!def || def.level !== level) continue;
    if (p.wallId === wallId) {
      out.push({ a: p.offset, b: p.offset + def.width });
    } else if (def.corner) {
      const jn = junctionOfPlaced(p, def, segments);
      if (!jn) continue;
      if (jn.aId === wallId) out.push(cornerIntervalOn(jn.aId, jn.aEnd, def.width, segments));
      else if (jn.bId === wallId) out.push(cornerIntervalOn(jn.bId, jn.bEnd, def.width, segments));
    }
  }

  for (const o of openings) {
    if (o.wallId !== wallId) continue;
    // Doors block both levels; windows only block uppers (base fits under a sill).
    if (o.type === "window" && level === "base") continue;
    out.push({
      a: o.distanceFromWallStart * CM - DOOR_MARGIN,
      b: (o.distanceFromWallStart + o.width) * CM + DOOR_MARGIN,
    });
  }

  return out.sort((x, y) => x.a - y.a);
}

function overlaps(intervals: Interval[], a: number, b: number): boolean {
  return intervals.some((iv) => a < iv.b - EPS && b > iv.a + EPS);
}

export function canPlaceAt(
  wallLenM: number,
  intervals: Interval[],
  offset: number,
  width: number
): boolean {
  if (offset < -EPS || offset + width > wallLenM + EPS) return false;
  return !overlaps(intervals, offset, offset + width);
}

/** First-fit free offset on a wall, or null when the wall is full. */
export function findFreeOffset(
  wallLenM: number,
  intervals: Interval[],
  width: number
): number | null {
  const candidates = [0, ...intervals.map((iv) => iv.b)].sort((a, b) => a - b);
  for (const c of candidates) {
    if (canPlaceAt(wallLenM, intervals, c, width)) return c;
  }
  return null;
}

/**
 * Resolve a drag to the nearest legal offset. Returns null when the wall
 * has no room at all for this cabinet.
 */
export function resolveDragOffset(
  wallLenM: number,
  intervals: Interval[],
  desired: number,
  width: number
): number | null {
  const clamped = Math.min(Math.max(desired, 0), wallLenM - width);
  if (wallLenM < width - EPS) return null;
  if (canPlaceAt(wallLenM, intervals, clamped, width)) return clamped;
  const candidates: number[] = [0, wallLenM - width];
  for (const iv of intervals) {
    candidates.push(iv.a - width, iv.b);
  }
  let best: number | null = null;
  for (const c of candidates) {
    if (!canPlaceAt(wallLenM, intervals, c, width)) continue;
    if (best === null || Math.abs(c - desired) < Math.abs(best - desired)) best = c;
  }
  return best;
}

/* ── High-level placement helpers ────────────────────────── */
export interface PlacementSlot {
  wallId: string;
  offset: number;
}

/** Find a first-fit slot for a straight cabinet across all walls. */
export function findSlotForCabinet(
  def: CabinetDef,
  placed: PlacedCabinet[],
  segments: WallSegment[],
  openings: KitchenOpening[]
): PlacementSlot | null {
  for (const seg of segments) {
    const len = seg.length * CM;
    const intervals = blockedIntervals(seg.id, def.level, placed, segments, openings);
    const off = findFreeOffset(len, intervals, def.width);
    if (off !== null) return { wallId: seg.id, offset: off };
  }
  return null;
}

/** Find a free junction for a corner cabinet. */
export function findCornerSlot(
  def: CabinetDef,
  placed: PlacedCabinet[],
  segments: WallSegment[],
  openings: KitchenOpening[]
): PlacementSlot | null {
  for (const jn of getJunctions(segments)) {
    const sides: Array<{ wallId: string; end: "start" | "end" }> = [
      { wallId: jn.aId, end: jn.aEnd },
      { wallId: jn.bId, end: jn.bEnd },
    ];
    const free = sides.every(({ wallId, end }) => {
      const seg = segments.find((s) => s.id === wallId)!;
      const len = seg.length * CM;
      const iv = cornerIntervalOn(wallId, end, def.width, segments);
      const intervals = blockedIntervals(wallId, def.level, placed, segments, openings);
      return iv.a >= -EPS && iv.b <= len + EPS && !overlaps(intervals, iv.a, iv.b);
    });
    if (free) {
      // Represent the corner on side "a" of the junction.
      const seg = segments.find((s) => s.id === jn.aId)!;
      const len = seg.length * CM;
      return {
        wallId: jn.aId,
        offset: jn.aEnd === "start" ? 0 : len - def.width,
      };
    }
  }
  return null;
}
