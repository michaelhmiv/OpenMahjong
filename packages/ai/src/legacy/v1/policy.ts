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
} from "@openmahjong/engine/legacy/v1";
import {
  bestByEfficiency,
  countsOfTiles,
  doraTypesOf,
  evaluateDiscards,
  isYakuhai,
  safestAmongBest,
  safestOverall,
  valueProxy,
  type DiscardCandidate,
} from "./evaluate.js";
import {
  shantenChiitoitsuFast,
  shantenFast,
  shantenKokushiFast,
  shantenStandardFast,
  ukeireFast,
  waitsFast,
} from "./analysis.js";
import { riichiThreats, visibleCounts } from "./danger.js";


// ---------------------------------------------------------------------------
// Riichi decision
// ---------------------------------------------------------------------------

function shouldDeclareRiichi(
  view: PlayerView,
  chosen: DiscardCandidate,
): boolean {
  const counts = countsOfTiles(view.hand);
  counts[chosen.type]!--;
  // The discarded tile joins the visible pool once it lands.
  const visible = visibleCounts(view);
  visible[chosen.type]!++;
  const waits = waitsFast(counts, visible, view.melds.length);
  const liveWaits = waits.reduce((a, w) => a + w.remaining, 0);
  if (liveWaits === 0) return false;
  // Bad waits are not declared into late in the hand (brief §6 layer 2).
  if (liveWaits === 1 && view.wallRemaining < 24) return false;
  // Damaten: a closed hand already worth mangan-class points without
  // riichi keeps its options open instead of paying 1,000 to announce.
  const doraTypes = doraTypesOf(view);
  if (view.melds.length === 0 && valueProxy(view, countsOfTiles(view.hand), doraTypes) >= 5) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// The policy
// ---------------------------------------------------------------------------

export function createAiPolicy(): Policy {
  // The engine's discard window asks about a discard in two passes with
  // the same CallContext shape: a pon/kan pass (chi is illegal there —
  // the engine throws) and then a chi pass for the next player only
  // (pon/kan are illegal there). The context does not say which pass an
  // ask belongs to, so the policy remembers the asks it has answered
  // for the current discard event: a repeat ask with an identical
  // state fingerprint is the chi pass. (Flagged in the AI-slice PR: an
  // engine-side pass marker would remove the need for this.)
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
      const threats = riichiThreats(view);
      const bestOverall = bestByEfficiency(candidates);
      const folding =
        threats.length > 0 &&
        bestOverall.shantenAfter !== 0 &&
        !(bestOverall.shantenAfter === 1 && wantsToPush(view, counts));

      // Among equally shanten-optimal discards, prefer one that keeps
      // the riichi declaration available — the option is valuable even
      // when we end up not using it. (Not when folding: safety rules.)
      let pool = candidates;
      if (!folding && ctx.riichiDiscardIds.length > 0) {
        const minShanten = Math.min(...candidates.map((c) => c.shantenAfter));
        const riichiPool = candidates.filter(
          (c) =>
            c.shantenAfter === minShanten &&
            ctx.riichiDiscardIds.includes(c.tile.id),
        );
        if (riichiPool.length > 0) pool = riichiPool;
      }

      let chosen: DiscardCandidate;
      if (threats.length === 0) {
        chosen = bestByEfficiency(pool);
      } else if (folding) {
        // Fold: break the hand if that is what safety requires.
        chosen = safestOverall(candidates);
      } else {
        // Pushing (tenpai, or 1-shanten with a hand worth having):
        // efficiency first, safety as the tie-break within it.
        chosen = safestAmongBest(pool);
      }

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

      // Which pass is this? A repeat ask for the same discard event is
      // the chi pass, where only chi/pass are legal. A first ask where
      // pon/kan are impossible can only be the chi pass too (the pon
      // pass skips players who can neither pon nor kan).
      const key = callEventKey(view, ctx);
      const repeatAsk = seenCallEvents.has(key);
      if (!repeatAsk) {
        if (seenCallEvents.size >= 4096) seenCallEvents.clear();
        seenCallEvents.add(key);
      }
      const chiPass = repeatAsk || (!ctx.canPon && !ctx.canKan);

      const counts = countsOfTiles(view.hand);
      const melds = view.melds.length;
      const shantenNow = shantenFast(counts, melds);
      const doraTypes = doraTypesOf(view);
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
      if (!repeatAsk && ctx.canPon) {
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
      if (!repeatAsk && ctx.canKan && isYakuhai(ctx.tile.type, view)) {
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

/** Push/fold judgment for a 1-shanten hand facing riichi (brief §6):
 *  push when the hand is closed (riichi of our own is live) or carries
 *  at least two dora of value. */
function wantsToPush(view: PlayerView, counts: readonly number[]): boolean {
  if (view.melds.length === 0) return true;
  return valueProxy(view, counts, doraTypesOf(view)) >= 2;
}
