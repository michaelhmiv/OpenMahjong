/** Current deterministic simulation revision; historical records retain v1. */
export const ENGINE_VERSION = 2 as const;

/**
 * The existing OpenMahjong house rules, named independently of engine
 * revisions. Fixing a rules bug does not silently adopt WRC/EMA defaults.
 * Only this profile is currently implemented; additional variants must
 * supply their own engine and educational compatibility checks.
 */
export interface RulesetReference {
  readonly id: string;
  readonly version: number;
}

export const DEFAULT_RULESET = Object.freeze({
  id: "openmahjong-riichi",
  version: 1,
  players: 4,
  redFives: true,
  openTanyao: true,
  kiriageMangan: false,
  doubleWindPairFu: 2,
  kazoeYakuman: true,
  stackYakuman: true,
  specificWaitDoubleYakuman: true,
  daisuushiDoubleYakuman: true,
  doubleRon: "head-bump",
  abortiveDraws: true,
  nagashiMangan: true,
  startScore: 25000,
  returnScore: 30000,
  uma: Object.freeze([15, 5, -5, -15] as const),
  tobiBelowZero: true,
  agariYame: false,
  riichiMinimumPoints: 1000,
  riichiMinimumLiveTiles: 4,
  riichiAnkan: "drawn-tile-and-unchanged-waits",
  ankanRobbing: false,
  kanDoraTiming: "ankan-before-rinshan-open-kan-after-rinshan",
  liabilityPayments: false,
  temporaryFuritenEnds: "next-draw",
  kuikaeRestriction: false,
} as const);

/** Fail explicitly rather than labeling a different engine as this ruleset. */
export function resolveRuleset(reference: RulesetReference = DEFAULT_RULESET): typeof DEFAULT_RULESET {
  if (reference.id !== DEFAULT_RULESET.id || reference.version !== DEFAULT_RULESET.version) {
    throw new Error(`Unsupported ruleset: ${reference.id}@${reference.version}`);
  }
  return DEFAULT_RULESET;
}
