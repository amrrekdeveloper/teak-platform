import { describe, it, expect } from "vitest";
import { getWallSegments } from "@/components/kitchen-designer-v2/plan-svg";
import { parseAiPlan, compileAiPlan, buildRoomSummary, buildFallbackPlan, normalizePlan, buildAutoDecor } from "@/components/kitchen-designer-v2/ai-plan";
import { findCabinetDef, verticalSpan, EXTRA_CABINET_DEFS, type CabinetDef } from "@/components/kitchen-designer-v2/cabinets";
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
    // Roomy kitchen: the guard auto-adds a dishwasher next to the sink.
    expect(cabs.length).toBe(4);
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
    expect(cabs.length).toBeGreaterThanOrEqual(2);
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
    // The functional guard may add the mandatory cooktop; every placed
    // base unit must stay fully outside the door zone.
    expect(cabs.length).toBeGreaterThanOrEqual(1);
    const doorA = 150 * CM;
    const doorB = 240 * CM;
    for (const c of cabs) {
      const def = findCabinetDef(c.catalogId)!;
      const a = c.offset;
      const b = a + def.width;
      expect(c.wallId !== "A" || b <= doorA + 1e-6 || a >= doorB - 1e-6).toBe(true);
    }
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

describe("normalizePlan (utility-aware guard)", () => {
  const segments = getWallSegments("L", [
    { id: "A", length: 400 },
    { id: "B", length: 300 },
  ]);
  const utilities = [
    { id: "u1", kind: "water", wallId: "A", positionAlongWall: 200 },
    { id: "u2", kind: "gas", wallId: "B", positionAlongWall: 100 },
  ] as any;

  it("dedupes extra sinks/cooktops and inserts missing ones", () => {
    const plan = parseAiPlan({
      units: [
        { unit: "sinkBase", wallId: "A", offsetCm: 0, widthCm: 80 },
        { unit: "sinkBase", wallId: "B", offsetCm: 0, widthCm: 80 },
        { unit: "baseCabinet", wallId: "A", offsetCm: 200 },
      ],
    })!;
    const norm = normalizePlan(plan, segments, []);
    expect(norm.units.filter((u) => u.unit === "sinkBase")).toHaveLength(1);
    expect(norm.units.filter((u) => u.unit === "cooktopBase")).toHaveLength(1);
  });

  it("pins a misplaced sink to the water wall and cooktop to the gas wall", () => {
    const plan = parseAiPlan({
      units: [
        { unit: "sinkBase", wallId: "B", offsetCm: 10, widthCm: 80 },
        { unit: "cooktopBase", wallId: "A", offsetCm: 350, widthCm: 60 },
      ],
    })!;
    const norm = normalizePlan(plan, segments, utilities);
    const sink = norm.units.find((u) => u.unit === "sinkBase")!;
    const cook = norm.units.find((u) => u.unit === "cooktopBase")!;
    expect(sink.wallId).toBe("A");
    expect(Math.abs((sink.offsetCm ?? 0) + 40 - 200)).toBeLessThanOrEqual(1);
    expect(cook.wallId).toBe("B");
  });

  it("enforces >=60cm worktop between sink and cooktop on a shared wall", () => {
    const plan = parseAiPlan({
      units: [
        { unit: "sinkBase", wallId: "A", offsetCm: 100, widthCm: 80 },
        { unit: "cooktopBase", wallId: "A", offsetCm: 185, widthCm: 60 },
      ],
    })!;
    const norm = normalizePlan(plan, segments, []);
    const sink = norm.units.find((u) => u.unit === "sinkBase")!;
    const cook = norm.units.find((u) => u.unit === "cooktopBase")!;
    if (cook.wallId === sink.wallId) {
      const gap = (cook.offsetCm ?? 0) >= (sink.offsetCm ?? 0)
        ? (cook.offsetCm ?? 0) - ((sink.offsetCm ?? 0) + 80)
        : (sink.offsetCm ?? 0) - ((cook.offsetCm ?? 0) + 60);
      expect(gap).toBeGreaterThanOrEqual(60);
    }
  });

  it("caps ovenTower and fridgeHousing to one each", () => {
    const plan = parseAiPlan({
      units: [
        { unit: "sinkBase", wallId: "A", offsetCm: 0 },
        { unit: "ovenTower", wallId: "B" },
        { unit: "ovenTower", wallId: "B" },
        { unit: "fridgeHousing", wallId: "B" },
        { unit: "fridgeHousing", wallId: "A" },
      ],
    })!;
    const norm = normalizePlan(plan, segments, []);
    expect(norm.units.filter((u) => u.unit === "ovenTower")).toHaveLength(1);
    expect(norm.units.filter((u) => u.unit === "fridgeHousing")).toHaveLength(1);
  });
});

