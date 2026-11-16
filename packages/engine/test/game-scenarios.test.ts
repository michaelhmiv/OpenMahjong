/**
 * A4 scripted scenarios for the game state machine (brief §13): each
 * furiten form, head bump, every abortive draw, nagashi mangan, renchan
 * conditions, tobi, exhaustive-draw payments, chankan, rinshan, and the
 * basic calls — each proven against an exact scripted wall.
 */

import { describe, expect, it } from "vitest";
import {
  Game,
  type GameEvent,
  type Policy,
  type Tile,
  type Wall,
} from "../src/index.js";
import {
  buildScriptedWall,
  discardTypePolicy,
  scriptedPolicy,
  tsumogiriPolicy,
  types,
} from "./game-helpers.js";

// Tile type indices used below: 5p = 13, 2p = 10, 5s = 22, 8p = 16, 4s = 21.
const E = 27, S = 28, W = 29, N = 30, WH = 31, GR = 32, RD = 33;

function handEvents(events: readonly GameEvent[], n: number): GameEvent[] {
  const out: GameEvent[] = [];
  let seen = 0;
  for (const e of events) {
    if (e.type === "hand-start") {
      seen++;
      if (seen > n) break;
    }
    if (seen === n) out.push(e);
  }
  return out;
}

function handStarts(events: readonly GameEvent[]): GameEvent[] {
  return events.filter((e) => e.type === "hand-start");
}

/** Scores snapshot at the n-th hand-start (or final scores if fewer). */
function scoresAtHandStart(
  events: readonly GameEvent[],
  n: number,
  initial: number[] = [25000, 25000, 25000, 25000],
): number[] {
  const scores = [...initial];
  let seen = 0;
  for (const e of events) {
    if (e.type === "hand-start") {
      seen++;
      if (seen === n) return [...scores];
    }
    if (e.type === "score") scores[e.seat as number]! += e.delta as number;
  }
  return scores;
}

function tileTypeOf(wall: Wall, id: number): number {
  const tile = [...wall.liveWall, ...wall.deadWall].find((t) => t.id === id);
  return tile!.type;
}

const JUNK_A = "258m258p258s123z9s";
const JUNK_B = "369m369p369s4567z";
const JUNK_C = "147m147p147s1234z";

