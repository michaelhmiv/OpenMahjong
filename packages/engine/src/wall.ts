/**
 * Wall construction (brief §5): the shuffled 136-tile wall, split into the
 * live wall and the 14-tile dead wall. Dora indicators and rinshan (kan)
 * draws are modeled explicitly here, not as client-side special cases.
 *
 * Layout convention (engine contract; physical stacking is presentation):
 * - The shuffled wall is an array of 136 tiles.
 * - The LAST 14 tiles are the dead wall; the first 122 are the live wall,
 *   drawn from the front.
 * - Rinshan draws come from the FRONT of the dead wall (indices 0–3, max 4).
 * - Dora indicators are revealed in order from dead-wall index 4 onward:
 *   the initial indicator is index 4; each kan reveals the next index.
 *   At most 5 indicators (4 kans) can ever be revealed.
 */

import { buildTileSet, RED_FIVE_TYPES, type Tile } from "./tiles.js";
import { createRng } from "./rng.js";

export const DEAD_WALL_SIZE = 14;
export const LIVE_WALL_SIZE = 136 - DEAD_WALL_SIZE; // 122
export const MAX_KAN_DRAWS = 4;
export const FIRST_INDICATOR_INDEX = 4;

export interface Wall {
  /** Live wall, drawn from the front (index 0 first). */
  readonly liveWall: readonly Tile[];
  /** Dead wall: rinshan draws (0–3) then dora indicators (from index 4). */
  readonly deadWall: readonly Tile[];
}

/** Build a deterministically shuffled wall from a seed. */
export function createWall(seed: number | string): Wall {
  const rng = createRng(seed);
  const shuffled = rng.shuffle(buildTileSet());
  return {
    liveWall: shuffled.slice(0, LIVE_WALL_SIZE),
    deadWall: shuffled.slice(LIVE_WALL_SIZE),
  };
}

/**
 * Dora indicator tiles currently revealed: 1 + kanCount indicators
 * (kanCount 0–4). Throws for impossible kan counts.
 */
export function doraIndicators(wall: Wall, kanCount: number): Tile[] {
  if (!Number.isInteger(kanCount) || kanCount < 0 || kanCount > MAX_KAN_DRAWS) {
    throw new Error(`kanCount must be 0..${MAX_KAN_DRAWS}, got ${kanCount}`);
  }
  return wall.deadWall.slice(
    FIRST_INDICATOR_INDEX,
    FIRST_INDICATOR_INDEX + 1 + kanCount,
  );
}

/** The tile a kan draw (rinshan) takes: the kanDrawIndex-th dead-wall tile (0-based, max 3). */
export function rinshanTile(wall: Wall, kanDrawIndex: number): Tile {
  if (!Number.isInteger(kanDrawIndex) || kanDrawIndex < 0 || kanDrawIndex >= MAX_KAN_DRAWS) {
    throw new Error(`kanDrawIndex must be 0..${MAX_KAN_DRAWS - 1}, got ${kanDrawIndex}`);
  }
  return wall.deadWall[kanDrawIndex]!;
}

/** Validate an externally supplied wall against the canonical physical set. */
export function validateWall(wall: Wall): void {
  if (wall.liveWall.length !== LIVE_WALL_SIZE || wall.deadWall.length !== DEAD_WALL_SIZE) {
    throw new Error(`Wall must contain ${LIVE_WALL_SIZE} live and ${DEAD_WALL_SIZE} dead tiles`);
  }
  const seen = new Set<number>();
  for (const tile of [...wall.liveWall, ...wall.deadWall]) {
    if (!Number.isInteger(tile.id) || tile.id < 0 || tile.id >= 136 || seen.has(tile.id)) {
      throw new Error("Wall must contain every physical tile exactly once");
    }
    if (tile.type !== Math.floor(tile.id / 4) ||
        tile.red !== (tile.id % 4 === 0 && RED_FIVE_TYPES.has(tile.type))) {
      throw new Error(`Wall tile ${tile.id} has inconsistent type or red-five identity`);
    }
    seen.add(tile.id);
  }
}
