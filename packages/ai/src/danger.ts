/**
 * Basic defense (brief §6 layer 3): how dangerous is discarding a tile
 * type into a player who has declared riichi?
 *
 * Slice-1 scope, per the brief: defense exists against riichi only.
 * The ranking is the standard beginner-to-intermediate ladder:
 *
 *   genbutsu (the riichi player has discarded the type) — safe from ron
 *     by that opponent; this says nothing about other opponents
 *   suji (the type's suji partner, 3 ranks away, is genbutsu)
 *   kabe (all four copies of a neighbouring type are visible, so no
 *        sequence through it can exist) and heavily-visible honors
 *   plain honors / terminals with little information
 *   unmarked simples — the most dangerous
 *
 * Scores are relative (lower = safer), tuned only against each other.
 */

import {
  TILE_TYPE_COUNT,
  isHonor,
  isSuited,
  isTerminal,
  rankOf,
  suitOf,
  type PlayerView,
  type TileType,
} from "@openmahjong/engine";

export const DANGER_GENBUTSU = 0;
export const DANGER_SUJI = 12;
export const DANGER_PARTIAL_SUJI = 32; // one ryanmen side remains for ranks 4–6
export const DANGER_DEAD_HONOR = 8; // ≤1 copy can remain: tanki at worst
export const DANGER_THIN_HONOR = 18; // 2 copies remain
export const DANGER_HONOR = 30;
export const DANGER_TERMINAL = 35;
export const DANGER_SIMPLE = 50;
export const DANGER_SIMPLE_MIDDLE = 56; // ranks 4–6: most sequence neighbours

/** Per-type counts of everything publicly visible in a view: all four
 *  players' discards and melds, plus the dora indicators. The viewer's
 *  own closed hand is NOT included (callers add it where relevant). */
export function visibleCounts(view: PlayerView): number[] {
  const visible = new Array<number>(TILE_TYPE_COUNT).fill(0);
  for (const p of view.players) {
    // The pond retains called tiles as history, but their physical
    // copies now live in a meld. Counting both makes unseen copies
    // disappear and can invent a four-tile wall (kabe).
    for (const d of p.discards) if (!d.called) visible[d.tile.type]!++;
    for (const m of p.melds) for (const t of m.tiles) visible[t.type]!++;
  }
  for (const ind of view.doraIndicators) visible[ind.type]!++;
  return visible;
}

/** Discard type sets per seat, for genbutsu checks. */
export function discardTypeSets(view: PlayerView): Set<TileType>[] {
  return view.players.map((p) => new Set(p.discards.map((d) => d.tile.type)));
}

/**
 * Danger of discarding `type` against the riichi players in the view.
 * `ownCounts` is the viewer's closed-hand counts (for kabe/visibility
 * math: a tile whose neighbours are all in your own hand is just as
 * dead as one in the discard pools).
 */
export function dangerOf(
  type: TileType,
  view: PlayerView,
  ownCounts: readonly number[],
  visible: readonly number[],
  discardSets: readonly Set<TileType>[],
): number {
  let worst = 0;
  for (const p of view.players) {
    if (p.seat === view.seat || !p.riichi) continue;
    const discards = discardSets[p.seat]!;
    let danger: number;
    if (discards.has(type)) {
      danger = DANGER_GENBUTSU;
    } else if (isHonor(type)) {
      const remaining = 4 - ownCounts[type]! - visible[type]!;
      danger =
        remaining <= 1 ? DANGER_DEAD_HONOR :
        remaining === 2 ? DANGER_THIN_HONOR :
        DANGER_HONOR;
    } else {
      const rank = rankOf(type); // 1..9
      const base = suitOf(type) * 9;
      const sujiPartnerDown = rank - 3 >= 1 ? base + rank - 3 - 1 : -1;
      const sujiPartnerUp = rank + 3 <= 9 ? base + rank + 3 - 1 : -1;
      const downSafe = sujiPartnerDown >= 0 && discards.has(sujiPartnerDown);
      const upSafe = sujiPartnerUp >= 0 && discards.has(sujiPartnerUp);
      // A middle tile has two ryanmen sides: e.g. 2p genbutsu removes
      // the 34p wait for 5p, but does not remove the 67p wait for 5p.
      const middle = rank >= 4 && rank <= 6;
      if (middle ? downSafe && upSafe : downSafe || upSafe) {
        danger = DANGER_SUJI;
      } else {
        danger = middle && (downSafe || upSafe)
          ? DANGER_PARTIAL_SUJI
          : isTerminal(type)
          ? DANGER_TERMINAL
          : rank >= 4 && rank <= 6
            ? DANGER_SIMPLE_MIDDLE
            : DANGER_SIMPLE;
        // Kabe: a neighbouring type is fully visible (own hand counts —
        // no sequence through it can exist, so this tile loses its
        // sequence waits on that side.
        const leftDead = rank >= 2 && ownCounts[base + rank - 2]! + visible[base + rank - 2]! >= 4;
        const rightDead = rank <= 8 && ownCounts[base + rank]! + visible[base + rank]! >= 4;
        if (leftDead || rightDead) danger = Math.round(danger * 0.55);
        // A type with almost no copies left can only be a tanki/pair
        // wait; discount it like a thin honor.
        const remaining = 4 - ownCounts[type]! - visible[type]!;
        if (remaining <= 1) danger = Math.min(danger, DANGER_DEAD_HONOR + 4);
      }
    }
    if (danger > worst) worst = danger;
  }
  return worst;
}

/** Seats of opponents currently in riichi. */
export function riichiThreats(view: PlayerView): number[] {
  return view.players
    .filter((p) => p.seat !== view.seat && p.riichi)
    .map((p) => p.seat);
}
