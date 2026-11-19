import { describe, expect, it } from "vitest";
import { onlineHandTileSize } from "../src/online.js";

/**
 * Regression (CI run 44574304623, postgres job): the four-seat
 * browser run passed riichi, Hong Kong and MCR, then timed out
 * clicking the first Discard button in the Taiwanese game. A closed
 * Taiwanese hand holds 17 tiles; at the shipped 25px hand size the
 * centered hand row needs 442px of the 370px table, so the edge
 * tiles render outside the viewport and cannot be tapped — by the
 * test, or by a player. The online table now sizes hand tiles to
 * the row budget; every case below must fit 370px end to end
 * (hand tiles at size+1 margin, meld/flower tiles at ~21.5px).
 */
describe("online hand tile size fits the row", () => {
  const fits = (
    hand: number,
    meldTiles: number,
    meldGroups: number,
    flowers: number,
  ) => {
    const size = onlineHandTileSize(hand, meldTiles, meldGroups, flowers);
    const total =
      hand * (size + 1) +
      meldTiles * 21.5 +
      meldGroups * 10 +
      (flowers ? flowers * 21.5 + 10 : 0);
    return { size, total };
  };

  it("keeps the shipped 25px for ordinary hands", () => {
    expect(onlineHandTileSize(14, 0, 0, 0)).toBe(25);
    expect(onlineHandTileSize(11, 3, 1, 0)).toBe(25);
    expect(onlineHandTileSize(8, 6, 2, 0)).toBe(25);
  });

  it("shrinks a closed 17-tile Taiwanese hand to fit", () => {
    const { size, total } = fits(17, 0, 0, 0);
    expect(size).toBe(20);
    expect(total).toBeLessThanOrEqual(370);
  });

  it("still fits with set-aside flowers and melds", () => {
    for (const args of [
      [17, 0, 0, 2],
      [17, 0, 0, 4],
      [14, 3, 1, 2],
      [8, 9, 3, 1],
    ] as const) {
      const { total } = fits(...args);
      expect(total, JSON.stringify(args)).toBeLessThanOrEqual(370);
    }
  });

  it("never exceeds the shipped size and handles an empty hand", () => {
    expect(onlineHandTileSize(1, 0, 0, 0)).toBe(25);
    expect(onlineHandTileSize(0, 0, 0, 0)).toBe(25);
  });
});
