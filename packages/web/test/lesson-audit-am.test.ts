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
  practiceCardHand,
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
    "am-crak-seven": ["7m"],
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
  { term: "wind", pattern: /\bwinds?\b/i, lesson: 0, step: 8, definition: "The first four are the winds" },
  { term: "dragon", pattern: /\bdragons?\b/i, lesson: 0, step: 8, definition: "The last three are the dragons" },
  { term: "flower", pattern: /\bflowers?\b/i, lesson: 0, step: 11, definition: "eight flower tiles" },
  { term: "joker", pattern: /\bjokers?\b/i, lesson: 0, step: 11, definition: "A joker is a wild tile" },
  { term: "pair", pattern: /\bpairs?\b/i, lesson: 0, step: 11, definition: "a pair is two matching tiles" },
  { term: "kind", pattern: /\bkinds?\b/i, lesson: 0, step: 12, definition: "A kind is one distinct face" },
  { term: "copy", pattern: /\bcop(y|ies)\b/i, lesson: 0, step: 12, definition: "A copy is one physical tile" },
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
    // "Sequence" named a run without ever being defined (panel U11);
    // runs are "runs of neighbouring numbers" in this track.
    ["sequence", /\bsequences?\b/i],
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
// Hardening regressions (Nov 18, 2026 acceptance panel, verdict NOT MET):
// the fixes the panel's ranked gap list demanded, pinned so they cannot
// silently regress.
// ---------------------------------------------------------------------------

