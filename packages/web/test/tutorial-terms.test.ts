// @vitest-environment jsdom
/**
 * Tutorial rebuild (brief v1, 2026-11-16) acceptance A1–A3.
 *
 * The lessons are written for a player who has never seen a mahjong
 * tile. These tests audit the actual player-visible text of every
 * lesson — step text, notes, button labels, choice labels, lesson
 * titles — collected by driving each LessonController the way the
 * UI does (the B9 driver shape from tutorial.test.ts):
 *
 * - A1 (term order): for every audited term, its first occurrence
 *   in lesson order is its teaching step — the step that defines it
 *   in plain words. A term may never appear earlier.
 * - A2 (show before ask): the verified cold-play failure points —
 *   drills that tested recognition before teaching it, "dora"
 *   dropped into TU-1, "yaku"/"kan" used in TU-2 lessons before
 *   they are taught, TU-4's unexplained Chi buttons.
 * - A3 (scene openers): every scene's opening text states what is
 *   about to happen, what to tap, and why, before the gate waits.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  LessonController,
  MODULES,
  type LessonAction,
  type ModuleId,
} from "../src/tutorial.js";

// ---------------------------------------------------------------------------
// Collection: every player-visible string, in lesson order.
// ---------------------------------------------------------------------------

interface CollectedStep {
  readonly module: ModuleId;
  readonly step: number;
  /** All strings shown at this step; index 1 of the first record is
   * the step's opening text (index 0 is the lesson title). */
  readonly texts: readonly string[];
}

const MODULE_ORDER = new Map(MODULES.map((m, i) => [m.id, i]));

function collect(id: ModuleId): CollectedStep[] {
  const c = new LessonController(id);
  const byStep = new Map<number, string[]>();
  const record = () => {
    const view = c.view();
    const arr = byStep.get(view.stepIndex) ?? [];
    arr.push(view.lab, view.text);
    if (view.note) arr.push(view.note);
    for (const b of view.buttons) arr.push(b.label);
    for (const ch of view.choices ?? []) arr.push(ch.label);
    byStep.set(view.stepIndex, arr);
  };
  const act = (a: LessonAction) => {
    c.handle(a);
    record();
  };
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
    record();
    const actionBtn = view.buttons.find(
      (b) =>
        ["tsumo", "ron", "pon", "kan"].includes(b.id) || b.id.startsWith("chi:"),
    );
    if (actionBtn) {
      act({ kind: "button", id: actionBtn.id });
      continue;
    }
    if (view.drill) {
      const idx = view.drill.tiles.findIndex(
        (_, i) => !triedCells.has(i) && !view.drill!.found.includes(i),
      );
      if (idx >= 0) {
        triedCells.add(idx);
        act({ kind: "drill", index: idx });
        continue;
      }
    }
    if (view.choices) {
      const idx = view.choices.findIndex((_, i) => !triedChoices.has(i));
      if (idx >= 0) {
        triedChoices.add(idx);
        act({ kind: "choice", index: idx });
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
          act({ kind: "tile", tileId });
          continue;
        }
      }
    }
    const cont = view.buttons.find((b) => b.id === "continue");
    if (cont) {
      act({ kind: "button", id: "continue" });
      continue;
    }
    throw new Error(`audit driver stuck on ${id} at step ${view.stepIndex}`);
  }
  expect(c.done).toBe(true);
  return [...byStep.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([step, texts]) => ({ module: id, step, texts }));
}

let collected: CollectedStep[] = [];

beforeAll(() => {
  collected = MODULES.flatMap((m) => (m.id === "tu11" ? [] : collect(m.id)));
}, 900_000);

function textsAt(module: ModuleId, step: number): string {
  const entry = collected.find((e) => e.module === module && e.step === step);
  expect(entry, `${module} step ${step} was visited`).toBeDefined();
  return entry!.texts.join("\n");
}

function openingText(module: ModuleId, step: number): string {
  const entry = collected.find((e) => e.module === module && e.step === step);
  expect(entry, `${module} step ${step} was visited`).toBeDefined();
  return entry!.texts[1] ?? "";
}

