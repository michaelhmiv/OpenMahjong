/**
 * Inspect-sheet tile facts (approved renderings guided-inspect-v1,
 * Rendering B): the readout beside the selected tile in the hand
 * focus sheet. Every line is computed from the player's own
 * PlayerView and hand — public information only — and each line is
 * present only when it is true of the position. Wording and order
 * are the approved rendering's; the waits rule is the brief's:
 * a 13-tile hand speaks for itself, a 14-tile hand on the player's
 * turn uses the tenpai form reached by discarding the drawn tile,
 * else by the coach-recommended discard.
 */
import {
  isSuited,
  rankOf,
  suitOf,
  type PlayerView,
  type Tile,
  type TileType,
} from "@openmahjong/engine";
import {
  countsOfTiles,
  doraTypesOf,
  ownedMeldCounts,
  shantenFast,
  visibleCounts,
  waitsFast,
} from "@openmahjong/ai";
import { tileName } from "@openmahjong/coach";
import { tx } from "./i18n/index.js";

export interface TileInfo {
  /** Primary line: the plain name ("5 of Dots"). */
  name: string;
  /** Factual lines in rendering order (dora, membership, copies). */
  lines: string[];
  /** The "Waiting on: …" line, or null when no tenpai form applies. */
  waitsLine: string | null;
}

const SUIT_DISPLAY = ["Characters", "Dots", "Bamboo"];

/** The readout's display name: the coach's plain name with the suit
 *  capitalised, as the approved rendering prints it ("5 of Dots").
 *  Honours keep the coach's form ("East wind", "Red dragon"). */
export function tileDisplayName(type: TileType): string {
  if (!isSuited(type)) return tileName(type);
  return tx("ui.tiles.v-0-of-1", `${rankOf(type)} of ${SUIT_DISPLAY[suitOf(type)]!}`, rankOf(type), SUIT_DISPLAY[suitOf(type)]!);
}

/** Strongest true membership of the tile within the closed hand:
 *  a completed set (triplet, then run) over a pair over loose. */
function membershipLine(counts: readonly number[], type: TileType): string {
  if (counts[type]! >= 3) {
    return tx("ui.tiles.part-of-a-triplet-three-0-s", `Part of a triplet — three ${tileDisplayName(type)}s.`, tileDisplayName(type));
  }
  if (isSuited(type)) {
    const base = suitOf(type) * 9;
    const rank = rankOf(type);
    for (const start of [rank - 2, rank - 1, rank]) {
      if (start < 1 || start + 2 > 9) continue;
      if (
        counts[base + start - 1]! > 0 &&
        counts[base + start]! > 0 &&
        counts[base + start + 1]! > 0
      ) {
        return tx("ui.tiles.part-of-a-run-0-1-2-of-3", `Part of a run — ${start}, ${start + 1}, ${start + 2} of ${SUIT_DISPLAY[suitOf(type)]!}.`, start, start + 1, start + 2, SUIT_DISPLAY[suitOf(type)]!);
      }
    }
  }
  if (counts[type]! === 2) return tx("ui.tiles.one-of-a-pair", "One of a pair.");
  return tx("ui.tiles.not-part-of-a-set-yet", "Not part of a set yet.");
}

/** Waits of the hand's tenpai form, or null when there is none. */
function waitsLineFor(
  view: PlayerView,
  drawnTile: Tile | null,
  recommendedTileId: number | null,
): string | null {
  const melds = view.melds.length;
  const visible = visibleCounts(view);
  const owned = ownedMeldCounts(view);
  const counts = countsOfTiles(view.hand);
  const total = counts.reduce((a, b) => a + b, 0) + 3 * melds;

  const waitsAfter = (discard: Tile | null): TileType[] => {
    if (discard) {
      counts[discard.type]!--;
      visible[discard.type]!++;
    }
    const waits =
      shantenFast(counts, melds) === 0
        ? waitsFast(counts, visible, melds, owned).map((w) => w.type as TileType)
        : [];
    if (discard) {
      counts[discard.type]!++;
      visible[discard.type]!--;
    }
    return waits;
  };

  let waits: TileType[] = [];
  if (total === 13) {
    waits = waitsAfter(null);
  } else if (total === 14) {
    waits = drawnTile ? waitsAfter(drawnTile) : [];
    if (waits.length === 0 && recommendedTileId !== null) {
      const rec = view.hand.find((t) => t.id === recommendedTileId);
      if (rec && rec.id !== drawnTile?.id) waits = waitsAfter(rec);
    }
  }
  if (waits.length === 0) return null;
  return tx("ui.tiles.waiting-on-0", `Waiting on: ${waits.map((t) => tileDisplayName(t)).join(", ")}.`, waits.map((t) => tileDisplayName(t)).join(", "));
}

/**
 * The full readout for one selected tile. `drawnTile` and
 * `recommendedTileId` describe the pending turn decision (either may
 * be absent — e.g. a call window, where the hand stands at 13).
 */
export function tileInfo(
  view: PlayerView,
  selected: Tile,
  opts: { drawnTile?: Tile | null; recommendedTileId?: number | null } = {},
): TileInfo {
  const lines: string[] = [];

  // Dora status: a red five is always a dora; otherwise the current
  // indicators decide.
  if (selected.red) {
    lines.push(tx("ui.tiles.red-five-counts-as-a-dora", "Red five — counts as a dora."));
  } else if (doraTypesOf(view).has(selected.type)) {
    lines.push(tx("ui.tiles.dora-this-tile-is-a-dora", "Dora — this tile is a dora."));
  }

  lines.push(membershipLine(countsOfTiles(view.hand), selected.type));

  // Copies face-up on the table: every pond and meld. The player's
  // own hand never counts, and neither do the dora indicators —
  // visibleCounts includes the indicators, so they come back out.
  const visible = visibleCounts(view);
  const indicators = view.doraIndicators.filter((t) => t.type === selected.type).length;
  const onTable = visible[selected.type]! - indicators;
  lines.push(tx("ui.tiles.v-0-of-the-4-copies-are-visible-on-the-table", `${onTable} of the 4 copies are visible on the table.`, onTable));

  return {
    name: tileDisplayName(selected.type),
    lines,
    waitsLine: waitsLineFor(view, opts.drawnTile ?? null, opts.recommendedTileId ?? null),
  };
}