describe("compileAiPlan service-point hard constraints (final positions)", () => {
  const template = KITCHEN_TEMPLATES[0];
  const segments = getWallSegments("L", [
    { id: "A", length: 400 },
    { id: "B", length: 300 },
  ]);

  it("final sink covers the water point even when the model asked elsewhere", () => {
    const utilities = [{ id: "u1", kind: "water", wallId: "A", positionAlongWall: 250 }] as any;
    const plan = parseAiPlan({
      units: [{ unit: "sinkBase", wallId: "B", offsetCm: 10, widthCm: 80 }],
    })!;
    const cabs = compileAiPlan(plan, segments, [], [], template, utilities);
    const sink = cabs.find((c) => /sink/.test(c.catalogId))!;
    expect(sink.wallId).toBe("A");
    const def = findCabinetDef(sink.catalogId)!;
    const centerCm = (sink.offset + def.width / 2) / CM;
    expect(Math.abs(centerCm - 250)).toBeLessThanOrEqual(60);
  });

  it("returns [] (infeasible) when the water point zone is fully blocked", () => {
    // Door spans the whole tolerance window around the water point on a
    // short wall, so no legal sink position keeps the service link.
    const tiny = getWallSegments("I", [{ id: "A", length: 300 }]);
    const utilities = [{ id: "u1", kind: "water", wallId: "A", positionAlongWall: 150 }] as any;
    const openings = [
      { id: "d1", wallId: "A", type: "door", width: 280, distanceFromWallStart: 10 },
    ] as any;
    const plan = parseAiPlan({
      units: [{ unit: "sinkBase", wallId: "A", offsetCm: 110, widthCm: 80 }],
    })!;
    expect(compileAiPlan(plan, tiny, openings, [], template, utilities)).toHaveLength(0);
  });

  it("close water+gas on one wall: both final units keep their service links", () => {
    const utilities = [
      { id: "u1", kind: "water", wallId: "A", positionAlongWall: 150 },
      { id: "u2", kind: "gas", wallId: "A", positionAlongWall: 250 },
    ] as any;
    const plan = parseAiPlan({
      units: [
        { unit: "sinkBase", wallId: "A", offsetCm: 110, widthCm: 80 },
        { unit: "cooktopBase", wallId: "A", offsetCm: 220, widthCm: 60 },
      ],
    })!;
    const cabs = compileAiPlan(plan, segments, [], [], template, utilities);
    const sink = cabs.find((c) => /sink/.test(c.catalogId))!;
    const cook = cabs.find((c) => /cooktop/.test(c.catalogId))!;
    expect(sink.wallId).toBe("A");
    expect(cook.wallId).toBe("A");
    const sinkDef = findCabinetDef(sink.catalogId)!;
    const cookDef = findCabinetDef(cook.catalogId)!;
    expect(Math.abs((sink.offset + sinkDef.width / 2) / CM - 150)).toBeLessThanOrEqual(60);
    expect(Math.abs((cook.offset + cookDef.width / 2) / CM - 250)).toBeLessThanOrEqual(60);
  });
});

