/**
 * @openmahjong/ai — the slice-1 AI opponent (brief §6).
 *
 * One solid level: an efficiency core (shanten + ukeire), hand-value
 * judgment, and basic defense against riichi, deciding through the
 * engine's public `PlayerView` only — hidden information is unreachable
 * by API shape, not by honor system.
 */

export { createAiPolicy } from "./policy.js";
export { createAiPolicy as createLegacyAiPolicy } from "./legacy/v1/policy.js";
export const AI_POLICY_VERSION = 2 as const;
export {
  bestByEfficiency,
  countsOfTiles,
  doraInTiles,
  doraTypesOf,
  doraWeightsOf,
  evaluateDiscards,
  isYakuhai,
  keepValue,
  rankDiscardCandidates,
  shouldDeclareRiichi,
  ownSeatWind,
  ownedMeldCounts,
  safestAmongBest,
  safestOverall,
  valueProxy,
  yakuhaiHan,
  type DoraValues,
  type DiscardCandidate,
} from "./evaluate.js";
export {
  shantenFast,
  shantenStandardFast,
  shantenTaiwaneseFast,
  shantenChiitoitsuFast,
  shantenKokushiFast,
  ukeireFast,
  waitsFast,
  type FastUkeire,
} from "./analysis.js";
export { dangerOf, visibleCounts, riichiThreats } from "./danger.js";
export * from "./variant-policy.js";
