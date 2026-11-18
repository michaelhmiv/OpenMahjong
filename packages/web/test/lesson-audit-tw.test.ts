// @vitest-environment jsdom
/**
 * Lesson rebuild PR D acceptance audits for the Taiwanese track
 * (brief-lesson-rebuild-v2.md), mirroring tutorial-terms.test.ts:
 *
 * - Term order: for every audited term, its first occurrence in the
 *   track's visible text (step texts, then each step's question
 *   prompt, choices, hint and explanation, in lesson order) is at or
 *   after the step that teaches it, and the teaching step uses it.
 *   Lesson titles are list labels and are not part of the reading
 *   order; they are covered by the denylist below instead.
 * - Structure: every lesson shows tile faces within its first two
 *   steps; lesson 1 names the three suits; every choice question has
 *   at least four choices; the track's worked hand is present in the
 *   payments lesson and its numbers verify against the engine's
 *   Taiwanese scorer and payment function.
 * - Developer-text denylist over all Taiwanese visible text,
 *   including titles: no profile/preset/schema/coach/adapter/
 *   heuristic/learning-record talk, no untaught jargon (chow, ting,
 *   fu), no cross-variant comparisons (riichi, dora), and no
 *   tile-code notation in teaching text.
 * - Definition audit (Nov 17, 2026): the term list above also covers
 *   the surface names a player can meet before finishing the track
 *   (meld, live wall, exposed, the win-list award names) — each is
 *   first used at the step that defines it in plain words.
 */
import { describe, expect, it } from "vitest";
import {
  parseCounts,
  scoreTaiwanese,
  taiwanesePayments,
  type VariantScoreInput,
} from "@openmahjong/engine";
import { TAIWANESE_LESSONS } from "../src/education/taiwanese-lessons.js";
import {
  validateVariantContent,
  variantLessonQuestions,
  type VariantLesson,
} from "../src/education/variant-content.js";

// ---------------------------------------------------------------------------
// Collection: every player-visible string, in lesson order.
// ---------------------------------------------------------------------------

interface Collected {
  readonly lesson: string;
  readonly step: number;
  readonly position: number;
  readonly texts: readonly string[];
}

function collect(): Collected[] {
  const out: Collected[] = [];
  TAIWANESE_LESSONS.forEach((lesson, li) => {
    lesson.steps.forEach((step, si) => {
      const texts: string[] = [];
      if (step.text) texts.push(step.text);
      if (step.question) {
        const q = step.question;
        texts.push(q.prompt, q.hint, q.explanation);
        if (q.kind === "choice") texts.push(...q.choices);
      }
      out.push({
        lesson: lesson.id,
        step: si,
        position: li * 1000 + si,
        texts,
      });
    });
  });
  return out;
}

const collected = collect();
const positionOf = (lessonId: string, step: number) =>
  TAIWANESE_LESSONS.findIndex((l) => l.id === lessonId) * 1000 + step;

function visibleText(lesson: VariantLesson): string[] {
  const texts: string[] = [lesson.title];
  for (const step of lesson.steps) {
    if (step.text) texts.push(step.text);
    if (step.question) {
      const q = step.question;
      texts.push(q.prompt, q.hint, q.explanation);
      if (q.kind === "choice") texts.push(...q.choices);
    }
  }
  return texts;
}

// ---------------------------------------------------------------------------
// Term order.
// ---------------------------------------------------------------------------

