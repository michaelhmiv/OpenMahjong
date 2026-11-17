// @vitest-environment jsdom
/**
 * Guided highlight + inspect tile info (approved renderings
 * guided-inspect-v1, QC-passed, approved by Michael 2026-11-16):
 *
 * - Unit tests for the inspect readout computation (tile-info.ts):
 *   each line's truth conditions, including the rendering's exact
 *   scene hand expecting its four lines verbatim.
 * - DOM tests: the overlay carries the recommended tile's face, the
 *   state-green ring lands on the exact recommended instance (the
 *   red five, not its plain copy), clears on the next decision, is
 *   absent with guided mode off, and tapping the overlay opens the
 *   explanation sheet without disturbing the pending decision.
 * - CSS assertions: the ring is var(--state) with a reduced-motion
 *   static form; gold never appears in the new rules.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildTileSet,
  type PlayerPublicView,
  type PlayerView,
  type Tile,
  type TileType,
} from "@openmahjong/engine";
import { adviseDiscard } from "@openmahjong/coach";
import { App, tileLabel } from "../src/app.js";
import { tileById } from "../src/model.js";
import { tileDisplayName, tileInfo } from "../src/tile-info.js";

// ---------------------------------------------------------------------------
// Fabricated views (mirrors packages/coach/test/view-helpers: instances
// come from the engine's canonical tile set, copy 0 of each five is
// the red five).
// ---------------------------------------------------------------------------

const pool = new Map<TileType, Tile[]>();
for (const tile of buildTileSet()) {
  const arr = pool.get(tile.type) ?? [];
  arr.push(tile);
  pool.set(tile.type, arr);
}
const takenIds = new Set<number>();

function take(type: TileType, wantRed = false): Tile {
  const arr = pool.get(type)!;
  const tile = wantRed
    ? arr.find((t) => t.red && !takenIds.has(t.id))
    : (arr.find((t) => !t.red && !takenIds.has(t.id)) ??
      arr.find((t) => !takenIds.has(t.id)));
  if (!tile) throw new Error(`helper exhausted copies of type ${type}`);
  takenIds.add(tile.id);
  return tile;
}

function tilesOf(notation: string): Tile[] {
  const out: Tile[] = [];
  let digits: number[] = [];
  for (const ch of notation.trim()) {
    if (ch >= "0" && ch <= "9") {
      digits.push(ch.charCodeAt(0) - 48);
      continue;
    }
    const suitBase =
      ch === "m" ? 0 : ch === "p" ? 9 : ch === "s" ? 18 : ch === "z" ? 27 : -1;
    if (suitBase < 0) throw new Error(`Invalid notation character: ${ch}`);
    for (const d of digits) {
      if (ch === "z") out.push(take(suitBase + d - 1));
      else if (d === 0) out.push(take(suitBase + 4, true));
      else out.push(take(suitBase + d - 1));
    }
    digits = [];
  }
  return out.sort((a, b) => a.type - b.type || a.id - b.id);
}

interface ViewSpec {
  hand: string;
  doraIndicatorTypes?: TileType[];
  discards?: (string | undefined)[];
}

function makeView(spec: ViewSpec): PlayerView {
  takenIds.clear();
  const seat = 0;
  const dealer = 0;
  const hand = tilesOf(spec.hand);
  const indicators = (spec.doraIndicatorTypes ?? [0 as TileType]).map((t) => take(t));
  const players: PlayerPublicView[] = [0, 1, 2, 3].map((s) => ({
    seat: s,
    score: 25000,
    riichi: false,
    doubleRiichi: false,
    discards: (spec.discards?.[s] ? tilesOf(spec.discards[s]!) : []).map((tile) => ({
      tile,
      riichiDeclaration: false,
      called: false,
    })),
    melds: [],
    handCount: s === seat ? hand.length : 13,
    isDealer: s === dealer,
    seatWind: (27 + ((s - dealer + 4) % 4)) as TileType,
  }));
  return {
    seat,
    hand,
    melds: [],
    players,
    dealer,
    roundWind: 27 as TileType,
    kyoku: 2,
    honba: 1,
    sticks: 0,
    wallRemaining: 37,
    doraIndicators: indicators,
    currentTurn: seat,
  };
}

/** The renderings' shared scene: East 2, 1 honba, dora indicator 7s;
 *  hand 2m2m · 3p4p4p5pr5p · 8s8s8s · chun×3 · drawn 9m; exactly two
 *  plain 5p face-up in ponds. */
