export type ProductCategory = "kitchen" | "wardrobe" | "door" | "decoration";

export type CabinetType = "base" | "wall" | "tall";
export type WardrobeType = "hinged" | "sliding" | "walkin";
export type DoorSizeStandard = "70" | "80" | "90" | "100" | "custom";
export type WoodMaterial = "chipboard" | "mdf" | "solid_beech" | "solid_oak" | "hpl" | "pvc";

export interface PanelThickness {
  material: WoodMaterial;
  thickness: number;
  labelAr: string;
  labelEn: string;
}

export const PANEL_THICKNESSES: PanelThickness[] = [
  { material: "chipboard", thickness: 18, labelAr: "شيبورد 18مم", labelEn: "Chipboard 18mm" },
  { material: "mdf", thickness: 18, labelAr: "MDF 18مم", labelEn: "MDF 18mm" },
  { material: "mdf", thickness: 16, labelAr: "MDF 16مم", labelEn: "MDF 16mm" },
  { material: "solid_beech", thickness: 20, labelAr: "خشب زان صولد 20مم", labelEn: "Solid Beech 20mm" },
  { material: "solid_oak", thickness: 20, labelAr: "خشب بلوط صولد 20مم", labelEn: "Solid Oak 20mm" },
  { material: "hpl", thickness: 18, labelAr: "HPL 18مم", labelEn: "HPL 18mm" },
  { material: "pvc", thickness: 18, labelAr: "PVC 18مم", labelEn: "PVC 18mm" },
];

export const EDGE_BANDING_THICKNESS = 0.5;
export const DRAWER_RUNNER_CLEARANCE = 13;
export const DOOR_HINGE_CLEARANCE = 3;
export const SLIDING_TRACK_CLEARANCE = 15;
export const ASSEMBLY_GAP = 1;

export interface KitchenCabinetStandards {
  type: CabinetType;
  labelAr: string;
  labelEn: string;
  standardHeight: number;
  standardDepth: number;
  standardWidths: number[];
  minWidth: number;
  maxWidth: number;
}

export const KITCHEN_CABINET_STANDARDS: KitchenCabinetStandards[] = [
  {
    type: "base",
    labelAr: "وحدة أرضية",
    labelEn: "Base Cabinet",
    standardHeight: 850,
    standardDepth: 600,
    standardWidths: [300, 400, 450, 500, 600, 800, 900, 1000, 1200],
    minWidth: 150,
    maxWidth: 1200,
  },
  {
    type: "wall",
    labelAr: "وحدة علوية",
    labelEn: "Wall Cabinet",
    standardHeight: 720,
    standardDepth: 350,
    standardWidths: [300, 400, 450, 500, 600, 800, 900],
    minWidth: 150,
    maxWidth: 900,
  },
  {
    type: "tall",
    labelAr: "وحدة طويلة",
    labelEn: "Tall Cabinet",
    standardHeight: 2100,
    standardDepth: 600,
    standardWidths: [450, 500, 600, 800, 900],
    minWidth: 300,
    maxWidth: 900,
  },
];

export interface WardrobeStandards {
  type: WardrobeType;
  labelAr: string;
  labelEn: string;
  standardDepth: number;
  standardShelfSpacing: number;
  hangingRailHeight: number;
  doubleHangingRailHeight: number;
  minWidth: number;
  maxWidth: number;
}

export const WARDROBE_STANDARDS: WardrobeStandards[] = [
  {
    type: "hinged",
    labelAr: "خزانة بأبواب مفصلية",
    labelEn: "Hinged Door Wardrobe",
    standardDepth: 600,
    standardShelfSpacing: 350,
    hangingRailHeight: 1600,
    doubleHangingRailHeight: 900,
    minWidth: 600,
    maxWidth: 3600,
  },
  {
    type: "sliding",
    labelAr: "خزانة بأبواب منزلقة",
    labelEn: "Sliding Door Wardrobe",
    standardDepth: 600,
    standardShelfSpacing: 350,
    hangingRailHeight: 1600,
    doubleHangingRailHeight: 900,
    minWidth: 1200,
    maxWidth: 4000,
  },
  {
    type: "walkin",
    labelAr: "غرفة ملابس",
    labelEn: "Walk-in Closet",
    standardDepth: 600,
    standardShelfSpacing: 350,
    hangingRailHeight: 1600,
    doubleHangingRailHeight: 900,
    minWidth: 1500,
    maxWidth: 6000,
  },
];

