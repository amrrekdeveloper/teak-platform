/**
 * Kitchen Designer V2 — pure room geometry model.
 *
 * Completely isolated from the V1 kitchen tool. Canonical internal unit is
 * MILLIMETERS. All layouts are fixed orthogonal shapes; no free-angle editing.
 * The 3D preview must be generated ONLY from RoomV2 (never from V1 answers).
 */

export const ROOM_SCHEMA_VERSION_V2 = 1;

export type RoomLayoutV2 = "single_wall" | "l_shape" | "u_shape" | "galley";

export interface RoomPointV2 {
  xMm: number;
  zMm: number;
}

export interface RoomWallV2 {
  id: string;
  label: string;
  lengthMm: number;
  heightMm: number;
  start: RoomPointV2;
  end: RoomPointV2;
  /** Unit vector pointing into the room (explicit, never inferred). */
  inwardNormal: RoomPointV2;
}

export interface RoomFloorV2 {
  polygon: RoomPointV2[];
}

export interface RoomV2 {
  schemaVersion: number;
  layout: RoomLayoutV2;
  ceilingHeightMm: number;
  roomType: "closed" | "open";
  measurementConfidence: "exact" | "approximate";
  walls: RoomWallV2[];
  floor: RoomFloorV2;
}

/** Raw dimension inputs, in millimeters, per layout. */
export interface RoomInputV2 {
  layout: RoomLayoutV2;
  /** Length of wall A (all layouts). */
  wallAMm: number;
  /** Length of wall B (l_shape, u_shape, galley). */
  wallBMm?: number;
  /** Length of wall C (u_shape only). */
  wallCMm?: number;
  /** Room depth: single_wall (free depth) and galley (gap between walls). */
  depthMm?: number;
  ceilingHeightMm: number;
  roomType: "closed" | "open";
  measurementConfidence: "exact" | "approximate";
}

/* ------------------------------------------------------------------ */
/* Unit conversion                                                     */
/* ------------------------------------------------------------------ */

/** Convert a centimeter value (customer-facing) to millimeters (canonical). */
export function cmToMm(cm: number): number {
  return Math.round(cm * 10);
}

