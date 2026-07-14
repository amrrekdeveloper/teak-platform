/** Material options for the 3D studio — floors & walls the customer can switch. */

const ASSETS = "/kitchen-tool-assets";

export interface PbrMaps {
  map: string;
  normalMap?: string;
  roughnessMap?: string;
  /** Combined AO/Roughness/Metalness map (Poly Haven "arm"). */
  armMap?: string;
}

export interface MaterialOption {
  id: string;
  nameAr: string;
  nameEn: string;
  /** Small preview image for the swatch button (PBR materials). */
  thumb?: string;
  /** Swatch color for paint options, also used as tint for PBR. */
  color?: string;
  /** PBR texture maps — when absent the option is a plain paint color. */
  maps?: PbrMaps;
  /** Roughness for paint options. */
  roughness?: number;
  /** Real-world meters one texture repeat spans (defaults to 1). */
  tileSizeM?: number;
}

export const FLOOR_OPTIONS: MaterialOption[] = [
  {
    id: "laminate",
    nameAr: "لاميناي فاتح",
    nameEn: "Light Laminate",
    thumb: `${ASSETS}/thumbs/floor-laminate.jpg`,
    maps: {
      map: `${ASSETS}/floor/textures/laminate_floor_02_diff_2k.jpg`,
      normalMap: `${ASSETS}/floor/textures/laminate_floor_02_nor_gl_2k.jpg`,
      roughnessMap: `${ASSETS}/floor/textures/laminate_floor_02_rough_2k.jpg`,
    },
  },
  {
    id: "tile-beige",
    nameAr: "بلاط بيج فاخر",
    nameEn: "Luxury Beige Tile",
    thumb: `${ASSETS}/thumbs/floor-tile-beige.jpg`,
    tileSizeM: 1.9,
    maps: {
      map: `${ASSETS}/floor-tile-beige/textures/interior_tiles_diff_2k.jpg`,
      normalMap: `${ASSETS}/floor-tile-beige/textures/interior_tiles_nor_gl_2k.jpg`,
      armMap: `${ASSETS}/floor-tile-beige/textures/interior_tiles_arm_2k.jpg`,
    },
  },
  {
    id: "marble-white",
    nameAr: "رخام أبيض فاخر",
    nameEn: "Luxury White Marble",
    thumb: `${ASSETS}/thumbs/floor-marble-white.jpg`,
    tileSizeM: 1.6,
    maps: {
      map: `${ASSETS}/floor-marble-white/textures/marble_01_diff_2k.jpg`,
      normalMap: `${ASSETS}/floor-marble-white/textures/marble_01_nor_gl_2k.jpg`,
      armMap: `${ASSETS}/floor-marble-white/textures/marble_01_arm_2k.jpg`,
    },
  },
  {
    id: "cartago-grey",
    nameAr: "بلاط رمادي فاتح",
    nameEn: "Light Grey Tile",
    thumb: `${ASSETS}/thumbs/floor-cartago-grey.jpg`,
    tileSizeM: 1.6,
    maps: {
      map: `${ASSETS}/floor-cartago-grey/textures/grey_cartago_01_diff_2k.jpg`,
      normalMap: `${ASSETS}/floor-cartago-grey/textures/grey_cartago_01_nor_gl_2k.jpg`,
      armMap: `${ASSETS}/floor-cartago-grey/textures/grey_cartago_01_arm_2k.jpg`,
    },
  },
  {
    id: "granite-dark",
    nameAr: "غرانيت رمادي غامق",
    nameEn: "Dark Grey Granite",
    thumb: `${ASSETS}/thumbs/floor-granite-dark.jpg`,
    tileSizeM: 1.3,
    maps: {
      map: `${ASSETS}/floor-granite-dark/textures/granite_tile_diff_2k.jpg`,
      normalMap: `${ASSETS}/floor-granite-dark/textures/granite_tile_nor_gl_2k.jpg`,
      armMap: `${ASSETS}/floor-granite-dark/textures/granite_tile_arm_2k.jpg`,
    },
  },
];

