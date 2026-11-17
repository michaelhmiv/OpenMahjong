/**
 * Hong Kong lesson rebuild (brief-lesson-rebuild-v2, PR B) audits.
 *
 * - Term order: every audited term's first occurrence in the track's
 *   visible text (step texts, question prompts, choices, hints and
 *   explanations, in lesson order) is at or after the step that
 *   teaches it, and the teaching step itself uses the term. Lesson
 *   titles are navigation labels kept from the original track (the
 *   brief allows titles to stay) and are not part of the audited
 *   text; the developer-text denylist below does cover titles.
 * - Structure: every lesson shows tile faces within its first two
 *   steps; every choice question has at least four choices; the
 *   payments lesson contains a complete worked hand whose fan and
 *   payment checks recompute against the engine scorers.
 * - Denylist: no developer/app text in any Hong Kong visible text.
 */
import { describe, expect, it } from "vitest";
import {
  parseCounts,
  scoreHongKong,
  hongKongPayments,
} from "@openmahjong/engine";
import {
  VARIANT_LESSONS,
  validateVariantContent,
  variantLessonQuestions,
  type VariantLesson,
} from "../src/education/variant-content.js";

const HK = VARIANT_LESSONS.filter((l) => l.variant === "hong-kong");
const HK_IDS = [
  "hk-tiles",
  "hk-shape",
  "hk-turns",
  "hk-flowers",
  "hk-minimum",
  "hk-honors",
  "hk-payments",
  "hk-quads",
  "hk-specials",
  "hk-match",
];

function stepTexts(lesson: VariantLesson, stepIndex: number): string {
  const s = lesson.steps[stepIndex]!;
  const parts: string[] = [];
  if (s.text) parts.push(s.text);
  if (s.question) {
    parts.push(s.question.prompt, s.question.hint, s.question.explanation);
    if (s.question.kind === "choice") parts.push(...s.question.choices);
  }
  return parts.join("\n");
}

function allVisibleText(lesson: VariantLesson): string {
  return lesson.steps.map((_, i) => stepTexts(lesson, i)).join("\n");
}

/** Position of a step in track order: lesson index * 1000 + step. */
function position(lessonId: string, stepIndex: number): number {
  return HK_IDS.indexOf(lessonId) * 1000 + stepIndex;
}

function firstOccurrence(pattern: RegExp): number | null {
  for (const lesson of HK) {
    for (let i = 0; i < lesson.steps.length; i++) {
      if (pattern.test(stepTexts(lesson, i)))
        return position(lesson.id, i);
    }
  }
  return null;
}

const TERMS: {
  label: string;
  pattern: RegExp;
  teachLesson: string;
  teachStep: number;
}[] = [
  { label: "flower / bonus tile", pattern: /\bflowers?\b|\bbonus tiles?\b/i, teachLesson: "hk-tiles", teachStep: 3 },
  { label: "honor", pattern: /\bhonors?\b/i, teachLesson: "hk-tiles", teachStep: 5 },
  { label: "terminal", pattern: /\bterminals?\b/i, teachLesson: "hk-tiles", teachStep: 8 },
  { label: "set", pattern: /\bsets?\b/i, teachLesson: "hk-shape", teachStep: 0 },
  { label: "sequence", pattern: /\bsequences?\b/i, teachLesson: "hk-shape", teachStep: 0 },
  { label: "triplet", pattern: /\btriplets?\b/i, teachLesson: "hk-shape", teachStep: 1 },
  { label: "pair", pattern: /\bpairs?\b/i, teachLesson: "hk-shape", teachStep: 2 },
  { label: "concealed", pattern: /\bconcealed\b/i, teachLesson: "hk-shape", teachStep: 5 },
  { label: "quad", pattern: /\bquads?\b/i, teachLesson: "hk-shape", teachStep: 7 },
  { label: "wall", pattern: /\bwall\b/i, teachLesson: "hk-turns", teachStep: 0 },
  { label: "discarder", pattern: /\bdiscarder\b/i, teachLesson: "hk-turns", teachStep: 2 },
  { label: "self-draw", pattern: /\bself-draw\b/i, teachLesson: "hk-turns", teachStep: 2 },
  { label: "fan", pattern: /\bfan\b/i, teachLesson: "hk-minimum", teachStep: 1 },
  { label: "wait", pattern: /\bwaits?\b|\bwaiting\b/i, teachLesson: "hk-minimum", teachStep: 8 },
  { label: "round wind", pattern: /\bround wind\b/i, teachLesson: "hk-honors", teachStep: 0 },
  { label: "seat wind", pattern: /\bseat wind\b/i, teachLesson: "hk-honors", teachStep: 0 },
];

describe("Hong Kong track identity", () => {
  it("keeps the ten lesson ids in order and validates", () => {
    expect(HK.map((l) => l.id)).toEqual(HK_IDS);
    expect(() => validateVariantContent()).not.toThrow();
  });
});

