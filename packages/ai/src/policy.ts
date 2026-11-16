/**
 * The slice-1 AI opponent (brief §6): one solid level, three layers in
 * priority order — efficiency core, hand-value judgment, basic defense.
 *
 * The policy is a pure function of the engine's public `PlayerView` plus
 * the decision context the engine hands it. It imports only view/action
 * types from the engine (enforced by test/hidden-state.test.ts): it
 * cannot see other hands, the wall, or any game internals. It uses no
 * randomness — ties break by fixed rules — so a game driven by this
 * policy is deterministic from its seed, like everything else here.
 *
 * The ~600–900 ms human-ish cadence from §6 is presentation: the client
 * delays applying actions. This module only computes, in <50 ms.
 */

import {
  countTiles,
  isTerminalOrHonor,
  type CallAction,
  type CallContext,
  type PlayerView,
  type Policy,
  type Tile,
  type TurnAction,
  type TurnContext,
} from "@openmahjong/engine";
import {
  countsOfTiles,
  doraWeightsOf,
  evaluateDiscards,
  isYakuhai,
  rankDiscardCandidates,
  shouldDeclareRiichi,
  valueProxy,
} from "./evaluate.js";
import {
  shantenChiitoitsuFast,
  shantenFast,
  shantenKokushiFast,
  shantenStandardFast,
  ukeireFast,
} from "./analysis.js";
import { riichiThreats, visibleCounts } from "./danger.js";


// ---------------------------------------------------------------------------
// The policy
// ---------------------------------------------------------------------------

