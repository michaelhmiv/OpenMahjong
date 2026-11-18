// @vitest-environment jsdom
/**
 * American training — the lesson wiring, end to end.
 *
 * The card surfaces shipped the Learn section and a registration
 * seam with no content behind it; the lessons shipped as content
 * with no runner. This suite pins the reconciliation: the mounter
 * (american-lesson-ui.ts) runs a lesson through the shared variant
 * step-runner, pictured tiles resolve against the American
 * inventory, completion lands in the American progress store the
 * Learn section reads, and the completion screen offers no "Start
 * guided play" — there is no American game to start.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tile } from "@openmahjong/engine";
import {
  americanTileLabel,
  createAmericanLessonMounter,
} from "../src/american-lesson-ui.js";
import {
  AMERICAN_PROGRESS_KEY,
  readAmericanProgress,
} from "../src/education/american.js";
import { AMERICAN_LESSONS } from "../src/education/american-lessons.js";
import {
  variantLessonQuestions,
  type VariantLesson,
} from "../src/education/variant-content.js";
import { App } from "../src/app.js";

const renderTile = (tile: Tile): HTMLElement => {
  const s = document.createElement("span");
  s.className = "tile";
  s.dataset["type"] = String(tile.type);
  return s;
};

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

/** Play a mounted lesson to its completion screen, answering every
 *  check from the content's own answer key. */
async function driveLesson(
  container: HTMLElement,
  lesson: VariantLesson,
): Promise<void> {
  const questions = variantLessonQuestions(lesson);
  let qi = 0;
  for (let iter = 0; iter < 300; iter++) {
    await settle();
    const content = container.querySelector(".variant-education-content")!;
    if (content.querySelector("h2")?.textContent === "Lesson complete")
      return;
    const buttons = [...content.querySelectorAll<HTMLButtonElement>("button")];
    const cont = buttons.find((b) => b.textContent === "Continue");
    if (cont) {
      cont.click();
      continue;
    }
    const prompt = content.querySelector("h2")?.textContent;
    const q =
      questions.slice(qi).find((qq) => qq.prompt === prompt) ??
      questions[qi];
    if (!q || q.prompt !== prompt)
      throw new Error(`driver lost at prompt: ${prompt}`);
    if (q.kind === "tile-pick") {
      for (const p of q.picks) {
        const tiles = [
          ...content.querySelectorAll<HTMLButtonElement>(
            ".variant-tile-pick .variant-tile-choice",
          ),
        ];
        if (tiles[p]!.getAttribute("aria-pressed") !== "true") {
          tiles[p]!.click();
          await settle();
        }
      }
    } else {
      const choices = [
        ...content.querySelectorAll<HTMLButtonElement>(
          ".variant-answers button",
        ),
      ];
      choices[q.answer]!.click();
      await settle();
    }
    const check = [
      ...content.querySelectorAll<HTMLButtonElement>("button"),
    ].find((b) => b.textContent === "Check answer");
    if (!check || check.disabled)
      throw new Error(`no enabled Check answer for: ${prompt}`);
    check.click();
    await settle();
    const feedback =
      content.querySelector('[role="status"]')?.textContent ?? "";
    if (feedback.startsWith("Correct.")) qi = questions.indexOf(q) + 1;
  }
  throw new Error(`lesson ${lesson.id} did not complete`);
}

describe("american tile accessibility labels", () => {
  // Panel U19: the shared app label names the suits by material
  // (characters/circles/bamboo); the American track teaches Craks,
  // Dots and Bams, so its lesson tiles are labelled with the taught
  // names. Tile types: m = 0–8, p = 9–17, s = 18–26, winds 27–30,
  // dragons 31 (white), 32 (green), 33 (red).
  const tile = (type: number): Tile => ({ type }) as Tile;
  it("names suited tiles with the taught suit names", () => {
    expect(americanTileLabel(tile(6))).toBe("7 of Craks");
    expect(americanTileLabel(tile(13))).toBe("5 of Dots");
    expect(americanTileLabel(tile(20))).toBe("3 of Bams");
  });
  it("names honors in words", () => {
    expect(americanTileLabel(tile(27))).toBe("East wind");
    expect(americanTileLabel(tile(30))).toBe("North wind");
    expect(americanTileLabel(tile(31))).toBe("White dragon");
    expect(americanTileLabel(tile(32))).toBe("Green dragon");
    expect(americanTileLabel(tile(33))).toBe("Red dragon");
  });
});

