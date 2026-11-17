// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { GameEvent } from "@openmahjong/engine";
import { BoardTimeline } from "../src/board-review.js";
import { mountBoardReview } from "../src/board-review-ui.js";

/**
 * Medium surface system guards (design rules section 15, locked
 * 2026-11-17; approved set: mahjong-prep/renderings/calc-v7-carryacross).
 * These pin the structural claims the approval rested on: the layer's
 * cascade position, the tint tokens, the bare back control, the
 * Fraunces title role, the three calc-v7 QC fixes (F1 distlab spans,
 * Check 6 ghost height, E1 disabled Confirm), gold discipline inside
 * the new sheet, the in-game-table carve-out, and the board-review
 * dealer mark that the CSS keys off.
 */

const WEB = "packages/web";
const css = readFileSync(resolve(process.cwd(), `${WEB}/src/medium.css`), "utf8");
const main = readFileSync(resolve(process.cwd(), `${WEB}/src/main.ts`), "utf8");

function rules(source: string): { selector: string; body: string }[] {
  const noComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: { selector: string; body: string }[] = [];
  const re = /([^{}@]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(noComments)) !== null)
    out.push({ selector: m[1]!.trim(), body: m[2]! });
  return out;
}
const mediumRules = rules(css);
const bySelector = (sel: string) =>
  mediumRules.find((r) => r.selector === sel);

