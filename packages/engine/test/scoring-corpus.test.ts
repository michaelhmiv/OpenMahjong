import { describe, expect, it } from "vitest";
import { countTiles, parseCounts } from "../src/tiles.js";
import { scoreHand } from "../src/scoring.js";
import { SCORING_VECTORS } from "./scoring-vectors.js";

describe("scoring corpus scaffolding (A1)", () => {
  it("ships at least 10 worked examples", () => {
    expect(SCORING_VECTORS.length).toBeGreaterThanOrEqual(10);
  });

  for (const v of SCORING_VECTORS) {
    it(`${v.id}: vector is well-formed — ${v.description}`, () => {
      const hand = parseCounts(v.hand);
      expect(countTiles(hand)).toBe(14);
      const win = parseCounts(v.winningTile);
      expect(countTiles(win)).toBe(1);
      const winType = win.findIndex((n) => n === 1);
      expect(hand[winType]).toBeGreaterThanOrEqual(1);
      // Exactly one payment shape, matching the win type.
      if (v.context.winType === "ron") {
        expect(v.expected.ronPoints).not.toBeNull();
        expect(v.expected.tsumoPoints).toBeNull();
      } else {
        expect(v.expected.tsumoPoints).not.toBeNull();
        expect(v.expected.ronPoints).toBeNull();
      }
      // Fu is a standard value (0 only for yakuman).
      if (v.expected.yakumanMultiple > 0) expect(v.expected.fu).toBe(0);
      else expect([20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110]).toContain(v.expected.fu);
      expect(v.expected.han).toBeGreaterThanOrEqual(1);
    });
  }

  it("the scorer itself is honestly not implemented yet", () => {
    const v = SCORING_VECTORS[0]!;
    expect(() =>
      scoreHand({
        handCounts: parseCounts(v.hand),
        winningTileType: parseCounts(v.winningTile).findIndex((n) => n === 1),
        winType: v.context.winType,
        seatWind: v.context.seatWind,
        roundWind: v.context.roundWind,
        riichi: v.context.riichi,
        dora: v.context.dora,
        honba: v.context.honba,
        riichiSticks: v.context.riichiSticks,
      }),
    ).toThrow(/not yet implemented/);
  });
});
