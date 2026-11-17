// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { Game, ENGINE_VERSION, DEFAULT_RULESET, type Tile, type Policy } from "@openmahjong/engine";
import { createAiPolicy, AI_POLICY_VERSION } from "@openmahjong/ai";
import { adviseDiscard, type DiscardAdvice } from "@openmahjong/coach";
import { buildDecisionReview, type DecisionReview, type ReviewDecision } from "../src/review.js";
import { mountReview } from "../src/review-ui.js";
import type { Decision } from "../src/runner.js";

let review: DecisionReview;
let root: HTMLElement;
const proof = JSON.parse(readFileSync("docs/design/proposals/review-facts.json", "utf8")) as {
  view: ReviewDecision["view"]; context: Extract<ReviewDecision, { kind: "turn" }>["context"]; chosen: DiscardAdvice;
};
const proofPosition: ReviewDecision = { kind: "turn", decisionIndex: 0, handIndex: 0,
  eventSequence: 7, engineVersion: 2, informationMode: "player-perspective",
  view: proof.view, context: proof.context, action: { type: "discard", tileId: proof.chosen.tileId } };
const proofReview: DecisionReview = { schemaVersion: 1, engineVersion: 2, complete: false, consumedDecisions: 1, positions: [proofPosition] };
const renderTile = (tile: Tile): HTMLElement => {
  const result = document.createElement("span"); result.className = "tile";
  result.dataset["tileId"] = String(tile.id); return result;
};
const click = (label: string): void => {
  const found = [...root.querySelectorAll<HTMLButtonElement>("button")]
    .find((button) => button.getAttribute("aria-label") === label || button.textContent === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  found.click();
};
function mount(data = proofReview) {
  const onBack = vi.fn(); const onPractice = vi.fn(); const onInspectTable = vi.fn();
  const controller = mountReview(root, { review: data, renderTile, onBack, onPractice, onInspectTable });
  return { controller, onBack, onPractice, onInspectTable };
}

beforeAll(() => {
  const decisions: Decision[] = [];
  const ai = createAiPolicy();
  const policy: Policy = {
    turn(view, context) { const action = ai.turn(view, context); decisions.push(action); return action; },
    call(view, context) { const action = ai.call(view, context); decisions.push(action); return action; },
  };
  const game = new Game({ seed: "review-core", length: "east", policies: [policy, policy, policy, policy] });
  game.run();
  review = buildDecisionReview({ v: 2, seed: "review-core", length: "east", humanSeat: 0,
    engineVersion: ENGINE_VERSION, ruleset: { id: DEFAULT_RULESET.id, version: DEFAULT_RULESET.version }, aiVersion: AI_POLICY_VERSION, decisions });
}, 60_000);
beforeEach(() => { document.body.replaceChildren(); root = document.createElement("div"); document.body.append(root); });

describe("approved player-perspective review UI", () => {
  it("renders independently verified chosen/alternative facts and honest uncertainty", () => {
    mount();
    expect(root.querySelector(".perspective")?.textContent).toBe("Player perspective ✓");
    expect(root.querySelector("[data-review-option=chosen] [data-fact=shanten]")?.textContent).toBe("3");
    expect(root.querySelector("[data-review-option=chosen] [data-fact=unseen-copies]")?.textContent).toBe("42");
    expect(root.querySelector("[data-review-option=alternative] [data-fact=shanten]")?.textContent).toBe("3");
    expect(root.querySelector("[data-review-option=alternative] [data-fact=unseen-copies]")?.textContent).toBe("58");
    expect(root.querySelector("[data-fact=dora-discarded]")?.textContent).toMatch(/your choice 0; alternative 0/);
    expect(root.textContent).toContain("may be in opponents’ hands or the dead wall");
    expect(root.textContent).toContain("heuristics, not win probabilities or an objective grade");
    expect(root.querySelector(".review-facts")?.textContent).toContain("Temporary and riichi-pass furiten are not included");
    expect(root.querySelectorAll(".hand-card .hand .tile")).toHaveLength(14);
  });

  it("selects every actual physical legal discard and updates comparison without grading it", () => {
    const { controller } = mount();
    const advice = adviseDiscard(proofPosition.view, proofPosition.context);
    expect(root.querySelectorAll("select[aria-label='Compare another discard'] option")).toHaveLength(advice.options.length - 1);
    const candidate = advice.options.find((option) => option.tileId !== proof.chosen.tileId && option.tileId !== advice.recommendation.tileId)!;
    const select = root.querySelector<HTMLSelectElement>("select[aria-label='Compare another discard']")!;
    select.focus(); select.value = String(candidate.tileId); select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(root.querySelector("[data-review-option=alternative] [data-fact=unseen-copies]")?.textContent).toBe(String(candidate.improvingTotal));
    expect(root.querySelector(".explanation")?.textContent).toContain(`The alternative leaves ${candidate.shantenAfter} shanten and ${candidate.improvingTotal} unseen improving copies`);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Compare another discard");
    expect(controller.currentPosition).toBe(proofPosition);
  });

  it("compares a distinct legal option when the recorded discard already matches the recommendation", () => {
    const advice = adviseDiscard(proofPosition.view, proofPosition.context);
    const matched: ReviewDecision = { ...proofPosition, action: { type: "discard", tileId: advice.recommendation.tileId } };
    mount({ ...proofReview, positions: [matched] });
    const other = advice.options.find((option) => option.tileId !== advice.recommendation.tileId)!;
    expect(root.querySelector("[data-review-option=chosen] [data-tile-id]")?.getAttribute("data-tile-id")).toBe(String(advice.recommendation.tileId));
    expect(root.querySelector("[data-review-option=alternative] [data-tile-id]")?.getAttribute("data-tile-id")).toBe(String(other.tileId));
    expect(root.querySelector(`select[aria-label='Compare another discard'] option[value='${advice.recommendation.tileId}']`)).toBeNull();
  });

  it("shows the sole actual riichi discard without inventing an alternative", () => {
    // The real lesson seed starts in riichi-ready shape. Opponents use
    // legal tsumogiri/pass so a ron does not end the hand before the
    // learner's next draw. Capture that real post-riichi context.
    class Captured {}
    let forced: ReviewDecision | undefined;
    const policy: Policy = {
      turn(view, context) {
        if (view.seat === 0) {
          if (view.players[0]!.riichi) {
            forced = { kind: "turn", view, context, action: { type: "discard", tileId: context.drawnTile!.id },
              decisionIndex: 1, handIndex: 0, eventSequence: 0, engineVersion: 2, informationMode: "player-perspective" };
            throw new Captured();
          }
          expect(context.riichiDiscardIds.length).toBeGreaterThan(0);
          return { type: "discard", tileId: context.riichiDiscardIds[0]!, riichi: true };
        }
        return { type: "discard", tileId: context.drawnTile!.id };
      },
      call() { return { type: "pass" }; },
    };
    try { new Game({ seed: "om-tu6-1420", length: "east", policies: [policy, policy, policy, policy] }).run(); }
    catch (error) { if (!(error instanceof Captured)) throw error; }
    expect(forced, "fixture must capture a real post-riichi draw").toBeDefined();
    mount({ ...proofReview, positions: [forced!] });
    expect(root.querySelectorAll("[data-review-option=chosen]")).toHaveLength(1);
    expect(root.querySelector("[data-review-option=alternative]")).toBeNull();
    expect(root.querySelector("select[aria-label='Compare another discard']")).toBeNull();
    expect(root.querySelector(".explanation h2")?.textContent).toBe("One legal discard");
    expect(root.querySelector(".explanation")?.textContent).toContain("Only the drawn tile may be discarded after riichi");
    expect(root.querySelectorAll(".fact-detail")).toHaveLength(1);
  });

  it("navigates exact decisions and repeated-hand serials with accessible controls", () => {
    const { controller } = mount(review);
    expect(root.querySelector<HTMLButtonElement>("[aria-label='Previous decision']")?.disabled).toBe(true);
    click("Next decision");
    expect(controller.currentPosition).toBe(review.positions[1]);
    click("Previous decision"); expect(controller.currentPosition).toBe(review.positions[0]);
    const later = review.positions.find((position) => position.handIndex > 0)!;
    const select = root.querySelector<HTMLSelectElement>("select[aria-label=Hand]")!;
    select.value = String(later.handIndex); select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(controller.currentPosition).toBe(later);
    expect(root.querySelector(".hand-caption")?.textContent).toContain(`${later.view.wallRemaining} in the live wall`);
    controller.goToDecision(review.positions.length - 1);
    expect(root.querySelector<HTMLButtonElement>("[aria-label='Next decision']")?.disabled).toBe(true);
  });

  it("renders only the selected instant's public table, never hidden hands or future results", () => {
    const { controller, onInspectTable } = mount(review);
    const current = review.positions[0]!;
    const firstText = root.querySelector(".review-public-table")!.textContent;
    expect(root.querySelectorAll(".review-player")).toHaveLength(4);
    expect(root.querySelectorAll(".review-player .tile")).toHaveLength(0);
    expect(firstText).toContain("No discards yet");
    expect(firstText).toContain("25,000 points");
    expect(root.querySelector(".review-public-table")?.textContent).not.toMatch(/final result|final score|opponent hand/i);
    click("Inspect table position"); expect(onInspectTable).toHaveBeenCalledWith(current);
    const laterIndex = review.positions.findIndex((position) => position.view.players.some((player) => player.discards.length > 0));
    controller.goToDecision(laterIndex);
    expect(root.querySelectorAll(".review-player .tile").length).toBeGreaterThan(0);
    controller.goToDecision(0);
    expect(root.querySelector(".review-public-table")!.textContent).toBe(firstText);
  });

  it("shows legal call facts without inventing a strategic score", () => {
    const { controller, onPractice } = mount(review);
    const callIndex = review.positions.findIndex((position) => position.kind === "call");
    expect(callIndex).toBeGreaterThanOrEqual(0);
    controller.goToDecision(callIndex);
    expect(root.querySelector(".review-action-facts")?.textContent).toContain("Legal opportunities in this window");
    // The fixture game predates moment capture: the window is shown
    // as recorded-but-ungraded, with the reason named (coaching
    // remainder brief — pre-capture games grade discards only).
    expect(root.querySelector(".review-action-facts")?.textContent).toContain("recorded before moment capture");
    expect(root.querySelector(".compare")).toBeNull();
    click("Practice hand building"); expect(onPractice).toHaveBeenCalledWith(review.positions[callIndex], expect.arrayContaining(["hand-construction"]));
  });

  it("keeps legacy replay display-only and never labels it current analysis", () => {
    const legacy = JSON.parse(readFileSync("packages/web/test/fixtures/legacy-v1.json", "utf8")) as { saved: unknown };
    const old = buildDecisionReview(legacy.saved); const { onPractice } = mount(old);
    expect(root.querySelector(".legacy-notice")?.textContent).toContain("engine version 1");
    expect(root.querySelector(".compare")).toBeNull();
    expect(root.querySelector("[aria-label='Compare another discard']")).toBeNull();
    const practice = [...root.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Practice this concept")!;
    expect(practice.disabled).toBe(true); practice.click(); expect(onPractice).not.toHaveBeenCalled();
    expect(root.querySelector(".source")?.textContent).toBe("Historical engine 1 · display only");
  });

  it("bridges practice with the original snapshot and skills; back and cleanup work", () => {
    const { controller, onPractice, onBack } = mount();
    click("Practice tile efficiency");
    expect(onPractice).toHaveBeenCalledWith(proofPosition, ["ukeire", "shanten", "wait-reading"]);
    click("Back"); expect(onBack).toHaveBeenCalledOnce();
    click("Review help"); expect(root.querySelector(".learning-content")?.textContent).toContain("Compare choices before considering the eventual result");
    controller.destroy(); expect(root.children).toHaveLength(0);
    controller.goToDecision(0); expect(root.children).toHaveLength(0);
  });

  it("keeps empty prefixes usable without enabling undefined practice positions", () => {
    mount({ schemaVersion: 1, engineVersion: 2, complete: false, consumedDecisions: 0, positions: [] });
    expect(root.textContent).toContain("No player decisions have been recorded");
    expect(root.querySelector(".learning-nav")).toBeNull();
  });
});