export interface DoorStandard {
  widthMm: number;
  labelAr: string;
  labelEn: string;
}

export const DOOR_STANDARD_WIDTHS: DoorStandard[] = [
  { widthMm: 700, labelAr: "70 سم", labelEn: "70cm" },
  { widthMm: 800, labelAr: "80 سم", labelEn: "80cm" },
  { widthMm: 900, labelAr: "90 سم", labelEn: "90cm" },
  { widthMm: 1000, labelAr: "100 سم", labelEn: "100cm" },
];

export const DOOR_STANDARDS = {
  standardHeight: 2100,
  frameWidth: 100,
  frameDepth: 40,
  hingeClearance: 3,
  lockClearance: 5,
  bottomGap: 10,
  topGap: 3,
};

export interface ManufacturingDimension {
  labelAr: string;
  labelEn: string;
  designMm: number;
  manufacturingMm: number;
  deductions: string[];
}

export interface KitchenUnitSpec {
  id: string;
  cabinetType: CabinetType;
  designWidth: number;
  designHeight: number;
  designDepth: number;
  material: WoodMaterial;
  panelThickness: number;
  hasDoor: boolean;
  hasDrawer: boolean;
  drawerCount: number;
  doorType?: string;
  countertopMaterial?: string;
}

export interface WardrobeUnitSpec {
  id: string;
  wardrobeType: WardrobeType;
  designWidth: number;
  designHeight: number;
  designDepth: number;
  material: WoodMaterial;
  panelThickness: number;
  shelfCount: number;
  hasHangingRail: boolean;
  hasDoubleHanging: boolean;
  doorCount: number;
}

export type DoorPattern = "plain" | "classic_raised" | "shaker" | "cathedral" | "geometric" | "islamic_arch" | "modern_lines" | "french" | "louver" | "glass_insert";

export interface DoorPatternInfo {
  value: DoorPattern;
  labelAr: string;
  labelEn: string;
  descAr: string;
  descEn: string;
}

export const DOOR_PATTERNS: DoorPatternInfo[] = [
  { value: "plain", labelAr: "سادة", labelEn: "Plain", descAr: "سطح أملس بدون نقش", descEn: "Smooth flat surface" },
  { value: "classic_raised", labelAr: "كلاسيك بارز", labelEn: "Classic Raised", descAr: "لوحة بارزة وسط إطار", descEn: "Raised center panel with frame" },
  { value: "shaker", labelAr: "شيكر", labelEn: "Shaker", descAr: "إطار بسيط مع لوحة مسطحة", descEn: "Simple frame with flat panel" },
  { value: "cathedral", labelAr: "قوس كاتدرائي", labelEn: "Cathedral", descAr: "قوس علوي كلاسيكي", descEn: "Arched top classic design" },
  { value: "geometric", labelAr: "هندسي", labelEn: "Geometric", descAr: "أشكال هندسية منقوشة", descEn: "Geometric carved patterns" },
  { value: "islamic_arch", labelAr: "قوس إسلامي", labelEn: "Islamic Arch", descAr: "قوس مغربي أو إسلامي تقليدي", descEn: "Traditional Moorish/Islamic arch" },
  { value: "modern_lines", labelAr: "خطوط عصرية", labelEn: "Modern Lines", descAr: "خطوط أفقية أو عمودية حديثة", descEn: "Modern horizontal/vertical lines" },
  { value: "french", labelAr: "فرنسي", labelEn: "French", descAr: "نقش فرنسي كلاسيكي متعدد اللوحات", descEn: "Classic French multi-panel design" },
  { value: "louver", labelAr: "لوفر (شرائح)", labelEn: "Louver", descAr: "شرائح أفقية للتهوية", descEn: "Horizontal slats for ventilation" },
  { value: "glass_insert", labelAr: "مع زجاج", labelEn: "Glass Insert", descAr: "فتحة زجاجية وسط الباب", descEn: "Glass panel insert in center" },
];

