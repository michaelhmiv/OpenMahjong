// @vitest-environment jsdom
/**
 * Lesson fix round (2026-11-17): TU-8's transfer checks and TU-1's
 * face-mastery drills, verified against the real riichi scorer.
 *
 * TU-8's counting checks used to re-count only its own worked hand.
 * The fix round adds a second worked hand (fu itemised part by part)
 * and three transfer checks on pictured hands never used in
 * teaching. Every number those steps teach or ask for — han, fu,
 * and the exact per-player payments, across ron and tsumo, dealer
 * and non-dealer — is asserted here against scoreHand() run on the
 * very tiles the lesson pictures (the oracle pattern of rebuild
 * PRs #57/#63 and of score-breakdown.test.ts). If a pictured hand
 * or a stated context changes, this test recomputes the truth and
 * fails until the lesson text agrees with the engine again.
 *
 * TU-7's stacking check is verified the same way, and TU-1's new
 * drills are checked mechanically: every characters number is
 * drilled exactly once from a shuffled row, and every wind is
 * matched name to face.
 */
import { describe, expect, it } from "vitest";
import { parseCounts, scoreHand, type TileType } from "@openmahjong/engine";
import { LessonController } from "../src/tutorial.js";

interface StepLike {
  readonly kind: string;
  readonly text?: string | ((c: LessonController) => string);
  readonly strip?: readonly number[];
  readonly tiles?: readonly number[];
  readonly targets?: readonly number[];
  readonly options?: readonly { readonly label: string }[];
  readonly correct?: number;
}

function stepsOf(id: "tu1" | "tu7" | "tu8"): readonly StepLike[] {
  return new LessonController(id).steps as unknown as readonly StepLike[];
}

function textOf(step: StepLike): string {
  return typeof step.text === "string" ? step.text : "";
}

function findStep(steps: readonly StepLike[], marker: string): StepLike {
  const step = steps.find((s) => textOf(s).includes(marker));
  expect(step, `step containing "${marker}"`).toBeDefined();
  return step!;
}

/** The three choice steps that follow a pictured-hand info step
 * (the worked hand has its breakdown step in between; the transfer
 * hands ask first and explain after). */
function choicesAfter(steps: readonly StepLike[], marker: string): readonly StepLike[] {
  const at = steps.findIndex((s) => textOf(s).includes(marker));
  expect(at, `step containing "${marker}"`).toBeGreaterThanOrEqual(0);
  const out: StepLike[] = [];
  for (let i = at + 1; i < steps.length && out.length < 3; i++) {
    if (steps[i]!.kind === "choice") out.push(steps[i]!);
  }
  expect(out.length).toBe(3);
  return out;
}

function correctLabel(step: StepLike): string {
  return step.options![step.correct!]!.label;
}

function countsOf(types: readonly number[]): number[] {
  const counts = new Array<number>(34).fill(0);
  for (const t of types) counts[t]!++;
  return counts;
}

const fmt = (n: number) => n.toLocaleString("en-US");

// ---------------------------------------------------------------------------
// TU-8: the second worked hand and the three transfer hands.
// ---------------------------------------------------------------------------

interface TransferCase {
  readonly marker: string;
  readonly breakdownMarker: string;
  readonly input: Parameters<typeof scoreHand>[0];
  readonly paymentLabel: (r: ReturnType<typeof scoreHand>) => string;
}

const TU8_CASES: readonly TransferCase[] = [
  {
    // Second worked hand: closed riichi ron, non-dealer, tanki on
    // the white-dragon pair — fu itemised in the lesson text.
    marker: "a second worked hand, counted in full",
    breakdownMarker: "Here is that hand counted out in full",
    input: {
      handCounts: parseCounts("222m345m678p999s55z"), melds: [],
      winningTileType: 31 as TileType, winType: "ron",
      seatWind: 28 as TileType, roundWind: 27 as TileType,
      riichi: true, dora: 0, honba: 0, riichiSticks: 0,
    },
    paymentLabel: (r) => `${fmt(r.ronPoints!)} points from the discarder`,
  },
  {
    // Transfer 1: dealer ron — riichi + pinfu + tanyao stacked.
    marker: "now count a hand yourself, one that has not been counted for you",
    breakdownMarker: "That hand, counted out: riichi — 1 han; pinfu",
    input: {
      handCounts: parseCounts("234m345p678p234s55m"), melds: [],
      winningTileType: 1 as TileType, winType: "ron",
      seatWind: 27 as TileType, roundWind: 27 as TileType,
      riichi: true, dora: 0, honba: 0, riichiSticks: 0,
    },
    paymentLabel: (r) => `${fmt(r.ronPoints!)} points from the discarder`,
  },
  {
    // Transfer 2: non-dealer tsumo — menzen tsumo + seat-wind yakuhai.
    marker: "another hand to count yourself",
    breakdownMarker: "winning on your own draw with a closed hand — 1 han; and a triplet of your own seat wind",
    input: {
      handCounts: parseCounts("234m345p666s222z44s"), melds: [],
      winningTileType: 21 as TileType, winType: "tsumo",
      seatWind: 28 as TileType, roundWind: 27 as TileType,
      riichi: false, dora: 0, honba: 0, riichiSticks: 0,
    },
    paymentLabel: (r) =>
      `${fmt(r.tsumoPoints!.dealer)} points from the dealer and ${fmt(r.tsumoPoints!.nonDealer)} points from each of the other two opponents`,
  },
  {
    // Transfer 3: dealer tsumo — tanyao + menzen tsumo.
    marker: "one more hand to count yourself",
    breakdownMarker: "every tile is a simple — 1 han; and winning on your own draw",
    input: {
      handCounts: parseCounts("345m888m567p678s55p"), melds: [],
      winningTileType: 13 as TileType, winType: "tsumo",
      seatWind: 27 as TileType, roundWind: 27 as TileType,
      riichi: false, dora: 0, honba: 0, riichiSticks: 0,
    },
    paymentLabel: (r) => `${fmt(r.tsumoPoints!.dealer)} points from each opponent`,
  },
];

