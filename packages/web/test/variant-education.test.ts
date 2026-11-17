// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  VARIANT_LESSONS,
  validateVariantContent,
  validateVariantQuestion,
  variantLessonQuestions,
  type VariantLesson,
  type VariantTilePickQuestion,
} from "../src/education/variant-content.js";
import {
  emptyVariantProgress,
  mergeVariantProgress,
  parseVariantProgress,
  type VariantLearningProgress,
} from "../src/education/variant-progress.js";
import { mountVariantEducation } from "../src/variant-education-ui.js";
let root: HTMLElement;
let progress: VariantLearningProgress;
beforeEach(() => {
  document.body.replaceChildren();
  root = document.createElement("div");
  document.body.append(root);
  progress = emptyVariantProgress();
});
const click = (name: string) => {
  const b = [...root.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent === name,
  );
  if (!b) throw new Error(name);
  b.click();
};
const buttonByLabel = (label: string) => {
  const b = [...root.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.getAttribute("aria-label") === label,
  );
  if (!b) throw new Error(label);
  return b;
};
const lessonText = (l: VariantLesson) =>
  l.steps.map((s) => s.text ?? "").join(" ");
const mount = (extra: Partial<Parameters<typeof mountVariantEducation>[1]> = {}) =>
  mountVariantEducation(root, {
    variant: "hong-kong",
    progress,
    onProgress: (p) => {
      progress = p;
    },
    renderTile: () => document.createElement("span"),
    onBack: () => {},
    onPlay: () => {},
    ...extra,
  });
