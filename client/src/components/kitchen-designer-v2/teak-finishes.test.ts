import { describe, expect, it } from "vitest";
import {
  TEAK_FINISHES,
  getTeakFinish,
  resolveCabinetFinish,
  teakToRenderFinish,
} from "./teak-finishes";
import { buildAdekoFinish } from "./materials";

describe("Teak finish resolution rule (Phase 1A)", () => {
  it("uses the Teak finish when finishId is present and valid", () => {
    const r = resolveCabinetFinish({
      finishId: "teak-1026",
      doorPattern: "solid",
      finishColorHex: "#ffffff",
    });
    expect(r.id).toBe("teak-1026");
    expect(r.tint).toBe(TEAK_FINISHES["teak-1026"].fallbackHex);
    expect(r.wood).toBe(true); // woodgrain sample
  });

  it("falls back to the legacy pattern+color path when finishId is missing", () => {
    const r = resolveCabinetFinish({
      finishId: undefined,
      doorPattern: "wood",
      finishColorHex: "#9a7050",
    });
    expect(r).toEqual(buildAdekoFinish("wood", "#9a7050"));
  });

  it("falls back to the legacy path when finishId is unknown/invalid", () => {
    const r = resolveCabinetFinish({
      finishId: "teak-does-not-exist",
      doorPattern: "solid",
      finishColorHex: "#2e2f31",
    });
    expect(r).toEqual(buildAdekoFinish("solid", "#2e2f31"));
    expect(r.wood).toBe(false);
  });

  it("getTeakFinish handles null/undefined/empty safely", () => {
    expect(getTeakFinish(undefined)).toBeUndefined();
    expect(getTeakFinish(null)).toBeUndefined();
    expect(getTeakFinish("")).toBeUndefined();
  });

  it("teakToRenderFinish maps grain to the wood flag and keeps id", () => {
    const f = TEAK_FINISHES["teak-1026"];
    const r = teakToRenderFinish(f);
    expect(r).toEqual({
      id: f.id,
      tint: f.fallbackHex,
      wood: true,
      roughness: f.roughness,
    });
  });

  it("registry ids never use the adeko- prefix and placeholder is unapproved", () => {
    for (const [key, f] of Object.entries(TEAK_FINISHES)) {
      expect(key).toBe(f.id);
      expect(f.id.startsWith("adeko-")).toBe(false);
      expect(f.sampleCode.length).toBeGreaterThan(0);
    }
    expect(TEAK_FINISHES["teak-1026"].approved).toBe(false);
  });
});
