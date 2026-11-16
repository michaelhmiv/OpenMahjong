/**
 * Shanten/ukeire test vectors (brief §13, acceptance check A2).
 *
 * Expected values are hand-derived from standard mahjong theory (block
 * counting for the standard form; the 6−pairs / 13−types formulas for
 * chiitoitsu and kokushi). A2 targets ≥100 vectors for slice 1; this
 * foundation PR ships the harness plus the vectors below (48 positions).
 *
 * Notation: see tiles.ts `parseCounts` (0 = red five, z1–z7 = E S W N Wh Gr Rd).
 */

export interface ShantenVector {
  readonly hand: string;
  /** Open melds already formed (closed portion is `hand`). */
  readonly melds?: number;
  readonly expected: number;
  readonly note: string;
}

export const SHANTEN_VECTORS: readonly ShantenVector[] = [
  // --- Tenpai (0), 13 tiles, standard form ---
  { hand: "234m456m789m234p5p", expected: 0, note: "tanki wait on the pair tile" },
  { hand: "234m567p678s23s99m", expected: 0, note: "ryanmen wait 1s/4s" },
  { hand: "345m345p345s678s5z", expected: 0, note: "tanki wait on white dragon" },
  { hand: "111m222p333s44z55m", expected: 0, note: "shanpon wait (two pairs)" },
  { hand: "678m234p678s45s99p", expected: 0, note: "ryanmen wait 3s/6s" },
  { hand: "123m456p789s13m55z", expected: 0, note: "kanchan wait on 2m" },
  { hand: "123m456p789s12p11z", expected: 0, note: "penchan wait on 3p, East pair" },
  { hand: "111222333m45p99s", expected: 0, note: "three identical sequences + ryanmen + pair" },
  { hand: "222m345p678p234s9s", expected: 0, note: "triplet + three sequences, tanki wait" },
  { hand: "456m789m11p345s67s", expected: 0, note: "ryanmen wait 5s/8s with pair" },
  // --- Tenpai (0), special forms ---
  { hand: "1122m3344p5566s7z", expected: 0, note: "chiitoitsu tenpai, single wait" },
  { hand: "19m19p19s1234567z", expected: 0, note: "kokushi 13-wait tenpai" },
  { hand: "119m19p19s123456z", expected: 0, note: "kokushi single-wait tenpai (12 types + pair)" },
  { hand: "1122m3344p5566s17z", expected: 0, note: "chiitoitsu, 14 tiles, two singles (discard to tenpai)" },
  // --- 1-shanten ---
  { hand: "234m567p234s55z7m9p", expected: 1, note: "3 sets + pair + two floaters" },
  { hand: "123m456m789m11p4s6z", expected: 1, note: "3 sets + pair + two floaters" },
  { hand: "234m567p23s78s77z1z", expected: 1, note: "2 sets + 2 taatsu + pair + floater" },
  { hand: "1122m3344p556s7z9p", expected: 1, note: "chiitoitsu: 5 pairs, 8 unique types" },
  { hand: "119m19p19s12345z5p", expected: 1, note: "kokushi: 11 types + pair" },
  { hand: "234m567m234p23s6s5z", expected: 1, note: "3 sets + 1 taatsu, no pair" },
  // --- 2-shanten ---
  { hand: "234m567m234p5s8s4z1z", expected: 2, note: "3 sets + four unrelated floaters" },
  { hand: "1122m33p44s5s8p6z7z9m", expected: 2, note: "chiitoitsu: 4 pairs, 9 unique types" },
  { hand: "111222333m4p8s6z7z", expected: 2, note: "3 sets (one suit) + four floaters" },
  { hand: "189m139p19s12345z", expected: 2, note: "kokushi: 11 types, no pair" },
  { hand: "1111m2233p4455s6z", expected: 2, note: "quad counts once for chiitoitsu (5 unique pairs + triplet shape)" },
  // --- 3-shanten ---
  { hand: "999m234p55s7m1p8p3z6z", expected: 3, note: "2 sets + pair + five floaters" },
  { hand: "789m234p55s1m4m7z6z2z", expected: 3, note: "2 sets + pair + five floaters" },
  { hand: "112233m49p58s267z", expected: 3, note: "chiitoitsu: 3 pairs, 10 unique types" },
  // --- Complete hands (-1), 14 tiles ---
  { hand: "234m456m789m234p55p", expected: -1, note: "standard form: 4 sequences + pair" },
  { hand: "1122m3344p5566s77z", expected: -1, note: "chiitoitsu complete" },
  { hand: "119m19p19s1234567z", expected: -1, note: "kokushi complete (13 types + pair)" },
  { hand: "234m456m789m234p5p6z", expected: 0, note: "14 tiles: 4 sets + two singles (one discard from tenpai shape)" },
  // --- Hands with melds (closed portion + meld count) ---
  { hand: "234m567p234s5z", melds: 1, expected: 0, note: "3 closed sets + meld, tanki tenpai" },
  { hand: "345p678s9m", melds: 2, expected: 0, note: "2 closed sets + 2 melds, tanki tenpai" },
  { hand: "55m78p", melds: 3, expected: 0, note: "pair + ryanmen + 3 melds, tenpai" },
  { hand: "55m7p9s", melds: 3, expected: 1, note: "pair + two floaters + 3 melds" },
  { hand: "234m567p23s5z8m", melds: 1, expected: 1, note: "2 closed sets + taatsu + two floaters + meld" },
  { hand: "345m678m345p7p", melds: 1, expected: 0, note: "3 closed sets + meld, tanki tenpai" },
  // --- Edge cases ---
  { hand: "147m147p147s1234z", expected: 6, note: "all tiles isolated: chiitoitsu/kokushi path caps at 6" },
];

