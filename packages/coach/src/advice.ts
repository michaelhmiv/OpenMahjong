/**
 * The coach's discard-decision core (slice-2 brief §9 + COACH
 * ARCHITECTURE block).
 *
 * The coach is the CPU opponent's decision pipeline opened up — not a
 * separate brain. It runs the ai package's own discard evaluation
 * (packages/ai/src/evaluate.ts) over EVERY legal discard, ranks the
 * options with the policy's own ordering (efficiency; the riichi-
 * keeper preference; safest-among-best when pushing against a riichi;
 * safest overall when folding), and attaches the structured facts
 * each ranking used — ukeire, waits, danger, genbutsu — computed from
 * the same public view. Surfaces (the guided hint overlay, tutorial
 * lessons, later the post-game review) render those facts as one-line
 * template text. No generated prose, no LLM; deterministic in the
 * view, and blind to everything the player cannot see.
 *
 * Scope of this module (tutorial PR): discard decisions at draw,
 * including the riichi and tsumo prompts that ride along with a draw.
 * Call windows, defense-mode reads and the review taxonomy plug into
 * the same shape in the coaching PR.
 */
import {
  isDragon,
  isSuited,
  isWind,
  rankOf,
  suitOf,
  type PlayerView,
  type TileType,
  type TurnContext,
} from "@openmahjong/engine";
import {
  countsOfTiles,
  doraInTiles,
  doraWeightsOf,
  ownedMeldCounts,
  evaluateDiscards,
  riichiThreats,
  ukeireFast,
  waitsFast,
  visibleCounts,
  rankDiscardCandidates,
  shouldDeclareRiichi,
  type DiscardCandidate,
} from "@openmahjong/ai";
import { playerPerspectiveEvidence, type AnalysisEvidence } from "./analysis-contract.js";

/** Why an option ranks where it does — the structured reason set the
 *  surfaces render. Codes are stable; wording lives in the surfaces. */
export type ReasonCode =
  | "fewest-steps" //        minimal shanten after the discard
  | "most-improving-tiles" // most unseen improving copies among shanten-best options
  | "policy-preference" //  best weighted efficiency, including value heuristics
  | "keeps-riichi-open" //    the discard preserves a riichi declaration
  | "ready" //               the discard leaves the hand tenpai
  | "two-wait-types" //       two shape-completing tile types; not necessarily ryanmen
  | "multi-wait" //          tenpai with three or more wait types
  | "furiten-wait" //        a wait tile is in your own discard pond
  | "genbutsu" //            the tile is in every riichi opponent's discard history
  | "safe-vs-riichi" //      danger 0 against a riichi threat
  | "dangerous-vs-riichi"; // danger 2+ against a riichi threat

export interface TileRef {
  type: TileType;
  name: string;
  /** Unseen copies: may be in opponents' hands or the dead wall.
   * This is not a count of drawable tiles in the live wall. */
  live: number;
}

export interface DiscardAdvice {
  /** Exact physical tile instance, including red/plain alternatives. */
  tileId: number;
  tileType: TileType;
  tileName: string;
  isRed: boolean;
  /** Bonus dora lost by this discard; dora alone never establish a yaku. */
  doraDiscarded: number;
  shantenAfter: number;
  /** Tiles that improve the hand after this discard, widest first. */
  improving: TileRef[];
  improvingTotal: number;
  /** Shape-completing tiles at tenpai; a legal win also needs a yaku. */
  waits: TileRef[];
  /** Relative heuristic danger (not a probability); 0 with no threat. */
  danger: number;
  /** In the discard history of EVERY current riichi threat. */
  genbutsu: boolean;
  /** Exact seats whose discard history contains this type. */
  genbutsuAgainst: number[];
  /** Discard-based furiten only; temporary/pass furiten is unavailable in PlayerView. */
  furiten: boolean;
  reasons: ReasonCode[];
}

export interface RiichiAdvice {
  tileId: number;
  tileType: TileType;
  tileName: string;
  waits: TileRef[];
  /** Total unseen copies, including hidden hands and dead wall. */
  liveTotal: number;
  /** The shared opponent policy would declare here (a heuristic). */
  recommended: boolean;
}

