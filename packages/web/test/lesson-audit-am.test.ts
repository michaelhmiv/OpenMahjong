// @vitest-environment jsdom
/**
 * American training track audits (brief-american-training-v1),
 * mirroring the other tracks' lesson audits:
 *
 * - Structure: eleven lessons in the brief's order; every lesson
 *   pictures tiles within its first two steps; every choice
 *   question offers at least four choices; ids are unique.
 * - Every question validates against its own oracle
 *   (validateVariantQuestion), and every counting/scoring key is
 *   computed from the Practice Card data or the stated payment
 *   rules, never typed twice.
 * - Notation: every pictured row resolves in the tile inventory —
 *   at most four copies of a kind, every copy resolvable exactly
 *   as the runner looks it up (the hk-l6 crash regression).
 * - Drill grading: the runner expands a notation by tile type, so
 *   a tile-pick's picks must land on the faces the prompt names.
 *   Each pick question declares its expected faces here; the test
 *   expands the row the way the runner does and compares.
 * - Term order: every audited term's first use in the track's
 *   visible text is at or after the step that teaches it, and the
 *   teaching step carries its plain-words definition.
 * - Leak guard: a choice question's hint, shown while the question
 *   is open, never contains the correct choice's text, and never
 *   prints a numeric answer as a standalone number.
 * - Denylist: no other variant's vocabulary, no developer talk,
 *   no engine tile-code notation in teaching text.
 * - Card data: 40 hands, 9 sections, every hand fourteen tiles,
 *   feasible from the 152-tile set (copies and joker minimums).
 */
import { describe, expect, it } from "vitest";
import {
  buildTileSet,
  parseCounts,
  tileTypeName,
} from "@openmahjong/engine";
import { AMERICAN_LESSONS } from "../src/education/american-lessons.js";
import { AMERICAN_TILE_INVENTORY } from "../src/education/american.js";
import { expandNotation } from "../src/education/notation.js";
import {
  validateVariantQuestion,
  variantLessonQuestions,
  type VariantLesson,
} from "../src/education/variant-content.js";
import {
  PRACTICE_CARD_HANDS,
  PRACTICE_CARD_SECTIONS,
} from "../src/education/practice-card.js";

// ---------------------------------------------------------------------------
// Collection: every player-visible string, in lesson order.
// ---------------------------------------------------------------------------

interface Collected {
  readonly lesson: number;
  readonly step: number;
  readonly texts: readonly string[];
}

function collect(): Collected[] {
  const out: Collected[] = [];
  AMERICAN_LESSONS.forEach((lesson, li) => {
    lesson.steps.forEach((step, si) => {
      const texts: string[] = [];
      if (step.text) texts.push(step.text);
      if (step.question) {
        const q = step.question;
        texts.push(q.prompt, q.hint, q.explanation);
        if (q.kind === "choice") texts.push(...q.choices);
      }
      out.push({ lesson: li, step: si, texts });
    });
  });
  return out;
}
const collected = collect();
const visibleText = (l: VariantLesson): string =>
  l.steps
    .flatMap((s) => {
      const t: string[] = [];
      if (s.text) t.push(s.text);
      if (s.question) {
        t.push(s.question.prompt, s.question.hint, s.question.explanation);
        if (s.question.kind === "choice") t.push(...s.question.choices);
      }
      return t;
    })
    .join("\n");

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

