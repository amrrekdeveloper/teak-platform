export type ApplianceVariant = "none" | "spaces" | "full";
export type LayoutType = "liner" | "L" | "U";
export type ZoneType = "sink" | "cooking" | "storage" | "fridge" | "prep";

export interface TemplateProductItem {
  code: string;
  wall: "A" | "B" | "C" | "D";
  qty: number;
  notes?: string;
  isApplianceSpace?: boolean;
  cornerAnchor?: boolean;
  /** Which end of the wall the corner unit anchors to.
   *  "end"   = far end (high offset, junction with the next wall in 0→1→2→3 order)
   *  "start" = near end (offset 0, junction with the previous wall)
   *  Defaults to "end" when omitted. */
  cornerJunction?: "start" | "end";
  zone?: ZoneType;
}

export interface KitchenTemplate {
  id: string;
  nameAr: string;
  nameEn: string;
  subtitleAr: string;
  layout: LayoutType;
  minMaxWall: number;
  maxMaxWall: number;
  minMinWall: number;
  variants: Record<ApplianceVariant, TemplateProductItem[]>;
  cornerUnits: boolean;
  svgPath: string;
  sinkWall?: "A" | "B" | "C" | "D";
  fridgeWall?: "A" | "B" | "C" | "D";
  cooktopWall?: "A" | "B" | "C" | "D";
  minAisleM?: number;
}

export interface TemplateWarning {
  severity: "error" | "warning" | "info";
  message: string;
  messageEn: string;
}

// ──────────────────────────────────────────────────────────
// TEMPLATE DEFINITIONS
// Products use exact Adeko catalog codes.
// Wall A = longest wall, Wall B = adjacent right, Wall C = opposite left (U only).
// AKK 115 = blind corner base (110cm) — placed at wall junctions.
// AKK 125 = larger blind corner (120cm).
// cornerAnchor: true  → placed at the wall junction end, not offset 0.
// ──────────────────────────────────────────────────────────

