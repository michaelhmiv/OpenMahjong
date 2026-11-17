/**
 * Hand scoring (brief §5, acceptance check A1): full riichi yaku detection,
 * fu calculation, and han/fu → points, proven against the ≥150-vector corpus
 * in `test/scoring-vectors.ts`.
 *
 * Ruleset: mainstream online standard (brief S1-2, S1-14) — red fives and
 * open tanyao are enabled by the game layer (dora arrives pre-counted in the
 * input); kiriage mangan is OFF (brief §5); double-wind pair is worth 2 fu;
 * multiple yakuman stack without an artificial cap.
 *
 * Input model: `handCounts` holds EVERY tile of the winning hand, including
 * tiles in declared melds (total = 14 + number of kans). Melds are listed
 * separately so the scorer knows which sets are open/closed; the closed
 * portion is derived by subtraction. Dora is an input, not computed here —
 * counting dora from indicators is the game layer's job (see wall.ts); this
 * function only turns a finished hand + context into points.
 *
 * Payments in the result INCLUDE honba (ron: discarder pays +300 per honba;
 * tsumo: every payer pays +100 per honba). Riichi sticks are not a payment —
 * they are reported separately as `stickPoints` collected from the pot.
 */

import {
  TILE_TYPE_COUNT,
  countTiles,
  isDragon,
  isHonor,
  isSuited,
  isTerminal,
  isTerminalOrHonor,
  isWind,
  rankOf,
  suitOf,
  validateCounts,
  type TileType,
} from "./tiles.js";
import { shanten } from "./hand.js";

export type WinType = "ron" | "tsumo";

export type MeldKind = "chi" | "pon" | "ankan" | "daiminkan" | "shouminkan";

export interface Meld {
  readonly kind: MeldKind;
  /** Tile types of the meld: 3 for chi/pon, 4 for a kan. */
  readonly tiles: readonly TileType[];
}

export interface ScoreInput {
  /** Per-type counts of the complete winning hand, meld tiles included. */
  readonly handCounts: readonly number[];
  /** Declared melds (empty for a fully closed hand; an ankan is a meld). */
  readonly melds: readonly Meld[];
  /** Tile type the hand was completed on (part of the closed portion). */
  readonly winningTileType: TileType;
  readonly winType: WinType;
  /** Seat wind type index (27=East … 30=North). Dealer is seat East. */
  readonly seatWind: TileType;
  /** Round wind type index (27=East, 28=South for slice-1 games). */
  readonly roundWind: TileType;
  readonly riichi: boolean;
  readonly doubleRiichi?: boolean;
  readonly ippatsu?: boolean;
  /** Tsumo on the last tile of the live wall. */
  readonly haitei?: boolean;
  /** Ron on the last discard of the hand. */
  readonly houtei?: boolean;
  /** Tsumo on a rinshan (kan replacement) draw. */
  readonly rinshan?: boolean;
  /** Ron by robbing a kan (shouminkan/daiminkan). */
  readonly chankan?: boolean;
  /** Tsumo on the very first draw of the hand (tenhou/chiihou). */
  readonly firstDrawTsumo?: boolean;
  /** Total dora han: dora + kandora + uradora + red fives, pre-counted. */
  readonly dora: number;
  readonly honba: number;
  /** Riichi sticks on the table (paid to the winner from the pot). */
  readonly riichiSticks: number;
}

export interface YakuResult {
  readonly id: string;
  readonly name: string;
  /** Han for this yaku; a yakuman entry carries 13 × its multiple. */
  readonly han: number;
}

export interface ScoreResult {
  /** Yaku only — dora is reported separately, never as a yaku. */
  readonly yaku: readonly YakuResult[];
  /** Total han: yaku han + dora. For yakuman hands, 13 × the multiple. */
  readonly han: number;
  /** Dora han included in `han` (0 for yakuman hands — dora never counts). */
  readonly dora: number;
  /** Fu (0 for yakuman hands, where fu does not apply). */
  readonly fu: number;
  /** Yakuman multiple: 0 = not a yakuman, 1 = yakuman or kazoe, 2+ = multiple. */
  readonly yakumanMultiple: number;
  /** Total the discarder pays on ron, honba included. Null on tsumo. */
  readonly ronPoints: number | null;
  /**
   * Per-payer tsumo amounts, honba included: a non-dealer pays `nonDealer`,
   * the dealer pays `dealer`. For a dealer win both fields hold the all-pay
   * amount. Null on ron.
   */
  readonly tsumoPoints: { readonly nonDealer: number; readonly dealer: number } | null;
  /** Points the winner collects from riichi sticks on the table (1000 each). */
  readonly stickPoints: number;
}

