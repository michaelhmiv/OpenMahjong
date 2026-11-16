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
  doraTypesOf,
  evaluateDiscards,
  riichiThreats,
  ukeireFast,
  valueProxy,
  waitsFast,
  visibleCounts,
  type DiscardCandidate,
} from "@openmahjong/ai";

/** Why an option ranks where it does — the structured reason set the
 *  surfaces render. Codes are stable; wording lives in the surfaces. */
export type ReasonCode =
  | "fewest-steps" //        minimal shanten after the discard
  | "most-improving-tiles" // best efficiency among the minimal set
  | "keeps-riichi-open" //    the discard preserves a riichi declaration
  | "ready" //               the discard leaves the hand tenpai
  | "two-sided-wait" //      tenpai with exactly two wait types
  | "multi-wait" //          tenpai with three or more wait types
  | "furiten-wait" //        a wait tile is in your own discard pond
  | "genbutsu" //            the tile is in a riichi player's pond
  | "safe-vs-riichi" //      danger 0 against a riichi threat
  | "dangerous-vs-riichi"; // danger 2+ against a riichi threat

export interface TileRef {
  type: TileType;
  name: string;
  /** Copies not seen in any visible place (ponds, melds, your hand). */
  live: number;
}

export interface DiscardAdvice {
  /** Id of the tile instance to discard (a plain copy when one exists). */
  tileId: number;
  tileType: TileType;
  tileName: string;
  shantenAfter: number;
  /** Tiles that improve the hand after this discard, widest first. */
  improving: TileRef[];
  improvingTotal: number;
  /** Wait tiles when the discard leaves the hand tenpai. */
  waits: TileRef[];
  /** 0–3 against the most dangerous riichi threat; 0 with no threat. */
  danger: number;
  genbutsu: boolean;
  furiten: boolean;
  reasons: ReasonCode[];
}

export interface RiichiAdvice {
  tileId: number;
  tileType: TileType;
  tileName: string;
  waits: TileRef[];
  /** Total live copies across all wait types. */
  liveTotal: number;
}