export interface DoorSpec {
  id: string;
  designWidth: number;
  designHeight: number;
  material: WoodMaterial;
  panelThickness: number;
  frameWidth: number;
  isDouble: boolean;
  pattern: DoorPattern;
}

export interface DecorationSpec {
  id: string;
  designWidth: number;
  designHeight: number;
  designDepth: number;
  material: WoodMaterial;
  panelThickness: number;
  description: string;
}

export function getPanelThickness(material: WoodMaterial): number {
  const panel = PANEL_THICKNESSES.find((p) => p.material === material);
  return panel ? panel.thickness : 18;
}

export function calculateKitchenManufacturingDimensions(
  spec: KitchenUnitSpec
): ManufacturingDimension[] {
  const t = spec.panelThickness;
  const eb = EDGE_BANDING_THICKNESS;
  const results: ManufacturingDimension[] = [];

  const internalWidth = spec.designWidth - 2 * t;
  results.push({
    labelAr: "عرض داخلي للكابينة",
    labelEn: "Cabinet Internal Width",
    designMm: spec.designWidth,
    manufacturingMm: internalWidth,
    deductions: [`-${t}mm x2 (side panels)`],
  });

  const internalDepth = spec.designDepth - t - eb;
  results.push({
    labelAr: "عمق داخلي",
    labelEn: "Internal Depth",
    designMm: spec.designDepth,
    manufacturingMm: internalDepth,
    deductions: [`-${t}mm (back panel)`, `-${eb}mm (edge banding)`],
  });

  const shelfWidth = internalWidth - 2 * eb;
  results.push({
    labelAr: "عرض الرف",
    labelEn: "Shelf Width",
    designMm: spec.designWidth,
    manufacturingMm: shelfWidth,
    deductions: [`-${t}mm x2 (sides)`, `-${eb}mm x2 (edge banding)`],
  });

  const shelfDepth = internalDepth - eb;
  results.push({
    labelAr: "عمق الرف",
    labelEn: "Shelf Depth",
    designMm: spec.designDepth,
    manufacturingMm: shelfDepth,
    deductions: [`-${t}mm (back)`, `-${eb}mm x2 (edge banding)`],
  });

  if (spec.hasDrawer) {
    const drawerWidth = internalWidth - 2 * DRAWER_RUNNER_CLEARANCE - DOOR_HINGE_CLEARANCE;
    results.push({
      labelAr: "عرض الدرج التصنيعي",
      labelEn: "Drawer Manufacturing Width",
      designMm: spec.designWidth,
      manufacturingMm: drawerWidth,
      deductions: [
        `-${t}mm x2 (sides)`,
        `-${DRAWER_RUNNER_CLEARANCE}mm x2 (runner clearance)`,
        `-${DOOR_HINGE_CLEARANCE}mm (fitting clearance)`,
      ],
    });
  }

  if (spec.hasDoor) {
    const doorWidth = spec.designWidth - DOOR_HINGE_CLEARANCE;
    const doorHeight = spec.designHeight - DOOR_HINGE_CLEARANCE;
    results.push({
      labelAr: "عرض الباب",
      labelEn: "Door Width",
      designMm: spec.designWidth,
      manufacturingMm: doorWidth,
      deductions: [`-${DOOR_HINGE_CLEARANCE}mm (hinge clearance)`],
    });
    results.push({
      labelAr: "ارتفاع الباب",
      labelEn: "Door Height",
      designMm: spec.designHeight,
      manufacturingMm: doorHeight,
      deductions: [`-${DOOR_HINGE_CLEARANCE}mm (clearance)`],
    });
  }

  const sidePanel = { width: spec.designDepth - eb, height: spec.designHeight };
  results.push({
    labelAr: "عرض اللوح الجانبي",
    labelEn: "Side Panel Width",
    designMm: spec.designDepth,
    manufacturingMm: sidePanel.width,
    deductions: [`-${eb}mm (edge banding)`],
  });

  const topBottomWidth = internalWidth;
  results.push({
    labelAr: "عرض اللوح العلوي/السفلي",
    labelEn: "Top/Bottom Panel Width",
    designMm: spec.designWidth,
    manufacturingMm: topBottomWidth,
    deductions: [`-${t}mm x2 (side panels)`],
  });

  return results;
}

