/**
 * Hand-scoring corpus — SCAFFOLDING for brief acceptance check A1.
 *
 * A1 requires ≥150 fully verified vectors against the real scorer. The
 * scorer itself lands in the next engine slice (src/scoring.ts currently
 * throws "not yet implemented" on purpose). This file establishes the
 * data-driven format and ships 10 hand-worked examples whose han/fu/points
 * were derived manually from the standard scoring rules:
 *
 *   basic points = fu × 2^(han+2), capped at mangan (2000) for ≤5 han;
 *   haneman 6–7 han = 3000, baeman 8–10 = 4000, sanbaiman 11–12 = 6000,
 *   yakuman = 8000 per multiple. Ron: ×4 (non-dealer) / ×6 (dealer).
 *   Tsumo: non-dealers pay ×1 basic, dealer pays ×2 (dealer winner: all
 *   pay ×2). Each payment rounded up to the next 100. Chiitoitsu is a
 *   fixed 25 fu. All examples have honba 0 and no riichi sticks in play.
 *
 * Winds are tile type indices: 27 = East, 28 = South.
 */

export interface ScoringVector {
  readonly id: string;
  readonly description: string;
  /** Complete 14-tile hand, notation per tiles.ts parseCounts. */
  readonly hand: string;
  /** Winning tile, single-tile notation, e.g. "4s". */
  readonly winningTile: string;
  readonly context: {
    readonly winType: "ron" | "tsumo";
    readonly seatWind: number;
    readonly roundWind: number;
    readonly riichi: boolean;
    readonly dora: number;
    readonly honba: number;
    readonly riichiSticks: number;
  };
  readonly expected: {
    readonly han: number;
    /** 0 where fu does not apply (yakuman). */
    readonly fu: number;
    readonly yakumanMultiple: number;
    readonly ronPoints: number | null;
    readonly tsumoPoints: { readonly nonDealer: number; readonly dealer: number } | null;
  };
}

const E = 27;
const S = 28;

export const SCORING_VECTORS: readonly ScoringVector[] = [
  {
    id: "pinfu-ron-1-30",
    description: "Pinfu, ron, non-dealer: 1 han 30 fu = 1000",
    hand: "234m567p678s234s99m",
    winningTile: "4s",
    context: { winType: "ron", seatWind: S, roundWind: E, riichi: false, dora: 0, honba: 0, riichiSticks: 0 },
    expected: { han: 1, fu: 30, yakumanMultiple: 0, ronPoints: 1000, tsumoPoints: null },
  },
  {
    id: "riichi-tanki-ron-1-40",
    description: "Riichi only, tanki wait, ron, non-dealer: 1 han 40 fu = 1300 (20 base + 10 closed ron + 2 tanki = 32, rounds to 40)",
    hand: "111m234p567p345s99s",
    winningTile: "9s",
    context: { winType: "ron", seatWind: S, roundWind: E, riichi: true, dora: 0, honba: 0, riichiSticks: 0 },
    expected: { han: 1, fu: 40, yakumanMultiple: 0, ronPoints: 1300, tsumoPoints: null },
  },
  {
    id: "chiitoitsu-ron-2-25",
    description: "Chiitoitsu, ron, non-dealer: 2 han, fixed 25 fu = 1600",
    hand: "1122m3344p5566s77z",
    winningTile: "7z",
    context: { winType: "ron", seatWind: S, roundWind: E, riichi: false, dora: 0, honba: 0, riichiSticks: 0 },
    expected: { han: 2, fu: 25, yakumanMultiple: 0, ronPoints: 1600, tsumoPoints: null },
  },
  {
    id: "yakuhai-ron-1-40",
    description: "Yakuhai (green dragon triplet), tanki ron, non-dealer: 1 han 40 fu = 1300 (20 + 10 closed ron + 4 closed honor triplet + 2 tanki = 36, rounds to 40)",
    hand: "666z345m678p234s55p",
    winningTile: "5p",
    context: { winType: "ron", seatWind: S, roundWind: E, riichi: false, dora: 0, honba: 0, riichiSticks: 0 },
    expected: { han: 1, fu: 40, yakumanMultiple: 0, ronPoints: 1300, tsumoPoints: null },
  },
  {
    id: "ittsu-ron-1-40",
    description: "Ittsu (pure straight in man), tanki ron, non-dealer: 1 han 40 fu = 1300",
    hand: "123m456m789m345p55s",
    winningTile: "5s",
    context: { winType: "ron", seatWind: S, roundWind: E, riichi: false, dora: 0, honba: 0, riichiSticks: 0 },
    expected: { han: 1, fu: 40, yakumanMultiple: 0, ronPoints: 1300, tsumoPoints: null },
  },
  {
    id: "mangan-ron-riichi-iipeikou-dora3",
    description: "Riichi + iipeikou + 3 dora = 5 han mangan, ron, non-dealer: 8000 (fu 40 recorded; mangan caps basic points)",
    hand: "334455m678p234s99s",
    winningTile: "9s",
    context: { winType: "ron", seatWind: S, roundWind: E, riichi: true, dora: 3, honba: 0, riichiSticks: 0 },
    expected: { han: 5, fu: 40, yakumanMultiple: 0, ronPoints: 8000, tsumoPoints: null },
  },
  {
    id: "haneman-dealer-ron-6-30",
    description: "Dealer ron, riichi + pinfu + tanyao + iipeikou + 2 dora = 6 han haneman: 18000, 30 fu",
    hand: "334455p678m234s88m",
    winningTile: "4s",
    context: { winType: "ron", seatWind: E, roundWind: E, riichi: true, dora: 2, honba: 0, riichiSticks: 0 },
    expected: { han: 6, fu: 30, yakumanMultiple: 0, ronPoints: 18000, tsumoPoints: null },
  },
  {
    id: "tsumo-tanyao-2-30",
    description: "Menzen tsumo + tanyao, non-dealer: 2 han 30 fu (20 + 2 tsumo + 4 closed simple triplet + 2 tanki = 28, rounds to 30); others pay 500, dealer pays 1000",
    hand: "777m345p678p234s55s",
    winningTile: "5s",
    context: { winType: "tsumo", seatWind: S, roundWind: E, riichi: false, dora: 0, honba: 0, riichiSticks: 0 },
    expected: { han: 2, fu: 30, yakumanMultiple: 0, ronPoints: null, tsumoPoints: { nonDealer: 500, dealer: 1000 } },
  },
  {
    id: "kokushi-yakuman-dealer-tsumo",
    description: "Kokushi musou (13-wait shape), dealer tsumo: single yakuman, 16000 all",
    hand: "119m19p19s1234567z",
    winningTile: "9m",
    context: { winType: "tsumo", seatWind: E, roundWind: E, riichi: false, dora: 0, honba: 0, riichiSticks: 0 },
    expected: { han: 13, fu: 0, yakumanMultiple: 1, ronPoints: null, tsumoPoints: { nonDealer: 16000, dealer: 16000 } },
  },
  {
    id: "dealer-tsumo-riichi-iipeikou-3-30",
    description: "Dealer tsumo, riichi + tsumo + iipeikou = 3 han 30 fu (20 + 2 tsumo + 2 tanki = 24, rounds to 30): 2000 all",
    hand: "334455m678p234s99s",
    winningTile: "9s",
    context: { winType: "tsumo", seatWind: E, roundWind: E, riichi: true, dora: 0, honba: 0, riichiSticks: 0 },
    expected: { han: 3, fu: 30, yakumanMultiple: 0, ronPoints: null, tsumoPoints: { nonDealer: 2000, dealer: 2000 } },
  },
];