describe("original versioned variant teaching", () => {
  it("contains substantial Hong Kong teaching and verifies every executable exercise oracle", () => {
    validateVariantContent();
    const lessons = VARIANT_LESSONS.filter((l) => l.variant === "hong-kong");
    expect(lessons).toHaveLength(10);
    expect(
      lessons.map(lessonText).join(" ").split(/\s+/).length,
    ).toBeGreaterThan(1800);
    const questions = lessons.flatMap(variantLessonQuestions);
    expect(questions).toHaveLength(20);
    expect(questions.every((q) => q.hint.trim().length > 0)).toBe(true);
    expect(questions.find((q) => q.id === "hk-two-fan")!.verify()).toBe("No");
    expect(questions.find((q) => q.id === "hk-three-fan")!.verify()).toBe(
      "Yes",
    );
    expect(questions.find((q) => q.id === "hk-discard-payment")!.verify()).toBe(
      "16",
    );
  });
  it("ships substantial MCR instruction and all 81 searchable references", () => {
    const lessons = VARIANT_LESSONS.filter((l) => l.variant === "mcr");
    expect(lessons).toHaveLength(10);
    expect(
      lessons.map(lessonText).join(" ").split(/\s+/).length,
    ).toBeGreaterThan(1800);
    expect(lessons.flatMap(variantLessonQuestions)).toHaveLength(20);
    mount({ variant: "mcr", lessonId: "mcr-families" });
    // The 81-pattern reference is reachable after the families
    // lesson's final step.
    for (
      let guard = 0;
      guard < 12 && !root.textContent!.includes("Lesson complete");
      guard++
    ) {
      if (
        [...root.querySelectorAll("button")].some(
          (b) => b.textContent === "Check answer",
        )
      ) {
        click("No");
        click("Check answer");
        click("Continue");
      } else click("Continue");
    }
    expect(root.textContent).toContain("Lesson complete");
    expect(root.querySelectorAll("details")).toHaveLength(81);
    const search = root.querySelector<HTMLInputElement>(
      'input[type="search"]',
    )!;
    search.value = "knitted";
    search.dispatchEvent(new Event("input"));
    expect(root.querySelectorAll("details")).toHaveLength(3);
  });
  it("requires correct retry, resumes the same question, completes a whole lesson, and never introduces bottom navigation", () => {
    const lesson = VARIANT_LESSONS[0]!;
    const questions = variantLessonQuestions(lesson);
    const first = mount({ lessonId: lesson.id });
    // Three text steps precede the first question step.
    click("Continue");
    click("Continue");
    click("Continue");
    expect(root.textContent).toContain(questions[0]!.prompt);
    click("136");
    click("Check answer");
    expect(root.textContent).toContain("Try again");
    // Wrong-answer feedback is the hint; the answer-naming explanation
    // appears only after a correct answer.
    expect(root.textContent).toContain(questions[0]!.hint);
    expect(root.textContent).not.toContain(questions[0]!.explanation);
    expect(buttonByLabel("Back")).toBeTruthy();
    expect(
      [...root.querySelectorAll<HTMLButtonElement>("button")].find(
        (b) => b.textContent === "136",
      )!.disabled,
    ).toBe(true);
    expect(progress.active[lesson.id]!.step).toBe(3);
    expect(root.querySelector(".learning-nav")).toBeNull();
    first.destroy();
    mount({ lessonId: lesson.id });
    expect(root.textContent).toContain(questions[0]!.prompt);
    click("144");
    click("Check answer");
    expect(root.textContent).toContain(questions[0]!.explanation);
    click("Continue");
    click("No");
    click("Check answer");
    click("Continue");
    expect(root.textContent).toContain("Lesson complete");
    expect(root.textContent).toContain(`You finished “${lesson.title}”.`);
    expect(root.textContent).not.toContain("learning record");
    expect(progress.completed.map((c) => c.lessonId)).toContain(lesson.id);
    expect(progress.attempts[1]!.assisted).toBe(true);
  });
  it("merges offline evidence idempotently and rejects incompatible content/profile identities", () => {
    const lesson = VARIANT_LESSONS[0]!;
    const data = {
      v: 2,
      completed: [
        { lessonId: lesson.id, version: 2, profileId: lesson.profileId, at: 1 },
      ],
      active: {},
      attempts: [
        {
          id: "one",
          questionId: variantLessonQuestions(lesson)[0]!.id,
          profileId: lesson.profileId,
          contentVersion: 2,
          correct: true,
          assisted: false,
          at: 1,
        },
      ],
    };
    const a = parseVariantProgress(data);
    expect(mergeVariantProgress(a, a).attempts).toHaveLength(1);
    expect(
      parseVariantProgress({
        ...data,
        completed: [{ ...data.completed[0], version: 9 }],
        attempts: [{ ...data.attempts[0], profileId: "openmahjong-riichi" }],
      }).completed,
    ).toHaveLength(0);
    expect(
      parseVariantProgress({
        ...data,
        attempts: [{ ...data.attempts[0], profileId: "openmahjong-riichi" }],
      }).attempts,
    ).toHaveLength(0);
  });
  it("drops version 1 saved progress cleanly", () => {
    const lesson = VARIANT_LESSONS[0]!;
    const v1 = parseVariantProgress({
      v: 1,
      completed: [
        { lessonId: lesson.id, version: 1, profileId: lesson.profileId, at: 1 },
      ],
      active: {
        [lesson.id]: {
          step: 1,
          version: 1,
          profileId: lesson.profileId,
          at: 1,
        },
      },
      attempts: [
        {
          id: "one",
          questionId: variantLessonQuestions(lesson)[0]!.id,
          profileId: lesson.profileId,
          contentVersion: 1,
          correct: true,
          assisted: false,
          at: 1,
        },
      ],
    });
    expect(v1.completed).toHaveLength(0);
    expect(v1.active).toEqual({});
    expect(v1.attempts).toHaveLength(0);
  });
});