function position(module: ModuleId, step: number): number {
  return MODULE_ORDER.get(module)! * 1000 + step;
}

// ---------------------------------------------------------------------------
// A1: term order.
// ---------------------------------------------------------------------------

const TERMS: readonly {
  readonly term: string;
  readonly pattern: RegExp;
  readonly module: ModuleId;
  readonly step: number;
}[] = [
  { term: "dots", pattern: /\bdots\b/i, module: "tu1", step: 0 },
  { term: "suit", pattern: /\bsuits?\b/i, module: "tu1", step: 1 },
  { term: "bamboo", pattern: /\bbamboo\b/i, module: "tu1", step: 3 },
  { term: "characters", pattern: /\bcharacters\b/i, module: "tu1", step: 5 },
  { term: "honor", pattern: /\bhonors?\b/i, module: "tu1", step: 7 },
  { term: "terminal", pattern: /\bterminals?\b/i, module: "tu1", step: 10 },
  { term: "simple", pattern: /\bsimples?\b/i, module: "tu1", step: 11 },
  { term: "set", pattern: /\bsets?\b/i, module: "tu2", step: 1 },
  { term: "sequence", pattern: /\bsequences?\b/i, module: "tu2", step: 1 },
  { term: "triplet", pattern: /\btriplets?\b/i, module: "tu2", step: 2 },
  { term: "pair", pattern: /\bpairs?\b/i, module: "tu2", step: 3 },
  { term: "draw", pattern: /\bdraw(s|n|ing)?\b/i, module: "tu3", step: 0 },
  { term: "discard", pattern: /\bdiscard(s|ed|ing)?\b/i, module: "tu3", step: 0 },
  { term: "pond", pattern: /\bponds?\b/i, module: "tu3", step: 2 },
  { term: "call", pattern: /\bcall(s|ed|ing)?\b/i, module: "tu4", step: 0 },
  { term: "chi", pattern: /\bchi\b/i, module: "tu4", step: 1 },
  { term: "pon", pattern: /\bpon\b/i, module: "tu4", step: 3 },
  { term: "kan", pattern: /\bkans?\b/i, module: "tu4", step: 5 },
  { term: "dora", pattern: /\bdora\b/i, module: "tu4", step: 7 },
  { term: "tenpai", pattern: /\btenpai\b/i, module: "tu5", step: 0 },
  { term: "furiten", pattern: /\bfuriten\b/i, module: "tu5", step: 4 },
  { term: "riichi", pattern: /\briichi\b/i, module: "tu6", step: 0 },
  { term: "yaku", pattern: /\byaku\b/i, module: "tu7", step: 0 },
  { term: "dealer", pattern: /\bdealers?\b/i, module: "tu8", step: 5 },
  { term: "honba", pattern: /\bhonba\b/i, module: "tu8", step: 6 },
];

describe("A1: no term is used before the step that teaches it", () => {
  for (const { term, pattern, module, step } of TERMS) {
    it(`"${term}" is first used at its teaching step (${module} step ${step})`, () => {
      const taughtAt = position(module, step);
      // The teaching step itself uses the term — it defines it there.
      expect(
        pattern.test(textsAt(module, step)),
        `"${term}" should appear in its teaching step`,
      ).toBe(true);
      // And no earlier step, in any earlier or the same lesson, uses it.
      for (const entry of collected) {
        if (position(entry.module, entry.step) >= taughtAt) continue;
        const hit = entry.texts.find((t) => pattern.test(t));
        expect(
          hit,
          `"${term}" used at ${entry.module} step ${entry.step}, before its teaching step ${module} step ${step}: ${hit}`,
        ).toBeUndefined();
      }
    });
  }
});

// ---------------------------------------------------------------------------
// A2: the verified cold-play failure points stay fixed.
// ---------------------------------------------------------------------------

