// @vitest-environment jsdom
/**
 * Lesson fix round (2026-11-17): the no-leak guard for riichi.
 *
 * The rebuild panel found riichi's signature residual: wrong-answer
 * feedback that prints the correct answer while the question is
 * still open (TU-7 twice, TU-9's safe-tile list after two misses,
 * TU-10). The variant runner cannot leak by construction; this test
 * gives the riichi tutorial the same guarantee by driving every
 * LessonController the way the UI does, deliberately answering
 * every check wrong first, and asserting the feedback shown while
 * the question is open never states the correct answer:
 *
 * - choice steps: the wrong-answer note must not contain the
 *   correct option's answer value — its number(s) when the label
 *   carries numbers ("3 han", "5,800 points from the discarder"),
 *   or its distinctive word(s) for name answers ("Yakuhai",
 *   "yaku", "scoring patterns");
 * - drill steps: the wrong-tap note must not name any target tile
 *   by its full tile name;
 * - TU-9's scene: after two wrong discards, the scene text and
 *   note must not name any tile that is safe to discard.
 *
 * Explanations shown AFTER a correct answer (correctNote, the
 * breakdown steps that follow a transfer check) are not feedback
 * while a question is open and are not audited here.
 *
 * The guard is non-vacuous: it asserts the known checks were all
 * visited (TU-7's three choices, TU-10's choice, TU-8's fifteen
 * choices, TU-9's scene), and it was demonstrated locally to fail
 * on a planted leak before this file was committed.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { tileName } from "@openmahjong/coach";
import type { TileType } from "@openmahjong/engine";
import {
  LessonController,
  MODULES,
  type LessonAction,
  type ModuleId,
} from "../src/tutorial.js";

// ---------------------------------------------------------------------------
// Step definitions, as the controller exposes them at runtime.
// ---------------------------------------------------------------------------

interface ChoiceStepLike {
  readonly kind: "choice";
  readonly options: readonly { readonly label: string; readonly tiles?: readonly number[] }[] |
    ((c: LessonController) => readonly { readonly label: string; readonly tiles?: readonly number[] }[]);
  readonly correct: number | ((c: LessonController) => number);
}
interface DrillStepLike {
  readonly kind: "drill";
  readonly tiles: readonly number[];
  readonly targets: readonly number[];
}
type StepLike = { readonly kind: string } & Partial<ChoiceStepLike> & Partial<DrillStepLike>;

interface CheckRecord {
  readonly module: ModuleId;
  readonly step: number;
  readonly kind: "choice" | "drill" | "scene";
  readonly correctLabel: string;
  readonly correctTypes: readonly number[];
  readonly wrongNotes: readonly string[];
}

// ---------------------------------------------------------------------------
// Collection: drive each lesson, answering wrong first.
// ---------------------------------------------------------------------------

function collect(id: ModuleId): CheckRecord[] {
  const c = new LessonController(id);
  const steps = c.steps as unknown as readonly StepLike[];
  const records: CheckRecord[] = [];
  const triedChoices = new Set<number>();
  const triedCells = new Set<number>();
  let lastStep = -1;
  let tu9Misses = 0;
  const act = (a: LessonAction) => c.handle(a);

  for (let iter = 0; iter < 1200 && !c.done; iter++) {
    const view = c.view();
    if (view.stepIndex !== lastStep) {
      lastStep = view.stepIndex;
      triedChoices.clear();
      triedCells.clear();
    }
    const step = steps[view.stepIndex];

    const actionBtn = view.buttons.find(
      (b) => ["tsumo", "ron", "pon", "kan"].includes(b.id) || b.id.startsWith("chi:"),
    );
    if (actionBtn) { act({ kind: "button", id: actionBtn.id }); continue; }

    if (view.drill && step?.kind === "drill") {
      const idx = view.drill.tiles.findIndex(
        (_, i) => !triedCells.has(i) && !view.drill!.found.includes(i),
      );
      if (idx >= 0) {
        triedCells.add(idx);
        const before = view.stepIndex;
        act({ kind: "drill", index: idx });
        if (c.view().stepIndex === before && c.view().note) {
          // A wrong tap: record this drill's feedback once.
          if (!records.some((r) => r.module === id && r.step === before)) {
            records.push({
              module: id, step: before, kind: "drill", correctLabel: "",
              correctTypes: (step.targets ?? []).map((t) => step.tiles![t]!),
              wrongNotes: [c.view().note!],
            });
          }
        }
        continue;
      }
    }

    if (view.choices && step?.kind === "choice") {
      const correct = typeof step.correct === "function" ? step.correct(c) : step.correct!;
      const options = view.choices;
      // Try every wrong option first, capturing the feedback shown
      // while the question is still open, then answer correctly.
      const wrongIdx = options.findIndex((_, i) => i !== correct && !triedChoices.has(i));
      if (wrongIdx >= 0) {
        triedChoices.add(wrongIdx);
        act({ kind: "choice", index: wrongIdx });
        const note = c.view().note;
        expect(note, `${id} step ${view.stepIndex}: wrong choice shows feedback`).toBeTruthy();
        const existing = records.find((r) => r.module === id && r.step === view.stepIndex);
        const entry: CheckRecord = {
          module: id, step: view.stepIndex, kind: "choice",
          correctLabel: options[correct]!.label,
          correctTypes: options[correct]!.tiles ?? [],
          wrongNotes: [...(existing?.wrongNotes ?? []), note!],
        };
        if (existing) records[records.indexOf(existing)] = entry;
        else records.push(entry);
        continue;
      }
      act({ kind: "choice", index: correct });
      continue;
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
          if (tu9Misses < 2) {
            // Deliberately discard unsafe tiles, twice, and record
            // everything the scene shows while the question is open.
            const wrong = stop.view.hand.find((t) => !pond.has(t.type));
            if (wrong) {
              act({ kind: "tile", tileId: wrong.id });
              tu9Misses++;
              const safeTypes = [...new Set(stop.view.hand.map((t) => t.type))]
                .filter((ty) => pond.has(ty));
              records.push({
                module: id, step: view.stepIndex, kind: "scene", correctLabel: "",
                correctTypes: safeTypes,
                wrongNotes: [c.view().text, c.view().note ?? ""],
              });
              continue;
            }
          }
          tileId = stop.view.hand.find((t) => pond.has(t.type))?.id;
        } else {
          tileId = stop.view.hand[0]?.id;
        }
        if (tileId !== undefined) { act({ kind: "tile", tileId }); continue; }
      }
    }

    const cont = view.buttons.find((b) => b.id === "continue");
    if (cont) { act({ kind: "button", id: "continue" }); continue; }
    throw new Error(`leak-guard driver stuck on ${id} at step ${view.stepIndex}`);
  }
  expect(c.done).toBe(true);
  return records;
}

let records: CheckRecord[] = [];

beforeAll(() => {
  records = MODULES.flatMap((m) => (m.id === "tu11" ? [] : collect(m.id)));
}, 900_000);

// ---------------------------------------------------------------------------
// Answer-value extraction.
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  "tiles", "tile", "points", "point", "hand", "hands", "from", "each",
  "other", "that", "this", "with", "built", "does", "have", "only",
]);

function digitTokens(text: string): string[] {
  return (text.replace(/,/g, "").match(/\d+/g) ?? []).map((d) => String(Number(d)));
}

function wordTokens(label: string): string[] {
  return label
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}

// ---------------------------------------------------------------------------
// The guard.
// ---------------------------------------------------------------------------

describe("no-leak guard: wrong-answer feedback never states the answer", () => {
  it("visited every known check (the guard is not vacuous)", () => {
    const choicesOf = (m: ModuleId) => records.filter((r) => r.module === m && r.kind === "choice");
    expect(choicesOf("tu2").length).toBe(2);
    expect(choicesOf("tu7").length).toBe(3);
    expect(choicesOf("tu8").length).toBe(15);
    expect(choicesOf("tu10").length).toBe(1);
    expect(records.filter((r) => r.module === "tu9" && r.kind === "scene").length).toBe(2);
    expect(records.filter((r) => r.kind === "drill").length).toBeGreaterThanOrEqual(15);
  });

  it("choice feedback contains none of the correct answer's values", () => {
    for (const r of records.filter((x) => x.kind === "choice")) {
      const digits = digitTokens(r.correctLabel);
      const words = digits.length > 0 ? [] : wordTokens(r.correctLabel);
      expect(
        digits.length + words.length,
        `${r.module} step ${r.step}: correct label "${r.correctLabel}" yields an answer value to guard`,
      ).toBeGreaterThan(0);
      for (const note of r.wrongNotes) {
        for (const d of digits) {
          expect(
            digitTokens(note),
            `${r.module} step ${r.step}: feedback leaks the answer number ${d} of "${r.correctLabel}": ${note}`,
          ).not.toContain(d);
        }
        for (const w of words) {
          expect(
            note.toLowerCase(),
            `${r.module} step ${r.step}: feedback leaks the answer word "${w}" of "${r.correctLabel}": ${note}`,
          ).not.toContain(w);
        }
      }
    }
  });

  it("drill feedback never names a target tile in full", () => {
    for (const r of records.filter((x) => x.kind === "drill")) {
      for (const ty of r.correctTypes) {
        const name = tileName(ty as TileType);
        for (const note of r.wrongNotes) {
          expect(
            note,
            `${r.module} step ${r.step}: drill feedback names its target "${name}": ${note}`,
          ).not.toContain(name);
        }
      }
    }
  });

  it("TU-9's scene names no safe tile after misses, at any attempt count", () => {
    const sceneRecords = records.filter((r) => r.module === "tu9" && r.kind === "scene");
    expect(sceneRecords.length).toBe(2);
    for (const r of sceneRecords) {
      const [text, note] = r.wrongNotes;
      expect(text).not.toMatch(/safe in your hand/i);
      for (const ty of r.correctTypes) {
        const name = tileName(ty as TileType);
        expect(text, `TU-9 scene text names safe tile "${name}" after a miss: ${text}`).not.toContain(name);
        expect(note, `TU-9 note names safe tile "${name}" after a miss: ${note}`).not.toContain(name);
      }
    }
  });
});
