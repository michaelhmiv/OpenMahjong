// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTileSet, parseCounts, scoreHand } from "@openmahjong/engine";
import { App } from "../src/app.js";
import type { WinInfo } from "../src/model.js";

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ""; localStorage.clear(); });

describe("score breakdown facts", () => {
  it("shows awarded open-hand han and actual dora rather than closed-hand table values", () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const root = document.createElement("div");
    document.body.append(root);
    const app = new App(root);
    // Open straight in circles + East triplet + West pair; East is
    // neither seat nor round wind. Open ittsu1 + honitsu2 + dora1.
    const scored = scoreHand({ handCounts: parseCounts("123456789p11133z"),
      melds: [{ kind: "chi", tiles: [9, 10, 11] }], winningTileType: 29,
      winType: "ron", seatWind: 29, roundWind: 28, riichi: false,
      dora: 1, honba: 0, riichiSticks: 0 });
    expect(scored.yaku.map((y) => [y.id, y.han])).toEqual(expect.arrayContaining([["ittsu", 1], ["honitsu", 2]]));
    expect(scored.han).toBe(4);
    const counts = parseCounts("123456789p11133z");
    const tiles = buildTileSet().filter((tile) => tile.id % 4 < counts[tile.type]!);
    const win: WinInfo = { seat: 2, fromSeat: 1, winType: "ron", winningTile: tiles.at(-1)!,
      yaku: scored.yaku.map((y) => y.id), yakuDetails: scored.yaku, dora: scored.dora,
      han: scored.han, fu: scored.fu, yakumanMultiple: scored.yakumanMultiple,
      payments: [{ seat: 1, amount: scored.ronPoints! }], stickPoints: 0,
      handTiles: tiles.slice(3, -1), winnerMelds: [{ kind: "chi", tiles: tiles.slice(0, 3) }] };
    const render = app as unknown as { fillWinBreakdown(card: HTMLElement, value: WinInfo): void };
    const card = document.createElement("div");
    render.fillWinBreakdown(card, win);
    const rows = [...card.querySelectorAll(".bk-yaku .row")].map((row) => row.textContent);
    expect(rows).toContain("Ittsu1 han");
    expect(rows).toContain("Honitsu2 han");
    expect(rows).toContain("Dora1 han");
    // Older replays lack per-yaku metadata; their open reductions are
    // still derivable from the recorded melds without rescoring.
    const { yakuDetails: _details, dora: _dora, ...legacy } = win;
    const oldCard = document.createElement("div");
    render.fillWinBreakdown(oldCard, legacy);
    expect(oldCard.querySelector(".bk-yaku")?.textContent).toBe(card.querySelector(".bk-yaku")?.textContent);
  });
});

describe("win sheet condensed facts (audit C9, 2026-11-19)", () => {
  it("states who pays and the honba count as facts, with no explainer paragraphs", () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const root = document.createElement("div");
    document.body.append(root);
    const app = new App(root);
    const scored = scoreHand({ handCounts: parseCounts("123456789p11133z"),
      melds: [{ kind: "chi", tiles: [9, 10, 11] }], winningTileType: 29,
      winType: "ron", seatWind: 29, roundWind: 28, riichi: false,
      dora: 1, honba: 0, riichiSticks: 0 });
    const counts = parseCounts("123456789p11133z");
    const tiles = buildTileSet().filter((tile) => tile.id % 4 < counts[tile.type]!);
    const win: WinInfo = { seat: 2, fromSeat: 1, winType: "ron", winningTile: tiles.at(-1)!,
      yaku: scored.yaku.map((y) => y.id), yakuDetails: scored.yaku, dora: scored.dora,
      han: scored.han, fu: scored.fu, yakumanMultiple: scored.yakumanMultiple,
      payments: [{ seat: 1, amount: scored.ronPoints! }], stickPoints: 1000,
      handTiles: tiles.slice(3, -1), winnerMelds: [{ kind: "chi", tiles: tiles.slice(0, 3) }] };
    const render = app as unknown as { fillWinBreakdown(card: HTMLElement, value: WinInfo): void };
    const card = document.createElement("div");
    render.fillWinBreakdown(card, win);
    const text = card.textContent ?? "";
    // Facts only: the ron sub line names the discarder, the honba
    // count is a payment line, and the indicator is labelled.
    expect(text).toContain("On South's discard");
    expect(text).toContain("Honba 0");
    expect(text).toContain("Dora indicator");
    // The retired explainer paragraphs stay retired (audit C9).
    expect(text).not.toContain("Han count the hand's scoring patterns");
    expect(text).not.toContain("The dora indicator points to a bonus tile");
    expect(text).not.toContain("A riichi stick is a 1,000-point stake");
    expect(card.querySelectorAll("p.dim")).toHaveLength(0);
    // Melds render after the concealed tiles, as on the table.
    const handTiles = [...card.querySelectorAll(".bk-hand .tile")];
    expect(handTiles.length).toBeGreaterThan(0);
    const meldTiles = [...card.querySelectorAll(".bk-hand .meld .tile")];
    expect(meldTiles.length).toBe(3);
    expect(handTiles.indexOf(meldTiles[0]!)).toBeGreaterThan(0);
    // The same sheet for a tsumo win states who pays instead.
    const tsumoCard = document.createElement("div");
    render.fillWinBreakdown(tsumoCard, { ...win, winType: "tsumo", fromSeat: undefined, stickPoints: 0 });
    expect(tsumoCard.textContent).toContain("All three opponents pay");
  });

  it("shows the uradora indicator when a riichi win reveals it", () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const root = document.createElement("div");
    document.body.append(root);
    const app = new App(root);
    const model = (app as unknown as { model: { players: { riichi: boolean }[]; uraIndicators(): unknown } }).model;
    model.players[2]!.riichi = true;
    const counts = parseCounts("123456789p11133z");
    const tiles = buildTileSet().filter((tile) => tile.id % 4 < counts[tile.type]!);
    model.uraIndicators = () => [tiles[0]!];
    const scored = scoreHand({ handCounts: parseCounts("123456789p11133z"),
      melds: [{ kind: "chi", tiles: [9, 10, 11] }], winningTileType: 29,
      winType: "ron", seatWind: 29, roundWind: 28, riichi: false,
      dora: 1, honba: 0, riichiSticks: 1 });
    const win: WinInfo = { seat: 2, fromSeat: 1, winType: "ron", winningTile: tiles.at(-1)!,
      yaku: scored.yaku.map((y) => y.id), yakuDetails: scored.yaku, dora: scored.dora,
      han: scored.han, fu: scored.fu, yakumanMultiple: scored.yakumanMultiple,
      payments: [{ seat: 1, amount: scored.ronPoints! }], stickPoints: 1000,
      handTiles: tiles.slice(3, -1), winnerMelds: [{ kind: "chi", tiles: tiles.slice(0, 3) }] };
    const render = app as unknown as { fillWinBreakdown(card: HTMLElement, value: WinInfo): void };
    const card = document.createElement("div");
    render.fillWinBreakdown(card, win);
    expect(card.textContent).toContain("Uradora indicator");
    expect(card.textContent).not.toContain("Uradora indicators sit hidden");
  });
});