// ---------------------------------------------------------------------------
// Internal hand structure
// ---------------------------------------------------------------------------

interface Group {
  readonly kind: "sequence" | "triplet" | "kan";
  /** Sequence: lowest tile type. Triplet/kan: the tile type. */
  readonly type: TileType;
  readonly closed: boolean;
}

interface Decomposition {
  readonly groups: readonly Group[];
  readonly pairType: TileType;
}

function meldToGroup(meld: Meld): Group {
  switch (meld.kind) {
    case "chi":
      return { kind: "sequence", type: Math.min(...meld.tiles), closed: false };
    case "pon":
      return { kind: "triplet", type: meld.tiles[0]!, closed: false };
    case "ankan":
      return { kind: "kan", type: meld.tiles[0]!, closed: true };
    case "daiminkan":
    case "shouminkan":
      return { kind: "kan", type: meld.tiles[0]!, closed: false };
  }
}

function validateMeld(meld: Meld): void {
  if (!["chi", "pon", "ankan", "daiminkan", "shouminkan"].includes(meld.kind)) {
    throw new Error(`Unknown meld kind: ${String(meld.kind)}`);
  }
  const kan = meld.kind === "ankan" || meld.kind === "daiminkan" || meld.kind === "shouminkan";
  const want = kan ? 4 : 3;
  if (meld.tiles.length !== want) {
    throw new Error(`Meld ${meld.kind} must have ${want} tiles, got ${meld.tiles.length}`);
  }
  for (const t of meld.tiles) {
    if (!Number.isInteger(t) || t < 0 || t >= TILE_TYPE_COUNT) {
      throw new Error(`Invalid meld tile type: ${t}`);
    }
  }
  if (meld.kind === "chi") {
    const sorted = [...meld.tiles].sort((a, b) => a - b);
    const ok =
      isSuited(sorted[0]!) &&
      sorted[1] === sorted[0]! + 1 &&
      sorted[2] === sorted[0]! + 2 &&
      suitOf(sorted[0]!) === suitOf(sorted[2]!);
    if (!ok) throw new Error(`Chi meld is not a sequence: ${meld.tiles}`);
  } else if (!meld.tiles.every((t) => t === meld.tiles[0])) {
    throw new Error(`Meld ${meld.kind} tiles must all be one type: ${meld.tiles}`);
  }
}

/** Every decomposition of the closed portion into `setCount` sets + a pair. */
function decompose(closedCounts: readonly number[], setCount: number): Decomposition[] {
  const counts = [...closedCounts];
  const results: Decomposition[] = [];
  const groups: Group[] = [];

  function dfs(pairType: TileType | -1): void {
    let i = 0;
    while (i < TILE_TYPE_COUNT && counts[i] === 0) i++;
    if (i >= TILE_TYPE_COUNT) {
      if (pairType >= 0 && groups.length === setCount) {
        results.push({ groups: [...groups], pairType });
      }
      return;
    }
    if (groups.length > setCount) return;
    // Pair.
    if (pairType < 0 && counts[i]! >= 2) {
      counts[i]! -= 2;
      dfs(i);
      counts[i]! += 2;
    }
    // Triplet.
    if (counts[i]! >= 3) {
      counts[i]! -= 3;
      groups.push({ kind: "triplet", type: i, closed: true });
      dfs(pairType);
      groups.pop();
      counts[i]! += 3;
    }
    // Sequence.
    if (isSuited(i) && rankOf(i) <= 7 && counts[i + 1]! > 0 && counts[i + 2]! > 0) {
      counts[i]!--; counts[i + 1]!--; counts[i + 2]!--;
      groups.push({ kind: "sequence", type: i, closed: true });
      dfs(pairType);
      groups.pop();
      counts[i]!++; counts[i + 1]!++; counts[i + 2]!++;
    }
  }

  dfs(-1);
  return results;
}

function groupContains(group: Group, tile: TileType): boolean {
  if (group.kind === "sequence") return tile >= group.type && tile <= group.type + 2;
  return group.type === tile;
}

