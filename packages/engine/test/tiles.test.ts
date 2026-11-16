import { describe, expect, it } from "vitest";
import {
  buildTileSet,
  parseCounts,
  tileTypeName,
  TOTAL_TILES,
  TILE_TYPE_COUNT,
} from "../src/tiles.js";

describe("tile set", () => {
  it("has 136 unique tiles, 4 copies of each of 34 types", () => {
    const tiles = buildTileSet();
    expect(tiles).toHaveLength(TOTAL_TILES);
    expect(new Set(tiles.map((t) => t.id)).size).toBe(136);
    for (let type = 0; type < TILE_TYPE_COUNT; type++) {
      expect(tiles.filter((t) => t.type === type)).toHaveLength(4);
    }
  });

  it("has exactly three red fives, one per suit, on the 5s", () => {
    const reds = buildTileSet().filter((t) => t.red);
    expect(reds.map((t) => t.type)).toEqual([4, 13, 22]);
  });

  it("names types in standard notation", () => {
    expect(tileTypeName(0)).toBe("1m");
    expect(tileTypeName(4)).toBe("5m");
    expect(tileTypeName(17)).toBe("9p");
    expect(tileTypeName(27)).toBe("E");
    expect(tileTypeName(33)).toBe("Rd");
  });
});

describe("parseCounts", () => {
  it("parses suited and honor runs", () => {
    const c = parseCounts("19m19p19s1234567z");
    expect(c.reduce((a, b) => a + b, 0)).toBe(13);
    expect(c[0]).toBe(1); // 1m
    expect(c[8]).toBe(1); // 9m
    expect(c[27]).toBe(1); // East
    expect(c[33]).toBe(1); // red dragon
  });

  it("counts 0 as the red five of its suit (type-level)", () => {
    const c = parseCounts("0555m");
    expect(c[4]).toBe(4);
  });

  it("rejects invalid notation", () => {
    expect(() => parseCounts("9z")).toThrow();
    expect(() => parseCounts("123x")).toThrow();
    expect(() => parseCounts("123")).toThrow();
  });
});
