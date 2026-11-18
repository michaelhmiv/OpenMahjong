/**
 * Hand grouping for guided mode (guided-play package, approved
 * 2026-11-17): the closed hand decomposed into its structure —
 * completed sets, the pair, the waiting partials, and the loose
 * tiles — so the hand can be laid out in group order with a
 * plain-words label under each group.
 *
 * The decomposition is a display read of the hand, computed from the
 * tile types only (the same public facts the coach uses). It picks
 * the reading that maximises completed sets, then the pair, then
 * partials — the standard shanten decomposition's own priorities —
 * with deterministic tie-breaks, so the same hand always reads the
 * same way. A closed hand shaped as seven pairs reads as one
 * "Seven pairs" segment when that form is at least as close to
 * finished as the standard form.
 */
import type { Tile } from "@openmahjong/engine";
import { countsOfTiles, shantenChiitoitsuFast, shantenStandardFast } from "@openmahjong/ai";

export type HandSegmentKind =
  | "sequence"
  | "triplet"
  | "pair"
  | "waiting"
  | "loose"
  | "seven-pairs";

export interface HandSegment {
  readonly kind: HandSegmentKind;
  /** Plain-words label printed under the group. */
  readonly label: string;
  readonly tiles: readonly Tile[];
}

const LABELS: Record<HandSegmentKind, string> = {
  sequence: "Sequence",
  triplet: "Triplet",
  pair: "Pair",
  waiting: "Waiting",
  loose: "Loose",
  "seven-pairs": "Seven pairs",
};

interface Group {
  readonly kind: HandSegmentKind;
  readonly types: readonly number[];
}

/** First type with tiles remaining, or -1. */
function firstType(counts: readonly number[]): number {
  for (let t = 0; t < 34; t++) if (counts[t]! > 0) return t;
  return -1;
}

interface SetsResult {
  readonly sets: Group[];
  readonly rest: number[];
}

/**
 * Extract the maximum number of completed sets from `counts`.
 * Deterministic: at the lowest remaining type, triplet is tried
 * before sequence before leaving a copy behind, and only a strictly
 * better set count replaces the incumbent.
 */
function extractSets(counts: readonly number[]): SetsResult {
  const t = firstType(counts);
  if (t < 0) return { sets: [], rest: [...counts] };
  let best: SetsResult | null = null;
  const consider = (sets: Group[], rest: number[]) => {
    if (!best || sets.length > best.sets.length) best = { sets, rest };
  };
  if (counts[t]! >= 3) {
    const next = [...counts];
    next[t]! -= 3;
    const sub = extractSets(next);
    consider([{ kind: "triplet", types: [t, t, t] }, ...sub.sets], sub.rest);
  }
  if (t < 27 && t % 9 <= 6 && counts[t + 1]! > 0 && counts[t + 2]! > 0) {
    const next = [...counts];
    next[t]!--;
    next[t + 1]!--;
    next[t + 2]!--;
    const sub = extractSets(next);
    consider([{ kind: "sequence", types: [t, t + 1, t + 2] }, ...sub.sets], sub.rest);
  }
  {
    const next = [...counts];
    next[t]!--;
    const sub = extractSets(next);
    consider(sub.sets, sub.rest);
  }
  return best!;
}

interface PartialsResult {
  readonly partials: Group[];
  readonly rest: number[];
}

/**
 * Extract the maximum number of two-tile partials (a pair shape, two
 * in sequence, or two with one gap) from what the sets left behind.
 * Whatever remains is loose.
 */
function extractPartials(counts: readonly number[]): PartialsResult {
  const t = firstType(counts);
  if (t < 0) return { partials: [], rest: [...counts] };
  let best: PartialsResult | null = null;
  const consider = (partials: Group[], rest: number[]) => {
    if (!best || partials.length > best.partials.length) best = { partials, rest };
  };
  if (counts[t]! >= 2) {
    const next = [...counts];
    next[t]! -= 2;
    const sub = extractPartials(next);
    consider([{ kind: "waiting", types: [t, t] }, ...sub.partials], sub.rest);
  }
  if (t < 27 && t % 9 <= 7 && counts[t + 1]! > 0) {
    const next = [...counts];
    next[t]!--;
    next[t + 1]!--;
    const sub = extractPartials(next);
    consider([{ kind: "waiting", types: [t, t + 1] }, ...sub.partials], sub.rest);
  }
  if (t < 27 && t % 9 <= 6 && counts[t + 2]! > 0) {
    const next = [...counts];
    next[t]!--;
    next[t + 2]!--;
    const sub = extractPartials(next);
    consider([{ kind: "waiting", types: [t, t + 2] }, ...sub.partials], sub.rest);
  }
  {
    const next = [...counts];
    next[t]!--;
    const sub = extractPartials(next);
    consider(sub.partials, sub.rest);
  }
  return best!;
}

