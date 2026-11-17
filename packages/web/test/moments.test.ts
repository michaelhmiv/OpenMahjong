/**
 * Coaching-moment log + Review tests (coaching remainder brief,
 * log-first dependency + A2/A3/A6 at the web level):
 *
 * - Moments (offers + choice) are recorded for human decisions and
 *   survive the serialize -> validate -> restore round trip.
 * - Every recorded moment verifies against its reconstructed Review
 *   position and grades; a game stripped of its moments grades
 *   discards only and reports its windows as not recorded.
 * - A passed ron grades with the furiten consequence — temporary
 *   for a silent player, permanent for a riichi player (A3).
 * - A declined tsumo records a win moment graded as a win choice.
 * - A tampered moment record grades nothing (unverified), and a
 *   moment whose choice disagrees with the log fails validation.
 */

import { describe, expect, it } from "vitest";

// Yield inside long decision loops so the vitest worker's event loop
// can service its progress RPC (see runner.test.ts).
const tick = () => new Promise<void>((r) => setTimeout(r, 0));
import type { CallAction, TurnAction } from "@openmahjong/engine";
import { adviseDiscard } from "@openmahjong/coach";
import { AiDriver } from "../src/drivers.js";
import { GameRunner, type SavedGame } from "../src/runner.js";
import { validateSavedGame } from "../src/replay.js";
import { analyzeReviewDecision, analyzeReviewMoments, buildDecisionReview } from "../src/review.js";
import { momentTexts } from "../src/moment-text.js";

function drivePending(runner: GameRunner, ai: AiDriver): void {
  const p = runner.pending;
  if (!p) throw new Error("expected a pending decision");
  if (p.kind === "turn") runner.act(ai.turn(p.view, p.ctx) as TurnAction);
  else runner.act(ai.call(p.view, p.ctx) as CallAction);
}

type Answerer = (runner: GameRunner, ai: AiDriver) => void;

/** Play until `stop` holds, the game ends, or the act budget runs out. */
async function playUntil(
  runner: GameRunner,
  ai: AiDriver,
  answer: Answerer,
  stop: () => boolean,
  maxActs = 3000,
): Promise<boolean> {
  let acts = 0;
  while (!runner.result && acts < maxActs && !stop()) {
    answer(runner, ai);
    acts++;
    if (acts % 25 === 0) await tick();
  }
  return stop();
}

const aiAnswer: Answerer = (runner, ai) => drivePending(runner, ai);