describe("Hong Kong term order", () => {
  for (const term of TERMS) {
    it(`"${term.label}" is not used before its teaching step`, () => {
      const lesson = HK.find((l) => l.id === term.teachLesson)!;
      expect(
        term.pattern.test(stepTexts(lesson, term.teachStep)),
        `teaching step ${term.teachLesson}#${term.teachStep} must use "${term.label}"`,
      ).toBe(true);
      const first = firstOccurrence(term.pattern);
      expect(first, `"${term.label}" must occur in the track`).not.toBeNull();
      expect(
        first!,
        `"${term.label}" first occurs before its teaching step`,
      ).toBeGreaterThanOrEqual(position(term.teachLesson, term.teachStep));
    });
  }
  it("never spends fan before the fan lesson", () => {
    for (const lesson of HK.slice(0, 4)) {
      expect(allVisibleText(lesson)).not.toMatch(/\bfan\b/i);
    }
  });
});

describe("Hong Kong structure", () => {
  it("shows tile faces within the first two steps of every lesson", () => {
    for (const lesson of HK) {
      const shown = lesson.steps
        .slice(0, 2)
        .some((s) => s.tiles || s.hand || s.question?.tiles);
      expect(shown, `${lesson.id} shows no tiles in its first two steps`).toBe(
        true,
      );
    }
  });
  it("gives every choice question at least four choices and spreads checks across lessons", () => {
    for (const lesson of HK) {
      const questions = variantLessonQuestions(lesson);
      expect(
        questions.length,
        `${lesson.id} has too few checks`,
      ).toBeGreaterThanOrEqual(3);
      for (const q of questions) {
        if (q.kind === "choice")
          expect(q.choices.length, `${q.id} has fewer than four choices`).toBeGreaterThanOrEqual(4);
        expect(q.verify(), `${q.id} verify disagrees with its key`).toBe(
          q.kind === "choice" ? q.choices[q.answer]! : q.picks.join(","),
        );
      }
    }
    const picks = HK.flatMap(variantLessonQuestions).filter(
      (q) => q.kind === "tile-pick",
    );
    expect(picks.length).toBeGreaterThanOrEqual(4);
  });
  it("states the complete fan scale, including 7, 8 and 9 fan, and the quad-replacement value", () => {
    const text = HK.map(allVisibleText).join("\n");
    expect(text).toContain("seven is 48");
    expect(text).toContain("eight is 64");
    expect(text).toContain("nine is 96");
    expect(text).toContain("quad-replacement fan is worth one fan");
  });
});

describe("Hong Kong worked hand (hk-payments)", () => {
  const lesson = HK.find((l) => l.id === "hk-payments")!;
  const WORKED = "222m333p444s555z11z";
  it("pictures the worked hand and reads it before scoring it", () => {
    const pictured = lesson.steps.findIndex((s) => s.hand === WORKED);
    expect(pictured).toBeGreaterThanOrEqual(0);
    expect(stepTexts(lesson, pictured)).toContain("triplet of the 2 of characters");
  });
  it("counts the worked hand's fan against the engine", () => {
    const score = scoreHongKong({
      counts: parseCounts(WORKED),
      melds: [],
      winningTile: 1,
      selfDraw: false,
      seatWind: 27,
      roundWind: 27,
      flowers: [],
      replacement: false,
      robbingQuad: false,
      lastWall: false,
      initial: false,
      lastCopy: false,
    });
    expect(score.units).toBe(5);
    const q = variantLessonQuestions(lesson).find(
      (x) => x.id === "hk-worked-fan",
    )!;
    expect(q.verify()).toBe("Five fan");
  });
  it("recomputes the worked hand's payments against the engine", () => {
    const discard = variantLessonQuestions(lesson).find(
      (x) => x.id === "hk-worked-payment",
    )!;
    const discarderPays = hongKongPayments(5, {
      winner: 0,
      payer: 1,
      selfDraw: false,
    }).find((p) => p.seat === 1)!.amount;
    expect(discarderPays).toBe(48);
    expect(discard.verify()).toBe(String(discarderPays));
    const selfDraw = variantLessonQuestions(lesson).find(
      (x) => x.id === "hk-worked-selfdraw",
    )!;
    const selfScore = scoreHongKong({
      counts: parseCounts(WORKED),
      melds: [],
      winningTile: 1,
      selfDraw: true,
      seatWind: 27,
      roundWind: 27,
      flowers: [],
      replacement: false,
      robbingQuad: false,
      lastWall: false,
      initial: false,
      lastCopy: false,
    });
    expect(selfScore.units).toBe(6);
    const eachPays = hongKongPayments(selfScore.units, {
      winner: 0,
      payer: 1,
      selfDraw: true,
    })[0]!.amount;
    expect(eachPays).toBe(64);
    expect(selfDraw.verify()).toBe(String(eachPays));
  });
});

describe("Hong Kong developer-text denylist", () => {
  const DENIED = [
    "preset",
    "profile",
    "schema",
    "coach",
    "adapter",
    "learning record",
    "dora",
    "furiten",
    "riichi",
  ];
  it("keeps developer and other-variant text out of all visible Hong Kong text", () => {
    for (const lesson of HK) {
      const text = `${lesson.title}\n${allVisibleText(lesson)}`.toLowerCase();
      for (const word of DENIED) {
        expect(text, `${lesson.id} contains denied text "${word}"`).not.toContain(word);
      }
    }
  });
});
