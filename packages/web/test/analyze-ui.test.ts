// @vitest-environment jsdom
/** Analyze UI (brief-analyze-v1): the two scopes render the staged
 * game's numbers — Overall shows 99.5% / 3 misses / 0 blunders with
 * the honesty lock, and Move by move at decision 419 shows the
 * riichi-miss verdict with the staged dama/riichi values. The staged
 * grading build runs once for the whole file (it grades 576
 * decisions through the real coach pipeline). */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import type { Tile } from "@openmahjong/engine";
import { buildAnalyze, type AnalyzeData } from "../src/analyze.js";
import { mountAnalyze, type AnalyzeUIController } from "../src/analyze-ui.js";
import { initI18n } from "../src/i18n/index.js";

const fixture = JSON.parse(
  readFileSync("packages/web/test/fixtures/om-analyze-1.json", "utf8"),
) as { saved: unknown };

const built = buildAnalyze(fixture.saved);
if (!built.available) throw new Error(`staged game not analyzable: ${built.reason}`);
const data: AnalyzeData = built;

const renderTile = (tile: Tile): HTMLElement => {
  const s = document.createElement("span");
  s.className = "tile";
  s.dataset["type"] = String(tile.type);
  return s;
};

function mountStaged(): { host: HTMLElement; ui: AnalyzeUIController } {
  const host = document.createElement("div");
  document.body.append(host);
  const ui = mountAnalyze(host, { data, renderTile, onBack: () => {} });
  return { host, ui };
}

beforeAll(() => {
  initI18n({ pathname: "/" });
});

describe("Analyze UI — Overall scope (staged game)", () => {
  it("renders the staged accuracy, misses and the honesty lock", () => {
    const { host, ui } = mountStaged();
    const text = host.textContent ?? "";
    expect(text).toContain("99.5%");
    expect(text).toContain("Misses — 3");
    expect(text).toContain("Read this first.");
    expect(text).toContain("The coach grades its own policy");
    expect(text).toContain("It is not a measure of anyone's skill.");
    // The three staged misses: two Seat 2 riichi calls, one Seat 1.
    expect(text).toContain("Stayed silent · Coach: declare");
    expect(text).toContain("Declared riichi · Coach: stay silent");
    expect(text).toContain("Dama ron 1,300 · Riichi ron 2,300");
    expect(text).toContain("Dama ron 8,000 = Riichi ron 8,000");
    expect(text).toContain("Discard misses: 0. Blunders: 0.");
    // Match summary + score spine + per-player detail are present.
    expect(text).toContain("Match summary");
    expect(text).toContain("Score after each hand");
    expect(text).toContain("Key moments — tap to jump");
    expect(text).toContain("Win grade: no samples.");
    ui.destroy();
    host.remove();
  });
});

describe("Analyze UI — Move by move scope (staged game)", () => {
  it("decision 419 shows the riichi-miss verdict with staged values", () => {
    const { host, ui } = mountStaged();
    ui.goToDecision(419);
    const text = host.textContent ?? "";
    expect(text).toContain("Miss — stayed silent, coach says declare");
    expect(text).toContain("Seat 2 · East 2 · Hand 4 · Decision 420 of 576 · Dealer Seat 1");
    expect(text).toContain("Dama ron 1,300 · Riichi ron 2,300");
    expect(text).toContain("Eval change (no combined score yet).");
    expect(text).toContain("The discard itself graded best.");
    // The board shows four seats: the reviewed seat face-up, the
    // other three as tile backs.
    expect(host.querySelectorAll(".an-seat")).toHaveLength(4);
    expect(host.querySelectorAll(".an-hand .tile").length).toBeGreaterThan(0);
    expect(host.querySelectorAll(".an-backs .tile").length).toBeGreaterThan(0);
    ui.destroy();
    host.remove();
  });

  it("the segment switches scopes", () => {
    const { host, ui } = mountStaged();
    const buttons = host.querySelectorAll<HTMLButtonElement>(".an-seg button");
    expect(buttons).toHaveLength(2);
    buttons[1]!.click();
    expect(host.textContent).toContain("Event 1 of 1013");
    buttons[0]!.click();
    expect(host.textContent).toContain("Match summary");
    ui.destroy();
    host.remove();
  });
});