/** Wait shape of a winning group: drives wait fu and pinfu. */
type WaitKind = "ryanmen" | "kanchan" | "penchan" | "tanki" | "shanpon";

function waitKindOf(group: Group | null, winTile: TileType): WaitKind {
  if (group === null) return "tanki"; // winning tile completed the pair
  if (group.kind !== "sequence") return "shanpon";
  if (winTile === group.type + 1) return "kanchan";
  const startRank = rankOf(group.type);
  const winRank = rankOf(winTile);
  if ((startRank === 1 && winRank === 3) || (startRank === 7 && winRank === 7)) {
    return "penchan";
  }
  return "ryanmen";
}

function groupTouchesTerminalOrHonor(group: Group): boolean {
  if (group.kind === "sequence") {
    const r = rankOf(group.type);
    return r === 1 || r === 7;
  }
  return isTerminalOrHonor(group.type);
}

function isYakuhaiPair(pairType: TileType, seatWind: TileType, roundWind: TileType): boolean {
  return isDragon(pairType) || pairType === seatWind || pairType === roundWind;
}

// ---------------------------------------------------------------------------
// Points
// ---------------------------------------------------------------------------

function ceil100(n: number): number {
  return Math.ceil(n / 100) * 100;
}

interface Points {
  readonly ronPoints: number | null;
  readonly tsumoPoints: { readonly nonDealer: number; readonly dealer: number } | null;
}

export function computeRiichiPoints(
  han: number,
  fu: number,
  yakumanMultiple: number,
  isDealer: boolean,
  winType: WinType,
  honba: number,
): Points {
  let basic: number;
  if (yakumanMultiple > 0) basic = 8000 * yakumanMultiple;
  else if (han >= 13) basic = 8000; // kazoe yakuman
  else if (han >= 11) basic = 6000; // sanbaiman
  else if (han >= 8) basic = 4000; // baiman
  else if (han >= 6) basic = 3000; // haneman
  else if (han === 5) basic = 2000; // mangan
  else basic = Math.min(fu * 2 ** (han + 2), 2000); // kiriage OFF: cap only

  if (winType === "ron") {
    return {
      ronPoints: ceil100(basic * (isDealer ? 6 : 4)) + 300 * honba,
      tsumoPoints: null,
    };
  }
  const dealerPays = ceil100(basic * 2) + 100 * honba;
  const nonDealerPays = isDealer ? dealerPays : ceil100(basic) + 100 * honba;
  return { ronPoints: null, tsumoPoints: { nonDealer: nonDealerPays, dealer: dealerPays } };
}

/** Total points the winner takes from the other players (selection metric). */
function winnerGain(points: Points, isDealer: boolean): number {
  if (points.ronPoints !== null) return points.ronPoints;
  const t = points.tsumoPoints!;
  return isDealer ? 3 * t.nonDealer : 2 * t.nonDealer + t.dealer;
}

// ---------------------------------------------------------------------------
// Yaku evaluation — standard (4 sets + pair) form
// ---------------------------------------------------------------------------

interface Candidate {
  readonly yaku: readonly YakuResult[];
  readonly yakuHan: number;
  readonly fu: number;
  /** Yakuman multiple from decomposition-dependent yakuman (suuankou/suushi). */
  readonly yakumanMultiple: number;
  readonly yakumanYaku: readonly YakuResult[];
}

const Y = (id: string, name: string, han: number): YakuResult => ({ id, name, han });

