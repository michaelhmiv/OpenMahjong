/**
 * Hand analysis (brief §5): shanten and ukeire.
 *
 * Shanten is the number of tile exchanges needed to reach tenpai;
 * -1 means a complete hand. Computed as the minimum over the three forms:
 * standard (4 sets + pair), chiitoitsu (seven pairs), and kokushi (thirteen
 * orphans). Chiitoitsu and kokushi apply only to fully closed hands.
 *
 * All functions take per-type counts (see tiles.ts `parseCounts`) and are
 * type-level: a red five counts as its type.
 */

import { TILE_TYPE_COUNT, countTiles, isTerminalOrHonor, validateCounts } from "./tiles.js";

/** Terminal/honor type indices, for kokushi. */
const TERMINAL_OR_HONOR_TYPES: number[] = [];
for (let t = 0; t < TILE_TYPE_COUNT; t++) {
  if (isTerminalOrHonor(t)) TERMINAL_OR_HONOR_TYPES.push(t);
}

function shantenStandard(counts: readonly number[], melds: number): number {
  const c = [...counts];
  let best = 8;

  function dfs(i: number, mentsu: number, taatsu: number, pair: boolean): void {
    while (i < TILE_TYPE_COUNT && c[i] === 0) i++;
    if (i >= TILE_TYPE_COUNT) {
      const effectiveTaatsu = Math.min(taatsu, Math.max(0, 4 - mentsu));
      const s = 8 - 2 * mentsu - effectiveTaatsu - (pair ? 1 : 0);
      if (s < best) best = s;
      return;
    }
    const suited = i < 27;
    const rank = i % 9; // 0-based rank within the suit; meaningless for honors

    if (c[i]! >= 3) {
      c[i]! -= 3;
      dfs(i, mentsu + 1, taatsu, pair);
      c[i]! += 3;
    }
    if (suited && rank <= 6 && c[i + 1]! > 0 && c[i + 2]! > 0) {
      c[i]!--; c[i + 1]!--; c[i + 2]!--;
      dfs(i, mentsu + 1, taatsu, pair);
      c[i]!++; c[i + 1]!++; c[i + 2]!++;
    }
    if (!pair && c[i]! >= 2) {
      c[i]! -= 2;
      dfs(i, mentsu, taatsu, true);
      c[i]! += 2;
    }
    if (c[i]! >= 2) {
      c[i]! -= 2;
      dfs(i, mentsu, taatsu + 1, pair);
      c[i]! += 2;
    }
    if (suited && rank <= 7 && c[i + 1]! > 0) {
      c[i]!--; c[i + 1]!--;
      dfs(i, mentsu, taatsu + 1, pair);
      c[i]!++; c[i + 1]!++;
    }
    if (suited && rank <= 6 && c[i + 2]! > 0) {
      c[i]!--; c[i + 2]!--;
      dfs(i, mentsu, taatsu + 1, pair);
      c[i]!++; c[i + 2]!++;
    }
    // Discard one copy of this tile (it plays no part in the best shape).
    c[i]!--;
    dfs(i, mentsu, taatsu, pair);
    c[i]!++;
  }

  dfs(0, melds, 0, false);
  return best;
}

function shantenChiitoitsu(counts: readonly number[]): number {
  let pairs = 0;
  let unique = 0;
  for (let t = 0; t < TILE_TYPE_COUNT; t++) {
    if (counts[t]! > 0) unique++;
    if (counts[t]! >= 2) pairs++;
  }
  return 6 - pairs + Math.max(0, 7 - unique);
}

function shantenKokushi(counts: readonly number[]): number {
  let types = 0;
  let hasPair = false;
  for (const t of TERMINAL_OR_HONOR_TYPES) {
    if (counts[t]! > 0) types++;
    if (counts[t]! >= 2) hasPair = true;
  }
  return 13 - types - (hasPair ? 1 : 0);
}

/**
 * Shanten of a hand.
 *
 * @param counts per-type counts of the CLOSED portion of the hand.
 * @param melds number of open melds already formed (0–4). The closed portion
 *   must contain 13−3·melds or 14−3·melds tiles.
 */
export function shanten(counts: readonly number[], melds = 0): number {
  validateCounts(counts);
  if (!Number.isInteger(melds) || melds < 0 || melds > 4) {
    throw new Error("melds must be an integer from 0 to 4");
  }
  const closed = countTiles(counts);
  const total = closed + 3 * melds;
  if (total !== 13 && total !== 14) {
    throw new Error(`shanten expects a 13/14-tile hand (incl. melds), got ${total}`);
  }
  let result = shantenStandard(counts, melds);
  if (melds === 0) {
    result = Math.min(result, shantenChiitoitsu(counts), shantenKokushi(counts));
  }
  return result;
}

export interface UkeireTile {
  readonly type: number;
  /** Copies that could still be drawn: 4 − in hand − visible elsewhere. */
  readonly remaining: number;
}

export interface Ukeire {
  /** Shanten of the hand as given. */
  readonly shanten: number;
  /** Every tile type whose draw reduces shanten, with copies remaining. */
  readonly improving: readonly UkeireTile[];
  /** Total drawable improving copies. */
  readonly totalRemaining: number;
}

/**
 * Ukeire (tile acceptance) of a hand waiting to draw: the hand must hold
 * 13−3·melds tiles. `visible` counts tiles seen outside the hand (discards,
 * dora indicators, other players' melds) per type.
 */
export function ukeire(
  counts: readonly number[],
  visible: readonly number[],
  melds = 0,
): Ukeire {
  validateCounts(counts);
  validateCounts(visible, "visible");
  for (let t = 0; t < TILE_TYPE_COUNT; t++) {
    if (counts[t]! + visible[t]! > 4) throw new Error(`Known copies of type ${t} exceed 4`);
  }
  const closed = countTiles(counts);
  if (closed + 3 * melds !== 13) {
    throw new Error(`ukeire expects a 13-tile hand (incl. melds), got ${closed + 3 * melds}`);
  }
  const base = shanten(counts, melds);
  const work = [...counts];
  const improving: UkeireTile[] = [];
  let totalRemaining = 0;
  for (let t = 0; t < TILE_TYPE_COUNT; t++) {
    if (work[t]! >= 4) continue;
    work[t]!++;
    const improves = shanten(work, melds) < base;
    work[t]!--;
    if (!improves) continue;
    const remaining = 4 - counts[t]! - visible[t]!;
    if (remaining <= 0) continue;
    improving.push({ type: t, remaining });
    totalRemaining += remaining;
  }
  return { shanten: base, improving, totalRemaining };
}