function sceneView(): PlayerView {
  return makeView({
    hand: "22m34405p888s777z9m",
    doraIndicatorTypes: [24 as TileType], // 7s → dora is 8s
    discards: [undefined, "5p", "5p", undefined],
  });
}

// ---------------------------------------------------------------------------
// Unit tests: the readout computation.
// ---------------------------------------------------------------------------

describe("tileInfo: the rendering B scene, verbatim", () => {
  it("the red five reads exactly as rendered", () => {
    const view = sceneView();
    const red = view.hand.find((t) => t.red)!;
    const drawn = view.hand.find((t) => t.type === 8)!; // 9m
    const info = tileInfo(view, red, { drawnTile: drawn });
    expect(info.name).toBe("5 of Dots");
    expect(info.lines).toEqual([
      "Red five — counts as a dora.",
      "Part of a run — 3, 4, 5 of Dots.",
      "2 of the 4 copies are visible on the table.",
    ]);
    expect(info.waitsLine).toBe("Waiting on: 3 of Dots, 6 of Dots.");
  });

  it("display names capitalise the suit; honours keep the coach form", () => {
    expect(tileDisplayName(13 as TileType)).toBe("5 of Dots");
    expect(tileDisplayName(25 as TileType)).toBe("8 of Bamboo");
    expect(tileDisplayName(33 as TileType)).toBe("Red dragon");
  });
});

describe("tileInfo: each line's truth conditions", () => {
  it("a dora by indicator (not a red five) gets the dora line", () => {
    const view = sceneView();
    const eight = view.hand.find((t) => t.type === 25)!; // 8s, dora via 7s
    const info = tileInfo(view, eight);
    expect(info.lines[0]).toBe("Dora — this tile is a dora.");
    expect(info.lines[1]).toBe("Part of a triplet — three 8 of Bamboos.");
  });

  it("a pair reads as a pair, with no dora line when neither applies", () => {
    const view = sceneView();
    const two = view.hand.find((t) => t.type === 1)!; // 2m
    const info = tileInfo(view, two);
    expect(info.lines).toEqual([
      "One of a pair.",
      "0 of the 4 copies are visible on the table.",
    ]);
    expect(info.waitsLine).toBeNull(); // 14 tiles, no drawn/recommended given
  });

  it("a loose tile reads as not part of a set yet", () => {
    const view = sceneView();
    const nine = view.hand.find((t) => t.type === 8)!; // 9m
    const info = tileInfo(view, nine);
    expect(info.lines[0]).toBe("Not part of a set yet.");
  });

  it("visible copies exclude the dora indicators themselves", () => {
    // One plain 5p sits in a pond; another plain 5p IS the indicator.
    // Only the pond copy is "visible on the table".
    const view = makeView({
      hand: "22m34405p888s777z",
      doraIndicatorTypes: [13 as TileType], // a 5p tile as indicator
      discards: [undefined, "5p", undefined, undefined],
    });
    const plain = view.hand.find((t) => t.type === 13 && !t.red)!;
    const info = tileInfo(view, plain);
    expect(info.lines).toContain("1 of the 4 copies are visible on the table.");
  });

  it("a completed set outranks the pair reading (the scene's 4p)", () => {
    const view = sceneView();
    const four = view.hand.find((t) => t.type === 12)!; // 4p, held twice
    const info = tileInfo(view, four);
    expect(info.lines).toContain("Part of a run — 3, 4, 5 of Dots.");
    expect(info.lines).not.toContain("One of a pair.");
  });
});