describe("complete-kitchen contract (hood, dishwasher, multi-point services)", () => {
  const template = KITCHEN_TEMPLATES[0];
  const segments = getWallSegments("L", [
    { id: "A", length: 400 },
    { id: "B", length: 300 },
  ]);

  it("auto-pairs any cooktop with a range hood decor centered above it", () => {
    const plan = parseAiPlan({
      units: [
        { unit: "sinkBase", wallId: "A", offsetCm: 0, widthCm: 80 },
        { unit: "cooktopBase", wallId: "A", offsetCm: 200, widthCm: 60 },
      ],
    })!;
    const cabs = compileAiPlan(plan, segments, [], [], template);
    const decor = buildAutoDecor(cabs, EXTRA_CABINET_DEFS as any);
    const hood = decor.find((d) => d.decorId === "decor-range-hood");
    expect(hood).toBeTruthy();
    const cook = cabs.find((c) => /cooktop/.test(c.catalogId))!;
    expect(hood!.wallId).toBe(cook.wallId);
  });

  it("places the dishwasher adjacent to the sink (final positions)", () => {
    const plan = parseAiPlan({
      units: [
        { unit: "sinkBase", wallId: "A", offsetCm: 100, widthCm: 80 },
        { unit: "dishwasherBase", wallId: "B", offsetCm: 0, widthCm: 60 },
      ],
    })!;
    const cabs = compileAiPlan(plan, segments, [], [], template);
    const sink = cabs.find((c) => /sink/.test(c.catalogId))!;
    const dish = cabs.find((c) => /dishwasher/.test(c.catalogId))!;
    expect(dish.wallId).toBe(sink.wallId);
    const sinkDef = findCabinetDef(sink.catalogId)!;
    const dishDef = findCabinetDef(dish.catalogId)!;
    const gap = Math.min(
      Math.abs(dish.offset - (sink.offset + sinkDef.width)),
      Math.abs(sink.offset - (dish.offset + dishDef.width))
    );
    expect(gap).toBeLessThanOrEqual(0.05);
  });

  it("sink must satisfy BOTH water and drain when both are supplied", () => {
    const utilities = [
      { id: "u1", kind: "water", wallId: "A", positionAlongWall: 180 },
      { id: "u2", kind: "drain", wallId: "A", positionAlongWall: 240 },
    ] as any;
    const plan = parseAiPlan({
      units: [{ unit: "sinkBase", wallId: "A", offsetCm: 0, widthCm: 80 }],
    })!;
    const cabs = compileAiPlan(plan, segments, [], [], template, utilities);
    const sink = cabs.find((c) => /sink/.test(c.catalogId))!;
    const def = findCabinetDef(sink.catalogId)!;
    const centerCm = (sink.offset + def.width / 2) / CM;
    expect(Math.abs(centerCm - 180)).toBeLessThanOrEqual(60);
    expect(Math.abs(centerCm - 240)).toBeLessThanOrEqual(60);
  });

  it("rejects the design when water and drain are irreconcilably far apart", () => {
    const utilities = [
      { id: "u1", kind: "water", wallId: "A", positionAlongWall: 50 },
      { id: "u2", kind: "drain", wallId: "A", positionAlongWall: 350 },
    ] as any;
    const plan = parseAiPlan({
      units: [{ unit: "sinkBase", wallId: "A", offsetCm: 0, widthCm: 80 }],
    })!;
    expect(compileAiPlan(plan, segments, [], [], template, utilities)).toHaveLength(0);
  });

  it("fallback plan carries lighting intent and a dishwasher on roomy kitchens", () => {
    const fb = buildFallbackPlan(segments, [], [], "auto");
    expect(fb.lighting?.underCabinetLed).toBe(true);
    expect(fb.units.some((u) => u.unit === "dishwasherBase")).toBe(true);
  });
});

describe("service vocabulary and cross-wall handling", () => {
  const template = KITCHEN_TEMPLATES[0];
  const segments = getWallSegments("L", [
    { id: "A", length: 400 },
    { id: "B", length: 300 },
  ]);

  it("rejects designs when water and drain are on different walls", () => {
    const utilities = [
      { id: "u1", kind: "water", wallId: "A", positionAlongWall: 200 },
      { id: "u2", kind: "drain", wallId: "B", positionAlongWall: 100 },
    ] as any;
    const plan = parseAiPlan({
      units: [{ unit: "sinkBase", wallId: "A", offsetCm: 160, widthCm: 80 }],
    })!;
    expect(compileAiPlan(plan, segments, [], [], template, utilities)).toHaveLength(0);
  });

  it("floor drains (no wallId) do not laterally constrain the sink", () => {
    const utilities = [
      { id: "u1", kind: "water", wallId: "A", positionAlongWall: 200 },
      { id: "u2", kind: "drain", x: 100, y: 100 }, // floor drain
    ] as any;
    const plan = parseAiPlan({
      units: [{ unit: "sinkBase", wallId: "A", offsetCm: 160, widthCm: 80 }],
    })!;
    const cabs = compileAiPlan(plan, segments, [], [], template, utilities);
    const sink = cabs.find((c) => /sink/.test(c.catalogId))!;
    expect(sink.wallId).toBe("A");
    const def = findCabinetDef(sink.catalogId)!;
    expect(Math.abs((sink.offset + def.width / 2) / CM - 200)).toBeLessThanOrEqual(60);
  });

  it("electrical-only kitchens (outlet) constrain the cooktop to an outlet", () => {
    const utilities = [
      { id: "u1", kind: "outlet", wallId: "B", positionAlongWall: 150 },
    ] as any;
    const plan = parseAiPlan({
      units: [
        { unit: "sinkBase", wallId: "A", offsetCm: 50, widthCm: 80 },
        { unit: "cooktopBase", wallId: "A", offsetCm: 300, widthCm: 60 },
      ],
    })!;
    const cabs = compileAiPlan(plan, segments, [], [], template, utilities);
    const cook = cabs.find((c) => /cooktop/.test(c.catalogId))!;
    expect(cook.wallId).toBe("B");
    const def = findCabinetDef(cook.catalogId)!;
    expect(Math.abs((cook.offset + def.width / 2) / CM - 150)).toBeLessThanOrEqual(60);
  });

  it("gas outranks outlets when both exist", () => {
    const utilities = [
      { id: "u1", kind: "outlet", wallId: "A", positionAlongWall: 50 },
      { id: "u2", kind: "gas", wallId: "B", positionAlongWall: 200 },
    ] as any;
    const plan = parseAiPlan({
      units: [
        { unit: "sinkBase", wallId: "A", offsetCm: 250, widthCm: 80 },
        { unit: "cooktopBase", wallId: "A", offsetCm: 40, widthCm: 60 },
      ],
    })!;
    const cabs = compileAiPlan(plan, segments, [], [], template, utilities);
    const cook = cabs.find((c) => /cooktop/.test(c.catalogId))!;
    expect(cook.wallId).toBe("B");
  });
});