describe("american lesson mounter", () => {
  let container: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
    container = document.createElement("div");
    document.body.append(container);
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it(
    "lesson 1 plays start to finish and records completion in the American store",
    { timeout: 60_000 },
    async () => {
      const lesson = AMERICAN_LESSONS.find((l) => l.id === "am-set")!;
      const ui = createAmericanLessonMounter(renderTile)(container, {
        lessonId: "am-set",
        onBack: () => {},
      });
      await settle();
      // Opening the lesson marks it in progress in the store.
      expect(readAmericanProgress().activeId).toBe("am-set");
      expect(readAmericanProgress().completed).toEqual([]);
      // The track label is the supplied display name, and the first
      // pictured row resolves against the American inventory.
      expect(
        container.querySelector(".variant-education-content .dim")
          ?.textContent,
      ).toBe("American");
      expect(
        container.querySelectorAll(".variant-example-tiles .tile").length,
      ).toBe(5);

      await driveLesson(container, lesson);

      const stored = JSON.parse(
        localStorage.getItem(AMERICAN_PROGRESS_KEY)!,
      ) as { completed: string[]; activeId?: string };
      expect(stored.completed).toEqual(["am-set"]);
      expect(stored.activeId).toBeUndefined();
      // Training only: the completion screen has no play to start.
      const labels = [...container.querySelectorAll("button")].map(
        (b) => b.textContent,
      );
      expect(labels).toContain("Back to Learn");
      expect(labels).not.toContain("Start guided play");
      ui.destroy();
    },
  );

  it(
    "the Charleston lesson plays start to finish on the same store",
    { timeout: 60_000 },
    async () => {
      const first = createAmericanLessonMounter(renderTile)(container, {
        lessonId: "am-set",
        onBack: () => {},
      });
      await driveLesson(
        container,
        AMERICAN_LESSONS.find((l) => l.id === "am-set")!,
      );
      first.destroy();
      container.replaceChildren();

      const charleston = AMERICAN_LESSONS.find(
        (l) => l.id === "am-charleston",
      )!;
      const ui = createAmericanLessonMounter(renderTile)(container, {
        lessonId: "am-charleston",
        onBack: () => {},
      });
      await settle();
      expect(readAmericanProgress().activeId).toBe("am-charleston");
      await driveLesson(container, charleston);
      // Completions accumulate in curriculum order.
      expect(readAmericanProgress().completed).toEqual([
        "am-set",
        "am-charleston",
      ]);
      ui.destroy();
    },
  );
});

describe("american lessons through the App", () => {
  let root: HTMLElement;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.append(root);
    (HTMLElement.prototype as unknown as { animate: unknown }).animate =
      () => ({
        finished: Promise.resolve(),
        cancel: () => {},
        play: () => {},
        pause: () => {},
      });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("tapping a lesson row opens the lesson; backing out shows it in progress", async () => {
    new App(root);
    await settle();
    root
      .querySelector<HTMLButtonElement>('.tabbtn[data-tab="learn"]')!
      .click();
    await settle();
    const section = [...root.querySelectorAll<HTMLElement>(".learnsec")].find(
      (w) => w.querySelector('[data-section="american"]'),
    )!;
    const row = [...section.querySelectorAll(".lrow")].find(
      (r) => r.querySelector(".ttl")?.textContent === "Meet the American set",
    )!;
    row.click();
    await settle();
    expect(root.querySelector(".screen.active")?.id).toBe(
      "screen-american-lesson",
    );
    const screen = root.querySelector("#screen-american-lesson")!;
    expect(screen.querySelector("h1")?.textContent).toBe(
      "Meet the American set",
    );
    expect(screen.textContent).toContain("Mahjong is a game for four players");
    expect(
      screen.querySelectorAll(".variant-example-tiles .tile").length,
    ).toBe(5);
    // Back returns to Learn, and the row now reads In progress.
    screen.querySelector<HTMLButtonElement>("header button")!.click();
    await settle();
    expect(root.querySelector(".screen.active")?.id).toBe("screen-learn");
    const sectionAfter = [
      ...root.querySelectorAll<HTMLElement>(".learnsec"),
    ].find((w) => w.querySelector('[data-section="american"]'))!;
    const rowAfter = [...sectionAfter.querySelectorAll(".lrow")].find(
      (r) => r.querySelector(".ttl")?.textContent === "Meet the American set",
    )!;
    expect(rowAfter.querySelector(".st")?.textContent).toBe("In progress");
  });
});
