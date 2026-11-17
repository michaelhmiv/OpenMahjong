// @vitest-environment jsdom
/**
 * Tutorial Back navigation (Michael, 2026-11-16: lessons only
 * offered Continue — "make sure i can go back if needed").
 *
 * - Back restores the previous step's exact entry state: panel
 *   drills come back un-answered; scene steps replay the scene to
 *   the decision log as it stood when the step was entered.
 * - Redoing a step after going back REPLACES its decisions in the
 *   saved log — the serialized progress after a back + redo is
 *   byte-identical to the first pass, stays valid under
 *   parseProgress, and never grows toward the 512-decision cap.
 * - Back is inert on a lesson's first step and after completion.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/app.js";
import {
  LessonController,
  loadTutorialProgress,
  parseProgress,
} from "../src/tutorial.js";

function back(c: LessonController): void {
  c.handle({ kind: "button", id: "back" });
}

describe("Back navigation in the lesson runner", () => {
  it("is inert on the first step of panel and scene lessons", () => {
    for (const id of ["tu1", "tu3"] as const) {
      const c = new LessonController(id);
      const before = c.view();
      expect(before.canBack).toBe(false);
      expect(before.buttons.some((b) => b.id === "back")).toBe(false);
      back(c);
      c.handle({ kind: "back" });
      expect(c.stepIndex).toBe(0);
      expect(c.view().text).toBe(before.text);
    }
  });

  it("panel drill round-trip: back restores the drill un-answered, forward reproduces it", () => {
    const c = new LessonController("tu1");
    c.handle({ kind: "button", id: "continue" });
    c.handle({ kind: "button", id: "continue" });
    expect(c.stepIndex).toBe(2);
    const first = c.view();
    expect(first.drill).not.toBeNull();
    expect(first.canBack).toBe(true);
    expect(first.buttons[0]).toMatchObject({ id: "back", label: "Back" });
    // Complete the dots drill (targets are the drill's own indices).
    for (const index of [2, 4, 6, 8, 9]) c.handle({ kind: "drill", index });
    expect(c.stepIndex).toBe(3);
    // Back: the drill returns exactly as first presented.
    back(c);
    expect(c.stepIndex).toBe(2);
    const restored = c.view();
    expect(restored.drill?.found).toEqual([]);
    expect(restored.drill?.tiles).toEqual(first.drill?.tiles);
    expect(restored.text).toBe(first.text);
    expect(restored.note).toBeNull();
    // Forward again reproduces the same next step.
    for (const index of [2, 4, 6, 8, 9]) c.handle({ kind: "drill", index });
    expect(c.stepIndex).toBe(3);
    // Two more backs reach the first step; a third is inert.
    back(c);
    back(c);
    expect(c.stepIndex).toBe(1);
    back(c);
    expect(c.stepIndex).toBe(0);
    expect(c.view().canBack).toBe(false);
    back(c);
    expect(c.stepIndex).toBe(0);
  });

  it("table scenario round-trip: back replays to the step's entry state and redo replaces, never appends", () => {
    const c = new LessonController("tu3");
    c.handle({ kind: "button", id: "continue" });
    expect(c.stepIndex).toBe(1);
    const entryDecisions = c.scene!.decisions.length;
    const entryEvents = c.scene!.events.length;
    expect(c.scene!.stop?.kind).toBe("turn");
    // Play the scene step, recording the tiles chosen.
    const chosen: number[] = [];
    for (let guard = 0; guard < 40 && c.stepIndex === 1; guard++) {
      const stop = c.scene!.stop;
      expect(stop?.kind).toBe("turn");
      if (stop?.kind !== "turn") break;
      const tileId = stop.view.hand[0]!.id;
      chosen.push(tileId);
      c.handle({ kind: "tile", tileId });
    }
    expect(c.stepIndex).toBe(2);
    const firstPass = JSON.stringify(c.serialize());
    const firstDecisions = c.scene!.decisions.length;
    expect(firstDecisions).toBeGreaterThan(entryDecisions);
    // Back: the scene is exactly where the step began.
    back(c);
    expect(c.stepIndex).toBe(1);
    expect(c.scene!.decisions.length).toBe(entryDecisions);
    expect(c.scene!.events.length).toBe(entryEvents);
    expect(c.scene!.stop?.kind).toBe("turn");
    // Redo with the same tiles: the saved log is identical to the
    // first pass — replaced, not appended.
    for (const tileId of chosen) c.handle({ kind: "tile", tileId });
    expect(c.stepIndex).toBe(2);
    expect(JSON.stringify(c.serialize())).toBe(firstPass);
    const parsed = parseProgress({ done: [], active: c.serialize() });
    expect(parsed.active).not.toBeNull();
    expect(parsed.active?.scene?.decisions.length).toBe(firstDecisions);
  });

  it("repeated back/forward cycles never grow the decision log toward the cap", { timeout: 120_000 }, () => {
    const c = new LessonController("tu3");
    c.handle({ kind: "button", id: "continue" });
    let decisions = 0;
    for (let cycle = 0; cycle < 20; cycle++) {
      const chosen: number[] = [];
      for (let guard = 0; guard < 40 && c.stepIndex === 1; guard++) {
        const stop = c.scene!.stop;
        if (stop?.kind !== "turn") break;
        const tileId = stop.view.hand[0]!.id;
        chosen.push(tileId);
        c.handle({ kind: "tile", tileId });
      }
      expect(c.stepIndex).toBe(2);
      if (cycle === 0) decisions = c.scene!.decisions.length;
      expect(c.scene!.decisions.length).toBe(decisions);
      expect(parseProgress({ done: [], active: c.serialize() }).active).not.toBeNull();
      back(c);
      expect(c.stepIndex).toBe(1);
    }
  });

  it("completion still lands exactly once, and Back is inert afterwards", () => {
    const c = new LessonController("tu2");
    // Detour: forward, back, forward again mid-lesson.
    c.handle({ kind: "button", id: "continue" });
    back(c);
    expect(c.stepIndex).toBe(0);
    c.handle({ kind: "button", id: "continue" });
    // Steps 1–4 are explanations, steps 5 and 6 are the two shape
    // questions (the correct answer is the first option in both),
    // and step 7 closes the lesson.
    for (let i = 0; i < 4; i++) c.handle({ kind: "button", id: "continue" });
    expect(c.stepIndex).toBe(5);
    c.handle({ kind: "choice", index: 0 });
    c.handle({ kind: "choice", index: 0 });
    c.handle({ kind: "button", id: "continue" });
    expect(c.done).toBe(true);
    expect(c.serialize().step).toBe(c.steps.length);
    back(c);
    expect(c.done).toBe(true);
    expect(c.stepIndex).toBe(c.steps.length);
    expect(c.view().canBack).toBe(false);
  });

  it("a lesson resumed from saved progress has no Back until it advances", () => {
    const c = new LessonController("tu1");
    c.handle({ kind: "button", id: "continue" });
    c.handle({ kind: "button", id: "continue" });
    const restored = new LessonController("tu1", c.serialize());
    expect(restored.stepIndex).toBe(2);
    // The pre-resume step-entry states were never recorded.
    expect(restored.view().canBack).toBe(false);
    back(restored);
    expect(restored.stepIndex).toBe(2);
    // After advancing, Back works from the newly recorded snapshot.
    for (const index of [2, 4, 6, 8, 9]) restored.handle({ kind: "drill", index });
    expect(restored.stepIndex).toBe(3);
    expect(restored.view().canBack).toBe(true);
    back(restored);
    expect(restored.stepIndex).toBe(2);
    expect(restored.view().drill?.found).toEqual([]);
  });

  it("TU-11 has no panel steps, so there is nothing to go back through", () => {
    const c = new LessonController("tu11");
    expect(c.steps.length).toBe(0);
    expect(c.done).toBe(true);
    expect(c.view().canBack).toBe(false);
    expect(c.view().buttons).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// DOM: the Back button renders in the lesson control row.
// ---------------------------------------------------------------------------

let root: HTMLElement;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
  root = document.createElement("div");
  document.body.append(root);
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

async function settle(times = 10): Promise<void> {
  for (let i = 0; i < times; i++) await new Promise((r) => setTimeout(r, 0));
}

function click(el: Element | null | undefined): void {
  if (!el) throw new Error("click target missing");
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}

describe("Back in the lesson DOM", () => {
  it("appears beside Continue from the second step and returns to the first", async () => {
    localStorage.setItem(
      "openmahjong.settings.v1",
      JSON.stringify({ sound: false, motion: "reduced", largeTiles: false, lastLength: "east", guided: false }),
    );
    new App(root);
    await settle();
    click(root.querySelector('.tabbtn[data-tab="learn"]'));
    await settle();
    click(root.querySelectorAll("#screen-learn .lrow")[0]);
    await settle();
    const ctlButtons = () =>
      [...root.querySelectorAll<HTMLElement>("#table .revctl .pillbtn")];
    // First step: Continue only, no Back.
    expect(ctlButtons().map((b) => b.textContent)).toEqual(["Leave", "Continue"]);
    click(ctlButtons().find((b) => b.textContent === "Continue"));
    await settle();
    expect(root.querySelector("#table .revctl .step")?.textContent).toContain("Step 2");
    const withBack = ctlButtons();
    const backBtn = withBack.find((b) => b.textContent === "Back");
    expect(backBtn).toBeDefined();
    // Back sits left of Continue in the same control row.
    expect(withBack.indexOf(backBtn!)).toBeLessThan(
      withBack.findIndex((b) => b.textContent === "Continue"),
    );
    click(backBtn);
    await settle();
    expect(root.querySelector("#table .revctl .step")?.textContent).toContain("Step 1");
    expect(loadTutorialProgress().active?.step).toBe(0);
  });
});
