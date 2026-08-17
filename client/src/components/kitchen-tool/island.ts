/**
 * Kitchen island fit test + placement.
 *
 * The island is a customer-activated option: it only appears when the room
 * actually has space for it. The test is conservative — it takes the room's
 * interior rectangle, insets every wall by the space its contents need
 * (base-cabinet run, door swing, or just the wall), adds a walkway
 * clearance on all sides, then tries standard island sizes in both
 * orientations and centers the best fit.
 *
 * All plan math is in cm (same as WallSegment); the result is in meters
 * (world/scene units).
 */
import type { WallSegment } from "@/components/kitchen-tool/plan-svg";
import { getFloorBounds } from "@/components/kitchen-tool/plan-svg";
import type { KitchenOpening } from "@/components/kitchen-tool/store";

const CM = 0.01;

/** Walkway clearance around the island (cm) — Gulf kitchen standard ~90cm. */
const CLEARANCE = 90;
/** Depth of a base-cabinet run incl. countertop overhang (cm). */
const BASE_RUN = 65;
/** Door swing clearance (cm). */
const DOOR_SWING = 95;

/** Standard Teak island sizes (cm), tried largest first. */
const ISLAND_SIZES: Array<{ w: number; d: number }> = [
  { w: 180, d: 90 },
  { w: 150, d: 90 },
  { w: 120, d: 80 },
];

export interface IslandPlacement {
  /** Island center, world meters. */
  x: number;
  z: number;
  /** Footprint in meters. */
  width: number;
  depth: number;
}

/**
 * Compute where the island fits, or null when the room is too tight.
 * `wallsWithCabinets` = wall ids hosting any placed cabinet run.
 */
export function computeIslandPlacement(
  segments: WallSegment[],
  openings: KitchenOpening[],
  wallsWithCabinets: Set<string>
): IslandPlacement | null {
  // Single-wall (I) rooms carry no measured room depth — getFloorBounds
  // invents a minimal 120cm strip there, so an island can never be
  // validated. Islands require at least an L room by design.
  if (segments.length < 2) return null;
  const b = getFloorBounds(segments);
  // Available interior rect (cm), shrunk per wall.
  let minX = b.minX;
  let maxX = b.maxX;
  let minY = b.minY;
  let maxY = b.maxY;

  for (const seg of segments) {
    // Doors swinging into the room block their swing envelope; out-swinging
    // doors don't. A wall can host BOTH a cabinet run and a door — take the
    // largest physical obstruction, never a priority pick.
    const hasInDoor = openings.some(
      (o) => o.wallId === seg.id && o.type === "door" && o.swing !== "out"
    );
    const inset =
      Math.max(
        wallsWithCabinets.has(seg.id) ? BASE_RUN : 0,
        hasInDoor ? DOOR_SWING : 0,
        5
      ) + CLEARANCE;
    // Inward direction is opposite the segment's outward normal.
    const inX = -seg.nx;
    const inY = -seg.ny;
    if (Math.abs(inY) > 0.5) {
      // Horizontal wall.
      if (inY > 0) minY = Math.max(minY, Math.max(seg.y1, seg.y2) + inset);
      else maxY = Math.min(maxY, Math.min(seg.y1, seg.y2) - inset);
    } else if (Math.abs(inX) > 0.5) {
      // Vertical wall.
      if (inX > 0) minX = Math.max(minX, Math.max(seg.x1, seg.x2) + inset);
      else maxX = Math.min(maxX, Math.min(seg.x1, seg.x2) - inset);
    }
  }

  const availW = maxX - minX;
  const availH = maxY - minY;
  if (availW <= 0 || availH <= 0) return null;

  for (const size of ISLAND_SIZES) {
    // Try both orientations; prefer the island's long side along the
    // room's long axis (reads naturally in the plan).
    const orientations =
      availW >= availH
        ? [
            { w: size.w, d: size.d },
            { w: size.d, d: size.w },
          ]
        : [
            { w: size.d, d: size.w },
            { w: size.w, d: size.d },
          ];
    for (const o of orientations) {
      if (o.w <= availW && o.d <= availH) {
        return {
          x: ((minX + maxX) / 2) * CM,
          z: ((minY + maxY) / 2) * CM,
          width: o.w * CM,
          depth: o.d * CM,
        };
      }
    }
  }
  return null;
}
