import { describe, expect, it } from "vitest";
import { parseCounts, parseSequence, TILE_TYPE_COUNT } from "../src/index.js";

describe("parseSequence", () => {
  it("returns tile types in the order the notation names them", () => {
    // 7m 2m 9m 4m — a shuffled drill row must survive parsing unsorted.
    expect(parseSequence("7m2m9m4m")).toEqual([6, 1, 8, 3]);
    expect(parseSequence("3z1z4z2z")).toEqual([29, 27, 30, 28]);
    expect(parseSequence("2m2s5s8s5z")).toEqual([1, 19, 22, 25, 31]);
  });

  it("keeps repeated and interleaved kinds in place", () => {
    expect(parseSequence("5m3m5m")).toEqual([4, 2, 4]);
    expect(parseSequence("111z123m")).toEqual([27, 27, 27, 0, 1, 2]);
  });

  it("names the red five by its type", () => {
    expect(parseSequence("0p")).toEqual([13]);
    expect(parseSequence("405m")).toEqual([3, 4, 4]);
  });

  it("rejects the same malformed notation parseCounts rejects", () => {
    expect(() => parseSequence("9x")).toThrow();
    expect(() => parseSequence("8z")).toThrow();
    expect(() => parseSequence("12")).toThrow();
  });

  it("tallies exactly to parseCounts on every sample", () => {
    const samples = [
      "7m2m9m4m",
      "123456789m123456789p123456789s1234567z",
      "111222333m444555666z",
      "0m0p0s5m5p5s",
      "345s345s678p234m99p",
      "2222s",
    ];
    for (const notation of samples) {
      const tally = new Array<number>(TILE_TYPE_COUNT).fill(0);
      for (const type of parseSequence(notation)) tally[type]!++;
      expect(tally, notation).toEqual(parseCounts(notation));
    }
  });
});