describe("coaching moments: recording and round trip", () => {
  it("records moments for a full game; every one verifies and grades in Review", async () => {
    const ai = new AiDriver();
    const runner = new GameRunner({ seed: "moments-scan-4", length: "east", humanSeat: 0, aiDriver: ai });
    runner.advance();
    await playUntil(runner, ai, aiAnswer, () => false);
    expect(runner.result).not.toBeNull();
    expect(runner.moments.length).toBeGreaterThan(0);
    // The log-first contract: choice equals the logged decision.
    for (const moment of runner.moments) {
      expect(moment.choice).toEqual(runner.decisions[moment.decisionIndex]);
    }
    const saved = JSON.parse(JSON.stringify(runner.serialize())) as SavedGame;
    const canonical = validateSavedGame(saved);
    expect(canonical.v).toBe(2);
    if (canonical.v === 2) expect(canonical.moments?.length).toBe(runner.moments.length);
    const restored = GameRunner.restore(saved, new AiDriver());
    expect(restored.moments).toEqual(runner.moments);

    const review = buildDecisionReview(saved);
    let gradedCalls = 0;
    let gradedMoments = 0;
    const gradedKinds = new Set<string>();
    for (const moment of runner.moments) {
      const position = review.positions.find((p) => p.decisionIndex === moment.decisionIndex);
      expect(position, `position for moment at ${moment.decisionIndex}`).toBeDefined();
      const analysis = analyzeReviewMoments(review, position!);
      expect(analysis.available, `moment at ${moment.decisionIndex} verifies`).toBe(true);
      if (analysis.available) {
        gradedMoments += analysis.grades.length;
        for (const grade of analysis.grades) gradedKinds.add(grade.kind);
        if (analysis.grades.some((g) => g.kind === "call")) gradedCalls++;
      }
    }
    expect(gradedMoments).toBeGreaterThan(0);
    expect(gradedCalls).toBeGreaterThan(0);
    // A2: this seeded game exercises the call, riichi, and win
    // grades at their own steps (13 call, 3 riichi-offer, and 2
    // tsumo-offer moments recorded). Kan offers to the human seat
    // are rarer — across ten scanned seeds none occurred — so the
    // kan grade is covered by the coach scenario tests and the
    // policy-agreement fuzz instead of this game.
    expect(gradedKinds.has("call")).toBe(true);
    expect(gradedKinds.has("riichi")).toBe(true);
    expect(gradedKinds.has("win")).toBe(true);
  }, 600000);

  it("a game stripped of its moments grades discards only (legacy behavior)", async () => {
    const ai = new AiDriver();
    const runner = new GameRunner({ seed: "moments-legacy", length: "east", humanSeat: 0, aiDriver: ai });
    runner.advance();
    await playUntil(runner, ai, aiAnswer, () => runner.moments.length >= 3, 400);
    expect(runner.moments.length).toBeGreaterThan(0);
    const saved = JSON.parse(JSON.stringify(runner.serialize())) as SavedGame;
    const stripped = { ...(saved as unknown as Record<string, unknown>) };
    delete stripped["moments"];
    const canonical = validateSavedGame(stripped);
    expect(canonical.v).toBe(2);
    if (canonical.v === 2) expect(canonical.moments).toBeUndefined();

    const review = buildDecisionReview(stripped);
    expect(review.moments).toEqual([]);
    // A position that held a graded offer reports not-recorded...
    const offerPosition = review.positions.find(
      (p) =>
        (p.kind === "call" &&
          (p.context.canRon || p.context.canPon || p.context.canKan || p.context.chiOptions.length > 0)) ||
        (p.kind === "turn" &&
          (p.context.canTsumo || p.context.riichiDiscardIds.length > 0 ||
            p.context.ankanOptions.length > 0 || p.context.shouminkanOptions.length > 0)),
    );
    expect(offerPosition).toBeDefined();
    expect(analyzeReviewMoments(review, offerPosition!)).toEqual({ available: false, reason: "not-recorded" });
    // ...while discard grading is untouched.
    const discardPosition = review.positions.find((p) => p.kind === "turn" && p.action.type === "discard");
    expect(discardPosition).toBeDefined();
    expect(analyzeReviewDecision(discardPosition!).available).toBe(true);
  }, 600000);

  it("a tampered moment grades nothing, and a forged choice fails validation", async () => {
    const ai = new AiDriver();
    const runner = new GameRunner({ seed: "moments-tamper", length: "east", humanSeat: 0, aiDriver: ai });
    runner.advance();
    await playUntil(runner, ai, aiAnswer, () => runner.moments.some((m) => m.kind === "call"), 400);
    const callMoment = runner.moments.find((m) => m.kind === "call")!;
    expect(callMoment).toBeDefined();

    // Flip an offer flag: the record no longer matches the
    // reconstructed position, so Review must refuse to grade it.
    const saved = JSON.parse(JSON.stringify(runner.serialize())) as unknown as {
      moments: { canPon?: boolean; choice: unknown }[];
    };
    const entry = saved.moments[runner.moments.indexOf(callMoment)]!;
    entry.canPon = !entry.canPon;
    const review = buildDecisionReview(saved);
    const position = review.positions.find((p) => p.decisionIndex === callMoment.decisionIndex)!;
    expect(analyzeReviewMoments(review, position)).toEqual({ available: false, reason: "unverified" });

    // Forge the choice: validation itself must reject the save.
    const forged = JSON.parse(JSON.stringify(runner.serialize())) as unknown as {
      moments: { choice: unknown }[];
    };
    const originalChoice = JSON.stringify(forged.moments[0]!.choice);
    forged.moments[0]!.choice = originalChoice === '{"type":"pass"}' ? { type: "pon" } : { type: "pass" };
    expect(() => validateSavedGame(forged)).toThrow(/choice does not match/);
  }, 600000);
});

