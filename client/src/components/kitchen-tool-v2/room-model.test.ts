import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  cmToMm,
  mmToCm,
  generateRoomV2,
  validateRoomInputV2,
  wallDirection,
  dot,
  floorPolygonArea,
  type RoomInputV2,
} from "./room-model";

const base = {
  ceilingHeightMm: 2700,
  roomType: "closed" as const,
  measurementConfidence: "exact" as const,
};

const single: RoomInputV2 = { ...base, layout: "single_wall", wallAMm: 3600, depthMm: 3000 };
const lShape: RoomInputV2 = { ...base, layout: "l_shape", wallAMm: 3600, wallBMm: 2400 };
const uShape: RoomInputV2 = { ...base, layout: "u_shape", wallAMm: 3600, wallBMm: 2400, wallCMm: 2000 };
const galley: RoomInputV2 = { ...base, layout: "galley", wallAMm: 3600, wallBMm: 3600, depthMm: 2400 };

describe("unit conversion", () => {
  it("converts centimeters to millimeters", () => {
    expect(cmToMm(360)).toBe(3600);
    expect(cmToMm(0.5)).toBe(5);
    expect(cmToMm(270.4)).toBe(2704);
    expect(mmToCm(3600)).toBe(360);
  });
});

describe("validation", () => {
  it("rejects empty / non-positive / non-numeric dimensions", () => {
    for (const bad of [NaN, 0, -100, undefined as any]) {
      const v = validateRoomInputV2({ ...single, wallAMm: bad });
      expect(v.errors.some((e) => e.field === "wallAMm")).toBe(true);
    }
  });

  it("rejects out-of-range dimensions as blocking errors", () => {
    expect(validateRoomInputV2({ ...single, wallAMm: 100 }).errors.length).toBeGreaterThan(0);
    expect(validateRoomInputV2({ ...single, wallAMm: 50000 }).errors.length).toBeGreaterThan(0);
    expect(validateRoomInputV2({ ...single, ceilingHeightMm: 1000 }).errors.length).toBeGreaterThan(0);
  });

  it("warns (non-blocking) on unusual but allowed dimensions", () => {
    const v = validateRoomInputV2({ ...single, wallAMm: 800 });
    expect(v.errors.length).toBe(0);
    expect(v.warnings.some((w) => w.field === "wallAMm")).toBe(true);
  });

  it("warns (non-blocking) for approximate measurements", () => {
    const v = validateRoomInputV2({ ...single, measurementConfidence: "approximate" });
    expect(v.errors.length).toBe(0);
    expect(v.warnings.some((w) => w.field === "measurementConfidence")).toBe(true);
  });

  it("requires wall C for U shape", () => {
    const v = validateRoomInputV2({ ...uShape, wallCMm: undefined });
    expect(v.errors.some((e) => e.field === "wallCMm")).toBe(true);
  });

  it("generateRoomV2 throws on invalid input", () => {
    expect(() => generateRoomV2({ ...single, wallAMm: -5 })).toThrow();
  });
});

describe("geometry generation", () => {
  it("produces deterministic wall IDs and ordering", () => {
    const r1 = generateRoomV2(uShape);
    const r2 = generateRoomV2(uShape);
    expect(r1.walls.map((w) => w.id)).toEqual(["A", "B", "C"]);
    expect(r1.walls.map((w) => w.id)).toEqual(r2.walls.map((w) => w.id));
    expect(r1).toEqual(r2);
  });

  it("generated wall lengths equal requested lengths", () => {
    const r = generateRoomV2(uShape);
    expect(r.walls.find((w) => w.id === "A")!.lengthMm).toBe(3600);
    expect(r.walls.find((w) => w.id === "B")!.lengthMm).toBe(2400);
    expect(r.walls.find((w) => w.id === "C")!.lengthMm).toBe(2000);
    const g = generateRoomV2(galley);
    expect(g.walls.find((w) => w.id === "A")!.lengthMm).toBe(3600);
    expect(g.walls.find((w) => w.id === "B")!.lengthMm).toBe(3600);
  });

  it("L-shape connected walls are perpendicular and share a corner", () => {
    const r = generateRoomV2(lShape);
    const [a, b] = r.walls;
    expect(dot(wallDirection(a), wallDirection(b))).toBeCloseTo(0, 10);
    expect(a.end).toEqual(b.start);
  });

  it("U-shape walls connect without gaps and are perpendicular", () => {
    const r = generateRoomV2(uShape);
    const a = r.walls.find((w) => w.id === "A")!;
    const b = r.walls.find((w) => w.id === "B")!;
    const c = r.walls.find((w) => w.id === "C")!;
    expect(a.end).toEqual(b.start);
    expect(a.start).toEqual(c.start);
    expect(dot(wallDirection(a), wallDirection(b))).toBeCloseTo(0, 10);
    expect(dot(wallDirection(a), wallDirection(c))).toBeCloseTo(0, 10);
  });

  it("galley walls are parallel and separated by the requested gap", () => {
    const r = generateRoomV2(galley);
    const [a, b] = r.walls;
    const cross =
      wallDirection(a).xMm * wallDirection(b).zMm - wallDirection(a).zMm * wallDirection(b).xMm;
    expect(cross).toBeCloseTo(0, 10);
    expect(Math.abs(b.start.zMm - a.start.zMm)).toBe(2400);
  });

  it("inward normals are explicit unit vectors pointing into the room", () => {
    for (const input of [single, lShape, uShape, galley]) {
      const r = generateRoomV2(input);
      for (const w of r.walls) {
        expect(Math.hypot(w.inwardNormal.xMm, w.inwardNormal.zMm)).toBeCloseTo(1, 10);
      }
    }
    const g = generateRoomV2(galley);
    expect(g.walls[0].inwardNormal).toEqual({ xMm: 0, zMm: 1 });
    expect(g.walls[1].inwardNormal).toEqual({ xMm: 0, zMm: -1 });
  });

  it("floor polygon is a valid, positive-area polygon for all layouts", () => {
    for (const input of [single, lShape, uShape, galley]) {
      const r = generateRoomV2(input);
      expect(r.floor.polygon.length).toBeGreaterThanOrEqual(3);
      expect(Math.abs(floorPolygonArea(r.floor))).toBeGreaterThan(0);
    }
    expect(Math.abs(floorPolygonArea(generateRoomV2(lShape).floor))).toBe(3600 * 2400);
  });
});

describe("V1 isolation", () => {
  it("V2 store module never references the V1 persistence key", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(dir, "store.ts"), "utf8");
    expect(src.includes("teak-kitchen-tool-v2")).toBe(true);
    // Ensure the bare V1 key never appears (only the -v2 key is allowed).
    const withoutV2 = src.replaceAll("teak-kitchen-tool-v2", "");
    expect(withoutV2.includes("teak-kitchen-tool")).toBe(false);
  });
});
