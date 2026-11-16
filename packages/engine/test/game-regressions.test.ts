/** Independently constructed regressions for audit findings; no seed oracle. */
import { describe, expect, it } from "vitest";
import { Game, type GameEvent, type Policy, type TurnContext, type PlayerView, type Wall } from "../src/index.js";
import { buildScriptedWall, scriptedPolicy, tsumogiriPolicy, types } from "./game-helpers.js";

const STOP = new Error("first hand complete");
const PASS = tsumogiriPolicy({ tsumo: false });
const JUNK_A = "258m258p258s123z9s";
const JUNK_B = "369m369p369s4567z";
const JUNK_C = "147m147p147s1234z";

/** Stop when the next hand starts; the hand under test always runs in full. */
function firstHand(wall: Wall, policies: Policy[]): GameEvent[] {
  let game: Game;
  const wrap = (policy: Policy): Policy => {
    const check = () => {
      if (game.events.filter((e) => e.type === "hand-start").length > 1) throw STOP;
    };
    return {
      turn(view, ctx) { check(); return policy.turn(view, ctx); },
      call(view, ctx) { check(); return policy.call(view, ctx); },
    };
  };
  game = new Game({ seed: "audit-regression", length: "east", walls: [wall], policies: policies.map(wrap) });
  try { game.run(); } catch (error) { if (error !== STOP) throw error; }
  const second = game.events.findIndex((e) => e.type === "hand-start" && e.kyoku !== 1 || e.type === "hand-start" && e.honba !== 0);
  return second < 0 ? game.events : game.events.slice(0, second);
}

