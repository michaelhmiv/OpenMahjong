/**
 * Fast hand analysis for the AI (brief §6 performance budget: every
 * decision < 50 ms of compute).
 *
 * The engine's `shanten` (packages/engine/src/hand.ts) is a single
 * depth-first search over all 34 tile types; on dense hands one ukeire
 * call (34 shanten calls) measured ~0.4 s uncached on a small VM — far
 * over budget when a discard decision needs an ukeire per candidate.
 * This module computes the SAME functions (shanten, ukeire, waits) with
 * two structural changes:
 *
 * 1. Segment decomposition. Standard-form groups never span suits, so
 *    the hand splits into four independent segments (man / pin / sou /
 *    honors). Each segment's DFS enumerates its Pareto-optimal
 *    (mentsu, taatsu, pair) outcomes — a tiny set — and the four sets
 *    combine arithmetically. Segment outcomes are memoized by a base-5
 *    encoding of the segment's counts, and mahjong hand shapes recur
 *    constantly, so the caches stay hot across decisions and games.
 * 2. Ukeire results are memoized per (hand, visible-tiles) pair.
 *
 * Correctness is not assumed: test/analysis.test.ts differentially
 * compares every function here against the engine's `shanten`/`ukeire`
 * over thousands of seeded random hands. The engine remains the rules
 * authority — the AI's analysis only chooses among actions the engine
 * has already declared legal, and the engine rejects anything illegal.
 *
 * All functions are type-level (per-type counts), like the engine's.
 */

import { TILE_TYPE_COUNT, countTiles, isTerminalOrHonor } from "@openmahjong/engine";

// ---------------------------------------------------------------------------
// Segment outcomes
// ---------------------------------------------------------------------------

interface Outcome {
  readonly m: number; // completed sets (mentsu) extracted
  readonly t: number; // partial sets (taatsu) extracted
  readonly p: number; // 1 if a pair was extracted as THE pair
}

/** Drop outcomes dominated on every axis (the combination objective
 *  2·mentsu + min(taatsu, 4−mentsu) + pair is monotone in all three). */
function prune(outcomes: Outcome[]): Outcome[] {
  const unique = new Map<string, Outcome>();
  for (const o of outcomes) unique.set(`${o.m},${o.t},${o.p}`, o);
  const list = [...unique.values()];
  return list.filter(
    (a) =>
      !list.some(
        (b) =>
          b !== a && b.m >= a.m && b.t >= a.t && b.p >= a.p &&
          (b.m > a.m || b.t > a.t || b.p > a.p),
      ),
  );
}

/**
 * Enumerate a suited segment's outcomes (counts over ranks 1–9, length 9).
 * Mirrors the branch structure of the engine's standard-form DFS.
 */
function suitedOutcomes(counts: readonly number[]): Outcome[] {
  const c = [...counts];
  const found: Outcome[] = [];
  const dfs = (r: number, m: number, t: number, pair: boolean): void => {
    while (r < 9 && c[r] === 0) r++;
    if (r >= 9) {
      found.push({ m, t, p: pair ? 1 : 0 });
      return;
    }
    if (c[r]! >= 3) {
      c[r]! -= 3;
      dfs(r, m + 1, t, pair);
      c[r]! += 3;
    }
    if (r <= 6 && c[r + 1]! > 0 && c[r + 2]! > 0) {
      c[r]!--; c[r + 1]!--; c[r + 2]!--;
      dfs(r, m + 1, t, pair);
      c[r]!++; c[r + 1]!++; c[r + 2]!++;
    }
    if (!pair && c[r]! >= 2) {
      c[r]! -= 2;
      dfs(r, m, t, true);
      c[r]! += 2;
    }
    if (c[r]! >= 2) {
      c[r]! -= 2;
      dfs(r, m, t + 1, pair);
      c[r]! += 2;
    }
    if (r <= 7 && c[r + 1]! > 0) {
      c[r]!--; c[r + 1]!--;
      dfs(r, m, t + 1, pair);
      c[r]!++; c[r + 1]!++;
    }
    if (r <= 6 && c[r + 2]! > 0) {
      c[r]!--; c[r + 2]!--;
      dfs(r, m, t + 1, pair);
      c[r]!++; c[r + 2]!++;
    }
    // This copy plays no part in the shape.
    c[r]!--;
    dfs(r, m, t, pair);
    c[r]!++;
  };
  dfs(0, 0, 0, false);
  return prune(found);
}