describe("TU-8 worked + transfer hands: lesson numbers equal the engine's", () => {
  const steps = stepsOf("tu8");

  for (const kase of TU8_CASES) {
    it(`hand at "${kase.marker.slice(0, 40)}…": han, fu and payment verify`, () => {
      const pictured = findStep(steps, kase.marker);
      // The lesson pictures exactly the hand the oracle scores.
      expect(countsOf(pictured.strip!)).toEqual([...kase.input.handCounts]);
      const scored = scoreHand(kase.input);
      const [hanStep, fuStep, payStep] = choicesAfter(steps, kase.marker);
      expect(correctLabel(hanStep!)).toBe(`${scored.han} han`);
      expect(correctLabel(fuStep!)).toBe(`${scored.fu} fu`);
      expect(correctLabel(payStep!)).toBe(kase.paymentLabel(scored));
      // Guessing cannot certify: every check offers four options.
      for (const s of [hanStep, fuStep, payStep]) expect(s!.options!.length).toBe(4);
      // The post-answer breakdown step states the same totals.
      const breakdown = textOf(findStep(steps, kase.breakdownMarker));
      expect(breakdown).toContain(`${scored.han} han`);
      expect(breakdown).toContain(`${scored.fu} fu`);
    });
  }

  it("the four pictured hands are all different, and none repeats the seeded win's questions", () => {
    const strips = TU8_CASES.map((k) => findStep(steps, k.marker).strip!.join(","));
    expect(new Set(strips).size).toBe(strips.length);
  });

  it("fu itemisation of the worked hand adds to the scorer's fu before rounding", () => {
    const scored = scoreHand(TU8_CASES[0]!.input);
    // Base 20 + closed ron 10 + closed simple triplet 4 + closed
    // terminal triplet 8 + dragon pair 2 + single-tile wait 2 = 46,
    // which rounds up to the scorer's 50.
    expect(20 + 10 + 4 + 8 + 2 + 2).toBe(46);
    expect(scored.fu).toBe(50);
    expect(scored.yaku.map((y) => y.id)).toEqual(["riichi"]);
  });
});

// ---------------------------------------------------------------------------
// TU-7: han stacking is taught and checked on a pictured hand.
// ---------------------------------------------------------------------------

describe("TU-7 stacking check verifies against the scorer", () => {
  const steps = stepsOf("tu7");

  it("the stacking example hand is pinfu + tanyao for 2 han", () => {
    const example = findStep(steps, "the yaku stack");
    const scored = scoreHand({
      handCounts: countsOf(example.strip!), melds: [],
      winningTileType: 1 as TileType, winType: "ron",
      seatWind: 28 as TileType, roundWind: 27 as TileType,
      riichi: false, dora: 0, honba: 0, riichiSticks: 0,
    });
    expect(scored.yaku.map((y) => y.id).sort()).toEqual(["pinfu", "tanyao"]);
    expect(scored.han).toBe(2);
  });

  it("the stacking check hand is tanyao + toitoi, and its correct option says so", () => {
    const check = findStep(steps, "How many han is this hand worth in all?");
    const scored = scoreHand({
      handCounts: countsOf(check.strip!),
      melds: [{ kind: "pon", tiles: [25, 25, 25] as TileType[] }],
      winningTileType: 10 as TileType, winType: "ron",
      seatWind: 28 as TileType, roundWind: 27 as TileType,
      riichi: false, dora: 0, honba: 0, riichiSticks: 0,
    });
    expect(scored.yaku.map((y) => y.id).sort()).toEqual(["tanyao", "toitoi"]);
    expect(correctLabel(check)).toBe(`${scored.han} han`);
    expect(check.options!.length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// TU-1: face-mastery drills.
// ---------------------------------------------------------------------------

describe("TU-1 face-mastery drills cover every characters face and every wind", () => {
  const steps = stepsOf("tu1");
  const appended = steps.slice(20);

  it("drills every characters number exactly once, from shuffled rows", () => {
    const drills = appended.filter((s) => s.kind === "drill" && /of characters/.test(textOf(s)));
    const seen = new Set<number>();
    for (const d of drills) {
      const n = Number(textOf(d).match(/Tap the (\d) of characters/)![1]);
      seen.add(n);
      // The target cell is the face for the named number.
      expect(d.tiles![d.targets![0]!]).toBe(n - 1);
      // The row is all nine characters faces, shuffled — never the
      // taught row order, so position memory cannot pass.
      expect([...d.tiles!].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
      expect(d.tiles!.join(",")).not.toBe("0,1,2,3,4,5,6,7,8");
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("matches every wind name to its face", () => {
    const windType: Record<string, number> = { East: 27, South: 28, West: 29, North: 30 };
    const drills = appended.filter((s) => s.kind === "drill" && /wind\./.test(textOf(s)));
    const seen = new Set<string>();
    for (const d of drills) {
      const name = textOf(d).match(/Tap the (East|South|West|North) wind/)![1]!;
      seen.add(name);
      expect(d.tiles![d.targets![0]!]).toBe(windType[name]);
    }
    expect([...seen].sort()).toEqual(["East", "North", "South", "West"]);
  });
});