export function calculateWardrobeManufacturingDimensions(
  spec: WardrobeUnitSpec
): ManufacturingDimension[] {
  const t = spec.panelThickness;
  const eb = EDGE_BANDING_THICKNESS;
  const results: ManufacturingDimension[] = [];

  const internalWidth = spec.designWidth - 2 * t;
  results.push({
    labelAr: "عرض داخلي",
    labelEn: "Internal Width",
    designMm: spec.designWidth,
    manufacturingMm: internalWidth,
    deductions: [`-${t}mm x2 (side panels)`],
  });

  const internalDepth = spec.designDepth - t - eb;
  results.push({
    labelAr: "عمق داخلي",
    labelEn: "Internal Depth",
    designMm: spec.designDepth,
    manufacturingMm: internalDepth,
    deductions: [`-${t}mm (back panel)`, `-${eb}mm (edge banding)`],
  });

  const shelfWidth = internalWidth - 2 * eb;
  results.push({
    labelAr: "عرض الرف",
    labelEn: "Shelf Width",
    designMm: spec.designWidth,
    manufacturingMm: shelfWidth,
    deductions: [`-${t}mm x2 (sides)`, `-${eb}mm x2 (edge banding)`],
  });

  if (spec.hasHangingRail) {
    const railWidth = internalWidth - 20;
    results.push({
      labelAr: "طول قضيب التعليق",
      labelEn: "Hanging Rail Length",
      designMm: spec.designWidth,
      manufacturingMm: railWidth,
      deductions: [`-${t}mm x2 (sides)`, `-20mm (bracket clearance)`],
    });
  }

  if (spec.wardrobeType === "sliding") {
    const doorWidth = Math.ceil(spec.designWidth / spec.doorCount) + 30;
    results.push({
      labelAr: "عرض باب منزلق",
      labelEn: "Sliding Door Width",
      designMm: spec.designWidth,
      manufacturingMm: doorWidth,
      deductions: [`÷${spec.doorCount} doors`, `+30mm (overlap)`],
    });

    const doorHeight = spec.designHeight - SLIDING_TRACK_CLEARANCE;
    results.push({
      labelAr: "ارتفاع باب منزلق",
      labelEn: "Sliding Door Height",
      designMm: spec.designHeight,
      manufacturingMm: doorHeight,
      deductions: [`-${SLIDING_TRACK_CLEARANCE}mm (track clearance)`],
    });
  } else if (spec.wardrobeType === "hinged") {
    const singleDoorWidth =
      Math.ceil(spec.designWidth / spec.doorCount) - DOOR_HINGE_CLEARANCE;
    results.push({
      labelAr: "عرض باب مفصلي",
      labelEn: "Hinged Door Width",
      designMm: spec.designWidth,
      manufacturingMm: singleDoorWidth,
      deductions: [`÷${spec.doorCount} doors`, `-${DOOR_HINGE_CLEARANCE}mm (clearance)`],
    });
  }

  const sidePanel = { width: spec.designDepth - eb, height: spec.designHeight };
  results.push({
    labelAr: "عرض اللوح الجانبي",
    labelEn: "Side Panel Width",
    designMm: spec.designDepth,
    manufacturingMm: sidePanel.width,
    deductions: [`-${eb}mm (edge banding)`],
  });

  return results;
}

