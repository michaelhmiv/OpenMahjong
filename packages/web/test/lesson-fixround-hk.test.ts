/**
 * Hong Kong lesson fix round (brief-lesson-fixround-v1) oracle tests.
 *
 * The fix round adds transfer checks on pictured hands never used in
 * teaching (L5 eligibility/waits, L7 fan→payments, L9 specials + cap),
 * teaches the two named breakdowns from the rebuild panel (the
 * red-dragon pair's fan, and the Big Four Winds / All Honors overlap),
 * and adds face-mastery drills in L1–L2 (characters glyph→number in
 * shuffled order, winds name→face for all four winds). Every new
 * scored answer is recomputed here against the real engine scorer
 * and payment function, following the oracle pattern of PR #62: the
 * authored key must agree with the engine, not just with itself.
 */
import { describe, expect, it } from "vitest";
import {
  parseCounts,
  scoreHongKong,
  hongKongPayments,
} from "@openmahjong/engine";
import {
  VARIANT_LESSONS,
  variantLessonQuestions,
  type VariantQuestion,
} from "../src/education/variant-content.js";

const HK = VARIANT_LESSONS.filter((l) => l.variant === "hong-kong");
const question = (id: string): VariantQuestion => {
  const q = HK.flatMap(variantLessonQuestions).find((x) => x.id === id);
  if (!q) throw new Error(`missing question ${id}`);
  return q;
};
const score = (
  notation: string,
  winningTile: number,
  extra: Partial<Parameters<typeof scoreHongKong>[0]> = {},
) =>
  scoreHongKong({
    counts: parseCounts(notation),
    melds: [],
    winningTile,
    selfDraw: false,
    seatWind: 27,
    roundWind: 27,
    flowers: [],
    replacement: false,
    robbingQuad: false,
    lastWall: false,
    initial: false,
    lastCopy: false,
    ...extra,
  });
/** Hands pictured in the original teaching of each scoring lesson —
 * a transfer hand must be new, i.e. not one of these. */
const TAUGHT_HANDS: Record<string, string[]> = {
  "hk-minimum": ["123456m123p789s11z", "34m123p456p789s77z"],
  "hk-payments": ["222m333p444s555z11z"],
  "hk-specials": ["19m19p19s1234567z1m", "1112345678999m2m"],
};

describe("Hong Kong fix round — face-mastery drills (L1–L2)", () => {
  it("drills characters glyph→number on single faces and shuffled rows", () => {
    const singles = ["hk-char-face-8", "hk-char-face-3", "hk-char-face-6"].map(
      question,
    );
    for (const q of singles) {
      expect(q.kind).toBe("choice");
      if (q.kind !== "choice") continue;
      // The shown face is a single characters tile; the key names its
      // number, and the row is not presented in taught order.
      expect(q.tiles).toMatch(/^[1-9]m$/);
      expect(q.choices[q.answer]!.toLowerCase()).toContain(
        { "8m": "eight", "3m": "three", "6m": "six" }[q.tiles!]!,
      );
      expect(q.verify()).toBe(q.choices[q.answer]!);
    }
    const rows = ["hk-char-row-9", "hk-char-row-8"].map(question);
    for (const q of rows) {
      expect(q.kind).toBe("tile-pick");
      if (q.kind !== "tile-pick") continue;
      const counts = parseCounts(q.tiles);
      expect(counts.reduce((a, b) => a + b, 0)).toBe(4);
      // Shuffled: the row is not the taught 1–9 order.
      expect(q.tiles).not.toBe("123456789m");
      expect(q.verify()).toBe(q.picks.join(","));
    }
    // The 9 drill's pick is the third tile of its shuffled row.
    const nine = question("hk-char-row-9");
    if (nine.kind === "tile-pick") expect(nine.picks).toEqual([2]);
  });
  it("drills name→face for all four winds in shuffled rows", () => {
    const drills: [string, number][] = [
      ["hk-wind-east-face", 27],
      ["hk-wind-south-face", 28],
      ["hk-wind-west-face", 29],
      ["hk-wind-north-face", 30],
    ];
    const covered = new Set<number>();
    for (const [id, windType] of drills) {
      const q = question(id);
      expect(q.kind, id).toBe("tile-pick");
      if (q.kind !== "tile-pick") continue;
      // Re-derive the row's tile types in display order from the notation.
      const ordered: number[] = [];
      const re = /(\d+)([mpsz])/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(q.tiles))) {
        const base =
          m[2] === "m" ? 0 : m[2] === "p" ? 9 : m[2] === "s" ? 18 : 27;
        for (const d of m[1]!) ordered.push(base + Number(d) - 1);
      }
      expect(ordered[q.picks[0]!]!, id).toBe(windType);
      // Shuffled: not seat order 27,28,29,30.
      expect(ordered, id).not.toEqual([27, 28, 29, 30]);
      covered.add(windType);
    }
    expect(covered).toEqual(new Set([27, 28, 29, 30]));
  });
});