describe("tile-pick drill questions", () => {
  const tilePickQuestion: VariantTilePickQuestion = {
    kind: "tile-pick",
    id: "hk-tilepick-q",
    prompt: "Tap every honor tile.",
    tiles: "5m1z7z",
    picks: [1, 2],
    hint: "Honors are the winds and dragons; a suited tile carries a suit and a number.",
    explanation: "East and the red dragon are honors; the 5 of characters is a suited tile.",
    verify: () => "1,2",
  };
  const synthetic: VariantLesson = {
    id: "hk-tilepick-test",
    variant: "hong-kong",
    profileId: "openmahjong-hkos",
    version: 2,
    title: "Tile pick test",
    steps: [{ text: "Some tiles are honors.", question: tilePickQuestion }],
  };
  it("validates picks against the shown row", () => {
    expect(() => validateVariantQuestion(tilePickQuestion)).not.toThrow();
    expect(() =>
      validateVariantQuestion({
        ...tilePickQuestion,
        picks: [3],
        verify: () => "3",
      }),
    ).toThrow("Invalid exercise");
    expect(() =>
      validateVariantQuestion({
        ...tilePickQuestion,
        picks: [1, 1],
        verify: () => "1,1",
      }),
    ).toThrow("Invalid exercise");
  });
  it("runs a tile-pick step: wrong picks teach with counts, un-picking corrects", () => {
    VARIANT_LESSONS.push(synthetic);
    try {
      mount({ lessonId: synthetic.id });
      buttonByLabel("Tile 1").click();
      click("Check answer");
      expect(root.textContent).toContain("Try again");
      expect(root.textContent).toContain("1 pick does not belong");
      expect(root.textContent).toContain("2 picks are missing");
      expect(root.textContent).toContain("Tap a picked tile again to un-pick it.");
      expect(root.textContent).not.toContain(tilePickQuestion.explanation);
      buttonByLabel("Tile 2").click();
      buttonByLabel("Tile 3").click();
      click("Check answer");
      expect(root.textContent).toContain("Try again");
      expect(root.textContent).toContain("1 pick does not belong");
      expect(root.textContent).toContain("0 picks are missing");
      buttonByLabel("Tile 1").click();
      click("Check answer");
      expect(root.textContent).toContain(tilePickQuestion.explanation);
      click("Continue");
      expect(root.textContent).toContain("Lesson complete");
    } finally {
      VARIANT_LESSONS.splice(VARIANT_LESSONS.indexOf(synthetic), 1);
    }
  });
});

describe("variant practice pool", () => {
  it("says so plainly when no lesson has been completed yet", () => {
    mount({ practice: true });
    expect(root.textContent).toContain(
      "Finish a lesson first — its questions appear here for practice.",
    );
    expect(
      [...root.querySelectorAll("button")].some(
        (b) => b.textContent === "Check answer",
      ),
    ).toBe(false);
  });
  it("draws questions only from completed lessons", () => {
    progress = parseVariantProgress({
      v: 2,
      completed: [
        {
          lessonId: "hk-tiles",
          version: 2,
          profileId: "openmahjong-hkos",
          at: 1,
        },
      ],
      active: {},
      attempts: [],
    });
    mount({ practice: true });
    expect(root.textContent).toContain(
      "How many physical tiles are in this table’s inventory?",
    );
    const picker = root.querySelector<HTMLSelectElement>(
      'select[aria-label="Practice lesson"]',
    )!;
    expect([...picker.options].map((o) => o.value)).toEqual(["hk-tiles"]);
  });
  it("includes the review topic lesson even when it is not completed", () => {
    mount({ practice: true, initialTopic: "hk-shape" });
    expect(root.textContent).toContain(
      "How many sets does the displayed standard hand contain?",
    );
  });
});

describe("Taiwanese course compatibility", () => {
  it("has original five-set lessons and checked, profile-bound questions", () => {
    validateVariantContent();
    const lessons = VARIANT_LESSONS.filter((l) => l.variant === "taiwanese");
    expect(lessons).toHaveLength(10);
    expect(
      lessons.map(lessonText).join(" ").split(/\s+/).length,
    ).toBeGreaterThan(1800);
    expect(lessons.flatMap(variantLessonQuestions)).toHaveLength(20);
    expect(
      lessons.every(
        (l) => l.profileId === "openmahjong-taiwanese-every-flower",
      ),
    ).toBe(true);
  });
});