export const WALL_OPTIONS: MaterialOption[] = [
  {
    id: "plaster",
    nameAr: "جص مطلي",
    nameEn: "Painted Plaster",
    thumb: `${ASSETS}/thumbs/wall-plaster.jpg`,
    color: "#f5f2ec",
    maps: {
      map: `${ASSETS}/wall/textures/painted_plaster_wall_diff_2k.jpg`,
      normalMap: `${ASSETS}/wall/textures/painted_plaster_wall_nor_gl_2k.jpg`,
      armMap: `${ASSETS}/wall/textures/painted_plaster_wall_arm_2k.jpg`,
    },
  },
  {
    id: "cladding",
    nameAr: "ألواح بيضاء",
    nameEn: "White Cladding",
    thumb: `${ASSETS}/thumbs/wall-cladding.jpg`,
    color: "#ffffff",
    maps: {
      map: `${ASSETS}/wall-cladding/textures/exterior_wall_cladding_03_diff_2k.jpg`,
      normalMap: `${ASSETS}/wall-cladding/textures/exterior_wall_cladding_03_nor_gl_2k.jpg`,
      armMap: `${ASSETS}/wall-cladding/textures/exterior_wall_cladding_03_arm_2k.jpg`,
    },
  },
  {
    id: "paint-white",
    nameAr: "أبيض",
    nameEn: "White",
    color: "#f8f6f1",
    roughness: 0.85,
  },
  {
    id: "paint-beige",
    nameAr: "بيج دافئ",
    nameEn: "Warm Beige",
    color: "#e9dfcd",
    roughness: 0.85,
  },
  {
    id: "paint-gray",
    nameAr: "رمادي فاتح",
    nameEn: "Light Gray",
    color: "#dbdad5",
    roughness: 0.85,
  },
  {
    id: "wall-marble-white",
    nameAr: "رخام أبيض فاخر",
    nameEn: "Luxury White Marble",
    thumb: `${ASSETS}/thumbs/floor-marble-white.jpg`,
    tileSizeM: 1.6,
    maps: {
      map: `${ASSETS}/floor-marble-white/textures/marble_01_diff_2k.jpg`,
      normalMap: `${ASSETS}/floor-marble-white/textures/marble_01_nor_gl_2k.jpg`,
      armMap: `${ASSETS}/floor-marble-white/textures/marble_01_arm_2k.jpg`,
    },
  },
  {
    id: "wall-granite-dark",
    nameAr: "غرانيت رمادي غامق",
    nameEn: "Dark Grey Granite",
    thumb: `${ASSETS}/thumbs/floor-granite-dark.jpg`,
    tileSizeM: 1.3,
    maps: {
      map: `${ASSETS}/floor-granite-dark/textures/granite_tile_diff_2k.jpg`,
      normalMap: `${ASSETS}/floor-granite-dark/textures/granite_tile_nor_gl_2k.jpg`,
      armMap: `${ASSETS}/floor-granite-dark/textures/granite_tile_arm_2k.jpg`,
    },
  },
];

export interface EnvironmentOption {
  id: string;
  nameAr: string;
  nameEn: string;
  file: string;
}

export const ENVIRONMENT_OPTIONS: EnvironmentOption[] = [
  {
    id: "provence_studio",
    nameAr: "استوديو بروفانس",
    nameEn: "Provence Studio",
    file: `${ASSETS}/hdri/provence_studio_2k.hdr`,
  },
  {
    id: "photo_studio_01",
    nameAr: "استوديو تصوير 1",
    nameEn: "Photo Studio 01",
    file: `${ASSETS}/hdri/photo_studio_01_2k.hdr`,
  },
  {
    id: "brown_photostudio_02",
    nameAr: "استوديو دافئ",
    nameEn: "Warm Studio",
    file: `${ASSETS}/hdri/brown_photostudio_02_2k.hdr`,
  },
  {
    id: "studio_small_03",
    nameAr: "استوديو تباين عالي",
    nameEn: "High Contrast Studio",
    file: `${ASSETS}/hdri/studio_small_03_2k.hdr`,
  },
];

export const DEFAULT_ENVIRONMENT_ID = "provence_studio";

export function findEnvironmentOption(id: string | undefined | null): EnvironmentOption {
  return ENVIRONMENT_OPTIONS.find((o) => o.id === id) ?? ENVIRONMENT_OPTIONS[0];
}

/** Ceiling paint options — flat matte gypsum colors, no PBR maps. */
export const CEILING_OPTIONS: MaterialOption[] = [
  { id: "white", nameAr: "أبيض", nameEn: "White", color: "#f9f8f5", roughness: 0.92 },
  { id: "warm-white", nameAr: "أبيض دافئ", nameEn: "Warm White", color: "#f5f0e6", roughness: 0.92 },
  { id: "beige-light", nameAr: "بيج فاتح", nameEn: "Light Beige", color: "#ece5d8", roughness: 0.92 },
  { id: "navy-matte", nameAr: "رمادي غامق مطفي", nameEn: "Matte Dark Grey", color: "#4e4e4f", roughness: 0.95 },
];

export const DEFAULT_FLOOR_ID = "laminate";
export const DEFAULT_WALL_ID = "plaster";
export const DEFAULT_CEILING_ID = "white";

export function findFloorOption(id: string | undefined | null): MaterialOption {
  return FLOOR_OPTIONS.find((o) => o.id === id) ?? FLOOR_OPTIONS[0];
}

export function findWallOption(id: string | undefined | null): MaterialOption {
  return WALL_OPTIONS.find((o) => o.id === id) ?? WALL_OPTIONS[0];
}

export function findCeilingOption(id: string | undefined | null): MaterialOption {
  return CEILING_OPTIONS.find((o) => o.id === id) ?? CEILING_OPTIONS[0];
}

/* ── Adeko cabinet finishes (mapped from factory wood_types) ── */

/** How a factory wood type renders in 3D on the parametric Adeko cabinet. */
export interface AdekoFinish {
  id: string;
  /** Tint color applied on top of the wood texture (or the flat color). */
  tint: string;
  /** Use the oak veneer PBR texture set (true) or a flat painted finish. */
  wood: boolean;
  /** Roughness for flat (non-wood) finishes. */
  roughness?: number;
}

