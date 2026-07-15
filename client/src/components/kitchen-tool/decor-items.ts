/**
 * Decor catalog for the kitchen 3D tool: appliances, furniture, plants and
 * wall details, loaded from glTF assets under /kitchen-tool-assets/.
 *
 * Models come in wildly different native units/origins, so each item only
 * declares its TARGET real-world size (meters). The scene normalizes the
 * loaded model at runtime: uniform-scales it to `height`, centers it on X/Z
 * and rests its bottom on y=0.
 */

export type DecorCategory = "appliance" | "furniture" | "plant" | "detail";
export type DecorPlacement = "wall" | "floor";

export interface DecorItem {
  id: string;
  nameAr: string;
  nameEn: string;
  category: DecorCategory;
  /** Path (public URL) to the .gltf file. */
  modelPath: string;
  /** Target footprint/height in meters (after normalization). */
  width: number;
  depth: number;
  height: number;
  /** Wall items snap to a wall; floor items move freely in the room. */
  placement: DecorPlacement;
  /** Default height of the item's bottom above the floor (wall items). */
  defaultMountY?: number;
  /** Render only this named node from the glTF scene (multi-item packs). */
  nodeName?: string;
  /** Extra Y rotation (radians) to make the model's front face the room. */
  rotYOffset?: number;
  /** Wall items: draw a gypsum soffit box above the item (like upper cabinets). */
  soffit?: boolean;
}

const BASE = "/kitchen-tool-assets";

export const DECOR_ITEMS: DecorItem[] = [
  // ── Appliances ───────────────────────────────────────────
  {
    id: "decor-oven-built-in",
    nameAr: "فرن مدمج",
    nameEn: "Built-in Oven",
    category: "appliance",
    modelPath: `${BASE}/appliances/built-in_oven_-_electrolux/scene.gltf`,
    width: 0.6,
    depth: 0.58,
    height: 0.6,
    placement: "wall",
    defaultMountY: 0.6,
    rotYOffset: Math.PI,
  },
  {
    id: "decor-fridge-modern-a",
    nameAr: "ثلاجة عصرية",
    nameEn: "Modern Fridge",
    category: "appliance",
    modelPath: `${BASE}/appliances/fridge_-_modern_furniture_game-ready/scene.gltf`,
    width: 0.88,
    depth: 0.86,
    height: 1.9,
    placement: "wall",
    rotYOffset: Math.PI,
  },
  {
    id: "decor-fridge-modern-b",
    nameAr: "ثلاجة بابين",
    nameEn: "Two-door Fridge",
    category: "appliance",
    modelPath: `${BASE}/appliances/modern_fridge/scene.gltf`,
    width: 0.77,
    depth: 0.85,
    height: 1.94,
    placement: "wall",
    rotYOffset: Math.PI,
  },
  {
    id: "decor-range-hood",
    nameAr: "شفاط مطبخ",
    nameEn: "Range Hood",
    category: "appliance",
    modelPath: `${BASE}/appliances/range_hood_kitchen_hood/scene.gltf`,
    width: 0.76,
    depth: 0.5,
    height: 0.76,
    placement: "wall",
    defaultMountY: 1.45,
    soffit: true,
  },
  // ── Furniture ────────────────────────────────────────────
  {
    id: "decor-sideboard",
    nameAr: "بوفيه مطبخ",
    nameEn: "Kitchen Sideboard",
    category: "furniture",
    modelPath: `${BASE}/furniture/sideboard_kitchen/scene.gltf`,
    width: 1.71,
    depth: 0.59,
    height: 0.98,
    placement: "floor",
  },
  {
    id: "decor-modular-storage",
    nameAr: "وحدة تخزين عصرية",
    nameEn: "Modular Storage Unit",
    category: "furniture",
    modelPath: `${BASE}/furniture/streamline_modular_kitchen_storage/scene.gltf`,
    width: 2.26,
    depth: 3.0,
    height: 2.2,
    placement: "floor",
  },
  // ── Plants ───────────────────────────────────────────────
  {
    id: "decor-plant-bamboo",
    nameAr: "بامبو مع أصيص",
    nameEn: "Bamboo with Pot",
    category: "plant",
    modelPath: `${BASE}/plants/bamboo_with_plant_pot/scene.gltf`,
    width: 0.9,
    depth: 0.8,
    height: 1.6,
    placement: "floor",
  },
  {
    id: "decor-plant-monstera",
    nameAr: "مونستيرا",
    nameEn: "Monstera Plant",
    category: "plant",
    modelPath: `${BASE}/plants/monstera_deliciosa_potted_mid-century_plant/scene.gltf`,
    width: 0.87,
    depth: 0.79,
    height: 1.36,
    placement: "floor",
  },
  {
    id: "decor-plant-potted",
    nameAr: "نبتة أصيص",
    nameEn: "Potted Plant",
    category: "plant",
    modelPath: `${BASE}/plants/potted_plant/scene.gltf`,
    width: 0.71,
    depth: 0.71,
    height: 0.9,
    placement: "floor",
  },
  {
    id: "decor-plant-potted-01",
    nameAr: "نبتة داخلية طويلة",
    nameEn: "Tall Indoor Plant",
    category: "plant",
    modelPath: `${BASE}/plants/potted_plant_01_4k.gltf/potted_plant_01_4k.gltf`,
    width: 0.59,
    depth: 0.63,
    height: 1.35,
    placement: "floor",
  },
  {
    id: "decor-plant-potted-02",
    nameAr: "نبتة داخلية صغيرة",
    nameEn: "Small Indoor Plant",
    category: "plant",
    modelPath: `${BASE}/plants/potted_plant_02_4k.gltf/potted_plant_02_4k.gltf`,
    width: 0.7,
    depth: 0.66,
    height: 0.84,
    placement: "floor",
  },
  // ── Wall details ─────────────────────────────────────────
  {
    id: "decor-wall-outlet",
    nameAr: "فيش كهرباء",
    nameEn: "Wall Outlet",
    category: "detail",
    modelPath: `${BASE}/details/free_wall_outlets_and_switches_pack/scene.gltf`,
    nodeName: "Wall outlet.007",
    width: 0.09,
    depth: 0.03,
    height: 0.09,
    placement: "wall",
    defaultMountY: 0.3,
  },
  {
    id: "decor-light-switch",
    nameAr: "مفتاح إنارة",
    nameEn: "Light Switch",
    category: "detail",
    modelPath: `${BASE}/details/free_wall_outlets_and_switches_pack/scene.gltf`,
    nodeName: "Light switch.003",
    width: 0.09,
    depth: 0.03,
    height: 0.09,
    placement: "wall",
    defaultMountY: 1.1,
  },
];

export function findDecorItem(id: string): DecorItem | undefined {
  return DECOR_ITEMS.find((d) => d.id === id);
}

export const DECOR_CATEGORY_LABELS: Record<DecorCategory, { ar: string; en: string }> = {
  appliance: { ar: "أجهزة", en: "Appliances" },
  furniture: { ar: "أثاث", en: "Furniture" },
  plant: { ar: "نباتات", en: "Plants" },
  detail: { ar: "تفاصيل", en: "Details" },
};