export function mmToCm(mm: number): number {
  return mm / 10;
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export const WALL_MIN_MM = 500;
export const WALL_MAX_MM = 20000;
export const WALL_WARN_MIN_MM = 1200;
export const WALL_WARN_MAX_MM = 12000;
export const CEILING_MIN_MM = 2000;
export const CEILING_MAX_MM = 4500;
export const CEILING_WARN_MIN_MM = 2300;
export const CEILING_WARN_MAX_MM = 3500;
export const DEPTH_MIN_MM = 1200;
export const DEPTH_MAX_MM = 15000;

export interface RoomValidationV2 {
  /** Blocking problems — the geometry cannot / must not be created. */
  errors: { field: string; messageAr: string; messageEn: string }[];
  /** Non-blocking warnings (e.g. unusual dimensions). */
  warnings: { field: string; messageAr: string; messageEn: string }[];
}

function isPositiveFinite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/** Which dimension fields each layout requires. */
export function requiredFieldsForLayout(layout: RoomLayoutV2): string[] {
  switch (layout) {
    case "single_wall":
      return ["wallAMm", "depthMm"];
    case "l_shape":
      return ["wallAMm", "wallBMm"];
    case "u_shape":
      return ["wallAMm", "wallBMm", "wallCMm"];
    case "galley":
      return ["wallAMm", "wallBMm", "depthMm"];
  }
}

export function validateRoomInputV2(input: RoomInputV2): RoomValidationV2 {
  const errors: RoomValidationV2["errors"] = [];
  const warnings: RoomValidationV2["warnings"] = [];

  const required = requiredFieldsForLayout(input.layout);
  const wallFields: [string, number | undefined][] = [
    ["wallAMm", input.wallAMm],
    ["wallBMm", input.wallBMm],
    ["wallCMm", input.wallCMm],
  ];

  for (const [field, value] of wallFields) {
    if (!required.includes(field)) continue;
    if (!isPositiveFinite(value)) {
      errors.push({
        field,
        messageAr: "القيمة مطلوبة ويجب أن تكون رقماً موجباً",
        messageEn: "Value is required and must be a positive number",
      });
      continue;
    }
    if (value < WALL_MIN_MM || value > WALL_MAX_MM) {
      errors.push({
        field,
        messageAr: `طول الجدار يجب أن يكون بين ${WALL_MIN_MM / 10} و ${WALL_MAX_MM / 10} سم`,
        messageEn: `Wall length must be between ${WALL_MIN_MM / 10} and ${WALL_MAX_MM / 10} cm`,
      });
    } else if (value < WALL_WARN_MIN_MM || value > WALL_WARN_MAX_MM) {
      warnings.push({
        field,
        messageAr: "هذا الطول غير معتاد للمطابخ — تأكد من القياس",
        messageEn: "This length is unusual for kitchens — please double-check",
      });
    }
  }

  if (required.includes("depthMm")) {
    if (!isPositiveFinite(input.depthMm)) {
      errors.push({
        field: "depthMm",
        messageAr: "عمق الغرفة مطلوب ويجب أن يكون رقماً موجباً",
        messageEn: "Room depth is required and must be a positive number",
      });
    } else if (input.depthMm < DEPTH_MIN_MM || input.depthMm > DEPTH_MAX_MM) {
      errors.push({
        field: "depthMm",
        messageAr: `عمق الغرفة يجب أن يكون بين ${DEPTH_MIN_MM / 10} و ${DEPTH_MAX_MM / 10} سم`,
        messageEn: `Room depth must be between ${DEPTH_MIN_MM / 10} and ${DEPTH_MAX_MM / 10} cm`,
      });
    }
  }

  if (!isPositiveFinite(input.ceilingHeightMm)) {
    errors.push({
      field: "ceilingHeightMm",
      messageAr: "ارتفاع السقف مطلوب ويجب أن يكون رقماً موجباً",
      messageEn: "Ceiling height is required and must be a positive number",
    });
  } else if (input.ceilingHeightMm < CEILING_MIN_MM || input.ceilingHeightMm > CEILING_MAX_MM) {
    errors.push({
      field: "ceilingHeightMm",
      messageAr: `ارتفاع السقف يجب أن يكون بين ${CEILING_MIN_MM / 10} و ${CEILING_MAX_MM / 10} سم`,
      messageEn: `Ceiling height must be between ${CEILING_MIN_MM / 10} and ${CEILING_MAX_MM / 10} cm`,
    });
  } else if (
    input.ceilingHeightMm < CEILING_WARN_MIN_MM ||
    input.ceilingHeightMm > CEILING_WARN_MAX_MM
  ) {
    warnings.push({
      field: "ceilingHeightMm",
      messageAr: "ارتفاع سقف غير معتاد — تأكد من القياس",
      messageEn: "Unusual ceiling height — please double-check",
    });
  }

  if (input.measurementConfidence === "approximate") {
    warnings.push({
      field: "measurementConfidence",
      messageAr: "القياسات التقريبية غير معتمدة للتصنيع — يلزم قياس دقيق قبل التنفيذ",
      messageEn: "Approximate measurements are not approved for manufacturing — exact measurement is required before production",
    });
  }

  return { errors, warnings };
}

/* ------------------------------------------------------------------ */
/* Geometry generation                                                 */
/* ------------------------------------------------------------------ */

const WALL_LABELS_AR: Record<string, string> = { A: "أ", B: "ب", C: "ج", D: "د" };

function wall(
  id: string,
  start: RoomPointV2,
  end: RoomPointV2,
  inwardNormal: RoomPointV2,
  heightMm: number
): RoomWallV2 {
  const lengthMm = Math.hypot(end.xMm - start.xMm, end.zMm - start.zMm);
  return {
    id,
    label: `${id} / ${WALL_LABELS_AR[id] ?? id}`,
    lengthMm,
    heightMm,
    start,
    end,
    inwardNormal,
  };
}

function rectPolygon(widthMm: number, depthMm: number): RoomPointV2[] {
  return [
    { xMm: 0, zMm: 0 },
    { xMm: widthMm, zMm: 0 },
    { xMm: widthMm, zMm: depthMm },
    { xMm: 0, zMm: depthMm },
  ];
}

/**
 * Generate a RoomV2 from validated inputs. Throws if inputs fail validation
 * with blocking errors — callers must not render a room from invalid input.
 *
 * Coordinate convention (plan view, millimeters):
 *   +X → to the right, +Z → into the room (away from wall A).
 *   Wall A always runs from (0,0) to (a,0) with inward normal (0,+1).
 *   All connected corners are exactly 90°. Wall order is deterministic: A, B, C.
 */
export function generateRoomV2(input: RoomInputV2): RoomV2 {
  const { errors } = validateRoomInputV2(input);
  if (errors.length > 0) {
    throw new Error(
      "Cannot generate room from invalid input: " + errors.map((e) => `${e.field}: ${e.messageEn}`).join("; ")
    );
  }

  const h = input.ceilingHeightMm;
  const a = input.wallAMm;
  const walls: RoomWallV2[] = [];
  let polygon: RoomPointV2[];

  switch (input.layout) {
    case "single_wall": {
      const depth = input.depthMm!;
      walls.push(wall("A", { xMm: 0, zMm: 0 }, { xMm: a, zMm: 0 }, { xMm: 0, zMm: 1 }, h));
      polygon = rectPolygon(a, depth);
      break;
    }
    case "l_shape": {
      const b = input.wallBMm!;
      walls.push(
        wall("A", { xMm: 0, zMm: 0 }, { xMm: a, zMm: 0 }, { xMm: 0, zMm: 1 }, h),
        wall("B", { xMm: a, zMm: 0 }, { xMm: a, zMm: b }, { xMm: -1, zMm: 0 }, h)
      );
      polygon = rectPolygon(a, b);
      break;
    }
    case "u_shape": {
      const b = input.wallBMm!;
      const c = input.wallCMm!;
      walls.push(
        wall("A", { xMm: 0, zMm: 0 }, { xMm: a, zMm: 0 }, { xMm: 0, zMm: 1 }, h),
        wall("B", { xMm: a, zMm: 0 }, { xMm: a, zMm: b }, { xMm: -1, zMm: 0 }, h),
        wall("C", { xMm: 0, zMm: 0 }, { xMm: 0, zMm: c }, { xMm: 1, zMm: 0 }, h)
      );
      polygon = rectPolygon(a, Math.max(b, c));
      break;
    }
    case "galley": {
      const b = input.wallBMm!;
      const gap = input.depthMm!;
      walls.push(
        wall("A", { xMm: 0, zMm: 0 }, { xMm: a, zMm: 0 }, { xMm: 0, zMm: 1 }, h),
        wall("B", { xMm: 0, zMm: gap }, { xMm: b, zMm: gap }, { xMm: 0, zMm: -1 }, h)
      );
      polygon = rectPolygon(Math.max(a, b), gap);
      break;
    }
  }

  return {
    schemaVersion: ROOM_SCHEMA_VERSION_V2,
    layout: input.layout,
    ceilingHeightMm: input.ceilingHeightMm,
    roomType: input.roomType,
    measurementConfidence: input.measurementConfidence,
    walls,
    floor: { polygon },
  };
}

/* ------------------------------------------------------------------ */
/* Geometry helpers (used by preview + tests)                          */
/* ------------------------------------------------------------------ */

export function wallDirection(w: RoomWallV2): RoomPointV2 {
  const dx = w.end.xMm - w.start.xMm;
  const dz = w.end.zMm - w.start.zMm;
  const len = Math.hypot(dx, dz) || 1;
  return { xMm: dx / len, zMm: dz / len };
}

export function dot(a: RoomPointV2, b: RoomPointV2): number {
  return a.xMm * b.xMm + a.zMm * b.zMm;
}

/** Signed area of the floor polygon (shoelace, mm²). Non-zero means valid. */
export function floorPolygonArea(floor: RoomFloorV2): number {
  const pts = floor.polygon;
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    area += p.xMm * q.zMm - q.xMm * p.zMm;
  }
  return area / 2;
}

/** Bounding box of the room in mm. */
export function roomBounds(room: RoomV2) {
  const xs = room.floor.polygon.map((p) => p.xMm);
  const zs = room.floor.polygon.map((p) => p.zMm);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}