describe("wins, dealer rotation, renchan, honba", () => {
  it("dealer ron: renchan, honba accumulates and pays 300 on the next ron", () => {
    const makeWall = () =>
      buildScriptedWall({
        hands: [
          types("234m678p234s678s6p"), // dealer, tanki 6p, tanyao (no fives anywhere, no sanshoku)
          types("16p258m258s123z99m"), // holds a 6p
          types(JUNK_B),
          types(JUNK_C),
        ],
        draws: [RD, GR],
        indicators: [8], // 9m → dora 1m, absent from the dealer's hand
      });
    const policies: Policy[] = [
      tsumogiriPolicy({ ron: true }),
      discardTypePolicy(14), // discards the 6p
      tsumogiriPolicy(),
      tsumogiriPolicy(),
    ];
    const game = new Game({
      seed: "renchan",
      length: "east",
      policies,
      walls: [makeWall(), makeWall()],
    });
    const result = game.run();

    const wins = result.events.filter((e) => e.type === "win");
    expect(wins.length).toBeGreaterThanOrEqual(2);
    expect(wins[0]).toMatchObject({ seat: 0, winType: "ron", fromSeat: 1 });
    // The 6678p shape won on 6p takes the highest-scoring interpretation:
    // the winning tile joins the sequence (ryanmen), so the hand is pinfu
    // + tanyao, 2 han 30 fu → dealer ron 2,900 (the tanki reading would
    // be 1 han 40 fu = 1,500).
    expect(wins[0]!.payments).toEqual([{ seat: 1, amount: 2900 }]);
    // Second hand: same script, honba 1 → 2900 + 300.
    expect(wins[1]).toMatchObject({ seat: 0, winType: "ron", fromSeat: 1 });
    expect(wins[1]!.payments).toEqual([{ seat: 1, amount: 3200 }]);

    const starts = handStarts(result.events);
    expect(starts[1]).toMatchObject({ dealer: 0, honba: 1 });
    expect(scoresAtHandStart(result.events, 2)).toEqual([27900, 22100, 25000, 25000]);
    expect(scoresAtHandStart(result.events, 3)[1]).toBe(18900);
  });

  it("non-dealer ron: dealer rotates, honba resets", () => {
    const wall = buildScriptedWall({
      hands: [
        types(JUNK_A),
        types("234m234p234s678s5p"), // seat 1, tanki 5p
        types("15p369m369s456z77z"), // seat 2 holds a 5p
        types(JUNK_C),
      ],
      draws: [RD, GR, WH],
    });
    const policies: Policy[] = [
      tsumogiriPolicy(),
      tsumogiriPolicy({ ron: true }),
      discardTypePolicy(13),
      tsumogiriPolicy(),
    ];
    const result = new Game({ seed: "rotate", length: "east", policies, walls: [wall] }).run();
    const wins = handEvents(result.events, 1).filter((e) => e.type === "win");
    expect(wins).toHaveLength(1);
    expect(wins[0]).toMatchObject({ seat: 1, winType: "ron", fromSeat: 2 });
    expect(handStarts(result.events)[1]).toMatchObject({ dealer: 1, honba: 0 });
  });

  it("tobi: a player driven below zero ends the game after one hand", () => {
    const wall = buildScriptedWall({
      hands: [
        types("234m678p234s678s6p"),
        types("16p258m258s123z99m"),
        types(JUNK_B),
        types(JUNK_C),
      ],
      draws: [RD, GR],
      indicators: [8],
    });
    const policies: Policy[] = [
      tsumogiriPolicy({ ron: true }),
      discardTypePolicy(14),
      tsumogiriPolicy(),
      tsumogiriPolicy(),
    ];
    const result = new Game({
      seed: "tobi",
      length: "east",
      policies,
      walls: [wall],
      initialScores: [25000, 1000, 25000, 25000],
    }).run();
    expect(result.handsPlayed).toBe(1);
    expect(result.scores[1]).toBe(-1900); // 1,000 − 2,900 (pinfu reading, see renchan test)
    expect(result.events.some((e) => e.type === "game-end")).toBe(true);
    // Settlement is zero-sum over the regulation 100,000 pool; this game
    // started with 76,000, so the points sum to (76,000 − 100,000)/1000.
    const totalPoints = result.settlement.reduce((a, s) => a + s.points, 0);
    expect(totalPoints).toBeCloseTo(-24, 6);
  });
});