export function calculateDoorManufacturingDimensions(
  spec: DoorSpec
): ManufacturingDimension[] {
  const results: ManufacturingDimension[] = [];
  const ds = DOOR_STANDARDS;

  const leafWidth = spec.isDouble
    ? Math.ceil(spec.designWidth / 2) - ds.hingeClearance
    : spec.designWidth - ds.hingeClearance - ds.lockClearance;

  results.push({
    labelAr: spec.isDouble ? "عرض ورقة الباب (واحدة)" : "عرض ورقة الباب",
    labelEn: spec.isDouble ? "Door Leaf Width (single)" : "Door Leaf Width",
    designMm: spec.designWidth,
    manufacturingMm: leafWidth,
    deductions: spec.isDouble
      ? [`÷2`, `-${ds.hingeClearance}mm (hinge clearance)`]
      : [`-${ds.hingeClearance}mm (hinge)`, `-${ds.lockClearance}mm (lock side)`],
  });

  const leafHeight = spec.designHeight - ds.bottomGap - ds.topGap;
  results.push({
    labelAr: "ارتفاع ورقة الباب",
    labelEn: "Door Leaf Height",
    designMm: spec.designHeight,
    manufacturingMm: leafHeight,
    deductions: [`-${ds.bottomGap}mm (bottom gap)`, `-${ds.topGap}mm (top gap)`],
  });

  const frameInternalWidth = spec.designWidth - 2 * ds.frameWidth;
  results.push({
    labelAr: "عرض فتحة الإطار الداخلي",
    labelEn: "Frame Internal Opening Width",
    designMm: spec.designWidth,
    manufacturingMm: frameInternalWidth,
    deductions: [`-${ds.frameWidth}mm x2 (frame sides)`],
  });

  const frameInternalHeight = spec.designHeight - 2 * ds.frameWidth;
  results.push({
    labelAr: "ارتفاع فتحة الإطار الداخلي",
    labelEn: "Frame Internal Opening Height",
    designMm: spec.designHeight,
    manufacturingMm: frameInternalHeight,
    deductions: [`-${ds.frameWidth}mm x2 (frame top/bottom)`],
  });

  return results;
}

export function calculateDecorationManufacturingDimensions(
  spec: DecorationSpec
): ManufacturingDimension[] {
  const t = spec.panelThickness;
  const eb = EDGE_BANDING_THICKNESS;
  const results: ManufacturingDimension[] = [];

  const internalWidth = spec.designWidth - 2 * t;
  results.push({
    labelAr: "عرض داخلي",
    labelEn: "Internal Width",
    designMm: spec.designWidth,
    manufacturingMm: internalWidth,
    deductions: [`-${t}mm x2 (side panels)`],
  });

  const internalHeight = spec.designHeight - 2 * t;
  results.push({
    labelAr: "ارتفاع داخلي",
    labelEn: "Internal Height",
    designMm: spec.designHeight,
    manufacturingMm: internalHeight,
    deductions: [`-${t}mm x2 (top/bottom panels)`],
  });

  if (spec.designDepth > 0) {
    const internalDepth = spec.designDepth - t - eb;
    results.push({
      labelAr: "عمق داخلي",
      labelEn: "Internal Depth",
      designMm: spec.designDepth,
      manufacturingMm: internalDepth,
      deductions: [`-${t}mm (back panel)`, `-${eb}mm (edge banding)`],
    });
  }

  const shelfWidth = internalWidth - 2 * eb;
  results.push({
    labelAr: "عرض الرف",
    labelEn: "Shelf Width",
    designMm: spec.designWidth,
    manufacturingMm: shelfWidth,
    deductions: [`-${t}mm x2 (sides)`, `-${eb}mm x2 (edge banding)`],
  });

  return results;
}

