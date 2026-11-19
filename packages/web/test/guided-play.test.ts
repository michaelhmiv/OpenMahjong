// @vitest-environment jsdom
/**
 * The guided-play package (approved renderings guided-play-v1,
 * QC-passed; corner indices amended by the owner's 2026-11-17
 * ruling — inspect surfaces only, never the board):
 *
 * - Unit tests: the corner-index table (tile-index.ts), the hand
 *   decomposition behind grouping (hand-groups.ts) — the staged
 *   hand's exact label sequence, seven pairs as one segment,
 *   triplet/shanpon/tanki shapes, and the every-tile-exactly-once
 *   invariant over random hands — and the safety line's wording.
 * - DOM tests: grouping labels in a guided game (and their absence
 *   with guided off, and while a Focus Frame is open); safety
 *   badges under the certainty rule (one riichi player, two riichi
 *   players, and the negative case where a tile is in only one
 *   pond); the safety reason line in the hint bubble; corner
 *   indices present in the Inspect hand sheet and the explanation
 *   sheet and ABSENT from every board surface; press-and-hold tile
 *   shifting (order commits, persists across a draw, the tap after
 *   a grab is suppressed, Sort restores, riichi locks the hand);
 *   lesson indices under the no-leak law (teaching strips are
 *   tap-to-inspect, drill tiles reveal only once found, variant
 *   questions reveal only once answered correctly).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildTileSet,
  type PlayerView,
  type Tile,
  type TileType,
} from "@openmahjong/engine";
import { adviseDiscard } from "@openmahjong/coach";
import { App, safetyLineText } from "../src/app.js";
import { tileById } from "../src/model.js";
import { decomposeHand, segmentTileIds, type HandSegment } from "../src/hand-groups.js";
import { tileIndexInfo } from "../src/tile-index.js";
import {
  VARIANT_LESSONS,
  variantLessonQuestions,
} from "../src/education/variant-content.js";
import { emptyVariantProgress } from "../src/education/variant-progress.js";
import { mountVariantEducation } from "../src/variant-education-ui.js";

// ---------------------------------------------------------------------------
// Tile helpers (notation -> canonical instances, as in
// guided-inspect.test.ts).
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
  takenIds.clear();
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
      if (ch === "z") out.push(take((suitBase + d - 1) as TileType));
      else if (d === 0) out.push(take((suitBase + 4) as TileType, true));
      else out.push(take((suitBase + d - 1) as TileType));
    }
    digits = [];
  }
  return out.sort((a, b) => a.type - b.type || a.id - b.id);
}

const labels = (segs: readonly HandSegment[]): string[] => segs.map((s) => s.label);
const segTypes = (segs: readonly HandSegment[]): number[][] =>
  segs.map((s) => s.tiles.map((t) => t.type));

// ---------------------------------------------------------------------------
// Unit: the corner-index table.
// ---------------------------------------------------------------------------

describe("tileIndexInfo: the approved index table", () => {
  it("suits carry their rank digit in dark ink; red fives the plain digit", () => {
    for (let type = 0; type < 27; type++) {
      const info = tileIndexInfo(type as TileType);
      expect(info).not.toBeNull();
      expect(info!.text).toBe(String((type % 9) + 1));
      expect(info!.ink).toBe("#22252b");
    }
  });

  it("winds carry E/S/W/N in dark ink", () => {
    expect(tileIndexInfo(27 as TileType)).toEqual({ text: "E", ink: "#22252b" });
    expect(tileIndexInfo(28 as TileType)).toEqual({ text: "S", ink: "#22252b" });
    expect(tileIndexInfo(29 as TileType)).toEqual({ text: "W", ink: "#22252b" });
    expect(tileIndexInfo(30 as TileType)).toEqual({ text: "N", ink: "#22252b" });
  });

  it("dragons carry their letter in the face's own ink family", () => {
    expect(tileIndexInfo(31 as TileType)).toEqual({ text: "W", ink: "#7a8699" });
    expect(tileIndexInfo(32 as TileType)).toEqual({ text: "G", ink: "#22763d" });
    expect(tileIndexInfo(33 as TileType)).toEqual({ text: "R", ink: "#bf3b34" });
  });
});

// ---------------------------------------------------------------------------
// Unit: the grouping decomposition.
// ---------------------------------------------------------------------------

describe("decomposeHand", () => {
  it("the staged hand reads Sequence · Sequence · Sequence · Pair · Waiting · Loose", () => {
    // The approved rendering's hand: 1-2-3 characters, 7-8-9 dots,
    // 4-5-6-6-7 bamboo, a Green dragon pair, and the just-drawn Red
    // dragon standing loose.
    const segs = decomposeHand(tilesOf("123m789p45667s66z7z"), 0);
    expect(labels(segs)).toEqual([
      "Sequence",
      "Sequence",
      "Sequence",
      "Pair",
      "Waiting",
      "Loose",
    ]);
    expect(segTypes(segs)).toEqual([
      [0, 1, 2],
      [15, 16, 17],
      [21, 22, 23],
      [32, 32],
      [23, 24],
      [33],
    ]);
  });

  it("seven pairs is ONE segment, at 13 and at 14 tiles", () => {
    const thirteen = decomposeHand(tilesOf("113355m7799p112s"), 0);
    expect(labels(thirteen)).toEqual(["Seven pairs"]);
    expect(thirteen[0]!.tiles.length).toBe(13);
    const fourteen = decomposeHand(tilesOf("113355m7799p1122s"), 0);
    expect(labels(fourteen)).toEqual(["Seven pairs"]);
    expect(fourteen[0]!.tiles.length).toBe(14);
  });

  it("a triplet is named, and shanpon reads Pair + Waiting", () => {
    const triplet = decomposeHand(tilesOf("111m234p234s234s55z"), 0);
    expect(labels(triplet)).toEqual([
      "Triplet",
      "Sequence",
      "Sequence",
      "Sequence",
      "Pair",
    ]);
    const shanpon = decomposeHand(tilesOf("1122m345p678s999s"), 0);
    expect(labels(shanpon)).toEqual([
      "Sequence",
      "Sequence",
      "Triplet",
      "Pair",
      "Waiting",
    ]);
  });

  it("a tanki hand ends in a Loose single, with no Pair segment", () => {
    const segs = decomposeHand(tilesOf("123m456p789s111z5z"), 0);
    expect(labels(segs)).toEqual([
      "Sequence",
      "Sequence",
      "Sequence",
      "Triplet",
      "Loose",
    ]);
  });

  it("an open hand decomposes only its concealed tiles (meld count given)", () => {
    const segs = decomposeHand(tilesOf("123m456p789s5z"), 1);
    expect(labels(segs)).toEqual(["Sequence", "Sequence", "Sequence", "Loose"]);
  });

  it("every tile appears exactly once, deterministically, over random hands", () => {
    let state = 123456789;
    const rand = (): number => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state / 0x7fffffff;
    };
    for (let trial = 0; trial < 60; trial++) {
      const deck = buildTileSet().slice();
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [deck[i], deck[j]] = [deck[j]!, deck[i]!];
      }
      const n = trial % 2 === 0 ? 13 : 14;
      const hand = deck.slice(0, n);
      const segs = decomposeHand(hand, 0);
      const ids = segmentTileIds(segs);
      expect(ids.length).toBe(n);
      expect(new Set(ids).size).toBe(n);
      expect([...ids].sort((a, b) => a - b)).toEqual(
        hand.map((t) => t.id).sort((a, b) => a - b),
      );
      // Deterministic: a second pass produces the identical reading.
      expect(segmentTileIds(decomposeHand(hand, 0))).toEqual(ids);
      for (const s of segs) {
        expect(["Sequence", "Triplet", "Pair", "Waiting", "Loose", "Seven pairs"]).toContain(
          s.label,
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Unit: the safety line's wording.
// ---------------------------------------------------------------------------

describe("safetyLineText", () => {
  it("one riichi player is named, with the reason", () => {
    expect(safetyLineText(["North"])).toBe(
      "Safe against North — North has discarded this tile, so North cannot win on it.",
    );
  });

  it("two riichi players are both named", () => {
    expect(safetyLineText(["South", "West"])).toBe(
      "Safe against South and West — both have discarded this tile, so neither can win on it.",
    );
  });

  it("three riichi players are all named", () => {
    expect(safetyLineText(["South", "West", "North"])).toBe(
      "Safe against South, West, and North — all of them have discarded this tile, so none of them can win on it.",
    );
  });
});

// ---------------------------------------------------------------------------
// DOM harness (mirrors guided-inspect.test.ts).
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
  runner: { pending: PendingTurn | null; events: readonly unknown[] } | null;
  humanAct(a: unknown): void;
  renderTable(): void;
  model: {
    players: {
      handIds: number[];
      melds: unknown[];
      riichi: boolean;
    }[];
  };
  selectedTileId: number | null;
}

function bootApp(guided: boolean): AppHarness {
  localStorage.setItem(
    "openmahjong.settings.v1",
    JSON.stringify({ sound: false, motion: "reduced", largeTiles: false, lastLength: "east", guided }),
  );
  return new App(root) as unknown as AppHarness;
}

const SEED = "om-scan-47";

async function waitForTurn(app: AppHarness): Promise<PendingTurn> {
  for (let i = 0; i < 600; i++) {
    await settle(2);
    const p = app.runner?.pending as { kind: string } | null;
    if (!p) continue;
    // A call window for the human may open on the way: pass it.
    if (p.kind === "call") {
      app.humanAct({ type: "pass" });
      continue;
    }
    if (p.kind === "turn") return p as PendingTurn;
  }
  throw new Error("no turn pending arrived");
}

const handWraps = (): HTMLElement[] => [
  ...root.querySelectorAll<HTMLElement>(".handrow .twrap"),
];
const wrapId = (w: HTMLElement): number => Number((w.dataset["flip"] ?? "").slice(5));
const handOrderIds = (): number[] => handWraps().map(wrapId);

function modelHandTiles(app: AppHarness): Tile[] {
  return app.model.players[0]!.handIds.map((id) => tileById(id));
}

const WIND_NAME: Record<number, string> = { 27: "East", 28: "South", 29: "West", 30: "North" };

// ---------------------------------------------------------------------------
// DOM: grouping and labels.
// ---------------------------------------------------------------------------

describe("guided grouping and labels", () => {
  it("the guided hand is laid out in group order with the decomposition's labels", async () => {
    const app = bootApp(true);
    app.startGame("east", { seed: SEED });
    await waitForTurn(app);
    const expected = decomposeHand(modelHandTiles(app), app.model.players[0]!.melds.length);
    const labelEls = [...root.querySelectorAll(".handrow .hseg-label")];
    expect(labelEls.map((el) => el.textContent)).toEqual(labels(expected));
    // The row's tile order is exactly the decomposition's order.
    expect(handOrderIds()).toEqual(segmentTileIds(expected));
    // Every segment column holds exactly its segment's tiles.
    const segs = [...root.querySelectorAll(".handrow .hseg")];
    expect(segs.length).toBe(expected.length);
    segs.forEach((seg, i) => {
      const ids = [...seg.querySelectorAll<HTMLElement>(".twrap")].map(wrapId);
      expect(ids).toEqual(expected[i]!.tiles.map((t) => t.id));
    });
  });

  it("guided off: no grouping, no labels — the shipped sorted row", async () => {
    const app = bootApp(false);
    app.startGame("east", { seed: SEED });
    await waitForTurn(app);
    expect(root.querySelectorAll(".handrow .hseg").length).toBe(0);
    expect(root.querySelectorAll(".handrow .hseg-label").length).toBe(0);
    expect(handWraps().length).toBe(modelHandTiles(app).length);
  });

  it("labels hide while a Focus Frame is open and return when it closes", async () => {
    const app = bootApp(true);
    app.startGame("east", { seed: SEED });
    await waitForTurn(app);
    expect(root.querySelectorAll(".handrow .hseg-label").length).toBeGreaterThan(0);
    click(root.querySelector('[data-control-key="inspect-open"]'));
    await settle();
    expect(root.querySelector(".sheet")).not.toBeNull();
    expect(root.querySelectorAll(".handrow .hseg-label").length).toBe(0);
    // The order itself stays grouped behind the frame.
    const expected = decomposeHand(modelHandTiles(app), app.model.players[0]!.melds.length);
    expect(handOrderIds()).toEqual(segmentTileIds(expected));
    click(root.querySelector(".sheet .fclose"));
    await settle();
    expect(root.querySelectorAll(".handrow .hseg-label").length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// DOM: safety badges (fabricated riichi scenes on a real pending,
// the guided-inspect pattern — the view's hand IS the model's hand).
// ---------------------------------------------------------------------------

function spareCopyOf(type: TileType, view: PlayerView): Tile {
  const used = new Set<number>();
  for (const t of view.hand) used.add(t.id);
  for (const p of view.players) for (const d of p.discards) used.add(d.tile.id);
  for (const t of view.doraIndicators) used.add(t.id);
  const spare = buildTileSet().find((t) => t.type === type && !used.has(t.id));
  if (!spare) throw new Error(`no spare copy of type ${type}`);
  return spare;
}

function withRiichiPond(
  view: PlayerView,
  seat: number,
  extraTypes: TileType[],
): PlayerView {
  return {
    ...view,
    players: view.players.map((p, i) =>
      i === seat
        ? {
            ...p,
            riichi: true,
            discards: [
              ...p.discards,
              ...extraTypes.map((type) => ({
                tile: spareCopyOf(type, view),
                riichiDeclaration: false,
                called: false,
              })),
            ],
          }
        : p,
    ) as PlayerView["players"],
  };
}

function badgedIds(): number[] {
  return handWraps()
    .filter((w) => w.querySelector(".safebadge"))
    .map(wrapId);
}

describe("guided safety badges", () => {
  it("a tile in the riichi player's pond is badged; selecting it states the reason in the bubble", async () => {
    const app = bootApp(true);
    app.startGame("east", { seed: SEED });
    const pending = await waitForTurn(app);
    const target = pending.view.hand[pending.view.hand.length - 1]!;
    const view = withRiichiPond(pending.view, 1, [target.type]);
    const advice = adviseDiscard(view, pending.ctx as never);
    const option = advice.options.find((o) => o.tileId === target.id)!;
    expect(option.genbutsu).toBe(true);
    expect(option.genbutsuAgainst).toEqual([1]);

    app.runner!.pending = { ...pending, view };
    app.renderTable();
    await settle();

    const expectedBadged = pending.view.hand
      .filter((t) => t.type === target.type)
      .map((t) => t.id)
      .sort((a, b) => a - b);
    expect([...badgedIds()].sort((a, b) => a - b)).toEqual(expectedBadged);

    // Select the badged tile: the bubble gains the reason, naming
    // the riichi player by their seat wind.
    const wrap = handWraps().find((w) => wrapId(w) === target.id)!;
    click(wrap);
    await settle();
    const wind = WIND_NAME[view.players[1]!.seatWind]!;
    expect(root.querySelector(".guidehint .gsafe")?.textContent).toBe(
      `Safe against ${wind} — ${wind} has discarded this tile, so ${wind} cannot win on it.`,
    );
  });

  it("certainty only: a tile in just one of two riichi ponds is NOT badged; a tile in both is, and the line names both", async () => {
    const app = bootApp(true);
    app.startGame("east", { seed: SEED });
    const pending = await waitForTurn(app);
    const typesInHand = [...new Set(pending.view.hand.map((t) => t.type))];
    expect(typesInHand.length).toBeGreaterThanOrEqual(2);
    const [typeA, typeB] = typesInHand as [TileType, TileType];
    let view = withRiichiPond(pending.view, 1, [typeA, typeB]);
    view = withRiichiPond(view, 2, [typeB]);
    const advice = adviseDiscard(view, pending.ctx as never);
    const optA = advice.options.find((o) => o.tileType === typeA)!;
    const optB = advice.options.find((o) => o.tileType === typeB)!;
    expect(optA.genbutsu).toBe(false);
    expect(optB.genbutsu).toBe(true);
    expect(optB.genbutsuAgainst).toEqual([1, 2]);

    app.runner!.pending = { ...pending, view };
    app.renderTable();
    await settle();

    const badged = badgedIds();
    expect(badged.length).toBeGreaterThan(0);
    for (const id of badged) {
      expect(tileById(id).type).toBe(typeB);
    }

    const target = pending.view.hand.find((t) => t.type === typeB)!;
    click(handWraps().find((w) => wrapId(w) === target.id));
    await settle();
    const n1 = WIND_NAME[view.players[1]!.seatWind]!;
    const n2 = WIND_NAME[view.players[2]!.seatWind]!;
    expect(root.querySelector(".guidehint .gsafe")?.textContent).toBe(
      `Safe against ${n1} and ${n2} — both have discarded this tile, so neither can win on it.`,
    );
  });

  it("badges hide while a Focus Frame is open", async () => {
    const app = bootApp(true);
    app.startGame("east", { seed: SEED });
    const pending = await waitForTurn(app);
    const target = pending.view.hand[0]!;
    const view = withRiichiPond(pending.view, 1, [target.type]);
    app.runner!.pending = { ...pending, view };
    app.renderTable();
    await settle();
    expect(badgedIds().length).toBeGreaterThan(0);
    click(root.querySelector('[data-control-key="inspect-open"]'));
    await settle();
    expect(root.querySelectorAll(".handrow .safebadge").length).toBe(0);
    click(root.querySelector(".sheet .fclose"));
    await settle();
    expect(badgedIds().length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// DOM: corner indices — inspect surfaces only.
// ---------------------------------------------------------------------------

describe("corner indices live on inspect surfaces only", () => {
  it("no board surface carries an index; the Inspect hand sheet and the explanation sheet do", async () => {
    const app = bootApp(true);
    app.startGame("east", { seed: SEED });
    const pending = await waitForTurn(app);
    const advice = adviseDiscard(pending.view, pending.ctx);

    // Board surfaces: hand row, ponds, melds, centre — zero indices.
    expect(root.querySelectorAll(".handrow .tindex").length).toBe(0);
    expect(root.querySelectorAll(".pond .tindex").length).toBe(0);
    expect(root.querySelectorAll(".meld .tindex").length).toBe(0);
    expect(root.querySelectorAll(".center .tindex").length).toBe(0);
    expect(root.querySelectorAll(".guidehint .tindex").length).toBe(0);

    // The explanation sheet is an inspect surface: its move tile
    // carries the index.
    click(root.querySelector(".guidehint"));
    await settle();
    const moveIndex = root.querySelector(".sheet.xsheet .xmove .tindex");
    expect(moveIndex).not.toBeNull();
    expect(moveIndex!.textContent).toBe(
      tileIndexInfo(advice.recommendation.tileType)!.text,
    );
    click(root.querySelector(".sheet.xsheet .fclose"));
    await settle();

    // Select a tile, then open Inspect hand: every grid tile is
    // indexed, and the magnified preview carries the right glyph.
    const selected = pending.view.hand[3]!;
    click(handWraps().find((w) => wrapId(w) === selected.id));
    await settle();
    click(root.querySelector('[data-control-key="inspect-open"]'));
    await settle();
    const gridIndices = root.querySelectorAll(".hgrid .tindex");
    expect(gridIndices.length).toBe(pending.view.hand.length);
    const previewIndex = root.querySelector(".selpreview .tindex");
    expect(previewIndex).not.toBeNull();
    expect(previewIndex!.textContent).toBe(tileIndexInfo(selected.type)!.text);
    // …while the board behind the sheet still carries none.
    expect(root.querySelectorAll(".handrow .tindex").length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// DOM: manual tile shifting.
// ---------------------------------------------------------------------------

/**
 * jsdom has no layout: give the hand row a synthetic one. Every
 * slot-holder (a tile wrap, or the ghost while dragging) sits on a
 * 26px grid in DOM order; the grabbed wrap takes no slot. Returns
 * the restore function.
 */