function evaluateStandard(
  input: ScoreInput,
  decomp: Decomposition,
  meldGroups: readonly Group[],
  /** Index into allGroups of the winning group; -1 = winning tile made the pair. */
  winGroupIndex: number,
  handClosed: boolean,
): Candidate {
  const winTile = input.winningTileType;
  const allGroups: Group[] = [...meldGroups, ...decomp.groups];
  const pairType = decomp.pairType;
  const winGroup = winGroupIndex >= 0 ? allGroups[winGroupIndex]! : null;
  const wait = waitKindOf(winGroup, winTile);
  const ron = input.winType === "ron";

  // A triplet completed by ron counts as open (fu and ankou purposes).
  const effectiveClosed = allGroups.map((g, idx) => {
    if (idx === winGroupIndex && ron && g.kind === "triplet") return false;
    return g.closed;
  });
  const closedTriplets = allGroups.filter(
    (g, idx) => g.kind !== "sequence" && effectiveClosed[idx],
  ).length;
  const kanCount = allGroups.filter((g) => g.kind === "kan").length;
  const tripletCount = allGroups.filter((g) => g.kind !== "sequence").length;

  const yaku: YakuResult[] = [];
  let yakuHan = 0;
  const add = (id: string, name: string, han: number) => {
    yaku.push(Y(id, name, han));
    yakuHan += han;
  };

  // --- Decomposition-dependent yakuman -------------------------------------
  const yakumanYaku: YakuResult[] = [];
  let yakumanMultiple = 0;
  if (tripletCount === 4 && closedTriplets === 4) {
    if (wait === "tanki") {
      yakumanYaku.push(Y("suuankou-tanki", "Suuankou Tanki", 26));
      yakumanMultiple += 2;
    } else {
      yakumanYaku.push(Y("suuankou", "Suuankou", 13));
      yakumanMultiple += 1;
    }
  }
  const dragonTriplets = allGroups.filter((g) => g.kind !== "sequence" && isDragon(g.type)).length;
  if (dragonTriplets === 3) {
    yakumanYaku.push(Y("daisangen", "Daisangen", 13));
    yakumanMultiple += 1;
  }
  const windTriplets = allGroups.filter((g) => g.kind !== "sequence" && isWind(g.type)).length;
  if (windTriplets === 4) {
    yakumanYaku.push(Y("daisuushi", "Daisuushi", 26));
    yakumanMultiple += 2;
  } else if (windTriplets === 3 && isWind(pairType)) {
    yakumanYaku.push(Y("shousuushi", "Shousuushi", 13));
    yakumanMultiple += 1;
  }
  if (yakumanMultiple > 0) {
    return { yaku, yakuHan, fu: 0, yakumanMultiple, yakumanYaku };
  }

  // --- Situational yaku ------------------------------------------------------
  if (input.doubleRiichi) add("double-riichi", "Double Riichi", 2);
  else if (input.riichi) add("riichi", "Riichi", 1);
  if (input.ippatsu) add("ippatsu", "Ippatsu", 1);
  if (!ron && handClosed) add("menzen-tsumo", "Menzen Tsumo", 1);
  if (input.haitei) add("haitei", "Haitei Raoyue", 1);
  if (input.houtei) add("houtei", "Houtei Raoyui", 1);
  if (input.rinshan) add("rinshan", "Rinshan Kaihou", 1);
  if (input.chankan) add("chankan", "Chankan", 1);

  // --- Shape yaku ------------------------------------------------------------
  const isPinfu =
    handClosed &&
    allGroups.every((g) => g.kind === "sequence") &&
    !isYakuhaiPair(pairType, input.seatWind, input.roundWind) &&
    wait === "ryanmen";
  if (isPinfu) add("pinfu", "Pinfu", 1);

  // Iipeikou / ryanpeikou (closed hands only; sequences counted across all
  // sets — in a closed hand every sequence lives in the closed portion).
  if (handClosed) {
    const seqSignatures = new Map<number, number>();
    for (const g of allGroups) {
      if (g.kind === "sequence") {
        seqSignatures.set(g.type, (seqSignatures.get(g.type) ?? 0) + 1);
      }
    }
    let peikouUnits = 0;
    for (const n of seqSignatures.values()) peikouUnits += Math.floor(n / 2);
    if (peikouUnits >= 2) add("ryanpeikou", "Ryanpeikou", 3);
    else if (peikouUnits === 1) add("iipeikou", "Iipeikou", 1);
  }

  const counts = input.handCounts;
  const hasTerminalOrHonor = counts.some((n, t) => n > 0 && isTerminalOrHonor(t));
  const hasSimple = counts.some((n, t) => n > 0 && isSuited(t) && !isTerminal(t));
  const hasHonor = counts.some((n, t) => n > 0 && isHonor(t));
  if (!hasTerminalOrHonor) add("tanyao", "Tanyao", 1);
  if (!hasSimple) add("honroutou", "Honroutou", 2);
  if (dragonTriplets === 2 && isDragon(pairType)) add("shousangen", "Shousangen", 2);

  for (const g of allGroups) {
    if (g.kind === "sequence") continue;
    if (isDragon(g.type)) {
      if (g.type === 31) add("yakuhai-haku", "Yakuhai (Haku)", 1);
      else if (g.type === 32) add("yakuhai-hatsu", "Yakuhai (Hatsu)", 1);
      else add("yakuhai-chun", "Yakuhai (Chun)", 1);
    } else if (isWind(g.type)) {
      if (g.type === input.seatWind) add("yakuhai-seat", "Yakuhai (Seat Wind)", 1);
      if (g.type === input.roundWind) add("yakuhai-round", "Yakuhai (Round Wind)", 1);
    }
  }

  // Chanta family: every set and the pair touches a terminal or honor.
  const allTouch = allGroups.every(groupTouchesTerminalOrHonor) && isTerminalOrHonor(pairType);
  if (allTouch && hasHonor && hasSimple) {
    add("honchan", "Honchantai", handClosed ? 2 : 1);
  } else if (allTouch && !hasHonor) {
    add("junchan", "Junchan", handClosed ? 3 : 2);
  }

  // Ittsu: 123/456/789 sequences in one suit.
  const seqStartsBySuit = new Map<number, Set<number>>();
  for (const g of allGroups) {
    if (g.kind !== "sequence") continue;
    const suit = suitOf(g.type);
    if (!seqStartsBySuit.has(suit)) seqStartsBySuit.set(suit, new Set());
    seqStartsBySuit.get(suit)!.add(rankOf(g.type));
  }
  for (const starts of seqStartsBySuit.values()) {
    if (starts.has(1) && starts.has(4) && starts.has(7)) {
      add("ittsu", "Ittsu", handClosed ? 2 : 1);
      break;
    }
  }

  // Sanshoku doujun: same sequence start rank in all three suits.
  for (let r = 1; r <= 7; r++) {
    if ([0, 1, 2].every((s) => seqStartsBySuit.get(s)?.has(r))) {
      add("sanshoku-doujun", "Sanshoku Doujun", handClosed ? 2 : 1);
      break;
    }
  }
  // Sanshoku doukou: same-rank triplet/kan in all three suits.
  for (let r = 1; r <= 9; r++) {
    if (
      [0, 1, 2].every((s) =>
        allGroups.some((g) => g.kind !== "sequence" && suitOf(g.type) === s && rankOf(g.type) === r),
      )
    ) {
      add("sanshoku-doukou", "Sanshoku Doukou", 2);
      break;
    }
  }

  if (tripletCount === 4) add("toitoi", "Toitoi", 2);
  if (closedTriplets === 3) add("sanankou", "Sanankou", 2);
  if (kanCount === 3) add("sankantsu", "Sankantsu", 2);

  // Honitsu / chinitsu.
  const suitsPresent = new Set<number>();
  counts.forEach((n, t) => {
    if (n > 0 && isSuited(t)) suitsPresent.add(suitOf(t));
  });
  if (suitsPresent.size === 1) {
    if (hasHonor) add("honitsu", "Honitsu", handClosed ? 3 : 2);
    else add("chinitsu", "Chinitsu", handClosed ? 6 : 5);
  }

  // --- Fu --------------------------------------------------------------------
  let fu: number;
  if (isPinfu && !ron) {
    fu = 20; // pinfu tsumo: fixed 20 fu, no tsumo fu, no rounding
  } else {
    let raw = 20;
    if (ron && handClosed) raw += 10; // menzen kafu
    if (!ron && !isPinfu) raw += 2; // tsumo fu (waived for pinfu)
    allGroups.forEach((g, idx) => {
      if (g.kind === "sequence") return;
      let v = isTerminalOrHonor(g.type) ? 4 : 2;
      if (effectiveClosed[idx]) v *= 2;
      if (g.kind === "kan") v *= 4;
      raw += v;
    });
    if (isYakuhaiPair(pairType, input.seatWind, input.roundWind)) raw += 2;
    if (wait === "tanki" || wait === "kanchan" || wait === "penchan") raw += 2;
    fu = Math.ceil(raw / 10) * 10;
    if (fu < 30) fu = 30; // a 20-fu hand exists only as pinfu tsumo
  }

  return { yaku, yakuHan, fu, yakumanMultiple: 0, yakumanYaku: [] };
}

