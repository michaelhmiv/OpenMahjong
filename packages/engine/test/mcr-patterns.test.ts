import { describe, it, expect } from "vitest";
import {
  parseCounts,
  scoreMcr,
  mcrPatterns,
  type Meld,
  type VariantScoreInput,
} from "../src/index.js";
/** Independently composed examples target every named 2006 pattern. Fixed
 * sets and actual winning tile are explicit; no expected total comes from
 * asking the scorer to generate its own fixture or expected answer. */
type Example = readonly [string, string, Partial<VariantScoreInput>?];
const meld = (kind: Meld["kind"], ...tiles: number[]): Meld => ({
  kind,
  tiles,
});
const examples: Example[] = [
  ["Big Four Winds", "111222333444z55m", { winningTile: 4 }],
  ["Big Three Dragons", "555666777z123m11p", { winningTile: 9 }],
  ["All Green", "22233344466688s", { winningTile: 25 }],
  ["Nine Gates", "11123455678999m", { winningTile: 4 }],
  [
    "Four Kongs",
    "1111m2222p3333s4444z55z",
    {
      winningTile: 31,
      melds: [
        meld("ankan", 0, 0, 0, 0),
        meld("daiminkan", 10, 10, 10, 10),
        meld("daiminkan", 20, 20, 20, 20),
        meld("daiminkan", 30, 30, 30, 30),
      ],
    },
  ],
  ["Seven Shifted Pairs", "11223344556677m", { winningTile: 6 }],
  ["Thirteen Orphans", "119m19p19s1234567z", { winningTile: 0 }],
  ["All Terminals", "111999m111999p11s", { winningTile: 18 }],
  ["Little Four Winds", "11122233344z555m", { winningTile: 30 }],
  ["Little Three Dragons", "55566677z123m789p", { winningTile: 33 }],
  ["All Honors", "11122255566677z", { winningTile: 33 }],
  [
    "Four Concealed Pungs",
    "111m44455p777s111z",
    { winningTile: 13, selfDraw: true },
  ],
  ["Pure Terminal Chows", "11223355778899m", { winningTile: 4 }],
  ["Quadruple Chow", "11112222333355m", { winningTile: 4 }],
  ["Four Pure Shifted Pungs", "11122233344466m", { winningTile: 5 }],
  ["Four Pure Shifted Chows", "123345567789m55p", { winningTile: 13 }],
  [
    "Three Kongs",
    "1111m2222p3333s444z55z",
    {
      winningTile: 31,
      melds: [
        meld("daiminkan", 0, 0, 0, 0),
        meld("ankan", 10, 10, 10, 10),
        meld("daiminkan", 20, 20, 20, 20),
      ],
    },
  ],
  ["All Terminals and Honors", "111m999p111555z99s", { winningTile: 26 }],
  ["Seven Pairs", "1122m3344p5566s77z", { winningTile: 33 }],
  [
    "Greater Honors and Knitted Tiles",
    "147m258p3s1234567z",
    { winningTile: 20 },
  ],
  ["All Even Pungs", "222444m666p888s22p", { winningTile: 10 }],
  ["Full Flush", "123345678m22255m", { winningTile: 4 }],
  [
    "Pure Triple Chow",
    "111222333m456p77s",
    { winningTile: 24, melds: [meld("chi", 0, 1, 2), meld("chi", 0, 1, 2)] },
  ],
  ["Pure Shifted Pungs", "222333444m678p11s", { winningTile: 18 }],
  ["Upper Tiles", "777888999m789p88s", { winningTile: 25 }],
  ["Middle Tiles", "444555666m456p55s", { winningTile: 22 }],
  ["Lower Tiles", "111222333m123p22s", { winningTile: 19 }],
  ["Pure Straight", "123456789m333p55s", { winningTile: 22 }],
  ["Three-Suited Terminal Chows", "123789m123789p55s", { winningTile: 22 }],
  ["Pure Shifted Chows", "234345456m789p11s", { winningTile: 18 }],
  ["All Five", "345567m456p555s55p", { winningTile: 13 }],
  ["Triple Pung", "555m555p555s123m11z", { winningTile: 27 }],
  ["Three Concealed Pungs", "111m444p777s123p55z", { winningTile: 31 }],
  [
    "Lesser Honors and Knitted Tiles",
    "147m258p369s12345z",
    { winningTile: 31 },
  ],
  ["Knitted Straight", "147m258p369s11122z", { winningTile: 28 }],
  ["Upper Four", "678m789p678s666m88p", { winningTile: 16 }],
  ["Lower Four", "123m234p123s444m22p", { winningTile: 10 }],
  ["Big Three Winds", "111222333z123m55p", { winningTile: 13 }],
  ["Mixed Straight", "123m456p789s222m55z", { winningTile: 31 }],
  ["Reversible Tiles", "123p456s888p999s55z", { winningTile: 31 }],
  ["Mixed Triple Chow", "234m234p234s789m11z", { winningTile: 27 }],
  ["Mixed Shifted Pungs", "222m333p444s789m11z", { winningTile: 27 }],
  [
    "Chicken Hand",
    "123555m345p678s44z",
    { winningTile: 25, melds: [meld("chi", 0, 1, 2), meld("chi", 11, 12, 13)] },
  ],
  [
    "Last Tile Draw",
    "123456m234p567s11z",
    { winningTile: 27, selfDraw: true, lastWall: true },
  ],
  [
    "Last Tile Claim",
    "123456m234p567s11z",
    { winningTile: 27, lastWall: true },
  ],
  [
    "Out with Replacement Tile",
    "1111m456m234p567s11z",
    {
      winningTile: 27,
      selfDraw: true,
      replacement: true,
      melds: [meld("daiminkan", 0, 0, 0, 0)],
    },
  ],
  [
    "Robbing The Kong",
    "123456m234p567s11z",
    { winningTile: 1, robbingQuad: true },
  ],
  [
    "All Pungs",
    "111m444p777s222z55z",
    { winningTile: 31, melds: [meld("pon", 0, 0, 0)] },
  ],
  ["Half Flush", "123456789m111z55m", { winningTile: 4 }],
  ["Mixed Shifted Chows", "123m234p345s789m11z", { winningTile: 27 }],
  ["All Types", "123m456p789s111z55z", { winningTile: 31 }],
  [
    "Melded Hand",
    "123m456p789s111z55z",
    {
      winningTile: 31,
      melds: [
        meld("chi", 0, 1, 2),
        meld("chi", 12, 13, 14),
        meld("chi", 24, 25, 26),
        meld("pon", 27, 27, 27),
      ],
    },
  ],
  [
    "Two Concealed Kongs",
    "1111m2222p345s678m55z",
    {
      winningTile: 31,
      melds: [meld("ankan", 0, 0, 0, 0), meld("ankan", 10, 10, 10, 10)],
    },
  ],
  ["Two Dragons Pungs", "555666z123m789p22s", { winningTile: 19 }],
  ["Outside Hand", "123789m111p111z99s", { winningTile: 26 }],
  [
    "Fully Concealed Hand",
    "123456m234p567s11z",
    { winningTile: 27, selfDraw: true },
  ],
  [
    "Two Melded Kongs",
    "1111m2222p345s678m55z",
    {
      winningTile: 31,
      melds: [
        meld("daiminkan", 0, 0, 0, 0),
        meld("shouminkan", 10, 10, 10, 10),
      ],
    },
  ],
  ["Last Tile", "123456m234p567s11z", { winningTile: 1, lastCopy: true }],
  ["Dragon Pung", "123456m234p555z11s", { winningTile: 18 }],
  ["Prevalent Wind", "123456m234p333z11s", { winningTile: 18 }],
  ["Seat Wind", "123456m234p222z11s", { winningTile: 18 }],
  ["Concealed Hand", "123456m234p567s11z", { winningTile: 27 }],
  ["All Chows", "123456m234p567s22p", { winningTile: 10 }],
  ["Tile Hog", "111123m456p789s55z", { winningTile: 31 }],
  ["Double Pung", "333m333p678s456m55z", { winningTile: 31 }],
  ["Two Concealed Pungs", "111m444p789s234m55z", { winningTile: 31 }],
  [
    "Concealed Kong",
    "1111m456m234p567s11z",
    { winningTile: 27, melds: [meld("ankan", 0, 0, 0, 0)] },
  ],
  ["All Simples", "234567m234p678s55p", { winningTile: 13 }],
  ["Pure Double Chow", "123123m456p789s22z", { winningTile: 28 }],
  ["Mixed Double Chow", "123m123p567s789m22z", { winningTile: 28 }],
  ["Short Straight", "234567m123p789s22z", { winningTile: 28 }],
  ["Two Terminal Chows", "123789m456p234s22z", { winningTile: 28 }],
  ["Pung of Terminals or Honors", "111m456p234s789m22z", { winningTile: 28 }],
  [
    "Melded Kong",
    "1111m456m234p567s11z",
    { winningTile: 27, melds: [meld("daiminkan", 0, 0, 0, 0)] },
  ],
  ["One Voided Suit", "123456m234p789m22z", { winningTile: 28 }],
  ["No Honors", "123m456p789s222m55p", { winningTile: 13 }],
  ["Unique Wait (Edge)", "123m456p789s222m55z", { winningTile: 2 }],
  ["Unique Wait (Closed)", "123m456p789s222m55z", { winningTile: 13 }],
  ["Unique Wait (Single)", "123m456p789s222m55z", { winningTile: 31 }],
  [
    "Self-Drawn",
    "123m456p789s222m55z",
    { winningTile: 31, selfDraw: true, melds: [meld("chi", 0, 1, 2)] },
  ],
  [
    "Flower Tiles",
    "123456m234p567s11z",
    { winningTile: 27, flowers: [34, 36] },
  ],
];
describe("all 81 MCR recognition cases", () => {
  it("covers the catalog exactly once with separately constructed examples", () => {
    expect([...examples.map((e) => e[0])].sort()).toEqual(
      mcrPatterns()
        .map((p) => p.name)
        .sort(),
    );
  });
  for (const [name, hand, options] of examples)
    it(name, () => {
      const counts = parseCounts(hand);
      const result = scoreMcr({
        counts,
        melds: [],
        winningTile: counts.findIndex((n) => n > 0),
        selfDraw: false,
        seatWind: 28,
        roundWind: 29,
        flowers: [],
        replacement: false,
        robbingQuad: false,
        lastWall: false,
        initial: false,
        lastCopy: false,
        ...options,
      });
      expect(
        result.patterns.some(
          (p) => p.name === name || p.name.startsWith(name + " ×"),
        ),
        JSON.stringify({ hand, found: result.patterns }),
      ).toBe(true);
    });
});