describe("furiten (A4)", () => {
  it("discard furiten: a wait in your own pond blocks ron on every wait", () => {
    const wall = buildScriptedWall({
      hands: [
        types(JUNK_A),
        types("234m234s678s34p55s"), // seat 1: ryanmen 2p/5p (2p: sanshoku, 5p: tanyao)
        types("15p369m369s456z77z"), // seat 2 holds a 5p
        types("12p147m147s345z66s"), // seat 3 holds a 2p
      ],
      draws: [RD, 13, GR, N], // seat 1 draws the 5p and discards it
    });
    const seat1Calls: unknown[] = [];
    const policies: Policy[] = [
      tsumogiriPolicy(),
      scriptedPolicy({
        turn(view, ctx) {
          if (ctx.drawnTile?.type === 13) return { type: "discard", tileId: ctx.drawnTile.id };
          return undefined;
        },
        call(view, ctx) {
          seat1Calls.push({ roundWind: view.roundWind, kyoku: view.kyoku, honba: view.honba, phase: ctx.phase, tileType: ctx.tile.type });
          return { type: "pass" };
        },
      }),
      discardTypePolicy(13),
      discardTypePolicy(10),
    ];
    const result = new Game({ seed: "discard-furiten", length: "east", policies, walls: [wall] }).run();

    const hand1 = handEvents(result.events, 1);
    // Seat 1 discarded the 5p (their own wait) …
    const seat1Discards = hand1.filter((e) => e.type === "discard" && e.seat === 1);
    expect(seat1Discards.some((e) => tileTypeOf(wall, e.tile as number) === 13)).toBe(true);
    // … seat 2 discarded a 5p and seat 3 a 2p …
    expect(hand1.some((e) => e.type === "discard" && e.seat === 2 && tileTypeOf(wall, e.tile as number) === 13)).toBe(true);
    expect(hand1.some((e) => e.type === "discard" && e.seat === 3 && tileTypeOf(wall, e.tile as number) === 10)).toBe(true);
    // … and seat 1 was never offered a ron in hand 1, and did not ron.
    expect(
      seat1Calls.filter(
        (c) =>
          (c as { kyoku: number; honba: number; roundWind: number; phase: string }).kyoku === 1 &&
          (c as { honba: number }).honba === 0 &&
          (c as { roundWind: number }).roundWind === 27 &&
          (c as { phase: string }).phase === "ron",
      ),
    ).toEqual([]);
    expect(hand1.some((e) => e.type === "win" && e.seat === 1 && e.winType === "ron")).toBe(false);
  });

  it("temporary furiten: passing a ron blocks the next discard, clears at your draw", () => {
    const wall = buildScriptedWall({
      hands: [
        types(JUNK_A),
        types("234m234s678s34p55s"), // seat 1: ryanmen 2p/5p
        types("12p258m258s123z99m"), // seat 2 holds a 2p
        types("15p369m369s456z77m"), // seat 3 holds a 5p
      ],
      // seat0, seat1, seat2 (discards 2p), seat3 (discards 5p), seat0,
      // seat1 (draws: furiten clears), seat2 draws a 5p and tsumogiris it.
      draws: [RD, WH, GR, N, S, E, 13],
    });
    const ronOffers: number[] = [];
    const policies: Policy[] = [
      tsumogiriPolicy(),
      scriptedPolicy({
        call(view, ctx) {
          if (ctx.phase !== "ron") return undefined;
          if (ronOffers.length < 2) ronOffers.push(ctx.tile.type);
          return ctx.tile.type === 13 ? { type: "ron" } : { type: "pass" };
        },
      }),
      discardTypePolicy(10),
      discardTypePolicy(13),
    ];
    const result = new Game({ seed: "temp-furiten", length: "east", policies, walls: [wall] }).run();

    // Offered the 2p (passed), NOT offered seat 3's 5p (temporary furiten),
    // then offered seat 2's second 5p after drawing — and took it.
    expect(ronOffers).toEqual([10, 13]);
    const wins = handEvents(result.events, 1).filter((e) => e.type === "win");
    expect(wins).toHaveLength(1);
    expect(wins[0]).toMatchObject({ seat: 1, winType: "ron", fromSeat: 2, winningTileType: 13 });
  });

  it("riichi furiten: passing a ron in riichi blocks ron for the whole hand", () => {
    // Seat 1 waits on a single White dragon (a true one-tile wait: no
    // suited tile can complete the hand). All four copies are accounted
    // for: one in seat 1's hand, two in seat 2's, one in seat 3's — so
    // seat 1 can never tsumo it either.
    const wall = buildScriptedWall({
      hands: [
        types(JUNK_A),
        types("234m234p345s678s5z"), // seat 1: tanki White dragon
        types("55z258m258s123z99m"), // seat 2 holds two White dragons
        types("369m369p369s146z5z"), // seat 3 holds the fourth
      ],
      draws: [RD, GR, N, S, W, E, 26],
    });
    const ronOffers: number[] = [];
    const policies: Policy[] = [
      tsumogiriPolicy(),
      scriptedPolicy(
        {
          call(view, ctx) {
            if (ctx.phase === "ron") {
              if (ronOffers.length < 1) ronOffers.push(ctx.tile.type);
              return { type: "pass" };
            }
            return undefined;
          },
        },
        tsumogiriPolicy({ riichi: true }),
      ),
      discardTypePolicy(WH),
      tsumogiriPolicy(),
    ];
    const result = new Game({ seed: "riichi-furiten", length: "east", policies, walls: [wall] }).run();

    const hand1 = handEvents(result.events, 1);
    expect(hand1.some((e) => e.type === "riichi" && e.seat === 1)).toBe(true);
    expect(hand1.some((e) => e.type === "score" && e.seat === 1 && e.delta === -1000)).toBe(true);
    // Seat 2 discarded both White dragons; seat 1 was offered exactly the first.
    expect(hand1.filter((e) => e.type === "discard" && e.seat === 2 && tileTypeOf(wall, e.tile as number) === WH)).toHaveLength(2);
    expect(ronOffers).toEqual([WH]);
    expect(hand1.some((e) => e.type === "win" && e.seat === 1)).toBe(false);
  });

  it("riichi + ippatsu ron collects the stick", () => {
    const wall = buildScriptedWall({
      hands: [
        types(JUNK_A),
        types("234m234p345s678s5p"),
        types("15p258m258s123z99m"),
        types(JUNK_B),
      ],
      draws: [WH, GR, RD],
      indicators: [8], // 9m → dora 1m, absent from seat 1's hand
      uraIndicators: [17, 18, 26, 32, 27], // dora 1p/2s/1s/red/south — all absent too
    });
    const policies: Policy[] = [
      tsumogiriPolicy(),
      tsumogiriPolicy({ riichi: true, ron: true }),
      discardTypePolicy(13),
      tsumogiriPolicy(),
    ];
    const result = new Game({ seed: "ippatsu", length: "east", policies, walls: [wall] }).run();
    const wins = handEvents(result.events, 1).filter((e) => e.type === "win");
    expect(wins).toHaveLength(1);
    expect(wins[0]).toMatchObject({ seat: 1, winType: "ron", fromSeat: 2, stickPoints: 1000 });
    // Declared on seat 1's first discard → double riichi. 4 han 40 fu
    // reaches the 2,000 basic-point cap → mangan, 8,000.
    expect(wins[0]!.yaku).toEqual(expect.arrayContaining(["double-riichi", "ippatsu", "tanyao"]));
    expect(wins[0]!.payments).toEqual([{ seat: 2, amount: 8000 }]);
    expect(scoresAtHandStart(result.events, 2)).toEqual([25000, 33000, 17000, 25000]);
  });
});