describe("tileInfo: the waits rule", () => {
  it("a 13-tile tenpai hand speaks for itself", () => {
    const view = makeView({
      hand: "22m34405p888s777z",
      doraIndicatorTypes: [24 as TileType],
      discards: [undefined, "5p", "5p", undefined],
    });
    const red = view.hand.find((t) => t.red)!;
    expect(tileInfo(view, red).waitsLine).toBe("Waiting on: 3 of Dots, 6 of Dots.");
  });

  it("a 13-tile hand short of tenpai has no waits line", () => {
    const view = makeView({ hand: "234m234p234s234z5z" });
    const tile = view.hand[0]!;
    expect(tileInfo(view, tile).waitsLine).toBeNull();
  });

  it("14 tiles: when the drawn discard fails, the recommended discard decides", () => {
    const view = sceneView();
    const red = view.hand.find((t) => t.red)!;
    const drawnEight = view.hand.find((t) => t.type === 25)!; // an 8s as "drawn"
    const nine = view.hand.find((t) => t.type === 8)!; // 9m, the coach's discard
    // Discarding an 8s breaks the triplet — no tenpai form that way.
    expect(tileInfo(view, red, { drawnTile: drawnEight }).waitsLine).toBeNull();
    // Discarding the 9m reaches the scene's tenpai.
    expect(
      tileInfo(view, red, { drawnTile: drawnEight, recommendedTileId: nine.id }).waitsLine,
    ).toBe("Waiting on: 3 of Dots, 6 of Dots.");
  });
});

// ---------------------------------------------------------------------------
// DOM tests.
// ---------------------------------------------------------------------------

async function settle(times = 10): Promise<void> {
  for (let i = 0; i < times; i++) await new Promise((r) => setTimeout(r, 0));
}

function click(el: Element | null | undefined): void {
  if (!el) throw new Error("click target missing");
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
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

interface PendingTurn {
  kind: "turn";
  seat: number;
  view: PlayerView;
  ctx: {
    drawnTile: Tile | null;
    riichiDiscardIds: readonly number[];
    [k: string]: unknown;
  };
}

interface AppHarness {
  startGame(length: "east", opts?: { seed?: string }): void;
  runner: {
    pending: PendingTurn | null;
    events: readonly unknown[];
  } | null;
  humanAct(a: unknown): void;
  renderTable(): void;
}

function bootApp(guided: boolean): AppHarness {
  localStorage.setItem(
    "openmahjong.settings.v1",
    JSON.stringify({ sound: false, motion: "reduced", largeTiles: false, lastLength: "east", guided }),
  );
  return new App(root) as unknown as AppHarness;
}

/** Seed om-scan-47: the first hand holds a red 5p AND a plain 5p. */
const SEED = "om-scan-47";

async function waitForTurn(app: AppHarness): Promise<PendingTurn> {
  for (let i = 0; i < 400; i++) {
    await settle(2);
    const p = app.runner?.pending;
    if (p?.kind === "turn") return p;
  }
  throw new Error("no turn pending arrived");
}

function ringedWraps(): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(".handrow .twrap")].filter((w) =>
    w.querySelector(".tile.coach-rec"),
  );
}