export const KITCHEN_TEMPLATES: KitchenTemplate[] = [
  // ─── 1. تيك لاينر S ─────────────────────────────────────
  {
    id: "liner-s",
    nameAr: "تيك لاينر",
    nameEn: "Teak Liner",
    subtitleAr: "تصميم خطي — جدار واحد",
    layout: "liner",
    minMaxWall: 2.5,
    maxMaxWall: 4.2,
    minMinWall: 1.8,
    cornerUnits: false,
    svgPath: "M4,30 L96,30 M4,30 L4,46 M96,30 L96,46",
    sinkWall: "A",
    minAisleM: 1.2,

    variants: {
      none: [
        { code: "E2K 80",    wall: "A", qty: 1, notes: "حوض", zone: "sink" },
        { code: "A1C1K 60",  wall: "A", qty: 1, zone: "prep" },
        { code: "A1C1K 60",  wall: "A", qty: 1, zone: "storage" },
        { code: "A1K 60 72", wall: "A", qty: 1, zone: "storage" },
        { code: "U1K 60 36", wall: "A", qty: 3, zone: "storage" },
      ],
      spaces: [
        { code: "E2K 80",    wall: "A", qty: 1, notes: "حوض", zone: "sink" },
        { code: "A1C1K 60",  wall: "A", qty: 1, zone: "prep" },
        { code: "A1C1K 60",  wall: "A", qty: 1, zone: "storage" },
        { code: "A1K 60 72", wall: "A", qty: 1, zone: "storage" },
        { code: "BA 60 200", wall: "A", qty: 1, isApplianceSpace: true, notes: "مكان ثلاجة", zone: "fridge" },
        { code: "U1K 60 36", wall: "A", qty: 3, zone: "storage" },
      ],
      full: [
        { code: "E2K 80",           wall: "A", qty: 1, notes: "حوض", zone: "sink" },
        { code: "A1C1K 60",         wall: "A", qty: 1, zone: "prep" },
        { code: "A1C1K 60",         wall: "A", qty: 1, zone: "cooking" },
        { code: "BA 60 200 FRIDGE", wall: "A", qty: 1, isApplianceSpace: true, notes: "مكان ثلاجة", zone: "fridge" },
        { code: "BF 60 200",        wall: "A", qty: 1, isApplianceSpace: true, notes: "مكان فرن", zone: "cooking" },
        { code: "BMFD 60 200",      wall: "A", qty: 1, isApplianceSpace: true, notes: "مكان ميكرويف", zone: "cooking" },
        { code: "U1K 60 36",        wall: "A", qty: 3, zone: "storage" },
      ],
    },
  },

  // ─── 2. تيك L كلاسيك S ───────────────────────────────────
  {
    id: "l-classic-s",
    nameAr: "تيك L كلاسيك",
    nameEn: "Teak L Classic",
    subtitleAr: "L-شكل صغير — جداران متعامدان",
    layout: "L",
    minMaxWall: 3.0,
    maxMaxWall: 4.6,
    minMinWall: 2.5,
    cornerUnits: true,
    svgPath: "M4,60 L4,10 L70,10 M4,60 L20,60",
    sinkWall: "A",
    fridgeWall: "B",
    cooktopWall: "A",
    minAisleM: 1.2,

    variants: {
      none: [
        { code: "AKK 115",   wall: "A", qty: 1, notes: "زاوية عمياء — نقطة التقاء الجدارين A و B", cornerAnchor: true, cornerJunction: "end", zone: "storage" },
        { code: "E2K 80",    wall: "A", qty: 1, notes: "حوض", zone: "sink" },
        { code: "A1C1K 60",  wall: "A", qty: 1, zone: "prep" },
        { code: "A1C1K 60",  wall: "B", qty: 1, zone: "cooking" },
        { code: "A1K 60 72", wall: "B", qty: 1, zone: "storage" },
        { code: "U1K 60 36", wall: "A", qty: 2, zone: "storage" },
        { code: "U1K 60 36", wall: "B", qty: 2, zone: "storage" },
      ],
      spaces: [
        { code: "AKK 115",   wall: "A", qty: 1, notes: "زاوية عمياء — نقطة التقاء الجدارين A و B", cornerAnchor: true, cornerJunction: "end", zone: "storage" },
        { code: "E2K 80",    wall: "A", qty: 1, notes: "حوض", zone: "sink" },
        { code: "A1C1K 60",  wall: "A", qty: 1, zone: "prep" },
        { code: "A1C1K 60",  wall: "B", qty: 1, zone: "cooking" },
        { code: "BA 60 200", wall: "B", qty: 1, isApplianceSpace: true, notes: "مكان ثلاجة", zone: "fridge" },
        { code: "U1K 60 36", wall: "A", qty: 2, zone: "storage" },
        { code: "U1K 60 36", wall: "B", qty: 2, zone: "storage" },
      ],
      full: [
        { code: "AKK 115",          wall: "A", qty: 1, notes: "زاوية عمياء — نقطة التقاء الجدارين A و B", cornerAnchor: true, cornerJunction: "end", zone: "storage" },
        { code: "E2K 80",           wall: "A", qty: 1, notes: "حوض", zone: "sink" },
        { code: "A1C1K 60",         wall: "A", qty: 1, zone: "prep" },
        { code: "A1C1K 60",         wall: "B", qty: 1, zone: "cooking" },
        { code: "BA 60 200 FRIDGE", wall: "B", qty: 1, isApplianceSpace: true, notes: "مكان ثلاجة", zone: "fridge" },
        { code: "BF 60 200",        wall: "B", qty: 1, isApplianceSpace: true, notes: "مكان فرن", zone: "cooking" },
        { code: "BMFD 60 200",      wall: "B", qty: 1, isApplianceSpace: true, notes: "مكان ميكرويف", zone: "cooking" },
        { code: "U1K 60 36",        wall: "A", qty: 2, zone: "storage" },
        { code: "U1K 60 36",        wall: "B", qty: 2, zone: "storage" },
      ],
    },
  },

  // ─── 3. تيك L ستاندرد M ──────────────────────────────────
  {
    id: "l-standard-m",
    nameAr: "تيك L ستاندرد",
    nameEn: "Teak L Standard",
    subtitleAr: "L-شكل متوسط — مناسب للمطابخ العائلية",
    layout: "L",
    minMaxWall: 4.6,
    maxMaxWall: 6.0,
    minMinWall: 3.0,
    cornerUnits: true,
    svgPath: "M4,70 L4,10 L85,10 M4,70 L22,70",
    sinkWall: "A",
    fridgeWall: "B",
    cooktopWall: "A",
    minAisleM: 1.2,

    variants: {
      none: [
        { code: "AKK 125",   wall: "A", qty: 1, notes: "زاوية عمياء كبيرة — نقطة التقاء الجدارين A و B", cornerAnchor: true, cornerJunction: "end", zone: "storage" },
        { code: "E2K 90",    wall: "A", qty: 1, notes: "حوض", zone: "sink" },
        { code: "A1C2K 80",  wall: "A", qty: 1, zone: "prep" },
        { code: "A1C1K 60",  wall: "A", qty: 1, zone: "cooking" },
        { code: "A1C2K 90",  wall: "B", qty: 1, zone: "storage" },
        { code: "A1C1K 60",  wall: "B", qty: 1, zone: "storage" },
        { code: "A1K 60 72", wall: "B", qty: 1, zone: "fridge" },
        { code: "U2K 90 36", wall: "A", qty: 1, zone: "storage" },
        { code: "U1K 60 36", wall: "A", qty: 2, zone: "storage" },
        { code: "U1K 60 36", wall: "B", qty: 3, zone: "storage" },
      ],
      spaces: [
        { code: "AKK 125",   wall: "A", qty: 1, notes: "زاوية عمياء كبيرة — نقطة التقاء الجدارين A و B", cornerAnchor: true, cornerJunction: "end", zone: "storage" },
        { code: "E2K 90",    wall: "A", qty: 1, notes: "حوض", zone: "sink" },
        { code: "A1C2K 80",  wall: "A", qty: 1, zone: "prep" },
        { code: "A1C1K 60",  wall: "A", qty: 1, zone: "cooking" },
        { code: "A1C2K 90",  wall: "B", qty: 1, zone: "storage" },
        { code: "A1C1K 60",  wall: "B", qty: 1, zone: "storage" },
        { code: "BA 60 200", wall: "B", qty: 1, isApplianceSpace: true, notes: "مكان أجهزة", zone: "fridge" },
        { code: "U2K 90 36", wall: "A", qty: 1, zone: "storage" },
        { code: "U1K 60 36", wall: "A", qty: 2, zone: "storage" },
        { code: "U1K 60 36", wall: "B", qty: 3, zone: "storage" },
      ],
      full: [
        { code: "AKK 125",          wall: "A", qty: 1, notes: "زاوية عمياء كبيرة — نقطة التقاء الجدارين A و B", cornerAnchor: true, cornerJunction: "end", zone: "storage" },
        { code: "E2K 90",           wall: "A", qty: 1, notes: "حوض", zone: "sink" },
        { code: "A1C2K 80",         wall: "A", qty: 1, zone: "prep" },
        { code: "A1C1K 60",         wall: "A", qty: 1, zone: "cooking" },
        { code: "A1C2K 90",         wall: "B", qty: 1, zone: "storage" },
        { code: "BA 60 200 FRIDGE", wall: "B", qty: 1, isApplianceSpace: true, notes: "مكان ثلاجة", zone: "fridge" },
        { code: "BF 60 200",        wall: "B", qty: 1, isApplianceSpace: true, notes: "مكان فرن", zone: "cooking" },
        { code: "BMFD 60 200",      wall: "B", qty: 1, isApplianceSpace: true, notes: "مكان ميكرويف", zone: "cooking" },
        { code: "U2K 90 36",        wall: "A", qty: 1, zone: "storage" },
        { code: "U1K 60 36",        wall: "A", qty: 2, zone: "storage" },
        { code: "U1K 60 36",        wall: "B", qty: 3, zone: "storage" },
      ],
    },
  },

  // ─── 4. تيك U ستاندرد L ──────────────────────────────────
  {
    id: "u-standard-l",
    nameAr: "تيك U ستاندرد",
    nameEn: "Teak U Standard",
    subtitleAr: "U-شكل — ثلاثة جدران مع زوايا احترافية",
    layout: "U",
    minMaxWall: 4.5,
    maxMaxWall: 6.5,
    minMinWall: 3.5,
    cornerUnits: true,
    svgPath: "M10,10 L10,75 L90,75 L90,10 M10,10 L22,10 M90,10 L78,10",
    sinkWall: "A",
    fridgeWall: "C",
    cooktopWall: "B",
    minAisleM: 1.2,

    variants: {
      none: [
        { code: "AKK 115",    wall: "B", qty: 1, notes: "زاوية عمياء — نقطة التقاء الجدارين A و B", cornerAnchor: true, cornerJunction: "end", zone: "storage" },
        { code: "AKK 115",    wall: "C", qty: 1, notes: "زاوية عمياء — نقطة التقاء الجدارين A و C", cornerAnchor: true, cornerJunction: "start", zone: "storage" },
        { code: "E2K 90",     wall: "A", qty: 1, notes: "حوض", zone: "sink" },
        { code: "A1C2K 80",   wall: "A", qty: 1, zone: "prep" },
        { code: "A1C1K 60",   wall: "A", qty: 1, zone: "storage" },
        { code: "A1C2K 80",   wall: "B", qty: 1, zone: "cooking" },
        { code: "A1K 60 72",  wall: "B", qty: 1, zone: "cooking" },
        { code: "A1C2K 80",   wall: "C", qty: 1, zone: "fridge" },
        { code: "A1K 60 72",  wall: "C", qty: 1, zone: "storage" },
        { code: "U2K 100 36", wall: "A", qty: 1, zone: "storage" },
        { code: "U1K 60 36",  wall: "A", qty: 2, zone: "storage" },
        { code: "U1K 60 36",  wall: "B", qty: 3, zone: "storage" },
        { code: "U1K 60 36",  wall: "C", qty: 3, zone: "storage" },
      ],
      spaces: [
        { code: "AKK 115",    wall: "B", qty: 1, notes: "زاوية عمياء — نقطة التقاء الجدارين A و B", cornerAnchor: true, cornerJunction: "end", zone: "storage" },
        { code: "AKK 115",    wall: "C", qty: 1, notes: "زاوية عمياء — نقطة التقاء الجدارين A و C", cornerAnchor: true, cornerJunction: "start", zone: "storage" },
        { code: "E2K 90",     wall: "A", qty: 1, notes: "حوض", zone: "sink" },
        { code: "A1C2K 80",   wall: "A", qty: 1, zone: "prep" },
        { code: "A1C1K 60",   wall: "A", qty: 1, zone: "storage" },
        { code: "A1C2K 80",   wall: "B", qty: 1, zone: "cooking" },
        { code: "BA 60 200",  wall: "C", qty: 1, isApplianceSpace: true, notes: "مكان أجهزة", zone: "fridge" },
        { code: "A1C2K 80",   wall: "C", qty: 1, zone: "storage" },
        { code: "U2K 100 36", wall: "A", qty: 1, zone: "storage" },
        { code: "U1K 60 36",  wall: "A", qty: 2, zone: "storage" },
        { code: "U1K 60 36",  wall: "B", qty: 3, zone: "storage" },
        { code: "U1K 60 36",  wall: "C", qty: 3, zone: "storage" },
      ],
      full: [
        { code: "AKK 115",          wall: "B", qty: 1, notes: "زاوية عمياء — نقطة التقاء الجدارين A و B", cornerAnchor: true, cornerJunction: "end", zone: "storage" },
        { code: "AKK 115",          wall: "C", qty: 1, notes: "زاوية عمياء — نقطة التقاء الجدارين A و C", cornerAnchor: true, cornerJunction: "start", zone: "storage" },
        { code: "E2K 100",          wall: "A", qty: 1, notes: "حوض", zone: "sink" },
        { code: "A1C2K 80",         wall: "A", qty: 1, zone: "prep" },
        { code: "A1C2K 80",         wall: "B", qty: 1, zone: "cooking" },
        { code: "A1K 60 72",        wall: "B", qty: 1, zone: "cooking" },
        { code: "BA 60 200 FRIDGE", wall: "C", qty: 1, isApplianceSpace: true, notes: "مكان ثلاجة", zone: "fridge" },
        { code: "BF 60 200",        wall: "C", qty: 1, isApplianceSpace: true, notes: "مكان فرن", zone: "cooking" },
        { code: "BCFD 60 200",      wall: "C", qty: 1, isApplianceSpace: true, notes: "مكان ميكرويف+فرن", zone: "cooking" },
        { code: "U2K 100 36",       wall: "A", qty: 1, zone: "storage" },
        { code: "U1K 60 36",        wall: "A", qty: 2, zone: "storage" },
        { code: "U2K 90 36",        wall: "B", qty: 1, zone: "storage" },
        { code: "U1K 60 36",        wall: "B", qty: 2, zone: "storage" },
        { code: "U1K 60 36",        wall: "C", qty: 2, zone: "storage" },
      ],
    },
  },

  // ─── 5. تيك U برو XL ──────────────────────────────────────
  {
    id: "u-pro-xl",
    nameAr: "تيك U برو",
    nameEn: "Teak U Pro",
    subtitleAr: "U-شكل كبير — مطبخ فاخر بكامل المواصفات",
    layout: "U",
    minMaxWall: 6.5,
    maxMaxWall: 999,
    minMinWall: 5.0,
    cornerUnits: true,
    svgPath: "M8,8 L8,82 L92,82 L92,8 M8,8 L25,8 M92,8 L75,8",
    sinkWall: "A",
    fridgeWall: "C",
    cooktopWall: "B",
    minAisleM: 1.2,

    variants: {
      none: [
        { code: "AKK 125",    wall: "B", qty: 1, notes: "زاوية عمياء كبيرة — نقطة التقاء A و B", cornerAnchor: true, cornerJunction: "end", zone: "storage" },
        { code: "AKK 125",    wall: "C", qty: 1, notes: "زاوية عمياء كبيرة — نقطة التقاء A و C", cornerAnchor: true, cornerJunction: "start", zone: "storage" },
        { code: "E2K 100",    wall: "A", qty: 1, notes: "حوض", zone: "sink" },
        { code: "A1C2K 100",  wall: "A", qty: 1, zone: "prep" },
        { code: "A1C2K 80",   wall: "A", qty: 1, zone: "storage" },
        { code: "A1C2K 100",  wall: "B", qty: 2, zone: "cooking" },
        { code: "A1C2K 100",  wall: "C", qty: 2, zone: "fridge" },
        { code: "U2K 120 36", wall: "A", qty: 1, zone: "storage" },
        { code: "U2K 100 36", wall: "A", qty: 1, zone: "storage" },
        { code: "U2K 100 36", wall: "B", qty: 2, zone: "storage" },
        { code: "U2K 100 36", wall: "C", qty: 2, zone: "storage" },
      ],
      spaces: [
        { code: "AKK 125",    wall: "B", qty: 1, notes: "زاوية عمياء كبيرة — نقطة التقاء A و B", cornerAnchor: true, cornerJunction: "end", zone: "storage" },
        { code: "AKK 125",    wall: "C", qty: 1, notes: "زاوية عمياء كبيرة — نقطة التقاء A و C", cornerAnchor: true, cornerJunction: "start", zone: "storage" },
        { code: "E2K 100",    wall: "A", qty: 1, notes: "حوض", zone: "sink" },
        { code: "A1C2K 100",  wall: "A", qty: 2, zone: "prep" },
        { code: "A1C2K 100",  wall: "B", qty: 2, zone: "cooking" },
        { code: "BA 60 200",  wall: "C", qty: 1, isApplianceSpace: true, notes: "مكان ثلاجة", zone: "fridge" },
        { code: "BA 60 200",  wall: "C", qty: 1, isApplianceSpace: true, notes: "مكان فرن", zone: "cooking" },
        { code: "A1C2K 100",  wall: "C", qty: 1, zone: "storage" },
        { code: "U2K 120 36", wall: "A", qty: 1, zone: "storage" },
        { code: "U2K 100 36", wall: "A", qty: 1, zone: "storage" },
        { code: "U2K 100 36", wall: "B", qty: 2, zone: "storage" },
        { code: "U2K 100 36", wall: "C", qty: 2, zone: "storage" },
      ],
      full: [
        { code: "AKK 125",          wall: "B", qty: 1, notes: "زاوية عمياء كبيرة — نقطة التقاء A و B", cornerAnchor: true, cornerJunction: "end", zone: "storage" },
        { code: "AKK 125",          wall: "C", qty: 1, notes: "زاوية عمياء كبيرة — نقطة التقاء A و C", cornerAnchor: true, cornerJunction: "start", zone: "storage" },
        { code: "E2K 100",          wall: "A", qty: 1, notes: "حوض", zone: "sink" },
        { code: "A1C2K 100",        wall: "A", qty: 2, zone: "prep" },
        { code: "A1C2K 80",         wall: "A", qty: 1, zone: "storage" },
        { code: "A1C2K 100",        wall: "B", qty: 2, zone: "cooking" },
        { code: "BA 60 200 FRIDGE", wall: "C", qty: 1, isApplianceSpace: true, notes: "مكان ثلاجة", zone: "fridge" },
        { code: "BF 60 200",        wall: "C", qty: 1, isApplianceSpace: true, notes: "مكان فرن", zone: "cooking" },
        { code: "BCFD 60 200",      wall: "C", qty: 1, isApplianceSpace: true, notes: "مكان ميكرويف+فرن", zone: "cooking" },
        { code: "BA 60 200",        wall: "C", qty: 1, isApplianceSpace: true, notes: "تخزين طويل", zone: "storage" },
        { code: "U2K 120 36",       wall: "A", qty: 1, zone: "storage" },
        { code: "U2K 100 36",       wall: "A", qty: 1, zone: "storage" },
        { code: "U2K 100 36",       wall: "B", qty: 2, zone: "storage" },
        { code: "U2K 100 36",       wall: "C", qty: 2, zone: "storage" },
      ],
    },
  },
];