describe("mandatory core invariants under crowding", () => {
  const template = KITCHEN_TEMPLATES[0];
  const segments = getWallSegments("L", [
    { id: "A", length: 400 },
    { id: "B", length: 300 },
  ]);

  it("crowded plan still ships sink + cooktop (core placed first)", () => {
    const plan = parseAiPlan({
      units: [
        { unit: "tallPantry", wallId: "A", offsetCm: 0, widthCm: 90 },
        { unit: "fridgeHousing", wallId: "A", offsetCm: 90, widthCm: 70 },
        { unit: "ovenTower", wallId: "A", offsetCm: 160 },
        { unit: "baseCabinet", wallId: "A", offsetCm: 220, widthCm: 100 },
        { unit: "baseCabinet", wallId: "B", offsetCm: 0, widthCm: 100 },
        { unit: "baseCabinet", wallId: "B", offsetCm: 100, widthCm: 100 },
        { unit: "sinkBase", wallId: "B", offsetCm: 200, widthCm: 80 },
        { unit: "cooktopBase", wallId: "A", offsetCm: 320, widthCm: 60 },
      ],
    })!;
    const cabs = compileAiPlan(plan, segments, [], [], template);
    expect(cabs.some((c) => /sink/.test(c.catalogId))).toBe(true);
    expect(cabs.some((c) => /cooktop/.test(c.catalogId))).toBe(true);
  });

  it("a shipped dishwasher always touches the sink, else it is omitted", () => {
    const plan = parseAiPlan({
      units: [
        { unit: "sinkBase", wallId: "A", offsetCm: 100, widthCm: 80 },
        { unit: "baseCabinet", wallId: "A", offsetCm: 180, widthCm: 60 },
        { unit: "dishwasherBase", wallId: "B", offsetCm: 0, widthCm: 60 },
        { unit: "cooktopBase", wallId: "B", offsetCm: 100, widthCm: 60 },
      ],
    })!;
    const cabs = compileAiPlan(plan, segments, [], [], template);
    const dish = cabs.find((c) => /dishwasher/.test(c.catalogId));
    if (dish) {
      const sink = cabs.find((c) => /sink/.test(c.catalogId))!;
      const sinkDef = findCabinetDef(sink.catalogId)!;
      const dishDef = findCabinetDef(dish.catalogId)!;
      expect(dish.wallId).toBe(sink.wallId);
      const touching =
        Math.abs(dish.offset - (sink.offset + sinkDef.width)) <= 0.02 ||
        Math.abs(sink.offset - (dish.offset + dishDef.width)) <= 0.02;
      expect(touching).toBe(true);
    }
  });

  it("roomy kitchens get a dishwasher even when the model omits it", () => {
    const plan = parseAiPlan({
      units: [
        { unit: "sinkBase", wallId: "A", offsetCm: 100, widthCm: 80 },
        { unit: "cooktopBase", wallId: "B", offsetCm: 100, widthCm: 60 },
      ],
    })!;
    const norm = normalizePlan(plan, segments, []);
    expect(norm.units.some((u) => u.unit === "dishwasherBase")).toBe(true);
  });
});
