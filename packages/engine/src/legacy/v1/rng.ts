/**
 * Seeded RNG (brief §5): deterministic — same seed, same sequence, always.
 * The engine never uses Math.random in any code path.
 *
 * Algorithm: mulberry32 over a 32-bit state, seeded directly (number) or
 * via an FNV-1a hash (string). Chosen for speed and reproducibility across
 * platforms; it is a game RNG, not a cryptographic one.
 */

export interface Rng {
  /** Next float in [0, 1). */
  nextFloat(): number;
  /** Next integer in [0, n). */
  nextInt(n: number): number;
  /** Fisher–Yates shuffle; returns a new array, input untouched. */
  shuffle<T>(items: readonly T[]): T[];
}

function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function createRng(seed: number | string): Rng {
  let state = (typeof seed === "string" ? hashSeed(seed) : seed >>> 0) || 0x9e3779b9;

  function nextFloat(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    nextFloat,
    nextInt(n: number): number {
      if (!Number.isInteger(n) || n <= 0) throw new Error(`nextInt bound must be a positive integer, got ${n}`);
      return Math.floor(nextFloat() * n);
    },
    shuffle<T>(items: readonly T[]): T[] {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(nextFloat() * (i + 1));
        const tmp = out[i]!;
        out[i] = out[j]!;
        out[j] = tmp;
      }
      return out;
    },
  };
}
