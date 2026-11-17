// @vitest-environment jsdom
/**
 * Guided-mode coaching moments (coaching remainder brief, guided
 * surfaces): at a call window or a win offer, the prompt row that
 * owns the moment carries the coach's one-line hint; tapping it
 * opens the moment sheet (terms defined at first use) without
 * disturbing the pending decision. With guided mode off, no hint
 * speaks. A win offer silences the floating discard overlay, whose
 * headline would argue with the win read.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildTileSet,
  type CallContext,
  type PlayerPublicView,
  type PlayerView,
  type Tile,
  type TileType,
  type TurnContext,
} from "@openmahjong/engine";
import { adviseCall, adviseWin } from "@openmahjong/coach";
import { App } from "../src/app.js";

// ---------------------------------------------------------------------------
// Fabricated views (mirrors guided-inspect.test.ts / the coach's
// view-helpers: instances from the engine's canonical tile set).
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
    : (arr.find((t) => !t.red && !takenIds.has(t.id)) ?? arr.find((t) => !takenIds.has(t.id)));
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
    const suitBase = ch === "m" ? 0 : ch === "p" ? 9 : ch === "s" ? 18 : ch === "z" ? 27 : -1;
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

function makeView(hand: string): PlayerView {
  takenIds.clear();
  const tiles = tilesOf(hand);
  const players: PlayerPublicView[] = [0, 1, 2, 3].map((s) => ({
    seat: s,
    score: 25000,
    riichi: false,
    doubleRiichi: false,
    discards: [],
    melds: [],
    handCount: s === 0 ? tiles.length : 13,
    isDealer: s === 0,
    seatWind: (27 + s) as TileType,
  }));
  return {
    seat: 0,
    hand: tiles,
    melds: [],
    players,
    dealer: 0,
    roundWind: 27 as TileType,
    kyoku: 1,
    honba: 0,
    sticks: 0,
    wallRemaining: 40,
    doraIndicators: [take(8 as TileType)],
    currentTurn: 0,
  };
}

// ---------------------------------------------------------------------------
// App harness (mirrors guided-inspect.test.ts).
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

interface AppHarness {
  startGame(length: "east", opts?: { seed?: string }): void;
  runner: { pending: unknown; events: readonly unknown[] } | null;
  renderTable(): void;
}

function bootApp(guided: boolean): AppHarness {
  localStorage.setItem(
    "openmahjong.settings.v1",
    JSON.stringify({ sound: false, motion: "reduced", largeTiles: false, lastLength: "east", guided }),
  );
  return new App(root) as unknown as AppHarness;
}

async function waitForPending(app: AppHarness): Promise<void> {
  for (let i = 0; i < 400; i++) {
    await settle(2);
    if (app.runner?.pending) return;
  }
  throw new Error("no pending decision arrived");
}

/** A ron window on the white dragon for a shanpon-tenpai hand. */
function ronWindow(): { view: PlayerView; ctx: CallContext } {
  const view = makeView("234m345p678s55z99s");
  const tile = tilesOf("5z")[0]!;
  return {
    view,
    ctx: { phase: "ron", tile, fromSeat: 1, canRon: true, canPon: false, canKan: false, chiOptions: [] },
  };
}

describe("guided coaching moments", () => {
  it("the call prompt carries the moment hint; tapping it opens the moment sheet", async () => {
    const app = bootApp(true);
    app.startGame("east", { seed: "om-scan-47" });
    await waitForPending(app);
    const { view, ctx } = ronWindow();
    const fabricated = { kind: "call", seat: 0, view, ctx, ponDecidable: false, chiDecidable: false };
    app.runner!.pending = fabricated;
    app.renderTable();

    const hint = root.querySelector<HTMLElement>(".promptrow .momenthint");
    expect(hint).not.toBeNull();
    expect(hint!.textContent).toBe(adviseCall(view, ctx).headline);

    click(hint);
    await settle();
    const sheet = root.querySelector(".xsheet");
    expect(sheet).not.toBeNull();
    expect(sheet!.textContent).toContain("The moment");
    expect(sheet!.textContent).toContain("The read");
    expect(sheet!.textContent).toContain("The facts");
    // The furiten consequence of passing this ron is explained with
    // the term defined (first-use law).
    expect(sheet!.textContent).toContain("Furiten is a barred-win state");
    expect(sheet!.textContent).toContain("until your next draw");
    // The pending decision waits untouched behind the sheet.
    expect(app.runner!.pending).toBe(fabricated);
  }, 120000);

  it("no moment hint speaks with guided mode off", async () => {
    const app = bootApp(false);
    app.startGame("east", { seed: "om-scan-47" });
    await waitForPending(app);
    const { view, ctx } = ronWindow();
    app.runner!.pending = { kind: "call", seat: 0, view, ctx, ponDecidable: false, chiDecidable: false };
    app.renderTable();
    expect(root.querySelector(".promptrow .momenthint")).toBeNull();
  }, 120000);

  it("a win offer shows the win hint and silences the floating discard overlay", async () => {
    const app = bootApp(true);
    app.startGame("east", { seed: "om-scan-47" });
    await waitForPending(app);
    const view = makeView("234m345p678s555z99s");
    const drawn = view.hand.find((t) => t.type === 26)!;
    const ctx: TurnContext = {
      drawnTile: drawn,
      rinshan: false,
      canTsumo: true,
      ankanOptions: [],
      shouminkanOptions: [],
      riichiDiscardIds: [],
      canKyuushu: false,
    };
    app.runner!.pending = { kind: "turn", seat: 0, view, ctx };
    app.renderTable();

    const hint = root.querySelector<HTMLElement>(".promptrow .momenthint");
    expect(hint).not.toBeNull();
    expect(hint!.textContent).toBe(adviseWin(view, ctx)!.headline);
    expect(root.querySelector(".guidehint")).toBeNull();
  }, 120000);
});