export function createAiPolicy(): Policy {
  // Current contexts explicitly identify pon/kan and chi stages. Keep
  // the old repeat-ask inference only for callers supplying the v1
  // context shape. Versioned new-game decisions do not depend on it.
  const seenCallEvents = new Set<string>();
  const callEventKey = (view: PlayerView, ctx: CallContext): string =>
    [
      view.seat,
      ctx.fromSeat,
      ctx.tile.id,
      view.wallRemaining,
      view.kyoku,
      view.honba,
      view.sticks,
      view.players.map((p) => p.score).join(","),
      view.players.map((p) => p.discards.length).join(","),
      view.players.map((p) => p.melds.length).join(","),
      view.players.map((p) => (p.riichi ? 1 : 0)).join(""),
      view.hand.map((t) => t.type).join(","),
    ].join("|");

  return {
    turn(view: PlayerView, ctx: TurnContext): TurnAction {
      if (ctx.canTsumo) return { type: "tsumo" };

      const me = view.players[view.seat]!;
      const counts = countsOfTiles(view.hand);
      const melds = view.melds.length;

      // Kyuushu kyuuhai: take the redraw when the hand is going nowhere
      // and is not a plausible kokushi (brief §6: honest, simple play).
      if (ctx.canKyuushu) {
        const kokushi = shantenKokushiFast(counts);
        if (kokushi > 2 && shantenFast(counts, melds) >= 4) {
          return { type: "kyuushu" };
        }
      }

      // Kans. An ankan never opens the hand and (in riichi) the engine
      // only offers it when the waits are unchanged — take it unless the
      // hand is chasing chiitoitsu, which a kan would destroy.
      if (ctx.ankanOptions.length > 0) {
        const chasingChiitoitsu =
          melds === 0 &&
          shantenChiitoitsuFast(counts) < shantenStandardFast(counts, melds);
        if (!chasingChiitoitsu) {
          return { type: "ankan", tileType: ctx.ankanOptions[0]! };
        }
      }
      // A riichi player must tsumogiri (the engine enforces it too);
      // ankan above is the only exception, already handled.
      if (me.riichi) {
        return { type: "discard", tileId: ctx.drawnTile!.id };
      }
      // Shouminkan: free value in the open, but never hand a riichi
      // player a chankan chance while our own hand is not ready.
      if (ctx.shouminkanOptions.length > 0) {
        const threats = riichiThreats(view);
        if (threats.length === 0 || shantenFast(counts, melds) <= 0) {
          return { type: "shouminkan", tileType: ctx.shouminkanOptions[0]! };
        }
      }

      const candidates = evaluateDiscards(view, ctx);
      const chosen = rankDiscardCandidates(view, ctx, candidates)[0]!;

      if (ctx.riichiDiscardIds.includes(chosen.tile.id) && shouldDeclareRiichi(view, chosen)) {
        return { type: "discard", tileId: chosen.tile.id, riichi: true };
      }
      return { type: "discard", tileId: chosen.tile.id };
    },

    call(view: PlayerView, ctx: CallContext): CallAction {
      // Ron and chankan are always taken when the engine says they are
      // legal (its canRon already accounts for furiten and yaku).
      if (ctx.phase === "ron" || ctx.phase === "chankan") {
        return ctx.canRon ? { type: "ron" } : { type: "pass" };
      }
      const me = view.players[view.seat]!;
      // A riichi player calls nothing but ron.
      if (me.riichi) return { type: "pass" };
      if (!ctx.canPon && !ctx.canKan && ctx.chiOptions.length === 0) {
        return { type: "pass" };
      }

      // Prefer the engine's stage marker. Unversioned legacy callers
      // supplied identical contexts for both stages.
      const key = callEventKey(view, ctx);
      const repeatAsk = ctx.callStage === undefined && seenCallEvents.has(key);
      if (ctx.callStage === undefined && !repeatAsk) {
        if (seenCallEvents.size >= 4096) seenCallEvents.clear();
        seenCallEvents.add(key);
      }
      const chiPass = ctx.callStage === "chi" || (ctx.callStage === undefined && (repeatAsk || (!ctx.canPon && !ctx.canKan)));

      const counts = countsOfTiles(view.hand);
      const melds = view.melds.length;
      const shantenNow = shantenFast(counts, melds);
      const doraTypes = doraWeightsOf(view);
      const dora = valueProxy(view, counts, doraTypes);

      // Folding against riichi: do not open the hand to chase.
      if (riichiThreats(view).length > 0 && shantenNow >= 2) {
        return { type: "pass" };
      }

      // Pon: take it when it advances the hand and either the tile is
      // yakuhai, it reaches tenpai, or the hand is already open. A
      // closed hand with real riichi/dora potential stays closed for a
      // non-yakuhai pon that does not reach tenpai. (Pon/kan are only
      // legal in the pon/kan pass — never on a chi-pass repeat ask.)
      if (!chiPass && ctx.canPon) {
        const after = [...counts];
        after[ctx.tile.type]! -= 2;
        const afterShanten = shantenFast(after, melds + 1);
        const yakuhai = isYakuhai(ctx.tile.type, view);
        if (afterShanten < shantenNow) {
          const closedPotential = melds === 0 && dora >= 2;
          if ((yakuhai || afterShanten <= 0 || melds > 0) && !(closedPotential && !yakuhai && afterShanten > 0)) {
            return { type: "pon" };
          }
        } else if (afterShanten === shantenNow && afterShanten === 0 && yakuhai) {
          // Already tenpai (e.g. a shanpon wait): ponning the yakuhai
          // converts it to an open yakuhai tenpai — take it.
          return { type: "pon" };
        }
      }

      // Daiminkan: only to complete a yakuhai triplet into a kan when it
      // reaches tenpai — an open kan is a big commitment for slice 1.
      if (!chiPass && ctx.canKan && isYakuhai(ctx.tile.type, view)) {
        const after = [...counts];
        after[ctx.tile.type]! -= 3;
        if (shantenFast(after, melds + 1) <= 0) {
          return { type: "daiminkan" };
        }
      }

      // Chi: take the best sequence when it advances the hand to
      // 1-shanten or better, the hand is already open, or the hand is
      // clearly tanyao-shaped. A closed hand with riichi potential is
      // not opened for a marginal chi. (Chi is only legal in the chi
      // pass — see the pass detection above.)
      if (chiPass && ctx.chiOptions.length > 0) {
        let bestOption: readonly [number, number] | null = null;
        let bestShanten = shantenNow;
        let bestUkeire = -1;
        const visible = visibleCounts(view);
        for (const option of ctx.chiOptions) {
          const after = [...counts];
          for (const id of option) {
            const t = view.hand.find((h) => h.id === id)!;
            after[t.type]!--;
          }
          const s = shantenFast(after, melds + 1);
          if (s > bestShanten) continue;
          const u =
            countTiles(after) + 3 * (melds + 1) === 13
              ? ukeireFast(after, visible, melds + 1).totalRemaining
              : 0;
          if (s < bestShanten || u > bestUkeire) {
            bestShanten = s;
            bestUkeire = u;
            bestOption = option;
          }
        }
        if (bestOption !== null && bestShanten < shantenNow) {
          const tanyaoShaped =
            view.hand.every((t) => !isTerminalOrHonor(t.type)) &&
            !isTerminalOrHonor(ctx.tile.type);
          if (bestShanten <= 1 || melds > 0 || tanyaoShaped) {
            return { type: "chi", tileIds: bestOption };
          }
        }
      }

      return { type: "pass" };
    },
  };
}