describe("medium surface system: cascade and tokens", () => {
  it("medium.css loads after tools.css in main.ts (the approved frames' cascade position)", () => {
    const tools = main.indexOf('import "./tools.css"');
    const medium = main.indexOf('import "./medium.css"');
    expect(tools).toBeGreaterThan(-1);
    expect(medium).toBeGreaterThan(tools);
  });

  it("defines the three derived tints and the text-grade chun (section 15)", () => {
    const root = bySelector(":root");
    expect(root).toBeDefined();
    expect(root!.body).toContain("--sheet: #d8decd");
    expect(root!.body).toContain("--tint: #c2d1be");
    expect(root!.body).toContain("--deep: #a7c0a9");
    expect(root!.body).toContain("--on-tint: #1c2a20");
    expect(root!.body).toContain("--tint-sub: #33503f");
    expect(root!.body).toContain("--chun: #bf3b34");
    expect(root!.body).toContain("--chun-text: #9e2b25");
  });

  it("introduces no hue beyond the tint family and the chun reds", () => {
    // Rules only: comments legitimately name the palette ancestors
    // the tints derive from (state green, tile face).
    const noComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const hexes = new Set(
      [...noComments.matchAll(/#[0-9a-f]{6}\b/gi)].map((m) =>
        m[0].toLowerCase(),
      ),
    );
    expect([...hexes].sort()).toEqual(
      [
        "#1c2a20",
        "#33503f",
        "#4d4630", // E1 disabled-on-gold olive (measured 4.76:1)
        "#9e2b25",
        "#a7c0a9",
        "#bf3b34",
        "#c2d1be",
        "#d8decd",
      ].sort(),
    );
  });
});

describe("medium surface system: locked structure", () => {
  it("the back control is a bare 30px glyph on a 44px box, scoped off the variant table", () => {
    const rule = bySelector(
      ".learning-shell:not(.variant-table) header > button:first-child",
    );
    expect(rule).toBeDefined();
    expect(rule!.body).toContain("background: transparent");
    expect(rule!.body).toContain("font-size: 30px");
    expect(rule!.body).toContain("font-weight: 600");
    expect(rule!.body).toContain("width: 44px");
    expect(rule!.body).toContain("height: 44px");
    expect(rule!.body).toContain("border-radius: 0");
  });

  it("screen titles take Fraunces at unchanged sizes (R14)", () => {
    const rule = mediumRules.find((r) =>
      r.selector.includes(".practice-view .learning-content h1"),
    );
    expect(rule).toBeDefined();
    for (const sel of [
      ".tabpage h2",
      ".table-tools header h1",
      ".game-detail header h1",
      ".board-review header h1",
    ])
      expect(rule!.selector).toContain(sel);
    expect(rule!.body).toContain('font-family: "Fraunces", Georgia, serif');
    // A face swap only: the rule must not resize anything.
    expect(rule!.body).not.toContain("font-size");
  });

  it("keeps the F1 fix: Games placement labels recolored to the sub ink (6.46:1)", () => {
    const rule = bySelector(".distcard .distlab span");
    expect(rule).toBeDefined();
    expect(rule!.body).toContain("color: var(--tint-sub)");
  });

  it("keeps the Check 6 fix: the slim ghost sets height, not just min-height", () => {
    const rule = bySelector(".pillbtn.ghost");
    expect(rule).toBeDefined();
    expect(rule!.body).toContain("height: 40px");
    expect(rule!.body).toContain("border-radius: 6px");
  });

  it("keeps the E1 fix: the disabled calculator Confirm clears 4.5:1 on gold", () => {
    const rule = bySelector(
      ".learning-shell.table-tools .calculator-output button.primary:last-of-type:disabled",
    );
    expect(rule).toBeDefined();
    expect(rule!.body).toContain("color: #4d4630");
  });

  it("gold appears in medium.css only on the calculator Confirm, exactly as shipped", () => {
    const goldRules = mediumRules.filter((r) => r.body.includes("var(--gold)"));
    expect(goldRules.map((r) => r.selector)).toEqual([
      ".learning-shell.table-tools .calculator-output button.primary:last-of-type",
    ]);
    expect(css.toLowerCase()).not.toContain("#d9b45c");
  });

  it("never styles the in-game table (standing carve-out)", () => {
    for (const r of mediumRules) {
      expect(r.selector.includes("#table"), r.selector).toBe(false);
      // .variant-table may appear only inside the :not() exclusion.
      const stripped = r.selector.replace(":not(.variant-table)", "");
      expect(stripped.includes(".variant-table"), r.selector).toBe(false);
    }
  });

  it("the dealer's seat ring and suffix are keyed off data-dealer", () => {
    const ring = bySelector('.board-seat[data-dealer="true"]');
    expect(ring).toBeDefined();
    expect(ring!.body).toContain("inset 0 0 0 2px var(--chun)");
    const suffix = bySelector('.board-seat[data-dealer="true"] h2::after');
    expect(suffix).toBeDefined();
    expect(suffix!.body).toContain('content: " · Dealer"');
    expect(suffix!.body).toContain("color: var(--chun-text)");
  });
});

describe("medium surface system: board review dealer mark", () => {
  it("marks exactly the dealer's seat, and it follows the dealer on seek", () => {
    const events: GameEvent[] = [
      { seq: 0, type: "game-start", scores: [25000, 25000, 25000, 25000] },
      {
        seq: 1,
        type: "hand-start",
        dealer: 1,
        roundWind: 27,
        kyoku: 1,
        honba: 0,
        sticks: 0,
      },
      { seq: 2, type: "deal", seat: 1, tiles: [0, 4, 8] },
      { seq: 3, type: "discard", seat: 1, tile: 0 },
      {
        seq: 4,
        type: "hand-start",
        dealer: 2,
        roundWind: 27,
        kyoku: 2,
        honba: 0,
        sticks: 0,
      },
      { seq: 5, type: "deal", seat: 2, tiles: [1, 5, 9] },
    ];
    const timeline = new BoardTimeline({
      events,
      chiHints: new Map(),
      humanSeat: 0,
      result: null,
      review: {
        schemaVersion: 1,
        engineVersion: 2,
        complete: false,
        consumedDecisions: 0,
        positions: [],
        moments: [],
      },
    });
    const root = document.createElement("div");
    document.body.append(root);
    const ui = mountBoardReview(root, {
      timeline,
      renderTile: () => document.createElement("span"),
      onBack: () => {},
      onPractice: () => {},
    });
    // Hand 1: dealer is seat 1; with human seat 0 that is relative
    // seat 1, and its wind is East.
    let marked = root.querySelectorAll('.board-seat[data-dealer="true"]');
    expect(marked).toHaveLength(1);
    expect(marked[0]!.classList.contains("board-seat-1")).toBe(true);
    expect(marked[0]!.querySelector("h2")!.textContent).toMatch(/^East/);
    // Seek into hand 2 (dealer seat 2) via the hand picker: the
    // mark moves, still unique. (The range input clamps to the
    // current hand's span, so it cannot jump hands directly.)
    const handSelect = root.querySelector<HTMLSelectElement>(
      '[aria-label="Hand"]',
    )!;
    handSelect.value = "1";
    handSelect.dispatchEvent(new Event("change"));
    marked = root.querySelectorAll('.board-seat[data-dealer="true"]');
    expect(marked).toHaveLength(1);
    expect(marked[0]!.classList.contains("board-seat-2")).toBe(true);
    expect(marked[0]!.querySelector("h2")!.textContent).toMatch(/^East/);
    ui.destroy();
    root.remove();
  });
});
