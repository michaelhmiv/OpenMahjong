/**
 * Hidden-state enforcement (brief §5): the AI must be unable to reach
 * anything but the public view — enforced by API shape, not honor
 * system. Three layers of proof:
 *
 * 1. Static: every engine import in packages/ai/src uses the package
 *    specifier (never a path into engine internals), no source file
 *    mentions wall/game internals, and nothing uses Math.random.
 * 2. Type-level: the policy's parameters are exactly the engine's
 *    public view/context types (checked at compile time by usage).
 * 3. Runtime: the policy decides correctly on a deeply frozen view —
 *    it reads the view, it never writes to it or reaches past it.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createAiPolicy } from "../src/index.js";
import { makeCallCtx, makeTurnCtx, makeView, tilesOf } from "./view-helpers.js";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

function srcFiles(): { name: string; text: string }[] {
  return readdirSync(srcDir)
    .filter((f) => f.endsWith(".ts"))
    .map((name) => ({ name, text: readFileSync(join(srcDir, name), "utf8") }));
}

describe("hidden state is unreachable from the AI package", () => {
  it("src imports the engine only through its public package entry", () => {
    for (const { name, text } of srcFiles()) {
      const specifiers = [...text.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
      for (const spec of specifiers) {
        if (spec.startsWith(".")) {
          // Relative imports must stay inside the ai package.
          expect(spec, `${name} imports ${spec}`).not.toContain("engine");
        } else {
          expect(spec, `${name} imports ${spec}`).toBe("@openmahjong/engine");
        }
      }
    }
  });

  it("src never mentions engine internals or unseeded randomness", () => {
    const forbidden = [
      "liveWall",
      "deadWall",
      "createWall",
      "buildTileSet",
      "GameState",
      "PlayerState",
      "Math.random",
      "Date.now",
    ];
    for (const { name, text } of srcFiles()) {
      for (const token of forbidden) {
        expect(text.includes(token), `${name} must not reference ${token}`).toBe(false);
      }
    }
  });

  it("the policy's view exposes no hidden fields at runtime", () => {
    // Fabricate a view and assert its shape: own hand only, other
    // players reduced to counts + public state, wall as a count.
    const view = makeView({ hand: "234m345p678s234s11z" });
    expect(Object.keys(view).sort()).toEqual(
      [
        "currentTurn",
        "dealer",
        "doraIndicators",
        "hand",
        "honba",
        "kyoku",
        "melds",
        "players",
        "roundWind",
        "seat",
        "sticks",
        "wallRemaining",
      ].sort(),
    );
    for (const p of view.players) {
      expect(p).not.toHaveProperty("tiles");
      expect(p).not.toHaveProperty("hand");
    }
  });

  it("decides on a deeply frozen view (reads only, never writes)", () => {
    const deepFreeze = <T,>(value: T): T => {
      if (value !== null && typeof value === "object") {
        for (const v of Object.values(value)) deepFreeze(v);
        Object.freeze(value);
      }
      return value;
    };
    const ai = createAiPolicy();
    const view = deepFreeze(
      makeView({
        hand: "234m345p678s23s9m11z",
        discards: [undefined, "2p3z", undefined, undefined],
      }),
    );
    const drawn = view.hand.find((t) => t.type === 8)!;
    const action = ai.turn(view, deepFreeze(makeTurnCtx({ drawnTile: drawn })));
    expect(action.type).toBe("discard");

    // Call decisions see a 13-tile hand (the engine asks before any
    // draw); use a second frozen view in that shape.
    const callView = deepFreeze(
      makeView({ hand: "234m345p678s23s55z" }),
    );
    const tile = deepFreeze(tilesOf("5z")[0]!);
    const callAction = ai.call(
      callView,
      deepFreeze(makeCallCtx({ tile, fromSeat: 2, canPon: true })),
    );
    expect(["pass", "pon", "chi", "daiminkan", "ron"]).toContain(callAction.type);
  });
});
