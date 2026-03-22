export type ApplianceVariant = "none" | "spaces" | "full";
export type LayoutType = "liner" | "L" | "U";

export interface TemplateProductItem {
  code: string;
  wall: "A" | "B" | "C" | "D";
  qty: number;
  notes?: string;
  isApplianceSpace?: boolean;
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
}

// ──────────────────────────────────────────────────────────
// TEMPLATE DEFINITIONS
// Products use exact Adeko catalog codes.
// Wall A = longest wall, Wall B = adjacent, Wall C = opposite short side (U only).
// AKK 115 = blind corner base (110cm) — placed at wall junctions.
// AKK 125 = larger blind corner (120cm).
// AK2 MKNZ 90 = corner mechanism unit (90×90cm).
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
    svgPath:
      "M4,30 L96,30 M4,30 L4,46 M96,30 L96,46",

    variants: {
      none: [
        { code: "E2K 80",      wall: "A", qty: 1, notes: "حوض" },
        { code: "A1C1K 60",    wall: "A", qty: 2 },
        { code: "A1K 60 72",   wall: "A", qty: 1 },
        { code: "U1K 60 36",   wall: "A", qty: 3 },
      ],
      spaces: [
        { code: "E2K 80",      wall: "A", qty: 1, notes: "حوض" },
        { code: "A1C1K 60",    wall: "A", qty: 2 },
        { code: "A1K 60 72",   wall: "A", qty: 1 },
        { code: "BA 60 200",   wall: "A", qty: 1, isApplianceSpace: true, notes: "مكان ثلاجة" },
        { code: "U1K 60 36",   wall: "A", qty: 3 },
      ],
      full: [
        { code: "E2K 80",           wall: "A", qty: 1, notes: "حوض" },
        { code: "A1C1K 60",         wall: "A", qty: 2 },
        { code: "BA 60 200 FRIDGE", wall: "A", qty: 1, isApplianceSpace: true, notes: "مكان ثلاجة" },
        { code: "BF 60 200",        wall: "A", qty: 1, isApplianceSpace: true, notes: "مكان فرن" },
        { code: "BMFD 60 200",      wall: "A", qty: 1, isApplianceSpace: true, notes: "مكان ميكرويف" },
        { code: "U1K 60 36",        wall: "A", qty: 3 },
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
    svgPath:
      "M4,60 L4,10 L70,10 M4,60 L20,60",

    variants: {
      none: [
        { code: "AKK 115",    wall: "A", qty: 1, notes: "زاوية عمياء — نقطة التقاء الجدارين A و B" },
        { code: "E2K 80",     wall: "A", qty: 1, notes: "حوض" },
        { code: "A1C1K 60",   wall: "A", qty: 1 },
        { code: "A1C1K 60",   wall: "B", qty: 1 },
        { code: "A1K 60 72",  wall: "B", qty: 1 },
        { code: "U1K 60 36",  wall: "A", qty: 2 },
        { code: "U1K 60 36",  wall: "B", qty: 2 },
      ],
      spaces: [
        { code: "AKK 115",    wall: "A", qty: 1, notes: "زاوية عمياء — نقطة التقاء الجدارين A و B" },
        { code: "E2K 80",     wall: "A", qty: 1, notes: "حوض" },
        { code: "A1C1K 60",   wall: "A", qty: 1 },
        { code: "A1C1K 60",   wall: "B", qty: 1 },
        { code: "BA 60 200",  wall: "B", qty: 1, isApplianceSpace: true, notes: "مكان ثلاجة" },
        { code: "U1K 60 36",  wall: "A", qty: 2 },
        { code: "U1K 60 36",  wall: "B", qty: 2 },
      ],
      full: [
        { code: "AKK 115",         wall: "A", qty: 1, notes: "زاوية عمياء — نقطة التقاء الجدارين A و B" },
        { code: "E2K 80",          wall: "A", qty: 1, notes: "حوض" },
        { code: "A1C1K 60",        wall: "A", qty: 1 },
        { code: "A1C1K 60",        wall: "B", qty: 1 },
        { code: "BA 60 200 FRIDGE",wall: "B", qty: 1, isApplianceSpace: true, notes: "مكان ثلاجة" },
        { code: "BF 60 200",       wall: "B", qty: 1, isApplianceSpace: true, notes: "مكان فرن" },
        { code: "BMFD 60 200",     wall: "B", qty: 1, isApplianceSpace: true, notes: "مكان ميكرويف" },
        { code: "U1K 60 36",       wall: "A", qty: 2 },
        { code: "U1K 60 36",       wall: "B", qty: 2 },
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
    svgPath:
      "M4,70 L4,10 L85,10 M4,70 L22,70",

    variants: {
      none: [
        { code: "AKK 125",    wall: "A", qty: 1, notes: "زاوية عمياء كبيرة — نقطة التقاء الجدارين A و B" },
        { code: "E2K 90",     wall: "A", qty: 1, notes: "حوض" },
        { code: "A1C2K 80",   wall: "A", qty: 1 },
        { code: "A1C1K 60",   wall: "A", qty: 1 },
        { code: "A1C2K 90",   wall: "B", qty: 1 },
        { code: "A1C1K 60",   wall: "B", qty: 1 },
        { code: "A1K 60 72",  wall: "B", qty: 1 },
        { code: "U2K 90 36",  wall: "A", qty: 1 },
        { code: "U1K 60 36",  wall: "A", qty: 2 },
        { code: "U1K 60 36",  wall: "B", qty: 3 },
      ],
      spaces: [
        { code: "AKK 125",    wall: "A", qty: 1, notes: "زاوية عمياء كبيرة — نقطة التقاء الجدارين A و B" },
        { code: "E2K 90",     wall: "A", qty: 1, notes: "حوض" },
        { code: "A1C2K 80",   wall: "A", qty: 1 },
        { code: "A1C1K 60",   wall: "A", qty: 1 },
        { code: "A1C2K 90",   wall: "B", qty: 1 },
        { code: "A1C1K 60",   wall: "B", qty: 1 },
        { code: "BA 60 200",  wall: "B", qty: 1, isApplianceSpace: true, notes: "مكان أجهزة" },
        { code: "U2K 90 36",  wall: "A", qty: 1 },
        { code: "U1K 60 36",  wall: "A", qty: 2 },
        { code: "U1K 60 36",  wall: "B", qty: 3 },
      ],
      full: [
        { code: "AKK 125",         wall: "A", qty: 1, notes: "زاوية عمياء كبيرة — نقطة التقاء الجدارين A و B" },
        { code: "E2K 90",          wall: "A", qty: 1, notes: "حوض" },
        { code: "A1C2K 80",        wall: "A", qty: 1 },
        { code: "A1C1K 60",        wall: "A", qty: 1 },
        { code: "A1C2K 90",        wall: "B", qty: 1 },
        { code: "BA 60 200 FRIDGE",wall: "B", qty: 1, isApplianceSpace: true, notes: "مكان ثلاجة" },
        { code: "BF 60 200",       wall: "B", qty: 1, isApplianceSpace: true, notes: "مكان فرن" },
        { code: "BMFD 60 200",     wall: "B", qty: 1, isApplianceSpace: true, notes: "مكان ميكرويف" },
        { code: "U2K 90 36",       wall: "A", qty: 1 },
        { code: "U1K 60 36",       wall: "A", qty: 2 },
        { code: "U1K 60 36",       wall: "B", qty: 3 },
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
    svgPath:
      "M10,10 L10,75 L90,75 L90,10 M10,10 L22,10 M90,10 L78,10",

    variants: {
      none: [
        { code: "AKK 115",    wall: "B", qty: 1, notes: "زاوية عمياء — نقطة التقاء الجدارين A و B" },
        { code: "AKK 115",    wall: "C", qty: 1, notes: "زاوية عمياء — نقطة التقاء الجدارين A و C" },
        { code: "E2K 90",     wall: "A", qty: 1, notes: "حوض" },
        { code: "A1C2K 80",   wall: "A", qty: 1 },
        { code: "A1C1K 60",   wall: "A", qty: 1 },
        { code: "A1C2K 80",   wall: "B", qty: 1 },
        { code: "A1K 60 72",  wall: "B", qty: 1 },
        { code: "A1C2K 80",   wall: "C", qty: 1 },
        { code: "A1K 60 72",  wall: "C", qty: 1 },
        { code: "U2K 100 36", wall: "A", qty: 1 },
        { code: "U1K 60 36",  wall: "A", qty: 2 },
        { code: "U1K 60 36",  wall: "B", qty: 3 },
        { code: "U1K 60 36",  wall: "C", qty: 3 },
      ],
      spaces: [
        { code: "AKK 115",    wall: "B", qty: 1, notes: "زاوية عمياء — نقطة التقاء الجدارين A و B" },
        { code: "AKK 115",    wall: "C", qty: 1, notes: "زاوية عمياء — نقطة التقاء الجدارين A و C" },
        { code: "E2K 90",     wall: "A", qty: 1, notes: "حوض" },
        { code: "A1C2K 80",   wall: "A", qty: 1 },
        { code: "A1C1K 60",   wall: "A", qty: 1 },
        { code: "A1C2K 80",   wall: "B", qty: 1 },
        { code: "BA 60 200",  wall: "C", qty: 1, isApplianceSpace: true, notes: "مكان أجهزة" },
        { code: "A1C2K 80",   wall: "C", qty: 1 },
        { code: "U2K 100 36", wall: "A", qty: 1 },
        { code: "U1K 60 36",  wall: "A", qty: 2 },
        { code: "U1K 60 36",  wall: "B", qty: 3 },
        { code: "U1K 60 36",  wall: "C", qty: 3 },
      ],
      full: [
        { code: "AKK 115",         wall: "B", qty: 1, notes: "زاوية عمياء — نقطة التقاء الجدارين A و B" },
        { code: "AKK 115",         wall: "C", qty: 1, notes: "زاوية عمياء — نقطة التقاء الجدارين A و C" },
        { code: "E2K 100",         wall: "A", qty: 1, notes: "حوض" },
        { code: "A1C2K 80",        wall: "A", qty: 1 },
        { code: "A1C2K 80",        wall: "B", qty: 1 },
        { code: "A1K 60 72",       wall: "B", qty: 1 },
        { code: "BA 60 200 FRIDGE",wall: "C", qty: 1, isApplianceSpace: true, notes: "مكان ثلاجة" },
        { code: "BF 60 200",       wall: "C", qty: 1, isApplianceSpace: true, notes: "مكان فرن" },
        { code: "BCFD 60 200",     wall: "C", qty: 1, isApplianceSpace: true, notes: "مكان ميكرويف+فرن" },
        { code: "U2K 100 36",      wall: "A", qty: 1 },
        { code: "U1K 60 36",       wall: "A", qty: 2 },
        { code: "U2K 90 36",       wall: "B", qty: 1 },
        { code: "U1K 60 36",       wall: "B", qty: 2 },
        { code: "U1K 60 36",       wall: "C", qty: 2 },
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
    svgPath:
      "M8,8 L8,82 L92,82 L92,8 M8,8 L25,8 M92,8 L75,8",

    variants: {
      none: [
        { code: "AKK 125",    wall: "B", qty: 1, notes: "زاوية عمياء كبيرة — نقطة التقاء A و B" },
        { code: "AKK 125",    wall: "C", qty: 1, notes: "زاوية عمياء كبيرة — نقطة التقاء A و C" },
        { code: "E2K 100",    wall: "A", qty: 1, notes: "حوض" },
        { code: "A1C2K 100",  wall: "A", qty: 1 },
        { code: "A1C2K 80",   wall: "A", qty: 1 },
        { code: "A1C2K 100",  wall: "B", qty: 2 },
        { code: "A1C2K 100",  wall: "C", qty: 2 },
        { code: "U2K 120 36", wall: "A", qty: 1 },
        { code: "U2K 100 36", wall: "A", qty: 1 },
        { code: "U2K 100 36", wall: "B", qty: 2 },
        { code: "U2K 100 36", wall: "C", qty: 2 },
      ],
      spaces: [
        { code: "AKK 125",    wall: "B", qty: 1, notes: "زاوية عمياء كبيرة — نقطة التقاء A و B" },
        { code: "AKK 125",    wall: "C", qty: 1, notes: "زاوية عمياء كبيرة — نقطة التقاء A و C" },
        { code: "E2K 100",    wall: "A", qty: 1, notes: "حوض" },
        { code: "A1C2K 100",  wall: "A", qty: 2 },
        { code: "A1C2K 100",  wall: "B", qty: 2 },
        { code: "BA 60 200",  wall: "C", qty: 1, isApplianceSpace: true, notes: "مكان ثلاجة" },
        { code: "BA 60 200",  wall: "C", qty: 1, isApplianceSpace: true, notes: "مكان فرن" },
        { code: "A1C2K 100",  wall: "C", qty: 1 },
        { code: "U2K 120 36", wall: "A", qty: 1 },
        { code: "U2K 100 36", wall: "A", qty: 1 },
        { code: "U2K 100 36", wall: "B", qty: 2 },
        { code: "U2K 100 36", wall: "C", qty: 2 },
      ],
      full: [
        { code: "AKK 125",         wall: "B", qty: 1, notes: "زاوية عمياء كبيرة — نقطة التقاء A و B" },
        { code: "AKK 125",         wall: "C", qty: 1, notes: "زاوية عمياء كبيرة — نقطة التقاء A و C" },
        { code: "E2K 100",         wall: "A", qty: 1, notes: "حوض" },
        { code: "A1C2K 100",       wall: "A", qty: 2 },
        { code: "A1C2K 80",        wall: "A", qty: 1 },
        { code: "A1C2K 100",       wall: "B", qty: 2 },
        { code: "BA 60 200 FRIDGE",wall: "C", qty: 1, isApplianceSpace: true, notes: "مكان ثلاجة" },
        { code: "BF 60 200",       wall: "C", qty: 1, isApplianceSpace: true, notes: "مكان فرن" },
        { code: "BCFD 60 200",     wall: "C", qty: 1, isApplianceSpace: true, notes: "مكان ميكرويف+فرن" },
        { code: "BA 60 200",       wall: "C", qty: 1, isApplianceSpace: true, notes: "تخزين طويل" },
        { code: "U2K 120 36",      wall: "A", qty: 1 },
        { code: "U2K 100 36",      wall: "A", qty: 1 },
        { code: "U2K 100 36",      wall: "B", qty: 2 },
        { code: "U2K 100 36",      wall: "C", qty: 2 },
      ],
    },
  },
];

// ──────────────────────────────────────────────────────────
// SMART MATCHING ENGINE
// Scores each template 0–1 based on room dimensions.
// Considers wall obstructions (doors, windows) for warnings.
// ──────────────────────────────────────────────────────────

export interface WallObstruction {
  type: "door" | "window" | "drain" | "outlet" | "obstacle";
  wall: "A" | "B" | "C" | "D";
  width?: number;
}

export interface MatchResult {
  template: KitchenTemplate;
  score: number;
  isBestFit: boolean;
  warnings: string[];
}

export function matchKitchenTemplates(
  lengthM: number,
  widthM: number,
  walls: Array<{ label: "A" | "B" | "C" | "D"; items: WallObstruction[] }>
): MatchResult[] {
  const maxWall = Math.max(lengthM, widthM);
  const minWall = Math.min(lengthM, widthM);

  const results: MatchResult[] = KITCHEN_TEMPLATES.map((tmpl) => {
    // Dimension score: how well room fits the template range
    const maxFit =
      maxWall >= tmpl.minMaxWall && maxWall <= tmpl.maxMaxWall ? 1 :
      maxWall < tmpl.minMaxWall ? Math.max(0, 1 - (tmpl.minMaxWall - maxWall) / 2) :
      Math.max(0, 1 - (maxWall - tmpl.maxMaxWall) / 2);

    const minFit = minWall >= tmpl.minMinWall ? 1 : Math.max(0, 1 - (tmpl.minMinWall - minWall) / 1.5);

    const score = (maxFit * 0.7 + minFit * 0.3);

    // Build warnings from wall obstructions
    const warnings: string[] = [];
    for (const wallInfo of walls) {
      for (const obs of wallInfo.items) {
        if (obs.type === "door" && wallInfo.label === "A") {
          warnings.push("الجدار A يحتوي باب — تحقق من موقع خزانة الحوض والزاوية");
        }
        if (obs.type === "window" && wallInfo.label === "A") {
          warnings.push("الجدار A يحتوي نافذة — يُنصح بوضع الحوض تحت النافذة");
        }
        if (obs.type === "drain" && wallInfo.label === "A") {
          warnings.push("فتحة تصريف في الجدار A — ضع حوض E2K قريباً منها");
        }
      }
    }

    // Corner warning: if layout needs corners but a wall is very short
    if (tmpl.cornerUnits && minWall < 2.0) {
      warnings.push("الجدار القصير أقل من 2م — قد تتعارض وحدة الزاوية مع المساحة المتاحة");
    }

    return { template: tmpl, score, isBestFit: false, warnings };
  });

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  // Mark best fit
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

// Count products in a variant
export function countProducts(tmpl: KitchenTemplate, variant: ApplianceVariant): number {
  return tmpl.variants[variant].reduce((sum, p) => sum + p.qty, 0);
}