const TERMS: readonly {
  readonly term: string;
  readonly pattern: RegExp;
  readonly lesson: string;
  readonly step: number;
}[] = [
  { term: "flower", pattern: /\bflowers?\b/i, lesson: "tw-tiles", step: 16 },
  { term: "quad", pattern: /\bquads?\b/i, lesson: "tw-tiles", step: 15 },
  { term: "tai", pattern: /\btai\b/i, lesson: "tw-profile", step: 0 },
  { term: "dealer", pattern: /\bdealer\b/i, lesson: "tw-profile", step: 4 },
  { term: "seat wind", pattern: /\bseat wind\b/i, lesson: "tw-profile", step: 4 },
  { term: "round wind", pattern: /\bround wind\b/i, lesson: "tw-profile", step: 5 },
  { term: "repeat", pattern: /\brepeats?\b/i, lesson: "tw-profile", step: 8 },
  { term: "discard win", pattern: /\bdiscard win\b/i, lesson: "tw-turns", step: 1 },
  { term: "self-draw", pattern: /self-draw/i, lesson: "tw-turns", step: 1 },
  { term: "concealed", pattern: /\bconcealed\b/i, lesson: "tw-turns", step: 3 },
  { term: "eligible", pattern: /\beligib/i, lesson: "tw-turns", step: 6 },
  { term: "wall", pattern: /\bwall\b/i, lesson: "tw-flowers", step: 0 },
  { term: "reserve", pattern: /\breserve\b/i, lesson: "tw-flowers", step: 2 },
  { term: "wait", pattern: /\bwaits?\b|\bwaiting\b/i, lesson: "tw-structure", step: 0 },
  { term: "ready", pattern: /\bready\b/i, lesson: "tw-structure", step: 0 },
  // Definition audit (Nov 17, 2026): names a Taiwanese player meets
  // on the win list, the table and the calculator must be defined at
  // their first use inside this track — a definition in another
  // track does not count.
  { term: "exposed", pattern: /\bexposed\b/i, lesson: "tw-tiles", step: 16 },
  { term: "meld", pattern: /\bmelds?\b/i, lesson: "tw-turns", step: 3 },
  { term: "live wall", pattern: /\blive wall\b/i, lesson: "tw-flowers", step: 0 },
  { term: "quartet", pattern: /\bquartets?\b/i, lesson: "tw-flowers", step: 3 },
  { term: "Eight Immortals", pattern: /\beight immortals\b/i, lesson: "tw-flowers", step: 3 },
  { term: "closed wait", pattern: /\bclosed wait\b/i, lesson: "tw-structure", step: 1 },
  { term: "flush", pattern: /\bflush\b/i, lesson: "tw-structure", step: 6 },
  { term: "All Honors", pattern: /\ball honors\b/i, lesson: "tw-structure", step: 6 },
  { term: "Little Four Winds", pattern: /\blittle four winds\b/i, lesson: "tw-structure", step: 7 },
  { term: "Big Four Winds", pattern: /\bbig four winds\b/i, lesson: "tw-structure", step: 7 },
  { term: "unique", pattern: /\bunique\b/i, lesson: "tw-waits", step: 0 },
  { term: "Heavenly hand", pattern: /\bheavenly\b/i, lesson: "tw-quads", step: 5 },
  { term: "Earthly hand", pattern: /\bearthly\b/i, lesson: "tw-quads", step: 5 },
];