describe("head bump (A4)", () => {
  it("double ron resolves to the player nearest the discarder", () => {
    const wall = buildScriptedWall({
      hands: [
        types("15p258m258s123z99s"), // dealer holds a 5p, discards it first
        types("234m234p234s678s5p"), // tanki 5p
        types("345m345p345s678s5p"), // tanki 5p
        types(JUNK_B),
      ],
      draws: [RD],
    });
    const policies: Policy[] = [
      discardTypePolicy(13),
      tsumogiriPolicy({ ron: true }),
      tsumogiriPolicy({ ron: true }),
      tsumogiriPolicy(),
    ];
    const result = new Game({ seed: "head-bump", length: "east", policies, walls: [wall] }).run();
    const wins = handEvents(result.events, 1).filter((e) => e.type === "win");
    expect(wins).toHaveLength(1);
    expect(wins[0]).toMatchObject({ seat: 1, winType: "ron", fromSeat: 0 });
  });
});

describe("abortive draws (A4)", () => {
  it("suufon renda: the first four discards are the same wind", () => {
    const wall = buildScriptedWall({
      hands: [
        types("1z258m258p258s345z"),
        types("1z369m369p369s345z"),
        types("1z147m147p147s345z"),
        types("1z19m19p19s345z666s"),
      ],
      draws: [S, GR, RD, 0],
    });
    const policies: Policy[] = [0, 1, 2, 3].map(() => discardTypePolicy(E));
    const result = new Game({ seed: "suufon", length: "east", policies, walls: [wall] }).run();
    const drawn = handEvents(result.events, 1).filter((e) => e.type === "drawn-hand");
    expect(drawn).toHaveLength(1);
    expect(drawn[0]).toMatchObject({ kind: "abortive", abortive: "suufon-renda" });
    expect(handStarts(result.events)[1]).toMatchObject({ dealer: 0, honba: 1 });
  });

  it("suucha riichi: four riichi declarations abort the hand, sticks carry over", () => {
    const wall = buildScriptedWall({
      hands: [
        types("234m234p234s678s5p"),
        types("234m234p234s678s6p"),
        types("234m234p234s678s7p"),
        types("234m234p234s678s8p"),
      ],
      draws: [E, S, W, N],
    });
    const policies: Policy[] = [0, 1, 2, 3].map(() => tsumogiriPolicy({ riichi: true }));
    const result = new Game({ seed: "suucha", length: "east", policies, walls: [wall] }).run();
    const hand1 = handEvents(result.events, 1);
    expect(hand1.filter((e) => e.type === "riichi")).toHaveLength(4);
    const drawn = hand1.filter((e) => e.type === "drawn-hand");
    expect(drawn).toHaveLength(1);
    expect(drawn[0]).toMatchObject({ kind: "abortive", abortive: "suucha-riichi" });
    expect(handStarts(result.events)[1]).toMatchObject({ dealer: 0, honba: 1, sticks: 4 });
    expect(scoresAtHandStart(result.events, 2)).toEqual([24000, 24000, 24000, 24000]);
  });

  it("kyuushu kyuuhai: nine terminals/honors on the first draw, player's choice", () => {
    const wall = buildScriptedWall({
      hands: [types("19m19p19s1234567z"), types(JUNK_A), types(JUNK_B), types(JUNK_C)],
      draws: [1], // 2m — the hand still holds 13 terminal/honor types
    });
    const policies: Policy[] = [
      scriptedPolicy({
        turn(view, ctx) {
          if (ctx.canKyuushu) return { type: "kyuushu" };
          return undefined;
        },
      }),
      tsumogiriPolicy(),
      tsumogiriPolicy(),
      tsumogiriPolicy(),
    ];
    const result = new Game({ seed: "kyuushu", length: "east", policies, walls: [wall] }).run();
    const drawn = handEvents(result.events, 1).filter((e) => e.type === "drawn-hand");
    expect(drawn).toHaveLength(1);
    expect(drawn[0]).toMatchObject({ kind: "abortive", abortive: "kyuushu-kyuuhai" });
    expect(handStarts(result.events)[1]).toMatchObject({ dealer: 0, honba: 1 });
  });

  it("suukaikan: four kans by two players abort after the rinshan discard", () => {
    const wall = buildScriptedWall({
      hands: [
        types("4444m8888p234s55z"),
        types("5555s9999m234p66z"),
        types("258m256p123z789s5m"),
        types("368m369p456z147s2p"),
      ],
      draws: [E, GR, RD, N, S, RD],
      rinshan: [S, RD, E, N],
    });
    const kanPolicy = () =>
      scriptedPolicy({
        turn(view, ctx) {
          if (ctx.ankanOptions.length > 0) return { type: "ankan", tileType: ctx.ankanOptions[0]! };
          return undefined;
        },
      });
    const policies: Policy[] = [kanPolicy(), kanPolicy(), tsumogiriPolicy(), tsumogiriPolicy()];
    const result = new Game({ seed: "suukaikan", length: "east", policies, walls: [wall] }).run();
    const hand1 = handEvents(result.events, 1);
    expect(hand1.filter((e) => e.type === "kan")).toHaveLength(4);
    const drawn = hand1.filter((e) => e.type === "drawn-hand");
    expect(drawn).toHaveLength(1);
    expect(drawn[0]).toMatchObject({ kind: "abortive", abortive: "suukaikan" });
  });
});

