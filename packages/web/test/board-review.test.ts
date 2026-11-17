// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { GameEvent } from "@openmahjong/engine";
import { BoardTimeline, buildBoardReview } from "../src/board-review.js";
import { TableModel } from "../src/model.js";
import { mountBoardReview, mountGameDetail } from "../src/board-review-ui.js";
import { App } from "../src/app.js";
import { AiDriver } from "../src/drivers.js";
import { GameRunner } from "../src/runner.js";
import { saveGame, loadGame } from "../src/settings.js";

const fixture = JSON.parse(
  readFileSync("packages/web/test/fixtures/legacy-v1.json", "utf8"),
);
describe("indexed board history", () => {
  it("matches every event of a complete historical game in arbitrary seek order", () => {
    const timeline = buildBoardReview(fixture.saved);
    const expected = new TableModel(timeline.data.humanSeat);
    const snapshots: unknown[] = [];
    for (const event of timeline.data.events) {
      expected.apply(event, timeline.data.chiHints.get(event.seq));
      snapshots.push(structuredClone(expected));
    }
    for (let index = snapshots.length - 1; index >= 0; index--)
      expect(structuredClone(timeline.seek(index))).toEqual(snapshots[index]);
    timeline.seek(10).players[0]!.handIds.length = 0;
    expect(structuredClone(timeline.seek(10))).toEqual(snapshots[10]);
    expect(timeline.data.review.engineVersion).toBe(1);
    expect(() => timeline.seek(-1)).toThrow(RangeError);
  });
  it("tracks the exact chi instances and per-hand winner winds, including hands without human decisions", () => {
    const events: GameEvent[] = [
      {
        seq: 0,
        type: "hand-start",
        dealer: 1,
        roundWind: 27,
        kyoku: 2,
        honba: 0,
        sticks: 0,
      },
      { seq: 1, type: "deal", seat: 2, tiles: [0, 4, 12, 16] },
      { seq: 2, type: "deal", seat: 1, tiles: [8] },
      { seq: 3, type: "discard", seat: 1, tile: 8 },
      { seq: 4, type: "call", seat: 2, fromSeat: 1, kind: "chi", tileType: 2 },
      {
        seq: 5,
        type: "win",
        seat: 1,
        winType: "tsumo",
        winningTile: 20,
        han: 1,
        fu: 30,
        yaku: [],
        payments: [],
      },
      {
        seq: 6,
        type: "hand-start",
        dealer: 1,
        roundWind: 27,
        kyoku: 2,
        honba: 1,
        sticks: 0,
      },
      {
        seq: 7,
        type: "drawn-hand",
        kind: "exhaustive",
        tenpai: [],
        nagashi: [],
      },
    ];
    const timeline = new BoardTimeline({
      events,
      chiHints: new Map([[4, { tileIds: [12, 16] }]]),
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
    expect(
      timeline.seek(4).players[2]!.melds[0]!.tiles.map((t) => t.id),
    ).toEqual([8, 12, 16]);
    expect(timeline.seek(4).players[2]!.handIds).toEqual([0, 4]);
    expect(timeline.hands.map((h) => h.result)).toEqual([
      "Won by East",
      "No winner · Wall exhausted",
    ]);
    expect(timeline.hands[1]!.label).toBe("East 2 · Repeat 1");
    const root = document.createElement("div");
    mountGameDetail(
      root,
      timeline,
      () => {},
      () => {},
    );
    expect(root.querySelectorAll(".detail-hand")).toHaveLength(2);
    const ui = mountBoardReview(root, {
      timeline,
      handIndex: 1,
      renderTile: () => document.createElement("span"),
      onBack: () => {},
      onPractice: () => {},
    });
    expect(root.textContent).toContain("Board review");
    expect(root.querySelector('[aria-label="Hand timeline"]')).not.toBeNull();
    expect(ui.currentPosition).toBeNull();
    expect(root.querySelector(".learning-nav")).toBeNull();
    ui.destroy();
  });
  it("opening history preserves the active runner, resume bytes, and continuation", () => {
    localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      }),
    );
    const root = document.createElement("div");
    document.body.append(root);
    const app = new App(root) as unknown as {
      runner: GameRunner;
      openRecord: (r: unknown) => void;
    };
    const runner = new GameRunner({
      seed: "active-preserved",
      length: "east",
      aiDriver: new AiDriver(),
    });
    runner.advance();
    app.runner = runner;
    saveGame(runner.serialize());
    const bytes = JSON.stringify(loadGame()),
      pending = runner.pending;
    app.openRecord({ id: "historical", log: fixture.saved });
    expect(app.runner).toBe(runner);
    expect(runner.pending).toBe(pending);
    expect(JSON.stringify(loadGame())).toBe(bytes);
    expect(root.querySelector("#screen-details.active")).not.toBeNull();
    expect(root.querySelector<HTMLElement>(".tabbar")!.hidden).toBe(true);
    expect(root.querySelectorAll('[aria-label="Concealed tile"]')).toHaveLength(
      0,
    );
    root.querySelector<HTMLButtonElement>(".detail-hand")!.click();
    const range = root.querySelector<HTMLInputElement>(
      '[aria-label="Hand timeline"]',
    )!;
    range.value = String(Number(range.min) + 4);
    range.dispatchEvent(new Event("input"));
    expect(
      root.querySelectorAll('[aria-label="Concealed tile"]').length,
    ).toBeGreaterThan(0);
    expect(app.runner).toBe(runner);
    root.remove();
    vi.unstubAllGlobals();
  });
});

describe("same-event decision navigation", () => {
  it("visits both decisions attached to one public event and returns to the original decision", () => {
    const original = buildBoardReview(fixture.saved),
      first = original.data.review.positions[0]!;
    const position = { ...first, decisionIndex: 0 },
      second = { ...first, decisionIndex: 1 };
    const timeline = new BoardTimeline({
        ...original.data,
        review: { ...original.data.review, positions: [position, second] },
      }),
      root = document.createElement("div");
    const ui = mountBoardReview(root, {
      timeline,
      renderTile: () => document.createElement("span"),
      onBack: () => {},
      onPractice: () => {},
    });
    ui.goToDecision(0);
    expect(ui.currentPosition?.decisionIndex).toBe(0);
    const click = (name: string) =>
      [...root.querySelectorAll<HTMLButtonElement>("button")]
        .find((b) => b.textContent === name)!
        .click();
    click("Next decision");
    expect(ui.currentPosition?.decisionIndex).toBe(1);
    click("Previous decision");
    expect(ui.currentPosition?.decisionIndex).toBe(0);
    expect(timeline.decisionsByEvent.get(first.eventSequence)).toEqual([0, 1]);
    ui.destroy();
  });
});
