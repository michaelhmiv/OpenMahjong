/** Original beginner curriculum. Exercises bind to a concrete profile and
 * use independent worked examples; review heuristics never become quiz keys. */
import { TAIWANESE_LESSONS } from "./taiwanese-lessons.js";
import { MCR_LESSONS } from "./mcr-lessons.js";
import { AMERICAN_LESSONS } from "./american-lessons.js";
import { validateMcrGuide } from "./mcr-guide.js";
import {
  parseCounts,
  scoreHongKong,
  hongKongPayments,
  standardShapes,
  type VariantId,
} from "@openmahjong/engine";
export const VARIANT_LEARNING_KEY = "openmahjong.variant-learning.v1";
export const VARIANT_RELEASES: {
  id: VariantId;
  name: string;
  profileId: string;
  released: boolean;
}[] = [
  {
    id: "hong-kong",
    name: "Hong Kong Old Style",
    profileId: "openmahjong-hkos",
    released: true,
  },
  { id: "mcr", name: "MCR", profileId: "openmahjong-mcr-2006", released: true },
  {
    id: "taiwanese",
    name: "Taiwanese",
    profileId: "openmahjong-taiwanese-every-flower",
    released: true,
  },
];
/** Lesson format v2 (brief-lesson-rebuild-v2, PR A): a lesson is a
 * sequence of steps. Each step carries one idea of text and may show
 * tiles, picture a hand, and/or pose one check question. A question's
 * `hint` is the wrong-answer teaching feedback: it restates the rule
 * or the method and never states the answer. `explanation` is shown
 * only after a correct answer. */
interface VariantQuestionBase {
  readonly id: string;
  readonly prompt: string;
  readonly explanation: string;
  readonly hint: string;
  readonly tiles?: string;
  readonly verify: () => string;
}
export interface VariantChoiceQuestion extends VariantQuestionBase {
  readonly kind: "choice";
  readonly choices: readonly string[];
  readonly answer: number;
}
export interface VariantTilePickQuestion extends VariantQuestionBase {
  readonly kind: "tile-pick";
  /** Notation for the shown tile row; tiles are tapped by position.
   * The row renders in exactly the order this notation names the
   * tiles (education/notation.ts), never in canonical type order. */
  readonly tiles: string;
  /** Indices into the tile row, in notation order, that must be picked. */
  readonly picks: readonly number[];
}
export type VariantQuestion = VariantChoiceQuestion | VariantTilePickQuestion;
export interface VariantStep {
  readonly text?: string;
  /** Notation for a row of tiles shown with this step. */
  readonly tiles?: string;
  /** Notation for a pictured hand shown with this step. */
  readonly hand?: string;
  readonly question?: VariantQuestion;
}
export interface VariantLesson {
  readonly id: string;
  readonly variant: VariantId;
  readonly profileId: string;
  readonly version: 2;
  readonly title: string;
  readonly steps: readonly VariantStep[];
}
/** Mechanical v1→v2 conversion used by the content files: each
 * paragraph becomes a text step, then each question becomes a
 * question step, preserving the old read-then-check order. */
export function stepsFromParagraphs(
  paragraphs: readonly string[],
  questions: readonly VariantQuestion[],
): VariantStep[] {
  return [
    ...paragraphs.map((text) => ({ text })),
    ...questions.map((question) => ({ question })),
  ];
}
export function variantLessonQuestions(
  lesson: VariantLesson,
): VariantQuestion[] {
  return lesson.steps.flatMap((s) => (s.question ? [s.question] : []));
}
const hkSteps = (
  id: string,
  title: string,
  steps: VariantStep[],
): VariantLesson => ({
  id: `hk-${id}`,
  variant: "hong-kong",
  profileId: "openmahjong-hkos",
  version: 2,
  title,
  steps,
});
const choice = (
  id: string,
  prompt: string,
  choices: string[],
  answer: number,
  explanation: string,
  hint: string,
  verify?: () => string,
  tiles?: string,
): VariantQuestion => ({
  kind: "choice",
  id,
  prompt,
  choices,
  answer,
  explanation,
  hint,
  ...(tiles ? { tiles } : {}),
  verify: verify ?? (() => choices[answer]!),
});
const pick = (
  id: string,
  prompt: string,
  tiles: string,
  picks: number[],
  explanation: string,
  hint: string,
): VariantQuestion => ({
  kind: "tile-pick",
  id,
  prompt,
  tiles,
  picks,
  explanation,
  hint,
  verify: () => picks.join(","),
});
const scoredAs = (
  notation: string,
  winningTile: number,
  extra: Partial<Parameters<typeof scoreHongKong>[0]> = {},
) =>
  scoreHongKong({
    counts: parseCounts(notation),
    melds: [],
    winningTile,
    selfDraw: false,
    seatWind: 27,
    roundWind: 27,
    flowers: [],
    replacement: false,
    robbingQuad: false,
    lastWall: false,
    initial: false,
    lastCopy: false,
    ...extra,
  });
