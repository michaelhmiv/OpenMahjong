// @vitest-environment jsdom
/**
 * PR C acceptance audits for the rebuilt MCR track
 * (brief-lesson-rebuild-v2):
 * - Term order: every audited term's first occurrence in the track,
 *   collected in lesson/step order over step texts and question
 *   prompts/choices/hints/explanations, is its teaching step.
 * - Structure: every lesson shows tile faces within its first two
 *   steps; the payments lesson contains a complete worked-hand
 *   sequence whose numbers verify against the engine scorer
 *   (scoreMcr) and the engine payment function (mcrPayments).
 * - Developer-text denylist over all MCR visible text, including
 *   the 81-pattern reference descriptions.
 * - Checks: every choice question has at least four choices, hints
 *   never state the correct choice, and no numeric answer appears
 *   in its lesson's title.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseCounts,
  scoreMcr,
  mcrPayments,
  mcrPatterns,
  type VariantScoreInput,
} from "@openmahjong/engine";
import {
  variantLessons,
  variantLessonQuestions,
  type VariantLesson,
} from "../src/education/variant-content.js";
import { mcrPatternGuide } from "../src/education/mcr-guide.js";

const lessons: VariantLesson[] = variantLessons("mcr");

/** All visible strings of one step, in order. */
function stepStrings(lesson: VariantLesson, stepIndex: number): string[] {
  const s = lesson.steps[stepIndex]!;
  const out: string[] = [];
  if (s.text) out.push(s.text);
  if (s.question) {
    out.push(s.question.prompt);
    if (s.question.kind === "choice") out.push(...s.question.choices);
    out.push(s.question.hint, s.question.explanation);
  }
  return out;
}

function allStrings(lesson: VariantLesson): string[] {
  return lesson.steps.flatMap((_, i) => stepStrings(lesson, i));
}

// ---------------------------------------------------------------------
// Term order
// ---------------------------------------------------------------------

interface TermSpec {
  readonly term: string;
  readonly pattern: RegExp;
  readonly lessonId: string;
  readonly step: number;
}

const TERMS: readonly TermSpec[] = [
  { term: "flower", pattern: /\bflowers?\b/i, lessonId: "mcr-foundation", step: 4 },
  { term: "pattern", pattern: /\bpatterns?\b/i, lessonId: "mcr-foundation", step: 10 },
  { term: "fan", pattern: /\bfan\b/i, lessonId: "mcr-foundation", step: 11 },
  { term: "dealer", pattern: /\bdealers?\b/i, lessonId: "mcr-claims", step: 1 },
  { term: "round", pattern: /\brounds?\b/i, lessonId: "mcr-claims", step: 2 },
  { term: "pond", pattern: /\bponds?\b/i, lessonId: "mcr-claims", step: 4 },
  { term: "melded", pattern: /\bmelded\b/i, lessonId: "mcr-claims", step: 7 },
  { term: "concealed", pattern: /\bconceal/i, lessonId: "mcr-claims", step: 8 },
  { term: "wait", pattern: /\bwaits?\b/i, lessonId: "mcr-eligibility", step: 0 },
  { term: "terminal", pattern: /\bterminals?\b/i, lessonId: "mcr-claims", step: 3 },
  { term: "simples", pattern: /\bsimples?\b/i, lessonId: "mcr-families", step: 1 },
  { term: "voided suit", pattern: /\bvoided suit\b/i, lessonId: "mcr-families", step: 2 },
  { term: "exclusion", pattern: /\bexclusions?\b/i, lessonId: "mcr-exclusions", step: 0 },
  { term: "match", pattern: /\bmatch\b/i, lessonId: "mcr-match", step: 0 },
  // Definition-audit round (owner rule: every new term is defined at
  // its first mention in this track, in isolation).
  { term: "discard", pattern: /\bdiscard/i, lessonId: "mcr-claims", step: 4 },
  { term: "suited", pattern: /\bsuited\b/i, lessonId: "mcr-eligibility", step: 4 },
  { term: "Dragon Pung", pattern: /\bDragon Pung\b/i, lessonId: "mcr-circumstances", step: 1 },
  { term: "Melded Hand", pattern: /\bMelded Hand\b/i, lessonId: "mcr-circumstances", step: 2 },
];

