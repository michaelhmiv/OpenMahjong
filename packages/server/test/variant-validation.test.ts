import { randomUUID } from "node:crypto";
import { describe, it, expect } from "vitest";
import { validateGame, validateResume } from "../src/validate.js";
import { MemoryStore } from "../src/memory-store.js";
import {
  TABLE_PRESETS,
  calculateDraft,
  validateScoringSession,
} from "@openmahjong/engine";
const profiles = {
  "hong-kong": "openmahjong-hkos",
  mcr: "openmahjong-mcr-2006",
  taiwanese: "openmahjong-taiwanese-every-flower",
} as const;
describe("client/server variant identity contract", () => {
  for (const variant of ["hong-kong", "mcr", "taiwanese"] as const)
    it(`accepts and carries ${variant} through history, full-length resume and isolated statistics`, async () => {
      const id = randomUUID(),
        log = {
          v: 3,
          engineVersion: 3,
          aiVersion: 1,
          variant,
          ruleset: { id: profiles[variant], version: 1 },
          seed: "server-identity",
          length: "full",
          humanSeat: 0,
          id,
          decisions: [],
        };
      const record = {
        id,
        variant,
        length: "full",
        placement: 1,
        score: 1000,
        finishedAt: "2026-11-17T00:00:00Z",
        log,
        stats: {
          hands: 16,
          riichi: 0,
          dealIns: 1,
          handsWon: 2,
          winPoints: 120,
        },
      };
      const game = validateGame(record);
      expect(game.variant).toBe(variant);
      expect(game.log).toEqual(log);
      expect(
        validateResume({ state: log, savedAt: "2026-11-17T00:00:00Z" }).state,
      ).toEqual(log);
      const store = new MemoryStore(),
        user = await store.upsertUser({
          googleSub: `synthetic-${variant}`,
          name: "Fixture",
          avatarUrl: null,
        });
      await store.insertGame(user.id, game);
      expect((await store.listGames(user.id, 10))[0]!.variant).toBe(variant);
      expect((await store.getStats(user.id, variant)).games).toBe(1);
      expect((await store.getStats(user.id)).games).toBe(0);
      for (const changed of [
        { ...log, engineVersion: 2 },
        { ...log, aiVersion: 2 },
        { ...log, ruleset: { id: profiles[variant], version: 2 } },
        { ...log, ruleset: { id: variant, version: 1 } },
        { ...log, length: ["full"] },
        { ...log, decisions: [{ type: "discard", tileId: 0, riichi: false }] },
      ])
        expect(() => validateGame({ ...record, log: changed })).toThrow();
      expect(() => validateGame({ ...record, variant: "american" })).toThrow();
      expect(() =>
        validateGame({ ...record, stats: { ...record.stats, riichi: 1 } }),
      ).toThrow();
    });
  it("validates all variant ledgers with the same tile/fast scorers rather than accepting arbitrary payment totals", () => {
    for (const preset of [
      "hong-kong-clear@1",
      "mcr-2006@1",
      "taiwanese-every-flower@1",
    ] as const) {
      const def = TABLE_PRESETS[preset],
        context = {
          winner: 0,
          payer: 1,
          dealer: 0,
          winType: "ron" as const,
          honba: 0,
        };
      const input =
        def.variant === "hong-kong"
          ? {
              variant: def.variant,
              path: "fast" as const,
              context,
              fan: 3,
              settings: {
                minimum: 3,
                cap: 10,
                table: "half-spicy" as const,
                split: "clear-chapter" as const,
              },
            }
          : def.variant === "mcr"
            ? {
                variant: def.variant,
                path: "fast" as const,
                context,
                fan: 8,
                flowers: 2,
              }
            : {
                variant: def.variant,
                path: "fast" as const,
                context,
                tai: 3,
                settings: { base: 30, unit: 10 },
              };
      const draft = { input, corrections: [] };
      expect(calculateDraft(draft).payments.length).toBeGreaterThan(0);
      const session = {
        v: 1,
        id: "bounded-variant",
        variant: def.variant,
        preset,
        names: ["A", "B", "C", "D"],
        startingScores: [
          def.startingScore,
          def.startingScore,
          def.startingScore,
          def.startingScore,
        ],
        settings: def.settings,
        revision: 1,
        updatedAt: "2026-11-17T00:00:00Z",
        finished: false,
        ledger: [
          {
            id: "one",
            kind: "set",
            recordId: "hand-one",
            event: { kind: "win", wins: [draft] },
          },
        ],
      };
      expect(validateScoringSession(session).variant).toBe(def.variant);
      expect(() =>
        validateScoringSession({
          ...session,
          ledger: [
            {
              ...session.ledger[0],
              event: {
                kind: "win",
                wins: [
                  { ...draft, payments: [{ from: 0, to: 1, amount: 99999 }] },
                ],
              },
            },
          ],
        }),
      ).toThrow();
    }
  });
});