export interface TurnAdvice {
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

/** The policy's push/fold judgment, mirrored (ai/policy.ts): facing a
 *  riichi with a 1-shanten hand, push when closed or carrying value. */
function wantsToPush(view: PlayerView, counts: readonly number[]): boolean {
  if (view.melds.length === 0) return true;
  return valueProxy(view, counts, doraTypesOf(view)) >= 2;
}

/**
 * Rank candidates exactly as the policy picks among them
 * (ai/policy.ts turn()): the riichi-keeper pool restriction when not
 * folding, then efficiency / safest-among-best / safest-overall by
 * situation. Returns the full ordering plus the policy's pick.
 */
function rankCandidates(
  view: PlayerView,
  ctx: TurnContext,
  candidates: DiscardCandidate[],
): DiscardCandidate[] {
  const threats = riichiThreats(view);
  const counts = countsOfTiles(view.hand);
  const byEfficiency = (a: DiscardCandidate, b: DiscardCandidate): number =>
    a.shantenAfter - b.shantenAfter ||
    b.efficiency - a.efficiency ||
    a.type - b.type;
  const bestOverall = [...candidates].sort(byEfficiency)[0]!;
  const folding =
    threats.length > 0 &&
    bestOverall.shantenAfter !== 0 &&
    !(bestOverall.shantenAfter === 1 && wantsToPush(view, counts));

  let pool = candidates;
  if (!folding && ctx.riichiDiscardIds.length > 0) {
    const minShanten = Math.min(...candidates.map((c) => c.shantenAfter));
    const riichiPool = candidates.filter(
      (c) =>
        c.shantenAfter === minShanten && ctx.riichiDiscardIds.includes(c.tile.id),
    );
    if (riichiPool.length > 0) pool = riichiPool;
  }

  if (threats.length === 0) {
    const poolSorted = [...pool].sort(byEfficiency);
    const rest = candidates.filter((c) => !pool.includes(c)).sort(byEfficiency);
    return [...poolSorted, ...rest];
  }
  if (folding) {
    return [...candidates].sort(
      (a, b) =>
        a.danger - b.danger ||
        a.shantenAfter - b.shantenAfter ||
        b.efficiency - a.efficiency ||
        a.type - b.type,
    );
  }
  // Pushing: safestAmongBest — safety compared only among the
  // pool's shanten-best, efficiency breaking danger ties.
  const bySafety = (a: DiscardCandidate, b: DiscardCandidate): number =>
    a.danger - b.danger || b.efficiency - a.efficiency || a.type - b.type;
  const poolMinShanten = Math.min(...pool.map((c) => c.shantenAfter));
  const head = pool.filter((c) => c.shantenAfter === poolMinShanten).sort(bySafety);
  const tail = [
    ...pool.filter((c) => c.shantenAfter !== poolMinShanten),
    ...candidates.filter((c) => !pool.includes(c)),
  ].sort((a, b) => a.danger - b.danger || byEfficiency(a, b));
  return [...head, ...tail];
}

function toAdvice(
  candidate: DiscardCandidate,
  view: PlayerView,
  visible: readonly number[],
  threats: readonly number[],
  genbutsuTypes: ReadonlySet<TileType>,
  ctx: TurnContext,
  bestShanten: number,
  bestEfficiency: number,
): DiscardAdvice {
  const counts = countsOfTiles(view.hand);
  counts[candidate.type]!--;
  const melds = view.melds.length;
  let improving: TileRef[] = [];
  let improvingTotal = 0;
  let waits: TileRef[] = [];
  let furiten = false;
  if (counts.reduce((a, b) => a + b, 0) + 3 * melds === 13) {
    const ukeire = ukeireFast(counts, visible, melds);
    improving = tileRefs(
      [...ukeire.improving].sort((a, b) => b.remaining - a.remaining || a.type - b.type),
    );
    improvingTotal = ukeire.totalRemaining;
    if (candidate.shantenAfter === 0) {
      waits = tileRefs(waitsFast(counts, visible, melds));
      const ownPond = new Set(
        view.players[view.seat]!.discards.map((d) => d.tile.type),
      );
      furiten = waits.some((w) => ownPond.has(w.type));
    }
  }
  const genbutsu = genbutsuTypes.has(candidate.type);
  const reasons: ReasonCode[] = [];
  if (candidate.shantenAfter === bestShanten) reasons.push("fewest-steps");
  if (candidate.shantenAfter === bestShanten && candidate.efficiency === bestEfficiency) {
    reasons.push("most-improving-tiles");
  }
  if (
    candidate.shantenAfter === bestShanten &&
    ctx.riichiDiscardIds.includes(candidate.tile.id)
  ) {
    reasons.push("keeps-riichi-open");
  }
  if (candidate.shantenAfter === 0) {
    reasons.push("ready");
    if (waits.length === 2) reasons.push("two-sided-wait");
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
    shantenAfter: candidate.shantenAfter,
    improving,
    improvingTotal,
    waits,
    danger: candidate.danger,
    genbutsu,
    furiten,
    reasons,
  };
}

function headlineFor(advice: TurnAdvice): string {
  const rec = advice.recommendation;
  if (advice.canTsumo) return "You drew a winning tile — declare tsumo.";
  if (advice.riichi && advice.riichi.tileId === rec.tileId) {
    return `Discard the ${rec.tileName} and declare riichi — waiting on ${joinNames(advice.riichi.waits)}.`;
  }
  if (rec.shantenAfter === 0 && rec.waits.length > 0) {
    return `Discard the ${rec.tileName} — you are ready, waiting on ${joinNames(rec.waits)}.`;
  }
  if (rec.genbutsu) {
    return `Discard the ${rec.tileName} — the riichi player has discarded it, so it is safe.`;
  }
  if (rec.danger === 0 && rec.reasons.includes("safe-vs-riichi")) {
    return `Discard the ${rec.tileName} — it is safe against the riichi.`;
  }
  if (rec.improvingTotal > 0) {
    return `Discard the ${rec.tileName} — ${rec.improvingTotal} tiles improve your hand.`;
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
  let candidates = evaluateDiscards(view, ctx);
  // A player in riichi must discard the tile they just drew.
  const selfRiichi = view.players[view.seat]!.riichi;
  if (selfRiichi && ctx.drawnTile) {
    candidates = candidates.filter((c) => c.tile.id === ctx.drawnTile!.id);
  }
  const ranked = rankCandidates(view, ctx, candidates);
  const genbutsuTypes = new Set<TileType>();
  for (const seat of threats) {
    for (const d of view.players[seat]!.discards) genbutsuTypes.add(d.tile.type);
  }
  const bestShanten = Math.min(...ranked.map((c) => c.shantenAfter));
  const bestEfficiency = Math.max(
    ...ranked.filter((c) => c.shantenAfter === bestShanten).map((c) => c.efficiency),
  );
  const options = ranked.map((c) =>
    toAdvice(c, view, visible, threats, genbutsuTypes, ctx, bestShanten, bestEfficiency),
  );

  let riichi: RiichiAdvice | null = null;
  if (!selfRiichi && ctx.riichiDiscardIds.length > 0) {
    const counts = countsOfTiles(view.hand);
    let bestPick: RiichiAdvice | null = null;
    for (const id of ctx.riichiDiscardIds) {
      const tile = view.hand.find((t) => t.id === id);
      if (!tile) continue;
      counts[tile.type]!--;
      const waits = tileRefs(waitsFast(counts, visible, view.melds.length));
      counts[tile.type]!++;
      const liveTotal = waits.reduce((sum, w) => sum + w.live, 0);
      if (!bestPick || liveTotal > bestPick.liveTotal) {
        bestPick = {
          tileId: id,
          tileType: tile.type,
          tileName: tileName(tile.type),
          waits,
          liveTotal,
        };
      }
    }
    riichi = bestPick;
  }

  const advice: TurnAdvice = {
    options,
    recommendation: options[0]!,
    canTsumo: ctx.canTsumo,
    riichi,
    headline: "",
  };
  advice.headline = headlineFor(advice);
  return advice;
}
