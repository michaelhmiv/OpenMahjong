/**
 * The coach's moment evaluators (coaching remainder brief, G1–G4):
 * the four decision moments the discard coach does not grade — call
 * windows, kan declarations, the riichi declaration, and the choice
 * to take or decline a drawn win.
 *
 * Same architecture as advice.ts: the CPU opponent's decision
 * pipeline opened up, not a second brain. Recommendations for call
 * windows and turn kans come from running the shared policy itself
 * on the same view; the facts attached to each option are computed
 * from the same public evaluation (shanten/ukeire, danger, the
 * engine's own scorer probed hypothetically) over the PlayerView at
 * that moment. Explanation text is template-rendered from those
 * facts. No LLM, deterministic in the view, blind to everything the
 * player cannot see, and outcome-blind: a moment is graded by what
 * was knowable when it was decided, never by how the hand ended.
 */
import {
  doraFromIndicator,
  isSuited,
  isTerminalOrHonor,
  rankOf,
  scoreHand,
  suitOf,
  type CallAction,
  type CallContext,
  type MeldState,
  type PlayerView,
  type Tile,
  type TileType,
  type TurnContext,
} from "@openmahjong/engine";
import {
  countsOfTiles,
  createAiPolicy,
  doraWeightsOf,
  evaluateDiscards,
  isYakuhai,
  ownedMeldCounts,
  riichiThreats,
  shantenChiitoitsuFast,
  shantenFast,
  shantenStandardFast,
  shouldDeclareRiichi,
  ukeireFast,
  visibleCounts,
  waitsFast,
} from "@openmahjong/ai";
import { adviseDiscard, tileName, type TileRef } from "./advice.js";
import { momentPerspectiveEvidence, type AnalysisEvidence } from "./analysis-contract.js";

// ---------------------------------------------------------------------------
// Shared probes
// ---------------------------------------------------------------------------

/** A win's value as the engine's scorer computes it from what the
 * player can see. `points` is the total collected from the other
 * players (honba included); sticks on the table are separate. For a
 * hand in riichi the value excludes ura dora — a minimum. */