describe("guided highlight: overlay and ring", () => {
  it("the overlay carries the recommended tile's face beside the headline, and the ring marks that exact instance", async () => {
    const app = bootApp(true);
    app.startGame("east", { seed: SEED });
    const pending = await waitForTurn(app);
    const advice = adviseDiscard(pending.view, pending.ctx);

    const hint = root.querySelector(".guidehint");
    expect(hint).not.toBeNull();
    expect(hint!.getAttribute("role")).toBe("button");
    expect(hint!.getAttribute("aria-label")).toBe("Why this move?");
    expect(hint!.querySelector(".gtext")?.textContent).toBe(advice.headline);
    const face = hint!.querySelector(".tile");
    expect(face?.getAttribute("aria-label")).toBe(
      tileLabel(tileById(advice.recommendation.tileId)),
    );

    const ringed = ringedWraps();
    expect(ringed.length).toBe(1);
    expect(ringed[0]!.dataset["flip"]).toBe(`tile-${advice.recommendation.tileId}`);
  });

  it("guided off: no overlay, no ring", async () => {
    const app = bootApp(false);
    app.startGame("east", { seed: SEED });
    await waitForTurn(app);
    await settle();
    expect(root.querySelector(".guidehint")).toBeNull();
    expect(ringedWraps().length).toBe(0);
  });

  it("the ring clears when the decision moves on", async () => {
    const app = bootApp(true);
    app.startGame("east", { seed: SEED });
    const pending = await waitForTurn(app);
    const advice = adviseDiscard(pending.view, pending.ctx);
    expect(ringedWraps().length).toBe(1);

    app.humanAct({ type: "discard", tileId: advice.recommendation.tileId });
    const next = await waitForTurn(app);
    const nextAdvice = adviseDiscard(next.view, next.ctx);
    const ringed = ringedWraps();
    expect(ringed.length).toBe(1);
    expect(ringed[0]!.dataset["flip"]).toBe(`tile-${nextAdvice.recommendation.tileId}`);
    // The discarded instance is gone from the hand and cannot stay ringed.
    expect(ringed[0]!.dataset["flip"]).not.toBe(`tile-${advice.recommendation.tileId}`);
  });

  it("the ring lands on the red five instance, not its plain copy, when the coach names the red", async () => {
    const app = bootApp(true);
    app.startGame("east", { seed: SEED });
    const pending = await waitForTurn(app);
    const red = pending.view.hand.find((t) => t.red)!;
    const plain = pending.view.hand.find((t) => t.type === red.type && !t.red)!;
    expect(red).toBeDefined();
    expect(plain).toBeDefined();

    // Put the position in riichi with the red five as the drawn tile:
    // the only legal discard is the drawn instance itself, so the
    // coach's recommendation IS the red five while a plain copy of
    // the same type sits in the hand — the instance trap in the brief.
    const view: PlayerView = {
      ...pending.view,
      players: pending.view.players.map((p) =>
        p.seat === pending.view.seat ? { ...p, riichi: true } : p,
      ) as PlayerView["players"],
    };
    const fabricated: PendingTurn = {
      kind: "turn",
      seat: pending.seat,
      view,
      ctx: { ...pending.ctx, drawnTile: red, riichiDiscardIds: [] },
    };
    const advice = adviseDiscard(fabricated.view, fabricated.ctx as never);
    expect(advice.recommendation.tileId).toBe(red.id);
    expect(advice.recommendation.isRed).toBe(true);

    app.runner!.pending = fabricated;
    app.renderTable();
    await settle();

    const ringed = ringedWraps();
    expect(ringed.length).toBe(1);
    expect(ringed[0]!.dataset["flip"]).toBe(`tile-${red.id}`);
    const plainWrap = root.querySelector(`.handrow .twrap[data-flip="tile-${plain.id}"]`);
    expect(plainWrap?.querySelector(".tile.coach-rec")).toBeNull();
    const face = root.querySelector(".guidehint .tile");
    expect(face?.getAttribute("aria-label")).toContain("(red five)");
  });
});