// ──────────────────────────────────────────────────────────
// SMART MATCHING ENGINE (NKBA-compliant)
// Scores each template 0–1 based on room dimensions.
// Validates work triangle, aisle clearance, drain-sink alignment.
// Returns structured warnings with severity levels.
// ──────────────────────────────────────────────────────────

export interface WallObstruction {
  type: "door" | "window" | "drain" | "outlet" | "obstacle";
  wall: "A" | "B" | "C" | "D";
  width?: number;
  /** Distance (cm) from the start of the wall to the near edge of this obstruction */
  distanceFromFirst?: number;
}

export interface MatchResult {
  template: KitchenTemplate;
  score: number;
  isBestFit: boolean;
  warnings: TemplateWarning[];
}

/* NKBA recommended work triangle leg: 1.2m – 2.7m each, total ≤ 7.9m */
const NKBA_LEG_MIN = 1.2;
const NKBA_LEG_MAX = 2.7;
const NKBA_TRIANGLE_MAX = 7.9;

/**
 * Compute the local x-offset (cm from wall start) where a corner unit's
 * CENTER should be placed, given the wall index (0=A,1=B,2=C,3=D),
 * junction direction ("start"|"end"), wall lengths, and corner unit depth.
 *
 * Wall layout (clockwise from top/back):
 *   0 = A  back wall  (length = maxWall)
 *   1 = B  right wall (length = minWall)
 *   2 = C  front wall (length = maxWall)
 *   3 = D  left wall  (length = minWall)
 *
 * Junction pairs (wall, "end" direction → adjacent wall):
 *   0→1  A-end  = B-start  (back-right corner)
 *   1→2  B-end  = C-start  (right-front corner) — not used in standard templates
 *   2→3  C-start = B-end   (front-right corner, Wall C "start" = B-C junction)
 *   3→0  D-end  = A-start  (left-back corner)
 *
 * @param wallIndex   0=A, 1=B, 2=C, 3=D
 * @param junction    "end" = far end of wall; "start" = near end of wall
 * @param wallLenCm   length of this wall in cm
 * @param cornerW     corner unit width (along this wall) in cm, e.g. 115
 * @returns           x-offset in cm for the corner cabinet center
 */
