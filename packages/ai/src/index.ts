/**
 * @openmahjong/ai — the slice-1 AI opponent (brief §6).
 *
 * One solid level: an efficiency core (shanten + ukeire), hand-value
 * judgment, and basic defense against riichi, deciding through the
 * engine's public `PlayerView` only — hidden information is unreachable
 * by API shape, not by honor system.
 */

export { createAiPolicy } from "./policy.js";
export {
  shantenFast,
  shantenStandardFast,
  shantenChiitoitsuFast,
  shantenKokushiFast,
  ukeireFast,
  waitsFast,
  type FastUkeire,
} from "./analysis.js";
export { dangerOf, visibleCounts, riichiThreats } from "./danger.js";