describe("guided explanation sheet", () => {
  it("tapping the overlay opens the sheet and leaves the pending decision untouched", async () => {
    const app = bootApp(true);
    app.startGame("east", { seed: SEED });
    const pending = await waitForTurn(app);
    const advice = adviseDiscard(pending.view, pending.ctx);

    click(root.querySelector(".guidehint"));
    await settle();
    const sheet = root.querySelector(".sheet.xsheet");
    expect(sheet).not.toBeNull();
    expect(sheet!.querySelector(".ftitle")?.textContent).toBe("Guided hint");
    const labels = [...sheet!.querySelectorAll(".fsec")].map((el) => el.textContent);
    expect(labels).toContain("The goal");
    expect(labels).toContain("The move");
    expect(labels).toContain("Why this tile");
    expect(sheet!.querySelector(".xmove .mname")?.textContent).toBe(
      tileDisplayName(advice.recommendation.tileType),
    );
    // The decision waits untouched behind the sheet.
    expect(app.runner!.pending).toBe(pending);

    click(sheet!.querySelector(".fclose"));
    await settle();
    expect(root.querySelector(".sheet.xsheet")).toBeNull();
    expect(app.runner!.pending).toBe(pending);
    // And it can still be answered.
    app.humanAct({ type: "discard", tileId: advice.recommendation.tileId });
    await settle();
    expect(app.runner!.pending).not.toBe(pending);
  });
});

describe("guided explanation sheet: the rendering C scene", () => {
  it("a ready hand's sheet matches the approved copy, section by section", async () => {
    const app = bootApp(true);
    app.startGame("east", { seed: SEED });
    await waitForTurn(app);

    // The renderings' scene as the pending decision: the model (and
    // its hand) stays the real game's; the sheet speaks only for the
    // pending view, which is the scene.
    const view = sceneView();
    const drawn = view.hand.find((t) => t.type === 8)!; // 9m
    const fabricated: PendingTurn = {
      kind: "turn",
      seat: 0,
      view,
      ctx: {
        drawnTile: drawn,
        riichiDiscardIds: [],
        canTsumo: false,
        ankanOptions: [],
        shouminkanOptions: [],
        canKyuushu: false,
        rinshan: false,
      } as PendingTurn["ctx"],
    };
    const advice = adviseDiscard(view, fabricated.ctx as never);
    expect(advice.recommendation.tileId).toBe(drawn.id);
    expect(advice.recommendation.shantenAfter).toBe(0);

    app.runner!.pending = fabricated;
    app.renderTable();
    await settle();
    expect(root.querySelector(".guidehint .gtext")?.textContent).toBe(advice.headline);

    click(root.querySelector(".guidehint"));
    await settle();
    const sheet = root.querySelector(".sheet.xsheet")!;
    const bodies = [...sheet.querySelectorAll(".xbody")].map((el) => el.textContent);
    expect(bodies[0]).toBe(
      "You are one tile from a finished hand: four groups of three tiles — three in a row, or three of a kind — plus one pair. You have the pair, two triplets and one run; one group is still open. One tile from finished is called ready.",
    );
    expect(sheet.querySelector(".xmove .mname")?.textContent).toBe("9 of Characters");
    expect(sheet.querySelector(".xmove .msub")?.textContent).toBe(
      "Discard it. You just drew this tile, and it is the only discard that leaves the hand ready.",
    );
    expect(bodies[1]).toBe(
      "The 9 of Characters connects to nothing — no second copy to pair with, no 7 or 8 of Characters to make a run. Every other tile is part of a group or your pair — discard one, its group breaks, and the hand is no longer ready.",
    );
    // The final approved value paragraph: riichi, dora and the
    // indicator each defined at first use.
    expect(bodies[2]).toBe(
      "Already valuable, the hand needs no riichi — an optional declaration made when your hand is ready — with four dora — bonus tiles worth extra score. Three are 8 of Bamboo, one the red 5 of Dots. The face-up tile in the middle of the table, the indicator, is the 7 of Bamboo; the tile one step above is a dora. Riichi can raise the score, but declaring it costs 1,000 points, and it locks your hand to discarding only what you draw.",
    );
    expect(bodies[3]).toBe(
      "Two tiles finish the hand. Their other copies are unseen — in the wall — the pile of tiles everyone draws from — or in another player's hand.",
    );
    const waits = [...sheet.querySelectorAll(".xwait")].map((row) => ({
      name: row.querySelector(".wname")?.textContent,
      fact: row.querySelector(".wfact")?.textContent,
    }));
    expect(waits).toEqual([
      { name: "3 of Dots", fact: "Completes the 3, 4, 5 run · 3 copies still unseen." },
      { name: "6 of Dots", fact: "Completes the 4, 5, 6 run · 4 copies still unseen." },
    ]);
    expect(bodies[bodies.length - 1]).toBe(
      "Draw one, or claim one an opponent discards with the Ron button, and the hand is complete.",
    );
    expect(app.runner!.pending).toBe(fabricated);
  });
});

