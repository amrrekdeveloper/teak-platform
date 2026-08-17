import { describe, it, expect } from "vitest";
import { getWallSegments } from "@/components/kitchen-designer-v2/plan-svg";
import { parseAiPlan, compileAiPlan, buildRoomSummary, buildFallbackPlan } from "@/components/kitchen-designer-v2/ai-plan";
import { findCabinetDef, verticalSpan, type CabinetDef } from "@/components/kitchen-designer-v2/cabinets";
import { KITCHEN_TEMPLATES } from "@/components/kitchen-designer-v2/templates";
import type { KitchenOpening, KitchenWall } from "@/components/kitchen-designer-v2/store";

const template = KITCHEN_TEMPLATES[0];
const CM = 0.01;

const walls: KitchenWall[] = [
  { id: "A", length: 400 },
  { id: "B", length: 300 },
];
const segments = getWallSegments("L", walls);

function spansOverlap(a: { y0: number; y1: number }, b: { y0: number; y1: number }) {
  return a.y0 < b.y1 - 1e-6 && b.y0 < a.y1 - 1e-6;
}

/** No two compiled cabinets overlap on the same wall at the same height. */
function assertNoOverlaps(cabs: { catalogId: string; wallId: string; offset: number }[]) {
  for (let i = 0; i < cabs.length; i++) {
    for (let j = i + 1; j < cabs.length; j++) {
      const a = cabs[i];
      const b = cabs[j];
      if (a.wallId !== b.wallId) continue;
      const da = findCabinetDef(a.catalogId)!;
      const db = findCabinetDef(b.catalogId)!;
      if (!spansOverlap(verticalSpan(da), verticalSpan(db))) continue;
      const disjoint =
        a.offset + da.width <= b.offset + 1e-6 || b.offset + db.width <= a.offset + 1e-6;
      expect(disjoint, `${a.catalogId} overlaps ${b.catalogId} on ${a.wallId}`).toBe(true);
    }
  }
}

describe("parseAiPlan", () => {
  it("rejects garbage and empty plans", () => {
    expect(parseAiPlan(null)).toBeNull();
    expect(parseAiPlan({})).toBeNull();
    expect(parseAiPlan({ units: [] })).toBeNull();
    expect(parseAiPlan({ units: [{ unit: "mesh", vertices: [] }] })).toBeNull();
  });

  it("keeps valid units and drops invalid ones", () => {
    const plan = parseAiPlan({
      units: [
        { unit: "sinkBase", wallId: "A", offsetCm: 100, widthCm: 80 },
        { unit: "spaceship", wallId: "A" },
        { unit: "baseCabinet", offsetCm: "x" },
      ],
      island: true,
    });
    expect(plan).not.toBeNull();
    expect(plan!.units).toHaveLength(2);
    expect(plan!.units[0]).toEqual({ unit: "sinkBase", wallId: "A", offsetCm: 100, widthCm: 80 });
    expect(plan!.units[1].offsetCm).toBeUndefined();
    expect(plan!.island).toBe(true);
  });
});