export function calculateManufacturingDimensions(
  category: ProductCategory,
  spec: KitchenUnitSpec | WardrobeUnitSpec | DoorSpec | DecorationSpec
): ManufacturingDimension[] {
  switch (category) {
    case "kitchen":
      return calculateKitchenManufacturingDimensions(spec as KitchenUnitSpec);
    case "wardrobe":
      return calculateWardrobeManufacturingDimensions(spec as WardrobeUnitSpec);
    case "door":
      return calculateDoorManufacturingDimensions(spec as DoorSpec);
    case "decoration":
      return calculateDecorationManufacturingDimensions(spec as DecorationSpec);
    default:
      return [];
  }
}

export function getDefaultKitchenUnit(cabinetType: CabinetType): KitchenUnitSpec {
  const standards = KITCHEN_CABINET_STANDARDS.find((s) => s.type === cabinetType)!;
  return {
    id: crypto.randomUUID(),
    cabinetType,
    designWidth: 600,
    designHeight: standards.standardHeight,
    designDepth: standards.standardDepth,
    material: "chipboard",
    panelThickness: 18,
    hasDoor: true,
    hasDrawer: cabinetType === "base",
    drawerCount: cabinetType === "base" ? 1 : 0,
  };
}

export function getDefaultWardrobeUnit(wardrobeType: WardrobeType): WardrobeUnitSpec {
  const standards = WARDROBE_STANDARDS.find((s) => s.type === wardrobeType)!;
  return {
    id: crypto.randomUUID(),
    wardrobeType,
    designWidth: wardrobeType === "sliding" ? 2400 : 1200,
    designHeight: 2400,
    designDepth: standards.standardDepth,
    material: "chipboard",
    panelThickness: 18,
    shelfCount: 4,
    hasHangingRail: true,
    hasDoubleHanging: false,
    doorCount: wardrobeType === "sliding" ? 3 : 2,
  };
}

export function getDefaultDoorSpec(): DoorSpec {
  return {
    id: crypto.randomUUID(),
    designWidth: 800,
    designHeight: DOOR_STANDARDS.standardHeight,
    material: "mdf",
    panelThickness: 18,
    frameWidth: DOOR_STANDARDS.frameWidth,
    isDouble: false,
    pattern: "classic_raised",
  };
}

export function getDefaultDecorationSpec(): DecorationSpec {
  return {
    id: crypto.randomUUID(),
    designWidth: 1200,
    designHeight: 2400,
    designDepth: 300,
    material: "chipboard",
    panelThickness: 18,
    description: "",
  };
}

export interface CountertopMaterial {
  id: string;
  nameAr: string;
  nameEn: string;
  pricePerSqm: number;
}

export const COUNTERTOP_MATERIALS: CountertopMaterial[] = [
  { id: "granite", nameAr: "جرانيت", nameEn: "Granite", pricePerSqm: 450 },
  { id: "marble", nameAr: "رخام", nameEn: "Marble", pricePerSqm: 600 },
  { id: "quartz", nameAr: "كوارتز", nameEn: "Quartz", pricePerSqm: 550 },
  { id: "corian", nameAr: "كوريان", nameEn: "Corian", pricePerSqm: 700 },
  { id: "hpl_top", nameAr: "HPL", nameEn: "HPL Laminate", pricePerSqm: 200 },
];

export const MATERIAL_COLORS: Record<WoodMaterial, string> = {
  chipboard: "#c4a882",
  mdf: "#f5f0e8",
  solid_beech: "#d4a960",
  solid_oak: "#b5834a",
  hpl: "#e8e0d0",
  pvc: "#ffffff",
};

export function formatMm(mm: number): string {
  if (mm >= 10) {
    return `${(mm / 10).toFixed(1)} سم`;
  }
  return `${mm} مم`;
}

export function formatMmEn(mm: number): string {
  if (mm >= 10) {
    return `${(mm / 10).toFixed(1)} cm`;
  }
  return `${mm} mm`;
}
