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