const HK_SEQ_HAND = "123456m123p789s11z";
const HK_WORKED_HAND = "222m333p444s555z11z";
export const VARIANT_LESSONS: VariantLesson[] = [
  hkSteps("tiles", "Tiles, suits and flowers", [
    {
      text: "Mahjong is a game for four players, played with tiles. The tiles below are the characters suit, shown in order from 1 to 9. Each face shows its number written as a character, with a second red character below it. A suit is a family of numbered tiles that belong together.",
      tiles: "123456789m",
    },
    {
      text: "The tiles below are the circles suit, also shown from 1 to 9. Each face shows its number as a pattern of circles, so you can read the number by counting the circles on the face.",
      tiles: "123456789p",
    },
    {
      text: "The tiles below are the bamboo suit, shown from 1 to 9. Each face shows its number as a pattern of bamboo sticks, which you can count the same way. The 1 of bamboo is the exception: it shows one large design instead of a single stick.",
      tiles: "123456789s",
    },
    {
      text: "Eight extra tiles are bonus tiles, also called flowers: four plants and four seasons. On this table the word flower means any of these eight bonus tiles — a plant or a season — not only a tile whose picture is a flower. The plants are plum, orchid, chrysanthemum and bamboo plant, numbered 1 to 4. The seasons are spring, summer, autumn and winter, also numbered 1 to 4. Each bonus face shows its number in the corner and a picture of its plant or season. A bonus tile is never kept as part of your hand: when one appears, it is placed face-up beside your hand and you take another tile instead. Lesson 4 teaches that procedure in full.",
    },
    {
      text: "Tiles are counted by kind and by copy. A kind is one distinct face, such as the 5 of circles or the East wind. A copy is one physical tile of that kind, and the game holds four copies of every ordinary kind. There are 34 ordinary kinds in all: 27 numbered kinds (nine numbers in each of three suits) and seven kinds for the tiles with no numbers, the winds and dragons you meet next. Four copies of each of the 34 kinds make 136 tiles, and the eight bonus tiles bring the total to 144. The full collection of tiles a table plays with is its inventory.",
    },
    {
      question: choice(
        "hk-inventory",
        "How many physical tiles are in this table’s inventory?",
        ["136", "144", "148", "152"],
        1,
        "Four copies of each of the 34 ordinary kinds make 136, plus the eight unique bonus tiles gives 144.",
        "Count the ordinary tiles first: four copies of each kind, and there are 34 kinds. Then add the unique bonus tiles.",
      ),
    },
    {
      text: "The seven tiles below are the honors. The first four are the winds: East, South, West and North. The last three are the dragons: the white dragon has a plain bordered face, the green dragon is green, and the red dragon is red. An honor has no number, so it can only ever match copies of itself.",
      tiles: "1234567z",
    },
    {
      question: pick(
        "hk-winds-pick",
        "Tap every wind tile in this row.",
        "1234567z",
        [0, 1, 2, 3],
        "The first four tiles are the winds: East, South, West and North. The last three are dragons.",
        "Read the row in the order it was taught: the four direction tiles come before the three dragons.",
      ),
    },
    {
      question: pick(
        "hk-dragons-pick",
        "Tap every dragon tile in this row.",
        "1234567z",
        [4, 5, 6],
        "The last three tiles are the dragons: white, green and red.",
        "The dragons are the three honor faces that are not named for a direction: a plain bordered face, a green face and a red face.",
      ),
    },
    {
      text: "The 1 and the 9 of a numbered suit are its end tiles. They are called terminals. The row below shows the terminals of all three suits: the 1 and 9 of characters, of circles and of bamboo.",
      tiles: "19m19p19s",
    },
    {
      question: choice(
        "hk-terminal-count",
        "How many terminal kinds are there in the three numbered suits?",
        ["Three", "Six", "Nine", "Twelve"],
        1,
        "Each suit has two terminals, its 1 and its 9, and there are three suits: two times three is six.",
        "Count the ends suit by suit: each numbered suit contributes its 1 and its 9.",
      ),
    },
    {
      text: "Your place at the table is your seat. The four seats are named East, South, West and North, and the bonus tile numbers belong to seats: number 1 belongs to East, 2 to South, 3 to West and 4 to North. A plant and a season with the same number belong to the same seat.",
    },
    {
      question: choice(
        "hk-seat-number",
        "You sit in the West seat. Which numbered plant belongs to your seat?",
        ["Plant 1", "Plant 2", "Plant 3", "Plant 4"],
        2,
        "The numbers run in seat order: East is 1, South is 2, West is 3 and North is 4, so West takes plant 3.",
        "Run through the seats in order — East, South, West, North — and count 1, 2, 3, 4 as you go.",
      ),
    },
    {
      text: "Reading characters by face takes practice. Circles and bamboo are read by counting the marks on the face, but a characters tile is read by the character at the top of its face: each number from 1 to 9 has its own top character, while the red character below it is the same on every characters tile. The drills that follow show single faces and shuffled rows that are not in number order, so each face has to be read on its own, not by its place in a row.",
    },
    {
      question: choice(
        "hk-char-face-8",
        "Which number is this characters tile?",
        ["Six", "Seven", "Eight", "Nine"],
        2,
        "This face is the 8 of characters. Its top character is the one that stands for eight in the labelled row at the start of this lesson.",
        "Ignore the red character below — it is the same on every characters tile. Read the top character and match it against the labelled row from the start of this lesson.",
        undefined,
        "8m",
      ),
    },
    {
      question: choice(
        "hk-char-face-3",
        "Read this face: which number is it?",
        ["Two", "Three", "Four", "Five"],
        1,
        "This face is the 3 of characters, read from its top character.",
        "Read the top character only, and match it against the labelled row from the start of this lesson — the red character below never changes.",
        undefined,
        "3m",
      ),
    },
    {
      question: choice(
        "hk-char-face-6",
        "Which number does this characters face show?",
        ["Five", "Six", "Eight", "Nine"],
        1,
        "This face is the 6 of characters. The 6 and the 9 have different top characters, and this one is the six.",
        "The 6 and the 9 are the two faces most often confused. Compare the top character with both faces in the labelled row at the start of this lesson.",
        undefined,
        "6m",
      ),
    },
    {
      question: pick(
        "hk-char-row-9",
        "Tap the 9 of characters in this shuffled row.",
        "7m2m9m4m",
        [2],
        "The third tile is the 9 of characters. The row is shuffled, so the 9 is not in its taught place at the end of the row.",
        "Read each face by its top character, one at a time, until you reach the character that stands for nine.",
      ),
    },
    {
      text: "The four wind faces need the same treatment. In the honors row they were shown in seat order — East, South, West, North — but at the table a wind face must be recognised on its own. The next four drills show shuffled rows: find the named wind by its face, not by its place in the row.",
    },
    {
      question: pick(
        "hk-wind-east-face",
        "Tap the East wind in this shuffled row.",
        "3z1z4z2z",
        [1],
        "The second tile is East. The row runs West, East, North, South — shuffled, not in seat order.",
        "Picture the four wind faces in seat order — East, South, West, North — and look for the face that belongs to East, wherever it sits in this row.",
      ),
    },
    {
      question: pick(
        "hk-wind-south-face",
        "Tap the South wind in this shuffled row.",
        "2z4z1z3z",
        [0],
        "The first tile is South. The row runs South, North, East, West.",
        "Match the face, not the place: find the second wind face in seat order — East, South, West, North — among these shuffled faces.",
      ),
    },
    {
      question: pick(
        "hk-wind-west-face",
        "Tap the West wind in this shuffled row.",
        "4z3z2z1z",
        [1],
        "The second tile is West. The row runs North, West, South, East — seat order reversed.",
        "West is the third wind in seat order — East, South, West, North. Look for that face in this row.",
      ),
    },
    {
      question: pick(
        "hk-wind-north-face",
        "Tap the North wind in this shuffled row.",
        "1z3z2z4z",
        [3],
        "The last tile is North. The row runs East, West, South, North.",
        "North is the last wind in seat order — East, South, West, North. Look for that face in this row.",
      ),
    },
    {
      text: "That is the full collection of tiles: three numbered suits, seven honors and eight bonus tiles, 144 tiles in all. The next lesson builds a winning hand out of these faces.",
    },
  ]),
  hkSteps("shape", "Four sets and a pair", [
    {
      text: "A set is a group of tiles that belongs together in a hand. One kind of set is a sequence: three tiles of the same suit whose numbers run in a row. The three tiles below form a sequence: the 3, 4 and 5 of circles.",
      tiles: "345p",
    },
    {
      text: "A second kind of set is a triplet: three identical tiles. The three tiles below form a triplet of South winds. Any three matching faces make a triplet, numbered tiles and honors alike.",
      tiles: "222z",
    },
    {
      text: "A pair is two identical tiles. The two tiles below form a pair of East winds. A winning hand contains exactly one pair, alongside its sets.",
      tiles: "11z",
    },
    {
      text: "A standard winning hand is four sets and a pair. Read the pictured hand aloud: 1-2-3 of characters and 4-5-6 of characters are two sequences; 1-2-3 of circles is a sequence; 7-8-9 of bamboo is a sequence; and the two East winds are the pair. Four sequences and a pair make the complete shape.",
      hand: HK_SEQ_HAND,
    },
    {
      hand: HK_SEQ_HAND,
      question: choice(
        "hk-complete-shape",
        "How many sets does the displayed standard hand contain?",
        ["Three sets", "Four sets", "Five sets", "Six sets"],
        1,
        "The hand breaks into 1-2-3 characters, 4-5-6 characters, 1-2-3 circles and 7-8-9 bamboo: four sequences. The two East winds are the pair, not a set.",
        "Break the shown hand into groups suit by suit, and keep the pair separate: a pair is not a set.",
        () =>
          standardShapes(parseCounts(HK_SEQ_HAND), [], 4)[0]!.groups
            .length === 4
            ? "Four sets"
            : "invalid",
      ),
    },
    {
      text: "The tiles you hold in your hand are concealed: only you can see their faces. A set you show face-up to the table is open — on the game screens a shown set is also called a meld — and once a set is open it is fixed — its tiles cannot later be moved into a different grouping.",
    },
    {
      text: "Between turns you hold thirteen tiles, counting each open set as three places. On your turn you hold fourteen tiles for a moment, while you decide what to do, and then you return to thirteen. A winning hand is the fourteen-tile shape: four sets and a pair.",
    },
    {
      text: "A third kind of set is a quad: four identical tiles declared together as one set. The four tiles below form a quad of the 1 of characters. Because a quad puts four physical tiles into one set, a winning hand containing one quad has fifteen physical tiles, while still being four sets and a pair. How quads are declared is taught in Lesson 8.",
      tiles: "1111m",
    },
    {
      question: choice(
        "hk-quad-count",
        "A winning hand contains one quad. How many physical tiles does it contain in total?",
        ["Fourteen", "Fifteen", "Sixteen", "Seventeen"],
        1,
        "Four sets and a pair use fourteen places. The quad contributes one extra physical tile beyond its three places, giving fifteen.",
        "Start from the fourteen places of four sets and a pair, then add the one extra physical tile a quad carries.",
      ),
    },
    {
      question: pick(
        "hk-find-triplet",
        "Tap the three tiles that form a triplet in this row.",
        "3m4m5m7p7p7p9s",
        [3, 4, 5],
        "The three 7 of circles tiles are identical faces, so they form the triplet. The 3, 4 and 5 of characters are three different faces, not copies of one face.",
        "A triplet is three copies of one face. Look for the face that appears three times.",
      ),
    },
    {
      text: "Two sequence rules close this lesson. A sequence must stay inside one suit: the 3 of characters, 4 of circles and 5 of bamboo is not a sequence, even though the numbers run. And a sequence cannot wrap around the end: 8, 9 and 1 is not a sequence. Honors never form sequences, because they have no numbers.",
    },
    {
      question: choice(
        "hk-mixed-sequence",
        "Which of these groups is a sequence?",
        [
          "3 of characters, 4 of circles, 5 of bamboo",
          "8 of bamboo, 9 of bamboo, 1 of bamboo",
          "4 of circles, 5 of circles, 6 of circles",
          "East wind, South wind, West wind",
        ],
        2,
        "The 4, 5 and 6 of circles are three consecutive numbers in one suit. The first group mixes suits, the second wraps past 9, and winds have no numbers.",
        "Test each group against both rules: one suit only, and numbers running in a row without wrapping past an end.",
      ),
    },
    {
      question: pick(
        "hk-char-row-8",
        "One more face drill before the lesson ends. Tap the 8 of characters in this shuffled row.",
        "5m8m1m6m",
        [1],
        "The second tile is the 8 of characters. The row is shuffled, so the face was read by its top character, not by its place.",
        "Read each face by its top character, one at a time, until you reach the character that stands for eight.",
      ),
    },
    {
      text: "You can now read the shape of a hand: four sets and a pair. Shape alone is not enough to win at this table — a hand must also reach a minimum score, which Lesson 5 teaches. First, the next two lessons cover how tiles move during play.",
    },
  ]),
  hkSteps("turns", "Draws, discards and claims", [
    {
      text: "Before play, all 144 tiles are shuffled face-down and stacked in rows in the middle of the table. That stack is the wall: every tile in the game is drawn from the wall. To start a hand, each player takes thirteen tiles from the wall. One player is the dealer: the player in charge of this hand, who sits in the East seat, is dealt to first and takes the first turn. The deal moves around the table from hand to hand, as Lesson 10 teaches.",
    },
    {
      text: "Turns pass in seat order: East, then South, then West, then North, and back to East. On your turn you draw one tile from the wall, and then you discard one tile: you place it face-up in front of you, where everyone can see it. Your discards stay on the table for the rest of the hand. The hand pictured below is the kind of fourteen-tile hand you hold just after drawing, before you choose a discard.",
      hand: "234m567p345s888s55p",
    },
    {
      text: "Two words name how a hand is won. The player who threw a discard is its discarder. If you win on a tile you drew from the wall yourself, that is a self-draw win. If you win on another player's discard, that is a discard win, and that player is the discarder of your winning tile.",
    },
    {
      text: "A discard does not have to stay on the table. Before the next player draws, another player may claim the newest discard to complete a set, and show that set face-up. Claiming is how open sets are made.",
    },
    {
      text: "A sequence claim is the narrowest claim. Only the player whose turn comes immediately after the discarder may claim a discard for a sequence, and only if they already hold the other two numbers of that sequence in the same suit.",
    },
    {
      question: choice(
        "hk-chow-seat",
        "South discards a tile. Which player may claim it to complete a sequence?",
        ["East", "West", "North", "Any of the other players"],
        1,
        "Turn order runs East, South, West, North, so West is the player immediately after South. Only that next player may claim for a sequence.",
        "Follow the turn order around the table and find whose turn comes immediately after the discarder.",
      ),
    },
    {
      text: "A triplet or a quad may be claimed from any player's discard, not just by the next player. After claiming a sequence or a triplet, you discard without drawing. After claiming or declaring a quad, you first draw one extra tile from the end of the wall — Lesson 8 covers quads in full — and then discard.",
    },
    {
      text: "When two claims want the same discard, a win claim comes first: a player whose hand the tile completes beats every set claim. Between set claims, a triplet or quad beats a sequence. If two players can both win on one discard, the player nearest after the discarder in turn order wins it.",
    },
    {
      question: choice(
        "hk-priority",
        "On one discard, East can win and North can complete a triplet. Which claim is resolved first?",
        [
          "The triplet, because a set claim is made aloud first",
          "The win, because a completed hand outranks a set claim",
          "The triplet, because North sits before East",
          "Neither — the discard is returned to the wall",
        ],
        1,
        "A legal win outranks every set claim, so East's win is resolved before North's triplet claim.",
        "Compare the two claim kinds: one completes a whole winning hand, the other completes a single set.",
      ),
    },
    {
      text: "A hand can also end with no winner. The end section of the wall is kept back for replacement draws — the extra draws a player takes after showing a bonus tile or declaring a quad, taught in Lessons 4 and 8 — and when the rest of the wall has been drawn and nobody has won, the hand ends as a drawn hand — this is called an exhaustive draw. Nobody pays or receives any points for a drawn hand, the scores stay exactly as they were, and the deal passes to the next player in turn order.",
    },
    {
      question: choice(
        "hk-drawn-hand",
        "The drawable wall runs out and no one has won. What happens?",
        [
          "The players closest to winning are paid by the others",
          "Nobody pays or receives points, and the deal passes to the next player",
          "The dealer pays every other player",
          "The same dealer deals the hand again",
        ],
        1,
        "An exhaustive draw changes no scores at all. Because the dealer did not win, the deal passes on to the next player.",
        "Recall what a drawn hand does to the scores, and what happens to the deal when the dealer has not won.",
      ),
    },
    {
      text: "Turns, then, are simple: draw from the wall, discard face-up, and watch each new discard in case you can claim it or win on it. The next lesson returns to the bonus tiles from Lesson 1 and teaches what happens when one appears.",
    },
  ]),
  hkSteps("flowers", "Replacing and scoring flowers", [
    {
      text: "Bonus tiles — the plants and seasons from Lesson 1, also called flowers — can appear at any time: in your starting thirteen tiles, on a draw, or on a replacement draw. The moment you find one, place it face-up beside your hand, as the pictured hand's owner would. A bonus tile never takes a place inside your hand, and it is never one of your sets or your pair.",
      hand: HK_SEQ_HAND,
    },
    {
      text: "Straight after placing a bonus tile beside your hand, draw a replacement tile from the end of the wall — the opposite end from the one ordinary draws come from. If that replacement is itself a bonus tile, place it beside your hand too and draw again, until you hold an ordinary tile. Your hand keeps its proper size throughout.",
    },
    {
      text: "Each bonus number belongs to a seat, as Lesson 1 taught: 1 to East, 2 to South, 3 to West and 4 to North. The plant and the season carrying your seat's number are your own-seat bonus tiles. There are two of them for every seat: for West, plant 3 and season 3.",
    },
    {
      question: choice(
        "hk-own-flower",
        "You sit in the West seat. Which of these bonus tiles is one of your own-seat bonus tiles?",
        ["Plant 1", "Season 2", "Plant 3", "Season 4"],
        2,
        "West is seat 3, so the plant and the season numbered 3 belong to West. Plant 3 is one of them.",
        "Run through the seats in order — East, South, West, North — counting 1, 2, 3, 4, and match the number to both the plant and the season.",
      ),
    },
    {
      question: choice(
        "hk-flower-replace",
        "You draw a season tile during your turn. What do you do first?",
        [
          "Keep it in your hand and discard it on a later turn",
          "Place it face-up beside your hand and draw a replacement from the end of the wall",
          "Push it back into the middle of the wall",
          "Hand it to the player whose seat number it carries",
        ],
        1,
        "A bonus tile is exposed beside your hand as soon as it is found, and replaced from the end of the wall, so your hand keeps its size.",
        "Recall the two parts of the procedure: where the bonus tile goes, and where its replacement comes from.",
      ),
    },
    {
      text: "Your exposed bonus tiles stay beside your hand until the hand ends. Exposed means placed face-up beside your hand, where every player can see them. A bonus tile whose number belongs to another seat adds nothing to your score on its own. Collecting all four plants, or all four seasons, is worth more than the tiles would be separately, and holding all eight is worth the most of all. The exact score values are counted in the next lesson, where the scoring unit is defined.",
    },
    {
      question: choice(
        "hk-flower-other-seat",
        "You hold one bonus tile whose number belongs to another seat, and no other bonus tiles. On its own, how much does it add to your score?",
        ["Nothing", "One scoring point", "Two scoring points", "It ends the hand in your favour"],
        0,
        "Only your own-seat bonus tiles score on their own. A single bonus tile of another seat adds nothing by itself.",
        "Ask whose seat number the tile carries, and whether it completes a full group of four plants or four seasons.",
      ),
    },
    {
      text: "So the flower procedure — flower is the short name for a bonus tile — is: expose the bonus tile beside your hand, replace it from the end of the wall, and repeat if the replacement is another bonus tile. What those tiles are worth is part of scoring — and scoring starts in the next lesson.",
    },
  ]),
  hkSteps("minimum", "Shape, fan and eligibility", [
    {
      text: "This lesson joins shape to score. Look again at the pictured hand and read it aloud: 1-2-3 and 4-5-6 of characters, 1-2-3 of circles, and 7-8-9 of bamboo are four sequences, and the two East winds are the pair. The shape is complete. Whether it may win depends on its score.",
      hand: HK_SEQ_HAND,
    },
    {
      text: "The score of a winning hand is counted in fan. A fan is one scoring point. A pattern is a named feature of a hand, such as having all four sets as sequences. Each pattern a hand contains, and each circumstance of how it was won, earns a stated number of fan, and the fan are added together. A hand's fan total decides whether it is allowed to win at all, and — as Lesson 7 shows — how many points it is paid.",
    },
    {
      text: "Count the pictured hand's fan one item at a time. A hand whose four sets are all sequences earns one fan. A winner holding no bonus tiles at all earns one fan. Nothing else in this hand scores: a pair of East winds is only a pair, and pairs earn no wind fan. The total is two fan.",
    },
    {
      hand: HK_SEQ_HAND,
      question: choice(
        "hk-two-fan",
        "Can the displayed hand win on a discard, holding no bonus tiles?",
        [
          "Yes — a complete shape may always win",
          "No — it has only two fan, below the minimum of three",
          "Yes — the pair of East winds supplies the missing fan",
          "No — a hand of sequences can never win",
        ],
        1,
        "All sequences earns one fan and holding no bonus tiles earns one more, for two fan. This table requires at least three fan to win, so the hand must keep playing.",
        "Add up the fan counted in the previous step, item by item, and compare the total with the three-fan minimum.",
        () =>
          scoredAs(HK_SEQ_HAND, 27).eligible ? "invalid" : "No — it has only two fan, below the minimum of three",
      ),
    },
    {
      text: "Now win the same hand the other way. Winning on a tile you drew yourself — a self-draw win, from Lesson 3 — earns one extra fan. Two fan plus one for the self-draw makes three fan, exactly the minimum.",
    },
    {
      hand: HK_SEQ_HAND,
      question: choice(
        "hk-three-fan",
        "That same hand now wins by self-draw. What is its fan total, and may it win?",
        [
          "Two fan — it still may not win",
          "Three fan — it may win",
          "Four fan — it may win",
          "Three fan — but self-draw wins are not allowed",
        ],
        1,
        "The self-draw adds one fan to the two the hand already had, reaching three fan, which meets the minimum.",
        "Start from the total counted for the discard win, then add what winning on your own draw earns.",
        () => {
          const r = scoredAs(HK_SEQ_HAND, 27, { selfDraw: true });
          return r.units === 3 && r.eligible
            ? "Three fan — it may win"
            : "invalid";
        },
      ),
    },
    {
      text: "The minimum, stated plainly: a hand at this table needs at least three fan to win. A complete shape below three fan cannot be declared a win and must keep playing. Bonus tiles count toward the minimum, with these values: each of your own-seat bonus tiles earns one fan; holding all four plants earns two more fan, and all four seasons earns two more; holding all eight bonus tiles earns eight fan instead of the separate plant, season and group values; and holding none earns the one fan you have already seen.",
    },
    {
      hand: HK_SEQ_HAND,
      question: choice(
        "hk-flower-fan",
        "East holds all four plants alongside the pictured hand, and wins on a discard. How many fan does the hand score?",
        ["Two fan", "Three fan", "Four fan", "Six fan"],
        2,
        "All sequences earns one fan. The four plants earn two for the complete group plus one for East's own-seat plant among them: one plus two plus one is four fan. There is no no-bonus-tile fan, because bonus tiles are held.",
        "Count in parts: the hand's own fan first, then the plants — the complete-group value plus the own-seat plant inside the group.",
        () => {
          const r = scoredAs(HK_SEQ_HAND, 27, {
            flowers: [34, 35, 36, 37],
          });
          return r.units === 4 ? "Four fan" : "invalid";
        },
      ),
    },
    {
      text: "One skill remains before scoring patterns: knowing what your hand still needs. The pictured hand holds thirteen tiles: 1-2-3, 4-5-6 and 7-8-9 are three complete sequences — circles, circles and bamboo — the two red dragons are a pair, and the 3 and 4 of characters stand loose. This hand needs exactly one more tile to complete. A hand that needs exactly one tile is waiting, and each tile that completes it is one of its waits.",
      hand: "34m123p456p789s77z",
    },
    {
      hand: "34m123p456p789s77z",
      question: pick(
        "hk-waits-pick",
        "Tap every characters tile that is a wait for this hand.",
        "123456789m",
        [1, 4],
        "The 2 of characters makes 2-3-4 with the loose tiles, and the 5 of characters makes 3-4-5. Either tile completes the fourth set, so both are waits.",
        "Work with the two loose characters tiles: a wait must join them into a sequence so the hand becomes four sets and the pair it already has.",
      ),
    },
    {
      text: "Finding your waits is the skill every turn depends on: you can only win on a tile that is one of your waits, whether you draw it yourself or another player discards it. And a win needs both halves at once — a complete shape, found through your waits, and at least three fan. A hand that has both halves is eligible: eligible means allowed to be declared a win.",
    },
    {
      question: choice(
        "hk-eligibility",
        "A player completes four sets and a pair, and the hand counts two fan in total. What happens?",
        [
          "They win, because the shape is complete",
          "They cannot win yet — the hand is below the three-fan minimum, and play continues",
          "They win, but are paid nothing",
          "The hand is declared a drawn hand",
        ],
        1,
        "Shape and score are separate checks. Two fan is below the three-fan minimum, so the hand cannot be declared a win and its owner keeps playing.",
        "Check the two winning conditions separately: the shape is complete, so test the fan total against the minimum.",
      ),
    },
    {
      text: "Now try the same skills on a hand you have not seen before. The pictured hand holds thirteen tiles. Read its faces yourself and find what it still needs: nothing about this hand has been read aloud for you.",
      hand: "56m123p456p789s111z",
    },
    {
      hand: "56m123p456p789s111z",
      question: pick(
        "hk-transfer-waits",
        "Tap every characters tile that is a wait for this pictured hand.",
        "123456789m",
        [3, 6],
        "The 4 of characters makes 4-5-6 with the two loose characters tiles, and the 7 of characters makes 5-6-7. Either tile completes the fourth set alongside the three sequences and the triplet the hand already holds, so both are waits.",
        "Set aside the groups the hand has already completed, then work with its two loose characters tiles: a wait must join them into a sequence.",
      ),
    },
    {
      text: "One more new hand. Read the pictured faces yourself: count its fan for a win on another player's discard first, holding no bonus tiles, then judge what changes when the same hand is won on the player's own draw.",
      hand: "345s345s678p234m99p",
    },
    {
      hand: "345s345s678p234m99p",
      question: choice(
        "hk-transfer-selfdraw",
        "The pictured hand wins by self-draw, holding no bonus tiles. What is its fan total, and may it win?",
        [
          "Two fan — it still may not win",
          "Three fan — it may win",
          "Four fan — it may win",
          "Three fan — but a pair of 9s blocks the win",
        ],
        1,
        "The four sets are all sequences, worth one fan, and holding no bonus tiles earns one more. The self-draw adds one fan, making three — exactly the minimum, so the hand may win. On a discard it would have counted only two fan and could not have won.",
        "Count the hand's own fan first — what its sets earn, and what holding no bonus tiles earns — then add what winning on your own draw earns, and compare with the minimum.",
        () => {
          const discard = scoredAs("345s345s678p234m99p", 17);
          const drawn = scoredAs("345s345s678p234m99p", 17, {
            selfDraw: true,
          });
          return discard.units === 2 &&
            !discard.eligible &&
            drawn.units === 3 &&
            drawn.eligible
            ? "Three fan — it may win"
            : "invalid";
        },
      ),
    },
    {
      text: "You now hold the whole eligibility rule: complete shape, at least three fan, and a winning tile that is one of your waits. The next lesson teaches the wind and dragon patterns that supply fan, and Lesson 7 turns fan into payments.",
    },
  ]),
  hkSteps("honors", "Wind and dragon patterns", [
    {
      text: "Play is divided into rounds. A round is a run of hands that shares one named wind: the East round comes first, then the South round, then the West round, then the North round. The wind a round is named for is the round wind, and it stays the same for every hand in that round. Your own wind for a hand is your seat wind: the wind of the seat you hold for that hand, which changes as the deal moves around the table. The dealer always holds the East seat, so the dealer's seat wind is East.",
    },
    {
      text: "Picture the centre of the table for one concrete hand. The centre shows the East round, hand 1, so the round wind is East: East names the whole run of hands, and it stays East for every hand of that run. You sit in the South seat for this hand, so your seat wind is South: your seat wind names your own place at the table for this hand only, and it changes when the deal moves you to a new seat. The dealer sits in the East seat, so the dealer's seat wind is East — the same wind as the round wind for this hand. The pictured tiles are the four winds in seat order: East, South, West and North.",
      tiles: "1234z",
    },
    {
      text: "Wind fan is counted like this. A triplet or quad of your seat wind earns one fan. A triplet or quad of the round wind earns one fan. When the two are the same wind — an East triplet held by East during the East round — the triplet earns both, for two fan. A pair of a wind earns nothing. The pictured hand holds a triplet of East alongside three sequences and a pair of the 2 of characters.",
      hand: "111z123m456p789s22m",
    },
    {
      hand: "111z123m456p789s22m",
      question: choice(
        "hk-double-wind",
        "You are East in the East round and hold the pictured triplet of East. How many fan do its wind awards give it?",
        ["No fan", "One fan", "Two fan", "Three fan"],
        2,
        "The East triplet matches your seat wind for one fan and the round wind for another, so the two wind awards give two fan in total.",
        "Score the two wind awards one at a time: first the triplet against your seat wind, then against the round wind.",
        () => {
          const r = scoredAs("111z123m456p789s22m", 27);
          const windFan = r.patterns
            .filter((p) => p.id === "seat-wind" || p.id === "round-wind")
            .reduce((n, p) => n + p.units, 0);
          return windFan === 2 ? "Two fan" : "invalid";
        },
      ),
    },
    {
      text: "Dragon fan is simpler. Each triplet or quad of a dragon earns one fan. The three tiles below are a triplet of the white dragon, worth one fan; a triplet of green dragons or of red dragons earns the same.",
      tiles: "555z",
    },
    {
      text: "Two dragon patterns are worth more than their parts. Little Three Dragons is two dragon triplets plus a pair of the third dragon, and it earns five fan. The pictured hand shows it: triplets of the white and green dragons, a pair of red dragons, and two sequences. Its five fan replaces the two single dragon fan its triplets would otherwise earn — the same tiles are never counted twice.",
      hand: "555z666z123m456p77z",
    },
    {
      text: "Big Three Dragons is all three dragon triplets in one hand, and it earns eight fan, again replacing the single dragon awards. The pictured hand shows it: triplets of white, green and red dragons, one sequence, and a pair of the 4 of circles.",
      hand: "555z666z777z123m44p",
    },
    {
      question: choice(
        "hk-dragon-exclusion",
        "A hand has Big Three Dragons. How is its dragon fan counted?",
        [
          "Eight fan for the pattern, with no extra single dragon fan added",
          "Eight fan, plus one more for each dragon triplet",
          "Five fan, the same as Little Three Dragons",
          "One fan, for one dragon triplet only",
        ],
        0,
        "Big Three Dragons earns eight fan as one pattern. The single dragon awards it contains are replaced, not added, so the dragon fan stays at eight.",
        "Larger patterns replace the smaller awards they are built from, instead of stacking on top of them.",
        () => {
          const r = scoredAs("555z666z777z123m44p", 12);
          const big = r.patterns.find((p) => p.id === "big-three-dragons");
          const singles = r.patterns.filter((p) =>
            p.id.startsWith("dragon-"),
          );
          return big?.units === 8 && singles.length === 0
            ? "Eight fan for the pattern, with no extra single dragon fan added"
            : "invalid";
        },
      ),
    },
    {
      text: "One pair needs its value stated plainly, because it is easy to assume a pair of dragons must be worth something. Read the pictured hand aloud: 1-2-3, 4-5-6 and 7-8-9 are sequences of characters, circles and bamboo, 2-3-4 of bamboo is a fourth sequence, and the two red dragons are the pair. A pair of dragons earns no fan on its own. Dragon fan needs a triplet or a quad; a dragon pair earns fan only as part of Little Three Dragons, where it stands alongside two dragon triplets and the five fan belongs to that whole pattern, not to the pair.",
      hand: "123m456m789p234s77z",
    },
    {
      hand: "123m456m789p234s77z",
      question: choice(
        "hk-red-pair-value",
        "In the pictured hand, how much fan does the pair of red dragons earn on its own?",
        ["No fan", "One fan", "Two fan", "Five fan"],
        0,
        "The red dragon pair earns nothing on its own: a pair is never a triplet, and this hand holds no dragon triplet for it to stand beside. The hand's fan comes from its sequences and its circumstances, not from its pair. Five fan would need Little Three Dragons — two dragon triplets plus this pair.",
        "Ask what a dragon award is paid for: a triplet or a quad of dragons. Then check whether this hand's dragons form one.",
        () => {
          const r = scoredAs("123m456m789p234s77z", 33);
          const dragonFan = r.patterns.filter(
            (p) => p.id.startsWith("dragon-") || p.id.includes("dragons"),
          );
          return dragonFan.length === 0 && r.units === 2
            ? "No fan"
            : "invalid";
        },
      ),
    },
    {
      text: "The winds have two large patterns of their own. Little Four Winds is three wind triplets plus a pair of the fourth wind, worth ten fan. Big Four Winds is all four wind triplets, worth fifteen fan before the payment cap of Lesson 9. A hand in which every tile is an honor is All Honors, worth ten fan. The pictured hand is Big Four Winds with a pair of white dragons: four wind triplets and the pair, all honors. Because every tile in a Big Four Winds hand is an honor, such a hand is always All Honors as well — and the two patterns both count. They do not replace each other the way the dragon patterns do, so this hand earns fifteen fan for Big Four Winds and ten more for All Honors, twenty-five fan from those two patterns alone, before any other award is counted. Lesson 9's payment cap is what keeps that total from raising the payment past a ten-fan hand.",
      hand: "111z222z333z444z55z",
    },
    {
      question: choice(
        "hk-little-winds",
        "Three wind triplets plus a pair of the fourth wind form which pattern, and how many fan is it worth?",
        [
          "Big Four Winds — fifteen fan",
          "Little Four Winds — ten fan",
          "All Honors — ten fan",
          "A seat-wind triplet only — one fan",
        ],
        1,
        "Three wind triplets with the fourth wind as the pair is Little Four Winds, worth ten fan. Big Four Winds needs the fourth wind as a triplet too.",
        "Count the wind groups: how many are triplets, and what is the fourth wind doing in the hand?",
      ),
    },
    {
      hand: "111z222z333z444z55z",
      question: choice(
        "hk-winds-honors-overlap",
        "The pictured hand is Big Four Winds, and every tile in it is an honor. How are those two patterns counted?",
        [
          "Both count — fifteen fan for Big Four Winds plus ten for All Honors",
          "Only Big Four Winds counts — the larger pattern replaces the smaller",
          "Only All Honors counts — fifteen fan is the pattern's price, not an award",
          "Neither counts until the hand also holds a dragon triplet",
        ],
        0,
        "Both patterns count: Big Four Winds earns fifteen fan and All Honors earns ten more, twenty-five fan from the two patterns together. Unlike the dragon patterns, neither of these replaces the other. The hand earns further awards on top of that, and Lesson 9 caps what is actually paid at ten fan.",
        "Check whether either pattern's statement says it replaces the other, the way Big Three Dragons replaces the single dragon awards. If neither says that, both awards stand.",
        () => {
          const r = scoredAs("111z222z333z444z55z", 31);
          const big = r.patterns.find((p) => p.id === "big-four-winds");
          const honors = r.patterns.find((p) => p.id === "all-honors");
          return big?.units === 15 && honors?.units === 10
            ? "Both count — fifteen fan for Big Four Winds plus ten for All Honors"
            : "invalid";
        },
      ),
    },
    {
      text: "Two patterns are about suits rather than honors. A hand in which every tile belongs to one numbered suit, with no honors at all, is a Full Flush, worth seven fan. A hand in which every numbered tile belongs to one suit and the rest are honors is One Suit With Honors, worth three fan. The pictured hand is One Suit With Honors: sequences and a triplet all in circles, with a pair of East winds.",
      hand: "123p456p789p111p11z",
    },
    {
      text: "When you score a hand with honors, work in this order: name its sets first, then check each wind triplet against the seat wind and the round wind held during that hand, then the dragons. Winds are always judged by the hand being scored, never by a seat held in a later hand.",
    },
  ]),
  hkSteps("payments", "From fan to payer amounts", [
    {
      text: "This lesson scores one hand from its tiles to its payments. Here is the hand, read aloud: a triplet of the 2 of characters, a triplet of the 3 of circles, a triplet of the 4 of bamboo, a triplet of white dragons, and a pair of East winds. Four triplets and a pair.",
      hand: HK_WORKED_HAND,
    },
    {
      text: "Count its fan one item at a time, for a win on another player's discard. All four sets are triplets, and All Triplets earns three fan. The white dragon triplet earns one fan. The winner holds no bonus tiles, which earns one fan. Three plus one plus one makes five fan.",
    },
    {
      hand: HK_WORKED_HAND,
      question: choice(
        "hk-worked-fan",
        "How many fan does the worked hand score on a discard win?",
        ["Three fan", "Four fan", "Five fan", "Six fan"],
        2,
        "All Triplets gives three fan, the white dragon triplet one fan, and holding no bonus tiles one fan: five fan in total.",
        "Add the items from the counting step one at a time: the all-triplets award, the dragon triplet, and the award for holding no bonus tiles.",
        () =>
          scoredAs(HK_WORKED_HAND, 1).units === 5 ? "Five fan" : "invalid",
      ),
    },
    {
      text: "Fan are turned into points with a fixed scale. The scale gives base points for each fan total: three fan is 8 base points, four is 16, five is 24, six is 32, seven is 48, eight is 64, nine is 96, and ten fan — the most that is ever paid on, as Lesson 9 explains — is 128. Below the minimum the scale would give two fan 4 base points and one fan 2, but hands below three fan cannot win, so payments in practice start at three fan.",
    },
    {
      text: "The base points are then shared out as payments. On a discard win, the discarder pays twice the base points, and each of the other two opponents pays the base points once. So at three fan, with a base of 8, the discarder pays 16 and the others pay 8 each, and the winner receives 32 in total.",
    },
    {
      question: choice(
        "hk-discard-payment",
        "At three fan, how many points does the discarder pay?",
        ["8", "16", "24", "32"],
        1,
        "Three fan converts to a base of 8 points, and the discarder pays twice the base: 16. The 32 in the lesson is what the winner receives from all three opponents together.",
        "Convert three fan to base points using the scale first; the discarder's share is double that base.",
        () =>
          String(
            hongKongPayments(3, { winner: 0, payer: 1, selfDraw: false }).find(
              (p) => p.seat === 1,
            )!.amount,
          ),
      ),
    },
    {
      text: "Apply the same split to the worked hand. Five fan gives a base of 24 points. On a discard win the discarder pays twice 24, which is 48; each other opponent pays 24; and the winner receives 48 plus 24 plus 24, which is 96 points.",
    },
    {
      question: choice(
        "hk-worked-payment",
        "The worked hand wins on a discard at five fan. How many points does the discarder pay?",
        ["24", "48", "72", "96"],
        1,
        "Five fan converts to a base of 24, and the discarder pays twice the base: 48. The winner's total of 96 is all three payments added together.",
        "Convert the hand's five fan to base points with the scale, then double the base for the discarder's share.",
        () =>
          String(
            hongKongPayments(5, { winner: 0, payer: 1, selfDraw: false }).find(
              (p) => p.seat === 1,
            )!.amount,
          ),
      ),
    },
    {
      text: "A self-draw win is split differently: there is no discarder, so every opponent pays twice the base points. Watch what that does to the worked hand. Won by self-draw, the hand gains the one self-draw fan from Lesson 5, so it scores six fan, not five. Six fan gives a base of 32, every opponent pays twice 32, which is 64, and the winner receives 192 in total.",
    },
    {
      question: choice(
        "hk-worked-selfdraw",
        "The worked hand wins by self-draw. How many points does each opponent pay?",
        ["48", "64", "96", "192"],
        1,
        "The self-draw fan raises the hand to six fan, a base of 32, and on a self-draw every opponent pays twice the base: 64 each. The 192 is the winner's combined total.",
        "Do this in order: add the self-draw fan to the hand's total, convert with the scale, then double the base, because a self-draw charges every opponent the doubled amount.",
        () => {
          const units = scoredAs(HK_WORKED_HAND, 1, { selfDraw: true }).units;
          const perOpponent = hongKongPayments(units, {
            winner: 0,
            payer: 1,
            selfDraw: true,
          })[0]!.amount;
          return String(perOpponent);
        },
      ),
    },
    {
      question: choice(
        "hk-nine-fan",
        "How many base points does a nine-fan hand convert to?",
        ["48", "64", "96", "128"],
        2,
        "The scale runs 48 at seven fan, 64 at eight and 96 at nine. On a discard win a nine-fan hand's ordinary opponents each pay the base once, which is 96.",
        "Read the scale in order from three fan upward and stop at nine.",
        () =>
          String(
            hongKongPayments(9, { winner: 0, payer: 1, selfDraw: false }).find(
              (p) => p.seat === 2,
            )!.amount,
          ),
      ),
    },
    {
      text: "Now score two new hands end to end, from their faces to their payments. Nothing about them is read aloud: read the faces yourself, name the sets, count the fan, then use the scale and the split. The first pictured hand wins on another player's discard, and its holder holds no bonus tiles.",
      hand: "888m999p111s222s55z",
    },
    {
      hand: "888m999p111s222s55z",
      question: choice(
        "hk-transfer-triplets-fan",
        "How many fan does the first pictured hand score on its discard win?",
        ["Three fan", "Four fan", "Five fan", "Six fan"],
        1,
        "All four sets are triplets, worth three fan, and holding no bonus tiles earns one more: four fan. The pair of white dragons earns nothing on its own — a dragon pair is not a dragon triplet.",
        "Work through the hand group by group: what the four sets earn together, what the pair earns on its own, and what holding no bonus tiles earns.",
        () =>
          scoredAs("888m999p111s222s55z", 31).units === 4
            ? "Four fan"
            : "invalid",
      ),
    },
    {
      hand: "888m999p111s222s55z",
      question: choice(
        "hk-transfer-triplets-pay",
        "That hand wins on a discard at the fan total you just counted. How many points does the discarder pay?",
        ["16", "32", "48", "64"],
        1,
        "Four fan converts to a base of 16 points, and the discarder pays twice the base: 32. Each other opponent pays 16, so the winner receives 64 in total.",
        "Convert the fan total you counted to base points with the scale, then double the base for the discarder's share.",
        () => {
          const units = scoredAs("888m999p111s222s55z", 31).units;
          const amount = hongKongPayments(units, {
            winner: 0,
            payer: 1,
            selfDraw: false,
          }).find((p) => p.seat === 1)!.amount;
          return units === 4 && amount === 32 ? "32" : "invalid";
        },
      ),
    },
    {
      text: "The second pictured hand also wins on another player's discard, and its holder also holds no bonus tiles. Read its faces yourself and score it the same way.",
      hand: "666z777z55z234m789p",
    },
    {
      hand: "666z777z55z234m789p",
      question: choice(
        "hk-transfer-dragons-fan",
        "How many fan does the second pictured hand score on its discard win?",
        ["Four fan", "Five fan", "Six fan", "Eight fan"],
        2,
        "Two dragon triplets plus a pair of the third dragon make Little Three Dragons, worth five fan, and holding no bonus tiles earns one more: six fan. The five fan replaces the two single dragon awards, so they are not added again.",
        "Name the dragon groups first — two triplets and a pair of the third dragon form one named pattern — then add what holding no bonus tiles earns.",
        () =>
          scoredAs("666z777z55z234m789p", 31).units === 6
            ? "Six fan"
            : "invalid",
      ),
    },
    {
      hand: "666z777z55z234m789p",
      question: choice(
        "hk-transfer-dragons-pay",
        "That hand wins on a discard at the fan total you just counted. How many points does the winner receive in total?",
        ["64", "96", "128", "192"],
        2,
        "Six fan converts to a base of 32 points. On a discard win the discarder pays twice the base, 64, and each other opponent pays the base once, 32: 64 plus 32 plus 32 is 128 in total.",
        "Convert the fan total to base points, then add the three payments together: the discarder's doubled share and one base from each other opponent.",
        () => {
          const units = scoredAs("666z777z55z234m789p", 31).units;
          const total = hongKongPayments(units, {
            winner: 0,
            payer: 1,
            selfDraw: false,
          }).reduce((n, p) => n + p.amount, 0);
          return units === 6 && total === 128 ? "128" : "invalid";
        },
      ),
    },
    {
      text: "Two closing facts about payments. There is no dealer bonus at this table: East pays and receives on exactly the same basis as every other seat. And payments only move points between players — the winner's gain is the other players' loss, point for point. Points are the score of the game; whether a group also plays for money is a separate agreement, and nothing in these lessons assumes one.",
    },
    {
      text: "The worked hand is now scored end to end: tiles read aloud, sets named, fan counted item by item to five, base points read from the scale, and payments split two ways — 48 from the discarder and 24 from each other opponent on a discard win, or 64 from every opponent on a self-draw win at six fan. Every scored hand in this game follows those same steps.",
    },
  ]),
  hkSteps("quads", "Quads and replacement wins", [
    {
      text: "Lesson 2 introduced the quad: four identical tiles declared together as one set, like the four 1 of characters below. This lesson teaches how quads are declared and what they set in motion. A quad is always declared on your own turn, and the set is shown to the table.",
      tiles: "1111m",
    },
    {
      text: "There are three ways to declare a quad. A concealed quad is made from four matching tiles already in your hand. An open quad is made by claiming another player's discard as the fourth tile of a triplet you hold. An added quad is made when you already show a triplet and you draw its fourth tile yourself: you add that tile to the shown triplet.",
    },
    {
      question: choice(
        "hk-quad-forms",
        "You already show a triplet, and you draw its fourth matching tile yourself. If you add it to the shown triplet, what have you formed?",
        [
          "A concealed quad",
          "An open quad",
          "An added quad",
          "A second triplet",
        ],
        2,
        "Adding a self-drawn fourth tile to a triplet you already show forms an added quad. A concealed quad starts from four tiles in hand, and an open quad claims a discard.",
        "Match the story to the three forms: where did the fourth tile come from, and was the triplet already showing?",
      ),
    },
    {
      text: "Every quad declaration is followed by a replacement draw: you draw one tile from the end of the wall before you discard. The replacement keeps your hand at its proper size, because the quad holds four physical tiles in a single set. A flower replacement from Lesson 4 — a replacement after a bonus tile, which is what flower means on this table — is a different event: it follows a bonus tile, not a quad.",
    },
    {
      text: "If the replacement tile drawn after a quad completes your hand, you win on that tile, and the circumstance earns one extra fan: the quad-replacement fan is worth one fan. It counts toward the three-fan minimum like any other fan. Winning on a flower replacement — a win on the tile drawn after showing a bonus tile — earns no such fan: the award belongs to quad replacements only.",
    },
    {
      question: choice(
        "hk-replacement-value",
        "A player wins on the replacement tile drawn after declaring a quad. How much extra fan does that circumstance earn?",
        ["No extra fan", "One fan", "Two fan", "Three fan"],
        1,
        "A win on a quad replacement tile earns one extra fan. A win on a flower replacement earns none.",
        "Recall which replacement carries the award — the one that follows a quad — and the value stated for it.",
        () => {
          const r = scoreHongKong({
            counts: parseCounts("1111s123m456p789s11z"),
            melds: [{ kind: "ankan", tiles: [18, 18, 18, 18] }],
            winningTile: 27,
            selfDraw: true,
            seatWind: 27,
            roundWind: 27,
            flowers: [],
            replacement: true,
            robbingQuad: false,
            lastWall: false,
            initial: false,
            lastCopy: false,
          });
          const units =
            r.patterns.find((p) => p.id === "replacement")?.units ?? 0;
          return units === 1 ? "One fan" : "invalid";
        },
      ),
    },
    {
      text: "An added quad has one risk the other forms do not. In the moment before the fourth tile joins the shown triplet, another player whose hand that tile completes may claim it to win. That is robbing the quad, and winning by robbing an added quad earns one fan for that circumstance. If the rob succeeds, the fourth tile goes to the winner and the original set stays a triplet. A concealed quad cannot be robbed, and an open quad's fourth tile is a discard, where the ordinary win priority of Lesson 3 already applies.",
    },
    {
      question: choice(
        "hk-robbing",
        "Which quad can be robbed at this table?",
        [
          "A concealed quad",
          "An open quad",
          "An added quad",
          "Every quad",
        ],
        2,
        "Only an added quad offers a tile to rob: its fourth tile is claimed for a win in the moment before it joins the shown triplet.",
        "Robbing needs a fourth tile that is on its way into a set but not yet part of it. Which form has that moment?",
      ),
    },
    {
      question: pick(
        "hk-find-quad",
        "Tap the four tiles that form a quad in this row.",
        "2m2m2m2m5p9s",
        [0, 1, 2, 3],
        "The four 2 of characters tiles are identical faces, so they form the quad. The circles and bamboo tiles appear once each.",
        "A quad is four copies of one face. Find the face that appears four times.",
      ),
    },
    {
      text: "The extreme case is a hand of four quads and a pair, pictured below: the 1 of characters, the 1 of circles, the 1 of bamboo and East, each four times, with a pair of South. That is eighteen physical tiles forming four sets and a pair. It is a rare named pattern, Four Quads, worth eighteen fan before the cap, and like every hand it is paid under the ten-fan cap of the next lesson.",
      hand: "1111m1111p1111s1111z22z",
    },
    {
      text: "Declaring a quad is always a choice, never a duty. A quad shows the table four tiles it can count, and it spends replacement tiles from the end of the wall. Declare one when its set and its replacement draw help your hand — the declaration itself scores nothing until a hand is won.",
    },
  ]),
  hkSteps("specials", "Special hands and the cap", [
    {
      text: "Two winning shapes at this table are not four sets and a pair. The first is Thirteen Orphans, pictured below. It holds one of every terminal and every honor — the 1 and 9 of each suit, all four winds and all three dragons, thirteen kinds in all — plus one extra tile matching any of those kinds. The pictured hand's extra tile is a second 1 of characters. It is built entirely from tiles you hold, with no shown sets.",
      hand: "19m19p19s1234567z1m",
    },
    {
      question: choice(
        "hk-orphans-shape",
        "How many different tile kinds does Thirteen Orphans require, before its one duplicate?",
        ["Eleven kinds", "Twelve kinds", "Thirteen kinds", "Fourteen kinds"],
        2,
        "Six terminal kinds — the 1 and 9 of three suits — plus four winds and three dragons make thirteen kinds, and one of them is then duplicated.",
        "Count the required kinds in groups: terminals first, then winds, then dragons.",
        () =>
          scoredAs("19m19p19s1234567z1m", 0).units === 13
            ? "Thirteen kinds"
            : "invalid",
      ),
    },
    {
      text: "The second special shape is Nine Gates, pictured below, and it uses one numbered suit only: three 1s, one each of 2, 3, 4, 5, 6, 7 and 8, three 9s, and one more tile of that suit — here, an extra 2 of characters. Nine Gates is worth fifteen fan as a pattern. Thirteen Orphans is worth thirteen fan.",
      hand: "1112345678999m2m",
    },
    {
      text: "Neither of those totals is paid in full, because payments are capped at ten fan. The cap works like this: whatever a hand counts above ten fan, it is converted to payments as a ten-fan hand, at the top of the scale — a base of 128 points. A thirteen-fan hand and a fifteen-fan hand are paid exactly like a ten-fan hand.",
    },
    {
      question: choice(
        "hk-cap",
        "A hand counts fifteen fan. How many fan are used when it is converted to payments?",
        ["Fifteen fan", "Thirteen fan", "Ten fan", "Nine fan"],
        2,
        "The payment cap is ten fan, so a fifteen-fan hand is converted as a ten-fan hand, at a base of 128 points.",
        "Recall the cap: counted fan above the cap does not raise the payment any further.",
        () => {
          const at15 = hongKongPayments(15, {
            winner: 0,
            payer: 1,
            selfDraw: false,
          });
          const at10 = hongKongPayments(10, {
            winner: 0,
            payer: 1,
            selfDraw: false,
          });
          return JSON.stringify(at15) === JSON.stringify(at10)
            ? "Ten fan"
            : "invalid";
        },
      ),
    },
    {
      text: "Two more patterns reward winning at the very start of a hand. If the dealer wins with the hand as dealt, completed by the first uninterrupted draw, that is a Heavenly Hand. If another player wins on their own first uninterrupted draw, that is an Earthly Hand. Each is scored as a ten-fan hand in its own right: the pattern's ten fan is the hand's score, with no ordinary pattern fan added on top. One more circumstance earns fan: winning on the very last tile that can be drawn from the live wall — the part of the wall still left to draw from — is a Last Wall Tile win when you draw it yourself, and winning on the discard that follows it is a Final Discard win. Each earns one fan.",
    },
    {
      question: choice(
        "hk-heavenly",
        "The dealer wins on the very first draw of the hand, with nothing interrupting the start. What is this called, and how is it scored?",
        [
          "Earthly Hand — scored at three fan",
          "Heavenly Hand — scored as a ten-fan hand",
          "Nine Gates — scored at fifteen fan",
          "A drawn hand — nobody scores",
        ],
        1,
        "A dealer's uninterrupted first-draw win is a Heavenly Hand, and it is scored as a ten-fan hand in its own right. Earthly Hand is the same start for a player who is not the dealer.",
        "Two facts decide this: who won — the dealer or another player — and what the pattern is scored as on its own.",
        () => {
          const r = scoredAs(HK_SEQ_HAND, 27, {
            selfDraw: true,
            initial: true,
          });
          return r.units === 10
            ? "Heavenly Hand — scored as a ten-fan hand"
            : "invalid";
        },
      ),
    },
    {
      text: "Now apply the cap to new hands you have not seen scored before. Read the pictured faces yourself: the first hand wins on another player's discard, and its holder holds no bonus tiles. Name its shape, count its fan, apply the cap, and work out who pays what.",
      hand: "19m19p19s1234567z7z",
    },
    {
      hand: "19m19p19s1234567z7z",
      question: choice(
        "hk-transfer-orphans-cap",
        "How many fan does the pictured hand count, and how many fan are used when it is converted to payments?",
        [
          "It counts thirteen fan and is paid as thirteen fan",
          "It counts thirteen fan and is paid as ten fan",
          "It counts ten fan and is paid as ten fan",
          "It counts fifteen fan and is paid as ten fan",
        ],
        1,
        "The hand holds one of every terminal and every honor, with the red dragon duplicated: Thirteen Orphans, counting thirteen fan. Payments are capped at ten fan, so it is converted as a ten-fan hand.",
        "First name the shape from its faces — one of every terminal and honor, plus one duplicate — and recall its value. Then apply the payment cap to that counted total.",
        () => {
          const r = scoredAs("19m19p19s1234567z7z", 33);
          const atCounted = hongKongPayments(13, {
            winner: 0,
            payer: 1,
            selfDraw: false,
          });
          const atCap = hongKongPayments(10, {
            winner: 0,
            payer: 1,
            selfDraw: false,
          });
          return r.units === 13 &&
            JSON.stringify(atCounted) === JSON.stringify(atCap)
            ? "It counts thirteen fan and is paid as ten fan"
            : "invalid";
        },
      ),
    },
    {
      hand: "19m19p19s1234567z7z",
      question: choice(
        "hk-transfer-orphans-pay",
        "That hand wins on a discard. What does the discarder pay, what does each other opponent pay, and what does the winner receive in total?",
        [
          "Discarder 256, each other opponent 128, winner 512 in total",
          "Discarder 256, each other opponent 128, winner 384 in total",
          "Discarder 128, each other opponent 128, winner 384 in total",
          "Discarder 512, each other opponent 256, winner 1,024 in total",
        ],
        0,
        "Paid as a ten-fan hand, its base is 128 points. On a discard win the discarder pays twice the base, 256, each other opponent pays the base once, 128, and the winner receives 256 plus 128 plus 128: 512 in total.",
        "Start from the capped conversion — a base of 128 — then split it the discard way: double for the discarder, single for each other opponent, and add the three payments for the winner's total.",
        () => {
          const payments = hongKongPayments(13, {
            winner: 0,
            payer: 1,
            selfDraw: false,
          });
          const discarder = payments.find((p) => p.seat === 1)!.amount;
          const other = payments.find((p) => p.seat === 2)!.amount;
          const total = payments.reduce((n, p) => n + p.amount, 0);
          return discarder === 256 && other === 128 && total === 512
            ? "Discarder 256, each other opponent 128, winner 512 in total"
            : "invalid";
        },
      ),
    },
    {
      text: "The second pictured hand uses one numbered suit only, and also wins on a discard with no bonus tiles held. Read its faces yourself, count its total fan — the pattern's value plus anything else it earns — and judge what the cap does to it.",
      hand: "1112345678999s7s",
    },
    {
      hand: "1112345678999s7s",
      question: choice(
        "hk-transfer-gates-cap",
        "How many fan does the second pictured hand count in total, and how is it paid?",
        [
          "Fifteen fan counted, paid as fifteen fan",
          "Sixteen fan counted, paid as ten fan",
          "Ten fan counted, paid as ten fan",
          "Seven fan counted, paid as seven fan",
        ],
        1,
        "The hand is Nine Gates in bamboo — three 1s, one each of 2 to 8, three 9s and one more bamboo tile — worth fifteen fan as a pattern. Holding no bonus tiles earns one more, so it counts sixteen fan in total, and the cap pays it as a ten-fan hand.",
        "Name the shape from its faces and take its pattern value first. Then check whether the hand earns anything else on top — what does holding no bonus tiles earn? — and apply the cap to the full total.",
        () => {
          const r = scoredAs("1112345678999s7s", 24);
          const gates = r.patterns.find((p) => p.id === "nine-gates");
          return r.units === 16 && gates?.units === 15
            ? "Sixteen fan counted, paid as ten fan"
            : "invalid";
        },
      ),
    },
    {
      text: "One shape you may know from other games is not a winning shape at this table: seven pairs. Four sets and a pair, Thirteen Orphans and Nine Gates are the winning shapes here, and a hand of seven pairs must be played on toward one of them.",
    },
    {
      text: "Special hands, then: Thirteen Orphans at thirteen fan, Nine Gates at fifteen, the two first-draw hands at ten — and every one of them paid at the ten-fan cap. The final lesson puts the whole game together: how hands follow one another inside a match.",
    },
  ]),
  hkSteps("match", "How a match runs", [
    {
      text: "A match is a series of hands, grouped into the rounds you met in Lesson 6. A full match runs four rounds in order: the East round, the South round, the West round and the North round. The wind tiles below stand for those four rounds, in the order they are played.",
      tiles: "1234z",
    },
    {
      text: "Inside a round, the deal moves around the table. The dealer holds the East seat for that hand. When a hand ends, the deal passes to the next player in turn order — unless the dealer won the hand, in which case the same dealer deals again and the hand is a repeat. A drawn hand does not repeat the deal: as Lesson 3 taught, the deal passes on.",
    },
    {
      question: choice(
        "hk-repeat",
        "East deals a hand and wins it. Who deals the next hand?",
        [
          "South, because the deal always moves on",
          "East again, because the dealer repeats after a win",
          "West, the player before East in turn order",
          "The player with the lowest score",
        ],
        1,
        "A dealer's win keeps the deal with the same player, so East deals again. The deal passes on only when the dealer does not win.",
        "Recall the one result that holds the deal in place instead of passing it to the next player.",
      ),
    },
    {
      text: "Every player starts a match with 1,000 points. Hand payments move points from the losing players to the winner, so the four scores always add up to 4,000, at the start and after every hand. A score may fall below zero; at this table the match still continues to its end.",
    },
    {
      question: choice(
        "hk-total-points",
        "During a match the four scores are 1,240, 960, 880 and one score you cannot see. What must all four scores add up to?",
        ["3,000", "4,000", "4,240", "The total changes as points are won and lost"],
        1,
        "Payments only transfer points between the four players, so the total never changes: four starting scores of 1,000 make 4,000 throughout the match.",
        "Ask whether a payment ever creates or destroys points, or only moves them between players.",
      ),
    },
    {
      text: "When the last round ends, the match is over. The final standings rank the four players by their scores, and each player's result for the match is the change from their starting 1,000 points. A shorter match — only the East round, or East and South — uses exactly the same hand rules and simply stops after fewer rounds.",
    },
    {
      question: choice(
        "hk-match-length",
        "A full match at this table covers which rounds, in order?",
        [
          "The East round only",
          "East, then South",
          "East, South, West, then North",
          "North, West, South, then East",
        ],
        2,
        "A full match runs all four rounds in turn order: East, South, West and North. Shorter matches stop after the East round, or after East and South.",
        "A full match covers every round, in the same order the turns and seats run.",
      ),
    },
    {
      text: "That completes the game. Tiles are stacked into a wall; thirteen tiles are dealt; players draw, discard and claim in turn; bonus tiles are exposed and replaced from the end of the wall; a hand is won with four sets and a pair — or a special shape — at three fan or more, found through its waits; fan are counted item by item and converted through the scale into payments; the dealer repeats after a win and passes the deal on otherwise; and the rounds advance East, South, West and North until the match ends. You have every rule this table plays by.",
    },
  ]),
  ...MCR_LESSONS,
  ...TAIWANESE_LESSONS,
  // American training (brief-american-training-v1): registered here
  // so the shared lesson runner and the progress parser
  // (variant-progress.ts validates every entry against this list)
  // handle the track like any other. Registration is not a game:
  // the track has no VARIANT_RELEASES entry (no Learn section of its
  // own — the American section is separate), no engine adapter, and
  // no Play surface. Its lessons carry variant "american" through
  // the one cast in american-lessons.ts; the VariantId union stays
  // the three playable variants.
  ...AMERICAN_LESSONS,
];

