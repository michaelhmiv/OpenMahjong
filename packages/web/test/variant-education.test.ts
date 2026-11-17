// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  VARIANT_LESSONS,
  validateVariantContent,
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
describe("original versioned variant teaching", () => {
  it("contains substantial Hong Kong teaching and verifies every executable exercise oracle", () => {
    validateVariantContent();
    const lessons = VARIANT_LESSONS.filter((l) => l.variant === "hong-kong");
    expect(lessons).toHaveLength(10);
    expect(
      lessons
        .flatMap((l) => l.paragraphs)
        .join(" ")
        .split(/\s+/).length,
    ).toBeGreaterThan(1800);
    const questions = lessons.flatMap((l) => l.questions);
    expect(questions).toHaveLength(20);
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
      lessons
        .flatMap((l) => l.paragraphs)
        .join(" ")
        .split(/\s+/).length,
    ).toBeGreaterThan(1800);
    expect(lessons.flatMap((l) => l.questions)).toHaveLength(20);
    mountVariantEducation(root, {
      variant: "mcr",
      lessonId: "mcr-families",
      progress,
      onProgress: (p) => {
        progress = p;
      },
      renderTile: () => document.createElement("span"),
      onBack: () => {},
      onPlay: () => {},
    });
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
    const mount = () =>
      mountVariantEducation(root, {
        variant: "hong-kong",
        lessonId: lesson.id,
        progress,
        onProgress: (p) => {
          progress = p;
        },
        renderTile: () => document.createElement("span"),
        onBack: () => {},
        onPlay: () => {},
      });
    const first = mount();
    click("Check understanding");
    click("136");
    click("Check answer");
    expect(root.textContent).toContain("Try again");
    expect(progress.active[lesson.id]!.step).toBe(1);
    expect(root.querySelector(".learning-nav")).toBeNull();
    first.destroy();
    mount();
    expect(root.textContent).toContain(lesson.questions[0]!.prompt);
    click("144");
    click("Check answer");
    click("Continue");
    click("No");
    click("Check answer");
    click("Continue");
    expect(root.textContent).toContain("Lesson complete");
    expect(progress.completed.map((c) => c.lessonId)).toContain(lesson.id);
    expect(progress.attempts[1]!.assisted).toBe(true);
  });
  it("merges offline evidence idempotently and rejects incompatible content/profile identities", () => {
    const lesson = VARIANT_LESSONS[0]!;
    const data = {
      v: 1,
      completed: [
        { lessonId: lesson.id, version: 1, profileId: lesson.profileId, at: 1 },
      ],
      active: {},
      attempts: [
        {
          id: "one",
          questionId: lesson.questions[0]!.id,
          profileId: lesson.profileId,
          contentVersion: 1,
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
});

describe("Taiwanese course compatibility", () => {
  it("has original five-set lessons and checked, profile-bound questions", () => {
    validateVariantContent();
    const lessons = VARIANT_LESSONS.filter((l) => l.variant === "taiwanese");
    expect(lessons).toHaveLength(10);
    expect(
      lessons
        .flatMap((l) => l.paragraphs)
        .join(" ")
        .split(/\s+/).length,
    ).toBeGreaterThan(1800);
    expect(lessons.flatMap((l) => l.questions)).toHaveLength(20);
    expect(
      lessons.every(
        (l) => l.profileId === "openmahjong-taiwanese-every-flower",
      ),
    ).toBe(true);
  });
});
