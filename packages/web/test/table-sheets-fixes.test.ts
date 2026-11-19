// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTileSet } from "@openmahjong/engine";
import { App } from "../src/app.js";
import { TableModel, type DrawnHandInfo } from "../src/model.js";

/**
 * Full-audit v1, PR3 (table & sheets): B4, B5, F9, C9, C10, C19,
 * F8, F21, F22 (solo part). CSS claims are measured against the
 * shipped stylesheet text; behaviour claims render the real sheet
 * builders in jsdom.
 */

const css = readFileSync(resolve(process.cwd(), "packages/web/src/styles.css"), "utf8");
const medium = readFileSync(resolve(process.cwd(), "packages/web/src/medium.css"), "utf8");
const tools = readFileSync(resolve(process.cwd(), "packages/web/src/tools.css"), "utf8");
const rule = (source: string, selector: string): string => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  expect(m, `rule ${selector}`).not.toBeNull();
  return m![1]!;
};

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ""; localStorage.clear(); });

describe("B4 — Inspect hand sheet fits its tiles", () => {
  it("the hand grid is fluid: seven columns share the sheet's inner width", () => {
    const grid = rule(css, ".hgrid");
    expect(grid).toContain("grid-template-columns: repeat(7, minmax(0, 1fr))");
    const tile = rule(css, ".hgrid .tile");
    expect(tile).toContain("width: 100%");
    expect(tile).toContain("height: 100%");
  });
});

describe("F22 — table utility controls meet the 44px floor", () => {
  it("handctl buttons are 44px tall (solo Inspect hand; the shared rule also lifts online's)", () => {
    expect(rule(css, ".handctl button")).toContain("min-height: 44px");
  });
});

describe("F8 — guided mode follows section 12", () => {
  it("group labels are 11px in dim sage, not cream", () => {
    const label = rule(css, ".hseg-label");
    expect(label).toContain("font-size: 11px");
    expect(label).toContain("color: var(--dim)");
    expect(css).not.toContain("var(--sage)");
  });
  it("the hint bubble's text can shrink beside its tile face, keeping the flex row", () => {
    expect(rule(css, ".guidehint .gtext")).toContain("min-width: 0");
    expect(rule(css, ".guidehint")).toContain("display: flex");
  });
});

describe("F21 — guided explanation sheet indices meet the 11px floor", () => {
  it("the move and wait faces carry 11px indices", () => {
    const r = rule(css, ".xmove .tindex, .xwait .tindex");
    expect(r).toContain("font-size: 11px");
  });
});

describe("C10 — pond geometry", () => {
  it("side-pond faces ride at the back column's tile size", () => {
    expect(rule(css, ".sp .tile")).toContain("width: 20px");
    expect(rule(css, ".sp .tile")).toContain("height: 28px");
    expect(rule(css, ".sp .cell")).toContain("width: 28px");
    expect(rule(css, ".sp .cell")).toContain("height: 20px");
  });
  it("your own pond centres its rows on the seat axis at the shipped full-row width", () => {
    const own = rule(css, ".pond.ownpond");
    expect(own).toContain("display: flex");
    expect(own).toContain("justify-content: center");
    expect(own).toContain("margin: 0 auto");
  });
});

describe("C9 — win sheet melds upright", () => {
  it("breakdown melds do not rotate their called tile", () => {
    expect(rule(css, ".bk-hand .meld .side")).toContain("transform: none");
  });
});

describe("F9 — Board Review dealer mark stays out of section 3 red", () => {
  it("the dealer seat outline and suffix use the seat ink, never chun", () => {
    const seat = rule(medium, '.board-seat[data-dealer="true"]');
    expect(seat).not.toContain("var(--chun)");
    expect(seat).toContain("var(--on-tint)");
    const suffix = rule(medium, '.board-seat[data-dealer="true"] h2::after');
    expect(suffix).not.toContain("var(--chun");
    expect(suffix).toContain("var(--on-tint)");
  });
});

describe("C19 — board marks", () => {
  it("chosen/advised/drawn marks are styled in tools.css", () => {
    expect(rule(tools, ".board-mark.chosen")).toContain("outline: 2px solid var(--ink)");
    expect(rule(tools, ".board-mark.advised")).toContain("var(--state)");
    expect(rule(tools, ".board-drawn-sep")).toContain("background: var(--line)");
  });
});

describe("B5 — draw sheet reveals full tenpai hands", () => {
  it("renders the meld tiles beside the concealed tiles", () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const root = document.createElement("div");
    document.body.append(root);
    const app = new App(root);
    const tiles = buildTileSet();
    const concealed = tiles.slice(0, 10);
    const meldTiles = tiles.slice(20, 23);
    const drawn: DrawnHandInfo = {
      kind: "exhaustive",
      tenpai: [0],
      nagashi: [],
      revealedHands: new Map([[0, concealed]]),
      revealedMelds: new Map([[0, [{ kind: "pon", tiles: meldTiles }]]]),
    };
    const render = app as unknown as { fillDrawBreakdown(card: HTMLElement, value: DrawnHandInfo): void };
    const card = document.createElement("div");
    render.fillDrawBreakdown(card, drawn);
    // 10 concealed + 3 meld tiles = the full 13-tile hand.
    expect(card.querySelectorAll(".bk-hand .tile")).toHaveLength(13);
    expect(card.querySelectorAll(".bk-hand .meld .tile")).toHaveLength(3);
  });

  it("the model captures melds with the revealed hands at the drawn-hand event", () => {
    const model = new TableModel(0);
    model.apply({ seq: 0, type: "game-start", scores: [25000, 25000, 25000, 25000] } as never);
    model.apply({ seq: 1, type: "hand-start", dealer: 0, roundWind: 27, kyoku: 1, honba: 0, sticks: 0, wallRemaining: 70 } as never);
    model.apply({ seq: 2, type: "deal", seat: 0, tiles: [0, 4, 8, 12, 16, 20, 24, 28, 32, 36] } as never);
    model.players[0]!.melds = [{ kind: "pon", tiles: [buildTileSet()[40]!, buildTileSet()[41]!, buildTileSet()[42]!] }];
    model.apply({ seq: 3, type: "drawn-hand", kind: "exhaustive", tenpai: [0], nagashi: [] } as never);
    expect(model.lastDrawnHand?.revealedHands.get(0)).toHaveLength(10);
    expect(model.lastDrawnHand?.revealedMelds.get(0)?.[0]?.tiles).toHaveLength(3);
  });
});