// ---------------------------------------------------------------------------
// Yaku evaluation — chiitoitsu form
// ---------------------------------------------------------------------------

function evaluateChiitoitsu(input: ScoreInput): Candidate | null {
  const counts = input.handCounts;
  let pairs = 0;
  for (let t = 0; t < TILE_TYPE_COUNT; t++) {
    if (counts[t] === 2) pairs++;
    else if (counts[t] !== 0) return null;
  }
  if (pairs !== 7) return null;

  const yaku: YakuResult[] = [];
  let yakuHan = 0;
  const add = (id: string, name: string, han: number) => {
    yaku.push(Y(id, name, han));
    yakuHan += han;
  };

  add("chiitoitsu", "Chiitoitsu", 2);
  if (input.doubleRiichi) add("double-riichi", "Double Riichi", 2);
  else if (input.riichi) add("riichi", "Riichi", 1);
  if (input.ippatsu) add("ippatsu", "Ippatsu", 1);
  if (input.winType === "tsumo") add("menzen-tsumo", "Menzen Tsumo", 1);
  if (input.haitei) add("haitei", "Haitei Raoyue", 1);
  if (input.houtei) add("houtei", "Houtei Raoyui", 1);
  if (input.rinshan) add("rinshan", "Rinshan Kaihou", 1);
  if (input.chankan) add("chankan", "Chankan", 1);

  const hasTerminalOrHonor = counts.some((n, t) => n > 0 && isTerminalOrHonor(t));
  const hasHonor = counts.some((n, t) => n > 0 && isHonor(t));
  if (!hasTerminalOrHonor) add("tanyao", "Tanyao", 1);
  // Seven distinct terminal/honor pairs score honroutou (2 han),
  // in addition to chiitoitsu. They are not a chanta/junchan hand.
  if (counts.every((n, t) => n === 0 || isTerminalOrHonor(t))) {
    add("honroutou", "Honroutou", 2);
  }

  const suitsPresent = new Set<number>();
  counts.forEach((n, t) => {
    if (n > 0 && isSuited(t)) suitsPresent.add(suitOf(t));
  });
  if (suitsPresent.size === 1) {
    if (hasHonor) add("honitsu", "Honitsu", 3);
    else add("chinitsu", "Chinitsu", 6);
  }

  return { yaku, yakuHan, fu: 25, yakumanMultiple: 0, yakumanYaku: [] };
}