export interface TurnAdvice {
  /** Versioned provenance and boundaries for all facts and judgments. */
  analysis: AnalysisEvidence;
  /** Every legal discard, best first (the policy's own ordering). */
  options: DiscardAdvice[];
  recommendation: DiscardAdvice;
  canTsumo: boolean;
  /** The best riichi declaration available at this draw, if any. */
  riichi: RiichiAdvice | null;
  /** One line, template-rendered from the recommendation's facts. */
  headline: string;
}

const SUIT_NAMES = ["characters", "dots", "bamboo"];
const WIND_NAMES = ["East wind", "South wind", "West wind", "North wind"];
const DRAGON_NAMES = ["White dragon", "Green dragon", "Red dragon"];

/** Plain tile name — the same words the client prints ("9 of
 *  characters", "East wind"). */
export function tileName(type: TileType): string {
  if (isSuited(type)) return `${rankOf(type)} of ${SUIT_NAMES[suitOf(type)]!}`;
  if (isWind(type)) return WIND_NAMES[type - 27]!;
  if (isDragon(type)) return DRAGON_NAMES[type - 31]!;
  return `tile ${type}`;
}

function tileRefs(
  entries: readonly { type: number; remaining: number }[],
): TileRef[] {
  return entries.map((e) => ({
    type: e.type as TileType,
    name: tileName(e.type as TileType),
    live: e.remaining,
  }));
}