export function getCornerJunctionOffset(
  wallIndex: number,
  junction: "start" | "end",
  wallLenCm: number,
  cornerW: number
): number {
  return junction === "end"
    ? wallLenCm - cornerW / 2   /* far junction: center backs up from wall end */
    : cornerW / 2;              /* near junction: center from wall start       */
}

/**
 * Returns the 3D world coordinates (in scene units) of the junction corner
 * between wallIndex and its neighbor in the given direction.
 *
 * @param wallIndex   0=A,1=B,2=C,3=D
 * @param junction    "end" = next wall; "start" = previous wall
 * @param lengthCm    kitchen length (cm)
 * @param widthCm     kitchen width (cm)
 * @param SCALE       scene scale factor (default 0.01 → cm to scene units)
 */
export function getJunctionWorldCoords(
  wallIndex: number,
  junction: "start" | "end",
  lengthCm: number,
  widthCm: number,
  SCALE = 0.01
): { x: number; z: number } {
  const L = lengthCm * SCALE;
  const W = widthCm * SCALE;
  /* Four corners of the room (world coords, wall centers at these vertices):
     Wall A: back  z=-W/2   x spans [-L/2, +L/2]  → A-B junction: x=+L/2,z=-W/2
     Wall B: right x=+L/2   z spans [-W/2, +W/2]  → B-C junction: x=+L/2,z=+W/2
     Wall C: front z=+W/2   x spans [+L/2, -L/2]  → C-D junction: x=-L/2,z=+W/2
     Wall D: left  x=-L/2   z spans [+W/2, -W/2]  → D-A junction: x=-L/2,z=-W/2
  */
  const corners = [
    { x: -L / 2, z: -W / 2 }, // Wall A start (A←D junction)
    { x: +L / 2, z: -W / 2 }, // Wall A end   (A→B junction)
    { x: +L / 2, z: +W / 2 }, // Wall B end   (B→C junction)
    { x: -L / 2, z: +W / 2 }, // Wall C end   (C→D junction)
    { x: -L / 2, z: -W / 2 }, // Wall D end   (D→A junction) same as [0]
  ];
  // wallIndex 0=A start at corners[0], end at corners[1]
  // wallIndex 1=B start at corners[1], end at corners[2]
  // wallIndex 2=C start at corners[2], end at corners[3]
  // wallIndex 3=D start at corners[3], end at corners[4]
  const base = wallIndex % 4;
  return junction === "end" ? corners[base + 1] : corners[base];
}