// ---------------------------------------------------------------------------
// Counts-based yakuman (decomposition-independent)
// ---------------------------------------------------------------------------

const GREEN_TYPES: ReadonlySet<number> = new Set([19, 20, 21, 23, 25, 32]); // 2,3,4,6,8 sou + hatsu
const TERMINAL_OR_HONOR_TYPES: readonly number[] = (() => {
  const out: number[] = [];
  for (let t = 0; t < TILE_TYPE_COUNT; t++) if (isTerminalOrHonor(t)) out.push(t);
  return out;
})();

function countsYakuman(input: ScoreInput, handClosed: boolean, kanCount: number): YakuResult[] {
  const counts = input.handCounts;
  const out: YakuResult[] = [];

  if (input.firstDrawTsumo) {
    const dealer = input.seatWind === 27;
    out.push(dealer ? Y("tenhou", "Tenhou", 13) : Y("chiihou", "Chiihou", 13));
  }

  if (kanCount === 4) out.push(Y("suukantsu", "Suukantsu", 13));

  const allHonors = counts.every((n, t) => n === 0 || isHonor(t));
  const allTerminals = counts.every((n, t) => n === 0 || isTerminal(t));
  if (allHonors) out.push(Y("tsuiisou", "Tsuiisou", 13));
  if (allTerminals) out.push(Y("chinroutou", "Chinroutou", 13));

  if (counts.every((n, t) => n === 0 || GREEN_TYPES.has(t))) {
    out.push(Y("ryuuiisou", "Ryuuiisou", 13));
  }

  // Kokushi musou: closed hand, all 13 terminal/honor types, one pair.
  if (input.melds.length === 0) {
    const present = TERMINAL_OR_HONOR_TYPES.filter((t) => counts[t]! > 0).length;
    const onlyTH = counts.every((n, t) => n === 0 || isTerminalOrHonor(t));
    if (onlyTH && present === 13) {
      // 13-wait (double) iff removing the winning tile still leaves all 13
      // types present — i.e. the winning tile type is the pair.
      const thirteenWait = counts[input.winningTileType] === 2;
      out.push(
        thirteenWait
          ? Y("kokushi-13", "Kokushi Musou (13-wait)", 26)
          : Y("kokushi", "Kokushi Musou", 13),
      );
    }
  }

  // Chuuren poutou requires an undeclared 14-tile hand; a declared kan
  // prevents it even though an ankan preserves menzen for other yaku.
  if (handClosed && input.melds.length === 0) {
    const suits = new Set<number>();
    let hasHonorTile = false;
    counts.forEach((n, t) => {
      if (n === 0) return;
      if (isHonor(t)) hasHonorTile = true;
      else suits.add(suitOf(t));
    });
    if (!hasHonorTile && suits.size === 1) {
      const base = [...suits][0]! * 9;
      const c = counts.slice(base, base + 9);
      if (c[0]! >= 3 && c[8]! >= 3 && c.every((n) => n >= 1)) {
        const after = [...c];
        after[rankOf(input.winningTileType) - 1]!--;
        const pure =
          after[0] === 3 &&
          after[8] === 3 &&
          after.slice(1, 8).every((n) => n === 1) &&
          suitOf(input.winningTileType) === [...suits][0];
        out.push(
          pure
            ? Y("chuuren-junsei", "Junsei Chuuren Poutou", 26)
            : Y("chuuren", "Chuuren Poutou", 13),
        );
      }
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// scoreHand
// ---------------------------------------------------------------------------

export function scoreHand(input: ScoreInput): ScoreResult {
  // --- Validation ------------------------------------------------------------
  const counts = input.handCounts;
  validateCounts(counts, "handCounts");
  if (input.melds.length > 4) throw new Error("A hand may have at most 4 declared melds");
  if (!["ron", "tsumo"].includes(input.winType)) throw new Error("winType must be ron or tsumo");
  if (!isWind(input.seatWind) || !Number.isInteger(input.seatWind) ||
      !isWind(input.roundWind) || !Number.isInteger(input.roundWind)) {
    throw new Error("seatWind and roundWind must be wind tile types");
  }
  if (!Number.isInteger(input.winningTileType) || input.winningTileType < 0 || input.winningTileType >= TILE_TYPE_COUNT) {
    throw new Error("winningTileType must be a tile type from 0 to 33");
  }
  let kanCount = 0;
  const meldTiles = new Array<number>(TILE_TYPE_COUNT).fill(0);
  for (const meld of input.melds) {
    validateMeld(meld);
    if (meld.kind !== "chi" && meld.kind !== "pon") kanCount++;
    for (const t of meld.tiles) meldTiles[t]!++;
  }
  const total = countTiles(counts);
  if (total !== 14 + kanCount) {
    throw new Error(`Winning hand must hold 14 + kans tiles (${14 + kanCount}), got ${total}`);
  }
  const closedCounts = counts.map((n, t) => {
    const rest = n - meldTiles[t]!;
    if (rest < 0) throw new Error(`Meld tiles are not present in handCounts (type ${t})`);
    return rest;
  });
  if (closedCounts[input.winningTileType]! < 1) {
    throw new Error("Winning tile is not part of the closed portion of the hand");
  }
  const handClosed = input.melds.every((m) => m.kind === "ankan");
  if ((input.riichi || input.doubleRiichi || input.ippatsu) && !handClosed) {
    throw new Error("Riichi requires a closed hand");
  }
  if (input.doubleRiichi && !input.riichi) throw new Error("Double riichi requires riichi");
  if (input.ippatsu && !input.riichi) throw new Error("Ippatsu requires riichi");
  if (input.winType === "ron" && (input.rinshan || input.haitei || input.firstDrawTsumo)) {
    throw new Error("rinshan/haitei/firstDrawTsumo are tsumo-only");
  }
  if (input.winType === "tsumo" && (input.chankan || input.houtei)) {
    throw new Error("chankan/houtei are ron-only");
  }
  if (input.haitei && input.rinshan) throw new Error("haitei and rinshan are mutually exclusive");
  if (input.firstDrawTsumo && (input.rinshan || input.haitei)) {
    throw new Error("firstDrawTsumo excludes rinshan/haitei");
  }
  if (!Number.isInteger(input.dora) || input.dora < 0) throw new Error("dora must be a non-negative integer");
  if (!Number.isInteger(input.honba) || input.honba < 0) throw new Error("honba must be a non-negative integer");
  if (!Number.isInteger(input.riichiSticks) || input.riichiSticks < 0) {
    throw new Error("riichiSticks must be a non-negative integer");
  }
  if (shanten(closedCounts, input.melds.length) !== -1) {
    throw new Error("Hand is not a complete winning hand");
  }

  const isDealer = input.seatWind === 27;
  const stickPoints = input.riichiSticks * 1000;

  // --- Yakuman: counts-based pass -------------------------------------------
  const fixedYakumanAll = countsYakuman(input, handClosed, kanCount);

  // --- Decompositions ---------------------------------------------------------
  const meldGroups = input.melds.map(meldToGroup);
  const setCount = 4 - input.melds.length;
  const decomps = decompose(closedCounts, setCount);

  let bestDecompYakuman: Candidate | null = null;
  for (const decomp of decomps) {
    const allGroups = [...meldGroups, ...decomp.groups];
    const winIndices: number[] = [];
    allGroups.forEach((g, idx) => {
      if (idx >= meldGroups.length && groupContains(g, input.winningTileType)) {
        winIndices.push(idx);
      }
    });
    if (decomp.pairType === input.winningTileType) winIndices.push(-1);
    for (const winIdx of winIndices) {
      const cand = evaluateStandard(input, decomp, meldGroups, winIdx, handClosed);
      if (cand.yakumanMultiple > 0) {
        if (!bestDecompYakuman || cand.yakumanMultiple > bestDecompYakuman.yakumanMultiple) {
          bestDecompYakuman = cand;
        }
      }
    }
  }

  // Ordinary yaku (including honroutou) never stack onto a true yakuman.
  const decompMultiple = bestDecompYakuman?.yakumanMultiple ?? 0;
  const fixedYakuman = fixedYakumanAll;
  const fixedMultiple = fixedYakuman.reduce((a, y) => a + y.han / 13, 0);

  const totalYakuman = fixedMultiple + decompMultiple;
  if (totalYakuman > 0) {
    const yaku = [...fixedYakuman, ...(bestDecompYakuman?.yakumanYaku ?? [])];
    const points = computeRiichiPoints(13 * totalYakuman, 0, totalYakuman, isDealer, input.winType, input.honba);
    return {
      yaku,
      han: 13 * totalYakuman,
      dora: 0,
      fu: 0,
      yakumanMultiple: totalYakuman,
      ronPoints: points.ronPoints,
      tsumoPoints: points.tsumoPoints,
      stickPoints,
    };
  }
  // fixedMultiple is 0 here (any counts yakuman would have returned above).

  // --- Non-yakuman candidates ---------------------------------------------------
  interface Scored {
    readonly yaku: readonly YakuResult[];
    readonly han: number;
    readonly fu: number;
    readonly points: Points;
    readonly gain: number;
  }
  let best: Scored | null = null;
  const consider = (cand: Candidate) => {
    if (cand.yakuHan === 0) return; // no yaku — not a winning hand
    const han = cand.yakuHan + input.dora;
    const multiple = han >= 13 ? 1 : 0; // kazoe yakuman
    const points = computeRiichiPoints(han, cand.fu, multiple, isDealer, input.winType, input.honba);
    const gain = winnerGain(points, isDealer);
    if (
      !best ||
      gain > best.gain ||
      (gain === best.gain && (han > best.han || (han === best.han && cand.fu > best.fu)))
    ) {
      best = { yaku: cand.yaku, han, fu: multiple > 0 ? 0 : cand.fu, points, gain };
    }
  };

  for (const decomp of decomps) {
    const allGroups = [...meldGroups, ...decomp.groups];
    const winIndices: number[] = [];
    allGroups.forEach((g, idx) => {
      if (idx >= meldGroups.length && groupContains(g, input.winningTileType)) {
        winIndices.push(idx);
      }
    });
    if (decomp.pairType === input.winningTileType) winIndices.push(-1);
    for (const winIdx of winIndices) {
      consider(evaluateStandard(input, decomp, meldGroups, winIdx, handClosed));
    }
  }
  if (input.melds.length === 0) {
    const chiitoi = evaluateChiitoitsu(input);
    if (chiitoi) consider(chiitoi);
  }

  if (!best) throw new Error("Hand has no yaku");
  const b: Scored = best;
  const kazoe = b.han >= 13;
  return {
    yaku: b.yaku,
    han: b.han,
    dora: input.dora,
    fu: b.fu,
    yakumanMultiple: kazoe ? 1 : 0,
    ronPoints: b.points.ronPoints,
    tsumoPoints: b.points.tsumoPoints,
    stickPoints,
  };
}