describe("exhaustive draws (A4)", () => {
  it("tenpai/noten payments of 3,000, dealer tenpai renchan", () => {
    const wall = buildScriptedWall({
      hands: [
        types("234m234p234s678s5p"), // dealer, tenpai
        types("345m345p345s678s6p"), // tenpai
        types(JUNK_A), // noten
        types(JUNK_B), // noten
      ],
    });
    const policies: Policy[] = [0, 1, 2, 3].map(() => tsumogiriPolicy({ tsumo: false }));
    const result = new Game({ seed: "exhaustive", length: "east", policies, walls: [wall] }).run();
    const drawn = handEvents(result.events, 1).filter((e) => e.type === "drawn-hand");
    expect(drawn).toHaveLength(1);
    expect(drawn[0]).toMatchObject({ kind: "exhaustive", tenpai: [0, 1], nagashi: [] });
    expect(scoresAtHandStart(result.events, 2)).toEqual([26500, 26500, 23500, 23500]);
    expect(handStarts(result.events)[1]).toMatchObject({ dealer: 0, honba: 1 });
  });

  it("nagashi mangan replaces the tenpai exchange", () => {
    // Seat 1's 18 draws (turn positions 1, 5, 9, …, 69) are all terminals
    // or honors; a tsumogiri policy turns them into an all-T/H pond.
    const draws: (number | null)[] = new Array(70).fill(null);
    const seat1Draws = [0, 8, 9, 17, 26, 27, 28, 29, 30, 31, 32, 33, 0, 8, 9, 17, 26, 17];
    seat1Draws.forEach((t, k) => (draws[1 + 4 * k] = t));
    // The other seats' first draws are simples, so their ponds can never
    // qualify as nagashi themselves.
    draws[0] = 1; // 2m
    draws[2] = 2; // 3m
    draws[3] = 3; // 4m
    const wall = buildScriptedWall({
      hands: [
        types("234m234p234s678s5m"),
        types("19m19p19s123456z5z"), // seat 1: all terminals/honors
        types("345m345p345s678s6m"),
        types("456m456p456s789s7m"),
      ],
      draws,
    });
    // This fixture asserts the first hand's settlement. Stop at the
    // next hand rather than simulate unrelated random later hands;
    // complete-match termination is covered by the game soak suite.
    class FirstHandComplete extends Error {}
    const policies: Policy[] = [0, 1, 2, 3].map(() => {
      const base = tsumogiriPolicy({ tsumo: false });
      return { ...base, turn(view, ctx) {
        if (view.kyoku > 1) throw new FirstHandComplete();
        return base.turn(view, ctx);
      } };
    });
    const game = new Game({ seed: "nagashi", length: "east", policies, walls: [wall] });
    expect(() => game.run()).toThrow(FirstHandComplete);
    const drawn = handEvents(game.events, 1).filter((e) => e.type === "drawn-hand");
    expect(drawn).toHaveLength(1);
    expect(drawn[0]).toMatchObject({ kind: "exhaustive", nagashi: [1] });
    // Non-dealer nagashi mangan: dealer pays 4000, others 2000 (honba 0).
    expect(scoresAtHandStart(game.events, 2)).toEqual([21000, 33000, 23000, 23000]);
  });
});

