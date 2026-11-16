import { DEFAULT_RULESET, ENGINE_VERSION, type RulesetReference } from "@openmahjong/engine";
import { AI_POLICY_VERSION } from "@openmahjong/ai";
import type { TurnAdvice } from "./advice.js";

/** This version identifies the meaning of the analysis, independently
 * of replay serialization and the selected rules profile. */
export const ANALYSIS_VERSION = "discard-analysis-2" as const;

export interface AnalysisEvidence {
  readonly schemaVersion: 1;
  readonly analysisVersion: typeof ANALYSIS_VERSION;
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