function stubHandGeometry(): () => void {
  const proto = HTMLElement.prototype as unknown as {
    getBoundingClientRect: () => DOMRect;
  };
  const orig = proto.getBoundingClientRect;
  proto.getBoundingClientRect = function (this: HTMLElement): DOMRect {
    const row = this.closest(".handrow");
    if (row) {
      const slotEl = this.classList.contains("tile")
        ? (this.closest(".twrap") as HTMLElement | null)
        : this;
      if (
        slotEl &&
        (slotEl.classList.contains("twrap") || slotEl.classList.contains("hshift-ghost"))
      ) {
        const slots = [...row.querySelectorAll(".twrap, .hshift-ghost")].filter(
          (el) => !el.classList.contains("grabbing"),
        );
        const idx = slots.indexOf(slotEl);
        if (idx >= 0) {
          const left = idx * 26;
          return {
            left,
            right: left + 25,
            top: 0,
            bottom: 35,
            width: 25,
            height: 35,
            x: left,
            y: 0,
            toJSON: () => ({}),
          } as DOMRect;
        }
      }
    }
    return orig.call(this);
  };
  return () => {
    proto.getBoundingClientRect = orig;
  };
}

function pointer(
  target: Element | Window,
  type: string,
  clientX: number,
): void {
  target.dispatchEvent(
    new window.MouseEvent(type, { bubbles: true, clientX, button: 0 }),
  );
}

