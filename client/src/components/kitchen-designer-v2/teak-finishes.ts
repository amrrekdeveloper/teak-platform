/**
 * Teak real-finish data model (Phase 1A).
 *
 * This is the future-safe catalog of REAL, Teak-approved chipboard finishes
 * (e.g. Saviola samples). It intentionally contains only a single placeholder
 * entry until the user supplies the actual approved sample files (Phase 1B).
 *
 * Independent of Adeko naming and of any door-front geometry (Shaker/slab):
 * a TeakFinish only describes what visible surfaces are coated with.
 */
import type { AdekoFinish } from "./materials";
import { buildAdekoFinish, type AdekoDoorPattern } from "./materials";

/** Surface character of a finish. */
export type TeakGrain = "woodgrain" | "solid";

/** Grain orientation on the front (relevant for woodgrain finishes). */
export type TeakGrainDirection = "vertical" | "horizontal";

/** A real, approved Teak chipboard finish (sample-based). */
export interface TeakFinish {
  /** Stable id, e.g. "teak-1026". Never use "adeko-" prefixes. */
  id: string;
  /** Internal Teak sample code as labeled on the physical sample, e.g. "1026". */
  sampleCode: string;
  nameAr: string;
  nameEn: string;
  /** Manufacturer + commercial reference, e.g. "Saviola — Canyon Noce D18". */
  manufacturerRef?: string;
  /** Board thickness in mm (e.g. 18). */
  thicknessMm?: number;
  /** Moisture-resistant board. */
  moistureResistant?: boolean;
  grain: TeakGrain;
  /** Only meaningful when grain === "woodgrain". */
  grainDirection?: TeakGrainDirection;
  /**
   * Optional PBR texture set (paths under the public assets dir).
   * Absent until real approved assets are supplied in Phase 1B.
   */
  textures?: {
    map?: string;
    normalMap?: string;
    roughnessMap?: string;
    /** Physical size in mm covered by one texture repeat (for real-world scale). */
    repeatMmX?: number;
    repeatMmY?: number;
  };
  /** Color used for rendering until (or instead of) real textures exist. */
  fallbackHex: string;
  /** Base roughness when no roughness map is present. */
  roughness?: number;
  /** Only approved finishes are shown to customers. */
  approved: boolean;
}

/**
 * Registry of Teak finishes. Placeholder only — DO NOT invent catalog entries;
 * real approved samples/files come from the user in Phase 1B.
 */
export const TEAK_FINISHES: Record<string, TeakFinish> = {
  "teak-1026": {
    id: "teak-1026",
    sampleCode: "1026",
    nameAr: "خشب رقم 1026",
    nameEn: "Wood 1026",
    manufacturerRef: "Saviola — Canyon Noce D18 (WR, EVO)",
    thicknessMm: 18,
    moistureResistant: true,
    grain: "woodgrain",
    grainDirection: "vertical",
    // Fallback tone approximating the sample photo; real textures arrive in 1B.
    fallbackHex: "#6d4a30",
    roughness: 0.5,
    approved: false, // not customer-visible until real assets are integrated
  },
};

export function getTeakFinish(finishId: string | undefined | null): TeakFinish | undefined {
  if (!finishId) return undefined;
  return TEAK_FINISHES[finishId];
}

/** Convert a TeakFinish to the render finish the cabinet renderer consumes. */
export function teakToRenderFinish(f: TeakFinish): AdekoFinish {
  return {
    id: f.id,
    tint: f.fallbackHex,
    wood: f.grain === "woodgrain",
    roughness: f.roughness ?? 0.5,
  };
}

/**
 * Resolution rule (backward compatible):
 * - a valid `finishId` wins and renders via the Teak model;
 * - otherwise the legacy doorPattern + finishColor path is used unchanged.
 */
export function resolveCabinetFinish(opts: {
  finishId?: string | null;
  doorPattern: AdekoDoorPattern;
  finishColorHex: string;
}): AdekoFinish {
  const teak = getTeakFinish(opts.finishId);
  if (teak) return teakToRenderFinish(teak);
  return buildAdekoFinish(opts.doorPattern, opts.finishColorHex);
}