describe("TW term order: no term is used before the step that teaches it", () => {
  for (const { term, pattern, lesson, step } of TERMS) {
    it(`"${term}" is first used at or after its teaching step (${lesson} step ${step})`, () => {
      const taughtAt = positionOf(lesson, step);
      const teaching = collected.find(
        (e) => e.lesson === lesson && e.step === step,
      );
      expect(teaching, `${lesson} step ${step} exists`).toBeDefined();
      expect(
        teaching!.texts.some((t) => pattern.test(t)),
        `"${term}" should appear in its teaching step`,
      ).toBe(true);
      for (const entry of collected) {
        if (entry.position >= taughtAt) continue;
        const hit = entry.texts.find((t) => pattern.test(t));
        expect(
          hit,
          `"${term}" used in ${entry.lesson} step ${entry.step} before its teaching step: ${hit}`,
        ).toBeUndefined();
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Structure.
// ---------------------------------------------------------------------------

describe("TW structure", () => {
  it("keeps the ten lesson ids in order, at content version 2", () => {
    expect(TAIWANESE_LESSONS.map((l) => l.id)).toEqual([
      "tw-tiles",
      "tw-profile",
      "tw-turns",
      "tw-flowers",
      "tw-tai",
      "tw-structure",
      "tw-waits",
      "tw-quads",
      "tw-payments",
      "tw-match",
    ]);
    expect(TAIWANESE_LESSONS.every((l) => l.version === 2)).toBe(true);
    validateVariantContent();
  });

  it("shows tile faces within the first two steps of every lesson", () => {
    for (const lesson of TAIWANESE_LESSONS) {
      const shown = lesson.steps
        .slice(0, 2)
        .some((s) => s.tiles || s.hand || s.question?.tiles);
      expect(shown, `${lesson.id} shows no tiles in its first two steps`).toBe(
        true,
      );
    }
  });

  it("names the three suits in lesson 1's text", () => {
    const text = TAIWANESE_LESSONS[0]!.steps
      .map((s) => s.text ?? "")
      .join(" ")
      .toLowerCase();
    for (const suit of ["characters", "circles", "bamboo"])
      expect(text).toContain(suit);
  });

  it("gives every choice question at least four choices, and uses tile-pick drills", () => {
    const questions = TAIWANESE_LESSONS.flatMap(variantLessonQuestions);
    expect(questions).toHaveLength(42);
    for (const q of questions)
      if (q.kind === "choice")
        expect(
          q.choices.length,
          `${q.id} has fewer than four choices`,
        ).toBeGreaterThanOrEqual(4);
    expect(questions.filter((q) => q.kind === "tile-pick")).toHaveLength(8);
    expect(questions.every((q) => q.hint.trim().length > 0)).toBe(true);
  });

  it("drills every wind face by name and characters numbers by face in lessons 1-2", () => {
    const firstTwo = TAIWANESE_LESSONS.slice(0, 2).flatMap(
      variantLessonQuestions,
    );
    const byId = new Map(firstTwo.map((q) => [q.id, q]));
    // Each wind is the target of at least one glyph drill: West by a
    // name-the-face choice, North/East/South by shuffled tile-picks,
    // East again as the dealer's seat wind in lesson 2.
    const west = byId.get("tw-wind-name")!;
    expect(west.kind).toBe("choice");
    if (west.kind === "choice")
      expect(west.choices[west.answer]).toBe("West");
    const pickTarget = (id: string) => {
      const q = byId.get(id)!;
      expect(q.kind).toBe("tile-pick");
      if (q.kind !== "tile-pick") throw new Error(id);
      // Expand the row the way the runner does: each digit is one tile.
      const row: string[] = [];
      for (const m of q.tiles.matchAll(/(\d)([mpsz])/g))
        row.push(`${m[1]}${m[2]}`);
      return q.picks.map((p) => row[p]!);
    };
    expect(pickTarget("tw-wind-pick-north")).toEqual(["4z"]);
    expect(pickTarget("tw-wind-pick-east")).toEqual(["1z"]);
    expect(pickTarget("tw-wind-pick-south")).toEqual(["2z"]);
    expect(pickTarget("tw-dealer-wind-pick")).toEqual(["1z"]);
    // Characters numbers are drilled from the face, in shuffled rows.
    const seven = byId.get("tw-char-number")!;
    expect(seven.kind).toBe("choice");
    if (seven.kind === "choice")
      expect(seven.choices[seven.answer]).toBe("Seven");
    expect(pickTarget("tw-char-pick-six")).toEqual(["6m"]);
    expect(pickTarget("tw-char-pick-two")).toEqual(["2m"]);
    const four = byId.get("tw-char-number-seat")!;
    expect(four.kind).toBe("choice");
    if (four.kind === "choice")
      expect(four.choices[four.answer]).toBe("Four");
  });
});

// ---------------------------------------------------------------------------
// Worked-hand numbers, verified against the engine scorer.
// ---------------------------------------------------------------------------

const score = (hand: string, extra: Partial<VariantScoreInput> = {}) =>
  scoreTaiwanese({
    counts: parseCounts(hand),
    melds: [],
    winningTile: 31,
    selfDraw: false,
    seatWind: 28,
    roundWind: 27,
    flowers: [],
    replacement: false,
    robbingQuad: false,
    lastWall: false,
    initial: false,
    lastCopy: false,
    ...extra,
  });

/** Pictured in the payments lesson: characters 1-2-3 and 4-5-6,
 * circles 1-2-3 and 4-5-6, bamboo 7-8-9, pair of East. */
const WORKED = "123456m123456p789s11z";
/** Pictured in lesson 2: the East triplet was claimed. */
const MINI = "123456m12223456p111z";

describe("TW worked hands verify against the engine scorer", () => {
  it("the payments lesson pictures the worked hand and counts it award by award", () => {
    const payments = TAIWANESE_LESSONS.find((l) => l.id === "tw-payments")!;
    expect(payments.steps.some((s) => s.hand === WORKED)).toBe(true);
    const texts = payments.steps.map((s) => s.text ?? "").join(" ");
    expect(texts).toContain("three tai");
    // Self-drawn, the hand earns exactly three tai, all from the
    // combined concealed self-draw award — the replacement rule the
    // lesson demonstrates.
    const selfDrawn = score(WORKED, { winningTile: 14, selfDraw: true });
    expect(selfDrawn.units).toBe(3);
    expect(selfDrawn.patterns).toEqual([
      { id: "tw-concealed-self", name: "Concealed self-draw", units: 3 },
    ]);
    // Won on a discard, the same hand earns only the concealed tai —
    // the count the tai lesson teaches with it.
    const discardWin = score(WORKED, { winningTile: 14 });
    expect(discardWin.units).toBe(1);
    expect(discardWin.patterns.map((p) => p.id)).toEqual(["tw-concealed"]);
  });

  it("the worked hand's payments match the engine payment function", () => {
    const payments = taiwanesePayments(3, {
      winner: 1,
      payer: 1,
      selfDraw: true,
      dealer: 0,
      dealerRepeats: 2,
    });
    expect(payments.map((p) => p.amount)).toEqual([110, 60, 60]);
    const questions = variantLessonQuestions(
      TAIWANESE_LESSONS.find((l) => l.id === "tw-payments")!,
    );
    expect(questions.find((q) => q.id === "tw-dealer-pays")!.verify()).toBe(
      "110 points",
    );
    expect(questions.find((q) => q.id === "tw-nondealer-pays")!.verify()).toBe(
      "60 points",
    );
  });

  it("lesson 2's counted hand earns exactly one tai on a discard, two on a self-draw", () => {    const melds = [{ kind: "pon", tiles: [27, 27, 27] }] as const;
    const discardWin = score(MINI, {
      winningTile: 14,
      melds: [...melds],
    });
    expect(discardWin.units).toBe(1);
    expect(discardWin.patterns.map((p) => p.id)).toEqual(["tw-wind-27"]);
    const selfDrawn = score(MINI, {
      winningTile: 14,
      selfDraw: true,
      melds: [...melds],
    });
    expect(selfDrawn.units).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Fix-round counting and transfer checks: new pictured hands, never used
// in teaching, whose answers verify against the engine scorer and the
// payment function (the rebuild PR D oracle pattern, extended).
// ---------------------------------------------------------------------------

describe("TW fix-round counting checks verify against the engine scorer", () => {
  const question = (id: string) =>
    TAIWANESE_LESSONS.flatMap(variantLessonQuestions).find(
      (q) => q.id === id,
    )!;
  const cases: readonly (readonly [string, string])[] = [
    // Lesson 5: counting, not a price list — concealed triplets and the
    // pictured all-triplets hand (all-triplets pictured and priced).
    ["tw-count-triplets", "3 tai"],
    ["tw-count-all-triplets", "11 tai"],
    // Lesson 6: suit patterns exercised on new pictured hands.
    ["tw-count-half-flush", "6 tai"],
    ["tw-count-full-flush", "11 tai"],
    // Lesson 7: all-claimed exercised on a new pictured hand.
    ["tw-count-all-claimed", "4 tai"],
    // Lesson 8: replacement-draw, last-tile and first-draw awards
    // exercised on new pictured hands.
    ["tw-count-replacement", "5 tai"],
    ["tw-count-last-draw", "3 tai"],
    ["tw-count-first-draw", "16 tai"],
    // Lesson 9: transfer — two hands never used in teaching, counted
    // award by award and priced end to end.
    ["tw-transfer-one-count", "4 tai"],
    ["tw-transfer-one-dealer", "100 points"],
    ["tw-transfer-one-other", "70 points"],
    ["tw-transfer-two-count", "7 tai"],
    ["tw-transfer-two-pays", "110 points"],
  ];
  for (const [id, expected] of cases)
    it(`${id} verifies as ${expected}`, () => {
      expect(question(id).verify()).toBe(expected);
    });

  it("the transfer hands are pictured in the payments lesson and differ from the worked hand", () => {
    const payments = TAIWANESE_LESSONS.find((l) => l.id === "tw-payments")!;
    const hands = payments.steps.flatMap((s) => (s.hand ? [s.hand] : []));
    expect(hands).toContain("111222333p789s222z55z");
    expect(hands).toContain("123456789m111z222z33z");
    expect("111222333p789s222z55z").not.toBe(WORKED);
    expect("123456789m111z222z33z").not.toBe(WORKED);
  });
});

// ---------------------------------------------------------------------------
// Developer-text and jargon denylist.
// ---------------------------------------------------------------------------

const DENYLIST: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  { label: "profile", pattern: /\bprofile\b/i },
  { label: "preset", pattern: /\bpreset\b/i },
  { label: "schema", pattern: /\bschema\b/i },
  { label: "coach", pattern: /\bcoach\b/i },
  { label: "adapter", pattern: /\badapter\b/i },
  { label: "heuristic", pattern: /\bheuristic\b/i },
  { label: "learning record", pattern: /learning record/i },
  { label: "chow", pattern: /\bchow\b/i },
  { label: "ting", pattern: /\bting\b/i },
  { label: "fu", pattern: /\bfu\b/i },
  { label: "riichi", pattern: /\briichi\b/i },
  { label: "dora", pattern: /\bdora\b/i },
  { label: "tile-code notation", pattern: /\b\d+[mpsz]\b/ },
];

describe("TW visible text carries no developer text or untaught jargon", () => {
  for (const { label, pattern } of DENYLIST) {
    it(`no "${label}" in any Taiwanese lesson text`, () => {
      for (const lesson of TAIWANESE_LESSONS) {
        const hit = visibleText(lesson).find((t) => pattern.test(t));
        expect(hit, `"${label}" in ${lesson.id}: ${hit}`).toBeUndefined();
      }
    });
  }
});
