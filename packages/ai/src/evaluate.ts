/**
 * Discard evaluation — the shared core under both the CPU policy and
 * the coach (packages/coach). Pure extraction from policy.ts: every
 * candidate discard scored on the three stages the policy plays by —
 * efficiency (shanten, then ukeire), tile value (keep value), and
 * defense (danger against riichi threats). Behavior is unchanged; the
 * policy imports these back.
 */
import {
  TILE_TYPE_COUNT,
  countTiles,
  doraFromIndicator,
  isDragon,
  isSuited,
  isTerminalOrHonor,
  isWind,
  rankOf,
  suitOf,
  type PlayerView,
  type Tile,
  type TileType,
  type TurnContext,
} from "@openmahjong/engine";
import { shantenFast, ukeireFast, waitsFast } from "./analysis.js";
import { dangerOf, discardTypeSets, riichiThreats, visibleCounts } from "./danger.js";

// ---------------------------------------------------------------------------
// Small view helpers
// ---------------------------------------------------------------------------

export function countsOfTiles(tiles: readonly Tile[]): number[] {
  const counts = new Array<number>(TILE_TYPE_COUNT).fill(0);
  for (const t of tiles) counts[t.type]!++;
  return counts;
}

export function doraTypesOf(view: PlayerView): Set<TileType> {
  return new Set(view.doraIndicators.map((t) => doraFromIndicator(t.type)));
}

/** Dora (indicator dora + red fives) in a set of tile instances. */
export function doraInTiles(tiles: readonly Tile[], doraTypes: ReadonlySet<TileType>): number {
  let n = 0;
  for (const t of tiles) {
    if (t.red) n++;
    if (doraTypes.has(t.type)) n++;
  }
  return n;
}

export function ownSeatWind(view: PlayerView): TileType {
  return view.players[view.seat]!.seatWind;
}

/** Yakuhai for the viewer: any dragon, the round wind, or the seat wind. */
export function isYakuhai(type: TileType, view: PlayerView): boolean {
  return (
    isDragon(type) ||
    type === view.roundWind ||
    type === ownSeatWind(view)
  );
}

/**
 * A rough guaranteed-value proxy for a closed hand: dora in hand plus
 * one han per yakuhai triplet already held. Used for damaten and
 * push/fold judgments — deliberately conservative.
 */
export function valueProxy(view: PlayerView, counts: readonly number[], doraTypes: ReadonlySet<TileType>): number {
  let dora = 0;
  for (let t = 0; t < TILE_TYPE_COUNT; t++) {
    if (doraTypes.has(t)) dora += counts[t]!;
  }
  for (const m of view.melds) dora += doraInTiles(m.tiles, doraTypes);
  for (const tile of view.hand) if (tile.red) dora++;
  let yakuhaiTriplets = 0;
  for (let t = 0; t < TILE_TYPE_COUNT; t++) {
    if (counts[t]! >= 3 && isYakuhai(t, view)) yakuhaiTriplets++;
  }
  for (const m of view.melds) {
    if (m.kind !== "chi" && isYakuhai(m.tiles[0]!.type, view)) yakuhaiTriplets++;
  }
  return dora + yakuhaiTriplets;
}

/** How much a tile type is worth keeping (higher = keep): dora, red
 *  fives, yakuhai pairs, and suited tiles with neighbours all argue for
 *  retention; isolated terminals/honors argue for the discard pile. */
export function keepValue(
  type: TileType,
  counts: readonly number[],
  view: PlayerView,
  doraTypes: ReadonlySet<TileType>,
): number {
  let v = 0;
  if (doraTypes.has(type)) v += 6;
  if (isYakuhai(type, view)) v += counts[type]! >= 2 ? 5 : 2;
  if (counts[type]! >= 2) v += 3; // pair/triplet material
  if (isSuited(type)) {
    const rank = rankOf(type);
    const base = suitOf(type) * 9;
    if (rank >= 2 && counts[base + rank - 2]! > 0) v += 2;
    if (rank <= 8 && counts[base + rank]! > 0) v += 2;
    if (rank >= 3 && counts[base + rank - 3]! > 0) v += 1;
    if (rank <= 7 && counts[base + rank + 1]! > 0) v += 1;
  }
  if (isTerminalOrHonor(type) && counts[type]! === 1 && v <= 2) v -= 2;
  return v;
}

// ---------------------------------------------------------------------------
// Discard evaluation
// ---------------------------------------------------------------------------

