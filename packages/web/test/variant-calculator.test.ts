// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  calculateDraft,
  DEFAULT_HK_SETTINGS,
  DEFAULT_TAIWANESE_SETTINGS,
  TABLE_PRESETS,
  type CalculationDraft,
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
}
const session: ScoringSession = {
  v: 1,
  id: "hk-table",
  variant: "hong-kong",
  preset: "hong-kong-clear@1",
  names: ["A", "B", "C", "D"],
  startingScores: [1000, 1000, 1000, 1000],
  settings: TABLE_PRESETS["hong-kong-clear@1"].settings,
  revision: 0,
  updatedAt: "2026-11-17T00:00:00Z",
  finished: false,
  ledger: [],
};
describe("Hong Kong calculator integration", () => {
  it("detects a two-fan tile arrangement, denies recording, and makes its corrected self-draw eligible", () => {
    const recorded: CalculationDraft[] = [];
    mountVariantCalculator(root, {
      session,
      renderTile: () => document.createElement("span"),
      onBack: () => {},
      onRecord: (d) => recorded.push(d),
    });
    for (const t of [
      "1m",
      "2m",
      "3m",
      "4m",
      "5m",
      "6m",
      "1p",
      "2p",
      "3p",
      "7s",
      "8s",
      "9s",
      "E",
      "E",
    ])
      click(`Add ${t}`);
    fill("Winning tile", "27");
    click("Calculate payments");
    expect(root.textContent).toContain("2 fan");
    expect(root.textContent).toContain("Below the table’s minimum");
    const confirm = root.querySelector<HTMLInputElement>(
      '[aria-label="I confirm the payment breakdown"]',
    )!;
    confirm.checked = true;
    confirm.dispatchEvent(new Event("change"));
    expect(
      [...root.querySelectorAll<HTMLButtonElement>("button")].find(
        (b) => b.textContent === "Confirm and add to table",
      )!.disabled,
    ).toBe(true);
    fill("Win type", "tsumo");
    click("Calculate payments");
    expect(root.textContent).toContain("B pays A 16 points");
    expect(root.textContent).toContain("3 fan");
    const yes = root.querySelector<HTMLInputElement>(
      '[aria-label="I confirm the payment breakdown"]',
    )!;
    yes.checked = true;
    yes.dispatchEvent(new Event("change"));
    click("Confirm and add to table");
    expect(recorded).toHaveLength(1);
    expect(calculateDraft(recorded[0]!).payments).toHaveLength(3);
  });
  it("supports fast fan, different sourced scales and separate manual facts before recording", () => {
    mountVariantCalculator(root, {
      session,
      renderTile: () => document.createElement("span"),
      onBack: () => {},
      onRecord: () => {},
    });
    click("Fast fan entry");
    fill("Fan · Scoring units", "5");
    click("Calculate payments");
    expect(root.textContent).toContain("B pays A 48 points");
    fill("Fan conversion", "full-spicy");
    click("Calculate payments");
    expect(root.textContent).toContain("B pays A 64 points");
    fill("Entered fan · Original 5", "6");
    fill("Reason for correction", "Corrected at the table");
    click("Apply corrections and recalculate");
    expect(root.textContent).toContain("6 fan");
    expect(root.textContent).toContain("B pays A 128 points");
    expect(root.textContent).toContain("Original 5");
    const draft: CalculationDraft = {
      input: {
        variant: "hong-kong",
        path: "fast",
        context: { winner: 0, dealer: 0, payer: 1, winType: "ron", honba: 0 },
        fan: 3,
        settings: DEFAULT_HK_SETTINGS,
      },
      corrections: [],
    };
    expect(calculateDraft(draft).payments.map((p) => p.amount)).toEqual([
      16, 8, 8,
    ]);
  });
});

