/** Current, versioned curriculum metadata. Prerequisites guide recommendations;
 * they never lock content. The lesson controller owns interactions, not this catalog. */
import { DEFAULT_RULESET } from "@openmahjong/engine";

export const SKILL_TAXONOMY_VERSION = 1;
export const SKILLS = [
  "tile-recognition", "hand-construction", "shanten", "ukeire", "wait-reading",
  "yaku", "scoring", "calling", "riichi", "defense", "push-fold", "situation",
] as const;
export type SkillId = typeof SKILLS[number];
export type LearnerStage = 1 | 2 | 3 | 4 | 5;
export const DOMAINS = {
  A: "Fundamentals", B: "Calls and construction", C: "Shanten and efficiency",
  D: "Yaku and value", E: "Riichi and winning", F: "Scoring", G: "Defense",
  H: "Advanced strategy", I: "Full-game understanding",
} as const;
export type DomainId = keyof typeof DOMAINS;
export type ModuleId =
  | "tu1" | "tu2" | "tu3" | "tu4" | "tu5" | "tu6"
  | "tu7" | "tu8" | "tu9" | "tu10" | "tu11";

export interface RulesetRef { readonly id: string; readonly version: number }
export const EDUCATION_RULESET: RulesetRef = {
  id: DEFAULT_RULESET.id, version: DEFAULT_RULESET.version,
};

export interface ModuleDef {
  readonly id: ModuleId;
  /** Content version, independent from ruleset and persisted schema versions. */
  readonly version: number;
  readonly title: string;
  readonly minutes: number;
  readonly optional?: boolean;
  readonly covered: readonly string[];
  readonly objectives: readonly string[];
  readonly domains: readonly DomainId[];
  readonly stage: LearnerStage;
  readonly skills: readonly SkillId[];
  readonly prerequisites: readonly ModuleId[];
  readonly interactions: readonly ("read" | "identify" | "choose" | "seeded-game")[];
  readonly completionCriteria: string;
  readonly reviewEligible: boolean;
  readonly rulesets: readonly RulesetRef[];
  /** Sources verify rules; they do not license copied instructional text. */
  readonly sources: readonly string[];
}

type CatalogEntry = Omit<ModuleDef, "version" | "rulesets" | "sources" | "reviewEligible">;
function lesson(entry: CatalogEntry): ModuleDef {
  // Content version 4 (2026-11-17, lesson rebuild PR E): the
  // riichi repairs — completed tile reading, the table tour,
  // signalled scene changes, stated stakes, TU-8's worked score
  // breakdown, TU-9's single furiten statement. Version-3 saves
  // restart their lesson (see lesson-progress.ts).
  return { ...entry, version: 4, rulesets: [EDUCATION_RULESET], reviewEligible: true,
    sources: ["docs/architecture/rulesets.md", "packages/engine/src/game.ts", "packages/engine/src/scoring.ts"] };
}