describe("calls, chankan, rinshan", () => {
  it("pon: the caller melds and discards without drawing", () => {
    const wall = buildScriptedWall({
      hands: [
        types(JUNK_A),
        types("18p369m369s456z77p"), // seat 1 holds an 8p
        types("88p258m258s123z99m"), // seat 2 holds two 8p
        types(JUNK_C),
      ],
      draws: [RD, GR],
    });
    const policies: Policy[] = [
      tsumogiriPolicy(),
      discardTypePolicy(16),
      scriptedPolicy({
        call(view, ctx) {
          if (ctx.canPon) return { type: "pon" };
          return undefined;
        },
      }),
      tsumogiriPolicy(),
    ];
    const result = new Game({ seed: "pon", length: "east", policies, walls: [wall] }).run();
    const hand1 = handEvents(result.events, 1);
    const callIdx = hand1.findIndex((e) => e.type === "call" && e.kind === "pon");
    expect(callIdx).toBeGreaterThanOrEqual(0);
    expect(hand1[callIdx]).toMatchObject({ seat: 2, fromSeat: 1 });
    // The next discard after the pon is seat 2's, with no draw in between.
    const after = hand1.slice(callIdx + 1);
    const nextDiscard = after.find((e) => e.type === "discard");
    expect(nextDiscard).toMatchObject({ seat: 2 });
    expect(after.slice(0, after.indexOf(nextDiscard!)).some((e) => e.type === "draw" && e.seat === 2)).toBe(false);
  });

  it("chi: only the next player, forming a sequence", () => {
    const wall = buildScriptedWall({
      hands: [
        types("4s258m258p123z99m7p"), // dealer holds a 4s, discards it first
        types("35s234m234p678p66z"), // seat 1 holds 3s + 5s
        types(JUNK_A),
        types(JUNK_B),
      ],
      draws: [RD],
    });
    const policies: Policy[] = [
      discardTypePolicy(21),
      scriptedPolicy({
        call(view, ctx) {
          if (ctx.chiOptions.length > 0) return { type: "chi", tileIds: ctx.chiOptions[0]! };
          return undefined;
        },
      }),
      tsumogiriPolicy(),
      tsumogiriPolicy(),
    ];
    const result = new Game({ seed: "chi", length: "east", policies, walls: [wall] }).run();
    const calls = handEvents(result.events, 1).filter((e) => e.type === "call");
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0]).toMatchObject({ kind: "chi", seat: 1, fromSeat: 0 });
  });

  it("chankan: a shouminkan is robbed for the win", () => {
    const wall = buildScriptedWall({
      hands: [
        types("55s234m234p678p1z3s"), // seat 0: pair of 5s + shape
        types("234m234p678p34s55p"), // seat 1: ryanmen 2s/5s, tanyao
        types("258m248s123z789p6m"),
        types("5s369m369p456z77s9p"), // seat 3 holds and discards the third 5s
      ],
      draws: [WH, GR, RD, N, S, E, W, 22], // seat 0's second draw is the 4th 5s
    });
    const policies: Policy[] = [
      scriptedPolicy(
        {
          turn(view, ctx) {
            if (ctx.shouminkanOptions.includes(22)) return { type: "shouminkan", tileType: 22 };
            return undefined;
          },
          call(view, ctx) {
            if (ctx.canPon) return { type: "pon" };
            return undefined;
          },
        },
        discardTypePolicy(E),
      ),
      scriptedPolicy({
        call(view, ctx) {
          if (ctx.phase === "chankan") return { type: "ron" };
          return { type: "pass" }; // pass seat 3's 5s (temporary furiten clears at the draw)
        },
      }),
      tsumogiriPolicy(),
      discardTypePolicy(22),
    ];
    const result = new Game({ seed: "chankan", length: "east", policies, walls: [wall] }).run();
    const hand1 = handEvents(result.events, 1);
    expect(hand1.some((e) => e.type === "call" && e.kind === "pon" && e.seat === 0)).toBe(true);
    const wins = hand1.filter((e) => e.type === "win");
    expect(wins).toHaveLength(1);
    expect(wins[0]).toMatchObject({ seat: 1, winType: "ron", fromSeat: 0, chankan: true });
    expect(wins[0]!.yaku).toEqual(expect.arrayContaining(["chankan", "tanyao"]));
  });

  it("rinshan: a kan draw completes the hand for rinshan kaihou", () => {
    const wall = buildScriptedWall({
      hands: [
        types("9999p234m234s55p6s"),
        types(JUNK_A),
        types("258m258s123z678p6m"),
        types(JUNK_C),
      ],
      draws: [24], // 7s completes the ryanmen shape
      rinshan: [22], // 5s on the rinshan draw wins
    });
    const policies: Policy[] = [
      scriptedPolicy({
        turn(view, ctx) {
          if (ctx.ankanOptions.length > 0) return { type: "ankan", tileType: ctx.ankanOptions[0]! };
          if (ctx.canTsumo) return { type: "tsumo" };
          return undefined;
        },
      }),
      tsumogiriPolicy(),
      tsumogiriPolicy(),
      tsumogiriPolicy(),
    ];
    const result = new Game({ seed: "rinshan", length: "east", policies, walls: [wall] }).run();
    const wins = handEvents(result.events, 1).filter((e) => e.type === "win");
    expect(wins).toHaveLength(1);
    expect(wins[0]).toMatchObject({ seat: 0, winType: "tsumo" });
    expect(wins[0]!.yaku).toEqual(expect.arrayContaining(["rinshan"]));
  });

  it("an illegal riichi declaration is rejected", () => {
    const wall = buildScriptedWall({
      hands: [types(JUNK_A), types(JUNK_B), types(JUNK_C), types("258m258p258s123z9s")],
      draws: [RD],
    });
    const policies: Policy[] = [
      scriptedPolicy({
        turn(view, ctx) {
          return { type: "discard", tileId: ctx.drawnTile!.id, riichi: true };
        },
      }),
      tsumogiriPolicy(),
      tsumogiriPolicy(),
      tsumogiriPolicy(),
    ];
    const game = new Game({ seed: "illegal-riichi", length: "east", policies, walls: [wall] });
    expect(() => game.run()).toThrowError(/riichi not legal/);
  });
});