// Full-hand fixtures are intentionally allowed enough time on small CI machines.
describe("kan and call legality regressions", () => {
  it("moves one live-wall tail tile into the dead wall for every rinshan draw", () => {
    const wall = buildScriptedWall({
      hands: [types("9999p234m234s55p6s"), types(JUNK_A), types("258m258s123z678p6m"), types(JUNK_C)],
      draws: [24], rinshan: [27],
    });
    let called = false;
    const observedRemaining: number[] = [];
    const kan = scriptedPolicy({ turn(view, ctx) {
      if (!called && ctx.ankanOptions.includes(17)) {
        called = true;
        observedRemaining.push(view.wallRemaining);
        return { type: "ankan", tileType: 17 };
      }
      if (ctx.rinshan) observedRemaining.push(view.wallRemaining);
      return undefined;
    } }, PASS);
    const events = firstHand(wall, [kan, PASS, PASS, PASS]);
    const draws = events.filter((e) => e.type === "draw");
    expect(events.some((e) => e.type === "drawn-hand" && e.kind === "exhaustive")).toBe(true);
    expect(draws.filter((e) => e.rinshan === true)).toHaveLength(1);
    expect(draws.filter((e) => e.rinshan === false)).toHaveLength(69);
    expect(draws.map((e) => e.tile)).not.toContain(wall.liveWall.at(-1)!.id);
    expect(observedRemaining).toEqual([69, 68]);
  }, 60_000);

  it("permits a drawn-tile ankan after riichi when the original waits are unchanged, and cancels ippatsu", () => {
    const wall = buildScriptedWall({
      hands: [types("111m234p678s55p34s"), types(JUNK_A), types(JUNK_B), types("247m168p159s567z9p")],
      draws: [27, 28, 29, 30, 0], rinshan: [22],
    });
    let legal = false;
    const riichiKan = scriptedPolicy({ turn(_view, ctx) {
      if (ctx.ankanOptions.includes(0)) { legal = true; return { type: "ankan", tileType: 0 }; }
      return undefined;
    } }, tsumogiriPolicy({ riichi: true }));
    const events = firstHand(wall, [riichiKan, PASS, PASS, PASS]);
    expect(legal).toBe(true);
    expect(events.some((e) => e.type === "kan" && e.kind === "ankan")).toBe(true);
    const win = events.find((e) => e.type === "win")!;
    expect(win).toMatchObject({ seat: 0, winType: "tsumo" });
    expect(win.yaku).toEqual(expect.arrayContaining(["double-riichi", "rinshan"]));
    expect(win.yaku).not.toContain("ippatsu");
  }, 60_000);

  it("never offers a riichi player an open meld", () => {
    const wall = buildScriptedWall({
      hands: [types("111m234p678s55p34s"), types(JUNK_A), types(JUNK_B), types("247m168p159s567z9p")],
      draws: [27, 0, 28, 29],
    });
    let offered = false;
    const riichi = scriptedPolicy({ call(view, ctx) {
      if (view.players[0]!.riichi && ctx.phase === "call") offered = true;
      return { type: "pass" };
    } }, tsumogiriPolicy({ riichi: true, tsumo: false }));
    const events = firstHand(wall, [riichi, PASS, PASS, PASS]);
    expect(events.some((e) => e.type === "riichi" && e.seat === 0)).toBe(true);
    expect(offered).toBe(false);
  }, 60_000);

  it("rejects a riichi ankan that removes the newly drawn tile from the original waits", () => {
    // Before the draw, 7778899p can finish on 7p, 8p or 9p. Declaring
    // 7777p changes that to only 8p/9p, so this kan must be barred.
    const wall = buildScriptedWall({
      hands: [types("234456m7778899p"), types(JUNK_A), types(JUNK_B), types("147m147s1234z258p")],
      draws: [27, 28, 29, 30, 15],
    });
    let checked = false;
    const observer = scriptedPolicy({ turn(view, ctx) {
      if (view.players[0]!.riichi && ctx.drawnTile?.type === 15) {
        checked = true;
        expect(ctx.canTsumo).toBe(true);
        expect(ctx.ankanOptions).not.toContain(15);
      }
      return undefined;
    } }, tsumogiriPolicy({ riichi: true, tsumo: false }));
    firstHand(wall, [observer, PASS, PASS, PASS]);
    expect(checked).toBe(true);
  }, 60_000);

  it("never offers a fifth kan after one player has made all four", () => {
    const wall = buildScriptedWall({
      hands: [types("111144447777m9p"), types("5555s234p678s11z9m"), types("369m368p369s4567z"), types("258m147p147s1234z")],
      draws: [17], rinshan: [17, 17, 28, 27],
    });
    let offeredAfterFour: TurnContext | undefined;
    const fourKan = scriptedPolicy({ turn(_view, ctx) {
      if (ctx.ankanOptions.length) return { type: "ankan", tileType: ctx.ankanOptions[0]! };
      return undefined;
    } }, PASS);
    const other = scriptedPolicy({ turn(view, ctx) {
      if (view.doraIndicators.length === 5 && !offeredAfterFour) offeredAfterFour = ctx;
      return undefined;
    } }, PASS);
    const events = firstHand(wall, [fourKan, other, PASS, PASS]);
    expect(events.filter((e) => e.type === "kan")).toHaveLength(4);
    expect(offeredAfterFour).toBeDefined();
    expect(offeredAfterFour!.ankanOptions).toEqual([]);
    expect(offeredAfterFour!.shouminkanOptions).toEqual([]);
    expect(events.some((e) => e.type === "drawn-hand" && e.kind === "exhaustive")).toBe(true);
    expect(events.filter((e) => e.type === "draw")).toHaveLength(70);
  }, 60_000);

  it("bars kans on the last live-wall draw and bars all meld calls on the final discard", () => {
    const draws: (number | null)[] = new Array(70).fill(null);
    draws[69] = 30;
    const wall = buildScriptedWall({
      hands: [types(JUNK_A), types("1111m234p567s66z9p"), types(JUNK_B), types("247m168p159s345z9p")], draws,
    });
    let lastTurn: TurnContext | undefined;
    let callsOnLast = 0;
    const observers = [0, 1, 2, 3].map((seat) => scriptedPolicy({
      turn(view, ctx) { if (view.wallRemaining === 0 && seat === 1) lastTurn = ctx; return undefined; },
      call(view, ctx) { if (view.wallRemaining === 0 && ctx.phase === "call") callsOnLast++; return { type: "pass" }; },
    }, PASS));
    firstHand(wall, observers);
    expect(lastTurn).toBeDefined();
    expect(lastTurn!.ankanOptions).toEqual([]);
    expect(lastTurn!.shouminkanOptions).toEqual([]);
    expect(callsOnLast).toBe(0);
  }, 60_000);
});

