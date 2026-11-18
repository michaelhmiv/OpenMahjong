import { parseSequence, type Tile } from "@openmahjong/engine";

/**
 * Expand a lesson notation string into the tile faces to display, in
 * the exact order the notation names them.
 *
 * This is the single expansion every lesson row goes through — teaching
 * rows, pictured hands and tile-pick check rows alike — and tile-pick
 * answer keys index positions in THIS order. (The Nov 18, 2026 drill
 * defect: rows were expanded through parseCounts, whose iteration
 * order is canonical type order, so shuffled drill rows rendered
 * sorted while their keys indexed the authored order — the visibly
 * correct tile was graded wrong. Expanding through parseSequence makes
 * that disagreement structurally impossible: one ordered list is both
 * what renders and what the key indexes.)
 *
 * Copies of a kind resolve in order of appearance (first mention gets
 * copy 0, the next copy 1, …), matching the inventory lookup the
 * lesson-notation audit checks. A copy the inventory cannot supply
 * (more than four of a kind) is skipped, never a dead end.
 */
export function expandNotation(
  notation: string,
  inventory: readonly Tile[],
): Tile[] {
  const seen = new Map<number, number>();
  const faces: Tile[] = [];
  for (const type of parseSequence(notation)) {
    const copy = seen.get(type) ?? 0;
    seen.set(type, copy + 1);
    const face = inventory.find((t) => t.type === type && t.id % 4 === copy);
    if (face) faces.push(face);
  }
  return faces;
}