export interface DiscardCandidate {
  readonly type: TileType;
  /** The instance to discard: a non-red copy when one exists. */
  readonly tile: Tile;
  /** Shanten of the hand after this discard. */
  readonly shantenAfter: number;
  /** Efficiency score within the same shanten (higher = better). */
  readonly efficiency: number;
  /** Danger against any riichi threat (0 when there is no threat). */
  readonly danger: number;
}

export function evaluateDiscards(view: PlayerView, ctx: TurnContext): DiscardCandidate[] {
  const counts = countsOfTiles(view.hand);
  const melds = view.melds.length;
  const visible = visibleCounts(view);
  const doraTypes = doraTypesOf(view);
  const threats = riichiThreats(view);
  const discardSets = threats.length > 0 ? discardTypeSets(view) : null;

  const candidates: DiscardCandidate[] = [];
  const seen = new Set<TileType>();
  for (const tile of view.hand) {
    if (seen.has(tile.type)) continue;
    seen.add(tile.type);
    const type = tile.type;
    // Prefer discarding a plain copy; the red five is kept when possible.
    const instance =
      view.hand.find((t) => t.type === type && !t.red) ??
      view.hand.find((t) => t.type === type)!;

    const after = [...counts];
    after[type]!--;
    const shantenAfter = shantenFast(after, melds);
    let efficiency = 0;
    if (countTiles(after) + 3 * melds === 13) {
      const ukeire = ukeireFast(after, visible, melds);
      efficiency =
        ukeire.totalRemaining * 100 +
        ukeire.improving.length * 5 -
        keepValue(type, counts, view, doraTypes) * 4;
      // A red five discarded is a dora thrown away: price it in.
      if (instance.red) efficiency -= 60;
      // At tenpai, WHAT you wait on matters: a wait on a yakuhai tile
      // (a dragon, or a wind that is worth han — double for a wind that
      // is both seat and round) is worth more than a bare wait.
      if (shantenAfter === 0) {
        for (const w of waitsFast(after, visible, melds)) {
          if (w.remaining <= 0) continue;
          if (isDragon(w.type)) efficiency += 10;
          else if (isWind(w.type)) {
            if (w.type === view.roundWind) efficiency += 10;
            if (w.type === ownSeatWind(view)) efficiency += 10;
          }
        }
      }
    }
    const danger = discardSets
      ? dangerOf(type, view, counts, visible, discardSets)
      : 0;
    candidates.push({ type, tile: instance, shantenAfter, efficiency, danger });
  }
  // ctx is part of the signature for symmetry with the engine callback;
  // discard evaluation itself needs only the view.
  void ctx;
  return candidates;
}

export function bestByEfficiency(candidates: DiscardCandidate[]): DiscardCandidate {
  let best = candidates[0]!;
  for (const c of candidates) {
    if (
      c.shantenAfter < best.shantenAfter ||
      (c.shantenAfter === best.shantenAfter && c.efficiency > best.efficiency) ||
      (c.shantenAfter === best.shantenAfter &&
        c.efficiency === best.efficiency &&
        c.type < best.type)
    ) {
      best = c;
    }
  }
  return best;
}

/** Among the shanten-optimal candidates, the safest one. */
export function safestAmongBest(candidates: DiscardCandidate[]): DiscardCandidate {
  const minShanten = Math.min(...candidates.map((c) => c.shantenAfter));
  const pool = candidates.filter((c) => c.shantenAfter === minShanten);
  let best = pool[0]!;
  for (const c of pool) {
    if (
      c.danger < best.danger ||
      (c.danger === best.danger && c.efficiency > best.efficiency) ||
      (c.danger === best.danger && c.efficiency === best.efficiency && c.type < best.type)
    ) {
      best = c;
    }
  }
  return best;
}

/** Full fold: safest discard; ties broken by least hand damage. */
export function safestOverall(candidates: DiscardCandidate[]): DiscardCandidate {
  let best = candidates[0]!;
  for (const c of candidates) {
    if (
      c.danger < best.danger ||
      (c.danger === best.danger && c.shantenAfter < best.shantenAfter) ||
      (c.danger === best.danger &&
        c.shantenAfter === best.shantenAfter &&
        c.efficiency > best.efficiency) ||
      (c.danger === best.danger &&
        c.shantenAfter === best.shantenAfter &&
        c.efficiency === best.efficiency &&
        c.type < best.type)
    ) {
      best = c;
    }
  }
  return best;
}