describe("furiten and physical waits", () => {
  it("passing a yaku-less completing tile imposes temporary furiten until the next draw", () => {
    const wall = buildScriptedWall({
      hands: [types(JUNK_A), types("123m456p789s55m66z"), types("369m369p369s3457z"), types(JUNK_C)],
      draws: [33, 31, 4, 32, 27, 30, 32],
    });
    const events = firstHand(wall, [PASS, tsumogiriPolicy({ ron: true, tsumo: false }), PASS, PASS]);
    const wins = events.filter((e) => e.type === "win");
    expect(wins).toHaveLength(1);
    expect(wins[0]).toMatchObject({ seat: 1, fromSeat: 2, winningTileType: 32 });
    // The intervening green-dragon discard from seat3 must not be won.
    expect(events.some((e) => e.type === "discard" && e.seat === 3 && Math.floor((e.tile as number) / 4) === 32)).toBe(true);
    expect(wins[0]!.yaku).toContain("yakuhai-hatsu");
  }, 60_000);

  it("does not call a fifth-owned-copy wait tenpai or allow riichi on it", () => {
    const wall = buildScriptedWall({
      hands: [types("3333m12m456p789s5p"), types(JUNK_A), types("269m369p369s4567z"), types(JUNK_C)],
      draws: [13], rinshan: [27],
    });
    let replacement: TurnContext | undefined;
    const kan = scriptedPolicy({ turn(_view, ctx) {
      if (ctx.ankanOptions.includes(2)) return { type: "ankan", tileType: 2 };
      if (ctx.rinshan) replacement = ctx;
      return undefined;
    } }, PASS);
    const events = firstHand(wall, [kan, PASS, PASS, PASS]);
    expect(replacement).toBeDefined();
    expect(replacement!.riichiDiscardIds).toEqual([]);
    const draw = events.find((e) => e.type === "drawn-hand")!;
    expect(draw).toMatchObject({ kind: "exhaustive" });
    expect(draw.tenpai).not.toContain(0);
  }, 60_000);
});

describe("riichi settlement and policy information integrity", () => {
  it("does not charge a riichi stake when the declaration discard deals in", () => {
    const wall = buildScriptedWall({
      hands: [types("234m234p234s678s5p"), types("345m345p345s678p6s"), types(JUNK_A), types(JUNK_B)],
      draws: [23], // 6s is both seat1's tanki wait and an eligible riichi discard for seat0
      indicators: [30],
    });
    const events = firstHand(wall, [tsumogiriPolicy({ riichi: true, tsumo: false }), tsumogiriPolicy({ ron: true }), PASS, PASS]);
    expect(events.find((e) => e.type === "discard")).toMatchObject({ seat: 0, riichi: true });
    const win = events.find((e) => e.type === "win")!;
    expect(win).toMatchObject({ seat: 1, fromSeat: 0, stickPoints: 0 });
    expect(events.filter((e) => e.type === "riichi" && e.seat === 0)).toEqual([]);
    expect(events.filter((e) => e.type === "score" && e.seat === 0)).toHaveLength(1);
    expect(events.find((e) => e.type === "score" && e.seat === 0)!.delta).toBe(-((win.payments as {amount:number}[])[0]!.amount));
  }, 60_000);

  it("returns detached decision-time snapshots that policies cannot mutate", () => {
    const wall = buildScriptedWall({ hands: [types(JUNK_A), types(JUNK_B), types(JUNK_C), types("258m258p258s123z9s")] });
    let captured: PlayerView | undefined;
    let laterDiscards = 0;
    let indicatorType = -1;
    const observer = scriptedPolicy({ turn(view, ctx) {
      if (!captured) {
        captured = view;
        // Runtime JS can ignore TypeScript readonly; copies must protect the engine.
        (view.hand[0] as {type:number}).type = 99;
        (view.players[0]!.discards as unknown[]).push({});
        indicatorType = view.doraIndicators[0]!.type;
        (view.doraIndicators[0] as {type:number}).type = 99;
      } else {
        laterDiscards = view.players[0]!.discards.length;
        expect(view.doraIndicators[0]!.type).toBe(indicatorType);
      }
      return { type: "discard", tileId: ctx.drawnTile!.id };
    } }, PASS);
    const events = firstHand(wall, [observer, PASS, PASS, PASS]);
    expect(laterDiscards).toBeGreaterThan(1);
    expect(captured!.players[0]!.discards).toHaveLength(1); // the injected local object only
    expect(events.filter((e) => e.type === "discard")).toHaveLength(70);
  }, 60_000);
});
