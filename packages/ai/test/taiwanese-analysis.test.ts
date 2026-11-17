import { describe, it, expect } from "vitest";
import {
  createTaiwaneseAdapter,
  createRng,
  standardDistance,
  type Tile,
} from "@openmahjong/engine";
import { shantenTaiwaneseFast } from "../src/analysis.js";
describe("independent five-set analysis differential", () => {
  it("matches the generic engine DFS on random sixteen/seventeen-tile hands and fixed-set counts", () => {
    const rng = createRng("taiwanese-distance-oracle");
    for (let i = 0; i < 180; i++) {
      const melds = i % 6,
        n = 16 - 3 * melds + (i % 2),
        c = new Array<number>(34).fill(0);
      const tiles = rng.shuffle(
        createTaiwaneseAdapter()
          .inventory()
          .filter((t) => t.type < 34),
      ) as Tile[];
      tiles.slice(0, n).forEach((t) => c[t.type]!++);
      expect(shantenTaiwaneseFast(c, melds)).toBe(
        standardDistance(c, melds, 5),
      );
    }
  });
});
