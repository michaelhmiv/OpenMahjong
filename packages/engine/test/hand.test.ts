import { describe, expect, it } from "vitest";
import { parseCounts } from "../src/tiles.js";
import { shanten, ukeire } from "../src/hand.js";
import { SHANTEN_VECTORS, UKEIRE_VECTORS } from "./shanten-vectors.js";

describe("shanten vectors (A2 harness)", () => {
  it("ships at least 40 vectors", () => {
    expect(SHANTEN_VECTORS.length + UKEIRE_VECTORS.length).toBeGreaterThanOrEqual(40);
  });

  for (const v of SHANTEN_VECTORS) {
    it(`${v.hand} (melds ${v.melds ?? 0}) = ${v.expected} — ${v.note}`, () => {
      expect(shanten(parseCounts(v.hand), v.melds ?? 0)).toBe(v.expected);
    });
  }
});

describe("ukeire vectors (A2 harness)", () => {
  for (const v of UKEIRE_VECTORS) {
    it(`${v.hand} — ${v.note}`, () => {
      const visible = v.visible ? parseCounts(v.visible) : new Array<number>(34).fill(0);
      const result = ukeire(parseCounts(v.hand), visible, v.melds ?? 0);
      const improving: Record<number, number> = {};
      for (const t of result.improving) improving[t.type] = t.remaining;
      expect(improving).toEqual(v.expectedImproving);
      expect(result.totalRemaining).toBe(v.expectedTotal);
    });
  }
});

describe("shanten/ukeire guards", () => {
  it("rejects wrong tile counts", () => {
    expect(() => shanten(parseCounts("234m"))).toThrow();
    expect(() => ukeire(parseCounts("234m456m"), new Array<number>(34).fill(0))).toThrow();
  });
});