/** Enumerate an honors segment's outcomes (7 types, no sequences). */
function honorOutcomes(counts: readonly number[]): Outcome[] {
  const c = [...counts];
  const found: Outcome[] = [];
  const dfs = (r: number, m: number, t: number, pair: boolean): void => {
    while (r < 7 && c[r] === 0) r++;
    if (r >= 7) {
      found.push({ m, t, p: pair ? 1 : 0 });
      return;
    }
    if (c[r]! >= 3) {
      c[r]! -= 3;
      dfs(r, m + 1, t, pair);
      c[r]! += 3;
    }
    if (!pair && c[r]! >= 2) {
      c[r]! -= 2;
      dfs(r, m, t, true);
      c[r]! += 2;
    }
    if (c[r]! >= 2) {
      c[r]! -= 2;
      dfs(r, m, t + 1, pair);
      c[r]! += 2;
    }
    c[r]!--;
    dfs(r, m, t, pair);
    c[r]!++;
  };
  dfs(0, 0, 0, false);
  return prune(found);
}

function segmentKey(counts: readonly number[]): number {
  let key = 0;
  for (let i = counts.length - 1; i >= 0; i--) key = key * 5 + counts[i]!;
  return key;
}

const suitedCache = new Map<number, Outcome[]>();
const honorCache = new Map<number, Outcome[]>();
const SEGMENT_CACHE_LIMIT = 250_000;

function suitedOutcomesCached(counts: readonly number[]): Outcome[] {
  const key = segmentKey(counts);
  let v = suitedCache.get(key);
  if (v === undefined) {
    v = suitedOutcomes(counts);
    if (suitedCache.size >= SEGMENT_CACHE_LIMIT) suitedCache.clear();
    suitedCache.set(key, v);
  }
  return v;
}

function honorOutcomesCached(counts: readonly number[]): Outcome[] {
  const key = segmentKey(counts);
  let v = honorCache.get(key);
  if (v === undefined) {
    v = honorOutcomes(counts);
    if (honorCache.size >= SEGMENT_CACHE_LIMIT) honorCache.clear();
    honorCache.set(key, v);
  }
  return v;
}

/** Standard-form (4 sets + pair) shanten via segment decomposition. */
export function shantenStandardFast(counts: readonly number[], melds = 0): number {
  const segments: Outcome[][] = [
    suitedOutcomesCached(counts.slice(0, 9)),
    suitedOutcomesCached(counts.slice(9, 18)),
    suitedOutcomesCached(counts.slice(18, 27)),
    honorOutcomesCached(counts.slice(27, 34)),
  ];
  let combined: Outcome[] = [{ m: 0, t: 0, p: 0 }];
  for (const outcomes of segments) {
    const next: Outcome[] = [];
    for (const a of combined) {
      for (const b of outcomes) {
        if (a.p + b.p > 1) continue; // only one pair counts as the pair
        next.push({ m: a.m + b.m, t: a.t + b.t, p: a.p + b.p });
      }
    }
    combined = prune(next);
  }
  let best = 8;
  for (const o of combined) {
    const mentsu = melds + o.m;
    const effectiveTaatsu = Math.min(o.t, Math.max(0, 4 - mentsu));
    const s = 8 - 2 * mentsu - effectiveTaatsu - o.p;
    if (s < best) best = s;
  }
  return best;
}

/** Chiitoitsu (seven pairs) shanten — same formula as the engine's. */
export function shantenChiitoitsuFast(counts: readonly number[]): number {
  let pairs = 0;
  let unique = 0;
  for (let t = 0; t < TILE_TYPE_COUNT; t++) {
    if (counts[t]! > 0) unique++;
    if (counts[t]! >= 2) pairs++;
  }
  return 6 - pairs + Math.max(0, 7 - unique);
}