const waitReal = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/** Press-and-hold the wrap at `index`, slide by `dx`, release. */
async function grabAndSlide(index: number, dx: number): Promise<void> {
  const wrap = handWraps()[index]!;
  pointer(wrap, "pointerdown", 100);
  await waitReal(320); // the hold arms the grab
  pointer(window, "pointermove", 100 + dx);
  pointer(window, "pointerup", 100 + dx);
  await settle();
}

describe("manual tile shifting", () => {
  it("a grab lifts the tile over a ghost, the drop commits the new order, and Sort restores the sort", async () => {
    const restore = stubHandGeometry();
    try {
      const app = bootApp(false);
      app.startGame("east", { seed: SEED });
      await waitForTurn(app);
      const before = handOrderIds();
      expect(before.length).toBeGreaterThanOrEqual(13);

      const wrap = handWraps()[0]!;
      const firstId = wrapId(wrap);
      pointer(wrap, "pointerdown", 100);
      await waitReal(320);
      expect(wrap.classList.contains("grabbing")).toBe(true);
      expect(root.querySelector(".handrow .hshift-ghost")).not.toBeNull();
      pointer(window, "pointermove", 100 + 90);
      pointer(window, "pointerup", 190);
      await settle();

      const after = handOrderIds();
      expect(after).not.toEqual(before);
      expect(after.indexOf(firstId)).toBeGreaterThan(0);
      expect([...after].sort((a, b) => a - b)).toEqual(
        [...before].sort((a, b) => a - b),
      );

      // Sort appears while the hand is out of order, and restores.
      const sortBtn = root.querySelector('[data-control-key="hand-sort"]');
      expect(sortBtn).not.toBeNull();
      click(sortBtn);
      await settle();
      expect(handOrderIds()).toEqual(before);
      expect(root.querySelector('[data-control-key="hand-sort"]')).toBeNull();
    } finally {
      restore();
    }
  });

  it("the arrangement persists across a draw; the new tile arrives apart at the right", async () => {
    const restore = stubHandGeometry();
    try {
      const app = bootApp(false);
      app.startGame("east", { seed: SEED });
      const pending = await waitForTurn(app);
      await grabAndSlide(0, 90);
      const arranged = handOrderIds();

      // Discard the drawn tile (last in the row): the arrangement
      // of everything else must survive into the next turn.
      const drawnWrap = handWraps()[handWraps().length - 1]!;
      const drawnId = wrapId(drawnWrap);
      app.humanAct({ type: "discard", tileId: drawnId });
      const next = await waitForTurn(app);
      expect(next).not.toBe(pending);

      const now = handOrderIds();
      const expectedKept = arranged.filter((id) => id !== drawnId);
      expect(now.slice(0, -1)).toEqual(expectedKept);
      // The freshly drawn tile sits apart at the right, marked drawn.
      const lastWrap = handWraps()[handWraps().length - 1]!;
      expect(lastWrap.querySelector(".tile.drawn")).not.toBeNull();
      expect(expectedKept).not.toContain(wrapId(lastWrap));
    } finally {
      restore();
    }
  });

  it("a grab never discards, and the click that follows a drop is not a tap", async () => {
    const restore = stubHandGeometry();
    try {
      const app = bootApp(false);
      app.startGame("east", { seed: SEED });
      const pending = await waitForTurn(app);
      await grabAndSlide(1, 60);
      // The same decision is still pending — nothing was discarded.
      expect(app.runner!.pending).toBe(pending);
      // The release's trailing click must not select or discard.
      const wrap = handWraps()[2]!;
      click(wrap);
      await settle();
      expect(app.runner!.pending).toBe(pending);
      expect(app.selectedTileId).toBeNull();
    } finally {
      restore();
    }
  });

  it("after the player declares riichi, the hand is locked: no grab arms", async () => {
    const restore = stubHandGeometry();
    try {
      const app = bootApp(false);
      app.startGame("east", { seed: SEED });
      await waitForTurn(app);
      // The model is the render state (the guided-inspect tests
      // fabricate the pending the same way): mark the player riichi.
      app.model.players[0]!.riichi = true;
      app.renderTable();
      await settle();
      const wrap = handWraps()[0]!;
      pointer(wrap, "pointerdown", 100);
      await waitReal(320);
      expect(wrap.classList.contains("grabbing")).toBe(false);
      expect(root.querySelector(".handrow .hshift-ghost")).toBeNull();
      pointer(window, "pointerup", 100);
    } finally {
      restore();
    }
  });

  it("in guided mode a shift drops the labels until Sort restores group order", async () => {
    const restore = stubHandGeometry();
    try {
      const app = bootApp(true);
      app.startGame("east", { seed: SEED });
      await waitForTurn(app);
      expect(root.querySelectorAll(".handrow .hseg-label").length).toBeGreaterThan(0);
      await grabAndSlide(0, 200);
      // The manual order now shows: either it still decomposes into
      // the same groups (labels recomputed) or the labels hide —
      // and Sort is on offer either way it diverged.
      const expected = decomposeHand(modelHandTiles(app), app.model.players[0]!.melds.length);
      if (handOrderIds().join() === segmentTileIds(expected).join()) {
        expect(
          [...root.querySelectorAll(".handrow .hseg-label")].map((el) => el.textContent),
        ).toEqual(labels(expected));
      } else {
        expect(root.querySelectorAll(".handrow .hseg-label").length).toBe(0);
        const sortBtn = root.querySelector('[data-control-key="hand-sort"]');
        expect(sortBtn).not.toBeNull();
        click(sortBtn);
        await settle();
        expect(handOrderIds()).toEqual(segmentTileIds(expected));
        expect(
          [...root.querySelectorAll(".handrow .hseg-label")].map((el) => el.textContent),
        ).toEqual(labels(expected));
      }
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// Lessons: indices under the no-leak law.
// ---------------------------------------------------------------------------

describe("lesson indices obey the no-leak law", () => {
  it("TU-1: a teaching strip is tap-to-inspect; a drill tile reveals only once found", { timeout: 60_000 }, async () => {
    localStorage.setItem(
      "openmahjong.settings.v1",
      JSON.stringify({ sound: false, motion: "reduced", largeTiles: false, lastLength: "east", guided: false }),
    );
    new App(root);
    await settle();
    click(root.querySelector('.tabbtn[data-tab="learn"]'));
    await settle();
    const riichiSection = [...root.querySelectorAll("#screen-learn .learnsec")].find(
      (s) => s.querySelector(".secttl")?.textContent === "Riichi",
    )!;
    click(riichiSection.querySelectorAll(".lrow")[0]);
    await settle();

    // Step 1 (teaching): the pictured 5 of dots carries no index
    // until tapped; tapping reveals it.
    const stripTile = root.querySelector("#table .lstrip .twrap");
    expect(stripTile).not.toBeNull();
    expect(stripTile!.querySelector(".tindex")).toBeNull();
    click(stripTile);
    await settle();
    expect(root.querySelector("#table .lstrip .tindex")?.textContent).toBe("5");

    // Advance to the first drill (step 3): no drill tile carries an
    // index; tapping a correct tile finds it and only then reveals.
    for (let i = 0; i < 4; i++) {
      const cont = root.querySelector<HTMLElement>("#table .revctl .pillbtn.primary");
      if (root.querySelector("#table .dgrid")) break;
      if (cont) click(cont);
      await settle();
    }
    const cells = [...root.querySelectorAll<HTMLElement>("#table .dgrid .cell")];
    expect(cells.length).toBe(12);
    expect(root.querySelectorAll("#table .dgrid .tindex").length).toBe(0);
    click(cells[2]); // a dots tile (type 9, the 1 of dots)
    await settle();
    const indices = root.querySelectorAll("#table .dgrid .tindex");
    expect(indices.length).toBe(1);
    expect(indices[0]!.textContent).toBe("1");
    // The click re-rendered the stage — re-query for the live cell.
    const liveCells = [...root.querySelectorAll<HTMLElement>("#table .dgrid .cell")];
    expect(liveCells[2]!.querySelector(".tindex")).not.toBeNull();
  });

  it("variant lessons: teaching rows are tap-to-inspect; a tile-pick question reveals only once answered correctly", { timeout: 60_000 }, async () => {
    // Find a lesson with a teaching row before its first question,
    // whose first question is a tile-pick.
    let target: { variant: string; lessonId: string } | null = null;
    for (const lesson of VARIANT_LESSONS) {
      const firstQuestionStep = lesson.steps.findIndex((s) => s.question);
      if (firstQuestionStep < 1) continue;
      const teachesFirst = lesson.steps
        .slice(0, firstQuestionStep)
        .some((s) => s.tiles || s.hand);
      const q = lesson.steps[firstQuestionStep]!.question!;
      if (teachesFirst && q.kind === "tile-pick") {
        target = { variant: lesson.variant, lessonId: lesson.id };
        break;
      }
    }
    expect(target).not.toBeNull();

    let progress = emptyVariantProgress();
    mountVariantEducation(root, {
      variant: target!.variant as never,
      lessonId: target!.lessonId,
      progress,
      onProgress: (p) => {
        progress = p;
      },
      renderTile: (tile: Tile) => {
        const s = document.createElement("span");
        s.className = "tile";
        s.dataset["type"] = String(tile.type);
        return s;
      },
      onBack: () => {},
      onPlay: () => {},
    });
    await settle();

    // Teaching row: no indices until a tile is tapped.
    const teachTiles = [...root.querySelectorAll<HTMLElement>(".variant-example-tiles .tile")];
    expect(teachTiles.length).toBeGreaterThan(0);
    expect(root.querySelectorAll(".variant-example-tiles .tindex").length).toBe(0);
    const first = teachTiles[0]!;
    first.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    await settle();
    const revealed = root.querySelector(".variant-example-tiles .tindex");
    expect(revealed).not.toBeNull();
    expect(revealed!.textContent).toBe(
      tileIndexInfo(Number(first.dataset["type"]) as TileType)!.text,
    );

    // Drive to the tile-pick question, answering any choice
    // questions on the way from the content's own answer key.
    const lesson = VARIANT_LESSONS.find((l) => l.id === target!.lessonId)!;
    const questions = variantLessonQuestions(lesson);
    for (let iter = 0; iter < 40; iter++) {
      if (root.querySelector(".variant-tile-pick")) break;
      // An answered step offers Continue first — take it before
      // touching any answer control again.
      const cont = [...root.querySelectorAll<HTMLButtonElement>("button")].find(
        (b) => b.textContent === "Continue",
      );
      if (cont) {
        cont.click();
        await settle();
        continue;
      }
      const prompt = root.querySelector(".variant-education-content h2")?.textContent;
      const q = questions.find((qq) => qq.prompt === prompt);
      if (q?.kind === "choice") {
        const btns = [...root.querySelectorAll<HTMLElement>(".variant-answers button")];
        btns[q.answer]!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
        await settle();
      }
      const checkBtn = [...root.querySelectorAll<HTMLButtonElement>("button")].find(
        (b) => b.textContent === "Check answer",
      );
      if (checkBtn && !checkBtn.disabled) {
        checkBtn.click();
        await settle();
        continue;
      }
      throw new Error("variant lesson driver stuck");
    }

    // The pick row: no indices before the answer is in.
    const pickBtns = [...root.querySelectorAll<HTMLElement>(".variant-tile-pick .variant-tile-choice")];
    expect(pickBtns.length).toBeGreaterThan(0);
    expect(root.querySelectorAll(".variant-tile-pick .tindex").length).toBe(0);
    const prompt = root.querySelector(".variant-education-content h2")?.textContent;
    const q = questions.find((qq) => qq.prompt === prompt)!;
    if (q.kind !== "tile-pick") throw new Error("expected a tile-pick question");
    for (const pickIndex of q.picks) {
      // Each pick re-renders the row — re-query before every tap.
      const fresh = [...root.querySelectorAll<HTMLElement>(".variant-tile-pick .variant-tile-choice")];
      fresh[pickIndex]!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      await settle();
    }
    const checkBtn = [...root.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent === "Check answer",
    )!;
    checkBtn.click();
    await settle();
    // Answered correctly: the faces may now carry their indices.
    expect(root.querySelectorAll(".variant-tile-pick .tindex").length).toBe(pickBtns.length);
  });
});

// ---------------------------------------------------------------------------
// CSS assertions.
// ---------------------------------------------------------------------------

describe("guided-play CSS", () => {
  const css = readFileSync(resolve(process.cwd(), "packages/web/src/styles.css"), "utf8");

  it("the badge is a state-green disc; the label is 11px dim sage; no gold in the package rules", () => {
    const badge = css.match(/\.safebadge\s*\{([^}]*)\}/);
    expect(badge).not.toBeNull();
    expect(badge![1]).toContain("background: var(--state)");
    expect(badge![1]).toContain("border-radius: 50%");
    const label = css.match(/\.hseg-label\s*\{([^}]*)\}/);
    expect(label).not.toBeNull();
    expect(label![1]).toContain("font-size: 11px");
    expect(label![1]).toContain("color: var(--dim)");
    const start = css.indexOf("guided-play package: grouping");
    expect(start).toBeGreaterThan(0);
    const block = css.slice(start, start + 4000);
    expect(block).not.toContain("#d9b45c");
    expect(block).not.toContain("var(--gold)");
  });

  it("the corner index is absolutely placed at the face's top-left and never intercepts taps", () => {
    const rule = css.match(/\.tindex\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule![1]).toContain("position: absolute");
    expect(rule![1]).toContain("pointer-events: none");
    // The magnified preview steps the glyph up with the face.
    const preview = css.match(/\.selpreview \.tindex\s*\{([^}]*)\}/);
    expect(preview).not.toBeNull();
    expect(preview![1]).toContain("font-size: 17px");
  });
});
