import { describe, expect, it } from "vitest";
import { countTiles, parseCounts, type TileType } from "../src/tiles.js";
import { scoreHand, type Meld, type ScoreInput } from "../src/scoring.js";
import { SCORING_VECTORS, type ScoringVector } from "./scoring-vectors.js";

/** Every yaku id the scorer can emit; A1 requires each to be exercised. */
const ALL_YAKU_IDS = [
  "riichi", "double-riichi", "ippatsu", "menzen-tsumo", "pinfu", "iipeikou",
  "ryanpeikou", "tanyao", "yakuhai-haku", "yakuhai-hatsu", "yakuhai-chun",
  "yakuhai-seat", "yakuhai-round", "haitei", "houtei", "rinshan", "chankan",
  "honchan", "junchan", "ittsu", "sanshoku-doujun", "sanshoku-doukou",
  "toitoi", "sanankou", "sankantsu", "honitsu", "chinitsu", "chiitoitsu",
  "shousuushi", "daisuushi", "tsuiisou", "honroutou", "chuuren",
  "chuuren-junsei", "suukantsu", "suuankou", "suuankou-tanki", "kokushi",
  "kokushi-13", "tenhou", "chiihou", "ryuuiisou",
] as const;

function expandNotation(notation: string): TileType[] {
  const counts = parseCounts(notation);
  const tiles: TileType[] = [];
  counts.forEach((n, t) => {
    for (let i = 0; i < n; i++) tiles.push(t);
  });
  return tiles;
}

function toInput(v: ScoringVector): ScoreInput {
  const melds: Meld[] = (v.melds ?? []).map((m) => ({
    kind: m.kind,
    tiles: expandNotation(m.tiles),
  }));
  return {
    handCounts: parseCounts(v.hand),
    melds,
    winningTileType: expandNotation(v.winningTile)[0]!,
    winType: v.context.winType,
    seatWind: v.context.seatWind,
    roundWind: v.context.roundWind,
    riichi: v.context.riichi,
    doubleRiichi: v.context.doubleRiichi ?? false,
    ippatsu: v.context.ippatsu ?? false,
    haitei: v.context.haitei ?? false,
    houtei: v.context.houtei ?? false,
    rinshan: v.context.rinshan ?? false,
    chankan: v.context.chankan ?? false,
    firstDrawTsumo: v.context.firstDrawTsumo ?? false,
    dora: v.context.dora,
    honba: v.context.honba,
    riichiSticks: v.context.riichiSticks,
  };
}

describe("scoring corpus (brief A1)", () => {
  it("ships at least 150 vectors", () => {
    expect(SCORING_VECTORS.length).toBeGreaterThanOrEqual(150);
  });

  it("has unique vector ids", () => {
    const ids = SCORING_VECTORS.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("exercises every yaku at least once", () => {
    const seen = new Set(SCORING_VECTORS.flatMap((v) => v.expected.yaku));
    for (const id of ALL_YAKU_IDS) {
      expect(seen, `no vector expects yaku ${id}`).toContain(id);
    }
  });

  for (const v of SCORING_VECTORS) {
    describe(v.id, () => {
      it(`is well-formed — ${v.description}`, () => {
        const hand = parseCounts(v.hand);
        const kanCount = (v.melds ?? []).filter(
          (m) => m.kind === "ankan" || m.kind === "daiminkan" || m.kind === "shouminkan",
        ).length;
        expect(countTiles(hand)).toBe(14 + kanCount);
        const win = expandNotation(v.winningTile);
        expect(win).toHaveLength(1);
        // Meld tiles are part of the hand; the winning tile is in the rest.
        const rest = [...hand];
        for (const m of v.melds ?? []) {
          for (const t of expandNotation(m.tiles)) {
            expect(rest[t]!).toBeGreaterThanOrEqual(1);
            rest[t]!--;
          }
        }
        expect(rest[win[0]!]!).toBeGreaterThanOrEqual(1);
        if (v.context.winType === "ron") {
          expect(v.expected.ronPoints).not.toBeNull();
          expect(v.expected.tsumoPoints).toBeNull();
        } else {
          expect(v.expected.tsumoPoints).not.toBeNull();
          expect(v.expected.ronPoints).toBeNull();
        }
        if (v.expected.yakumanMultiple > 0) expect(v.expected.fu).toBe(0);
        else {
          expect([20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110]).toContain(v.expected.fu);
        }
        expect(v.expected.han).toBeGreaterThanOrEqual(1);
      });

      it(`scores exactly — ${v.description}`, () => {
        const result = scoreHand(toInput(v));
        expect(result.han).toBe(v.expected.han);
        expect(result.fu).toBe(v.expected.fu);
        expect(result.yakumanMultiple).toBe(v.expected.yakumanMultiple);
        expect(result.ronPoints).toBe(v.expected.ronPoints);
        expect(result.tsumoPoints).toEqual(v.expected.tsumoPoints);
        expect([...result.yaku.map((y) => y.id)].sort()).toEqual([...v.expected.yaku].sort());
        // Dora is reported as counted, except for true yakuman hands (where
        // dora never counts). A kazoe yakuman — yakumanMultiple 1 with only
        // ordinary yaku — reached 13 han *through* its dora, so it reports it.
        const YAKUMAN_IDS = new Set([
          "shousuushi", "daisuushi", "tsuiisou", "honroutou", "chuuren",
          "chuuren-junsei", "suukantsu", "suuankou", "suuankou-tanki",
          "kokushi", "kokushi-13", "tenhou", "chiihou", "ryuuiisou",
        ]);
        const trueYakuman = v.expected.yaku.some((id) => YAKUMAN_IDS.has(id));
        expect(result.dora).toBe(trueYakuman ? 0 : v.context.dora);
        expect(result.stickPoints).toBe(v.context.riichiSticks * 1000);
      });
    });
  }
});