/** Kokushi (thirteen orphans) shanten — same formula as the engine's. */
export function shantenKokushiFast(counts: readonly number[]): number {
  let types = 0;
  let hasPair = false;
  for (let t = 0; t < TILE_TYPE_COUNT; t++) {
    if (!isTerminalOrHonor(t)) continue;
    if (counts[t]! > 0) types++;
    if (counts[t]! >= 2) hasPair = true;
  }
  return 13 - types - (hasPair ? 1 : 0);
}

/**
 * Shanten of a hand: the minimum over the three forms, exactly like the
 * engine's `shanten`. `counts` is the CLOSED portion; `melds` is the
 * number of open melds already formed. Total must be 13 or 14 tiles.
 */
export function shantenFast(counts: readonly number[], melds = 0): number {
  const closed = countTiles(counts);
  const total = closed + 3 * melds;
  if (total !== 13 && total !== 14) {
    throw new Error(`shantenFast expects a 13/14-tile hand (incl. melds), got ${total}`);
  }
  let result = shantenStandardFast(counts, melds);
  if (melds === 0) {
    result = Math.min(
      result,
      shantenChiitoitsuFast(counts),
      shantenKokushiFast(counts),
    );
  }
  return result;
}

// ---------------------------------------------------------------------------
// Ukeire and waits
// ---------------------------------------------------------------------------

export interface FastUkeire {
  readonly shanten: number;
  /** Tile types whose draw reduces shanten, with drawable copies left. */
  readonly improving: readonly { readonly type: number; readonly remaining: number }[];
  /** Total drawable improving copies. */
  readonly totalRemaining: number;
}

const ukeireCache = new Map<string, FastUkeire>();
const UKEIRE_CACHE_LIMIT = 50_000;

/**
 * Ukeire of a 13-tile hand (incl. melds), mirroring the engine's `ukeire`:
 * `visible` counts tiles seen outside the hand (discards, melds of all
 * players, dora indicators). Memoized per (hand, melds, visible).
 */
export function ukeireFast(
  counts: readonly number[],
  visible: readonly number[],
  melds = 0,
): FastUkeire {
  const key = `${melds}|${counts.join(",")}|${visible.join(",")}`;
  const hit = ukeireCache.get(key);
  if (hit !== undefined) return hit;

  const closed = countTiles(counts);
  if (closed + 3 * melds !== 13) {
    throw new Error(`ukeireFast expects a 13-tile hand (incl. melds), got ${closed + 3 * melds}`);
  }
  const base = shantenFast(counts, melds);
  const work = [...counts];
  const improving: { type: number; remaining: number }[] = [];
  let totalRemaining = 0;
  for (let t = 0; t < TILE_TYPE_COUNT; t++) {
    if (work[t]! >= 4) continue;
    work[t]!++;
    const improves = shantenFast(work, melds) < base;
    work[t]!--;
    if (!improves) continue;
    const remaining = 4 - counts[t]! - visible[t]!;
    if (remaining <= 0) continue;
    improving.push({ type: t, remaining });
    totalRemaining += remaining;
  }
  const result: FastUkeire = { shanten: base, improving, totalRemaining };
  if (ukeireCache.size >= UKEIRE_CACHE_LIMIT) ukeireCache.clear();
  ukeireCache.set(key, result);
  return result;
}

/**
 * Winning tile types of a tenpai 13-tile hand, with the copies still
 * drawable (4 − in hand − visible). Empty unless the hand is tenpai.
 */
export function waitsFast(
  counts: readonly number[],
  visible: readonly number[],
  melds = 0,
): { readonly type: number; readonly remaining: number }[] {
  if (shantenFast(counts, melds) !== 0) return [];
  const work = [...counts];
  const waits: { type: number; remaining: number }[] = [];
  for (let t = 0; t < TILE_TYPE_COUNT; t++) {
    if (work[t]! >= 4) continue;
    work[t]!++;
    const wins = shantenFast(work, melds) === -1;
    work[t]!--;
    if (!wins) continue;
    const remaining = 4 - counts[t]! - visible[t]!;
    waits.push({ type: t, remaining: Math.max(0, remaining) });
  }
  return waits;
}

/** Test/diagnostic hook: current cache sizes. */
export function analysisCacheSizes(): { segments: number; ukeire: number } {
  return { segments: suitedCache.size + honorCache.size, ukeire: ukeireCache.size };
}