describe("coaching moments: the graded choices (A3, G4)", () => {
  it("grades a passed ron with temporary furiten for a silent player", async () => {
    let found: { seed: string; decisionIndex: number } | null = null;
    for (const seed of ["moments-ronpass-1", "moments-ronpass-2", "moments-ronpass-3"]) {
      const ai = new AiDriver();
      const runner = new GameRunner({ seed, length: "east", humanSeat: 0, aiDriver: ai });
      runner.advance();
      const answer: Answerer = (r, a) => {
        const p = r.pending!;
        if (
          p.kind === "call" && p.ctx.phase === "ron" && p.ctx.canRon &&
          !p.view.players[p.view.seat]!.riichi
        ) {
          r.act({ type: "pass" });
          return;
        }
        drivePending(r, a);
      };
      const hit = await playUntil(runner, ai, answer, () =>
        runner.moments.some(
          (m) => m.kind === "call" && m.phase === "ron" && m.canRon && m.choice.type === "pass",
        ),
      );
      if (hit) {
        const moment = runner.moments.find(
          (m) => m.kind === "call" && m.phase === "ron" && m.canRon && m.choice.type === "pass",
        )!;
        found = { seed, decisionIndex: moment.decisionIndex };
        const review = buildDecisionReview(JSON.parse(JSON.stringify(runner.serialize())));
        const position = review.positions.find((p) => p.decisionIndex === moment.decisionIndex)!;
        const analysis = analyzeReviewMoments(review, position);
        expect(analysis.available).toBe(true);
        if (analysis.available) {
          const texts = momentTexts(analysis.grades, position);
          const facts = texts.map((t) => t.facts.join("\n")).join("\n");
          const all = texts.map((t) => [...t.facts, ...t.terms, t.choiceLine].join("\n")).join("\n");
          expect(all).toContain("furiten");
          // The fact line for a silent player is the temporary form;
          // the permanent wording appears only in the term
          // definition, never as this moment's consequence.
          expect(facts).toContain("until your next draw");
          expect(facts).not.toContain("rest of the hand");
          expect(texts[0]!.choiceLine).toContain("You passed");
        }
        break;
      }
    }
    expect(found, "a ron pass occurred in one of the seeded games").not.toBeNull();
  }, 600000);

  it("grades a riichi player's passed ron with permanent furiten", async () => {
    let found = false;
    for (const seed of ["moments-riichi-1", "moments-riichi-2", "moments-riichi-3", "moments-riichi-4"]) {
      const ai = new AiDriver();
      const runner = new GameRunner({ seed, length: "east", humanSeat: 0, aiDriver: ai });
      runner.advance();
      const answer: Answerer = (r, a) => {
        const p = r.pending!;
        const inRiichi = p.view.players[p.view.seat]!.riichi;
        if (p.kind === "call" && p.ctx.phase === "ron" && p.ctx.canRon && inRiichi) {
          r.act({ type: "pass" });
          return;
        }
        if (p.kind === "turn" && !inRiichi && p.ctx.riichiDiscardIds.length > 0) {
          r.act({ type: "discard", tileId: p.ctx.riichiDiscardIds[0]!, riichi: true });
          return;
        }
        drivePending(r, a);
      };
      const isRiichiPass = () =>
        runner.moments.some(
          (m) => m.kind === "call" && m.phase === "ron" && m.canRon && m.choice.type === "pass",
        ) &&
        runner.moments.some((m) => m.choice.type === "discard" && (m.choice as { riichi?: boolean }).riichi);
      const hit = await playUntil(runner, ai, answer, isRiichiPass);
      if (hit) {
        // The pass that counts is one made while in riichi: find the
        // ron-pass moment whose Review position shows the riichi flag.
        const review = buildDecisionReview(JSON.parse(JSON.stringify(runner.serialize())));
        const passMoments = runner.moments.filter(
          (m) => m.kind === "call" && m.phase === "ron" && m.canRon && m.choice.type === "pass",
        );
        for (const moment of passMoments) {
          const position = review.positions.find((p) => p.decisionIndex === moment.decisionIndex)!;
          if (!position.view.players[position.view.seat]!.riichi) continue;
          const analysis = analyzeReviewMoments(review, position);
          expect(analysis.available).toBe(true);
          if (analysis.available) {
            const texts = momentTexts(analysis.grades, position);
            const all = texts.map((t) => [...t.facts, ...t.terms].join("\n")).join("\n");
            expect(all).toContain("furiten");
            expect(all).toContain("rest of the hand");
          }
          found = true;
          break;
        }
        if (found) break;
      }
    }
    expect(found, "a riichi player passed a ron in one of the seeded games").toBe(true);
  }, 600000);

  it("records and grades a declined tsumo as a win moment", async () => {
    let found = false;
    for (const seed of ["moments-decline-1", "moments-decline-2", "moments-decline-3"]) {
      const ai = new AiDriver();
      const runner = new GameRunner({ seed, length: "east", humanSeat: 0, aiDriver: ai });
      runner.advance();
      const answer: Answerer = (r, a) => {
        const p = r.pending!;
        if (p.kind === "turn" && p.ctx.canTsumo) {
          const advice = adviseDiscard(p.view, p.ctx);
          r.act({ type: "discard", tileId: advice.recommendation.tileId });
          return;
        }
        drivePending(r, a);
      };
      const hit = await playUntil(runner, ai, answer, () =>
        runner.moments.some((m) => m.kind === "turn" && m.canTsumo && m.choice.type === "discard"),
      );
      if (hit) {
        const moment = runner.moments.find(
          (m) => m.kind === "turn" && m.canTsumo && m.choice.type === "discard",
        )!;
        const review = buildDecisionReview(JSON.parse(JSON.stringify(runner.serialize())));
        const position = review.positions.find((p) => p.decisionIndex === moment.decisionIndex)!;
        const analysis = analyzeReviewMoments(review, position);
        expect(analysis.available).toBe(true);
        if (analysis.available) {
          expect(analysis.grades.some((g) => g.kind === "win")).toBe(true);
          const texts = momentTexts(analysis.grades, position);
          const winText = texts.find((t) => t.kind === "win")!;
          expect(winText.choiceLine).toContain("declined the tsumo");
          expect(winText.facts.join("\n")).toContain("Tsumo pays");
        }
        found = true;
        break;
      }
    }
    expect(found, "a tsumo was declined in one of the seeded games").toBe(true);
  }, 600000);
});
