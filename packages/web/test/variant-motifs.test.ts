import { describe, it, expect } from "vitest";
import { variantAdapter } from "@openmahjong/engine";
import { variantHomeHand } from "../src/variant-motifs.js";
describe("variant-aware Play artwork", () => {
  for (const variant of ["hong-kong", "mcr", "taiwanese"] as const)
    it(`${variant} shows a physically possible eligible hand with no red fives`, () => {
      const adapter = variantAdapter(variant),
        tiles = variantHomeHand(variant),
        counts = new Array<number>(34).fill(0);
      tiles.forEach((t) => counts[t.type]!++);
      expect(tiles).toHaveLength(adapter.standingTiles + 1);
      expect(new Set(tiles.map((t) => t.id)).size).toBe(tiles.length);
      expect(tiles.some((t) => t.red)).toBe(false);
      expect(
        adapter.score({
          counts,
          melds: [],
          winningTile:
            variant === "hong-kong" ? 31 : variant === "mcr" ? 27 : 26,
          selfDraw: false,
          seatWind: 27,
          roundWind: 27,
          flowers: [],
          replacement: false,
          robbingQuad: false,
          lastWall: false,
          initial: false,
          lastCopy: false,
        }).eligible,
      ).toBe(true);
    });
});
