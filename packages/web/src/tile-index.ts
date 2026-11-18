/**
 * Tile corner indices (guided-play package, approved 2026-11-17 with
 * Michael's inspect-only ruling): a small number or letter in the
 * top-left corner of a tile face, in the face's own ink family — the
 * mark printed on the corner of a physical indexed tile set.
 *
 * Indices live ONLY where a tile is magnified or inspected — the
 * Inspect hand sheet, the selected tile's preview, the Focus Frames,
 * the explanation sheet, and lesson surfaces under the no-leak law.
 * Board tiles (hand row, ponds, melds, dora indicators on the table)
 * never carry one: the board stays exactly as shipped, and no suit
 * art shrinks to make room. There is no setting for this — nothing
 * on the board exists to turn off.
 */
import {
  isDragon,
  isSuited,
  isWind,
  rankOf,
  type Tile,
  type TileType,
} from "@openmahjong/engine";

/** The dark ink every suited tile and wind is printed in. */
export const INDEX_INK_DARK = "#22252b";

export interface TileIndexInfo {
  readonly text: string;
  readonly ink: string;
}

const WIND_INDEX = ["E", "S", "W", "N"] as const;

/** Dragons carry their initial in the dragon's own face ink. The
 *  White dragon's W is told apart from West's W by ink (slate, not
 *  dark) and by the face itself (blank, not a wind glyph) — the same
 *  disambiguation physical indexed sets rely on. */
const DRAGON_INDEX: Readonly<Record<number, TileIndexInfo>> = {
  31: { text: "W", ink: "#7a8699" },
  32: { text: "G", ink: "#22763d" },
  33: { text: "R", ink: "#bf3b34" },
};

/**
 * The corner index for a tile type, or null when the type has none
 * (variant-only faces such as flowers). A red five carries its plain
 * rank digit, like a normal five — redness is a property of the
 * physical tile instance, never of the type, so it is not consulted
 * here.
 */
export function tileIndexInfo(type: TileType): TileIndexInfo | null {
  if (isSuited(type)) return { text: String(rankOf(type)), ink: INDEX_INK_DARK };
  if (isWind(type)) return { text: WIND_INDEX[type - 27]!, ink: INDEX_INK_DARK };
  if (isDragon(type)) return DRAGON_INDEX[type] ?? null;
  return null;
}

/**
 * The index element to lay over a tile face (the `.tile` element is
 * positioned; the span rides its top-left corner and never takes
 * touches). Null when the tile's type has no index.
 */
export function tileIndexEl(tile: Tile): HTMLSpanElement | null {
  const info = tileIndexInfo(tile.type);
  if (!info) return null;
  const span = document.createElement("span");
  span.className = "tindex";
  span.textContent = info.text;
  span.style.color = info.ink;
  span.setAttribute("aria-hidden", "true");
  return span;
}