describe("A2: nothing is asked before it has been shown and named", () => {
  it("TU-1 shows one tile and names the dots suit before the first drill", () => {
    expect(textsAt("tu1", 0)).toContain("5 of dots");
    expect(textsAt("tu1", 1)).toContain("counting its circles");
    // The first drill (step 2) asks only for what steps 0–1 taught.
    expect(openingText("tu1", 2)).toContain("dots tile");
  });

  it("TU-1 teaches how to read each suit before drilling it", () => {
    expect(textsAt("tu1", 3)).toContain("counting its green sticks");
    expect(textsAt("tu1", 3)).toContain("bird");
    expect(textsAt("tu1", 5)).toContain("two-part face");
    expect(textsAt("tu1", 5)).toContain("the dark character on top is the number");
  });

  it("TU-1 never drops the word dora", () => {
    for (const entry of collected.filter((e) => e.module === "tu1")) {
      expect(entry.texts.join("\n")).not.toMatch(/\bdora\b/i);
    }
  });

  it("TU-2 never uses yaku or kan (both are taught later)", () => {
    for (const entry of collected.filter((e) => e.module === "tu2")) {
      const all = entry.texts.join("\n");
      expect(all).not.toMatch(/\byaku\b/i);
      expect(all).not.toMatch(/\bkans?\b/i);
    }
  });

  it("TU-4 defines a call, then chi and the left-hand rule, before the chi scene", () => {
    expect(textsAt("tu4", 0)).toContain("Claiming a discard is a call");
    expect(textsAt("tu4", 1)).toContain("The first call is chi");
    expect(textsAt("tu4", 1)).toContain("player on your left");
    expect(openingText("tu4", 2)).toContain("Tap Chi");
  });

  it("TU-5 names tenpai and waits before its scenes, and furiten before the ron scene", () => {
    expect(textsAt("tu5", 0)).toContain("tenpai");
    expect(textsAt("tu5", 0)).toContain("waits");
    expect(textsAt("tu5", 4)).toContain("furiten");
    expect(openingText("tu5", 5)).toContain("Tap Ron");
  });

  it("TU-7 defines yaku as a scoring pattern in its first step", () => {
    expect(textsAt("tu7", 0)).toContain("yaku — a scoring pattern");
  });
});

// ---------------------------------------------------------------------------
// A3: every scene's opening text says what happens, what to tap, why.
// ---------------------------------------------------------------------------

describe("A3: scene openers state what happens, what to tap, and why", () => {
  it("TU-3's scene opens with the tap, the discard, and the goal", () => {
    const text = openingText("tu3", 1);
    expect(text).toContain("tap any tile in your hand to discard it");
    expect(text).toContain("Make six discards");
  });

  it("TU-4's scenes name the discard and the button to tap", () => {
    expect(openingText("tu4", 2)).toMatch(/The player on your left has discarded the .+\. It completes a sequence/);
    expect(openingText("tu4", 2)).toContain("Tap Chi");
    expect(openingText("tu4", 4)).toContain("Tap Pon");
    expect(openingText("tu4", 4)).toContain("you hold two copies");
    expect(openingText("tu4", 6)).toContain("Tap Kan");
    expect(openingText("tu4", 6)).toContain("you hold the other three copies");
  });

  it("TU-5's scenes name the win and the button to tap", () => {
    expect(openingText("tu5", 2)).toContain("Tap Tsumo");
    expect(openingText("tu5", 5)).toContain("Tap Ron");
  });

  it("TU-6's scene explains the tap declares riichi and pays the stake", () => {
    const text = openingText("tu6", 1);
    expect(text).toContain("Tap one of the marked tiles");
    expect(text).toContain("declares riichi");
    expect(text).toContain("1,000-point stake is paid");
  });

  it("TU-8's scene names the tap and says to watch what the win pays", () => {
    const text = openingText("tu8", 1);
    expect(text).toContain("Tap Tsumo");
    expect(text).toContain("watch what it pays");
  });

  it("TU-9's scene names the threat and the safe discards to use", () => {
    const text = openingText("tu9", 1);
    expect(text).toMatch(/has declared riichi, so .+'s hand is tenpai/);
    expect(text).toContain("Discard a tile from");
    expect(text).toContain("safe against");
  });
});