describe("American track structure", () => {
  it("has the brief's eleven lessons in order", () => {
    expect(AMERICAN_LESSONS.map((l) => l.id)).toEqual([
      "am-set",
      "am-card",
      "am-practice-card",
      "am-setup",
      "am-charleston",
      "am-picking",
      "am-playing",
      "am-jokers",
      "am-defense",
      "am-scoring",
      "am-drills",
    ]);
    for (const l of AMERICAN_LESSONS) {
      expect(l.version).toBe(2);
      expect(l.profileId).toBe("openmahjong-american-practice-card");
    }
  });

  it("every lesson pictures tiles within its first two steps", () => {
    for (const l of AMERICAN_LESSONS) {
      const pictured = l.steps
        .slice(0, 2)
        .some((s) => s.tiles || s.hand || s.question);
      expect(pictured, l.id).toBe(true);
    }
  });

  it("every choice question offers at least four choices", () => {
    for (const l of AMERICAN_LESSONS)
      for (const q of variantLessonQuestions(l))
        if (q.kind === "choice") expect(q.choices.length, q.id).toBeGreaterThanOrEqual(4);
  });

  it("ids are unique across lessons and questions", () => {
    const ids = new Set<string>();
    for (const l of AMERICAN_LESSONS) {
      expect(ids.has(l.id), l.id).toBe(false);
      ids.add(l.id);
      for (const q of variantLessonQuestions(l)) {
        expect(ids.has(q.id), q.id).toBe(false);
        ids.add(q.id);
      }
    }
  });

  it("every question validates against its own oracle", () => {
    for (const l of AMERICAN_LESSONS)
      for (const q of variantLessonQuestions(l)) validateVariantQuestion(q);
  });

  it("the track carries a real body of checks", () => {
    const total = AMERICAN_LESSONS.reduce(
      (n, l) => n + variantLessonQuestions(l).length,
      0,
    );
    expect(total).toBeGreaterThanOrEqual(50);
    for (const l of AMERICAN_LESSONS)
      expect(variantLessonQuestions(l).length, l.id).toBeGreaterThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------
// Notation audit (runner resolution, the hk-l6 crash regression)
// ---------------------------------------------------------------------------

describe("American lesson notations resolve in the inventory", () => {
  const inventory = buildTileSet();
  const notationsOf = (lesson: VariantLesson): string[] => {
    const out: string[] = [];
    for (const step of lesson.steps) {
      if (step.tiles) out.push(step.tiles);
      if (step.hand) out.push(step.hand);
      const q = step.question;
      if (q && "tiles" in q && q.tiles) out.push(q.tiles);
    }
    return out;
  };
  for (const lesson of AMERICAN_LESSONS) {
    it(`${lesson.id}: every shown notation is a possible set of tiles`, () => {
      for (const notation of notationsOf(lesson)) {
        const counts = parseCounts(notation);
        counts.forEach((count, type) => {
          expect(count, `${notation}: copies of type ${type}`).toBeLessThanOrEqual(4);
          for (let c = 0; c < count; c++) {
            const face = inventory.find((t) => t.type === type && t.id % 4 === c);
            expect(face, `${notation}: copy ${c} of type ${type}`).toBeDefined();
          }
        });
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Drill grading: picks must land on the faces the prompt names,
// under the runner's own expansion (education/notation.ts: the
// authored notation order, resolved against the inventory the
// American mounter supplies).
// ---------------------------------------------------------------------------

describe("American tile-pick drills grade the row they render", () => {
  const EXPECTED: Record<string, string[]> = {
    "am-bam-seven": ["7s"],
    "am-dot-five": ["5p"],
    "am-north-wind": ["N"],
    "am-red-dragon": ["Rd"],
    "am-sixes-pick": ["6m", "6m", "6m", "6m"],
    "am-kong-pick": ["4m", "4m", "4m", "4m"],
    "am-east-pair-pick": ["E", "E"],
    "am-pass-evens": ["2m", "4p", "6s"],
    "am-kong-call-pick": ["6s", "6s", "6s"],
    "am-even-discards-pick": ["8m", "8p"],
    "am-charleston-drill": ["5m", "7m", "9m"],
    "am-winds-drill": ["E", "W"],
  };
  const expand = (notation: string): string[] =>
    expandNotation(notation, AMERICAN_TILE_INVENTORY).map((f) =>
      tileTypeName(f.type),
    );
  for (const l of AMERICAN_LESSONS) {
    for (const q of variantLessonQuestions(l)) {
      if (q.kind !== "tile-pick") continue;
      it(`${q.id}: picks name the rendered faces`, () => {
        const row = expand(q.tiles);
        const picked = q.picks.map((p) => row[p]);
        expect(picked, q.id).toEqual(EXPECTED[q.id]);
        expect([...q.picks].sort((a, b) => a - b), q.id).toEqual([...q.picks]);
      });
    }
  }
  it("every tile-pick in the track has a declared expectation", () => {
    const pickIds = AMERICAN_LESSONS.flatMap((l) =>
      variantLessonQuestions(l)
        .filter((q) => q.kind === "tile-pick")
        .map((q) => q.id),
    );
    expect(pickIds.sort()).toEqual(Object.keys(EXPECTED).sort());
  });
});

// ---------------------------------------------------------------------------
// Term order: no term is used before the step that teaches it.
// (lesson, step) are 0-based positions in the track.
// ---------------------------------------------------------------------------

const TERMS: readonly {
  term: string;
  pattern: RegExp;
  lesson: number;
  step: number;
  definition: string;
}[] = [
  { term: "suit", pattern: /\bsuits?\b/i, lesson: 0, step: 1, definition: "A suit is a family of numbered tiles" },
  { term: "wind", pattern: /\bwinds?\b/i, lesson: 0, step: 6, definition: "The first four are the winds" },
  { term: "dragon", pattern: /\bdragons?\b/i, lesson: 0, step: 6, definition: "The last three are the dragons" },
  { term: "flower", pattern: /\bflowers?\b/i, lesson: 0, step: 9, definition: "eight flower tiles" },
  { term: "joker", pattern: /\bjokers?\b/i, lesson: 0, step: 9, definition: "A joker is a wild tile" },
  { term: "pair", pattern: /\bpairs?\b/i, lesson: 0, step: 9, definition: "a pair is two matching tiles" },
  { term: "kind", pattern: /\bkinds?\b/i, lesson: 0, step: 10, definition: "A kind is one distinct face" },
  { term: "copy", pattern: /\bcop(y|ies)\b/i, lesson: 0, step: 10, definition: "A copy is one physical tile" },
  { term: "card", pattern: /\bcard\b/i, lesson: 1, step: 0, definition: "played from a card: a printed list of hands" },
  { term: "group", pattern: /\bgroups?\b/i, lesson: 1, step: 1, definition: "A group is a set of matching tiles" },
  { term: "pung", pattern: /\bpungs?\b/i, lesson: 1, step: 1, definition: "three of a kind make a pung" },
  { term: "kong", pattern: /\bkongs?\b/i, lesson: 1, step: 1, definition: "four of a kind make a kong" },
  { term: "quint", pattern: /\bquints?\b/i, lesson: 1, step: 1, definition: "five of a kind make a quint" },
  { term: "exposure", pattern: /\bexposures?\b/i, lesson: 1, step: 4, definition: "An exposure is a group you complete by calling" },
  { term: "call", pattern: /\bcall(ing|s|ed)?\b/i, lesson: 1, step: 4, definition: "claiming, out loud, another player's discard" },
  { term: "concealed", pattern: /\bconcealed\b/i, lesson: 1, step: 4, definition: "concealed means kept hidden" },
  { term: "value", pattern: /\bvalue\b/i, lesson: 1, step: 5, definition: "the hand's value: the number of points" },
  { term: "section", pattern: /\bsections?\b/i, lesson: 2, step: 1, definition: "gathered into nine sections" },
  { term: "rack", pattern: /\bracks?\b/i, lesson: 3, step: 0, definition: "A rack is the sloped holder" },
  { term: "wall", pattern: /\bwalls?\b/i, lesson: 3, step: 1, definition: "builds a wall" },
  { term: "dealer", pattern: /\bdealer\b/i, lesson: 3, step: 2, definition: "East, the dealer for the first hand" },
  { term: "Charleston", pattern: /\bCharleston\b/, lesson: 4, step: 0, definition: "the Charleston: a set of passing rounds" },
  { term: "blind pass", pattern: /\bblind pass\b/i, lesson: 4, step: 4, definition: "you may make a blind pass" },
  { term: "courtesy pass", pattern: /\bcourtesy pass\b/i, lesson: 4, step: 5, definition: "the courtesy pass" },
  { term: "tiles to go", pattern: /\btiles to go\b/i, lesson: 5, step: 2, definition: "tiles to go: how many tiles the hand still needs" },
  { term: "backup", pattern: /\bbackup\b/i, lesson: 5, step: 3, definition: "Always keep a backup: a second hand" },
  { term: "dead (discard)", pattern: /\bdead\b/i, lesson: 6, step: 4, definition: "it is dead, out of play for good" },
  { term: "joker exchange", pattern: /\bjoker exchange\b/i, lesson: 7, step: 2, definition: "you may make a joker exchange" },
  { term: "dead hand", pattern: /\bdead hand\b/i, lesson: 7, step: 3, definition: "a hand is declared dead" },
  { term: "joker bait", pattern: /\bjoker bait\b/i, lesson: 7, step: 4, definition: "Joker bait is a discard you make hoping" },
  { term: "defense", pattern: /\bdefense\b/i, lesson: 8, step: 0, definition: "Defense is the other half of playing a hand" },
  { term: "jokerless bonus", pattern: /\bjokerless bonus\b/i, lesson: 9, step: 1, definition: "This is the jokerless bonus" },
  { term: "self-pick", pattern: /\bself-pick\b/i, lesson: 9, step: 3, definition: "a self-pick" },
  { term: "wall game", pattern: /\bwall game\b/i, lesson: 9, step: 4, definition: "the hand is a wall game" },
];

describe("American term order: no term is used before the step that teaches it", () => {
  for (const { term, pattern, lesson, step, definition } of TERMS) {
    it(`"${term}" is first used at or after its teaching step (lesson ${lesson + 1} step ${step + 1})`, () => {
      const teaching = collected.find((c) => c.lesson === lesson && c.step === step);
      expect(teaching, `lesson ${lesson} step ${step} exists`).toBeDefined();
      expect(
        teaching!.texts.some((t) => pattern.test(t)),
        `"${term}" should appear in its teaching step`,
      ).toBe(true);
      expect(
        teaching!.texts.some((t) => t.includes(definition)),
        `"${term}" teaching step should carry its definition: ${definition}`,
      ).toBe(true);
      for (const entry of collected) {
        if (entry.lesson > lesson || (entry.lesson === lesson && entry.step >= step)) continue;
        const hit = entry.texts.find((t) => pattern.test(t));
        expect(
          hit,
          `"${term}" used in lesson ${entry.lesson + 1} step ${entry.step + 1} before its teaching step: ${hit}`,
        ).toBeUndefined();
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Leak guard: hints never state the answer while the question is open.
// ---------------------------------------------------------------------------

describe("American hint leak guard", () => {
  for (const l of AMERICAN_LESSONS) {
    for (const q of variantLessonQuestions(l)) {
      if (q.kind !== "choice") continue;
      it(`${q.id}: hint does not state the answer`, () => {
        const correct = q.choices[q.answer]!;
        expect(q.hint.includes(correct), q.id).toBe(false);
        if (/^\d+$/.test(correct)) {
          const standalone = new RegExp(`(^|[^\\d])${correct}([^\\d]|$)`);
          expect(standalone.test(q.hint), `${q.id}: hint prints ${correct}`).toBe(false);
        }
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Denylist: no cross-variant vocabulary, developer talk, or
// engine tile-code notation in teaching text.
// ---------------------------------------------------------------------------

describe("American visible text denylist", () => {
  const DENIED: readonly [string, RegExp][] = [
    ["riichi", /\briichi\b/i],
    ["dora", /\bdora\b/i],
    ["fu", /\bfu\b/i],
    ["fan", /\bfan\b/i],
    ["tai", /\btai\b/i],
    ["meld", /\bmelds?\b/i],
    ["chow", /\bchow\b/i],
    ["ting", /\bting\b/i],
    ["yakuman", /\byakuman\b/i],
    ["profile/preset/schema", /\b(profile|preset|schema|adapter|heuristic)\b/i],
    ["tile-code notation", /\d+[mpsz]\b/],
  ];
  for (const l of AMERICAN_LESSONS) {
    it(`${l.id}: no denied text`, () => {
      const text = visibleText(l);
      for (const [name, pattern] of DENIED)
        expect(pattern.test(text), `${l.id}: ${name}`).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// Practice Card data integrity (acceptance check 1, in-repo form)
// ---------------------------------------------------------------------------

describe("Practice Card data", () => {
  it("has 40 hands across 9 sections", () => {
    expect(PRACTICE_CARD_HANDS.length).toBe(40);
    expect(PRACTICE_CARD_SECTIONS.length).toBe(9);
    for (const s of PRACTICE_CARD_SECTIONS)
      expect(
        PRACTICE_CARD_HANDS.some((h) => h.section === s.id),
        s.id,
      ).toBe(true);
  });

  it("every hand uses fourteen tiles and is feasible from the set", () => {
    for (const hand of PRACTICE_CARD_HANDS) {
      const total = hand.groups.reduce((n, g) => n + g.count, 0);
      expect(total, hand.id).toBe(14);
      // Copies of any one tile identity can never exceed four,
      // except that a single group past four (a quint) covers the
      // overflow with jokers — exactly its joker minimum.
      let jokers = 0;
      let flowers = 0;
      const byKind = new Map<string, { total: number; overflow: number }>();
      for (const g of hand.groups) {
        if (g.kind === "flower") {
          flowers += g.count;
          continue;
        }
        const key =
          g.kind === "number"
            ? `n${g.rank}-${g.suit}`
            : g.kind === "wind"
              ? `w${g.wind}`
              : `d${g.dragon}`;
        const entry = byKind.get(key) ?? { total: 0, overflow: 0 };
        entry.total += g.count;
        entry.overflow += Math.max(0, g.count - 4);
        byKind.set(key, entry);
      }
      for (const [key, { total, overflow }] of byKind) {
        expect(total, `${hand.id}: ${key}`).toBeLessThanOrEqual(4 + overflow);
        jokers += overflow;
      }
      expect(flowers, hand.id).toBeLessThanOrEqual(8);
      expect(hand.minJokers, hand.id).toBe(jokers);
      expect(hand.minJokers, hand.id).toBeLessThanOrEqual(8);
    }
  });

  it("no hand in Singles & Pairs can use a joker", () => {
    for (const hand of PRACTICE_CARD_HANDS.filter((h) => h.section === "singles-and-pairs")) {
      expect(hand.exposure, hand.id).toBe("C");
      expect(hand.minJokers, hand.id).toBe(0);
      for (const g of hand.groups) expect(g.count, hand.id).toBeLessThanOrEqual(2);
    }
  });
});
