// @vitest-environment jsdom
/**
 * Tutorial tests (slice-2 brief §9, acceptance B9/B10):
 *
 * - B9: every module completes start-to-finish through its real
 *   interactions — the driver below plays each LessonController the
 *   way the UI does, using only what the view exposes (buttons,
 *   drills, choices, hand tiles, the scene's public stop).
 * - TU-11 completes through the real App: a full guided game against
 *   the CPU, driven by the CPU policy's own answers (the human seat
 *   played by the same brain the coach opens up).
 * - B10: the new-player path in the DOM — landing → Learn → TU-1 →
 *   completion → a real game, no account anywhere.
 * - The TU-7 example hands are verified against the engine's scorer:
 *   the yaku the lesson names is the yaku the hand actually has.
 * - The guided overlay's zero-overlap evidence: structural (it is an
 *   absolutely-positioned sibling layer of #table, never inside the
 *   player zone) plus the CSS arithmetic against the worst-case
 *   stack (Large Tiles two-row hand + prompt row + hand controls).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scoreHand, type TileType } from "@openmahjong/engine";
import { createAiPolicy } from "@openmahjong/ai";
import { App } from "../src/app.js";
import {
  LessonController,
  MODULES,
  loadTutorialProgress,
  mergeProgress,
  type ModuleId,
} from "../src/tutorial.js";

// ---------------------------------------------------------------------------
// B9 driver: play a controller the way the UI does.
// ---------------------------------------------------------------------------

function driveToDone(id: ModuleId): LessonController {
  const c = new LessonController(id);
  let lastStep = -1;
  const triedChoices = new Set<number>();
  const triedCells = new Set<number>();
  for (let iter = 0; iter < 800 && !c.done; iter++) {
    const view = c.view();
    if (view.stepIndex !== lastStep) {
      lastStep = view.stepIndex;
      triedChoices.clear();
      triedCells.clear();
    }
    const actionBtn = view.buttons.find(
      (b) =>
        ["tsumo", "ron", "pon", "kan"].includes(b.id) || b.id.startsWith("chi:"),
    );
    if (actionBtn) {
      c.handle({ kind: "button", id: actionBtn.id });
      continue;
    }
    if (view.drill) {
      const idx = view.drill.tiles.findIndex(
        (_, i) => !triedCells.has(i) && !view.drill!.found.includes(i),
      );
      if (idx >= 0) {
        triedCells.add(idx);
        c.handle({ kind: "drill", index: idx });
        continue;
      }
    }
    if (view.choices) {
      const idx = view.choices.findIndex((_, i) => !triedChoices.has(i));
      if (idx >= 0) {
        triedChoices.add(idx);
        c.handle({ kind: "choice", index: idx });
        continue;
      }
    }
    if (view.acceptsTiles) {
      const stop = c.scene?.stop;
      if (stop?.kind === "turn") {
        let tileId: number | undefined;
        if (view.highlightRiichi) {
          tileId = stop.ctx.riichiDiscardIds[0];
        } else if (id === "tu9") {
          const threat = stop.view.players.find((p) => p.seat !== 0 && p.riichi);
          const pond = new Set(threat?.discards.map((d) => d.tile.type));
          tileId = stop.view.hand.find((t) => pond.has(t.type))?.id;
        } else {
          tileId = stop.view.hand[0]?.id;
        }
        if (tileId !== undefined) {
          c.handle({ kind: "tile", tileId });
          continue;
        }
      }
    }
    const cont = view.buttons.find((b) => b.id === "continue");
    if (cont) {
      c.handle({ kind: "button", id: "continue" });
      continue;
    }
    throw new Error(`driver stuck on ${id} at step ${view.stepIndex}`);
  }
  return c;
}

describe("B9: scripted completion path per module", () => {
  for (const mod of MODULES) {
    if (mod.id === "tu11") continue; // driven through the App below
    it(`${mod.id} (${mod.title}) completes through its real interactions`, { timeout: 60_000 }, () => {
      const c = driveToDone(mod.id);
      expect(c.done).toBe(true);
    });
  }

  it("a wrong drill tap or choice never advances the lesson", () => {
    const c = new LessonController("tu1");
    c.handle({ kind: "button", id: "continue" });
    c.handle({ kind: "button", id: "continue" });
    const before = c.view();
    expect(before.drill).not.toBeNull();
    // Index 0 of the dots drill is a characters tile — a wrong tap.
    c.handle({ kind: "drill", index: 0 });
    expect(c.view().stepIndex).toBe(before.stepIndex);
    expect(c.view().note).toBeTruthy();
  });

  it("progress serializes and restores mid-lesson", () => {
    const c = new LessonController("tu3");
    c.handle({ kind: "button", id: "continue" });
    const stop = c.scene?.stop;
    expect(stop?.kind).toBe("turn");
    if (stop?.kind === "turn") {
      c.handle({ kind: "tile", tileId: stop.view.hand[0]!.id });
    }
    const saved = c.serialize();
    const restored = new LessonController("tu3", saved);
    expect(restored.stepIndex).toBe(c.stepIndex);
    expect(restored.scene?.decisions.length).toBe(c.scene?.decisions.length);
    expect(restored.scene?.stop?.kind).toBe(c.scene?.stop?.kind);
  });

  it("lesson scenes are deterministic from their seeds", () => {
    const a = new LessonController("tu5");
    const b = new LessonController("tu5");
    expect(a.scene?.events.length).toBe(b.scene?.events.length);
    expect(a.scene?.stop?.kind).toBe(b.scene?.stop?.kind);
  });
});

// ---------------------------------------------------------------------------
// TU-7: the example hands carry the yaku the lesson names.
// ---------------------------------------------------------------------------

function countsOf(types: readonly number[]): number[] {
  const counts = new Array<number>(34).fill(0);
  for (const t of types) counts[t]!++;
  return counts;
}

function yakuIds(
  types: readonly number[],
  opts: { riichi?: boolean; winType?: "ron" | "tsumo" } = {},
): string[] {
  // Try every tile in the hand as the winning tile; the hand carries
  // the yaku if any legal completion scores it.
  const ids = new Set<string>();
  for (const t of new Set(types)) {
    try {
      const result = scoreHand({
        handCounts: countsOf(types),
        melds: [],
        winningTileType: t as TileType,
        winType: opts.winType ?? "ron",
        seatWind: 27,
        roundWind: 27,
        riichi: opts.riichi ?? false,
        dora: 0,
        honba: 0,
        riichiSticks: 0,
      });
      for (const y of result.yaku) ids.add(y.id);
    } catch {
      // Not every tile in the hand is a legal winning tile.
    }
  }
  return [...ids];
}

describe("TU-7 example hands verified against the scorer", () => {
  it("riichi example: a closed ready hand whose declaration is the yaku", () => {
    const ids = yakuIds([1, 2, 3, 12, 13, 14, 23, 24, 25, 26, 26, 13, 13, 26], {
      riichi: true,
    });
    expect(ids).toContain("riichi");
  });
  it("tanyao example is all simples", () => {
    const ids = yakuIds([2, 3, 4, 12, 13, 14, 21, 22, 23, 20, 20, 20, 5, 5]);
    expect(ids).toContain("tanyao");
  });
  it("yakuhai example has the dragon triplet", () => {
    const ids = yakuIds([33, 33, 33, 1, 2, 3, 12, 13, 14, 23, 24, 25, 13, 13]);
    expect(ids.some((id) => id.startsWith("yakuhai"))).toBe(true);
  });
  it("pinfu example scores pinfu on a two-sided completion", () => {
    const ids = yakuIds([1, 2, 3, 12, 13, 14, 21, 22, 23, 24, 25, 26, 19, 19]);
    expect(ids).toContain("pinfu");
  });
  it("toitoi example is four triplets", () => {
    const ids = yakuIds([2, 2, 2, 13, 13, 13, 22, 22, 22, 31, 31, 31, 7, 7]);
    expect(ids).toContain("toitoi");
  });
  it("chiitoitsu example is seven pairs", () => {
    const ids = yakuIds([1, 1, 4, 4, 11, 11, 15, 15, 20, 20, 24, 24, 28, 28]);
    expect(ids).toContain("chiitoitsu");
  });
});

// ---------------------------------------------------------------------------
// Progress merge (local + account union)
// ---------------------------------------------------------------------------

describe("tutorial progress", () => {
  beforeEach(() => localStorage.clear());
  it("mergeProgress unions completions and keeps an active lesson", () => {
    const merged = mergeProgress(
      { done: ["tu1"], active: null },
      {
        done: ["tu2"],
        active: { module: "tu3", step: 1, scene: null, counters: {}, found: [] },
      },
    );
    expect(merged.done).toEqual(expect.arrayContaining(["tu1", "tu2"]));
    expect(merged.active?.module).toBe("tu3");
  });
});

// ---------------------------------------------------------------------------
// App-level: B10 path, TU-11, guided overlay.
// ---------------------------------------------------------------------------

async function settle(times = 10): Promise<void> {
  for (let i = 0; i < times; i++) await new Promise((r) => setTimeout(r, 0));
}

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

function click(el: Element | null | undefined): void {
  if (!el) throw new Error("click target missing");
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}

describe("B10: the new-player path, no account", () => {
  it("landing → Learn → TU-1 → completion → a real game", async () => {
    // Reduced motion collapses playback delays to zero, so the real
    // game below settles within the test's tick budget.
    localStorage.setItem(
      "openmahjong.settings.v1",
      JSON.stringify({ sound: false, motion: "reduced", largeTiles: false, lastLength: "east", guided: false }),
    );
    new App(root);
    await settle();
    // Landing: Learn is offered to a guest — the theme-v6 Learn card.
    const learnBtn = root.querySelector('.tabbtn[data-tab="learn"]');
    expect(learnBtn).not.toBeNull();
    click(learnBtn);
    await settle();
    expect(root.querySelector("#screen-learn")?.classList.contains("active")).toBe(true);
    const rows = root.querySelectorAll("#screen-learn .lrow");
    expect(rows.length).toBe(11);
    click(rows[0]);
    await settle();
    expect(root.querySelector("#screen-table")?.classList.contains("active")).toBe(true);
    // Play TU-1 in the DOM: Continue buttons and drill cells, the
    // same elements a player touches.
    const triedByStep = new Map<string, Set<number>>();
    for (let iter = 0; iter < 300; iter++) {
      if (root.querySelector("#table .revwrap h2")) break; // completion panel
      const cont = root.querySelector<HTMLElement>("#table .revctl .pillbtn.primary");
      if (cont) {
        click(cont);
        continue;
      }
      const stepLabel = root.querySelector("#table .revctl .step")?.textContent ?? "";
      const tried = triedByStep.get(stepLabel) ?? new Set<number>();
      triedByStep.set(stepLabel, tried);
      const cells = [...root.querySelectorAll<HTMLElement>("#table .dgrid .cell")];
      const idx = cells.findIndex((el, i) => !tried.has(i) && !el.classList.contains("sel"));
      if (idx >= 0) {
        tried.add(idx);
        click(cells[idx]);
        continue;
      }
      throw new Error("B10 driver stuck in TU-1");
    }
    expect(root.querySelector("#table .revwrap")?.textContent).toContain("LESSON COMPLETE");
    expect(loadTutorialProgress().done).toContain("tu1");
    // Back to the index: TU-1 reads Done.
    click([...root.querySelectorAll("#table .revctl .pillbtn")].find((b) => b.textContent === "All lessons"));
    await settle();
    expect(root.querySelector("#screen-learn")?.classList.contains("active")).toBe(true);
    expect(root.querySelectorAll("#screen-learn .lrow")[0]?.textContent).toContain("Done");
    // And a real game starts from the landing, still no account.
    // Learn is a tab root in the shell: the Play tab is the way back.
    click(root.querySelector('.tabbtn[data-tab="home"]'));
    await settle();
    click(root.querySelector("#screen-home .play"));
    await settle();
    expect(root.querySelector("#screen-table")?.classList.contains("active")).toBe(true);
    expect(root.querySelectorAll("#table .handrow .twrap").length).toBeGreaterThanOrEqual(13);
  });
});

describe("TU-11 and the guided overlay", () => {
  it("TU-11 plays a full guided game and completes the module", { timeout: 180_000 }, async () => {
    localStorage.setItem(
      "openmahjong.settings.v1",
      JSON.stringify({ sound: false, motion: "reduced", largeTiles: false, lastLength: "east", guided: false }),
    );
    const app = new App(root) as unknown as {
      startTu11(): void;
      runner: {
        pending: { kind: string; view: never; ctx: never } | null;
        result: unknown;
      } | null;
      humanAct(a: unknown): void;
    };
    await settle();
    app.startTu11();
    const oracle = createAiPolicy();
    let sawHint = false;
    for (let iter = 0; iter < 4000; iter++) {
      await settle(2);
      const runner = app.runner;
      if (runner?.result) break;
      if (root.querySelector(".guidehint")) {
        sawHint = true;
        // Structural zero-overlap evidence: the overlay is a direct
        // child of #table, never inside the player zone it floats
        // above.
        const hint = root.querySelector(".guidehint")!;
        expect(hint.parentElement?.id).toBe("table");
        expect(root.querySelector(".zone-player .guidehint")).toBeNull();
      }
      // Hand-end breakdowns wait for their Continue button.
      const cont = root.querySelector<HTMLElement>(".overlay .card .pillbtn.primary");
      if (cont) {
        click(cont);
        continue;
      }
      const pending = runner?.pending as
        | { kind: "turn"; view: never; ctx: never }
        | { kind: "call"; view: never; ctx: never }
        | null;
      if (!pending) continue;
      const action =
        pending.kind === "turn"
          ? oracle.turn(pending.view, pending.ctx)
          : oracle.call(pending.view, pending.ctx);
      app.humanAct(action);
    }
    expect(app.runner?.result).not.toBeNull();
    expect(sawHint).toBe(true);
    expect(loadTutorialProgress().done).toContain("tu11");
  });

  it("the overlay's CSS clears the worst-case stack above the hand", () => {
    const css = readFileSync(resolve(process.cwd(), "packages/web/src/styles.css"), "utf8");
    const rule = css.match(/\.guidehint\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    const body = rule![1]!;
    expect(body).toContain("position: absolute");
    const bottom = Number(body.match(/bottom:\s*(\d+)px/)?.[1]);
    // Worst case stack from the table's bottom edge: padding 16 +
    // hand controls ~38 + Large Tiles two-row hand 86 (28px tiles at
    // 1.4 ratio, two rows + gap) + prompt row ~58 = 198px.
    expect(bottom).toBeGreaterThanOrEqual(198);
  });
});
