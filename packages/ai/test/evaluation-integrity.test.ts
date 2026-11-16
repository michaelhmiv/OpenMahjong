import { describe, expect, it } from "vitest";
import { buildTileSet, type PlayerView } from "@openmahjong/engine";
import { countsOfTiles, visibleCounts } from "../src/index.js";
import { dangerOf, discardTypeSets, DANGER_SUJI } from "../src/danger.js";
import { makeView } from "./view-helpers.js";

describe("public information accounting", () => {
  it("counts a called discard once at its current location", () => {
    const view = makeView({ hand: "2345m345p678s23s99s" });
    const tiles = buildTileSet().filter((t) => t.type === 31);
    const called = tiles[0]!;
    const players = view.players.map((p) => p.seat === 1 ? {
      ...p, discards: [{ tile: called, called: true, riichiDeclaration: false }],
    } : p.seat === 2 ? {
      ...p, melds: [{ kind: "pon" as const, tiles: tiles.slice(0, 3), calledTile: called, calledFrom: 1 }],
    } : p);
    expect(visibleCounts({ ...view, players })[31]).toBe(3);
  });

});

describe("suji assumptions", () => {
  const danger = (view: PlayerView): number => dangerOf(
    13, view, countsOfTiles(view.hand), visibleCounts(view), discardTypeSets(view),
  );

  it("does not treat one partner as full suji for a middle tile", () => {
    // A discarded 2p rules out 34p ryanmen, but a 67p ryanmen still
    // wins on 5p. Both 2p and 8p must be genbutsu to cover both sides.
    const partial = makeView({ hand: "234m568p678s23s99s1z", riichi: [false, true], discards: [undefined, "2p"] });
    const complete = makeView({ hand: "234m568p678s23s99s1z", riichi: [false, true], discards: [undefined, "28p"] });
    expect(danger(partial)).toBeGreaterThan(DANGER_SUJI);
    expect(danger(complete)).toBe(DANGER_SUJI);
    expect(danger(complete)).toBeGreaterThan(0); // tanki/kanchan/shanpon remain
  });
});
