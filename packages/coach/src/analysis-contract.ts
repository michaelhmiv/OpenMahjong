import { DEFAULT_RULESET, ENGINE_VERSION, type RulesetReference } from "@openmahjong/engine";
import { AI_POLICY_VERSION } from "@openmahjong/ai";
import type { TurnAdvice } from "./advice.js";

/** This version identifies the meaning of the analysis, independently
 * of replay serialization and the selected rules profile. */
export const ANALYSIS_VERSION = "discard-analysis-2" as const;

/** The moment evaluators (coaching remainder brief, G1–G4) carry their
 * own version: their facts and judgments are a different contract
 * from the discard analysis. */
export const MOMENT_ANALYSIS_VERSION = "moment-analysis-1" as const;

export interface AnalysisEvidence {
  readonly schemaVersion: 1;
  readonly analysisVersion: typeof ANALYSIS_VERSION | typeof MOMENT_ANALYSIS_VERSION;
  readonly engineVersion: typeof ENGINE_VERSION;
  readonly policyVersion: typeof AI_POLICY_VERSION;
  readonly ruleset: RulesetReference;
  readonly informationMode: "player-perspective";
  readonly exactFacts: readonly string[];
  readonly heuristicAssessments: readonly string[];
  readonly limitations: readonly string[];
}

/** No hidden tiles, future events or match outcomes are accepted here.
 * Unseen-copy arithmetic is exact given the view; their locations and
 * eventual availability are unknown. */
export function playerPerspectiveEvidence(): AnalysisEvidence {
  return {
    schemaVersion: 1,
    analysisVersion: ANALYSIS_VERSION,
    engineVersion: ENGINE_VERSION,
    policyVersion: AI_POLICY_VERSION,
    ruleset: { id: DEFAULT_RULESET.id, version: DEFAULT_RULESET.version },
    informationMode: "player-perspective",
    exactFacts: ["shanten", "shape-completing-tiles", "unseen-copy-counts", "discard-furiten", "genbutsu-per-opponent", "discarded-dora-count"],
    heuristicAssessments: ["discard-ranking", "relative-danger", "riichi-versus-dama", "hand-value-proxy"],
    limitations: [
      "Unseen copies may be in opponents' hands or the dead wall; they are not guaranteed live-wall draws.",
      "Shape completion does not establish yaku or legal ron; the engine's action context decides legality.",
      "Discard furiten excludes temporary and riichi-pass furiten, which PlayerView does not expose.",
      "Defense models riichi threats only. Suji and kabe are heuristics, not proof of safety.",
      "The policy is not an optimal-play oracle; no win probability, expected value or calibrated numerical grade is computed.",
    ],
  };
}

/** Evidence for the moment evaluators (calls, kans, riichi, win
 * choices). Same player-perspective boundary as the discard analysis;
 * the facts and limitations name what a moment read can and cannot
 * know — a kan's new indicator tile and a riichi hand's ura dora are
 * hidden, so those consequences are stated as exposure and minimums,
 * never as values. */
export function momentPerspectiveEvidence(): AnalysisEvidence {
  return {
    schemaVersion: 1,
    analysisVersion: MOMENT_ANALYSIS_VERSION,
    engineVersion: ENGINE_VERSION,
    policyVersion: AI_POLICY_VERSION,
    ruleset: { id: DEFAULT_RULESET.id, version: DEFAULT_RULESET.version },
    informationMode: "player-perspective",
    exactFacts: ["call-offers", "shanten-before-after", "unseen-copy-counts", "win-values-from-visible-dora", "furiten-consequences", "kan-dora-exposure", "score-and-round-context"],
    heuristicAssessments: ["call-ranking", "yaku-path-reachability", "riichi-versus-dama", "win-now-versus-ceiling"],
    limitations: [
      "The tile a kan reveals as the next dora indicator sits in the dead wall and is unknowable; only exposure — how many owned tiles could become dora — is computed.",
      "Win values for a hand in riichi exclude ura dora, which stay hidden until the hand ends; a stated riichi win value is a minimum.",
      "Yaku-path reachability covers the main paths (yakuhai, all simples, one suit, seven pairs, thirteen orphans, riichi); rarer paths such as three-colour runs are not enumerated.",
      "The policy is not an optimal-play oracle; no win probability, expected value or calibrated numerical grade is computed.",
      "A first-draw win (tenhou or chiihou) is not probed; the engine scores the real win if it is taken.",
    ],
  };
}

export interface DiscardComparison {
  readonly chosenTileId: number;
  readonly alternativeTileId: number;
  /** Chosen minus alternative: positive means further from tenpai. */
  readonly shantenDifference: number;
  /** Chosen minus alternative: positive means more unseen improving copies. */
  readonly unseenImprovingDifference: number;
  /** Relative heuristic units, never a probability or expected loss. */
  readonly heuristicDangerDifference: number;
  /** Chosen minus alternative; positive means more bonus dora discarded. */
  readonly doraDiscardedDifference: number;
  readonly observation: "same-option" | "higher-shanten" | "lower-shanten" | "fewer-unseen-improving-copies" | "more-unseen-improving-copies" | "same-efficiency";
  readonly analysis: AnalysisEvidence;
}

/** A headless review primitive. It reports observable tradeoffs rather
 * than grading a choice from the eventual outcome of a hand. */
export function compareDiscards(advice: TurnAdvice, chosenTileId: number, alternativeTileId = advice.recommendation.tileId): DiscardComparison {
  const chosen = advice.options.find((o) => o.tileId === chosenTileId);
  const alternative = advice.options.find((o) => o.tileId === alternativeTileId);
  if (!chosen || !alternative) throw new Error("Discard comparison requires analyzed legal options");
  const shantenDifference = chosen.shantenAfter - alternative.shantenAfter;
  const unseenImprovingDifference = chosen.improvingTotal - alternative.improvingTotal;
  const observation = chosen === alternative ? "same-option" : shantenDifference > 0 ? "higher-shanten" :
    shantenDifference < 0 ? "lower-shanten" : unseenImprovingDifference < 0 ? "fewer-unseen-improving-copies" :
    unseenImprovingDifference > 0 ? "more-unseen-improving-copies" : "same-efficiency";
  return {
    chosenTileId, alternativeTileId, shantenDifference, unseenImprovingDifference,
    heuristicDangerDifference: chosen.danger - alternative.danger,
    doraDiscardedDifference: chosen.doraDiscarded - alternative.doraDiscarded,
    observation, analysis: advice.analysis,
  };
}