export interface WinValue {
  readonly points: number;
  readonly stickPoints: number;
  readonly han: number;
  readonly yaku: readonly string[];
  readonly yakuman: boolean;
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

function redsIn(tiles: readonly Tile[]): number {
  return tiles.reduce((n, t) => n + (t.red ? 1 : 0), 0);
}

interface WinProbe {
  /** Closed-portion counts; includes the winning tile iff it is held. */
  readonly closedCounts: readonly number[];
  readonly winTileInHand: boolean;
  readonly winTileType: TileType;
  readonly winType: "ron" | "tsumo";
  readonly riichi: boolean;
  readonly rinshan?: boolean;
  /** Red fives among the final hand's known instances (the winning
   * tile included when its instance is known). */
  readonly knownReds: number;
  /** Melds of the final hand (defaults to the view's own melds). */
  readonly melds?: readonly MeldState[];
}

/** Probe a hypothetical win with the engine's scorer, or return null
 * when the hand does not legally win that way (no yaku, wrong shape).
 * Only visible dora indicators are counted — ura dora stay hidden. */
function probeWin(view: PlayerView, probe: WinProbe): WinValue | null {
  const melds = probe.melds ?? view.melds;
  const handCounts = [...probe.closedCounts];
  if (!probe.winTileInHand) handCounts[probe.winTileType]!++;
  for (const m of melds) for (const t of m.tiles) handCounts[t.type]!++;
  const weights = doraWeightsOf(view);
  let dora = probe.knownReds;
  for (let t = 0; t < 34; t++) dora += handCounts[t]! * (weights.get(t as TileType) ?? 0);
  let result;
  try {
    result = scoreHand({
      handCounts,
      melds: melds.map((m) => ({ kind: m.kind, tiles: m.tiles.map((t) => t.type) })),
      winningTileType: probe.winTileType,
      winType: probe.winType,
      seatWind: view.players[view.seat]!.seatWind,
      roundWind: view.roundWind,
      riichi: probe.riichi,
      ...(probe.rinshan ? { rinshan: true } : {}),
      ...(probe.winType === "tsumo" && !probe.rinshan && view.wallRemaining === 0
        ? { haitei: true }
        : {}),
      ...(probe.winType === "ron" && view.wallRemaining === 0 ? { houtei: true } : {}),
      dora,
      honba: view.honba,
      riichiSticks: view.sticks,
    });
  } catch {
    return null;
  }
  const isDealer = view.players[view.seat]!.isDealer;
  const points =
    probe.winType === "ron"
      ? result.ronPoints!
      : isDealer
        ? 3 * result.tsumoPoints!.dealer
        : result.tsumoPoints!.dealer + 2 * result.tsumoPoints!.nonDealer;
  return {
    points,
    stickPoints: result.stickPoints,
    han: result.han,
    yaku: result.yaku.map((y) => y.name),
    yakuman: result.yakumanMultiple > 0,
  };
}

/**
 * The yaku paths still reachable from a resulting hand — the main
 * paths only (see the moment evidence limitations). An empty list is
 * the open-hand trap the brief requires the coach to name: the hand
 * can finish its shape and still have no yaku to win with.
 */
export function yakuPaths(
  view: PlayerView,
  closedCounts: readonly number[],
  melds: readonly MeldState[],
): string[] {
  const paths: string[] = [];
  const closed = melds.every((m) => m.kind === "ankan");
  if (closed) paths.push("riichi — declare on a closed hand");
  for (const m of melds) {
    if (m.kind !== "chi" && isYakuhai(m.tiles[0]!.type, view)) {
      paths.push(`a ${tileName(m.tiles[0]!.type)} triplet is already a yaku`);
    }
  }
  for (let t = 0; t < 34; t++) {
    const type = t as TileType;
    if (closedCounts[t]! >= 3 && isYakuhai(type, view)) {
      paths.push(`a ${tileName(type)} triplet is a yaku`);
    } else if (closedCounts[t]! === 2 && isYakuhai(type, view)) {
      paths.push(`a ${tileName(type)} pair can become a yakuhai triplet`);
    }
  }
  let allSimples = true;
  let suitedSuit = -1;
  let honitsuPossible = true;
  const scan = (type: TileType): void => {
    if (isTerminalOrHonor(type)) allSimples = false;
    if (isSuited(type)) {
      const s = suitOf(type);
      if (suitedSuit === -1) suitedSuit = s;
      else if (suitedSuit !== s) honitsuPossible = false;
    }
  };
  for (let t = 0; t < 34; t++) if (closedCounts[t]! > 0) scan(t as TileType);
  for (const m of melds) for (const tile of m.tiles) scan(tile.type);
  if (allSimples) paths.push("all simples (tanyao)");
  if (honitsuPossible && suitedSuit >= 0) paths.push("a one-suit hand (honitsu)");
  if (melds.length === 0) {
    if (shantenChiitoitsuFast(closedCounts) <= 1) paths.push("seven pairs (chiitoitsu)");
    let tohTypes = 0;
    let tohPair = false;
    for (let t = 0; t < 34; t++) {
      if (!isTerminalOrHonor(t as TileType) || closedCounts[t]! === 0) continue;
      tohTypes++;
      if (closedCounts[t]! >= 2) tohPair = true;
    }
    if (13 - tohTypes - (tohPair ? 1 : 0) <= 2) paths.push("thirteen orphans (kokushi)");
  }
  return paths;
}

/** Tiles in the resulting closed hand that every riichi opponent has
 * discarded (genbutsu against all of them) — the defensive stock the
 * hand keeps. Null when no opponent is in riichi. */
function safeTilesAfter(view: PlayerView, afterCounts: readonly number[]): number | null {
  const threats = riichiThreats(view);
  if (threats.length === 0) return null;
  let n = 0;
  for (let t = 0; t < 34; t++) {
    if (afterCounts[t]! === 0) continue;
    const safe = threats.every((seat) =>
      view.players[seat]!.discards.some((d) => d.tile.type === t),
    );
    if (safe) n += afterCounts[t]!;
  }
  return n;
}

/** Dora facts about a kan declaration: what the kan tiles themselves
 * hold, and the exposure to the new indicator the kan flips. */
export interface KanDoraFacts {
  /** Dora (indicator dora + red fives) inside the four kan tiles. */
  readonly doraInKan: number;
  /** Owned tiles that are not dora now but become dora if the new
   * indicator is the one type that points at them and a copy of that
   * indicator is still unseen. Exact given the view; the indicator
   * itself is unknowable. */
  readonly potentialNewDora: number;
}

/** The indicator type that would make `doraType` a dora. */
function indicatorFor(doraType: TileType): TileType {
  if (doraType >= 27 && doraType <= 30) return (27 + ((doraType - 27 + 3) % 4)) as TileType;
  if (doraType >= 31) return (31 + ((doraType - 31 + 2) % 3)) as TileType;
  const base = suitOf(doraType) * 9;
  return (base + ((rankOf(doraType) + 7) % 9)) as TileType;
}

function kanDoraFacts(view: PlayerView, kanTiles: readonly Tile[]): KanDoraFacts {
  const weights = doraWeightsOf(view);
  let doraInKan = 0;
  for (const t of kanTiles) doraInKan += (weights.get(t.type) ?? 0) + (t.red ? 1 : 0);
  const visible = visibleCounts(view);
  const handCounts = countsOfTiles(view.hand);
  const owned = [...handCounts];
  for (const m of view.melds) for (const t of m.tiles) owned[t.type]!++;
  let potentialNewDora = 0;
  for (let t = 0; t < 34; t++) {
    const type = t as TileType;
    if (owned[t]! === 0 || (weights.get(type) ?? 0) > 0) continue;
    const indicator = indicatorFor(type);
    const unseen = 4 - visible[indicator]! - handCounts[indicator]!;
    if (unseen <= 0) continue;
    // Red fives of this type are already dora; the rest could become.
    const reds =
      view.hand.filter((x) => x.type === type && x.red).length +
      view.melds.reduce((n, m) => n + m.tiles.filter((x) => x.type === type && x.red).length, 0);
    potentialNewDora += owned[t]! - reds;
  }
  return { doraInKan, potentialNewDora };
}

// ---------------------------------------------------------------------------
// G1 — call windows
// ---------------------------------------------------------------------------

export type CallOptionAction = "ron" | "pon" | "daiminkan" | "chi" | "pass";

export interface CallOption {
  readonly action: CallOptionAction;
  /** The exact hand tile ids a chi would use (chi options only). */
  readonly chiTileIds?: readonly [number, number];
  readonly label: string;
  /** Shanten of the hand after taking this option (pass = unchanged). */
  readonly shantenAfter: number;
  /** Unseen improving copies after this option (0 unless one step
   * from a 13-tile shape). */
  readonly improvingTotal: number;
  /** This option turns a closed hand open. */
  readonly opensHand: boolean;
  readonly yakuPaths: readonly string[];
  /** No yaku path remains after this option — the open-hand trap. */
  readonly noYakuPath: boolean;
  /** Genbutsu tiles kept against every riichi threat (null: none). */
  readonly safeTiles: number | null;
  /** The win's value (ron option only). */
  readonly win: WinValue | null;
  /** New-indicator facts (daiminkan option only). */
  readonly kanDora: KanDoraFacts | null;
}

export interface RonPassFacts {
  /** Passing a ron sets temporary furiten until the player's next draw. */
  readonly temporaryFuriten: true;
  /** A player in riichi who passes a ron is furiten for the rest of
   * the hand (riichi furiten). */
  readonly permanentFuriten: boolean;
  /** Waits that sit in the player's own pond — ron on those was
   * already barred by discard furiten, independently of the pass. */
  readonly ownPondWaits: readonly TileRef[];
}

export interface CallAdvice {
  readonly analysis: AnalysisEvidence;
  readonly tileType: TileType;
  readonly tileName: string;
  readonly fromSeat: number;
  readonly phase: CallContext["phase"];
  readonly shantenBefore: number;
  readonly riichiThreat: boolean;
  /** The discarded tile is a riichi declaration discard whose
   * ippatsu window is still open. */
  readonly declarerIppatsu: boolean;
  readonly options: readonly CallOption[];
  readonly recommendation: CallOption;
  /** What passing the ron would cost (present when ron is legal). */
  readonly ronPass: RonPassFacts | null;
  headline: string;
}

function callHeadline(advice: CallAdvice): string {
  const rec = advice.recommendation;
  const tile = advice.tileName;
  switch (rec.action) {
    case "ron":
      return `Ron — the ${tile} completes your hand for ${rec.win!.points} points.`;
    case "pon":
      if (rec.noYakuPath) {
        return `Pon the ${tile} — it advances the hand, but opens it with no yaku path left.`;
      }
      return rec.shantenAfter === 0
        ? `Pon the ${tile} — your hand is ready.`
        : `Pon the ${tile} — it moves the hand closer to ready.`;
    case "daiminkan":
      return `Call kan on the ${tile} — the hand is ready, and the kan flips a new dora indicator.`;
    case "chi":
      if (rec.noYakuPath) {
        return `Chi the ${tile} — it advances the hand, but opens it with no yaku path left.`;
      }
      return rec.shantenAfter === 0
        ? `Chi the ${tile} — your hand is ready.`
        : `Chi the ${tile} — it moves the hand closer to ready.`;
    case "pass":
      if (advice.riichiThreat && advice.shantenBefore >= 2) {
        return `Pass — against riichi, calling opens your hand while you are still ${advice.shantenBefore} steps from ready.`;
      }
      if (advice.options.some((o) => o.action !== "pass" && o.noYakuPath)) {
        return `Pass — every call here opens your hand with no yaku path left.`;
      }
      return `Pass — calling does not improve this hand.`;
  }
}

/**
 * Advice for one call window: every legal response ranked by the
 * shared policy's own choice, each carrying the facts its ranking
 * used. Pure and deterministic in (view, ctx).
 */
export function adviseCall(view: PlayerView, ctx: CallContext): CallAdvice {
  const counts = countsOfTiles(view.hand);
  const melds = view.melds.length;
  const visible = visibleCounts(view);
  const threats = riichiThreats(view);
  const shantenBefore = shantenFast(counts, melds);
  const wasClosed = view.melds.every((m) => m.kind === "ankan");
  const selfRiichi = view.players[view.seat]!.riichi;

  const afterFacts = (
    afterCounts: number[],
    meldsAfter: readonly MeldState[],
    afterVisible: readonly number[],
  ): Pick<CallOption, "shantenAfter" | "improvingTotal" | "yakuPaths" | "noYakuPath" | "safeTiles"> => {
    const meldCount = meldsAfter.length;
    // A pon/chi leaves a 14-tile position that must shed a discard;
    // grade the position after its best discard (lowest shanten,
    // then widest ukeire). A daiminkan or a pass is already a
    // 13-tile position and grades directly.
    const total = afterCounts.reduce((a, b) => a + b, 0) + 3 * meldCount;
    let shantenAfter: number;
    let improvingTotal: number;
    if (total === 14) {
      shantenAfter = Number.POSITIVE_INFINITY;
      improvingTotal = 0;
      for (let t = 0; t < 34; t++) {
        if (afterCounts[t] === 0) continue;
        const c = [...afterCounts];
        c[t]! -= 1;
        const v = [...afterVisible];
        v[t]! += 1;
        const s = shantenFast(c, meldCount);
        if (s > shantenAfter) continue;
        const u = ukeireFast(c, v, meldCount).totalRemaining;
        if (s < shantenAfter || u > improvingTotal) {
          shantenAfter = s;
          improvingTotal = u;
        }
      }
    } else {
      shantenAfter = shantenFast(afterCounts, meldCount);
      improvingTotal = ukeireFast(afterCounts, afterVisible, meldCount).totalRemaining;
    }
    const paths = yakuPaths(view, afterCounts, meldsAfter);
    return {
      shantenAfter,
      improvingTotal,
      yakuPaths: paths,
      noYakuPath: paths.length === 0,
      safeTiles: safeTilesAfter(view, afterCounts),
    };
  };

  const options: CallOption[] = [];
  let ronPass: RonPassFacts | null = null;

  if (ctx.canRon) {
    const win = probeWin(view, {
      closedCounts: counts,
      winTileInHand: false,
      winTileType: ctx.tile.type,
      winType: "ron",
      riichi: selfRiichi,
      knownReds:
        redsIn(view.hand) +
        view.melds.reduce((n, m) => n + redsIn(m.tiles), 0) +
        (ctx.tile.red ? 1 : 0),
    });
    options.push({
      action: "ron",
      label: `Ron the ${tileName(ctx.tile.type)}`,
      shantenAfter: -1,
      improvingTotal: 0,
      opensHand: false,
      yakuPaths: yakuPaths(view, counts, view.melds),
      noYakuPath: false,
      safeTiles: safeTilesAfter(view, counts),
      win,
      kanDora: null,
    });
    // The furiten cost of passing this ron (brief G1, acceptance A3).
    const waits = waitsFast(counts, visible, melds, ownedMeldCounts(view));
    const ownPond = new Set(view.players[view.seat]!.discards.map((d) => d.tile.type));
    ronPass = {
      temporaryFuriten: true,
      permanentFuriten: selfRiichi,
      ownPondWaits: tileRefs(waits.filter((w) => ownPond.has(w.type))),
    };
  }

  if (ctx.phase === "call" && ctx.canPon) {
    const after = [...counts];
    after[ctx.tile.type]! -= 2;
    const meldTiles = [
      ctx.tile,
      ...view.hand.filter((t) => t.type === ctx.tile.type).slice(0, 2),
    ];
    const meldsAfter: MeldState[] = [
      ...view.melds,
      { kind: "pon", tiles: meldTiles, calledFrom: ctx.fromSeat, calledTile: ctx.tile },
    ];
    // The two hand copies move into the meld: they become seen.
    const afterVisible = [...visible];
    afterVisible[ctx.tile.type]! += 2;
    options.push({
      action: "pon",
      label: `Pon the ${tileName(ctx.tile.type)}`,
      opensHand: wasClosed,
      win: null,
      kanDora: null,
      ...afterFacts(after, meldsAfter, afterVisible),
    });
  }

  if (ctx.phase === "call" && ctx.canKan) {
    const after = [...counts];
    after[ctx.tile.type]! -= 3;
    const meldTiles = [
      ctx.tile,
      ...view.hand.filter((t) => t.type === ctx.tile.type).slice(0, 3),
    ];
    const meldsAfter: MeldState[] = [
      ...view.melds,
      { kind: "daiminkan", tiles: meldTiles, calledFrom: ctx.fromSeat, calledTile: ctx.tile },
    ];
    const afterVisible = [...visible];
    afterVisible[ctx.tile.type]! += 3;
    options.push({
      action: "daiminkan",
      label: `Kan the ${tileName(ctx.tile.type)}`,
      opensHand: wasClosed,
      win: null,
      kanDora: kanDoraFacts(view, meldTiles),
      ...afterFacts(after, meldsAfter, afterVisible),
    });
  }

  if (ctx.phase === "call") {
    for (const chiIds of ctx.chiOptions) {
      const after = [...counts];
      const afterVisible = [...visible];
      const used: Tile[] = [];
      for (const id of chiIds) {
        const t = view.hand.find((h) => h.id === id)!;
        after[t.type]!--;
        afterVisible[t.type]!++;
        used.push(t);
      }
      const meldTiles = [ctx.tile, ...used].sort((a, b) => a.type - b.type);
      const meldsAfter: MeldState[] = [
        ...view.melds,
        { kind: "chi", tiles: meldTiles, calledFrom: ctx.fromSeat, calledTile: ctx.tile },
      ];
      const seq = meldTiles.map((t) => tileName(t.type)).join(", ");
      options.push({
        action: "chi",
        chiTileIds: chiIds,
        label: `Chi — ${seq}`,
        opensHand: wasClosed,
        win: null,
        kanDora: null,
        ...afterFacts(after, meldsAfter, afterVisible),
      });
    }
  }

  options.push({
    action: "pass",
    label: "Pass",
    opensHand: false,
    win: null,
    kanDora: null,
    ...afterFacts([...counts], view.melds, visible),
  });

  // The recommendation is the shared policy's own action on this
  // exact window — the coach is the policy opened up, not a rival.
  const policyAction: CallAction = createAiPolicy().call(view, ctx);
  const recommendation =
    options.find((o) => {
      if (o.action !== policyAction.type) return false;
      if (o.action === "chi" && policyAction.type === "chi") {
        return [...o.chiTileIds!].sort().join(",") === [...policyAction.tileIds].sort().join(",");
      }
      return true;
    }) ?? options[options.length - 1]!;

  const fromPlayer = view.players[ctx.fromSeat]!;
  const lastDiscard = fromPlayer.discards[fromPlayer.discards.length - 1];
  const advice: CallAdvice = {
    analysis: momentPerspectiveEvidence(),
    tileType: ctx.tile.type,
    tileName: tileName(ctx.tile.type),
    fromSeat: ctx.fromSeat,
    phase: ctx.phase,
    shantenBefore,
    riichiThreat: threats.length > 0,
    declarerIppatsu:
      ctx.phase === "call" &&
      fromPlayer.riichi &&
      !!lastDiscard &&
      lastDiscard.tile.id === ctx.tile.id &&
      lastDiscard.riichiDeclaration,
    options,
    recommendation,
    ronPass,
    headline: "",
  };
  advice.headline = callHeadline(advice);
  return advice;
}

// ---------------------------------------------------------------------------
// G2 — kan declarations at a turn (ankan / shouminkan)
// ---------------------------------------------------------------------------

export interface KanOption {
  readonly kind: "ankan" | "shouminkan";
  readonly tileType: TileType;
  readonly tileName: string;
  /** Dora (indicator dora + red fives) inside the four kan tiles. */
  readonly doraInKan: number;
  /** Declaring breaks a seven-pairs shape the hand is chasing. */
  readonly breaksChiitoi: boolean;
  /** For a riichi player's ankan: the waits are unchanged by the
   * kan (the engine only offers it then). Null when not applicable. */
  readonly waitsPreserved: boolean | null;
  readonly shantenAfter: number;
}

export interface KanAdvice {
  readonly analysis: AnalysisEvidence;
  readonly options: readonly KanOption[];
  /** The option the shared policy would declare, or null = hold. */
  readonly recommended: KanOption | null;
  /** Dora already held across hand and melds. */
  readonly handDora: number;
  /** Owned tiles that could become dora from the new indicator the
   * kan flips (see KanDoraFacts). */
  readonly potentialNewDora: number;
  readonly riichiThreat: boolean;
  /** Declaring now spends the player's own live ippatsu chance. */
  readonly ownIppatsuLoss: boolean;
  readonly shantenNow: number;
  headline: string;
}

function kanHeadline(advice: KanAdvice, ctx: TurnContext): string {
  const rec = advice.recommended;
  if (rec) {
    return `Declare the kan of ${rec.tileName} — it flips a new dora indicator and draws a replacement tile.`;
  }
  if (ctx.canTsumo) return `Take the win instead of the kan.`;
  if (advice.options.some((o) => o.breaksChiitoi)) {
    return `Hold the kan — it would break the seven-pairs shape this hand is chasing.`;
  }
  if (advice.riichiThreat && advice.shantenNow > 0) {
    return `Hold the kan — against riichi, the new dora indicator can feed their hand before yours is ready.`;
  }
  return `Hold the kan for now.`;
}

/**
 * Advice for the kan offers at one turn decision, or null when no
 * kan is on offer. The recommendation is the shared policy's own
 * turn action restricted to the kan choice.
 */
export function adviseKan(view: PlayerView, ctx: TurnContext): KanAdvice | null {
  if (ctx.ankanOptions.length === 0 && ctx.shouminkanOptions.length === 0) return null;
  const counts = countsOfTiles(view.hand);
  const melds = view.melds.length;
  const visible = visibleCounts(view);
  const weights = doraWeightsOf(view);
  const selfRiichi = view.players[view.seat]!.riichi;
  const shantenNow = shantenFast(counts, melds);
  const chasingChiitoi =
    melds === 0 && shantenChiitoitsuFast(counts) < shantenStandardFast(counts, melds);

  const options: KanOption[] = [];
  for (const tileType of ctx.ankanOptions) {
    const kanTiles = view.hand.filter((t) => t.type === tileType);
    const after = [...counts];
    after[tileType]! -= 4;
    let waitsPreserved: boolean | null = null;
    if (selfRiichi && ctx.drawnTile) {
      const before = [...counts];
      before[ctx.drawnTile.type]!--;
      const waitsBefore = waitsFast(before, visible, melds, ownedMeldCounts(view))
        .map((w) => w.type)
        .sort((a, b) => a - b);
      const ownedAfter = ownedMeldCounts(view);
      ownedAfter[tileType]! += 4;
      const waitsAfter = waitsFast(after, visible, melds + 1, ownedAfter)
        .map((w) => w.type)
        .sort((a, b) => a - b);
      waitsPreserved = waitsBefore.join(",") === waitsAfter.join(",");
    }
    options.push({
      kind: "ankan",
      tileType,
      tileName: tileName(tileType),
      doraInKan: kanTiles.reduce((n, t) => n + (weights.get(t.type) ?? 0) + (t.red ? 1 : 0), 0),
      breaksChiitoi: chasingChiitoi,
      waitsPreserved,
      shantenAfter: shantenFast(after, melds + 1),
    });
  }
  for (const tileType of ctx.shouminkanOptions) {
    const pon = view.melds.find((m) => m.kind === "pon" && m.tiles[0]!.type === tileType)!;
    const added = view.hand.find((t) => t.type === tileType)!;
    const kanTiles = [...pon.tiles, added];
    const after = [...counts];
    after[tileType]!--;
    options.push({
      kind: "shouminkan",
      tileType,
      tileName: tileName(tileType),
      doraInKan: kanTiles.reduce((n, t) => n + (weights.get(t.type) ?? 0) + (t.red ? 1 : 0), 0),
      breaksChiitoi: false,
      waitsPreserved: null,
      shantenAfter: shantenFast(after, melds),
    });
  }

  const policyAction = createAiPolicy().turn(view, ctx);
  const recommended =
    policyAction.type === "ankan" || policyAction.type === "shouminkan"
      ? (options.find(
          (o) => o.kind === policyAction.type && o.tileType === policyAction.tileType,
        ) ?? null)
      : null;

  const handDora =
    view.hand.reduce((n, t) => n + (weights.get(t.type) ?? 0) + (t.red ? 1 : 0), 0) +
    view.melds.reduce(
      (n, m) => n + m.tiles.reduce((k, t) => k + (weights.get(t.type) ?? 0) + (t.red ? 1 : 0), 0),
      0,
    );
  const ownDiscards = view.players[view.seat]!.discards;
  const lastOwnDiscard = ownDiscards[ownDiscards.length - 1];
  const advice: KanAdvice = {
    analysis: momentPerspectiveEvidence(),
    options,
    recommended,
    handDora,
    potentialNewDora: kanDoraFacts(view, []).potentialNewDora,
    riichiThreat: riichiThreats(view).length > 0,
    // Exact case: in riichi, the last own discard is the declaration
    // discard, and no replacement draw has happened since — this is
    // the first decision after declaring, so ippatsu is still live
    // and a kan now spends it. A rinshan context means a kan this
    // turn already spent it.
    ownIppatsuLoss:
      selfRiichi && !!lastOwnDiscard && lastOwnDiscard.riichiDeclaration && !ctx.rinshan,
    shantenNow,
    headline: "",
  };
  advice.headline = kanHeadline(advice, ctx);
  return advice;
}

// ---------------------------------------------------------------------------
// G3 — the riichi declaration
// ---------------------------------------------------------------------------

export type RiichiReasonCode =
  | "good-wait" //          four or more unseen winning copies
  | "two-sided-wait" //     the wait completes a run from either end
  | "thin-wait" //          three unseen winning copies
  | "bad-wait" //           two or fewer unseen winning copies
  | "no-yaku-without-riichi" // staying silent can only win by tsumo
  | "cheap-dama" //         the silent hand's ron is worth under 2,000
  | "valuable-dama" //      the silent hand already scores big
  | "leader-late" //        first place, late: protect the lead
  | "chaser-late"; //       behind, late: the declaration buys points

export interface RiichiGrade {
  readonly analysis: AnalysisEvidence;
  /** The riichi discard the grade is about (best live wait). */
  readonly tileId: number;
  readonly tileType: TileType;
  readonly tileName: string;
  readonly waits: readonly TileRef[];
  readonly liveTotal: number;
  readonly twoSided: boolean;
  readonly tanki: boolean;
  /** Best ron value staying silent (dama), or null when no wait
   * gives a yaku without riichi — a silent hand can only tsumo. */
  readonly damaRon: WinValue | null;
  readonly damaTsumo: WinValue | null;
  /** Best ron value with riichi declared (ippatsu and ura dora are
   * expectation, never counted here). */
  readonly riichiRon: WinValue | null;
  /** 1..4 by current scores. */
  readonly placement: number;
  readonly behindLeader: number;
  /** Points ahead of second place (0 unless placement is 1). */
  readonly leadOverSecond: number;
  readonly lateGame: boolean;
  /** The shared policy's lightweight heuristic would declare. */
  readonly policyRecommends: boolean;
  readonly verdict: "declare" | "dama" | "either";
  readonly reasons: readonly RiichiReasonCode[];
  headline: string;
}

function riichiHeadline(grade: RiichiGrade): string {
  const waitNames = grade.waits.map((w) => `the ${w.name}`).join(" and ");
  if (grade.verdict === "declare") {
    return `Declare riichi — waiting on ${waitNames}, ${grade.liveTotal} unseen copies.`;
  }
  if (grade.verdict === "dama") {
    if (grade.reasons.includes("leader-late")) {
      return `Staying silent is defensible — you lead by ${grade.leadOverSecond} points late, and a silent win ends the game the same way.`;
    }
    if (grade.damaRon) {
      return `Staying silent is defensible — this hand already scores ${grade.damaRon.points} points without riichi.`;
    }
    return `Staying silent is defensible — the wait is thin, and riichi locks the hand.`;
  }
  return `Riichi or staying silent — both are defensible here.`;
}

/**
 * Grade the riichi decision at one turn: declare vs stay silent
 * (dama), weighed by wait quality, the value the hand already has
 * without riichi, and the score/round context. Null when no riichi
 * declaration is on offer.
 */
export function adviseRiichi(view: PlayerView, ctx: TurnContext): RiichiGrade | null {
  if (ctx.riichiDiscardIds.length === 0) return null;
  if (view.players[view.seat]!.riichi) return null;
  const counts = countsOfTiles(view.hand);
  const melds = view.melds.length;
  const visible = visibleCounts(view);
  const owned = ownedMeldCounts(view);

  // The declaration the grade is about: the riichi discard with the
  // widest live wait (the discard coach's own pick).
  let pick: {
    tile: Tile;
    after: number[];
    waits: TileRef[];
    liveTotal: number;
  } | null = null;
  for (const id of ctx.riichiDiscardIds) {
    const tile = view.hand.find((t) => t.id === id);
    if (!tile) continue;
    const after = [...counts];
    after[tile.type]!--;
    const afterVisible = [...visible];
    afterVisible[tile.type]!++;
    const waits = tileRefs(waitsFast(after, afterVisible, melds, owned));
    const liveTotal = waits.reduce((sum, w) => sum + w.live, 0);
    if (!pick || liveTotal > pick.liveTotal) pick = { tile, after, waits, liveTotal };
  }
  if (!pick) return null;

  const twoSided = pick.waits.some((a) =>
    pick!.waits.some(
      (b) =>
        isSuited(b.type) &&
        isSuited(a.type) &&
        suitOf(b.type) === suitOf(a.type) &&
        rankOf(b.type) - rankOf(a.type) === 3,
    ),
  );
  // A single wait on a tile type the hand holds exactly one of is a
  // tanki (pair) wait; a single wait on a type the hand does not
  // hold is an edge/closed (penchan/kanchan) wait.
  const tanki = pick.waits.length === 1 && pick.after[pick.waits[0]!.type] === 1;

  // Value probes over the waits: what the hand scores staying
  // silent, and what riichi itself adds (ippatsu/ura excluded).
  const knownReds =
    redsIn(view.hand.filter((t) => t.id !== pick!.tile.id)) +
    view.melds.reduce((n, m) => n + redsIn(m.tiles), 0);
  let damaRon: WinValue | null = null;
  let damaTsumo: WinValue | null = null;
  let riichiRon: WinValue | null = null;
  for (const w of pick.waits) {
    const ron = probeWin(view, {
      closedCounts: pick.after, winTileInHand: false, winTileType: w.type,
      winType: "ron", riichi: false, knownReds,
    });
    if (ron && (!damaRon || ron.points > damaRon.points)) damaRon = ron;
    const tsumo = probeWin(view, {
      closedCounts: pick.after, winTileInHand: false, winTileType: w.type,
      winType: "tsumo", riichi: false, knownReds,
    });
    if (tsumo && (!damaTsumo || tsumo.points > damaTsumo.points)) damaTsumo = tsumo;
    const ronRiichi = probeWin(view, {
      closedCounts: pick.after, winTileInHand: false, winTileType: w.type,
      winType: "ron", riichi: true, knownReds,
    });
    if (ronRiichi && (!riichiRon || ronRiichi.points > riichiRon.points)) riichiRon = ronRiichi;
  }

  const myScore = view.players[view.seat]!.score;
  const scores = view.players.map((p) => p.score);
  const placement = 1 + scores.filter((s) => s > myScore).length;
  const behindLeader = Math.max(...scores) - myScore;
  const leadOverSecond =
    placement === 1
      ? myScore - Math.max(...scores.filter((_, i) => i !== view.seat))
      : 0;
  const lateGame = view.roundWind === 28 || view.wallRemaining <= 20;

  const candidate = evaluateDiscards(view, ctx, { allInstances: true }).find(
    (c) => c.tile.id === pick!.tile.id,
  );
  const policyRecommends = candidate ? shouldDeclareRiichi(view, candidate) : false;

  const reasons: RiichiReasonCode[] = [];
  let score = 0;
  if (pick.liveTotal >= 4) { score += 2; reasons.push("good-wait"); }
  if (twoSided) { score += 1; reasons.push("two-sided-wait"); }
  if (pick.liveTotal <= 2) { score -= 2; reasons.push("bad-wait"); }
  else if (pick.liveTotal === 3) { score -= 1; reasons.push("thin-wait"); }
  if (damaRon === null) { score += 3; reasons.push("no-yaku-without-riichi"); }
  else if (damaRon.han >= 4 || damaRon.points >= 8000) { score -= 2; reasons.push("valuable-dama"); }
  else if (damaRon.points < 2000) { score += 1; reasons.push("cheap-dama"); }
  if (lateGame && placement >= 3) { score += 2; reasons.push("chaser-late"); }
  // Protecting a commanding late lead is categorical, not a weight:
  // when the hand can already win silently, riichi's extra points
  // cannot change the placement — they buy nothing, while the
  // 1,000-point stick is at risk and the declaration locks the hand.
  // A hand that can only score by declaring (damaRon === null) is
  // exempt: there, riichi is how the leader ends the game at all.
  const protectLead = lateGame && placement === 1 && leadOverSecond >= 8000 && damaRon !== null;
  if (protectLead) reasons.push("leader-late");
  const verdict = protectLead ? "dama" : score >= 2 ? "declare" : score <= -2 ? "dama" : "either";

  const grade: RiichiGrade = {
    analysis: momentPerspectiveEvidence(),
    tileId: pick.tile.id,
    tileType: pick.tile.type,
    tileName: tileName(pick.tile.type),
    waits: pick.waits,
    liveTotal: pick.liveTotal,
    twoSided,
    tanki,
    damaRon,
    damaTsumo,
    riichiRon,
    placement,
    behindLeader,
    leadOverSecond,
    lateGame,
    policyRecommends,
    verdict,
    reasons,
    headline: "",
  };
  grade.headline = riichiHeadline(grade);
  return grade;
}

// ---------------------------------------------------------------------------
// G4 — take the drawn win, or decline it
// ---------------------------------------------------------------------------

export type WinReasonCode =
  | "certain-value" //        the win is in hand now
  | "higher-ceiling" //       declining keeps a wait worth more
  | "wide-wait-after-decline" // the kept wait has 4+ unseen copies
  | "turns-remain"; //        enough wall left to plausibly reach it

export interface WinAdvice {
  readonly analysis: AnalysisEvidence;
  /** The tsumo's value now (a minimum in riichi: ura dora hidden). */
  readonly value: WinValue;
  readonly uraUnknown: boolean;
  /** The discard that keeps the highest win reachable if the
   * player declines (ties: widest live wait, then the discard
   * coach's own recommendation). */
  readonly declineTileName: string;
  readonly declineWaits: readonly TileRef[];
  readonly declineLive: number;
  /** Best win value still reachable after declining, or null when
   * declining leaves the hand short of ready. */
  readonly ceiling: WinValue | null;
  readonly turnsRemaining: number;
  readonly verdict: "take" | "decline-defensible";
  readonly reasons: readonly WinReasonCode[];
  headline: string;
}

/**
 * Grade the win choice at one turn: the certain tsumo against the
 * realistic ceiling of declining it. Null when no tsumo is on offer.
 * Declining is rarely right; the verdict says so unless the ceiling
 * is far above the certain value, the kept wait is wide, and enough
 * of the wall remains to reach it.
 */
export function adviseWin(view: PlayerView, ctx: TurnContext): WinAdvice | null {
  if (!ctx.canTsumo || !ctx.drawnTile) return null;
  const selfRiichi = view.players[view.seat]!.riichi;
  const counts = countsOfTiles(view.hand);
  const value = probeWin(view, {
    closedCounts: counts,
    winTileInHand: true,
    winTileType: ctx.drawnTile.type,
    winType: "tsumo",
    riichi: selfRiichi,
    rinshan: ctx.rinshan,
    knownReds: redsIn(view.hand) + view.melds.reduce((n, m) => n + redsIn(m.tiles), 0),
  });
  if (!value) return null;

  // The decline path. G4 asks what declining is worth at its best,
  // so scan every legal discard for the highest win still reachable:
  // the discard coach's own pick optimizes ukeire width, which would
  // underrate a narrow wait with a far higher ceiling (the yakuman
  // case). Ties go to the wider live wait, then to the discard
  // coach's own recommendation.
  const discardAdvice = adviseDiscard(view, ctx);
  const rec = discardAdvice.recommendation;
  const meldReds = view.melds.reduce((n, m) => n + redsIn(m.tiles), 0);
  let best: { candidate: (typeof discardAdvice.options)[number]; ceiling: WinValue; live: number } | null = null;
  for (const candidate of discardAdvice.options) {
    if (candidate.shantenAfter !== 0) continue;
    const after = [...counts];
    after[candidate.tileType]!--;
    const instance = view.hand.find((t) => t.id === candidate.tileId);
    const knownRedsAfter = redsIn(view.hand) - (instance?.red ? 1 : 0) + meldReds;
    let ceilingFor: WinValue | null = null;
    for (const w of candidate.waits) {
      for (const winType of ["ron", "tsumo"] as const) {
        const probe = probeWin(view, {
          closedCounts: after, winTileInHand: false, winTileType: w.type,
          winType, riichi: selfRiichi, knownReds: knownRedsAfter,
        });
        if (probe && (!ceilingFor || probe.points > ceilingFor.points)) ceilingFor = probe;
      }
    }
    if (!ceilingFor) continue;
    const live = candidate.waits.reduce((sum, w) => sum + w.live, 0);
    if (
      !best ||
      ceilingFor.points > best.ceiling.points ||
      (ceilingFor.points === best.ceiling.points && live > best.live) ||
      (ceilingFor.points === best.ceiling.points &&
        live === best.live &&
        candidate.tileId === rec.tileId)
    ) {
      best = { candidate, ceiling: ceilingFor, live };
    }
  }
  const ceiling = best?.ceiling ?? null;
  const declineTileName = best?.candidate.tileName ?? rec.tileName;
  const declineWaits = best?.candidate.waits ?? rec.waits;
  const declineLive = best?.live ?? rec.waits.reduce((sum, w) => sum + w.live, 0);

  const reasons: WinReasonCode[] = ["certain-value"];
  if (ceiling && ceiling.points > value.points) reasons.push("higher-ceiling");
  // A wide kept wait is four or more live copies — except against a
  // yakuman ceiling, where two live copies with wall remaining is
  // the classic decline: the prize is four-plus times the certain
  // value, so a thinner wait still prices out.
  const wideWait =
    declineLive >= 4 || (ceiling?.yakuman === true && declineLive >= 2);
  if (wideWait) reasons.push("wide-wait-after-decline");
  if (view.wallRemaining >= 16) reasons.push("turns-remain");
  const verdict =
    ceiling !== null &&
    ceiling.points >= value.points + 8000 &&
    wideWait &&
    view.wallRemaining >= 16
      ? "decline-defensible"
      : "take";

  const advice: WinAdvice = {
    analysis: momentPerspectiveEvidence(),
    value,
    uraUnknown: selfRiichi,
    declineTileName,
    declineWaits,
    declineLive,
    ceiling,
    turnsRemaining: view.wallRemaining,
    verdict,
    reasons,
    headline:
      verdict === "take"
        ? `Take the win — tsumo pays ${value.points} points now.`
        : `The win pays ${value.points} points now, but discarding the ${declineTileName} keeps a wait worth up to ${ceiling!.points} — with ${view.wallRemaining} tiles left in the wall, holding out is defensible.`,
  };
  return advice;
}