describe("inspect readout in the hand sheet", () => {
  it("the selected tile reads with the plain name and its factual lines", async () => {
    const app = bootApp(true);
    app.startGame("east", { seed: SEED });
    const pending = await waitForTurn(app);
    const advice = adviseDiscard(pending.view, pending.ctx);
    const red = pending.view.hand.find((t) => t.red)!;

    click(root.querySelector(`.handrow .twrap[data-flip="tile-${red.id}"]`));
    await settle();
    click(root.querySelector('[data-control-key="inspect-open"]'));
    await settle();

    const preview = root.querySelector(".selpreview");
    expect(preview).not.toBeNull();
    expect(preview!.querySelector(".tname")?.textContent).toBe("5 of Dots");
    const expected = tileInfo(pending.view, red, {
      drawnTile: pending.ctx.drawnTile,
      recommendedTileId: advice.recommendation.tileId,
    });
    const lines = [...preview!.querySelectorAll(".iline:not(.waits)")].map((el) => el.textContent);
    expect(lines).toEqual(expected.lines);
    const waits = preview!.querySelector(".iline.waits");
    expect(waits?.textContent ?? null).toBe(expected.waitsLine);
  });
});

// ---------------------------------------------------------------------------
// CSS assertions.
// ---------------------------------------------------------------------------

describe("guided-inspect CSS", () => {
  const css = readFileSync(resolve(process.cwd(), "packages/web/src/styles.css"), "utf8");

  it("the ring is the flat state-green ring with a pulse", () => {
    const rule = css.match(/^\.handrow \.tile\.coach-rec\s*\{([^}]*)\}/m);
    expect(rule).not.toBeNull();
    expect(rule![1]).toContain("box-shadow: 0 0 0 2px var(--bg), 0 0 0 5px var(--state)");
    expect(rule![1]).toContain("animation: recpulse 1.6s ease-in-out infinite");
    expect(css).toContain("@keyframes recpulse");
    expect(css).toContain("0 0 0 7.5px var(--state)");
  });

  it("reduced motion removes the pulse under both gates, keeping the static ring", () => {
    const occurrences = css.match(/\.handrow \.tile\.coach-rec \{ animation: none; \}/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it("the overlay bubble is the only tappable part: 300px flex row, pointer-events auto", () => {
    const rule = css.match(/\.guidehint\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule![1]).toContain("width: 300px");
    expect(rule![1]).toContain("display: flex");
    expect(rule![1]).toContain("pointer-events: auto");
    const face = css.match(/\.guidehint \.tile\s*\{([^}]*)\}/);
    expect(face![1]).toContain("width: 22px");
    expect(face![1]).toContain("height: 31px");
  });

  it("no gold in the new rules", () => {
    for (const sel of [".guidehint", ".handrow .tile.coach-rec", ".xmove", ".xwait", ".xbody"]) {
      const rule = css.match(new RegExp(`${sel.replace(/\./g, "\\.")}\\s*\\{([^}]*)\\}`));
      expect(rule).not.toBeNull();
      expect(rule![1]).not.toContain("#d9b45c");
      expect(rule![1]).not.toContain("var(--gold)");
    }
  });
});
