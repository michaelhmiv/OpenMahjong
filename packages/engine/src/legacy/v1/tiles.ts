/**
 * Tile model (brief §5): 34 tile types × 4 copies = 136 tiles.
 * Tiles are data, never images.
 *
 * Type indices:
 *   0–8   man (characters) 1–9
 *   9–17  pin (circles) 1–9
 *   18–26 sou (bamboo) 1–9
 *   27    East   28 South   29 West   30 North
 *   31    White dragon (haku)   32 Green dragon (hatsu)   33 Red dragon (chun)
 */

export type TileType = number; // 0..33

export const TILE_TYPE_COUNT = 34;
export const COPIES_PER_TYPE = 4;
export const TOTAL_TILES = TILE_TYPE_COUNT * COPIES_PER_TYPE; // 136

/** Tile types that have a red-five copy: 5man (4), 5pin (13), 5sou (22). */
export const RED_FIVE_TYPES: ReadonlySet<TileType> = new Set([4, 13, 22]);

export interface Tile {
  /** Unique copy id, 0..135. */
  readonly id: number;
  readonly type: TileType;
  /** True only for the single red-five copy of 5man/5pin/5sou. */
  readonly red: boolean;
}

export function isSuited(type: TileType): boolean {
  return type >= 0 && type < 27;
}
export function isHonor(type: TileType): boolean {
  return type >= 27 && type < 34;
}
export function isWind(type: TileType): boolean {
  return type >= 27 && type <= 30;
}
export function isDragon(type: TileType): boolean {
  return type >= 31 && type <= 33;
}
export function isTerminal(type: TileType): boolean {
  return isSuited(type) && (type % 9 === 0 || type % 9 === 8);
}
export function isTerminalOrHonor(type: TileType): boolean {
  return isHonor(type) || isTerminal(type);
}
/** Rank 1–9 for suited tiles; -1 for honors. */
export function rankOf(type: TileType): number {
  return isSuited(type) ? (type % 9) + 1 : -1;
}
/** 0 = man, 1 = pin, 2 = sou, -1 = honor. */
export function suitOf(type: TileType): number {
  return isSuited(type) ? Math.floor(type / 9) : -1;
}

/** The full set of 136 tile instances, in canonical (unshuffled) order. */
export function buildTileSet(): Tile[] {
  const tiles: Tile[] = [];
  for (let type = 0; type < TILE_TYPE_COUNT; type++) {
    for (let copy = 0; copy < COPIES_PER_TYPE; copy++) {
      tiles.push({
        id: type * COPIES_PER_TYPE + copy,
        type,
        // Convention: copy 0 of each five is the red five.
        red: copy === 0 && RED_FIVE_TYPES.has(type),
      });
    }
  }
  return tiles;
}

const SUIT_LETTERS = ["m", "p", "s"] as const;
const HONOR_NAMES = ["E", "S", "W", "N", "Wh", "Gr", "Rd"] as const;

/** Short name for a tile type, e.g. 4 -> "5m", 27 -> "E", 33 -> "Rd". */
export function tileTypeName(type: TileType): string {
  if (isHonor(type)) return HONOR_NAMES[type - 27]!;
  return `${rankOf(type)}${SUIT_LETTERS[suitOf(type)]}`;
}

export function tileName(tile: Tile): string {
  return tile.red ? `${tileTypeName(tile.type)}r` : tileTypeName(tile.type);
}

/**
 * Parse compact hand notation into per-type counts.
 *
 * Notation: runs of digits followed by a suit letter — `m` (man), `p` (pin),
 * `s` (sou), `z` (honors 1–7 = E S W N Wh Gr Rd). A `0` in a suited run is
 * the red five; it counts toward its type (red-ness is an instance property,
 * counts are type-level). Examples: "234m55p", "19m19p19s1234567z".
 */
export function parseCounts(notation: string): number[] {
  const counts = new Array<number>(TILE_TYPE_COUNT).fill(0);
  let digits: number[] = [];
  for (const ch of notation.trim()) {
    if (ch >= "0" && ch <= "9") {
      digits.push(ch.charCodeAt(0) - 48);
      continue;
    }
    const suitBase =
      ch === "m" ? 0 : ch === "p" ? 9 : ch === "s" ? 18 : ch === "z" ? 27 : -1;
    if (suitBase < 0) throw new Error(`Invalid notation character: ${ch}`);
    for (const d of digits) {
      if (ch === "z") {
        if (d < 1 || d > 7) throw new Error(`Invalid honor digit: ${d}`);
        counts[suitBase + d - 1]!++;
      } else {
        if (d === 0) counts[suitBase + 4]!++;
        else counts[suitBase + d - 1]!++;
      }
    }
    digits = [];
  }
  if (digits.length > 0) throw new Error(`Trailing digits in notation: ${notation}`);
  return counts;
}

/** Total tile count represented by a counts array. */
export function countTiles(counts: readonly number[]): number {
  return counts.reduce((a, b) => a + b, 0);
}