describe("MCR calculator shared scorer", () => {
  const mcrSession: ScoringSession = {
    ...session,
    id: "mcr-table",
    variant: "mcr",
    preset: "mcr-2006@1",
    startingScores: [0, 0, 0, 0],
    settings: TABLE_PRESETS["mcr-2006@1"].settings,
  };
  it("requires eight before flowers, shows every payer and preserves corrections as separate facts", () => {
    const recorded: CalculationDraft[] = [];
    mountVariantCalculator(root, {
      session: mcrSession,
      renderTile: () => document.createElement("span"),
      onBack: () => {},
      onRecord: (d) => recorded.push(d),
    });
    click("Fast fan entry");
    fill("Fan excluding flowers", "6");
    fill("Number of flowers (0–8)", "3");
    click("Calculate payments");
    expect(root.textContent).toContain("Below the table");
    expect(root.textContent).toContain("6 fan excluding flowers");
    fill("Entered fan excluding flowers · Original 6", "8");
    fill("Reason for correction", "Added the omitted pattern");
    click("Apply corrections and recalculate");
    expect(root.textContent).toContain("B pays A 19 points");
    expect(root.textContent).toContain("C pays A 8 points");
    const yes = root.querySelector<HTMLInputElement>(
      '[aria-label="I confirm the payment breakdown"]',
    )!;
    yes.checked = true;
    yes.dispatchEvent(new Event("change"));
    click("Confirm and add to table");
    expect(recorded[0]!.input).toMatchObject({ fan: 6, flowers: 3 });
    expect(calculateDraft(recorded[0]!).qualifyingUnits).toBe(8);
  });
  it("automatically detects special structures from tiles and never imports Riichi bonus rules", () => {
    mountVariantCalculator(root, {
      session: mcrSession,
      renderTile: () => document.createElement("span"),
      onBack: () => {},
      onRecord: () => {},
    });
    for (const t of [
      "1m",
      "1m",
      "2m",
      "2m",
      "3m",
      "3m",
      "4m",
      "4m",
      "5m",
      "5m",
      "6m",
      "6m",
      "7m",
      "7m",
    ])
      click(`Add ${t}`);
    fill("Winning tile", "6");
    click("Calculate payments");
    expect(root.textContent).toContain("Seven Shifted Pairs");
    expect(root.textContent).toContain("88 fan excluding flowers");
    expect(root.textContent).toContain("B pays A 96 points");
    expect(root.textContent).not.toContain("Dora");
  });
});

describe("Taiwanese calculator", () => {
  const taiSession: ScoringSession = {
    ...session,
    id: "tai-table",
    variant: "taiwanese",
    preset: "taiwanese-every-flower@1",
    settings: TABLE_PRESETS["taiwanese-every-flower@1"].settings,
  };
  it("detects a seventeen-tile structure, applies the shared table and rejects fourteen tiles", () => {
    mountVariantCalculator(root, {
      session: taiSession,
      renderTile: () => document.createElement("span"),
      onBack: () => {},
      onRecord: () => {},
    });
    for (const t of [
      "1m",
      "2m",
      "3m",
      "4m",
      "5m",
      "6m",
      "1p",
      "2p",
      "3p",
      "7s",
      "8s",
      "9s",
      "E",
      "E",
    ])
      click(`Add ${t}`);
    fill("Winning tile", "27");
    click("Calculate payments");
    expect(root.textContent).toContain("17 physical tiles");
    for (const t of ["E", "Wh", "Wh"]) click(`Add ${t}`);
    fill("Winning tile", "31");
    click("Calculate payments");
    expect(root.textContent).toContain("Wind triplet");
    expect(root.textContent).toContain("Concealed hand");
    expect(root.textContent).toContain("tai");
    expect(root.textContent).not.toContain("Fu");
  });
  it("shows distinct payer amounts for a nondealer self-draw and documents corrected tai before recording", () => {
    // Dealer repeats are derived from the ledger, never typed in: two
    // recorded dealer wins put the derived repeat counter at 2.
    const dealerWin = (honba: number): CalculationDraft => ({
      input: {
        variant: "taiwanese",
        path: "fast",
        context: { winner: 0, payer: 1, dealer: 0, winType: "ron", honba },
        tai: 1,
        settings: DEFAULT_TAIWANESE_SETTINGS,
      },
      corrections: [],
    });
    const repeatedSession: ScoringSession = {
      ...taiSession,
      ledger: [0, 1].map((i) => ({
        id: `op-${i}`,
        kind: "set" as const,
        recordId: `hand-${i}`,
        event: { kind: "win" as const, wins: [dealerWin(i)] },
      })),
    };
    mountVariantCalculator(root, {
      session: repeatedSession,
      renderTile: () => document.createElement("span"),
      onBack: () => {},
      onRecord: () => {},
    });
    expect(root.textContent).toContain("Dealer repeats: 2");
    click("Fast tai entry");
    fill("Winner", "1");
    fill("Win type", "tsumo");
    fill("Tai excluding dealer bonus", "3");
    click("Calculate payments");
    expect(root.textContent).toContain("A pays B 110 points");
    expect(root.textContent).toContain("C pays B 60 points");
    expect(root.textContent).toContain("D pays B 60 points");
    fill("Entered tai excluding dealer bonus · Original 3", "4");
    fill("Reason for correction", "Included the omitted wind triplet");
    click("Apply corrections and recalculate");
    expect(root.textContent).toContain("A pays B 120 points");
    expect(root.textContent).toContain("C pays B 70 points");
    expect(root.textContent).toContain("Original 3");
  });
});