function wallDistanceM(
  wall1: "A" | "B" | "C" | "D",
  wall2: "A" | "B" | "C" | "D",
  lengthM: number,
  widthM: number
): number {
  const longW = Math.max(lengthM, widthM);
  const shortW = Math.min(lengthM, widthM);
  const wallIndex = { A: 0, B: 1, C: 2, D: 3 } as Record<string, number>;
  const i1 = wallIndex[wall1];
  const i2 = wallIndex[wall2];
  const diff = Math.abs(i1 - i2);
  if (diff === 0) return 0;
  if (diff === 2) return shortW;
  return longW / 2;
}

export function matchKitchenTemplates(
  lengthM: number,
  widthM: number,
  walls: Array<{ label: "A" | "B" | "C" | "D"; items: WallObstruction[] }>
): MatchResult[] {
  const maxWall = Math.max(lengthM, widthM);
  const minWall = Math.min(lengthM, widthM);
  const cabinetDepth = 0.6;

  const results: MatchResult[] = KITCHEN_TEMPLATES.map((tmpl) => {
    const maxFit =
      maxWall >= tmpl.minMaxWall && maxWall <= tmpl.maxMaxWall ? 1 :
      maxWall < tmpl.minMaxWall ? Math.max(0, 1 - (tmpl.minMaxWall - maxWall) / 2) :
      Math.max(0, 1 - (maxWall - tmpl.maxMaxWall) / 2);

    const minFit = minWall >= tmpl.minMinWall ? 1 : Math.max(0, 1 - (tmpl.minMinWall - minWall) / 1.5);

    let score = maxFit * 0.7 + minFit * 0.3;

    const warnings: TemplateWarning[] = [];

    /* ── Aisle clearance ─────────────────────────────── */
    const aisleMin = tmpl.minAisleM ?? 1.2;
    const cabinetSides = tmpl.layout === "U" ? 2 : 1;
    const aisleW = minWall - cabinetDepth * cabinetSides;
    if (aisleW < aisleMin) {
      warnings.push({
        severity: "error",
        message: `ممر العمل ${(aisleW * 100).toFixed(0)} سم — أدنى من الحد المطلوب ${(aisleMin * 100).toFixed(0)} سم`,
        messageEn: `Work aisle ${(aisleW * 100).toFixed(0)} cm — below NKBA minimum of ${(aisleMin * 100).toFixed(0)} cm`,
      });
      score *= 0.7;
    } else if (aisleW < aisleMin + 0.3) {
      warnings.push({
        severity: "warning",
        message: `ممر العمل ${(aisleW * 100).toFixed(0)} سم — يُوصى بـ ${((aisleMin + 0.3) * 100).toFixed(0)} سم على الأقل`,
        messageEn: `Work aisle ${(aisleW * 100).toFixed(0)} cm — recommended ${((aisleMin + 0.3) * 100).toFixed(0)} cm+`,
      });
    } else {
      warnings.push({
        severity: "info",
        message: `ممر العمل ${(aisleW * 100).toFixed(0)} سم — ممتاز`,
        messageEn: `Work aisle ${(aisleW * 100).toFixed(0)} cm — excellent clearance`,
      });
    }

    /* ── NKBA Work Triangle (L and U templates only) ─── */
    if (tmpl.sinkWall && tmpl.fridgeWall && tmpl.cooktopWall) {
      const sinkFridge  = wallDistanceM(tmpl.sinkWall, tmpl.fridgeWall, lengthM, widthM);
      const fridgeCook  = wallDistanceM(tmpl.fridgeWall, tmpl.cooktopWall, lengthM, widthM);
      const cookSink    = wallDistanceM(tmpl.cooktopWall, tmpl.sinkWall, lengthM, widthM);
      const triangleSum = sinkFridge + fridgeCook + cookSink;

      const legsBad = [sinkFridge, fridgeCook, cookSink].filter(
        (leg) => leg < NKBA_LEG_MIN || leg > NKBA_LEG_MAX
      );

      if (legsBad.length > 0 || triangleSum > NKBA_TRIANGLE_MAX) {
        warnings.push({
          severity: "warning",
          message: `مثلث العمل ${(triangleSum * 100).toFixed(0)} سم — يتجاوز المعيار NKBA (${NKBA_TRIANGLE_MAX * 100} سم)`,
          messageEn: `Work triangle ${(triangleSum * 100).toFixed(0)} cm — exceeds NKBA max (${NKBA_TRIANGLE_MAX * 100} cm)`,
        });
        score *= 0.85;
      } else {
        warnings.push({
          severity: "info",
          message: `مثلث العمل ${(triangleSum * 100).toFixed(0)} سم — ضمن معيار NKBA`,
          messageEn: `Work triangle ${(triangleSum * 100).toFixed(0)} cm — within NKBA spec`,
        });
      }
    }

    /* ── Corner clearance ───────────────────────────── */
    if (tmpl.cornerUnits && minWall < 2.0) {
      warnings.push({
        severity: "error",
        message: "الجدار القصير أقل من 2م — وحدة الزاوية قد تتعارض مع المساحة المتاحة",
        messageEn: "Short wall under 2m — corner unit may conflict with available space",
      });
      score *= 0.8;
    }

    /* ── Door-swing clearance on corner walls ───────── */
    if (tmpl.cornerUnits) {
      /* Collect corner unit width from template variants (use "spaces" or first available) */
      const variantItems = tmpl.variants["spaces"] || tmpl.variants["none"] || tmpl.variants["full"] || [];
      const cornerItem = variantItems.find((it) => it.cornerAnchor);
      /* AKK 115 → 115cm, AKK 125 → 125cm; parse from code or default 115 */
      const cornerWidthCm = cornerItem
        ? (parseFloat(cornerItem.code.replace(/[^0-9]/g, "")) || 115)
        : 115;

      for (const wallInfo of walls) {
        if (wallInfo.label !== "B" && wallInfo.label !== "C") continue;
        const wallLenCm = wallInfo.label === "B" || wallInfo.label === "D"
          ? Math.min(lengthM, widthM) * 100
          : Math.max(lengthM, widthM) * 100;
        const doors = wallInfo.items.filter((obs) => obs.type === "door");

        for (const door of doors) {
          const doorW = (door.width ?? 0);           /* cm */
          const doorPos = (door.distanceFromFirst ?? 0); /* cm from wall start */
          const swingEnd = doorPos + doorW;           /* swing zone: [doorPos, swingEnd] */

          /* Corner unit occupies junction zone.
             Wall B "end" junction (near Wall A): [wallLen - cornerWidth, wallLen]
             Wall C "start" junction (near Wall B): [0, cornerWidth] */
          const junc = wallInfo.label === "C" ? "start" : "end";
          const cornerStart = junc === "start" ? 0 : wallLenCm - cornerWidthCm;
          const cornerEnd   = junc === "start" ? cornerWidthCm : wallLenCm;

          /* Check overlap: swing zone [doorPos, swingEnd] vs corner zone [cornerStart, cornerEnd] */
          const overlaps = doorPos < cornerEnd && swingEnd > cornerStart;

          if (overlaps) {
            warnings.push({
              severity: "error",
              message: `باب الجدار ${wallInfo.label} (عرضه ${doorW.toFixed(0)} سم) يتعارض مع وحدة الزاوية — مسافة تداخل ${Math.min(swingEnd, cornerEnd) - Math.max(doorPos, cornerStart)}سم`,
              messageEn: `Wall ${wallInfo.label} door (${doorW.toFixed(0)} cm) swing overlaps corner unit — ${(Math.min(swingEnd, cornerEnd) - Math.max(doorPos, cornerStart)).toFixed(0)} cm conflict`,
            });
            score *= 0.75;
          } else if (doorW > 0 && Math.abs(swingEnd - cornerStart) < 30) {
            /* Door is within 30cm of corner unit — tight clearance warning */
            warnings.push({
              severity: "warning",
              message: `باب الجدار ${wallInfo.label} قريب من وحدة الزاوية — مسافة فاصلة ${Math.abs(swingEnd - cornerStart).toFixed(0)} سم فقط`,
              messageEn: `Wall ${wallInfo.label} door near corner unit — only ${Math.abs(swingEnd - cornerStart).toFixed(0)} cm clearance`,
            });
            score *= 0.9;
          } else {
            /* Door exists but doesn't conflict */
            warnings.push({
              severity: "info",
              message: `باب الجدار ${wallInfo.label} — لا تعارض مع وحدة الزاوية`,
              messageEn: `Wall ${wallInfo.label} door — no conflict with corner unit`,
            });
          }
        }
      }
    }

    /* ── Door on sink wall (Wall A) ─────────────────── */
    for (const wallInfo of walls) {
      if (wallInfo.label === "A") {
        for (const obs of wallInfo.items) {
          if (obs.type === "door") {
            warnings.push({
              severity: "warning",
              message: "الجدار A يحتوي باب — تحقق من موقع خزانة الحوض والزاوية",
              messageEn: "Wall A has a door — check sink unit and corner unit placement",
            });
          }
          if (obs.type === "window") {
            warnings.push({
              severity: "info",
              message: "الجدار A يحتوي نافذة — يُنصح بوضع الحوض تحت النافذة",
              messageEn: "Wall A has a window — recommended: place sink unit below window",
            });
          }
        }
      }
    }

    /* ── Drain-wall vs sink-wall alignment ──────────── */
    const drainWalls = walls
      .filter((w) => w.items.some((obs) => obs.type === "drain"))
      .map((w) => w.label);

    if (drainWalls.length > 0) {
      const sinkWall = tmpl.sinkWall || "A";
      if (drainWalls.includes(sinkWall)) {
        warnings.push({
          severity: "info",
          message: `نقطة التصريف على جدار الحوض (${sinkWall}) — توافق مثالي`,
          messageEn: `Drain on sink wall (${sinkWall}) — ideal alignment`,
        });
        score = Math.min(1, score * 1.05);
      } else {
        warnings.push({
          severity: "warning",
          message: `نقطة التصريف على الجدار ${drainWalls[0]} لكن الحوض على الجدار ${sinkWall} — يتطلب تمديد سباكة`,
          messageEn: `Drain on wall ${drainWalls[0]} but sink on wall ${sinkWall} — plumbing extension needed`,
        });
        score *= 0.9;
      }
    }

    return { template: tmpl, score, isBestFit: false, warnings };
  });

  results.sort((a, b) => b.score - a.score);

  if (results.length > 0 && results[0].score > 0.3) {
    results[0].isBestFit = true;
  }

  return results;
}

// ──────────────────────────────────────────────────────────
// APPLIANCE VARIANT LABELS
// ──────────────────────────────────────────────────────────

export const APPLIANCE_VARIANT_LABELS: Record<ApplianceVariant, { ar: string; en: string; icon: string }> = {
  none:   { ar: "بدون أجهزة",        en: "No Appliances",      icon: "🪵" },
  spaces: { ar: "مع مكان للأجهزة",   en: "With Appliance Spaces", icon: "📐" },
  full:   { ar: "مجهز بالكامل",       en: "Fully Equipped",     icon: "⭐" },
};

export const ZONE_COLORS: Record<ZoneType, string> = {
  sink:    "#3B82F6",
  cooking: "#EF4444",
  storage: "#6B7280",
  fridge:  "#10B981",
  prep:    "#F59E0B",
};

export function countProducts(tmpl: KitchenTemplate, variant: ApplianceVariant): number {
  return tmpl.variants[variant].reduce((sum, p) => sum + p.qty, 0);
}
