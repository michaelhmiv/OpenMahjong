/**
 * Hand scoring (brief §5) — NOT YET IMPLEMENTED.
 *
 * The full scorer (yaku detection, fu calculation, han/fu → points) lands
 * in the next engine slice, proven against the ≥150-vector corpus of brief
 * acceptance check A1. The scoring corpus scaffolding already lives in
 * `test/scoring-vectors.ts` as data with hand-worked expected values.
 *
 * This stub exists so the API shape is fixed early. It throws rather than
 * returning a plausible-looking wrong answer.
 */

export type WinType = "ron" | "tsumo";

export interface ScoreInput {
  /** Per-type counts of the complete 14-tile hand (closed portion + meld tiles). */
  readonly handCounts: readonly number[];
  /** Tile type the hand was completed on. */
  readonly winningTileType: number;
  readonly winType: WinType;
  /** Seat wind type index (27=East … 30=North). */
  readonly seatWind: number;
  /** Round wind type index (27=East, 28=South for slice-1 games). */
  readonly roundWind: number;
  readonly riichi: boolean;
  /** Total dora (incl. ura/kandora and red fives) counted for the hand. */
  readonly dora: number;
  readonly honba: number;
  /** Riichi sticks on the table (paid to the winner). */
  readonly riichiSticks: number;
}

export interface ScoreResult {
  readonly han: number;
  readonly fu: number;
  readonly yakumanMultiple: number;
  /** Points paid by the discarder on ron (before honba/stick additions are reported separately). */
  readonly ronPoints: number;
  /** Per-player tsumo payments: { nonDealer, dealer } (dealer pays `dealer`). */
  readonly tsumoPoints: { readonly nonDealer: number; readonly dealer: number };
}

export function scoreHand(_input: ScoreInput): ScoreResult {
  throw new Error(
    "scoreHand is not yet implemented — it lands with the A1 scoring corpus in the next engine slice (see docs/brief-v1.md §5, §13).",
  );
}