describe("MCR term order: no term is used before its teaching step", () => {
  for (const { term, pattern, lessonId, step } of TERMS) {
    it(`"${term}" is first used at ${lessonId} step ${step}`, () => {
      const lessonIndex = lessons.findIndex((l) => l.id === lessonId);
      expect(lessonIndex, `lesson ${lessonId} exists`).toBeGreaterThanOrEqual(0);
      const taughtPos = lessonIndex * 1000 + step;
      // The teaching step itself uses the term.
      expect(
        stepStrings(lessons[lessonIndex]!, step).some((t) => pattern.test(t)),
        `"${term}" should appear in its teaching step`,
      ).toBe(true);
      // No earlier step in the track uses it.
      lessons.forEach((lesson, li) => {
        lesson.steps.forEach((_, si) => {
          if (li * 1000 + si >= taughtPos) return;
          const hit = stepStrings(lesson, si).find((t) => pattern.test(t));
          expect(
            hit,
            `"${term}" used at ${lesson.id} step ${si}, before its teaching step ${lessonId} step ${step}: ${hit}`,
          ).toBeUndefined();
        });
      });
    });
  }
});

// ---------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------

describe("MCR structure audit", () => {
  it("has ten lessons, each showing tile faces within its first two steps", () => {
    expect(lessons).toHaveLength(10);
    for (const lesson of lessons) {
      const firstTwo = lesson.steps.slice(0, 2);
      expect(
        firstTwo.some((s) => (s.tiles ?? s.hand ?? "").length > 0),
        `${lesson.id} shows no tile faces in its first two steps`,
      ).toBe(true);
    }
  });

  it("every choice check has at least four choices and every lesson has at least two checks", () => {
    const questions = lessons.flatMap(variantLessonQuestions);
    // 20 checks from the rebuild plus 18 added by the lesson fix
    // round (face drills, vocabulary checks, transfer counts).
    expect(questions).toHaveLength(38);
    for (const q of questions) {
      if (q.kind === "choice") expect(q.choices.length).toBeGreaterThanOrEqual(4);
    }
    expect(questions.filter((q) => q.kind === "tile-pick").length).toBeGreaterThanOrEqual(3);
    for (const lesson of lessons)
      expect(variantLessonQuestions(lesson).length).toBeGreaterThanOrEqual(2);
  });

  it("hints never state the correct choice, and numeric answers stay out of lesson titles", () => {
    for (const lesson of lessons) {
      for (const q of variantLessonQuestions(lesson)) {
        if (q.kind !== "choice") continue;
        const answer = q.choices[q.answer]!;
        if (answer.length >= 4)
          expect(
            q.hint.includes(answer),
            `${q.id}: hint states the answer "${answer}"`,
          ).toBe(false);
        if (/^\d+/.test(answer))
          expect(
            lesson.title.includes(answer.replace(/\D/g, "")) &&
              /\d/.test(lesson.title),
            `${q.id}: numeric answer appears in title "${lesson.title}"`,
          ).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------
// Worked hand: pictured tiles -> patterns -> fan -> gate -> flowers
// -> per-payer amounts, all verified against the engine.
// ---------------------------------------------------------------------

const WORKED = "123m456p789s777z55z";
const score = (tiles: string, extra: Partial<VariantScoreInput> = {}) =>
  scoreMcr({
    counts: parseCounts(tiles),
    melds: [],
    winningTile: 27,
    selfDraw: false,
    seatWind: 28,
    roundWind: 29,
    flowers: [],
    replacement: false,
    robbingQuad: false,
    lastWall: false,
    initial: false,
    lastCopy: false,
    ...extra,
  });

describe("MCR worked hand (payments lesson), engine-verified end to end", () => {
  it("the pictured hand counts to 12 fan from named patterns and passes the gate", () => {
    const s = score(WORKED, { winningTile: 33 });
    expect(s.patterns.map((p) => [p.name, p.units])).toEqual([
      ["Mixed Straight", 8],
      ["Dragon Pung", 2],
      ["Concealed Hand", 2],
    ]);
    expect(s.qualifyingUnits).toBe(12);
    expect(s.eligible).toBe(true);
    const withFlowers = score(WORKED, { winningTile: 33, flowers: [34, 39] });
    expect(withFlowers.qualifyingUnits).toBe(12);
    expect(withFlowers.units).toBe(14);
  });

  it("per-payer amounts match the engine payment function", () => {
    const discard = mcrPayments(12, { winner: 0, payer: 1, selfDraw: false }, 2);
    expect(discard.map((p) => p.amount)).toEqual([22, 8, 8]);
    expect(discard.reduce((a, p) => a + p.amount, 0)).toBe(38);
    const self = mcrPayments(12, { winner: 0, payer: 0, selfDraw: true }, 2);
    expect(self.map((p) => p.amount)).toEqual([22, 22, 22]);
    expect(self.reduce((a, p) => a + p.amount, 0)).toBe(66);
    // The lesson's tail example: eight fan and two flowers, discard win.
    const tail = mcrPayments(8, { winner: 0, payer: 1, selfDraw: false }, 2);
    expect(tail.map((p) => p.amount)).toEqual([18, 8, 8]);
    expect(tail.reduce((a, p) => a + p.amount, 0)).toBe(34);
  });

  it("the payments lesson walks the sequence: pictured hand, counting steps, gate, flowers, payment checks", () => {
    const payments = lessons.find((l) => l.id === "mcr-payments")!;
    const texts = payments.steps.map((s) => s.text ?? "");
    // Pictured hand shown and read.
    expect(payments.steps.some((s) => s.hand === WORKED)).toBe(true);
    // Patterns counted item by item toward the total.
    expect(texts.some((t) => t.includes("Mixed Straight, worth 8 fan"))).toBe(true);
    expect(texts.some((t) => t.includes("running total 12"))).toBe(true);
    // Gate checked before flowers are added.
    const gateIdx = texts.findIndex((t) => t.includes("at least the minimum of eight"));
    const flowerIdx = texts.findIndex((t) => t.includes("12 + 2 = 14"));
    expect(gateIdx).toBeGreaterThanOrEqual(0);
    expect(flowerIdx).toBeGreaterThan(gateIdx);
    // Payment checks verify against the engine payment function.
    const questions = variantLessonQuestions(payments);
    expect(questions.map((q) => q.verify())).toEqual([
      "22 points",
      "66 points",
      "12 fan",
      "21 points",
      "102 points",
    ]);
  });

  it("the gate lesson's counted hand really is ineligible with three flowers", () => {
    const s = score("123456m789p234s55p", {
      winningTile: 13,
      flowers: [34, 35, 36],
    });
    expect(s.qualifyingUnits).toBe(6);
    expect(s.units).toBe(9);
    expect(s.eligible).toBe(false);
  });

  it("the exclusions lesson's pictured hands score as the text counts them", () => {
    const flush = score("123456789m111m99m", { winningTile: 8 });
    expect(flush.qualifyingUnits).toBe(45);
    expect(flush.patterns.map((p) => p.name)).not.toContain("No Honors");
    expect(flush.patterns.map((p) => p.name)).not.toContain("One Voided Suit");
    const competing = score("111222333m456p77s", { winningTile: 24 });
    expect(competing.qualifyingUnits).toBe(45);
    expect(
      competing.patterns.some((p) => p.name.startsWith("Pure Shifted")),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------
// Lesson fix round (brief-lesson-fixround-v1): scoring vocabulary
// completion, transfer checks on hands the lessons never scored, and
// face-mastery drills. All numbers verified against the engine.
// ---------------------------------------------------------------------

describe("MCR fix round: vocabulary completion", () => {
  const textsOf = (id: string) =>
    lessons.find((l) => l.id === id)!.steps.map((s) => s.text ?? "").join("\n");
  it("sequences lesson names and values every shifted/repeated pattern", () => {
    const t = textsOf("mcr-sequences");
    for (const named of [
      "Pure Shifted Chows, worth 16 fan",
      "Mixed Shifted Chows, worth 6 fan",
      "Mixed Triple Chow, worth 8 fan",
      "Pure Triple Chow, worth 24 fan",
      "Pure Double Chow, worth 1 fan",
      "Mixed Double Chow, worth 1 fan",
      "Two Terminal Chows, worth 1 fan",
      "Short Straight, worth 1 fan",
    ])
      expect(t, named).toContain(named);
  });
  it("specials lesson names and values the knitted structures", () => {
    const t = textsOf("mcr-specials");
    for (const named of [
      "Lesser Honors and Knitted Tiles, worth 12 fan",
      "Greater Honors and Knitted Tiles, worth 24 fan",
      "Knitted Straight, worth 12 fan",
    ])
      expect(t, named).toContain(named);
    // Scorer is the authority: the full-body lesser hand stacks both
    // structure patterns; an incomplete body earns the lesser only.
    expect(score("147m258p369s12345z", { winningTile: 27 }).qualifyingUnits).toBe(24);
    expect(score("147m258p36s123456z", { winningTile: 27 }).qualifyingUnits).toBe(12);
    expect(score("147m258p3s1234567z", { winningTile: 27 }).qualifyingUnits).toBe(24);
  });
  it("circumstances lesson names and values the last-tile and quad patterns", () => {
    const t = textsOf("mcr-circumstances");
    for (const named of [
      "Last Tile, worth 4 fan",
      "Out with Replacement Tile",
      "Robbing The Kong, also worth 8 fan",
    ])
      expect(t, named).toContain(named);
  });
  it("claims lesson gives the wind-triplet values", () => {
    const t = textsOf("mcr-claims");
    expect(t).toContain("Seat Wind, worth 2 fan");
    expect(t).toContain("Prevalent Wind, worth 2 fan");
    expect(t).toContain("Pung of Terminals or Honors, worth 1 fan");
    const hand = "111z123m456p789s55p";
    const windFan = (seatWind: number, roundWind: number) =>
      score(hand, { winningTile: 12, seatWind, roundWind }).patterns
        .filter((p) =>
          ["Seat Wind", "Prevalent Wind", "Pung of Terminals or Honors"].includes(p.name),
        )
        .reduce((a, p) => a + p.units, 0);
    expect(windFan(27, 29)).toBe(2);
    expect(windFan(28, 27)).toBe(2);
    expect(windFan(27, 27)).toBe(4);
    expect(windFan(28, 29)).toBe(1);
  });
});

describe("MCR fix round: transfer checks count new hands against the engine", () => {
  const question = (id: string) =>
    lessons.flatMap(variantLessonQuestions).find((q) => q.id === id)!;
  it("every new check's oracle agrees with its authored answer", () => {
    for (const id of [
      "mcr-char-seven-drill",
      "mcr-char-four-drill",
      "mcr-char-nine-drill",
      "mcr-wind-east-drill",
      "mcr-wind-west-drill",
      "mcr-wind-south-drill",
      "mcr-wind-north-drill",
      "mcr-wind-triplet-value",
      "mcr-pure-shifted-count",
      "mcr-mixed-triple-value",
      "mcr-double-chow-value",
      "mcr-lesser-knitted-count",
      "mcr-seven-pairs-count",
      "mcr-replacement-tile-name",
      "mcr-circumstances-transfer-count",
      "mcr-transfer-count",
      "mcr-transfer-discarder-pays",
      "mcr-transfer-selfdraw-total",
    ]) {
      const q = question(id);
      expect(q, id).toBeDefined();
      if (q.kind === "choice")
        expect(q.verify(), id).toBe(q.choices[q.answer]);
    }
  });
  it("the payments transfer hand is a new hand, counted and paid by the engine", () => {
    const s = score("789m123p456s666z55z", { winningTile: 32 });
    expect(s.patterns.map((p) => [p.name, p.units])).toEqual([
      ["Mixed Straight", 8],
      ["Dragon Pung", 2],
      ["Concealed Hand", 2],
    ]);
    expect(s.qualifyingUnits).toBe(12);
    const discard = mcrPayments(12, { winner: 0, payer: 1, selfDraw: false }, 1);
    expect(discard.map((p) => p.amount)).toEqual([21, 8, 8]);
    const pairs = score("112233m445566p77s", { winningTile: 24, selfDraw: true });
    expect(pairs.qualifyingUnits).toBe(26);
    const self = mcrPayments(26, { winner: 0, payer: 0, selfDraw: true }, 0);
    expect(self.reduce((a, p) => a + p.amount, 0)).toBe(102);
  });
  it("the circumstances transfer hand counts to 11 fan by the engine", () => {
    const s = score("123m234p345s789m55p", { winningTile: 12 });
    expect(s.qualifyingUnits).toBe(11);
    expect(s.patterns.map((p) => p.name)).toEqual([
      "Mixed Shifted Chows",
      "Concealed Hand",
      "All Chows",
      "Two Terminal Chows",
    ]);
  });
});

// ---------------------------------------------------------------------
// Definition-audit round: winds made concrete, guide vocabulary in
// taught words, and game-surface glosses for land-and-play players.
// ---------------------------------------------------------------------

describe("MCR definition audit: winds, guide and surfaces", () => {
  it("the seat/round wind step pictures the four winds and says how a player knows theirs", () => {
    const claims = lessons.find((l) => l.id === "mcr-claims")!;
    const step = claims.steps[2]!;
    expect(step.tiles).toBe("1234z");
    expect(step.text).toContain("count around from the dealer");
    expect(step.text).toContain("appears beside your tiles");
    expect(step.text).toContain("centre of the table");
  });

  it("patterns first spent as check answers are taught with their values", () => {
    const t = lessons
      .find((l) => l.id === "mcr-circumstances")!
      .steps.map((s) => s.text ?? "")
      .join("\n");
    expect(t).toContain("Melded Hand, worth 6 fan");
    expect(t).toContain("Dragon Pung");
    const catalog = mcrPatterns();
    expect(catalog.find((p) => p.name === "Melded Hand")!.units).toBe(6);
    expect(catalog.find((p) => p.name === "Dragon Pung")!.units).toBe(2);
  });

  it("the 81-pattern reference uses only taught words for sets and the wall", () => {
    for (const row of mcrPatternGuide()) {
      const visible = `${row.description}\n${row.restrictions}`;
      for (const word of ["exposed", "closed", "live-wall", "live wall", "upgrade", "constituent"])
        expect(
          new RegExp(`\\b${word}\\b`, "i").test(visible),
          `reference "${row.name}" uses untaught word "${word}"`,
        ).toBe(false);
    }
  });

  it("MCR game surfaces gloss their terms in place and never use the undefined WMO label", () => {
    const table = readFileSync(
      "packages/web/src/variant-table-ui.ts",
      "utf8",
    );
    const calculator = readFileSync(
      "packages/web/src/variant-calculator-ui.ts",
      "utf8",
    );
    for (const source of [table, calculator]) {
      expect(source).not.toContain("WMO");
      expect(source).toContain("Mahjong Competition Rules");
    }
    // Call buttons keep their older names only with an in-place gloss.
    expect(table).toContain("pung is another word for a triplet");
    expect(table).not.toContain("heuristic");
    expect(table).not.toContain("live wall is exhausted");
    // The calculator's payment line defines discarder and hand value.
    expect(calculator).toContain("the player who threw the winning tile");
    expect(calculator).toContain("the hand's fan plus its flower points");
  });
});

// ---------------------------------------------------------------------
// Developer-text denylist
// ---------------------------------------------------------------------

const DENYLIST = [
  "profile",
  "schema",
  "coach",
  "adapter",
  "preset",
  "heuristic",
  "learning record",
  "pungs",
  "frozen",
];

describe("MCR developer-text denylist", () => {
  it("no denied word appears in any MCR lesson's visible text", () => {
    for (const lesson of lessons) {
      const visible = [lesson.title, ...allStrings(lesson)].join("\n");
      for (const word of DENYLIST)
        expect(
          new RegExp(`\\b${word}\\b`, "i").test(visible),
          `${lesson.id} contains denied word "${word}"`,
        ).toBe(false);
    }
  });

  it("no denied word appears in the 81-pattern reference descriptions", () => {
    const rows = mcrPatternGuide();
    expect(rows).toHaveLength(81);
    for (const row of rows) {
      const visible = `${row.description}\n${row.restrictions}`;
      for (const word of DENYLIST)
        expect(
          new RegExp(`\\b${word}\\b`, "i").test(visible),
          `reference "${row.name}" contains denied word "${word}"`,
        ).toBe(false);
    }
  });
});
