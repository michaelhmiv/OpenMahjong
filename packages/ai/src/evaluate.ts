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

export function ownedMeldCounts(view: PlayerView): number[] {
  return countsOfTiles(view.melds.flatMap((m) => m.tiles));
}

export function doraTypesOf(view: PlayerView): Set<TileType> {
  return new Set(view.doraIndicators.map((t) => doraFromIndicator(t.type)));
}

/** Each indicator awards a separate dora, including repeated indicators. */
export function doraWeightsOf(view: PlayerView): ReadonlyMap<TileType, number> {
  const weights = new Map<TileType, number>();
  for (const indicator of view.doraIndicators) {
    const type = doraFromIndicator(indicator.type);
    weights.set(type, (weights.get(type) ?? 0) + 1);
  }
  return weights;
}

export type DoraValues = ReadonlySet<TileType> | ReadonlyMap<TileType, number>;

function doraWeight(type: TileType, values: DoraValues): number {
  return "get" in values ? values.get(type) ?? 0 : values.has(type) ? 1 : 0;
}

/** Dora (indicator dora + red fives) in a set of tile instances. */
export function doraInTiles(tiles: readonly Tile[], doraTypes: DoraValues): number {
  let n = 0;
  for (const t of tiles) {
    if (t.red) n++;
    n += doraWeight(t.type, doraTypes);
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

/** A double-wind triplet scores both the seat and round wind. */
export function yakuhaiHan(type: TileType, view: PlayerView): number {
  return Number(isDragon(type)) + Number(type === view.roundWind) + Number(type === ownSeatWind(view));
}

/**
 * A rough value proxy: dora in hand plus han from yakuhai triplets.
 * This is not a score and dora alone never establish a yaku.
 */
export function valueProxy(view: PlayerView, counts: readonly number[], doraTypes: DoraValues, discardedTile?: Tile): number {
  let dora = 0;
  for (let t = 0; t < TILE_TYPE_COUNT; t++) {
    dora += counts[t]! * doraWeight(t, doraTypes);
  }
  for (const m of view.melds) dora += doraInTiles(m.tiles, doraTypes);
  for (const tile of view.hand) if (tile.red && tile.id !== discardedTile?.id && counts[tile.type]! > 0) dora++;
  let yakuhaiTriplets = 0;
  for (let t = 0; t < TILE_TYPE_COUNT; t++) {
    if (counts[t]! >= 3) yakuhaiTriplets += yakuhaiHan(t, view);
  }
  for (const m of view.melds) {
    if (m.kind !== "chi") yakuhaiTriplets += yakuhaiHan(m.tiles[0]!.type, view);
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
  doraTypes: DoraValues,
): number {
  let v = 0;
  v += doraWeight(type, doraTypes) * 6;
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
  /** Exact instance; default evaluation chooses a plain representative
   * per type, while allInstances includes every physical alternative. */
  readonly tile: Tile;
  /** Shanten of the hand after this discard. */
  readonly shantenAfter: number;
  /** Efficiency score within the same shanten (higher = better). */
  readonly efficiency: number;
  /** Danger against any riichi threat (0 when there is no threat). */
  readonly danger: number;
}

export function evaluateDiscards(view: PlayerView, ctx: TurnContext, options: { readonly allInstances?: boolean } = {}): DiscardCandidate[] {
  const counts = countsOfTiles(view.hand);
  const melds = view.melds.length;
  const visible = visibleCounts(view);
  const doraTypes = doraWeightsOf(view);
  const threats = riichiThreats(view);
  const discardSets = threats.length > 0 ? discardTypeSets(view) : null;

  const candidates: DiscardCandidate[] = [];
  const seen = new Set<TileType>();
  for (const tile of view.hand) {
    if (!options.allInstances && seen.has(tile.type)) continue;
    seen.add(tile.type);
    const type = tile.type;
    // Prefer discarding a plain copy; the red five is kept when possible.
    const instance = options.allInstances ? tile : view.players[view.seat]!.riichi && ctx.drawnTile?.type === type
      ? ctx.drawnTile
      : view.hand.find((t) => t.type === type && !t.red) ?? tile;
    // In riichi only the actual drawn instance may be discarded. A
    // same-type plain copy cannot replace a drawn red five.
    if (view.players[view.seat]!.riichi && instance.id !== ctx.drawnTile?.id) continue;

    const after = [...counts];
    after[type]!--;
    const afterVisible = [...visible];
    afterVisible[type]!++;
    const shantenAfter = shantenFast(after, melds);
    let efficiency = 0;
    if (countTiles(after) + 3 * melds === 13) {
      const ukeire = ukeireFast(after, afterVisible, melds);
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
        for (const w of waitsFast(after, afterVisible, melds, ownedMeldCounts(view))) {
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
  return candidates;
}

/** Shared ordering for opponents and coaching; lower danger is safer,
 * but the danger values are relative heuristics, never probabilities. */
export function rankDiscardCandidates(
  view: PlayerView,
  ctx: TurnContext,
  candidates: readonly DiscardCandidate[],
): DiscardCandidate[] {
  if (candidates.length === 0) throw new Error("No legal discard candidate");
  const threats = riichiThreats(view);
  const byEfficiency = (a: DiscardCandidate, b: DiscardCandidate): number =>
    a.shantenAfter - b.shantenAfter || b.efficiency - a.efficiency || a.type - b.type;
  const best = [...candidates].sort(byEfficiency)[0]!;
  const pushValue = view.melds.every((m) => m.kind === "ankan") ||
    valueProxy(view, countsOfTiles(view.hand), doraWeightsOf(view)) >= 2;
  const folding = threats.length > 0 && best.shantenAfter !== 0 &&
    !(best.shantenAfter === 1 && pushValue);
  let pool = [...candidates];
  if (!folding && ctx.riichiDiscardIds.length > 0) {
    const riichiPool = candidates.filter((c) => c.shantenAfter === best.shantenAfter && ctx.riichiDiscardIds.includes(c.tile.id));
    if (riichiPool.length > 0) pool = riichiPool;
  }
  if (threats.length === 0) {
    return [...pool.sort(byEfficiency), ...candidates.filter((c) => !pool.includes(c)).sort(byEfficiency)];
  }
  if (folding) {
    return [...candidates].sort((a, b) => a.danger - b.danger || byEfficiency(a, b));
  }
  const minimum = Math.min(...pool.map((c) => c.shantenAfter));
  const head = pool.filter((c) => c.shantenAfter === minimum).sort((a, b) =>
    a.danger - b.danger || b.efficiency - a.efficiency || a.type - b.type);
  const tail = candidates.filter((c) => !head.includes(c)).sort((a, b) => a.danger - b.danger || byEfficiency(a, b));
  return [...head, ...tail];
}

/** Lightweight riichi/dama heuristic, shared so explanations describe
 * the same decision as the opponent. It does not compute expected value. */
export function shouldDeclareRiichi(view: PlayerView, chosen: DiscardCandidate): boolean {
  const counts = countsOfTiles(view.hand);
  counts[chosen.type]!--;
  const visible = visibleCounts(view);
  visible[chosen.type]!++;
  const liveWaits = waitsFast(counts, visible, view.melds.length, ownedMeldCounts(view)).reduce((sum, w) => sum + w.remaining, 0);
  if (liveWaits === 0 || (liveWaits === 1 && view.wallRemaining < 24)) return false;
  const closed = view.melds.every((m) => m.kind === "ankan");
  const yakuhai = counts.some((n, type) => n >= 3 && isYakuhai(type, view)) ||
    view.melds.some((m) => m.kind !== "chi" && isYakuhai(m.tiles[0]!.type, view));
  const tanyao = counts.every((n, type) => n === 0 || !isTerminalOrHonor(type)) &&
    view.melds.every((m) => m.tiles.every((t) => !isTerminalOrHonor(t.type)));
  // Dora without a yaku are not a valid ron. Only decline for this
  // rough high-value threshold when a yaku is independently known.
  return !(closed && (yakuhai || tanyao) && valueProxy(view, counts, doraWeightsOf(view), chosen.tile) >= 5);
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