const ADEKO_FINISHES: Record<string, AdekoFinish> = {
  chipboard: { id: "chipboard", tint: "#d9c9a8", wood: true },
  "mr-chipboard": { id: "mr-chipboard", tint: "#cdd6c8", wood: true },
  mdf: { id: "mdf", tint: "#f1ede4", wood: false, roughness: 0.6 },
  beech: { id: "beech", tint: "#e2b586", wood: true },
  oak: { id: "oak", tint: "#ffffff", wood: true },
  hpl: { id: "hpl", tint: "#b7babe", wood: false, roughness: 0.28 },
  pvc: { id: "pvc", tint: "#f7f6f2", wood: false, roughness: 0.22 },
};

export const DEFAULT_ADEKO_FINISH: AdekoFinish = ADEKO_FINISHES.oak;

/** Map a factory wood type (by name) to a realistic 3D finish. */
export function adekoFinishForWoodType(nameAr: string, nameEn: string): AdekoFinish {
  const en = (nameEn || "").toLowerCase();
  const ar = nameAr || "";
  if (en.includes("moisture") || en.includes("mr") || ar.includes("رطوب"))
    return ADEKO_FINISHES["mr-chipboard"];
  if (en.includes("chip") || ar.includes("شيبورد")) return ADEKO_FINISHES.chipboard;
  if (en.includes("mdf") || ar.includes("MDF")) return ADEKO_FINISHES.mdf;
  if (en.includes("beech") || ar.includes("زان")) return ADEKO_FINISHES.beech;
  if (en.includes("oak") || ar.includes("بلوط")) return ADEKO_FINISHES.oak;
  if (en.includes("hpl") || ar.includes("HPL")) return ADEKO_FINISHES.hpl;
  if (en.includes("pvc") || ar.includes("PVC")) return ADEKO_FINISHES.pvc;
  return DEFAULT_ADEKO_FINISH;
}

/* ── Adeko cabinet countertop finishes ── */

/** A countertop (worktop) finish option for the parametric Adeko cabinet. */
export interface AdekoTopFinish {
  id: string;
  nameAr: string;
  nameEn: string;
  /** Diffuse texture path. */
  map: string;
  /** ARM (AO/roughness/metalness) texture path. */
  armMap: string;
  /** Swatch color for the UI button. */
  swatch: string;
  /** Optional tint applied over the texture. */
  tint?: string;
}

const KT_ASSETS = "/kitchen-tool-assets";

export const ADEKO_TOP_FINISHES: AdekoTopFinish[] = [
  {
    id: "granite-dark",
    nameAr: "جرانيت غامق",
    nameEn: "Dark Granite",
    map: `${KT_ASSETS}/floor-granite-dark/textures/granite_tile_diff_2k.jpg`,
    armMap: `${KT_ASSETS}/floor-granite-dark/textures/granite_tile_arm_2k.jpg`,
    swatch: "#3a3a3c",
  },
  {
    id: "marble-white",
    nameAr: "رخام أبيض",
    nameEn: "White Marble",
    map: `${KT_ASSETS}/floor-marble-white/textures/marble_01_diff_2k.jpg`,
    armMap: `${KT_ASSETS}/floor-marble-white/textures/marble_01_arm_2k.jpg`,
    swatch: "#e9e7e2",
  },
  {
    id: "grey-stone",
    nameAr: "حجر رمادي",
    nameEn: "Grey Stone",
    map: `${KT_ASSETS}/floor-cartago-grey/textures/grey_cartago_01_diff_2k.jpg`,
    armMap: `${KT_ASSETS}/floor-cartago-grey/textures/grey_cartago_01_arm_2k.jpg`,
    swatch: "#9a9b9d",
  },
  {
    id: "beige-tile",
    nameAr: "بيج فاتح",
    nameEn: "Light Beige",
    map: `${KT_ASSETS}/floor-tile-beige/textures/interior_tiles_diff_2k.jpg`,
    armMap: `${KT_ASSETS}/floor-tile-beige/textures/interior_tiles_arm_2k.jpg`,
    swatch: "#d8cbb4",
  },
  {
    id: "oak-wood",
    nameAr: "خشب بلوط",
    nameEn: "Oak Wood",
    map: `${KT_ASSETS}/countertop/textures/oak_veneer_01_diff_2k.jpg`,
    armMap: `${KT_ASSETS}/countertop/textures/oak_veneer_01_arm_2k.jpg`,
    swatch: "#b78a5a",
  },
];

export const DEFAULT_ADEKO_TOP_FINISH = ADEKO_TOP_FINISHES[0];

export function findAdekoTopFinish(id: string | undefined | null): AdekoTopFinish {
  return ADEKO_TOP_FINISHES.find((f) => f.id === id) ?? DEFAULT_ADEKO_TOP_FINISH;
}

export type AdekoHandleStyle = "bar" | "none";
export type AdekoHandleColor = "black" | "white" | "gray";

export const ADEKO_HANDLE_COLORS: Record<AdekoHandleColor, string> = {
  black: "#232427",
  white: "#f2f2ef",
  gray: "#c9ccd1",
};
