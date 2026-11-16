/**
 * Differential tests: the AI's fast analysis must agree with the
 * engine's `shanten`/`ukeire` everywhere. The engine is the authority;
 * any disagreement is a bug here, not there.
 */

import { describe, expect, it } from "vitest";
import {
  TILE_TYPE_COUNT,
  createRng,
  shanten,
  ukeire,
  type TileType,
} from "@openmahjong/engine";
import {
  shantenFast,
  shantenStandardFast,
  ukeireFast,
  waitsFast,
} from "../src/index.js";

/** A random legal counts vector: `tiles` tiles over the 34 types, ≤4 each. */
function randomCounts(rng: ReturnType<typeof createRng>, tiles: number): number[] {
  const counts = new Array<number>(TILE_TYPE_COUNT).fill(0);
  let placed = 0;
  while (placed < tiles) {
    const t = rng.nextInt(TILE_TYPE_COUNT) as TileType;
    if (counts[t]! >= 4) continue;
    counts[t]!++;
    placed++;
  }
  return counts;
}

/** Random visible counts that never exceed the copies outside the hand. */
function randomVisible(rng: ReturnType<typeof createRng>, hand: readonly number[]): number[] {
  const visible = new Array<number>(TILE_TYPE_COUNT).fill(0);
  for (let t = 0; t < TILE_TYPE_COUNT; t++) {
    const outside = 4 - hand[t]!;
    visible[t] = outside === 0 ? 0 : rng.nextInt(outside + 1);
  }
  return visible;
}

describe("fast shanten agrees with the engine", () => {
  // The differential tests compare against the engine's reference DFS
  // thousands of times; they take seconds and get explicit timeouts so
  // a loaded machine (parallel files on few cores) can't flake them
  // against the 5 s default.
  it("over 4000 seeded random 13/14-tile hands (closed)", () => {
    const rng = createRng("shanten-diff-closed");
    for (let i = 0; i < 4000; i++) {
      const tiles = i % 2 === 0 ? 13 : 14;
      const counts = randomCounts(rng, tiles);
      expect(shantenFast(counts, 0)).toBe(shanten(counts, 0));
    }
  }, 120_000);

  it("over 3000 seeded random hands with open melds", () => {
    const rng = createRng("shanten-diff-open");
    for (let i = 0; i < 3000; i++) {
      const melds = 1 + rng.nextInt(4); // 1..4
      const closed = (i % 2 === 0 ? 13 : 14) - 3 * melds;
      const counts = randomCounts(rng, closed);
      expect(shantenFast(counts, melds)).toBe(shanten(counts, melds));
      // With melds open, the engine's shanten IS the standard form.
      expect(shantenStandardFast(counts, melds)).toBe(shanten(counts, melds));
    }
  }, 120_000);

  // The reference here is the engine's own DFS on its worst case, so
  // this test is slow by construction — small sample, long timeout.
  it("on dense single-suit hands (the engine DFS's worst case)", () => {
    const rng = createRng("shanten-diff-dense");
    for (let i = 0; i < 150; i++) {
      const suit = rng.nextInt(3) * 9;
      const counts = new Array<number>(TILE_TYPE_COUNT).fill(0);
      let placed = 0;
      while (placed < 14) {
        const t = suit + rng.nextInt(9);
        if (counts[t]! >= 4) continue;
        counts[t]!++;
        placed++;
      }
      expect(shantenFast(counts, 0)).toBe(shanten(counts, 0));
    }
  }, 120_000);

  it("throws on malformed totals, like the engine", () => {
    const counts = new Array<number>(TILE_TYPE_COUNT).fill(0);
    counts[0] = 5;
    expect(() => shantenFast(counts, 0)).toThrow();
    expect(() => shanten(counts, 0)).toThrow();
  });
});

describe("fast ukeire agrees with the engine", () => {
  it("over 2000 seeded random 13-tile hands and visible sets", () => {
    const rng = createRng("ukeire-diff");
    for (let i = 0; i < 2000; i++) {
      const melds = rng.nextInt(3); // 0..2
      const counts = randomCounts(rng, 13 - 3 * melds);
      const visible = randomVisible(rng, counts);
      const fast = ukeireFast(counts, visible, melds);
      const ref = ukeire(counts, visible, melds);
      expect(fast.shanten).toBe(ref.shanten);
      expect(fast.totalRemaining).toBe(ref.totalRemaining);
      expect(fast.improving).toEqual(
        ref.improving.map((u) => ({ type: u.type, remaining: u.remaining })),
      );
    }
  }, 120_000);
});

describe("waits", () => {
  it("lists exactly the types that complete a tenpai hand", () => {
    // 234m 345p 678s 234s + pair of East: waits are East only... build a
    // cleaner ryanmen: 234m 345p 678s 34s EE → waits 2s/5s.
    const counts = new Array<number>(TILE_TYPE_COUNT).fill(0);
    const notation: [number, number][] = [
      [1, 1], [2, 1], [3, 1], // 234m (types 1,2,3)
      [12, 1], [13, 1], [14, 1], // 456p (types 12,13,14)
      [23, 1], [24, 1], [25, 1], // 678s (types 23,24,25)
      [20, 1], [21, 1], // 34s (types 20,21)
      [27, 2], // East pair
    ];
    for (const [t, n] of notation) counts[t] = n;
    const visible = new Array<number>(TILE_TYPE_COUNT).fill(0);
    const waits = waitsFast(counts, visible, 0);
    expect(waits.map((w) => w.type).sort((a, b) => a - b)).toEqual([19, 22]); // 2s, 5s
    expect(waits.every((w) => w.remaining === 4)).toBe(true);
  });

  it("is empty for a non-tenpai hand", () => {
    // Three triplets, one pair, two strays: 1-shanten.
    const counts = new Array<number>(TILE_TYPE_COUNT).fill(0);
    counts[0] = 3;
    counts[10] = 3;
    counts[20] = 3;
    counts[30] = 2;
    counts[33] = 1;
    counts[5] = 1;
    const visible = new Array<number>(TILE_TYPE_COUNT).fill(0);
    expect(shantenFast(counts, 0)).toBeGreaterThan(0);
    expect(waitsFast(counts, visible, 0)).toEqual([]);
  });
});