function joinNames(refs: readonly TileRef[]): string {
  const names = refs.map((r) => `the ${r.name}`);
  if (names.length <= 1) return names.join("");
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function toAdvice(
  candidate: DiscardCandidate,
  view: PlayerView,
  visible: readonly number[],
  threats: readonly number[],
  ctx: TurnContext,
  bestShanten: number,
  bestEfficiency: number,
): DiscardAdvice {
  const counts = countsOfTiles(view.hand);
  counts[candidate.type]!--;
  const afterVisible = [...visible];
  afterVisible[candidate.type]!++;
  const melds = view.melds.length;
  let improving: TileRef[] = [];
  let improvingTotal = 0;
  let waits: TileRef[] = [];
  let furiten = false;
  if (counts.reduce((a, b) => a + b, 0) + 3 * melds === 13) {
    const ukeire = ukeireFast(counts, afterVisible, melds);
    improving = tileRefs(
      [...ukeire.improving].sort((a, b) => b.remaining - a.remaining || a.type - b.type),
    );
    improvingTotal = ukeire.totalRemaining;
    if (candidate.shantenAfter === 0) {
      waits = tileRefs(waitsFast(counts, afterVisible, melds, ownedMeldCounts(view)));
      const ownPond = new Set(
        view.players[view.seat]!.discards.map((d) => d.tile.type),
      );
      ownPond.add(candidate.type);
      furiten = waits.some((w) => ownPond.has(w.type));
    }
  }
  const genbutsuAgainst = threats.filter((seat) => view.players[seat]!.discards.some((d) => d.tile.type === candidate.type));
  const genbutsu = threats.length > 0 && genbutsuAgainst.length === threats.length;
  const reasons: ReasonCode[] = [];
  if (candidate.shantenAfter === bestShanten) reasons.push("fewest-steps");
  if (candidate.shantenAfter === bestShanten && candidate.efficiency === bestEfficiency) {
    reasons.push("policy-preference");
  }
  if (
    candidate.shantenAfter === bestShanten &&
    ctx.riichiDiscardIds.includes(candidate.tile.id)
  ) {
    reasons.push("keeps-riichi-open");
  }
  if (candidate.shantenAfter === 0 && waits.length > 0) {
    reasons.push("ready");
    if (waits.length === 2) reasons.push("two-wait-types");
    if (waits.length >= 3) reasons.push("multi-wait");
    if (furiten) reasons.push("furiten-wait");
  }
  if (threats.length > 0) {
    if (genbutsu) reasons.push("genbutsu");
    else if (candidate.danger === 0) reasons.push("safe-vs-riichi");
    if (candidate.danger >= 2) reasons.push("dangerous-vs-riichi");
  }
  return {
    tileId: candidate.tile.id,
    tileType: candidate.type,
    tileName: tileName(candidate.type),
    isRed: candidate.tile.red,
    doraDiscarded: doraInTiles([candidate.tile], doraWeightsOf(view)),
    shantenAfter: candidate.shantenAfter,
    improving,
    improvingTotal,
    waits,
    danger: candidate.danger,
    genbutsu,
    genbutsuAgainst,
    furiten,
    reasons,
  };
}

function headlineFor(advice: TurnAdvice): string {
  const rec = advice.recommendation;
  if (advice.canTsumo) return "You drew a winning tile — declare tsumo.";
  if (advice.riichi?.recommended && advice.riichi.tileId === rec.tileId) {
    return `Discard the ${rec.tileName} and declare riichi — waiting on ${joinNames(advice.riichi.waits)}.`;
  }
  if (rec.shantenAfter === 0 && rec.furiten) {
    return `Discard the ${rec.tileName} — the shape is ready, but your discard history prevents ron; you can still win by tsumo with a yaku.`;
  }
  if (rec.shantenAfter === 0 && rec.waits.length > 0) {
    return `Discard the ${rec.tileName} — you are ready, waiting on ${joinNames(rec.waits)}.`;
  }
  if (rec.genbutsu) {
    return `Discard the ${rec.tileName} — each riichi opponent has discarded it, so they cannot ron it.`;
  }
  if (rec.danger === 0 && rec.reasons.includes("safe-vs-riichi")) {
    return `Discard the ${rec.tileName} — it is safe from ron by the riichi opponents.`;
  }
  if (rec.improvingTotal > 0) {
    return `Discard the ${rec.tileName} — ${rec.improvingTotal} unseen tiles could improve your hand.`;
  }
  return `Discard the ${rec.tileName} — fewest steps from ready.`;
}

/**
 * Advice for one draw decision: every legal discard ranked, the
 * riichi option when one exists, and a one-line headline. Pure and
 * deterministic in (view, ctx); sees only what the player sees.
 */
export function adviseDiscard(view: PlayerView, ctx: TurnContext): TurnAdvice {
  const threats = riichiThreats(view);
  const visible = visibleCounts(view);
  // Opponents need one representative per type; review must also
  // accept a human's different plain copy or deliberate red discard.
  let candidates = evaluateDiscards(view, ctx, { allInstances: true });
  // A player in riichi must discard the tile they just drew.
  const selfRiichi = view.players[view.seat]!.riichi;
  if (selfRiichi && ctx.drawnTile) {
    candidates = candidates.filter((c) => c.tile.id === ctx.drawnTile!.id);
  }
  const ranked = rankDiscardCandidates(view, ctx, candidates);
  const bestShanten = Math.min(...ranked.map((c) => c.shantenAfter));
  const bestEfficiency = Math.max(
    ...ranked.filter((c) => c.shantenAfter === bestShanten).map((c) => c.efficiency),
  );
  const options = ranked.map((c) =>
    toAdvice(c, view, visible, threats, ctx, bestShanten, bestEfficiency),
  );
  const mostImproving = Math.max(...options.filter((o) => o.shantenAfter === bestShanten).map((o) => o.improvingTotal));
  for (const option of options) {
    if (option.shantenAfter === bestShanten && option.improvingTotal === mostImproving) option.reasons.push("most-improving-tiles");
  }

  let riichi: RiichiAdvice | null = null;
  if (!selfRiichi && ctx.riichiDiscardIds.length > 0) {
    const counts = countsOfTiles(view.hand);
    let bestPick: RiichiAdvice | null = null;
    for (const id of ctx.riichiDiscardIds) {
      const tile = view.hand.find((t) => t.id === id);
      if (!tile) continue;
      counts[tile.type]!--;
      const afterVisible = [...visible];
      afterVisible[tile.type]!++;
      const waits = tileRefs(waitsFast(counts, afterVisible, view.melds.length, ownedMeldCounts(view)));
      counts[tile.type]!++;
      const liveTotal = waits.reduce((sum, w) => sum + w.live, 0);
      if (!bestPick || liveTotal > bestPick.liveTotal) {
        bestPick = {
          tileId: id,
          tileType: tile.type,
          tileName: tileName(tile.type),
          waits,
          liveTotal,
          recommended: candidates.some((c) => c.tile.id === id && shouldDeclareRiichi(view, c)),
        };
      }
    }
    riichi = bestPick;
  }

  const advice: TurnAdvice = {
    analysis: playerPerspectiveEvidence(),
    options,
    recommendation: options[0]!,
    canTsumo: ctx.canTsumo,
    riichi,
    headline: "",
  };
  advice.headline = headlineFor(advice);
  return advice;
}