export interface UkeireVector {
  readonly hand: string;
  /** Tiles visible outside the hand (same notation), e.g. discards. */
  readonly visible?: string;
  readonly melds?: number;
  /** Expected improving tiles: type index -> copies remaining. */
  readonly expectedImproving: Readonly<Record<number, number>>;
  readonly expectedTotal: number;
  readonly note: string;
}

// Type indices: 5m=4, 6m=5, 7m=6, 8m=7, 2p=10, 3p=11, 4p=12, 5p=13, 6p=14,
// 7p=15, 8p=16, 9p=17, 1s=18, 3s=20, 4s=21, 6s=23, 7s=24, 8s=25, 9s=26,
// E=27, N=30, Wh=31, Rd=33.
export const UKEIRE_VECTORS: readonly UkeireVector[] = [
  {
    hand: "234m567p678s23s99m",
    expectedImproving: { 18: 4, 21: 4 },
    expectedTotal: 8,
    note: "ryanmen 1s/4s, nothing visible",
  },
  {
    hand: "234m567p678s23s99m",
    visible: "11s",
    expectedImproving: { 18: 2, 21: 4 },
    expectedTotal: 6,
    note: "ryanmen with two 1s already discarded",
  },
  {
    hand: "234m456m789m234p5p",
    expectedImproving: { 10: 3, 13: 3 },
    expectedTotal: 6,
    note: "two-way wait: 2p completes 345p + 22p pair, 5p pairs the single; 3 copies each remain",
  },
  {
    hand: "111m222p333s44z55m",
    expectedImproving: { 30: 2, 4: 2 },
    expectedTotal: 4,
    note: "shanpon: 2 copies each of North and 5m remain",
  },
  {
    hand: "19m19p19s1234567z",
    expectedImproving: {
      0: 3, 8: 3, 9: 3, 17: 3, 18: 3, 26: 3,
      27: 3, 28: 3, 29: 3, 30: 3, 31: 3, 32: 3, 33: 3,
    },
    expectedTotal: 39,
    note: "kokushi 13-wait: every terminal/honor improves, 3 copies each",
  },
  {
    hand: "1122m3344p5566s7z",
    expectedImproving: { 33: 3 },
    expectedTotal: 3,
    note: "chiitoitsu tenpai: only the single (red dragon) completes a pair; 3 copies remain",
  },
  {
    hand: "234m567p234s55z7m9p",
    expectedImproving: { 4: 4, 5: 4, 6: 3, 7: 4, 8: 4, 12: 4, 15: 3, 16: 4, 17: 3, 31: 2 },
    expectedTotal: 35,
    note: "1-shanten: floaters improve by pairing, ryanmen/kanchan extension (incl. 5m/9m kanchan with 7m, 4p via the 7p-9p kanchan), or tripling the pair",
  },
  {
    hand: "234m567p234s5z",
    melds: 1,
    expectedImproving: { 31: 3 },
    expectedTotal: 3,
    note: "tanki tenpai with a meld: only pairing the white dragon improves",
  },
  {
    hand: "111222333m4p99s5z",
    expectedImproving: { 10: 4, 11: 4, 12: 3, 13: 4, 14: 4, 26: 2, 31: 3 },
    expectedTotal: 24,
    note: "1-shanten: 4p improves by pair/ryanmen/kanchan, 9s by triplet, 5z by pair (7s/8s do NOT improve: the 9s pair cannot also form a taatsu)",
  },
  {
    hand: "1122m3344p556s7z9p",
    expectedImproving: { 23: 3, 33: 3, 17: 3 },
    expectedTotal: 9,
    note: "chiitoitsu 1-shanten: pairing any of the three singles improves",
  },
];
