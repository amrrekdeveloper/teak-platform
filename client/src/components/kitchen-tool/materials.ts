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
    id: "plank",
    nameAr: "باركيه متداخل",
    nameEn: "Parquet Planks",
    thumb: `${ASSETS}/thumbs/floor-plank.jpg`,
    maps: {
      map: `${ASSETS}/floor-plank/textures/plank_flooring_diff_2k.jpg`,
      normalMap: `${ASSETS}/floor-plank/textures/plank_flooring_nor_gl_2k.jpg`,
      roughnessMap: `${ASSETS}/floor-plank/textures/plank_flooring_rough_2k.jpg`,
    },
  },
  {
    id: "deck",
    nameAr: "خشب داكن",
    nameEn: "Dark Wood Deck",
    thumb: `${ASSETS}/thumbs/floor-deck.jpg`,
    maps: {
      map: `${ASSETS}/floor-deck/textures/wood_floor_deck_diff_2k.jpg`,
      normalMap: `${ASSETS}/floor-deck/textures/wood_floor_deck_nor_gl_2k.jpg`,
      armMap: `${ASSETS}/floor-deck/textures/wood_floor_deck_arm_2k.jpg`,
    },
  },
  {
    id: "worn",
    nameAr: "خشب عتيق",
    nameEn: "Rustic Wood",
    thumb: `${ASSETS}/thumbs/floor-worn.jpg`,
    maps: {
      map: `${ASSETS}/floor-worn/textures/wood_cabinet_worn_long_diff_2k.jpg`,
      normalMap: `${ASSETS}/floor-worn/textures/wood_cabinet_worn_long_nor_gl_2k.jpg`,
      roughnessMap: `${ASSETS}/floor-worn/textures/wood_cabinet_worn_long_rough_2k.jpg`,
    },
  },
  {
    id: "porcelain",
    nameAr: "بورسلان رمادي",
    nameEn: "Gray Porcelain",
    color: "#d7d5d0",
    roughness: 0.18,
  },
  {
    id: "ceramic-beige",
    nameAr: "سيراميك بيج",
    nameEn: "Beige Ceramic",
    color: "#e5dccb",
    roughness: 0.28,
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
    id: "paint-sage",
    nameAr: "أخضر هادئ",
    nameEn: "Soft Sage",
    color: "#ccd6c9",
    roughness: 0.85,
  },
];

export const DEFAULT_FLOOR_ID = "laminate";
export const DEFAULT_WALL_ID = "plaster";

export function findFloorOption(id: string | undefined | null): MaterialOption {
  return FLOOR_OPTIONS.find((o) => o.id === id) ?? FLOOR_OPTIONS[0];
}

export function findWallOption(id: string | undefined | null): MaterialOption {
  return WALL_OPTIONS.find((o) => o.id === id) ?? WALL_OPTIONS[0];
}
