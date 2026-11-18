import { describe, it, expect } from "vitest";
import {
  Game,
  VariantGame,
  buildTileSet,
  variantAdapter,
  LIVE_WALL_SIZE,
} from "@openmahjong/engine";
import { createAiPolicy, createVariantPolicy } from "@openmahjong/ai";
import { TableEngine, newJournal, type Format } from "../src/online/match.js";
import { buildScriptedWall, types } from "../../engine/test/game-helpers.js";

const formats: Format[] = [];
for (const variant of ["riichi", "hong-kong", "mcr", "taiwanese"] as const) {
  for (const length of ["east", "south", "full"] as const) {
    if (variant !== "riichi" || length !== "full")
      formats.push({ variant, length, pace: "correspondence" });
  }
}

describe("authoritative matches", () => {
  it.each(formats)(
    "completes $variant $length, reproduces the synchronous rules and restores every wall",
    (f) => {
      const j = newJournal();
      let table = new TableEngine(f, j);
      const policies = Array.from({ length: 4 }, () =>
        f.variant === "riichi" ? createAiPolicy() : createVariantPolicy(),
      );
      while (!table.result) {
        if (
          j.checkpoint &&
          j.checkpoint.step === j.steps.length &&
          j.steps.length > 0
        ) {
          const fast = new TableEngine(f, structuredClone(j), false, true);
          expect(fast.choices).toEqual(table.choices);
          for (let seat = 0; seat < 4; seat++)
            expect(fast.view(seat)).toEqual(table.view(seat));
        }
        if (j.steps.length === 23)
          table = new TableEngine(f, structuredClone(j));
        table.attach(j);
        table.choices.forEach((options, seat) => {
          if (!options.length) return;
          const action = table.automatic(seat, true);
          expect(options).toContainEqual(action);
          j.answers[seat] = { action, by: "bot" };
        });
        table.commit(j);
      }
      const inventory =
        f.variant === "riichi"
          ? buildTileSet()
          : variantAdapter(f.variant).inventory();
      const tiles = new Map(inventory.map((t) => [t.id, t]));
      for (const ids of j.walls)
        expect(new Set(ids)).toEqual(new Set(tiles.keys()));
      const wall = (i: number) => j.walls[i]!.map((id) => tiles.get(id)!);
      const reference =
        f.variant === "riichi"
          ? new Game({
              policies,
              seed: "online",
              length: f.length as "east" | "south",
              wallFactory: (i) => ({
                liveWall: wall(i).slice(0, LIVE_WALL_SIZE),
                deadWall: wall(i).slice(LIVE_WALL_SIZE),
              }),
            })
          : new VariantGame({
              policies,
              seed: "online",
              variant: f.variant,
              length: f.length,
              wallFactory: wall,
            });
      expect(table.result!.events).toEqual(reference.run().events);
      const restored = new TableEngine(f, structuredClone(j));
      expect(restored.result).toEqual(table.result);
      const damaged = structuredClone(j);
      damaged.walls.pop();
      expect(() => new TableEngine(f, damaged)).toThrow(
        /Missing committed wall/,
      );
    },
    120000,
  );

  it("keeps a chi private and provisional until the other eligible seat answers ron", () => {
    const w = buildScriptedWall({
      hands: [
        types("15p258m258s123z99s"),
        types("234m234p234s678s5p"),
        types("345m345p345s678s5p"),
        types("147m147p147s1234z"),
      ],
      draws: [33],
    });
    const j = newJournal();
    j.walls.push([...w.liveWall, ...w.deadWall].map((t) => t.id));
    const f: Format = {
      variant: "riichi",
      length: "east",
      pace: "correspondence",
    };
    const e = new TableEngine(f, j);
    const discard = e.view(0).hand.find((t) => t.type === 13)!;
    j.answers[0] = {
      action: { type: "discard", tileId: discard.id },
      by: "human",
    };
    e.commit(j);
    const chi = e.choices[1]!.find((a) => a.type === "chi")!;
    expect(chi).toBeDefined();
    expect(e.choices[2]).toContainEqual({ type: "ron" });
    j.answers[1] = { action: chi, by: "human" };
    expect(e.canAdvance(j.answers)).toBe(false);
    const paused = structuredClone(j),
      reverse = structuredClone(j);
    reverse.answers = { 2: { action: { type: "ron" }, by: "human" } };
    const other = new TableEngine(f, reverse);
    expect(other.canAdvance(reverse.answers)).toBe(false);
    reverse.answers[1] = { action: chi, by: "human" };
    other.commit(reverse);
    const restored = new TableEngine(f, paused);
    paused.answers[2] = { action: { type: "ron" }, by: "human" };
    restored.commit(paused);
    for (const game of [other, restored])
      expect(game.game.events.find((ev) => ev.type === "win")).toMatchObject({
        seat: 2,
        fromSeat: 0,
      });
  });
});
