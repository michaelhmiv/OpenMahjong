import { describe, expect, it } from "vitest";
import { createRng } from "../src/rng.js";
import {
  createWall,
  doraIndicators,
  rinshanTile,
  DEAD_WALL_SIZE,
  LIVE_WALL_SIZE,
} from "../src/wall.js";

describe("seeded RNG", () => {
  it("is deterministic: same seed, same sequence", () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 100 }, () => a.nextFloat());
    const seqB = Array.from({ length: 100 }, () => b.nextFloat());
    expect(seqA).toEqual(seqB);
  });

  it("accepts string seeds deterministically", () => {
    const a = createRng("open-mahjong");
    const b = createRng("open-mahjong");
    expect(a.nextInt(1000)).toBe(b.nextInt(1000));
  });

  it("differs across seeds and stays in range", () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 20 }, () => a.nextFloat());
    const seqB = Array.from({ length: 20 }, () => b.nextFloat());
    expect(seqA).not.toEqual(seqB);
    for (const v of [...seqA, ...seqB]) expect(v).toBeGreaterThanOrEqual(0);
    for (const v of [...seqA, ...seqB]) expect(v).toBeLessThan(1);
  });

  it("shuffle returns a permutation without mutating the input", () => {
    const input = Array.from({ length: 136 }, (_, i) => i);
    const out = createRng(7).shuffle(input);
    expect([...out].sort((x, y) => x - y)).toEqual(input);
    expect(input[0]).toBe(0);
  });
});

describe("wall", () => {
  it("splits 136 unique tiles into 122 live + 14 dead", () => {
    const wall = createWall(123);
    expect(wall.liveWall).toHaveLength(LIVE_WALL_SIZE);
    expect(wall.deadWall).toHaveLength(DEAD_WALL_SIZE);
    const ids = new Set([...wall.liveWall, ...wall.deadWall].map((t) => t.id));
    expect(ids.size).toBe(136);
  });

  it("is deterministic per seed and differs across seeds", () => {
    const a = createWall("game-1");
    const b = createWall("game-1");
    const c = createWall("game-2");
    expect(a.liveWall.map((t) => t.id)).toEqual(b.liveWall.map((t) => t.id));
    expect(a.liveWall.map((t) => t.id)).not.toEqual(c.liveWall.map((t) => t.id));
  });

  it("reveals 1 + kanCount dora indicators from the dead wall", () => {
    const wall = createWall(9);
    expect(doraIndicators(wall, 0)).toHaveLength(1);
    expect(doraIndicators(wall, 4)).toHaveLength(5);
    expect(doraIndicators(wall, 0)[0]).toBe(wall.deadWall[4]);
    expect(() => doraIndicators(wall, 5)).toThrow();
  });

  it("serves at most 4 rinshan draws from the dead wall front", () => {
    const wall = createWall(9);
    for (let i = 0; i < 4; i++) expect(rinshanTile(wall, i)).toBe(wall.deadWall[i]);
    expect(() => rinshanTile(wall, 4)).toThrow();
  });
});