describe("compileAiPlan", () => {
  it("places units at legal offsets and honors requested positions", () => {
    const plan = parseAiPlan({
      units: [
        { unit: "sinkBase", wallId: "A", offsetCm: 150, widthCm: 80 },
        { unit: "cooktopBase", wallId: "B", offsetCm: 100, widthCm: 60 },
        { unit: "baseCabinet", wallId: "A", offsetCm: 0, widthCm: 80 },
      ],
    })!;
    const cabs = compileAiPlan(plan, segments, [], [], template);
    expect(cabs.length).toBe(3);
    assertNoOverlaps(cabs);
    const sink = cabs.find((c) => c.catalogId.includes("sink"))!;
    expect(sink.wallId).toBe("A");
    expect(Math.abs(sink.offset - 1.5)).toBeLessThan(0.6);
    // Style applied from the chosen template.
    expect(sink.finishColor).toBe(template.doorColorHex);
    expect(sink.topFinishId).toBe(template.topFinishId);
  });

  it("snaps overlapping requests to the nearest legal offset instead of overlapping", () => {
    const plan = parseAiPlan({
      units: [
        { unit: "sinkBase", wallId: "A", offsetCm: 100, widthCm: 80 },
        { unit: "cooktopBase", wallId: "A", offsetCm: 110, widthCm: 60 },
      ],
    })!;
    const cabs = compileAiPlan(plan, segments, [], [], template);
    expect(cabs.length).toBe(2);
    assertNoOverlaps(cabs);
  });

  it("never places a base unit inside a door zone", () => {
    const openings: KitchenOpening[] = [
      { id: "d1", wallId: "A", type: "door", width: 90, distanceFromWallStart: 150 },
    ];
    const plan = parseAiPlan({
      units: [{ unit: "sinkBase", wallId: "A", offsetCm: 160, widthCm: 80 }],
    })!;
    const cabs = compileAiPlan(plan, segments, openings, [], template);
    expect(cabs.length).toBe(1);
    const def = findCabinetDef(cabs[0].catalogId)!;
    const a = cabs[0].offset;
    const b = a + def.width;
    // Door blocks [150cm, 240cm] (+ margin) — the sink must be fully outside.
    const doorA = 150 * CM;
    const doorB = 240 * CM;
    expect(cabs[0].wallId !== "A" || b <= doorA + 1e-6 || a >= doorB - 1e-6).toBe(true);
  });

  it("drops units that cannot fit anywhere", () => {
    const tiny = getWallSegments("I", [{ id: "A", length: 100 }]);
    const plan = parseAiPlan({
      units: [
        { unit: "sinkBase", wallId: "A", offsetCm: 0, widthCm: 100 },
        { unit: "cooktopBase", wallId: "A", offsetCm: 0, widthCm: 90 },
        { unit: "ovenTower", wallId: "A", offsetCm: 0 },
      ],
    })!;
    const cabs = compileAiPlan(plan, tiny, [], [], template);
    // 100cm wall: only the first unit fits; the rest are dropped, never stacked.
    expect(cabs.length).toBeLessThanOrEqual(1);
    assertNoOverlaps(cabs);
  });

  it("returns [] for a room with no free wall space (fallback trigger)", () => {
    // getWallSegments clamps wall lengths to WALL_MIN, so build the tiny
    // segment directly: a 30cm wall cannot host any 80cm sink unit.
    const tiny = [
      { id: "A", x1: 0, y1: 0, x2: 30, y2: 0, length: 30, nx: 0, ny: -1 },
    ];
    const plan = parseAiPlan({ units: [{ unit: "sinkBase", wallId: "A", offsetCm: 0 }] })!;
    expect(compileAiPlan(plan, tiny, [], [], template)).toHaveLength(0);
  });
});

describe("buildRoomSummary", () => {
  it("serializes walls, openings and utilities in cm", () => {
    const s = buildRoomSummary(
      "L",
      walls,
      280,
      [{ id: "d1", wallId: "A", type: "door", width: 90, distanceFromWallStart: 20, swing: "in" }],
      [{ id: "u1", kind: "water", wallId: "B", positionAlongWall: 120, heightFromFloor: 55 }],
      "دفء البلوط",
      "auto"
    );
    expect(s.walls).toEqual([
      { id: "A", lengthCm: 400 },
      { id: "B", lengthCm: 300 },
    ]);
    expect(s.openings[0]).toMatchObject({ wallId: "A", type: "door", swing: "in" });
    expect(s.utilities[0]).toMatchObject({ kind: "water", wallId: "B", fromWallStartCm: 120 });
    expect(s.prefs).toEqual({ styleAr: "دفء البلوط", island: "auto" });
  });
});

describe("buildFallbackPlan", () => {
  it("designs a utility-aware plan: sink at water, cooktop at gas, compilable", () => {
    const segments = getWallSegments("L", [
      { id: "A", length: 400 },
      { id: "B", length: 300 },
    ]);
    const utilities = [
      { id: "u1", kind: "water", wallId: "A", positionAlongWall: 120 },
      { id: "u2", kind: "gas", wallId: "B", positionAlongWall: 100 },
    ] as any;
    const plan = buildFallbackPlan(segments, [], utilities, "auto");
    const sink = plan.units.find((u) => u.unit === "sinkBase")!;
    expect(sink.wallId).toBe("A");
    expect(Math.abs((sink.offsetCm ?? 0) - 80)).toBeLessThanOrEqual(1);
    const cook = plan.units.find((u) => u.unit === "cooktopBase")!;
    expect(cook.wallId).toBe("B");
    expect(plan.units.some((u) => u.unit === "cornerUnit")).toBe(true);
    expect(plan.units.some((u) => u.unit === "wallCabinet")).toBe(true);
    const template = KITCHEN_TEMPLATES[0];
    const cabs = compileAiPlan(plan, segments, [], [], template);
    expect(cabs.length).toBeGreaterThanOrEqual(4);
  });
});
