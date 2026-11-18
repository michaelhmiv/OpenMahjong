// @vitest-environment jsdom
/**
 * Definition audit (Nov 17, 2026) — Taiwanese game surfaces.
 *
 * A player can land on a Taiwanese table or calculator before any
 * lesson, so every term on those surfaces must either be defined in
 * the Taiwanese lessons (guarded by lesson-audit-tw.test.ts) or be
 * glossed in place in plain words. These tests pin the in-place
 * glosses: no "Ting", no untaught pung/kong/chow labels on the
 * Taiwanese call prompts and calculator, no raw meld-kind codes
 * (chi/pon/ankan/…) shown as text, and plain-words circumstance
 * labels on the calculator.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import {
  TABLE_PRESETS,
  type ScoringSession,
} from "@openmahjong/engine";
import { mountVariantCalculator } from "../src/variant-calculator-ui.js";

let root: HTMLElement;
beforeEach(() => {
  document.body.replaceChildren();
  root = document.createElement("div");
  document.body.append(root);
});
function click(name: string) {
  const b = [...root.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent === name || b.getAttribute("aria-label") === name,
  );
  if (!b) throw new Error(name);
  b.click();
}
function fill(name: string, value: string) {
  const c = root.querySelector<HTMLInputElement | HTMLSelectElement>(
    `[aria-label="${name}"]`,
  )!;
  if (!c) throw new Error(name);
  c.value = value;
  c.dispatchEvent(new Event("input", { bubbles: true }));
  c.dispatchEvent(new Event("change", { bubbles: true }));
}

const taiSession: ScoringSession = {
  v: 1,
  id: "tai-surface",
  variant: "taiwanese",
  preset: "taiwanese-every-flower@1",
  names: ["A", "B", "C", "D"],
  startingScores: [1000, 1000, 1000, 1000],
  settings: TABLE_PRESETS["taiwanese-every-flower@1"].settings,
  revision: 0,
  updatedAt: "2026-11-17T00:00:00Z",
  finished: false,
  ledger: [],
};

describe("TW calculator surface vocabulary", () => {
  it("glosses the table rules in plain words, with no Ting or profile name", () => {
    mountVariantCalculator(root, {
      session: taiSession,
      renderTile: () => document.createElement("span"),
      onBack: () => {},
      onRecord: () => {},
    });
    expect(root.textContent).toContain(
      "You do not need to announce a ready hand before you may win",
    );
    expect(root.textContent).toContain(
      "Every flower earns one tai, whichever plant or season it is",
    );
    expect(root.textContent).not.toContain("Ting");
    expect(root.textContent).not.toContain("Every-flower");
  });

  it("labels meld kinds and circumstances in the lessons' plain words", () => {
    mountVariantCalculator(root, {
      session: taiSession,
      renderTile: () => document.createElement("span"),
      onBack: () => {},
      onRecord: () => {},
    });
    const kind = root.querySelector<HTMLSelectElement>(
      '[aria-label="Meld type"]',
    )!;
    const options = [...kind.options].map((o) => o.textContent);
    expect(options).toContain("Open sequence — a run of three in one suit");
    expect(options).toContain("Open triplet — three of a kind");
    expect(root.textContent).toContain("Win on the very first draw of the hand");
    expect(root.textContent).toContain(
      "Winning tile is the last copy that is not showing",
    );
    expect(root.textContent).toContain(
      "Win by drawing the last tile of the live wall",
    );
    expect(root.textContent).not.toContain("chow");
    expect(root.textContent).not.toContain("pung");
  });

  it("shows a declared meld under its plain name, never its raw kind code", () => {
    mountVariantCalculator(root, {
      session: taiSession,
      renderTile: () => document.createElement("span"),
      onBack: () => {},
      onRecord: () => {},
    });
    fill("Add tiles to", "meld");
    for (const t of ["1m", "2m", "3m"]) click(`Add ${t}`);
    click("Add declared meld");
    const row = root.querySelector(".tool-meld");
    expect(row?.textContent).toContain("Open sequence");
    expect(row?.textContent).not.toContain("chi");
  });
});

describe("TW table surface vocabulary (source guard)", () => {
  const table = readFileSync(
    resolve(process.cwd(), "packages/web/src/variant-table-ui.ts"),
    "utf8",
  );
  const calculator = readFileSync(
    resolve(process.cwd(), "packages/web/src/variant-calculator-ui.ts"),
    "utf8",
  );
  it("neither surface carries the untaught Ting label or the profile name", () => {
    for (const source of [table, calculator]) {
      expect(source).not.toContain("No Ting");
      expect(source).not.toContain("Every-flower");
    }
  });
  it("the Taiwanese call prompts gloss each claim in plain words", () => {
    expect(table).toContain("Triplet — claim for three of a kind");
    expect(table).toContain("Open quad — claim for four of a kind");
    expect(table).toContain("Sequence — claim for a run of three in one suit");
  });
  it("the Taiwanese centre dialog and passed-win status are plain words", () => {
    expect(table).toContain(
      "You do not need to announce a ready hand before you may win",
    );
    expect(table).toContain("tiles left to draw");
    expect(table).toContain("a passed win is standing against you");
  });
});