describe("American hardening regressions", () => {
  const lessonById = (id: string) => AMERICAN_LESSONS.find((l) => l.id === id)!;
  const questionById = (id: string) => {
    for (const l of AMERICAN_LESSONS)
      for (const q of variantLessonQuestions(l)) if (q.id === id) return q;
    throw new Error(`no question ${id}`);
  };

  it("every value am-drills asks was printed with its hand earlier in the track", () => {
    // Gap item 1 / panel D1: am-drills step 3 asked the double-quint
    // hand's value (55) that no earlier step had shown with the hand.
    const drills = lessonById("am-drills");
    const drillsAt = AMERICAN_LESSONS.indexOf(drills);
    const earlierTexts = AMERICAN_LESSONS.slice(0, drillsAt).flatMap((l) =>
      l.steps.map((s) => s.text ?? ""),
    );
    const qt3 = questionById("am-qt3-value");
    expect(qt3.kind).toBe("choice");
    if (qt3.kind !== "choice") return;
    const asked = qt3.choices[qt3.answer]!;
    expect(
      earlierTexts.some(
        (t) => t.includes("11111 99999 66 FF") && t.includes(asked),
      ),
      "the QT-3 line must appear with its printed value before am-drills asks it",
    ).toBe(true);
    expect(asked).toBe(String(practiceCardHand("QT-3").value));
  });

  it("the Charleston pass rule is taught before any drill grades by it", () => {
    // Gap item 3 / panel D3: the rule existed only inside wrong-answer
    // feedback. It must stand in am-charleston's teaching steps, ahead
    // of the pass-evens question.
    const charleston = lessonById("am-charleston");
    const passStepAt = charleston.steps.findIndex(
      (s) => s.question?.id === "am-pass-evens",
    );
    const taught = charleston.steps
      .slice(0, passStepAt)
      .map((s) => s.text ?? "")
      .join("\n");
    expect(taught).toContain("off-pattern");
    expect(taught).toContain("never break a pair");
  });

  it("card lines are shown together with their printed descriptions", () => {
    // Gap item 4 / panel U4: descriptions were referenced but never
    // displayed. (Rendered in the track's spelled-out number style —
    // the denylist above forbids digit-letter tokens in teaching text.)
    const card = lessonById("am-card");
    expect(card.steps[1]!.text).toContain("222 444 6666 8888");
    expect(card.steps[1]!.text).toContain("all in a single suit of your choice");
    expect(card.steps[2]!.text).toContain("22 444 666 8888 88");
    expect(card.steps[2]!.text).toContain("the eights are split across two suits");
    expect(practiceCardHand("EV-1").notation).toBe("222 444 6666 8888");
    expect(practiceCardHand("EV-2").notation).toBe("22 444 666 8888 88");
  });

  it("two D groups in one line are taught as two different dragon kinds", () => {
    // Panel U5.
    const card = lessonById("am-card");
    expect(card.steps[3]!.text).toContain("two different dragon kinds");
  });

  it("changed hints stay hint-only (no component enumeration, no answer words)", () => {
    // Gap items 2–3: the kong-pick hint enumerated the row's groups;
    // the Charleston-order hint fixed the answer's first and last words.
    const kong = questionById("am-kong-pick");
    expect(kong.hint).not.toContain("pung of threes");
    const order = questionById("am-charleston-order");
    expect(order.hint).not.toMatch(/\b(right|left|over)\b/i);
  });

  it('"mahjong" the win-call is not used before the lesson that defines it', () => {
    // Panel U12: am-defense used "gives away mahjong" seven lessons
    // before lesson 10 defines calling mahjong. The game's name in
    // lesson 1's opener and the app's name are not the verb.
    for (const l of AMERICAN_LESSONS.slice(0, 9)) {
      const text = visibleText(l)
        .replaceAll("Mahjong is a game", "")
        .replaceAll("any other mahjong game uses", "")
        .replaceAll("American mahjong", "")
        .replaceAll("Open Mahjong", "");
      expect(/mahjong/i.test(text), l.id).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Hardening round 2 regressions (Nov 18, 2026 re-panel, verdict
// NOT MET by three material items): Consecutive Runs hands were
// never printed in the track (M2), the pass rule's wording
// contradicted itself (M1), and one drills premise fought the
// track's own tile law (M3).
// ---------------------------------------------------------------------------

describe("American hardening round 2 regressions", () => {
  const lessonById = (id: string) => AMERICAN_LESSONS.find((l) => l.id === id)!;
  const questionById = (id: string) => {
    for (const l of AMERICAN_LESSONS)
      for (const q of variantLessonQuestions(l)) if (q.id === id) return q;
    throw new Error(`no question ${id}`);
  };
  const teachingTexts = (l: VariantLesson): string[] =>
    l.steps.map((s) => s.text ?? "");

  it("Consecutive Runs lines are printed with their descriptions before lesson 6", () => {
    // M2: no RN line appeared anywhere in the track, so the
    // closest-hand skill could not be practised against that
    // section (re-panel P2: 4 PASS / 1 PARTIAL / 1 FAIL, the one
    // FAIL an invented hand). Lines are quoted in the track's
    // spelled-out number style, as in round 1.
    const card = teachingTexts(lessonById("am-card")).join("\n");
    expect(card).toContain(practiceCardHand("RN-1").notation);
    expect(card).toContain("pungs of ones and twos");
    const practice = teachingTexts(lessonById("am-practice-card")).join("\n");
    expect(practice).toContain(practiceCardHand("RN-2").notation);
    expect(practice).toContain("kongs of sevens and eights");
  });

  it("lesson 6 works a Consecutive Runs comparison and drills a second one", () => {
    const picking = lessonById("am-picking");
    const drillAt = picking.steps.findIndex(
      (s) => s.question?.id === "am-runs-compare-drill",
    );
    expect(drillAt).toBeGreaterThan(-1);
    const taughtBefore = teachingTexts(picking).slice(0, drillAt).join("\n");
    // The worked comparison prints both RN lines it counts against.
    expect(taughtBefore).toContain(practiceCardHand("RN-4").notation);
    expect(taughtBefore).toContain(practiceCardHand("RN-3").notation);
    const drill = questionById("am-runs-compare-drill");
    expect(drill.kind).toBe("choice");
    if (drill.kind === "choice")
      expect(drill.verify()).toBe(drill.choices[drill.answer]);
  });

  it("pass-rule absolutes keep their qualifiers in the same sentence", () => {
    // M1: "never break a pair" was taught as an absolute in
    // am-charleston, then contradicted by correct-answer feedback
    // ("a tile from a pair is sometimes the right pass"), and
    // restated in hints without the taught "when you can" — while
    // a drills answer is a one-suit pass. The rule as graded: pass
    // off-pattern singles, spread one in each suit when you can,
    // and do not break a pair when you have a better pass.
    const sentences = collected.flatMap((c) =>
      c.texts.flatMap((t) => t.split(/(?<=[.!?])\s+/)),
    );
    for (const s of sentences) {
      if (/never break a pair/i.test(s))
        expect(
          /\b(when|while|if|unless)\b/i.test(s),
          `unqualified absolute: ${s}`,
        ).toBe(true);
      if (/\bone (tile )?in each suit\b/i.test(s))
        expect(s, `unqualified spread: ${s}`).toContain("when you can");
    }
    // The teaching step itself states the exception.
    const charleston = teachingTexts(lessonById("am-charleston")).join("\n");
    expect(charleston).toContain(
      "a tile from a pair is sometimes the right pass",
    );
  });

  it("the West-wind drills premise matches the taught tile law", () => {
    // M3: the check framed a complete 14-tile line as "one tile
    // from complete" with its single "waiting to be paired" — but
    // the track teaches that every hand uses fourteen tiles and a
    // single is a complete group of one.
    const q = questionById("am-wd2-single");
    expect(q.prompt).not.toContain("one tile from complete");
    expect(q.prompt).not.toContain("waiting to be paired");
    expect(q.explanation).toContain("complete group of one");
  });
});

// ---------------------------------------------------------------------------
// Hardening round 3 regressions (Nov 18, 2026 verification re-panel,
// verdict NOT MET on criteria (d)/(e) by two corroborated defects):
// am-picking's pictured racks contradicted their own counting text
// (V1), and am-scoring step 6 contradicted step 3's worked example
// (V2). The pictured-rack counts below are RECOMPUTED from the
// notations as they stand in the lesson content, expanded through
// the runner's own expandNotation and counted against the Practice
// Card data over every assignment of the hand's card suits to real
// suits — so if a future notation edit changes a pictured count,
// the recomputed count stops matching the pinned number the prose
// states, and this block fails.
// ---------------------------------------------------------------------------

describe("American hardening round 3 regressions", () => {
  const lessonById = (id: string) => AMERICAN_LESSONS.find((l) => l.id === id)!;
  const questionById = (id: string) => {
    for (const l of AMERICAN_LESSONS)
      for (const q of variantLessonQuestions(l)) if (q.id === id) return q;
    throw new Error(`no question ${id}`);
  };
  const tilesOf = (q: ReturnType<typeof questionById>): string => {
    if ("tiles" in q && q.tiles) return q.tiles;
    throw new Error(`question ${q.id} pictures no tiles`);
  };

  const faceCounts = (notation: string): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const face of expandNotation(notation, AMERICAN_TILE_INVENTORY)) {
      const name = tileTypeName(face.type);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return counts;
  };

  interface Counted {
    held: number;
    toGo: number;
    shortfalls: string[];
  }
  // Count a pictured rack toward a card hand under one assignment of
  // the hand's card suits (0, 1, 2) to real suits. Flowers have no
  // pictured face in this app; where a lesson's text names flowers
  // standing on the rack, pass their count as namedFlowers.
  const countToward = (
    handId: string,
    counts: Map<string, number>,
    assign: readonly string[],
    namedFlowers = 0,
  ): Counted => {
    const hand = practiceCardHand(handId);
    let held = 0;
    const shortfalls: string[] = [];
    for (const g of hand.groups) {
      if (g.kind === "flower") {
        const got = Math.min(namedFlowers, g.count);
        held += got;
        for (let i = got; i < g.count; i++) shortfalls.push("F");
        continue;
      }
      if (g.kind !== "number")
        throw new Error(`${handId}: pictured-count helper covers number groups only`);
      const face = `${g.rank}${assign[g.suit ?? 0]}`;
      const got = Math.min(counts.get(face) ?? 0, g.count);
      held += got;
      for (let i = got; i < g.count; i++) shortfalls.push(face);
    }
    const total = hand.groups.reduce((n, g) => n + g.count, 0);
    return { held, toGo: total - held, shortfalls };
  };
  // The lessons' own counting rule: count each hand in the suits
  // where it counts most — the best over every assignment of
  // distinct real suits to the hand's card suits.
  const bestToward = (
    handId: string,
    counts: Map<string, number>,
    namedFlowers = 0,
  ): Counted => {
    const { suitsUsed } = practiceCardHand(handId);
    const suits = ["m", "p", "s"];
    let best: Counted | undefined;
    const build = (acc: string[]): void => {
      if (acc.length === suitsUsed) {
        const c = countToward(handId, counts, acc, namedFlowers);
        if (!best || c.held > best.held) best = c;
        return;
      }
      for (const s of suits) if (!acc.includes(s)) build([...acc, s]);
    };
    build([]);
    return best!;
  };

  it("am-picking's opening rack pictures the counts its steps teach", () => {
    // V1b: the rack pictured four 6s while steps 1–3 counted three
    // (10 held / 4 to go toward EV-1, one more of each rank needed).
    const picking = lessonById("am-picking");
    const opening = picking.steps.find((s) => s.hand)?.hand;
    expect(opening).toBeDefined();
    expect(expandNotation(opening!, AMERICAN_TILE_INVENTORY)).toHaveLength(13);
    const counts = faceCounts(opening!);
    const inCraks = countToward("EV-1", counts, ["m"]);
    expect(inCraks.held).toBe(10);
    expect(inCraks.toGo).toBe(4);
    expect(inCraks.shortfalls).toEqual(["2m", "4m", "6m", "8m"]);
    expect(bestToward("EV-1", counts).held).toBe(10);
    // The two graded checks key the same recomputed counts.
    const held = questionById("am-ev1-held");
    expect(held.kind).toBe("choice");
    if (held.kind === "choice")
      expect(held.choices[held.answer]).toBe(String(inCraks.held));
    const toGo = questionById("am-ev1-to-go");
    expect(toGo.kind).toBe("choice");
    if (toGo.kind === "choice")
      expect(toGo.choices[toGo.answer]).toBe(String(inCraks.toGo));
  });

  it("am-picking's worked comparison rack counts as its text counts it", () => {
    // Step 5: EV-1 counts 6 in its best suit (Dots); EV-5 counts 13
    // with one tile to go — a third 6 of Bams. The rack's two
    // flowers are named in the text, not pictured (the track's
    // stated convention for flowers), so they enter as named tiles.
    const picking = lessonById("am-picking");
    const pictured = picking.steps.filter((s) => s.hand).map((s) => s.hand!);
    expect(pictured).toHaveLength(3);
    const counts = faceCounts(pictured[1]!);
    const ev1 = bestToward("EV-1", counts);
    expect(ev1.held).toBe(6);
    expect(ev1.toGo).toBe(8);
    const ev5 = bestToward("EV-5", counts, 2);
    expect(ev5.held).toBe(13);
    expect(ev5.toGo).toBe(1);
    expect(ev5.shortfalls).toEqual(["6s"]);
  });

  it("am-picking's compare-drill rack pictures the split its feedback counts", () => {
    // V1a: the pictured pair of 2s sat in Dots while the question
    // and feedback count it in Craks (13 held toward EV-2, only one
    // more 8 of Craks missing; EV-1's best suit, Dots, holds 7).
    const drill = questionById("am-compare-drill");
    const counts = faceCounts(tilesOf(drill));
    const split = countToward("EV-2", counts, ["m", "p"]);
    expect(split.held).toBe(13);
    expect(split.toGo).toBe(1);
    expect(split.shortfalls).toEqual(["8m"]);
    expect(bestToward("EV-2", counts).held).toBe(13);
    const ev1 = bestToward("EV-1", counts);
    expect(ev1.held).toBe(7);
    expect(ev1.toGo).toBe(7);
  });

  it("am-picking's Consecutive Runs racks count as their text counts them", () => {
    // The worked RN comparison: RN-4 counts 12 with both missing
    // tiles 7s; RN-3 counts 7 on its far side. The transfer drill:
    // RN-1 counts 11 (3 to go), RN-2 counts 2 (12 to go).
    const picking = lessonById("am-picking");
    const pictured = picking.steps.filter((s) => s.hand).map((s) => s.hand!);
    const counts = faceCounts(pictured[2]!);
    const rn4 = countToward("RN-4", counts, ["m"]);
    expect(rn4.held).toBe(12);
    expect(rn4.toGo).toBe(2);
    expect(rn4.shortfalls).toEqual(["7m", "7m"]);
    expect(bestToward("RN-3", counts).held).toBe(7);
    expect(bestToward("RN-3", counts).toGo).toBe(7);
    const drillCounts = faceCounts(tilesOf(questionById("am-runs-compare-drill")));
    expect(bestToward("RN-1", drillCounts).held).toBe(11);
    expect(bestToward("RN-1", drillCounts).toGo).toBe(3);
    expect(bestToward("RN-2", drillCounts).held).toBe(2);
    expect(bestToward("RN-2", drillCounts).toGo).toBe(12);
  });

  it("am-scoring's first discard check states its joker fact and keys the taught stacking", () => {
    // V2: step 3's worked example pays 100 for a 25-point no-joker
    // discard win; step 6 asked about the pictured (jokerless) hand
    // with the key at 50 and no joker fact stated anywhere. Jokers
    // have no pictured face in this app — the premise sentence is
    // the hand's joker content, the same channel the track uses for
    // flowers — so the pin is: the sentence is present, the
    // feedback addresses the bonus, and the key equals the stacking
    // computed from the stated fact (jokers used → no bonus →
    // discarder pays double the plain value).
    const scoring = lessonById("am-scoring");
    const worked = scoring.steps[2]?.text ?? "";
    expect(worked).toContain("with no jokers in it");
    expect(worked).toContain("which is 100");
    const pictured = scoring.steps.find((s) => s.hand)?.hand;
    expect(pictured).toBeDefined();
    expect(faceCounts(pictured!)).toEqual(
      new Map([
        ["2m", 3],
        ["4m", 3],
        ["6m", 4],
        ["8m", 4],
      ]),
    );
    const q = questionById("am-ev1-discard-pay");
    expect(q.prompt).toContain(
      "Jokers were used in the hand, so no jokerless bonus applies",
    );
    expect(q.explanation).toContain("no jokerless bonus doubles its value");
    expect(q.kind).toBe("choice");
    if (q.kind === "choice")
      expect(q.choices[q.answer]).toBe(String(practiceCardHand("EV-1").value * 2));
  });

  it("am-scoring's total check shares the premise and qualifies its four-times claim", () => {
    // Watch item (i): "always brings in four times the hand's
    // value" is falsified by the bonus cases the same lesson
    // teaches. The total check shares step 6's scenario and
    // pictured hand, so it carries the same joker sentence.
    const q = questionById("am-ev1-total");
    expect(q.prompt).toContain(
      "Jokers were used in the hand, so no jokerless bonus applies",
    );
    expect(q.explanation).not.toContain("always brings in four times");
    expect(q.explanation).toContain("With no bonus in play");
    expect(q.kind).toBe("choice");
    if (q.kind === "choice")
      expect(q.choices[q.answer]).toBe(String(practiceCardHand("EV-1").value * 4));
  });

  it("the pass rule's stand-alone clause matches what the drills grade", () => {
    // Watch item (ii): the rule said stand-alone tiles have "no
    // neighbours among the tiles you are keeping", but both graded
    // pass drills pass tiles that neighbour kept tiles in number
    // (the 2 of Craks beside kept odd Craks; the 5 and 7 of Craks
    // beside the kept 6). Stand-alone means unpaired and no part in
    // a kept cluster.
    const charleston = lessonById("am-charleston");
    const taught = charleston.steps.map((s) => s.text ?? "").join("\n");
    expect(taught).not.toContain("no neighbours among the tiles you are keeping");
    expect(taught).toContain("no part in the clusters you are keeping");
    expect(taught).toContain("still stand alone");
  });

  it("EV-2's quoted description is glossed where the track quotes it", () => {
    // Watch item (iii): "the rest follows them" was never explained.
    // The card data keeps its canonical wording; the lesson glosses
    // its own quote (the split the card data itself encodes: EV-2's
    // groups sit in card suits 0,1,0,1,0).
    const card = lessonById("am-card");
    expect(card.steps[2]?.text ?? "").toContain(
      "the rest follows them — means the twos, fours and sixes split across the same two suits as the eights",
    );
    expect(practiceCardHand("EV-2").groups.map((g) => g.suit)).toEqual([0, 1, 0, 1, 0]);
  });
});

// ---------------------------------------------------------------------------
// Closure mop-up regressions (Nov 18, 2026 closure re-panel, verdict
// LOOP MET): the panel's three non-blocking residuals — am-scoring
// step 7 was the only payment check that omitted its joker
// statement, am-charleston step 11's premise was the taught
// blind-pass trigger with no blind-pass option offered, and
// am-picking step 8's feedback called a kong a pung.
// ---------------------------------------------------------------------------

describe("American closure mop-up regressions", () => {
  const questionById = (id: string) => {
    for (const l of AMERICAN_LESSONS)
      for (const q of variantLessonQuestions(l)) if (q.id === id) return q;
    throw new Error(`no question ${id}`);
  };

  it("am-scoring's self-pick check states its joker fact and keys the taught stacking", () => {
    // Residual 1: steps 6, 8 and 10 all state their joker status;
    // step 7 (rn5-selfpick-pay) stated none, so a beginner had to
    // guess that silence meant no bonus — which the stacking rule
    // never says. The key (80) is the no-bonus stacking: jokers
    // used → value stays 40 → self-pick doubles every share. (The
    // jokerless stacking would be 160, which no option offered —
    // the key was derivable, but the premise is now stated like
    // every sibling check states it.)
    const q = questionById("am-rn5-selfpick-pay");
    expect(q.prompt).toContain(
      "Jokers were used in the hand, so no jokerless bonus applies",
    );
    expect(q.explanation).toContain("no jokerless bonus doubles its value");
    expect(q.kind).toBe("choice");
    if (q.kind === "choice")
      expect(q.choices[q.answer]).toBe(String(practiceCardHand("RN-5").value * 2));
  });

  it("am-charleston's joker-pass scenario keys the taught blind pass", () => {
    // Residual 2: the scenario's premise — exactly one tile you
    // can spare, every other tile part of the hand being built —
    // is the blind-pass trigger taught at step 5 ("fewer than
    // three tiles you can spare"), but the old option set offered
    // no blind pass and its keyed feedback reframed the premise
    // ("two ordinary tiles you can best spare"). The keyed answer
    // is now the blind pass itself, which also keeps both jokers:
    // it takes only from the tiles coming to you, never from your
    // own rack.
    const q = questionById("am-joker-pass-scenario");
    expect(q.prompt).toContain("exactly one tile you can spare");
    expect(q.kind).toBe("choice");
    if (q.kind === "choice")
      expect(q.choices[q.answer]).toContain("blind pass");
    expect(q.explanation).toContain("blind pass");
    expect(q.explanation).toContain("never from your own rack");
  });

  it("am-picking's runs-compare feedback names the kong of threes", () => {
    // Residual 3: RN-1's threes group is a kong (3333) and the
    // pictured rack holds three of its four tiles; the feedback
    // called them a pung "in full". The counts were always right
    // (11 held / 3 to go, pinned by the round-3 count audit) —
    // only the group name was loose.
    const q = questionById("am-runs-compare-drill");
    expect(q.explanation).toContain("three of the kong of threes");
    expect(q.explanation).not.toContain("twos and threes in full");
  });
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