export const MODULES: readonly ModuleDef[] = [
  lesson({ id: "tu1", title: "The tiles", minutes: 5, stage: 1, domains: ["A"],
    skills: ["tile-recognition"], prerequisites: [], interactions: ["read", "identify"],
    objectives: ["Tell the three suits apart and read each tile's number", "Identify honors, terminals, and simples"],
    completionCriteria: "Find every target in all seven identification exercises, then finish the explanations.",
    covered: ["34 tile kinds, 4 copies each — 136 tiles", "Three suits, numbered 1 to 9, read by counting circles, counting sticks, or the top character",
      "All nine characters faces read by the top character; the 6 and the 9 told apart side by side",
      "Winds matched name to face: East, South, West, North", "Winds and dragons are honors, with no numbers", "1s and 9s are terminals; 2–8 are simples",
      "One red-tinted 5 in each suit", "Tile codes: a number plus m, p, or s; E, S, W, N for the winds; Wh, Gr, Rd for the dragons"] }),
  lesson({ id: "tu2", title: "The winning shape", minutes: 3, stage: 1, domains: ["A"],
    skills: ["hand-construction"], prerequisites: ["tu1"], interactions: ["read", "choose"],
    objectives: ["Recognize sets and pairs", "Distinguish a complete standard shape from an incomplete shape"],
    completionCriteria: "Answer both shape questions correctly and finish the special-shapes introduction.",
    covered: ["A standard winning shape is four sets and a pair", "A set is a sequence or a triplet",
      "Seven pairs and thirteen orphans are the special shapes"] }),
  lesson({ id: "tu3", title: "Draw and discard", minutes: 3, stage: 1, domains: ["A"],
    skills: ["hand-construction"], prerequisites: ["tu2"], interactions: ["read", "seeded-game"],
    objectives: ["Discard legal tiles on the real table", "Locate your discard pond"],
    completionCriteria: "Make six legal discards and finish the turn explanation.",
    covered: ["Draw one tile, discard one tile", "Your discards form your pond",
      "Table furniture: seat winds, the round label, the wall and its count, the dora indicator, the honba counter, 25,000 starting points"] }),
  lesson({ id: "tu4", title: "Calling", minutes: 5, stage: 2, domains: ["B"],
    skills: ["calling", "yaku"], prerequisites: ["tu3"], interactions: ["read", "seeded-game"],
    objectives: ["Make legal chi, pon, and kan calls", "Distinguish an open call from a concealed kan",
      "Explain what a dora is"],
    completionCriteria: "Make the requested chi, pon, and kan, then finish the explanations.",
    covered: ["A call claims a discard to complete a set", "Chi takes a discard from your left, for a sequence",
      "Pon takes any opponent's discard, for a triplet", "Kan is four of a kind; a concealed kan keeps a closed hand closed",
      "A kan turns over a new dora indicator; dora are bonus tiles"] }),
  lesson({ id: "tu5", title: "Ready and winning", minutes: 5, stage: 2, domains: ["E"],
    skills: ["wait-reading"], prerequisites: ["tu3"], interactions: ["read", "seeded-game"],
    objectives: ["Recognize tenpai and waits", "Declare tsumo and ron in legal positions"],
    completionCriteria: "Declare both demonstrated wins and finish their explanations.",
    covered: ["Tenpai means one tile from a complete shape", "Your waits are the tiles that complete the hand",
      "Ron wins on a discard; tsumo on your own draw", "Furiten: a wait in your own pond bars ron"] }),
  lesson({ id: "tu6", title: "Riichi", minutes: 3, stage: 2, domains: ["E"],
    skills: ["riichi", "wait-reading"], prerequisites: ["tu5"], interactions: ["read", "seeded-game"],
    objectives: ["Choose a legal riichi discard", "Explain the stake and hand-lock restrictions"],
    completionCriteria: "Declare riichi with an eligible discard and observe the hand's outcome.",
    covered: ["Riichi needs a closed, ready hand, 1,000 points, and at least four live-wall tiles",
      "After riichi, discard drawn tiles unless winning or making a permitted concealed kan",
      "The next winner receives riichi sticks; a draw carries them forward"] }),
  lesson({ id: "tu7", title: "Ways to win", minutes: 4, stage: 2, domains: ["D"],
    skills: ["yaku"], prerequisites: ["tu2", "tu4", "tu6"], interactions: ["read", "choose"],
    objectives: ["Identify tanyao and yakuhai", "Separate a yaku from bonus dora"],
    completionCriteria: "Answer both yaku questions correctly and finish the six-yaku introduction.",
    covered: ["Riichi, tanyao, and each qualifying yakuhai are 1 han", "Pinfu needs a closed all-sequence hand, a nonvalue pair, and a two-sided wait",
      "Toitoi and chiitoitsu are 2 han; dora alone never permit a win"] }),
  lesson({ id: "tu8", title: "Points and rounds", minutes: 4, stage: 2, domains: ["F", "I"],
    skills: ["scoring", "situation"], prerequisites: ["tu5", "tu7"], interactions: ["read", "choose", "seeded-game"],
    objectives: ["Read han, fu, and payments from a real win", "Distinguish East-only from East/South games"],
    completionCriteria: "Win the seeded hand and correctly identify its han, fu, and total received.",
    covered: ["Han and fu set the points", "Dealer wins pay more", "East-only and East/South games are available; the dealer can repeat, adding honba"] }),
  lesson({ id: "tu9", title: "Not dealing in", minutes: 3, stage: 2, domains: ["G"],
    skills: ["defense"], prerequisites: ["tu5", "tu6"], interactions: ["read", "seeded-game"],
    objectives: ["Find a riichi opponent's genbutsu", "State which opponent the safety guarantee covers"],
    completionCriteria: "Discard a tile previously discarded by the identified riichi opponent and finish the explanation.",
    covered: ["A riichi player's discards are safe against that player's ron", "They can still be dangerous against other opponents",
      "Sometimes no discard is safe; defense can mean breaking your own hand"] }),
  lesson({ id: "tu10", title: "Coming from American mahjong", minutes: 2, optional: true,
    stage: 1, domains: ["A"], skills: ["hand-construction", "yaku"], prerequisites: ["tu7"],
    interactions: ["read", "choose"], objectives: ["Distinguish riichi from American mahjong"],
    completionCriteria: "Identify yaku as riichi's scoring patterns and finish the comparison.",
    covered: ["American mahjong commonly uses jokers and an annual card", "American mahjong begins with the Charleston, a pass of tiles between players; riichi has no passing",
      "Riichi has neither jokers nor a card — yaku are the patterns"] }),
  lesson({ id: "tu11", title: "First game", minutes: 15, stage: 2, domains: ["I"],
    skills: ["hand-construction", "calling", "riichi", "situation"],
    prerequisites: ["tu3", "tu4", "tu5", "tu6", "tu7", "tu8", "tu9"], interactions: ["seeded-game"],
    objectives: ["Complete an East-only game using optional explanations"],
    completionCriteria: "Finish the real guided game launched by the App; panel-controller completion is insufficient.",
    covered: ["A full game against the CPU, with guided hints"] }),
];

export function isModuleId(value: unknown): value is ModuleId {
  return typeof value === "string" && MODULES.some((entry) => entry.id === value);
}

export function moduleDef(id: ModuleId): ModuleDef {
  const entry = MODULES.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Unknown lesson: ${id}`);
  return entry;
}

/** Advisory ordering only: every module remains directly accessible. */
export function recommendedModule(done: readonly ModuleId[]): ModuleDef | null {
  const completed = new Set(done);
  return MODULES.find((entry) => !entry.optional && !completed.has(entry.id) &&
    entry.prerequisites.every((id) => completed.has(id))) ?? null;
}
