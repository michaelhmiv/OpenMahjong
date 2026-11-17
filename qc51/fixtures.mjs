/** Audit B fixture generation: resumable saved-game records (game.v1 envelopes)
 * at a late-hand TURN state and a filled-pond CALL state for seat 0.
 * Riichi: policy-prefix capture during a real Game run (pattern from
 * scripts/browser-review-timeline.mjs). Variants: generator walk (pattern
 * from scripts/browser-variant-sizing.mjs). */
import { randomUUID } from "node:crypto";
import { Game, VariantGame } from "../packages/engine/dist/index.js";
import { createAiPolicy } from "../packages/ai/dist/index.js";

export function riichiRecords() {
  const seed = "audit-b-riichi";
  const decisions = [];
  const ai = createAiPolicy();
  let game = null;
  let bestTurn = null; // {decisions, ownPond, totalDiscards}
  let bestCall = null;
  const inHand1 = () =>
    game && game.events.filter((e) => e.type === "hand-start").length === 1;
  const snap = (view) => {
    const own = view.players[0].discards.filter((d) => !d.called).length;
    const total = view.players.reduce(
      (n, p) => n + p.discards.filter((d) => !d.called).length, 0);
    return { decisions: [...decisions], ownPond: own, totalDiscards: total };
  };
  const policy = {
    turn(view, ctx) {
      if (view.seat === 0 && inHand1()) {
        const s = snap(view);
        if (!bestTurn || s.totalDiscards >= bestTurn.totalDiscards) bestTurn = s;
      }
      const a = ai.turn(view, ctx);
      decisions.push(a);
      return a;
    },
    call(view, ctx) {
      if (view.seat === 0 && inHand1()) {
        const s = { ...snap(view), phase: ctx.phase, canPon: ctx.canPon, canKan: ctx.canKan, canRon: ctx.canRon, chi: ctx.chiOptions.length };
        // Prefer a real call-phase prompt (pon/chi/pass), then deepest ponds.
        const score = (c) => (c.phase === "call" ? 1000 : 0) + c.totalDiscards;
        if (!bestCall || score(s) >= score(bestCall)) bestCall = s;
      }
      const a = ai.call(view, ctx);
      decisions.push(a);
      return a;
    },
  };
  game = new Game({ seed, length: "east", policies: policy });
  game.run();
  const mk = (s) => ({
    v: 2, engineVersion: 2, aiVersion: 2,
    ruleset: { id: "openmahjong-riichi", version: 1 },
    seed, length: "east", humanSeat: 0, id: randomUUID(),
    decisions: s.decisions,
  });
  return {
    late: { record: mk(bestTurn), ownPond: bestTurn.ownPond, totalDiscards: bestTurn.totalDiscards },
    call: { record: mk(bestCall), ownPond: bestCall.ownPond, totalDiscards: bestCall.totalDiscards, phase: bestCall.phase, canPon: bestCall.canPon, canKan: bestCall.canKan, canRon: bestCall.canRon, chi: bestCall.chi },
  };
}

export function variantRecords(variant) {
  const seed = `audit-b-${variant}`;
  const game = new VariantGame({ variant, seed, length: "east" });
  const it = game.play();
  const decisions = [];
  let step = it.next();
  let bestTurn = null, bestCall = null;
  const discards = () =>
    game.events.filter((e) => /discard/.test(e.type)).length;
  while (!step.done && game.events.filter((e) => e.type === "hand-start").length === 1) {
    const req = step.value;
    if (req.view.seat === 0) {
      const record = {
        v: 3, engineVersion: 3, aiVersion: 1, variant,
        ruleset: { id: game.adapter.profileId, version: 1 },
        seed, length: "east", humanSeat: 0, id: randomUUID(),
        decisions: [...decisions],
      };
      const d = discards();
      if (req.kind === "turn") {
        if (!bestTurn || d >= bestTurn.discards) bestTurn = { record, discards: d };
      } else if (req.context.phase === "call") {
        if (!bestCall || d >= bestCall.discards)
          bestCall = { record, discards: d, canPon: req.context.canPon, canKan: req.context.canKan, canRon: req.context.canRon, chi: req.context.chiOptions?.length ?? 0 };
      }
    }
    const action = step.value.kind === "turn"
      ? { type: "discard", tileId: step.value.context.drawnTile?.id ?? step.value.view.legalDiscardIds[0] }
      : { type: "pass" };
    decisions.push(action);
    step = it.next(action);
  }
  return { late: bestTurn, call: bestCall };
}