interface Reading {
  readonly sets: Group[];
  readonly pair: Group | null;
  readonly partials: Group[];
  readonly looseTypes: number[];
  readonly score: readonly [number, number, number];
}

/** The best standard-form reading of the hand's counts. */
function standardReading(counts: readonly number[]): Reading {
  let best: Reading | null = null;
  const candidates: (number | null)[] = [];
  for (let t = 0; t < 34; t++) if (counts[t]! >= 2) candidates.push(t);
  candidates.push(null);
  for (const pairType of candidates) {
    const work = [...counts];
    let pair: Group | null = null;
    if (pairType !== null) {
      work[pairType]! -= 2;
      pair = { kind: "pair", types: [pairType, pairType] };
    }
    const { sets, rest } = extractSets(work);
    const { partials, rest: loose } = extractPartials(rest);
    const looseTypes: number[] = [];
    loose.forEach((n, t) => {
      for (let i = 0; i < n; i++) looseTypes.push(t);
    });
    const reading: Reading = {
      sets,
      pair,
      partials,
      looseTypes,
      score: [sets.length, pair ? 1 : 0, partials.length],
    };
    if (
      !best ||
      reading.score[0] > best.score[0] ||
      (reading.score[0] === best.score[0] && reading.score[1] > best.score[1]) ||
      (reading.score[0] === best.score[0] &&
        reading.score[1] === best.score[1] &&
        reading.score[2] > best.score[2])
    ) {
      best = reading;
    }
  }
  return best!;
}

/**
 * Decompose a closed hand (the concealed tiles, any count from a
 * game in progress) into labelled segments in display order:
 * sets in reading order, the pair, the waiting partials, then the
 * loose tiles as one segment. Every tile appears exactly once.
 * `meldCount` is the number of open melds beside the hand — seven
 * pairs is only possible with none.
 */
export function decomposeHand(
  tiles: readonly Tile[],
  meldCount = 0,
): HandSegment[] {
  const sorted = [...tiles].sort((a, b) => a.type - b.type || a.id - b.id);
  if (sorted.length === 0) return [];
  const counts = countsOfTiles(sorted);

  // Seven pairs: one segment, no groups — when the form is real
  // (six or seven pair shapes) and at least as close to finished
  // as the standard reading.
  if (
    meldCount === 0 &&
    (sorted.length === 13 || sorted.length === 14)
  ) {
    const pairShapes = counts.filter((n) => n >= 2).length;
    if (
      pairShapes >= 6 &&
      shantenChiitoitsuFast(counts) <= shantenStandardFast(counts, 0)
    ) {
      return [
        { kind: "seven-pairs", label: LABELS["seven-pairs"], tiles: sorted },
      ];
    }
  }

  const reading = standardReading(counts);
  const byType = new Map<number, Tile[]>();
  for (const tile of sorted) {
    const arr = byType.get(tile.type) ?? [];
    arr.push(tile);
    byType.set(tile.type, arr);
  }
  const take = (type: number): Tile => byType.get(type)!.shift()!;

  const segments: HandSegment[] = [];
  const sets = [...reading.sets].sort(
    (a, b) => a.types[0]! - b.types[0]! || a.types[1]! - b.types[1]!,
  );
  for (const set of sets) {
    segments.push({
      kind: set.kind,
      label: LABELS[set.kind],
      tiles: set.types.map(take),
    });
  }
  if (reading.pair) {
    segments.push({
      kind: "pair",
      label: LABELS.pair,
      tiles: reading.pair.types.map(take),
    });
  }
  const partials = [...reading.partials].sort(
    (a, b) => a.types[0]! - b.types[0]! || a.types[1]! - b.types[1]!,
  );
  for (const partial of partials) {
    segments.push({
      kind: "waiting",
      label: LABELS.waiting,
      tiles: partial.types.map(take),
    });
  }
  if (reading.looseTypes.length > 0) {
    segments.push({
      kind: "loose",
      label: LABELS.loose,
      tiles: reading.looseTypes.map(take),
    });
  }
  return segments;
}

/** The tile-id sequence a segment list lays out, in display order. */
export function segmentTileIds(segments: readonly HandSegment[]): number[] {
  return segments.flatMap((s) => s.tiles.map((t) => t.id));
}