export function variantLessons(variant: VariantId): VariantLesson[] {
  return VARIANT_LESSONS.filter((l) => l.variant === variant);
}
/** Validates one question against its own oracle: a choice question's
 * key must match verify(); a tile-pick's picks must be in-range,
 * unique, and match verify(). Every question needs a hint that can be
 * shown while the question is still open. */
export function validateVariantQuestion(q: VariantQuestion): void {
  if (!q.hint.trim() || !q.explanation.trim())
    throw new Error(`Invalid exercise ${q.id}`);
  if (q.kind === "choice") {
    if (q.choices[q.answer] !== q.verify())
      throw new Error(`Invalid exercise ${q.id}`);
  } else {
    const rowLength = parseCounts(q.tiles).reduce((a, b) => a + b, 0);
    if (
      q.picks.length === 0 ||
      new Set(q.picks).size !== q.picks.length ||
      q.picks.some((p) => !Number.isInteger(p) || p < 0 || p >= rowLength) ||
      q.verify() !== q.picks.join(",")
    )
      throw new Error(`Invalid exercise ${q.id}`);
  }
}
export function validateVariantContent(): void {
  validateMcrGuide();
  const ids = new Set<string>();
  for (const l of VARIANT_LESSONS) {
    if (ids.has(l.id) || l.version !== 2)
      throw new Error("Invalid lesson identity");
    ids.add(l.id);
    for (const q of variantLessonQuestions(l)) {
      if (ids.has(q.id)) throw new Error(`Invalid exercise ${q.id}`);
      validateVariantQuestion(q);
      ids.add(q.id);
    }
  }
}
