/**
 * Property tests: across hundreds of seeded random positions, every
 * action the AI returns must be legal against the context it was given
 * — a discard names a tile in hand, riichi is declared only on an
 * offered tile, calls stay within the offered options, and the
 * two-pass call protocol is respected (no chi on a first ask when
 * pon/kan were possible; only chi/pass on a repeat ask).
 *
 * Positions are dealt from one shuffled tile set per iteration, so
 * copy counts are always physically consistent.
 */

import { describe, expect, it } from "vitest";
import {
  buildTileSet,
  createRng,
  shanten,
  type CallContext,
  type PlayerView,
  type Tile,
  type TurnContext,
} from "@openmahjong/engine";
import { createAiPolicy } from "../src/index.js";
import { makeCallCtx, makeTurnCtx, makeView } from "./view-helpers.js";

const ITERATIONS = 400;

function notationOf(tiles: readonly Tile[]): string {
  // Rebuild a notation string from instances, grouped by suit. Honors
  // use z digits; a red five is written 0.
  const parts: string[] = [];
  const suits: [number, string][] = [
    [0, "m"],
    [9, "p"],
    [18, "s"],
  ];
  for (const [base, letter] of suits) {
    const ranks: string[] = [];
    for (const t of tiles.filter((x) => x.type >= base && x.type < base + 9)) {
      ranks.push(t.red ? "0" : String((t.type - base) + 1));
    }
    if (ranks.length > 0) parts.push(ranks.join("") + letter);
  }
  const honors: string[] = [];
  for (const t of tiles.filter((x) => x.type >= 27)) {
    honors.push(String(t.type - 27 + 1));
  }
  if (honors.length > 0) parts.push(honors.join("") + "z");
  return parts.join("");
}

describe("the AI only ever returns legal actions", () => {
  it(`across ${ITERATIONS} seeded random positions`, () => {
    const rng = createRng("ai-property");

    for (let iter = 0; iter < ITERATIONS; iter++) {
      // A fresh policy per position: the two-pass call memory must not
      // leak between unrelated fabricated positions.
      const ai = createAiPolicy();
      const deck = rng.shuffle(buildTileSet());
      let ptr = 0;
      const draw = (n: number): Tile[] => deck.slice(ptr, (ptr += n));

      const hand = draw(14);
      const oppDiscards: Tile[][] = [draw(6), draw(6), draw(6)];
      const indicators = draw(1);
      const myRiichi = rng.nextInt(6) === 0;
      const oppRiichi = [false, rng.nextInt(3) === 0, rng.nextInt(3) === 0, false];

      const view: PlayerView = makeView({
        hand: notationOf(hand),
        seat: 0,
        dealer: rng.nextInt(4),
        wallRemaining: 10 + rng.nextInt(55),
        doraIndicators: indicators.map((t) => t.type),
        discards: [
          undefined,
          notationOf(oppDiscards[0]!),
          notationOf(oppDiscards[1]!),
          notationOf(oppDiscards[2]!),
        ],
        riichi: [myRiichi, oppRiichi[1]!, oppRiichi[2]!, oppRiichi[3]!],
      });
      // makeView re-deals instances from notation; recover the actual
      // view tiles for id-based assertions.
      const viewHand = view.hand;
      const drawn = viewHand[viewHand.length - 1]!;

      // Fabricate a faithful turn context.
      const counts = new Array<number>(34).fill(0);
      for (const t of viewHand) counts[t.type]!++;
      const riichiDiscardIds = viewHand
        .filter((tile) => {
          if (myRiichi) return false;
          const after = [...counts];
          after[tile.type]!--;
          return shanten(after, 0) === 0;
        })
        .map((t) => t.id);
      const ankanOptions = [...new Set(viewHand.map((t) => t.type))].filter(
        (type) => counts[type] === 4,
      );
      const ctx: TurnContext = makeTurnCtx({
        drawnTile: drawn,
        riichiDiscardIds,
        ankanOptions,
      });

      const action = ai.turn(view, ctx);
      if (action.type === "discard") {
        expect(viewHand.some((t) => t.id === action.tileId)).toBe(true);
        if (action.riichi) {
          expect(riichiDiscardIds).toContain(action.tileId);
          expect(myRiichi).toBe(false);
        }
        if (myRiichi) expect(action.tileId).toBe(drawn.id);
      } else if (action.type === "ankan") {
        expect(ankanOptions).toContain(action.tileType);
      } else if (action.type === "shouminkan") {
        throw new Error("shouminkan without a pon meld in a fabricated view");
      } else if (action.type === "tsumo" || action.type === "kyuushu") {
        throw new Error(`${action.type} returned when the context forbids it`);
      }

      // Call decisions against a random discard from the next seat's
      // pond, with faithful options. Calls are asked on a 13-tile
      // hand, so fabricate the matching 13-tile view (same discards
      // and riichi flags, the drawn tile set aside).
      const callView: PlayerView = makeView({
        hand: notationOf(hand.slice(0, 13)),
        seat: 0,
        dealer: view.dealer,
        wallRemaining: view.wallRemaining,
        doraIndicators: indicators.map((t) => t.type),
        discards: [
          undefined,
          notationOf(oppDiscards[0]!),
          notationOf(oppDiscards[1]!),
          notationOf(oppDiscards[2]!),
        ],
        riichi: [myRiichi, oppRiichi[1]!, oppRiichi[2]!, oppRiichi[3]!],
      });
      const callHand = callView.hand;
      const discardTile = oppDiscards[0]![0]!;
      const handCounts = new Array<number>(34).fill(0);
      for (const t of callHand) handCounts[t.type]!++;
      const canPon = !myRiichi && handCounts[discardTile.type]! >= 2;
      const canKan = !myRiichi && handCounts[discardTile.type]! >= 3;
      const chiOptions: (readonly [number, number])[] = [];
      if (!myRiichi && discardTile.type < 27) {
        const rank = (discardTile.type % 9) + 1;
        const base = Math.floor(discardTile.type / 9) * 9;
        for (const [r1, r2] of [
          [rank - 2, rank - 1],
          [rank - 1, rank + 1],
          [rank + 1, rank + 2],
        ] as const) {
          if (r1 < 1 || r2 > 9) continue;
          const t1 = callHand.find((t) => t.type === base + r1 - 1);
          const t2 = callHand.find((t) => t.type === base + r2 - 1);
          if (t1 && t2) chiOptions.push([t1.id, t2.id]);
        }
      }
      const callCtx: CallContext = makeCallCtx({
        tile: discardTile,
        fromSeat: 3,
        canPon,
        canKan,
        chiOptions,
      });
      const first = ai.call(callView, callCtx);
      if (first.type === "pon") expect(canPon).toBe(true);
      if (first.type === "daiminkan") expect(canKan).toBe(true);
      if (first.type === "chi") {
        // Chi on a first ask is only legal when pon/kan were impossible
        // (the ask must have been the chi pass).
        expect(canPon).toBe(false);
        expect(canKan).toBe(false);
        expect(chiOptions).toContainEqual(first.tileIds);
      }
      if (first.type === "ron") throw new Error("ron without canRon");
      // A repeat ask is the chi pass: only chi/pass may come back.
      const second = ai.call(callView, callCtx);
      expect(["pass", "chi"]).toContain(second.type);
      if (second.type === "chi") {
        expect(chiOptions).toContainEqual(second.tileIds);
      }
    }
  });
});
