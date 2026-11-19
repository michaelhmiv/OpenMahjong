import { describe, expect, it } from "vitest";
import enData from "../src/i18n/locales/en.json";
import { slugify } from "../src/i18n/index.js";
import {
  VARIANT_LESSONS,
  VARIANT_RELEASES,
  type VariantLesson,
  type VariantQuestion,
} from "../src/education/variant-content.js";
import { MODULES } from "../src/education/curriculum.js";
import { AMERICAN_LESSONS } from "../src/education/american.js";
import {
  PRACTICE_CARD_HANDS,
  PRACTICE_CARD_SECTIONS,
} from "../src/education/practice-card.js";
import cardData from "../src/education/practice-card.json" with {
  type: "json",
};
import { mcrPatternGuide } from "../src/education/mcr-guide.js";

/**
 * Derived-key coverage (brief-i18n-v1 rewire, CI layer 2): the renderers
 * compute keys from ids at render time — `t()` returns the key id
 * itself when the key is missing, so a drifted derivation shows a raw
 * key id on screen instead of text. These tests assert every key the
 * renderers derive exists in en.json with the English value the data
 * file carries. The data files are the extractor's source of truth, so
 * the expected value comes from the data, never from en.json itself.
 *
 * Families asserted here (all `t()`, no fallback): variant lesson
 * titles / step texts / question prompt-choices-explanations-hints,
 * curriculum module titles / covered lines / completions, American
 * lesson-ref titles (slugified), practice-card hand descriptions /
 * section names / blurbs / card title, MCR guide pattern fields,
 * variant release names, Learn section titles.
 *
 * Practice NAMES / YAKU and review TERMS resolve through tx() with an
 * English fallback, so a missing key there degrades to English rather
 * than a key id; those families get an existence smoke check only.
 */

const enKeys = (enData as { keys: Record<string, { value: string }> }).keys;

function expectKey(key: string, expected: string): void {
  const entry = enKeys[key];
  expect(entry, `missing derived key ${key}`).toBeDefined();
  expect(entry!.value, `value drift on ${key}`).toBe(expected);
}

function topicOf(lesson: VariantLesson): string {
  return lesson.id.slice(lesson.id.indexOf("-") + 1);
}

function questionKey(
  lesson: VariantLesson,
  q: VariantQuestion,
  field: string,
): string {
  // Mirrors the runner's derivation (variant-education-ui.ts): Hong
  // Kong's builders pass the full question id, the other tracks'
  // helpers prefix the bare id at runtime.
  const qid =
    lesson.variant === "hong-kong"
      ? q.id
      : q.id.slice(q.id.indexOf("-") + 1);
  return `learn.${lesson.variant}.${topicOf(lesson)}.q-${qid}.${field}`;
}

describe("derived keys: variant lessons", () => {
  it("every lesson title, step text, and question field resolves", () => {
    expect(VARIANT_LESSONS.length).toBeGreaterThan(0);
    let steps = 0;
    let questions = 0;
    for (const lesson of VARIANT_LESSONS) {
      expectKey(
        `learn.${lesson.variant}.${topicOf(lesson)}.title`,
        lesson.title,
      );
      lesson.steps.forEach((step, i) => {
        if (step.text !== undefined) {
          steps++;
          expectKey(
            `learn.${lesson.variant}.${topicOf(lesson)}.step${String(i + 1).padStart(2, "0")}.text`,
            step.text,
          );
        }
        const q = step.question;
        if (!q) return;
        questions++;
        expectKey(questionKey(lesson, q, "prompt"), q.prompt);
        expectKey(questionKey(lesson, q, "explanation"), q.explanation);
        expectKey(questionKey(lesson, q, "hint"), q.hint);
        if (q.kind === "choice") {
          q.choices.forEach((choice, ci) => {
            expectKey(questionKey(lesson, q, `choice${ci}`), choice);
          });
        }
      });
    }
    // Guard against the test silently covering nothing if content moves.
    // (316 text steps, 199 questions across the four variant tracks.)
    expect(steps).toBeGreaterThan(300);
    expect(questions).toBeGreaterThan(150);
  });
});

describe("derived keys: curriculum modules", () => {
  it("every module title, covered line, and completion resolves", () => {
    expect(MODULES.length).toBeGreaterThan(0);
    for (const mod of MODULES) {
      expectKey(`learn.riichi.${mod.id}.title`, mod.title);
      expectKey(`learn.riichi.${mod.id}.completion`, mod.completionCriteria);
      mod.covered.forEach((line, i) => {
        expectKey(`learn.riichi.${mod.id}.covered${i}`, line);
      });
    }
  });
});

describe("derived keys: American track", () => {
  it("every lesson-ref title resolves via its slug", () => {
    expect(AMERICAN_LESSONS.length).toBe(11);
    for (const ref of AMERICAN_LESSONS) {
      expectKey(`learn.american.${slugify(ref.title)}`, ref.title);
    }
  });

  it("every practice-card hand description, section name/blurb, and card title resolves", () => {
    expect(PRACTICE_CARD_HANDS.length).toBeGreaterThan(0);
    for (const hand of PRACTICE_CARD_HANDS) {
      expectKey(
        `learn.american.pcard.hand.${hand.id}.description`,
        hand.description,
      );
    }
    for (const section of PRACTICE_CARD_SECTIONS) {
      expectKey(
        `learn.american.pcard.section.${section.id}.name`,
        section.name,
      );
      expectKey(
        `learn.american.pcard.section.${section.id}.blurb`,
        section.blurb,
      );
    }
    expectKey("learn.american.pcard.title", (cardData as { card: { title: string } }).card.title);
  });
});

describe("derived keys: MCR guide and releases", () => {
  it("every guide pattern's four fields resolve", () => {
    const patterns = mcrPatternGuide();
    expect(patterns.length).toBe(81);
    for (const p of patterns) {
      const slug = slugify(p.name);
      expectKey(`learn.mcr.guide.pattern.${slug}.name`, p.name);
      expectKey(`learn.mcr.guide.pattern.${slug}.family`, p.family);
      // The guide record calls the fields description/restrictions;
      // the derived keys name them recognition/exclusions.
      expectKey(
        `learn.mcr.guide.pattern.${slug}.recognition`,
        p.description,
      );
      expectKey(
        `learn.mcr.guide.pattern.${slug}.exclusions`,
        p.restrictions,
      );
    }
  });

  it("every variant release name resolves", () => {
    for (const release of VARIANT_RELEASES) {
      expectKey(
        `common.variant.${slugify(release.name)}`,
        release.name,
      );
    }
  });

  it("Learn section titles resolve", () => {
    expectKey("learn.riichi.section-title", "Riichi");
    expectKey("learn.american.section-title", "American");
  });
});

describe("derived keys: tx() families (existence only)", () => {
  it("practice skill / yaku and review term keys are minted", () => {
    const skills = Object.keys(enKeys).filter((k) =>
      k.startsWith("learn.practice.skill."),
    );
    const yaku = Object.keys(enKeys).filter((k) =>
      k.startsWith("learn.practice.yaku."),
    );
    const terms = Object.keys(enKeys).filter((k) =>
      k.startsWith("review.terms."),
    );
    expect(skills.length).toBeGreaterThan(0);
    expect(yaku.length).toBeGreaterThan(0);
    expect(terms.length).toBeGreaterThan(0);
    for (const k of [...skills, ...yaku, ...terms]) {
      expect(enKeys[k]!.value.length).toBeGreaterThan(0);
    }
  });
});