describe("Hong Kong fix round — named breakdowns (L6)", () => {
  it("teaches the red-dragon pair's value explicitly: no fan on its own", () => {
    const lesson = HK.find((l) => l.id === "hk-honors")!;
    const text = lesson.steps.map((s) => s.text ?? "").join(" ");
    expect(text).toContain("A pair of dragons earns no fan on its own");
    const r = score("123m456m789p234s77z", 33);
    expect(
      r.patterns.some(
        (p) => p.id.startsWith("dragon-") || p.id.includes("dragons"),
      ),
    ).toBe(false);
    expect(r.units).toBe(2);
    const q = question("hk-red-pair-value");
    expect(q.verify()).toBe("No fan");
  });
  it("addresses the Big Four Winds / All Honors overlap: both count", () => {
    const r = score("111z222z333z444z55z", 31);
    expect(r.patterns.find((p) => p.id === "big-four-winds")?.units).toBe(15);
    expect(r.patterns.find((p) => p.id === "all-honors")?.units).toBe(10);
    const q = question("hk-winds-honors-overlap");
    expect(q.verify()).toContain("Both count");
    const lesson = HK.find((l) => l.id === "hk-honors")!;
    const text = lesson.steps.map((s) => s.text ?? "").join(" ");
    expect(text).toContain("the two patterns both count");
  });
});

describe("Hong Kong fix round — transfer checks on new hands", () => {
  it("L5: self-draw transfer hand is 2 fan on a discard, 3 and eligible self-drawn", () => {
    const hand = "345s345s678p234m99p";
    expect(TAUGHT_HANDS["hk-minimum"]).not.toContain(hand);
    expect(score(hand, 17).units).toBe(2);
    expect(score(hand, 17).eligible).toBe(false);
    const drawn = score(hand, 17, { selfDraw: true });
    expect(drawn.units).toBe(3);
    expect(drawn.eligible).toBe(true);
    expect(question("hk-transfer-selfdraw").verify()).toBe(
      "Three fan — it may win",
    );
  });
  it("L7: all-triplets transfer hand counts 4 fan and the discarder pays 32", () => {
    const hand = "888m999p111s222s55z";
    expect(TAUGHT_HANDS["hk-payments"]).not.toContain(hand);
    expect(score(hand, 31).units).toBe(4);
    // The white-dragon pair contributes no dragon fan.
    expect(
      score(hand, 31).patterns.some((p) => p.id.startsWith("dragon-")),
    ).toBe(false);
    const payments = hongKongPayments(4, {
      winner: 0,
      payer: 1,
      selfDraw: false,
    });
    expect(payments.find((p) => p.seat === 1)!.amount).toBe(32);
    expect(payments.reduce((n, p) => n + p.amount, 0)).toBe(64);
    expect(question("hk-transfer-triplets-pay").verify()).toBe("32");
  });
  it("L7: Little Three Dragons transfer hand counts 6 fan and pays 128 in total", () => {
    const hand = "666z777z55z234m789p";
    expect(TAUGHT_HANDS["hk-payments"]).not.toContain(hand);
    const r = score(hand, 31);
    expect(r.units).toBe(6);
    expect(r.patterns.find((p) => p.id === "little-three-dragons")?.units).toBe(5);
    const total = hongKongPayments(6, {
      winner: 0,
      payer: 1,
      selfDraw: false,
    }).reduce((n, p) => n + p.amount, 0);
    expect(total).toBe(128);
    expect(question("hk-transfer-dragons-pay").verify()).toBe("128");
  });
  it("L9: new Thirteen Orphans hand counts 13, is paid at the cap, and splits 256/128/128", () => {
    const hand = "19m19p19s1234567z7z";
    expect(TAUGHT_HANDS["hk-specials"]).not.toContain(hand);
    expect(score(hand, 33).units).toBe(13);
    const payments = hongKongPayments(13, {
      winner: 0,
      payer: 1,
      selfDraw: false,
    });
    expect(payments).toEqual(
      hongKongPayments(10, { winner: 0, payer: 1, selfDraw: false }),
    );
    expect(payments.find((p) => p.seat === 1)!.amount).toBe(256);
    expect(payments.find((p) => p.seat === 2)!.amount).toBe(128);
    expect(payments.reduce((n, p) => n + p.amount, 0)).toBe(512);
    expect(question("hk-transfer-orphans-pay").verify()).toContain("512");
  });
  it("L9: new Nine Gates hand counts 16 in total and is paid at the cap", () => {
    const hand = "1112345678999s7s";
    expect(TAUGHT_HANDS["hk-specials"]).not.toContain(hand);
    const r = score(hand, 24);
    expect(r.patterns.find((p) => p.id === "nine-gates")?.units).toBe(15);
    expect(r.units).toBe(16);
    expect(
      hongKongPayments(r.units, { winner: 0, payer: 1, selfDraw: false }),
    ).toEqual(hongKongPayments(10, { winner: 0, payer: 1, selfDraw: false }));
    expect(question("hk-transfer-gates-cap").verify()).toContain("Sixteen fan");
  });
  it("every new transfer/breakdown check has at least four choices or is a tile-pick", () => {
    for (const id of [
      "hk-transfer-selfdraw",
      "hk-red-pair-value",
      "hk-winds-honors-overlap",
      "hk-transfer-triplets-fan",
      "hk-transfer-triplets-pay",
      "hk-transfer-dragons-fan",
      "hk-transfer-dragons-pay",
      "hk-transfer-orphans-cap",
      "hk-transfer-orphans-pay",
      "hk-transfer-gates-cap",
    ]) {
      const q = question(id);
      if (q.kind === "choice") expect(q.choices.length, id).toBeGreaterThanOrEqual(4);
      expect(q.hint.trim().length, id).toBeGreaterThan(0);
      // Hint-only feedback: the hint must not state the keyed answer.
      if (q.kind === "choice")
        expect(q.hint, id).not.toContain(q.choices[q.answer]!);
    }
  });
});
