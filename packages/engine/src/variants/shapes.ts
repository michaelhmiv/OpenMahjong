import { countTiles, validateCounts } from "../tiles.js";
import type { Meld, MeldKind } from "../scoring.js";

export interface ShapeGroup {
  kind: "sequence" | "triplet" | "quad";
  type: number;
  closed: boolean;
}
export interface StandardShape {
  groups: readonly ShapeGroup[];
  pair: number;
}
export function declaredGroup(meld: Meld): ShapeGroup {
  const sorted = [...meld.tiles].sort((a, b) => a - b),
    quad = !["chi", "pon"].includes(meld.kind);
  if (
    !["chi", "pon", "ankan", "daiminkan", "shouminkan"].includes(meld.kind) ||
    sorted.length !== (quad ? 4 : 3) ||
    sorted.some((t) => !Number.isInteger(t) || t < 0 || t > 33)
  )
    throw new Error("Invalid declared set");
  if (
    meld.kind === "chi"
      ? sorted[0]! >= 27 ||
        Math.floor(sorted[0]! / 9) !== Math.floor(sorted[2]! / 9) ||
        sorted[1] !== sorted[0]! + 1 ||
        sorted[2] !== sorted[0]! + 2
      : sorted.some((t) => t !== sorted[0])
  )
    throw new Error("Invalid declared set shape");
  return {
    kind: meld.kind === "chi" ? "sequence" : quad ? "quad" : "triplet",
    type: sorted[0]!,
    closed: meld.kind === "ankan",
  };
}
export function closedPortion(
  counts: readonly number[],
  melds: readonly Meld[],
  sets: number,
): number[] {
  validateCounts(counts);
  if (melds.length > sets) throw new Error("Too many declared sets");
  const c = [...counts];
  let quads = 0;
  for (const meld of melds) {
    declaredGroup(meld);
    if (meld.tiles.length === 4) quads++;
    for (const t of meld.tiles)
      if (--c[t]! < 0) throw new Error("Declared tiles missing from the hand");
  }
  if (countTiles(counts) !== 3 * sets + 2 + quads)
    throw new Error(
      `Winning hand requires ${3 * sets + 2 + quads} physical tiles`,
    );
  return c;
}
export function standardShapes(
  counts: readonly number[],
  melds: readonly Meld[],
  sets: number,
): StandardShape[] {
  const c = closedPortion(counts, melds, sets),
    fixed = melds.map(declaredGroup),
    groups: ShapeGroup[] = [],
    results: StandardShape[] = [];
  function visit(pair: number): void {
    const i = c.findIndex((n) => n > 0);
    if (i < 0) {
      if (pair >= 0 && fixed.length + groups.length === sets)
        results.push({ groups: [...fixed, ...groups], pair });
      return;
    }
    if (groups.length + fixed.length > sets) return;
    if (pair < 0 && c[i]! >= 2) {
      c[i]! -= 2;
      visit(i);
      c[i]! += 2;
    }
    if (c[i]! >= 3) {
      c[i]! -= 3;
      groups.push({ kind: "triplet", type: i, closed: true });
      visit(pair);
      groups.pop();
      c[i]! += 3;
    }
    if (i < 27 && i % 9 < 7 && c[i + 1]! && c[i + 2]!) {
      c[i]!--;
      c[i + 1]!--;
      c[i + 2]!--;
      groups.push({ kind: "sequence", type: i, closed: true });
      visit(pair);
      groups.pop();
      c[i]!++;
      c[i + 1]!++;
      c[i + 2]!++;
    }
  }
  visit(-1);
  return results;
}
export function isOrphans(counts: readonly number[]): boolean {
  const types = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  return (
    countTiles(counts) === 14 &&
    types.every((t) => counts[t]! >= 1) &&
    counts.every((n, t) => n === 0 || types.includes(t))
  );
}
/** Shared standard-hand distance supports four or five sets. No Riichi
 * seven-pairs/yaku assumptions are applied to a Taiwanese hand. */
export function standardDistance(
  counts: readonly number[],
  melds: number,
  sets: number,
): number {
  validateCounts(counts);
  const c = [...counts];
  let best = 2 * sets;
  function visit(i: number, m: number, t: number, p: boolean): void {
    while (i < 34 && !c[i]) i++;
    if (i === 34) {
      best = Math.min(
        best,
        2 * sets - 2 * m - Math.min(t, Math.max(0, sets - m)) - (p ? 1 : 0),
      );
      return;
    }
    if (m > sets) return;
    if (c[i]! >= 3) {
      c[i]! -= 3;
      visit(i, m + 1, t, p);
      c[i]! += 3;
    }
    if (i < 27 && i % 9 < 7 && c[i + 1]! && c[i + 2]!) {
      c[i]!--;
      c[i + 1]!--;
      c[i + 2]!--;
      visit(i, m + 1, t, p);
      c[i]!++;
      c[i + 1]!++;
      c[i + 2]!++;
    }
    if (c[i]! >= 2) {
      c[i]! -= 2;
      if (!p) visit(i, m, t, true);
      visit(i, m, t + 1, p);
      c[i]! += 2;
    }
    if (i < 27 && i % 9 < 8 && c[i + 1]!) {
      c[i]!--;
      c[i + 1]!--;
      visit(i, m, t + 1, p);
      c[i]!++;
      c[i + 1]!++;
    }
    if (i < 27 && i % 9 < 7 && c[i + 2]!) {
      c[i]!--;
      c[i + 2]!--;
      visit(i, m, t + 1, p);
      c[i]!++;
      c[i + 2]!++;
    }
    c[i]!--;
    visit(i, m, t, p);
    c[i]!++;
  }
  visit(0, melds, 0, false);
  return best;
}
export function shapeWaits(
  counts: readonly number[],
  melds: readonly Meld[],
  sets: number,
  orphans = false,
): number[] {
  const c = [...counts];
  for (const m of melds) for (const t of m.tiles) c[t]!++;
  const waits: number[] = [];
  for (let t = 0; t < 34; t++)
    if (c[t]! < 4) {
      c[t]!++;
      if (
        standardShapes(c, melds, sets).length ||
        (orphans && !melds.length && isOrphans(c))
      )
        waits.push(t);
      c[t]!--;
    }
  return waits;
}
