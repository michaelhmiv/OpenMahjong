/**
 * American mahjong training lessons, format v2 (brief-american-training-v1).
 *
 * TRAINING ONLY: this track teaches the American game — its set, its
 * card, the Charleston, exposures and jokers — around the original
 * Open Mahjong Practice Card. There is no American game mode; the
 * lessons stand alone and never assume another variant's vocabulary
 * or rules. Every term is defined in plain words at first use in
 * this track, in this order: tile, face and suit with the three
 * suits (lesson 1); winds, dragons, flowers, jokers, kinds and
 * copies (lesson 1); the card, groups — single, pair, pung, kong,
 * quint — exposure and concealed (lesson 2); sections and the value
 * ladder (lesson 3); rack, wall, dealer and breaking the wall
 * (lesson 4); the Charleston, blind pass and courtesy pass
 * (lesson 5); backup and tiles to go (lesson 6); calling and dead
 * discards (lesson 7); joker exchange, dead hand and joker bait
 * (lesson 8); defense, with joker bait weighed at the table
 * (lesson 9); mahjong, the jokerless bonus, self-pick and the
 * wall game (lesson 10).
 *
 * The Practice Card's hands are quoted as printed card lines (the
 * skill being taught is reading them); engine tile-code notation is
 * never used in teaching text. Pictured tile rows are written in
 * ascending tile order, so the row a learner sees is the row the
 * text reads aloud, left to right — one deliberate exception: the
 * Crak reading drill in lesson 1, whose row is shuffled because
 * reading faces, not positions, is the skill being drilled. In
 * pictured rows the suits are:
 * the character suit is Craks, circles are Dots, bamboo is Bams;
 * honors run East, South, West, North, then the white, green and
 * red dragons. Flowers and jokers have no pictured face in this
 * app, so they are taught in words and in quoted card lines.
 *
 * Scoring and counting checks verify against the Practice Card data
 * (practice-card.ts) or the payment rules the scoring lesson states.
 * Hardening (Nov 18, 2026, after the acceptance panel): the Crak key
 * and a shuffled Crak reading drill in lesson 1; card colours named
 * in words and two lines shown with their printed descriptions in
 * lesson 2; the Charleston pass rule stated as teaching in lesson 5
 * (before any drill grades by it); choosing between two hands in one
 * section worked and drilled in lesson 6; the double-quint hand's
 * line printed with its value in lesson 8, before lesson 11 asks it.
 * Hardening round 2 (Nov 18, 2026, after the re-panel): Consecutive
 * Runs lines printed with their descriptions in lessons 2 and 3, and
 * a worked runs comparison with a transfer drill in lesson 6; the
 * pass rule's qualifier made part of the rule as first taught in
 * lesson 5, and every restatement swept to match; lesson 11's
 * West-wind check reframed so its premise matches the tile law —
 * a single is a complete group of one.
 * Registration: this track is registered in VARIANT_LESSONS
 * (variant-content.ts), so the shared runner and progress parser
 * handle it like any other track, and the Learn section's mounter
 * (american-lesson-ui.ts) runs it. The VariantId union deliberately
 * does not gain "american" — the union names playable variants and
 * this track has no game and no engine adapter — so the lesson
 * factory carries the one cast, and the mounter supplies the tile
 * inventory (AMERICAN_TILE_INVENTORY in education/american.ts).
 */
import type { VariantId } from "@openmahjong/engine";
import type {
  VariantLesson,
  VariantQuestion,
  VariantStep,
} from "./variant-content.js";
import {
  practiceCardHand,
  practiceCardTiles,
  type PracticeCardHand,
} from "./practice-card.js";

const PROFILE_ID = "openmahjong-american-practice-card";
const lesson = (
  id: string,
  title: string,
  steps: VariantStep[],
): VariantLesson => ({
  id: `am-${id}`,
  // Seam (see header): "american" is lesson content only — the
  // VariantId union names the playable variants and this track has
  // no engine adapter — so the tag is cast, here and in the
  // mounter. Content is format-v2 identical to the other tracks.
  variant: "american" as VariantId,
  profileId: PROFILE_ID,
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
  extra: { tiles?: string; verify?: () => string } = {},
): VariantQuestion => ({
  kind: "choice",
  id: `am-${id}`,
  prompt,
  choices,
  answer,
  explanation,
  hint,
  ...(extra.tiles ? { tiles: extra.tiles } : {}),
  verify: extra.verify ?? (() => choices[answer]!),
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
  id: `am-${id}`,
  prompt,
  tiles,
  picks,
  explanation,
  hint,
  verify: () => picks.join(","),
});
/** Verify a numeric choice against a value computed from the card
 * data or the stated rules, so the key can never drift from them. */
const counted =
  (compute: () => number) =>
  (): string =>
    String(compute());
const cardTiles = (hand: PracticeCardHand): number => practiceCardTiles(hand);

export const AMERICAN_LESSONS: VariantLesson[] = [
  lesson("set", "Meet the American set", [
    {
      text: "Mahjong is a game for four players, played with tiles. A tile is a small block: its printed side is its face, and its plain side is its back. The American game is played with 152 tiles — more than any other mahjong game uses, because this set carries two extra tiles the others do not have, which you will meet at the end of this lesson. The faces below are a first taste: three numbered tiles and two picture tiles.",
      tiles: "5m5p5s1z7z",
    },
    {
      text: "Most tiles belong to a suit. A suit is a family of numbered tiles, numbered 1 to 9, that belong together. This game has three suits. The first is Bams: each Bam face shows green bamboo sticks, and the number of sticks is the tile's number. Count the sticks to read the tile. One exception: the 1 of Bams, first in this row, is a picture of a bird instead of a single stick.",
      tiles: "123456789s",
    },
    {
      text: "The second suit is Craks. A Crak face has two characters on it: the dark character on top is the tile's number, written as a character, and the red character below it is the same on every Crak. Read a Crak by its top character: this row runs 1 to 9. You do not need to know the characters by heart — the next step gives you the key, and a drill right after it has you read faces one at a time.",
      tiles: "123456789m",
    },
    {
      text: "Here is the key to the Craks. The top character on each face is the tile's number, written as a character: 一 is 1, 二 is 2, 三 is 3, 四 is 4, 五 is 5, 六 is 6, 七 is 7, 八 is 8, 九 is 9. Read the row below with the key, left to right: one, two, three, four, five, six, seven, eight, nine. The red character underneath is the same on every Crak — it is the suit's own mark, and never part of the number. From here on, a Crak is read by its top character alone.",
      tiles: "123456789m",
    },
    {
      question: pick(
        "crak-seven",
        "Tap the 7 of Craks.",
        "294716m",
        [3],
        "The fourth tile is the 7 of Craks — its top character is 七, the character for seven. The row is deliberately out of order: tiles are never dealt sorted, and the key, not the position, is what reads the face.",
        "Read each face's top character with the key: 一 is 1, 二 is 2, 三 is 3, 四 is 4, 五 is 5, 六 is 6, 七 is 7, 八 is 8, 九 is 9. You want the face whose top character is 七.",
      ),
    },
    {
      text: "The third suit is Dots. A Dot face shows its number as a pattern of circles: count the circles and you have the number. This row runs 1 to 9, from one large circle to nine.",
      tiles: "123456789p",
    },
    {
      question: pick(
        "bam-seven",
        "Tap the 7 of Bams.",
        "123456789s",
        [6],
        "The seventh tile in the row is the 7 of Bams: count its green sticks — seven. Every Bam in this row is read the same way, by counting.",
        "Count the green sticks on each face. The tile you want has seven of them.",
      ),
    },
    {
      question: pick(
        "dot-five",
        "Tap the 5 of Dots.",
        "5m5p5s",
        [1],
        "The middle tile is the 5 of Dots — five circles. The other two are also fives, but one is a Crak (read its top character) and one is a Bam (count its sticks). The number is the same in all three suits; the suit is what the face is made of.",
        "All three tiles are fives. Find the one whose face is made of circles.",
      ),
    },
    {
      text: "Seven tiles belong to no suit and carry no number. The first four are the winds: East, South, West and North, in the order shown. Each wind's face is a single character, and each wind has its own face. The last three are the dragons: the white dragon has a plain bordered face, the green dragon is green, and the red dragon is red. Winds and dragons together are the honor tiles of this set. A dragon stands on its own: it never has to match a suit in the hand — where a hand wants a dragon, its description names which dragon. And one overlap to warn you about now: the letter W in a printed line always means the West wind, but if you tap the white dragon to look closer, the small corner mark on its face is also a W, printed pale. Tell them apart by the face — the dragon's is plain and bordered, the wind's carries a character — and by the ink: pale for the dragon, dark for the wind.",
      tiles: "1234567z",
    },
    {
      question: pick(
        "north-wind",
        "Tap the North wind.",
        "1234z",
        [3],
        "The fourth tile is the North wind. The row runs East, South, West, North — each wind's name belongs to its own face.",
        "Run through the winds in their order — East, South, West, North — and match each name to its face.",
      ),
    },
    {
      question: pick(
        "red-dragon",
        "Tap the red dragon.",
        "567z",
        [2],
        "The third tile is the red dragon. The row is the white dragon (plain bordered face), the green dragon, then the red dragon.",
        "The dragons sit in this order: white, green, red. The white dragon is the one with the plain bordered face.",
      ),
    },
    {
      text: "Two more tiles remain in the set. There are eight flower tiles, each with a flower picture on its face. In this game flowers are ordinary tiles you hold in your hand: many hands are built partly from flowers. And there are eight joker tiles, all alike. A joker is a wild tile: it can stand in for another tile, but only as one of three or more matching tiles — never standing alone, and never in a pair (a pair is two matching tiles). Lesson 8 gives the joker rules in full.",
    },
    {
      text: "Last, how the set is counted. A kind is one distinct face, such as the 4 of Dots or the East wind. A copy is one physical tile of that kind. There are four copies of every suited kind, every wind and every dragon: 27 suited kinds make 108 tiles, the four winds make 16, and the three dragons make 12. Add the eight flowers and the eight jokers and the whole set is 152 tiles.",
    },
    {
      question: choice(
        "set-total",
        "How many tiles are in the whole American set?",
        ["136", "144", "152", "160"],
        2,
        "152 tiles: 108 suited tiles, 16 winds and 12 dragons, plus 8 flowers and 8 jokers.",
        "Add the parts the counting step named: the suited tiles, the winds and dragons, and then the flowers and jokers.",
        { verify: counted(() => 27 * 4 + 4 * 4 + 3 * 4 + 8 + 8) },
      ),
    },
    {
      question: choice(
        "joker-rule-first",
        "Where may a joker stand in for another tile?",
        [
          "Anywhere at all, even standing alone",
          "Only as one of three or more matching tiles",
          "Only inside a pair",
          "Nowhere — a joker can only be swapped, never played",
        ],
        1,
        "A joker is wild only as one of three or more matching tiles. It can never stand alone and never be half of a pair — that rule shapes the whole game, and lesson 8 returns to it.",
        "Go back to the step that met the jokers: it stated the one arrangement a joker is allowed, and the two it is not.",
      ),
    },
  ]),
  lesson("card", "Reading the card", [
    {
      text: "American mahjong is played from a card: a printed list of hands. Every player at the table plays from the same card, and the only way to win is to build one of the hands printed on it. This lesson teaches you to read one hand line from end to end. The pictured tiles below are the first hand this track will read: even numbers only, all in Craks.",
      hand: "22244466668888m",
    },
    {
      text: "A hand on the card is printed as a line of groups. A group is a set of matching tiles written together, and the size of a group has a name: one tile is a single, two of a kind make a pair, three of a kind make a pung, four of a kind make a kong, and five of a kind make a quint. Of a kind means copies of the same tile. A quint needs five copies of a kind and only four exist, so a quint can only ever be built with a joker standing in it — lesson 8 returns to that. The line for the pictured hand reads: 222 444 6666 8888. Read it group by group: a pung of twos, a pung of fours, a kong of sixes and a kong of eights. Printed with the line, the hand's description reads: “Pungs of twos and fours with kongs of sixes and eights, all in a single suit of your choice.” A description is the line retold in words: it names the groups, and wherever it matters, the suits and the dragons. From here on, read the line and its description together.",
    },
    {
      text: "In a card line, a change of color marks a change of suit. On this card the first suit in a line prints in dark ink, the second in blue, and the third in red. The colors never name the suits — they only mark which groups match: which real suits the colors stand for is your choice, unless a hand's description says otherwise. This line runs in two colors: 22 444 666 8888 88. Its pair of twos, pung of sixes and closing pair of eights print in the dark ink and share one suit; its pung of fours and kong of eights print in blue, a second suit — so the eights are split across the two suits. The pictured tiles show the same split in faces: the dark-ink groups stand here as Craks, the blue groups as Dots. And the hand's description, printed with the line, tells the same story in words: “A pair of twos, pungs of fours and sixes, a kong of eights, and a second pair of eights — the eights are split across two suits, the rest follows them.” The last phrase — the rest follows them — means the twos, fours and sixes split across the same two suits as the eights, group by group as the colors show. Line, colors and description are three tellings of one hand; read them together.",
      hand: "22m444p666m8888p88m",
    },
    {
      text: "Letters appear in lines too. F is a flower: FF is a pair of flowers, FFF a pung of flowers. D is a dragon of one kind — the hand's description names which dragon. When a line carries two D groups, they are two different dragon kinds, never the same kind twice: a line printed DDD DD holds a pung of one dragon and a pair of another, and its description names both kinds, in the line's order. The letters N, E, W and S are the four winds: North, East, West and South. A group of one letter, like the single W at the end of one Winds & Dragons hand, is a single tile that must be matched by drawing it — nothing can stand in for it, not even a joker.",
    },
    {
      text: "Every line ends with a letter of its own: X or C. An exposure is a group you complete by calling — claiming, out loud, another player's discard the moment it is thrown — and placing it face-up in front of you where everyone can see it. X means exposures are allowed: the hand may be built by calling tiles. C means concealed only: the whole hand must be built without calling a single tile — concealed means kept hidden and never shown. A C hand may still be finished by calling the very last tile, the one that wins; lesson 7 explains that call.",
    },
    {
      text: "After the X or C comes the hand's value: the number of points the hand scores when someone makes it. Bigger hands — harder to build, or built without calling — carry bigger values. How a value turns into payments is lesson 10's work; for now, read the value as the hand's price tag.",
    },
    {
      text: "One more line before the checks, from a different family: Consecutive Runs, whose hands climb neighbouring numbers like a staircase. Its first line reads 111 222 3333 4444, marked X, worth 25 points, and its description reads: “The bottom stair in one suit: pungs of ones and twos climbing to kongs of threes and fours.” Read it the way you read the even hand: group by group — a pung of ones, a pung of twos, a kong of threes, a kong of fours — then the letter, then the value. Every line on the card reads the same way, whatever family it sits in.",
    },
    {
      question: choice(
        "ev1-tiles",
        "The line 222 444 6666 8888 is the hand pictured at the start of this lesson. How many tiles does the hand use?",
        ["12", "13", "14", "15"],
        2,
        "Fourteen tiles: a pung of three, a pung of three, a kong of four and a kong of four. Every hand on the card uses fourteen tiles — the winning hand is always fourteen.",
        "Count group by group: the size of each group is the number of digits in it. Add the four group sizes.",
        { verify: counted(() => cardTiles(practiceCardHand("EV-1"))) },
      ),
    },
    {
      question: choice(
        "rn4-pairs",
        "Here is a line you have not read before: 33 44 555 666 7777. How many pairs does this hand have?",
        ["0", "1", "2", "3"],
        2,
        "Two pairs: the 33 and the 44. The 555 and 666 are pungs and the 7777 is a kong — a pair is a group of exactly two.",
        "Go group by group and ask of each one: is this a group of exactly two? Pungs and kongs are not pairs.",
        {
          verify: counted(
            () =>
              practiceCardHand("RN-4").groups.filter((g) => g.count === 2)
                .length,
          ),
        },
      ),
    },
    {
      question: pick(
        "sixes-pick",
        "Tap every 6 of Craks in this hand.",
        "22244466668888m",
        [6, 7, 8, 9],
        "Tiles seven to ten are the kong of sixes. The hand reads: pung of twos, pung of fours, kong of sixes, kong of eights — the sixes sit between the fours and the eights.",
        "Read the hand group by group from the left and keep count of where each group starts and ends.",
      ),
    },
    {
      question: choice(
        "ff-meaning",
        "A hand line begins FF 222 4444 666 88. What are the first two tiles of the hand?",
        [
          "Two jokers",
          "A pair of flowers",
          "A pair of twos",
          "Two tiles you may choose freely",
        ],
        1,
        "FF is a pair of flowers — F stands for a flower wherever it appears in a line. Jokers are never printed in a line at all: a line shows only the real tiles a hand needs.",
        "The letter F was defined in this lesson. What does it stand for in a card line?",
      ),
    },
    {
      question: choice(
        "c-meaning",
        "The line 11 33 55 77 99 333 F is marked C. What must the player making this hand never do?",
        [
          "Hold a flower tile",
          "Call another player's discard to complete a group",
          "Use a pung in the hand",
          "Discard a tile they have just drawn",
        ],
        1,
        "C means concealed only: the hand is built entirely from tiles the player draws, without calling any discard to complete a group. The only call a C hand may make is the final one, for the winning tile itself.",
        "C was defined in this lesson as the opposite of building with exposures. What does building with an exposure require you to do?",
      ),
    },
  ]),
  lesson("practice-card", "Our Practice Card", [
    {
      text: "This app teaches from its own card, the Open Mahjong Practice Card. Its label, printed on the card itself, reads: Practice Card — an original training card, not the official National Mah Jongg League card. The hands on it were invented for this app. They are not the hands you will find on the card at a real table — but every skill in this track — reading lines, passing tiles, choosing and building a hand — is the same skill the real card asks for. The pictured tiles below are the pairs of the card's hardest family, Singles & Pairs, which lesson by lesson you will learn to read.",
      hand: "11m22p33s55m77p99s",
    },
    {
      text: "The card's hands are gathered into nine sections — families of hands built on one idea. Even Numbers uses only twos, fours, sixes and eights; Odd Numbers only ones, threes, fives, sevens and nines. Consecutive Runs climbs neighbouring numbers like a staircase. Like Numbers repeats one number in suit after suit. Winds & Dragons leans on the winds and dragons. Quints holds the hands with a quint in them. Singles & Pairs has no group larger than a pair. In Bloom spends the flowers in earnest, and Bookends builds only from ones and nines, the two ends of the suits.",
    },
    {
      text: "One family's lines deserve a look of their own, because they climb. From Consecutive Runs: 555 666 7777 8888, marked X, worth 25 points. Its description reads: “The same stair near the top of the suit: pungs of fives and sixes, kongs of sevens and eights, one suit throughout.” Each group stands one number above the group before it — fives, sixes, sevens, eights — and the whole staircase stands in a single suit. A later lesson counts a dealt hand against two of this family's hands and lets the count choose between them.",
    },
    {
      text: "Values rise with difficulty, on a ladder of the card's own. Open hands of plain pungs and kongs sit at the bottom, worth 25 to 40 points. Hands that add quints, heavy flowers or tighter structure sit in the middle. Concealed hands — built with no calls at all — pay more, 50 to 60. And the concealed Singles & Pairs hands top the card at 65 to 85, because no joker can ever help them: every group is a pair or a single, and a joker can stand in neither.",
    },
    {
      text: "Most hands on the card are marked X: exposures are allowed, and you may call discards to build them. Every Singles & Pairs hand is marked C, and so are a few hands in other sections — a concealed hand pays more precisely because calling is off the table while you build it. When you read a line, read its letter as carefully as its tiles: the same tiles at X and at C are two very different tasks.",
    },
    {
      question: choice(
        "bookends-section",
        "Which section of the Practice Card holds hands built only from ones and nines?",
        ["Even Numbers", "Bookends", "Quints", "In Bloom"],
        1,
        "Bookends — the family invented for this card, built from the two ends of the suits. Even Numbers is only twos, fours, sixes and eights; Quints is the quint family; In Bloom is the flower family.",
        "The section's name pictures its tiles: the two ends of a suit, like the ends of a shelf.",
      ),
    },
    {
      question: choice(
        "sp1-jokers",
        "The line 11 22 33 55 77 99 FF is marked C and sits in Singles & Pairs. Why can no joker ever help this hand?",
        [
          "Because the hand is worth too many points for jokers",
          "Because every group in it is a pair or a single, and a joker can stand in neither",
          "Because flowers may never stand beside a joker",
          "Because a concealed hand may not contain a joker",
        ],
        1,
        "Look at the groups: seven pairs, nothing larger. A joker may only stand inside a group of three or more, so in a hand of pairs and singles there is no legal place for one to stand. That is why these hands top the value ladder.",
        "Read the line group by group. What size is every group — and where is a joker allowed to stand?",
      ),
    },
    {
      question: choice(
        "top-value",
        "One hand on the card is worth 85 points, the top of the ladder. What kind of hand is it most likely to be?",
        [
          "An open hand of plain pungs and kongs",
          "A hand built around a quint",
          "A concealed hand of singles and pairs",
          "A hand that uses all eight flowers",
        ],
        2,
        "The 85-point hand is a concealed Singles & Pairs hand — twelve single tiles and one pair, with no joker able to help anywhere. The ladder pays most for the hands with the fewest ways to be finished.",
        "Work down the ladder from the top: which family did the ladder lesson say no joker can ever help?",
      ),
    },
    {
      question: pick(
        "kong-pick",
        "Tap every tile of the kong of fours of Craks.",
        "3334444m55p",
        [3, 4, 5, 6],
        "Tiles four to seven are the four fours of Craks — the kong. Before them sits a pung of threes of Craks, and after them a pair of fives of Dots.",
        "Read the row group by group from the left. A kong is a group of four, and only one group in this row has that size — find it by its size first, then check its face.",
      ),
    },
    {
      question: choice(
        "label-meaning",
        "The Practice Card's label says it is not the official National Mah Jongg League card. What does that mean for a real game?",
        [
          "The Practice Card may not be used for practice",
          "Its hands differ from the league card, while the reading and playing skills are the same",
          "Its values are the league's values under other names",
          "Its hands are the league's hands with the suits changed",
        ],
        1,
        "The hands are this app's own invention, so at a real table the specific lines will differ. What carries over is the skill: reading any card's lines, passing tiles, choosing a hand and building it legally.",
        "The label separates two things: the hands themselves, and the skills the hands teach. Which of the two is the same at a real table?",
      ),
    },
  ]),
  lesson("setup", "Setting up and the deal", [
    {
      text: "A game needs the set of 152 tiles, a table for four, and a rack for each player. A rack is the sloped holder in front of you: your tiles stand on it, faces toward you and hidden from the other players, and its flat top is where your exposures will sit. Before the deal, the tiles are shuffled face-down on the table — turned and mixed with both hands so no one can know where any tile sits.",
      tiles: "3m7p2s5z9m",
    },
    {
      text: "Each player then builds a wall: their share of the tiles, stacked two high in a neat row in front of their rack. A wall holds 38 tiles — the whole set of 152 divided among the four players. The four walls together frame the middle of the table, where discards will go. Nothing in a wall is known to anyone: a wall is simply the supply the game will be dealt and drawn from.",
    },
    {
      text: "One player is East, the dealer for the first hand. At a brand-new table that player is chosen by the table itself — many tables roll dice for it, with the highest roll taking East; once the game is running, the deal simply passes around the table, as lesson 10 describes. East begins the setup by breaking the wall: choosing a point in their own wall and pushing the tiles beyond it aside, so the deal starts from the break. Being East is a small advantage — East is dealt one extra tile and so makes the first discard. The deal passes to the next player after each hand; lesson 10 says when.",
    },
    {
      text: "East deals from the break, in blocks of four tiles at a time, going around the table three times — so every player receives twelve tiles. Then East takes two more tiles, and each other player takes one. East ends with fourteen tiles and everyone else with thirteen, as in the pictured rack: runs of neighbouring numbers in Craks, Dots and Bams with a pung of East winds and a pair of Souths. Stand your tiles on your rack as they come; you may arrange them in any order you like.",
      hand: "123m456p789s11122z",
    },
    {
      text: "Nothing is set aside at the deal in this game. A dealt flower is simply a tile you hold — flowers are hand tiles here, and many card hands want them. A dealt joker is likewise yours to keep and use. If your thirteen (or fourteen) tiles include flowers or jokers, they count in your hand like any other tile from the very first discard.",
    },
    {
      question: choice(
        "wall-size",
        "How many tiles does each player's wall hold?",
        ["34", "36", "38", "40"],
        2,
        "Thirty-eight: the full set of 152 divided among four players. Each wall is a quarter of the whole game.",
        "The set has 152 tiles and there are four walls. What is a quarter of the set?",
        { verify: counted(() => 152 / 4) },
      ),
    },
    {
      question: choice(
        "east-count",
        "After the deal, how many tiles does East hold?",
        ["12", "13", "14", "16"],
        2,
        "Fourteen. Everyone receives twelve in the blocks of four; then East takes two more while each other player takes one. East's extra tile is why East discards first.",
        "Start from the twelve everyone receives. East then takes more than the others — how many more?",
        { verify: counted(() => 12 + 2) },
      ),
    },
    {
      question: choice(
        "south-count",
        "You are South for the first hand. The deal has just finished. How many tiles should be standing on your rack?",
        ["12", "13", "14", "15"],
        1,
        "Thirteen. Only East — the dealer — holds fourteen. South, West and North each hold thirteen and wait for East's first discard.",
        "Fourteen belongs to one seat only. Are you sitting in it?",
      ),
    },
    {
      question: pick(
        "east-pair-pick",
        "Tap the pair of East winds in this rack.",
        "789m55p11z",
        [5, 6],
        "The last two tiles are the pair of East winds. The rack reads: 7, 8 and 9 of Craks, a pair of fives of Dots, and the East pair.",
        "Read the rack from the left and note where each group ends. The winds are the tiles at the end.",
      ),
    },
  ]),
  lesson("charleston", "The Charleston", [
    {
      text: "Before any tile is played, the table dances the Charleston: a set of passing rounds in which every player gives three tiles to a neighbour and receives three in return. The Charleston is where a dealt hand starts becoming a chosen hand — you pass away the tiles that fit nothing you might build, and keep the ones that cluster toward a section of the card. The pictured rack is a dealt hand before the Charleston: mostly odd numbers, a pair of East winds, and three even Bams that fit no odd plan.",
      hand: "13579m139p246s11z",
    },
    {
      text: "The Charleston has two halves of three passes each. The first Charleston passes right, then over, then left. Over means across the table, to the player opposite you. On every pass, each player places three tiles face-down in front of the receiving player, all four players passing at the same moment, then picks up the three tiles passed to them. Nobody may look at the tiles coming to them until their own pass has been sent.",
    },
    {
      text: "The second Charleston passes left, then over, then right — the first half run backwards. After the first Charleston's three passes, the table may agree to stop and skip the second half entirely. But it takes the whole table to stop: if even one player wants the second Charleston, it is played. Most new tables simply dance both halves while they learn.",
    },
    {
      text: "What should you pass? There is a rule for it — the pass rule — and the drills in this lesson and lesson 11 grade by it. Pass tiles that are off-pattern: they fit no hand you are considering, stray tiles in suits and numbers your clusters do not touch. Pass tiles that stand alone: no pair, and no part in the clusters you are keeping — a tile may sit beside a kept tile in number and still stand alone, when it fits no hand you are building. Spread the pass one tile in each suit when you can, so no single neighbour receives a ready-made cluster. And never break a pair to make a pass when you have a better pass: a pair is halfway to a pung and the hardest part of many hands to rebuild. When nothing else is free — when every tile you could spare is paired — a tile from a pair is sometimes the right pass: break your least useful pair and pass from it. Keep tiles that sit near your clusters. And one rule stands above all strategy: a joker is never passed. Not in any pass, not ever — if your three pass tiles would include a joker, choose a different tile, however little it fits.",
    },
    {
      text: "Once in a while you hold fewer than three tiles you can spare. Then you may make a blind pass: taking one, two or three of the tiles about to be passed to you and passing them onward without looking at them. A blind pass is a pass made blind — you give away unknown tiles rather than break the tiles you are keeping. It is most often used on the first pass of the second Charleston, when hands have tightened around a plan. Two limits keep it honest. You may take only from the tiles coming to you — never from your own rack. And a blind pass can never break the never-pass-a-joker rule: that rule governs tiles you hold and can see. Tiles passed blind are face-down and unknown to you — forwarding them sight unseen is exactly what the blind pass is for, and a joker on your own rack is never among them.",
    },
    {
      text: "After the Charleston comes one last optional trade, the courtesy pass: you and the player across from you may agree to swap tiles — one, two or three, the same number each way. Both players must agree, and either may refuse. The courtesy pass is a courtesy, not a right: ask, accept the answer, and play on. With that, the Charleston is over and East makes the first discard.",
    },
    {
      question: choice(
        "charleston-order",
        "What is the order of passes in the first Charleston?",
        [
          "Left, over, right",
          "Right, over, left",
          "Right, left, over",
          "Over, right, left",
        ],
        1,
        "Right, over, left. The second Charleston runs the same three passes in the reverse order: left, over, right.",
        "Name the three directions in the order this lesson's second step taught them. The second Charleston runs the same three in reverse.",
      ),
    },
    {
      question: choice(
        "never-pass",
        "Which tile may never be passed in the Charleston?",
        ["A flower", "A wind", "A joker", "A tile from a pair"],
        2,
        "A joker — never, in any pass. Flowers and winds are passed whenever they fit nothing; a tile from a pair is sometimes the right pass, when nothing else is free. The joker alone is untouchable.",
        "One tile in this list is governed by a rule, not by strategy. Which tile did the lesson call untouchable?",
      ),
    },
    {
      question: choice(
        "courtesy-name",
        "After the Charleston, you and the player across from you agree to swap two tiles, the same number each way. What is that trade called?",
        [
          "The blind pass",
          "The courtesy pass",
          "The second Charleston",
          "Breaking the wall",
        ],
        1,
        "The courtesy pass — optional, across the table, and only by agreement on both sides. A blind pass happens during the Charleston and involves tiles you never look at.",
        "The trade is optional and polite: it happens by agreement, after the Charleston is over. Its name says so.",
      ),
    },
    {
      question: pick(
        "pass-evens",
        "This rack is building toward odd numbers. Tap the three tiles that fit that plan least.",
        "1235m3459p169s11z",
        [1, 5, 9],
        "The three even singletons: the 2 of Craks, the 4 of Dots and the 6 of Bams — each sits alone in its suit while the hand's other tiles run odd. The pair of East winds stays: a pair is an asset in many hands, and these three strays fit no odd hand at all.",
        "Use the pass rule from this lesson's fourth step: off-pattern, standing alone, one in each suit when you can, and never break a pair when you have a better pass. This rack is building toward odd numbers.",
      ),
    },
    {
      question: choice(
        "joker-pass-scenario",
        "Mid-Charleston you hold two jokers and exactly one tile you can spare — every other tile on your rack belongs to the hand you are building. The pass requires three tiles. What do you do?",
        [
          "Pass one of the jokers — a pass is a pass",
          "Make a blind pass: pass the tile you can spare, and make up the three with two tiles from the pass coming to you, forwarded sight unseen",
          "Break up the hand you are building and pass two of its tiles",
          "Pass both jokers and keep the tile you can spare",
        ],
        1,
        "A blind pass is the taught remedy for exactly this spot: you hold fewer than three tiles you can spare. You pass the one tile you can spare and forward two of the tiles coming to you without looking at them — your building tiles stay unbroken, and the jokers stay on your rack, because a blind pass takes only from the tiles coming to you, never from your own rack.",
        "This lesson taught a remedy for holding fewer than three tiles you can spare. Where do that remedy's extra tiles come from — and whose rack do they never come from?",
      ),
    },
  ]),
  lesson("picking", "Picking a hand", [
    {
      text: "The Charleston ends and your rack holds thirteen tiles that are no longer random: the passes have clustered them. Picking a hand means reading those clusters against the card. Start with pairs and near-groups — a pair is halfway to a pung, and tiles of one number or one family gathered together are the skeleton of a hand. The pictured rack clusters hard toward even numbers in Craks: pairs of twos and fours, three sixes, three eights, with a stray pair of twos of Dots and a lone white dragon off to the side.",
      hand: "2244666888m22p5z",
    },
    {
      text: "Choose in two steps: first a section, then a hand inside it. The pictured rack points at Even Numbers, and inside that section one hand fits best — the first hand on the card, 222 444 6666 8888, worth 25. Count what the rack already holds toward it, in Craks: two of the three twos, two of the three fours, three of the four sixes and three of the four eights. Ten of the hand's fourteen tiles are already standing on the rack. Count one thing carefully: the rack's pair of twos of Dots is not in that ten. A tile counts toward a hand only in the suit of the group it would fill — every group of this hand is being built in Craks here, so a Dot can never count toward it, however well its number matches. Off-suit tiles are not partial credit; they belong to a different plan, or to a pass.",
    },
    {
      text: "The count that matters next is tiles to go: how many tiles the hand still needs. This rack needs one more 2, one more 4, one more 6 and one more 8 — four tiles to go. Some of those may arrive as jokers standing inside the pungs and kongs, which is legal; lesson 8 covers that. A hand four tiles away after the Charleston is a strong hand. A hand eight tiles away is a hope, not a plan.",
    },
    {
      text: "Always keep a backup: a second hand your tiles also touch, in case the first one dies. A hand dies when the tiles it needs are seen leaving the game — every kind has only four copies, so if three of the eights you need for a kong are discarded by other players, that kong can now be finished only with jokers. When a hand dies, your backup's tiles — the ones you kept instead of passing — become the plan. Pick the backup before you need it: usually the hand that shares the most tiles with your first choice.",
    },
    {
      text: "Often two hands in one section both touch your rack, and the section alone cannot choose between them — the count does. Take this rack: a pung of twos and a kong of fours in Dots, pairs of sixes and eights in Bams, and two flowers standing at the left end — flowers have no pictured face in this app, so they are named here rather than shown. Count it against the section's first hand, 222 444 6666 8888, all in one suit. In Dots the rack holds the twos in full and three of the fours — six tiles — and nothing else on the rack can count toward that hand, because every one of its groups must sit in the single suit. Six held is eight tiles to go: a hope, not a plan. Now count the same rack against the section's fifth hand: FF 222 4444 666 88 — a pair of flowers, then twos and fours in one suit, sixes and eights in a second. The flowers are its pair. The Dots are its twos and fours, complete. The Bams hold its pair of eights and two of its three sixes. Thirteen of its fourteen tiles are already standing on the rack — one tile to go: a third 6 of Bams, or a joker standing in the sixes' pung. Same rack, same section: counted honestly, one hand is eight away and the other is one away. Choosing between hands is counting each of them in full — suits, split and flowers included — and letting the smaller number win.",
      hand: "2224444p6688s",
    },
    {
      question: choice(
        "compare-drill",
        "A fresh rack: a pair of twos of Craks, a pung of fours of Dots, a pung of sixes of Craks, a kong of eights of Dots, and one more eight of Craks. Two hands from Even Numbers are candidates — the first, 222 444 6666 8888, all in one suit; and the second, 22 444 666 8888 88, split across two suits. Which hand is this rack closer to?",
        [
          "The first hand — one suit, fewer tiles to go",
          "The second hand — the split one, fewer tiles to go",
          "Both hands are equally close",
          "Neither hand — this rack points at a different section",
        ],
        1,
        "The second hand, and not by a little. Counted with its split respected — twos, sixes and the closing pair of eights in Craks; fours and the kong of eights in Dots — the rack already holds thirteen of its fourteen tiles: only one more 8 of Craks is missing. The one-suit hand can count only one suit at a time: its best suit, Dots, holds seven tiles (the pung of fours and the kong of eights), leaving seven to go. When two hands in a section compete, count both in full and let the smaller tiles-to-go win.",
        "Count the rack against each hand separately. For the split hand, each group counts only in its own suit: some of its groups are Craks here, the others Dots.",
        { tiles: "22m444p666m8888p8m" },
      ),
    },
    {
      text: "The same counting chooses inside Consecutive Runs, the family whose hands climb neighbouring numbers. Take the pictured rack: thirteen tiles, all Craks — a pung of threes, a pair of fours, a pung of fives, a pung of sixes and a pair of sevens. Count it first against the family's fourth hand: 33 44 555 666 7777, marked X, worth 35 points. Its description reads: “A five-rank run, 3 up to 7, that grows as it climbs: pairs of threes and fours, pungs of fives and sixes, a kong of sevens — all one suit.” In Craks the rack holds both pairs in full, both pungs in full, and two of the kong's four sevens: twelve of the fourteen tiles, with two tiles to go — both of them sevens. Now count the same rack against the family's third hand: 222 333 444 555 66, marked X, worth 30 points, described as: “A run of 2 through 6 that changes suits halfway: pungs of twos and threes in one suit, pungs of fours and fives plus a pair of sixes in another.” The rack holds no twos at all, and all its tiles stand in one suit, so it can fill only one side of that split. The far side counts best: two of the three fours, all three fives, and both sixes of the pair — seven held, seven tiles to go. Twelve against seven: inside a runs family as inside an even one, count both hands in full and let the smaller number win.",
      hand: "3334455566677m",
    },
    {
      question: choice(
        "runs-compare-drill",
        "A fresh rack: pungs of ones, twos and threes of Craks, a pair of fours of Craks, and a pair of fives of Dots. Two hands from Consecutive Runs are candidates — the first, 111 222 3333 4444, a stair in one suit; and the second, 555 666 7777 8888, the same stair near the top of the suit. Which hand is this rack closer to?",
        [
          "The first hand — the low stair, fewer tiles to go",
          "The second hand — the high stair, fewer tiles to go",
          "Both hands are equally close",
          "Neither hand — this rack points at a different section",
        ],
        0,
        "The first hand, by a distance. Counted in Craks it already holds eleven of its fourteen tiles: the pungs of ones and twos in full, three of the kong of threes, and two of the kong of fours — three tiles to go. The high stair can count only the pair of fives of Dots toward its pung of fives: two held, twelve tiles to go. Count both stairs in full, in the suit where each counts most, and let the smaller number win.",
        "Both candidates are one-suit stairs. Count the rack against each stair in the single suit where it counts most.",
        {
          tiles: "11122233344m55p",
          verify: () => {
            const heldToward = (
              id: string,
              held: Readonly<Record<number, number>>,
            ): number =>
              practiceCardHand(id).groups.reduce(
                (sum, g) => sum + Math.min(held[g.rank!] ?? 0, g.count),
                0,
              );
            const lowToGo =
              cardTiles(practiceCardHand("RN-1")) -
              heldToward("RN-1", { 1: 3, 2: 3, 3: 3, 4: 2 });
            const highToGo =
              cardTiles(practiceCardHand("RN-2")) -
              heldToward("RN-2", { 5: 2 });
            return lowToGo < highToGo
              ? "The first hand — the low stair, fewer tiles to go"
              : "The second hand — the high stair, fewer tiles to go";
          },
        },
      ),
    },
    {
      question: choice(
        "ev1-held",
        "Look again at the pictured rack: pairs of twos and fours of Craks, three sixes and three eights of Craks, a pair of twos of Dots and a white dragon. How many tiles of the hand 222 444 6666 8888 does the rack already hold in Craks?",
        ["8", "9", "10", "11"],
        2,
        "Ten: two twos toward the pung of three, two fours toward the pung of three, three sixes toward the kong of four, and three eights toward the kong of four. The pair of twos of Dots does not count — the hand as counted here is being built in Craks.",
        "Go group by group through the hand — twos, fours, sixes, eights — and for each group count how many the rack holds in Craks, never more than the group needs.",
        {
          verify: counted(() => {
            const held: Record<number, number> = { 2: 2, 4: 2, 6: 3, 8: 3 };
            return practiceCardHand("EV-1").groups.reduce(
              (sum, g) => sum + Math.min(held[g.rank!] ?? 0, g.count),
              0,
            );
          }),
        },
      ),
    },
    {
      question: choice(
        "ev1-to-go",
        "The same rack holds ten tiles of that hand, and the hand uses fourteen tiles in all. How many tiles to go does the hand have?",
        ["2", "3", "4", "5"],
        2,
        "Four tiles to go: fourteen in the hand, ten already held. One more 2, one more 4, one more 6 and one more 8 — or jokers standing in their places inside the groups.",
        "Tiles to go is what the hand needs minus what you hold. The hand uses fourteen tiles — the size you counted when you first read this very line, in the Reading the card lesson.",
        {
          verify: counted(
            () => cardTiles(practiceCardHand("EV-1")) - 10,
          ),
        },
      ),
    },
    {
      question: choice(
        "bookends-point",
        "Here is a rack you have not read before: ones and nines in every suit, a pung of ones of Dots, and one wind of each of East, South and West. Which section does this rack point to?",
        ["Even Numbers", "Bookends", "Quints", "Winds & Dragons"],
        1,
        "Bookends. Ten of the thirteen tiles are ones and nines — the two ends of the suits. The three single winds are strays; three tiles do not outvote ten.",
        "Count the rack by family before you answer: how many tiles belong to each section's idea?",
        { tiles: "1199m111p999s123z" },
      ),
    },
    {
      question: choice(
        "like-numbers-point",
        "Another new rack: sevens in all three suits — a kong of sevens of Craks, a pung of sevens of Dots, a pair of sevens of Bams — with a pair of threes of Craks, a stray 5 of Dots and a green dragon beside them. Which section does it point to?",
        ["Like Numbers", "Consecutive Runs", "Quints", "Even Numbers"],
        0,
        "Like Numbers: one number, 7, repeated in suit after suit — nine sevens in all. There is no quint (the largest group is a kong of four), and 7 is nobody's even number.",
        "Ask what single idea most of the tiles share. One number keeps appearing — in how many suits?",
        { tiles: "337777m5777p77s6z" },
      ),
    },
    {
      question: choice(
        "dead-kong",
        "You are chasing a hand that needs a kong of eights. During the game, three eights of the suit you are building in are discarded by other players. What does that tell you?",
        [
          "Nothing — discards can be called later",
          "The kong can now be finished only with jokers, so it is time to lean on your backup",
          "The hand is worth more because the eights are rare",
          "You should discard your own eights at once",
        ],
        1,
        "Every kind has four copies. Three are gone, one remains — a kong of four natural eights is now impossible, and only jokers standing inside the group can complete it. That is a hand dying, and exactly what the backup is for.",
        "How many copies of a kind exist? How many of the eights can still reach you?",
      ),
    },
  ]),
  lesson("playing", "Playing the hand", [
    {
      text: "With the Charleston done, East opens the play. Turns pass to the right, around the table. On your turn you first draw: take the next tile from the wall the game is drawing from — play begins with East's wall and moves around the table as walls are used up — and rack it, standing it with your tiles where only you can see it. A tile you win with on your own draw has a name of its own in lesson 10. First, though, every turn ends the same way: with a discard.",
    },
    {
      text: "To discard, choose one tile from your rack, place it face-up in the middle of the table, and name it aloud as you do — say its name clearly: the number and suit, or the wind or dragon. Naming discards is how the whole table follows the game, and a discard is not final until it is named. The pictured rack is East's fourteen tiles from the setup lesson: runs of neighbouring numbers in the three suits, a pung of Easts and a pair of Souths. East will name one of these tiles and the game is under way.",
      hand: "123m456p789s11122z",
    },
    {
      text: "When a discard lands that you need, you may call it: speak up before the next player draws and racks a tile. You may call a discard for exactly two reasons — to complete an exposure for a hand marked X, or to win, by completing your whole hand. A call is never allowed for a single or a pair on its own, except when that tile is the winning tile. If nobody calls, the turn passes and the next player draws.",
    },
    {
      text: "Calling for an exposure works like this: take the discard, and place it on the flat top of your rack together with the matching tiles from your hand — the pung, kong or quint it completes — all face-up for the table to see. Then discard a tile of your own to end your turn. An exposure, once placed, can never be taken back, changed or added to: it sits there for the rest of the hand, and the whole table can read part of your plan from it. Lesson 9 is about what they will read.",
    },
    {
      text: "A discard that nobody called does not stay live forever. Once the next player has drawn a tile and racked it, the discard before can no longer be called by anyone — it is dead, out of play for good. Dead discards simply accumulate in the middle; they are information (lesson 9 uses them) but they can never come back into a hand. This is why calling is a decision of the moment: hesitate past the next draw and the tile is gone.",
    },
    {
      question: choice(
        "turn-first",
        "Your turn has just come around. What happens first?",
        [
          "You discard a tile from your rack",
          "You draw the next wall tile and rack it",
          "You may call the last discard",
          "You pass three tiles to your right",
        ],
        1,
        "You draw first, then discard. Every turn is draw, then discard — the call and the pass belong to other moments: calling answers someone else's discard, and passing is the Charleston, which is over.",
        "A turn has two halves. Which half puts a new tile on your rack?",
      ),
    },
    {
      question: choice(
        "call-window",
        "A discard you need for a pung has just been named. When must you call it?",
        [
          "Any time before the hand ends",
          "Before the next player draws and racks a tile",
          "Only on your next turn",
          "Before the discarder takes their next turn",
        ],
        1,
        "Before the next player draws and racks a tile — once that happens, the discard is dead and can never be called. Calling is a decision of the moment.",
        "The lesson gave the discard a lifetime. What event ends it?",
      ),
    },
    {
      question: choice(
        "c-call",
        "Your hand is marked C — concealed only. A discard completes a pung in it. May you call the discard?",
        [
          "Yes — a pung is a pung",
          "Yes, if you expose the whole hand",
          "No — a C hand may call only the tile that wins the hand",
          "No — a C hand may not even call to win",
        ],
        2,
        "No. Concealed means built without calling: a C hand may never call to complete a group. The single call it may make is the last one — calling a discard that completes the whole hand and wins.",
        "What does the C forbid while the hand is being built? What is the one exception the card lesson named?",
      ),
    },
    {
      question: pick(
        "kong-call-pick",
        "A 6 of Bams has been discarded and you call it. Tap every tile in your rack that joins the called tile in the exposure.",
        "3m666s",
        [1, 2, 3],
        "The three sixes of Bams join the called 6 to make a kong of four, which goes up on your rack as one exposure. The 3 of Craks stays in your hand — it was never part of this group.",
        "The exposure is made of tiles of a kind with the discard. Which tiles in the rack match it?",
      ),
    },
    {
      question: choice(
        "pair-call",
        "A discard would complete a pair in your hand — not the winning tile, just a pair. May you call it?",
        [
          "Yes — pairs are part of a hand",
          "No — a discard may be called only for a group of three or more, or to win",
          "Yes, if your hand is marked X",
          "Yes, if nobody else wants it",
        ],
        1,
        "No. Calling is only for exposures — groups of three or more — or for the winning tile. A pair must be built from your own draws. This is the same wall that keeps jokers out of pairs: pairs are the hand's private work.",
        "The call rule named two legal reasons to call. Is completing a pair one of them?",
      ),
    },
  ]),
  lesson("jokers", "Jokers, in depth", [
    {
      text: "The joker is the most powerful tile in the set, and the most fenced in. The rule from lesson 1, in full: a joker may stand in for any tile, but only inside a pung, kong or quint — a group of three or more of a kind. It may never be a single and never half of a pair. Inside a legal group it is unrestricted: a kong may hold one joker or three, and even a pung made of three jokers is a legal exposure. The pictured groups — a pung of sevens of Craks and a kong of eights of Dots — are the kind of groups a joker may stand inside.",
      tiles: "777m8888p",
    },
    {
      text: "Jokers and the card meet in the Quints section. Only four natural copies of any tile exist, so a quint — five of a kind — always needs at least one joker standing in it. The card's first quint hand needs one joker at minimum; its double-quint hand needs two, one in each quint, before its pairs are even considered. That double-quint hand's line reads 11111 99999 66 FF — two quints, a pair of sixes and a pair of flowers — and its printed value is 55 points. When you count tiles to go toward a quint hand, count its jokers as tiles you must find, exactly like natural tiles.",
    },
    {
      text: "A joker standing in an exposure is not locked there forever. If you hold the natural tile that a joker is standing for — in your own exposure or in another player's — you may make a joker exchange: on your turn, after you draw and before you discard, hand the natural tile over to take the joker's place in that exposure, and take the joker onto your own rack. The exposure is unchanged — same group, same owner — except that a real tile now sits where the joker stood, and you hold the joker.",
    },
    {
      text: "Sometimes a hand is declared dead — and any player at the table may declare it, because its exposures are face-up for everyone to read: the exposures show it can no longer possibly win — for example, exposures placed toward a hand the card marks C, which may never be built with calls. The table checks the exposures against the card before the ruling stands; a dead hand is a judgment the whole table can verify, not one player's say-so. A dead hand takes no more turns and its owner stops playing that hand. Its exposures stay face-up where they are, and a joker sitting in a dead hand's exposure is frozen with it: no one may exchange for that joker any more. What was exposed stays exposed; what was wild is wild no longer.",
    },
    {
      text: "One piece of table slang completes the joker picture: joker bait. Joker bait is a discard you make hoping another player will call it and expose — you are trading a tile for information, because their exposure tells the whole table what they are building. Bait is a gamble, not a rule: the tile you offer might be exactly the one that wins them the hand. Lesson 9 weighs that risk properly.",
    },
    {
      question: choice(
        "joker-group",
        "Which of these groups may include a joker?",
        [
          "A pair of fives",
          "A single flower, waiting for its match",
          "A kong of nines",
          "The last single tile of a Singles & Pairs hand",
        ],
        2,
        "The kong of nines — a group of four of a kind. Pairs and singles are the two places a joker may never stand, which is why the Singles & Pairs hands, built of nothing else, can never use one.",
        "Sort the four groups by size. A joker needs a group of at least what size?",
      ),
    },
    {
      question: choice(
        "exchange-scenario",
        "An opponent's exposed kong shows two natural sevens and two jokers. On your turn you draw a 7 that matches it. What may you do before you discard?",
        [
          "Nothing — the jokers belong to the exposure now",
          "Exchange your 7 for one of the jokers, leaving your 7 in the exposure",
          "Take both jokers, since you hold the natural tile",
          "Call the kong dead and remove it",
        ],
        1,
        "Exchange: your natural 7 takes a joker's place in the kong, and the joker comes onto your rack. One tile for one joker, one exchange per tile you hold — the second joker stays until someone offers the other 7.",
        "The exchange trades like for like: a natural tile for the joker standing in its place. How many jokers does one natural tile buy?",
      ),
    },
    {
      question: choice(
        "quint-jokers",
        "A quint of threes is exposed with two natural threes showing. At least how many jokers must the quint contain?",
        ["1", "2", "3", "4"],
        2,
        "Three: a quint is five tiles, two are natural threes, so three jokers stand in the rest. This is the arithmetic every quint on the card is built on.",
        "A quint holds five tiles. Count the natural ones and subtract.",
        { verify: counted(() => 5 - 2) },
      ),
    },
    {
      question: choice(
        "dead-joker",
        "A player's hand has been declared dead. Their exposed pung holds a joker, and you hold the natural tile it stands for. May you exchange for that joker?",
        [
          "Yes — exchanges are always allowed",
          "Yes, but only on your next turn",
          "No — a joker in a dead hand's exposure can no longer be exchanged",
          "No — but you may take it if the hand's owner agrees",
        ],
        2,
        "No. A dead hand's exposures are frozen: the joker stays where it sits for the rest of the hand. Dead means finished — for the hand, and for every tile showing in it.",
        "What does a dead hand do to everything already exposed in it?",
      ),
    },
    {
      question: choice(
        "qt3-jokers",
        "The Practice Card's double-quint hand — two quints, a pair of sixes and a pair of flowers — is the third hand in Quints. At least how many jokers does the whole hand need?",
        ["1", "2", "3", "4"],
        1,
        "Two at minimum — one standing in each quint, since no quint can be built from natural tiles alone. The card counts this hand's minimum jokers as two, and lesson 2's reading of quints is why.",
        "Count the quints in the hand. How many jokers does each quint need before any other tile is considered?",
        {
          verify: counted(() => practiceCardHand("QT-3").minJokers),
        },
      ),
    },
  ]),
  lesson("defense", "Defense", [
    {
      text: "Defense is the other half of playing a hand: arranging your discards so that other players do not get the tiles they need. You cannot see their racks — but you are not blind. Their exposures are face-up on their racks, their discards lie named in the middle, and the card is in front of you. Defense is reading those three things together and choosing the discard that helps nobody.",
      hand: "222m444p6666s",
    },
    {
      text: "Read the pictured exposure as an opponent's: a pung of twos of Craks, a pung of fours of Dots and a kong of sixes of Bams. Match it against the card and it points one way — even numbers. This player is collecting twos, fours, sixes and eights. The tiles that can hurt you are the ones that complete their pattern: more even tiles, above all the eights they have not shown yet. Every exposure at the table is a partial confession; the sections of the card turn it into a nameable plan.",
      hand: "222m444p6666s",
    },
    {
      text: "Your second instrument is counting copies. Every kind has exactly four copies in the set. The copies you can see — in discards, in exposures, on your own rack — are accounted for. If three copies of a tile are visible, exactly one remains anywhere: in a wall or on a rack. If all four are accounted for, no one can draw or call that tile again — it can never complete anything for anybody, and a tile that completes nothing is the safest discard there is.",
    },
    {
      text: "Defense matters more as the walls shrink. Early, your own hand comes first: almost any discard is safe enough. Late, when an opponent's exposures say they are one or two tiles away, the order reverses — if your hand is still many tiles from finishing, discard the safest tile you hold, even if it means breaking a group of your own. Breaking your hand on purpose feels wrong and is often right: a broken hand can still be rebuilt next hand; a discard that hands another player the tile that wins them the hand ends this one.",
    },
    {
      text: "One attacking idea belongs in this lesson, because it spends safety to buy information: joker bait, named in lesson 8. You discard a tile you believe another player needs, hoping they call it and expose. Their new exposure tells the whole table what they are building — and if a joker stands in it, that joker can later be exchanged away by whoever draws its natural tile. Weigh the trade honestly. Bait pays early, while the information can still change your own plan and the caller is far from finishing. Late it is a poor trade: against a player one or two tiles from winning, the tile you offer may be the very tile that wins them the hand, and no information is worth that. Bait is a gamble with a price — never pay it with a tile you cannot afford to see called.",
    },
    {
      question: choice(
        "dangerous-discard",
        "The pictured exposure — even numbers, with eights not yet shown — belongs to the player on your left, late in the game. Which of these discards is the most dangerous?",
        [
          "The 8 of Dots",
          "The 3 of Bams",
          "The North wind",
          "The 9 of Craks",
        ],
        0,
        "The 8 of Dots: it is the one tile here that fits the exposed pattern — an even number the collector has not shown. The odd tiles and the wind complete nothing their exposures point to.",
        "Hold each candidate against the exposed pattern. Which one belongs to the family the exposure is collecting?",
        { tiles: "222m444p6666s" },
      ),
    },
    {
      question: choice(
        "copies-count",
        "Three nines of Craks lie in the discard pile, and the fourth 9 of Craks is on your own rack. An opponent's hand needs a pair of nines of Craks. Can they ever complete that pair?",
        [
          "Yes — they can call one of the three discards",
          "Yes — a joker can stand in the pair",
          "No — all four copies are accounted for, and a pair can never use a joker",
          "Yes — the last copy is still in the wall",
        ],
        2,
        "No. Four copies of the kind exist: three are dead in the discard pile and the fourth is in your hand, so no copy can ever reach them — and a pair is the one group a joker can never stand in. That pair is impossible, and a hand that needs it is dying.",
        "Count the copies of the kind that exist in the whole set, then count where they all are. And remember what a pair may never contain.",
      ),
    },
    {
      question: choice(
        "late-defense",
        "Late in the game your hand is still six tiles away, and an opponent's exposures say they are waiting for one tile. What does defense ask of your discard?",
        [
          "Discard from your plan as usual — your hand might still come in",
          "Discard the safest tile you hold, even if it breaks your own hand",
          "Discard a tile from the opponent's family to mislead them",
          "Hold your discard until someone else discards first",
        ],
        1,
        "The safest tile you hold, even at the cost of your own hand. Six tiles away against a player waiting on one, your hand is not the one about to score — the discard that completes nothing is the only play that cannot lose the hand on the spot.",
        "Whose hand is closer to finishing — yours, or the waiting opponent's? Defense serves the closer danger.",
      ),
    },
    {
      question: pick(
        "even-discards-pick",
        "The pictured exposure is built from even numbers. Tap every discard here that is an even number in a suit.",
        "8m8p3s1z",
        [0, 1],
        "The 8 of Craks and the 8 of Dots are the dangerous discards — both even, both able to feed the exposed pattern. The 3 of Bams is odd and the East wind is no number at all.",
        "Work through the row tile by tile, holding each one against the pictured exposure: it is collecting one family of tiles, and the discards that belong to that family are the dangerous ones.",
      ),
    },
  ]),
  lesson("scoring", "Winning and scoring", [
    {
      text: "When a tile — drawn by you, or called from a discard — completes all fourteen tiles of a hand on the card, you declare it: say “mahjong” out loud, and expose your whole hand on your rack so the table can check it against the card, group by group. Mahjong is the name of the game and the call that wins it. If the hand does not match the card, the declaration was wrong and the hand is dead, as lesson 8 described — which is why the table checks before anyone pays.",
      hand: "22244466668888m",
    },
    {
      text: "A winning hand scores the value printed on its line — the pictured hand is the 25-point opener of Even Numbers. One bonus stands on top of the value: a winning hand that used no jokers at all scores double its value. This is the jokerless bonus. It does not apply to Singles & Pairs hands: they can never use jokers, and their high values already price that in. And one word on what points are: points are the score itself, not money. Some tables settle points afterward for small stakes, by house agreement; many play for points alone. The card prints points, and this track counts points.",
    },
    {
      text: "Payments depend on how the winning tile arrived. If you win on another player's discard, that player pays double the hand's value, and each of the other two players pays the value once. The discarder pays for everyone else's relief: they threw the tile that ended the hand, and the table splits the cost with them at double share. Work one stacked example now, before the checks: a player makes a 25-point hand with no jokers in it, on another player's discard. The jokerless bonus applies to the value first — 25 doubles to 50. Then the discard rule takes the discarder's share from the new value: the discarder pays double 50, which is 100, and each of the other two players pays 50. Bonuses always change the value first; shares are always taken from the changed value.",
    },
    {
      text: "If you win on a tile you drew yourself — a self-pick — there is no discarder to single out, so every other player pays double the hand's value. A self-picked win is the best-paid ordinary win at the table: three double payments instead of one double and two singles. It is also why a hand kept concealed and finished on a draw feels so strong — nobody fed it, and everybody pays for it.",
    },
    {
      text: "And sometimes nobody wins. If the last wall tile is drawn and discarded with no mahjong declared, the hand is a wall game: no payments are made by anyone, the tiles are gathered in, and the deal passes to the next player, who becomes East for the new hand. A wall game is not a failure — deep hands often end there, and the defense lesson's caution is part of why.",
    },
    {
      question: choice(
        "ev1-discard-pay",
        "You make the pictured hand — 25 points — on a tile another player discarded. Jokers were used in the hand, so no jokerless bonus applies. What does the discarder pay you?",
        ["25", "50", "75", "100"],
        1,
        "Fifty: a joker was used in the hand, so no jokerless bonus doubles its value — the value stays 25, and the discarder pays double it. The other two players pay 25 each, so the hand brings in 100 points in all.",
        "The discarder's share is not the plain value. What does the discard rule do to it?",
        { verify: counted(() => practiceCardHand("EV-1").value * 2) },
      ),
    },
    {
      question: choice(
        "rn5-selfpick-pay",
        "You make a 40-point hand on a tile you drew yourself — a self-pick. Jokers were used in the hand, so no jokerless bonus applies. What does each other player pay you?",
        ["40", "60", "80", "120"],
        2,
        "Eighty each: a joker was used in the hand, so no jokerless bonus doubles its value — the value stays 40, and on a self-pick every other player pays double it. Three players paying 80 makes 240 points in all — the best-paid ordinary win.",
        "With no discarder, the double share does not disappear. Who pays it instead?",
        { verify: counted(() => practiceCardHand("RN-5").value * 2) },
      ),
    },
    {
      question: choice(
        "jokerless-discard-pay",
        "You make a 30-point hand with no jokers anywhere in it, on another player's discard. What does the discarder pay?",
        ["60", "90", "120", "150"],
        2,
        "120. Apply the bonuses in order: the jokerless hand first doubles its value, 30 to 60; then the discard rule doubles the discarder's share of that, 60 to 120. The other two players pay 60 each.",
        "Two doublings stack here. First the hand's value changes because of how it was built; then the discarder's share is taken from the new value.",
        { verify: counted(() => practiceCardHand("EV-2").value * 2 * 2) },
      ),
    },
    {
      question: choice(
        "wall-game-pay",
        "The last wall tile is drawn and discarded, and nobody has declared mahjong. What happens to the payments?",
        [
          "East pays everyone 25 points",
          "Nobody pays anything — it is a wall game, and the deal passes on",
          "The player closest to a hand collects from the other three",
          "Everyone pays the player who discarded last",
        ],
        1,
        "Nobody pays. A wall game scores nothing for anyone; the tiles are gathered and the next player becomes East. Not every hand has a winner.",
        "A wall game is the hand where the wall ran out. Who won it?",
      ),
    },
    {
      question: choice(
        "ev1-total",
        "You make the 25-point hand on a discard. Jokers were used in the hand, so no jokerless bonus applies. Counting every player's payment together, how many points do you receive in all?",
        ["75", "100", "125", "150"],
        1,
        "100: the discarder pays double value, 50, and each of the other two pays the value, 25 — 50 and 25 and 25. With no bonus in play, a discard win brings in four times the hand's value in all, split that way. A jokerless hand would first double its value — and every share would double with it.",
        "Add the three payments: one double share and two single shares of the same value.",
        { verify: counted(() => practiceCardHand("EV-1").value * 4) },
      ),
    },
  ]),
  lesson("drills", "Table drills", [
    {
      text: "This lesson is the table in miniature: reading lines, passing the Charleston with a plan, choosing sections from racks you have never seen, and paying out hands. There is no new teaching here — every drill uses rules the earlier lessons stated, and every value it asks was printed with its hand earlier in the track. Work the way you would at a table: read each line group by group, count before you answer, and let the rules do the work. The pictured rack is your first drill's raw material.",
      hand: "5679m2468p224s33z",
    },
    {
      question: choice(
        "lk2-tiles",
        "Read this line: 333 333 888 888 33. How many tiles does the hand use?",
        ["12", "13", "14", "15"],
        2,
        "Fourteen — four pungs and a pair: three, three, three, three and two. Every hand on the card uses fourteen tiles, and counting a line's groups is how you check a line you have never seen.",
        "Add the group sizes. There are five groups: four of one size and one of another.",
        { verify: counted(() => cardTiles(practiceCardHand("LK-2"))) },
      ),
    },
    {
      question: choice(
        "qt3-value",
        "Read this line: 11111 99999 66 FF. What is the hand worth?",
        ["45", "50", "55", "60"],
        2,
        "55 points. The line is the double-quint hand from Quints — two quints, a pair of sixes and a pair of flowers — and its printed value is 55.",
        "You met this hand in the jokers lesson, where its line was printed together with its value: two quints, a pair of sixes and a pair of flowers.",
        { verify: counted(() => practiceCardHand("QT-3").value) },
      ),
    },
    {
      question: choice(
        "ib2-flowers",
        "Read this line: FF FFF 555 666 77 8. How many flowers does the hand use?",
        ["3", "4", "5", "8"],
        2,
        "Five flowers: a pair of flowers and a pung of flowers, two plus three. The hand is from In Bloom, the card's flower family — and five of the set's eight flowers in one hand is a serious commitment.",
        "Count only the F groups, and remember what FF and FFF each mean from the card lesson.",
        {
          verify: counted(() =>
            practiceCardHand("IB-2")
              .groups.filter((g) => g.kind === "flower")
              .reduce((sum, g) => sum + g.count, 0),
          ),
        },
      ),
    },
    {
      question: pick(
        "charleston-drill",
        "The pictured rack is building toward even numbers. Tap the three tiles you would pass first.",
        "5679m2468p224s33z",
        [0, 2, 3],
        "The three odd singletons in Craks: the 5, the 7 and the 9. They all sit in one suit because they are the tiles that are free — the spread is one in each suit only when you can. Everything else either is even, pairs up (the pair of twos of Bams, the pair of West winds), or feeds the plan. The 6 of Craks is even — it stays.",
        "Use the pass rule from the Charleston lesson: off-pattern, standing alone, spread one in each suit when you can, and never break a pair when you have a better pass. This rack is building toward even numbers.",
      ),
    },
    {
      question: choice(
        "bookends-drill",
        "A new rack: pungs of ones of Craks and ones of Bams, a pung of nines of Craks, a pair of nines of Dots, and a pair of South winds. Which section do you build toward?",
        ["Like Numbers", "Bookends", "Winds & Dragons", "Even Numbers"],
        1,
        "Bookends: eleven of the thirteen tiles are ones and nines. The pair of Souths is the only group off the pattern — one pair does not make a Winds & Dragons hand out of a rack of ends.",
        "Count by family again: what do all but one of the groups have in common?",
        { tiles: "111999m99p111s22z" },
      ),
    },
    {
      question: choice(
        "exchange-drill",
        "An exposed quint shows three natural fours and two jokers. You draw the fourth 4 — the last natural copy. What may you do before you discard?",
        [
          "Nothing — the quint is complete and closed",
          "Exchange your 4 for one of the jokers in the quint",
          "Take both jokers, since yours is the last copy",
          "Declare the quint dead",
        ],
        1,
        "Exchange: your natural 4 takes one joker's place in the quint, and that joker comes to your rack. The last-copy part changes nothing about the rule — one natural tile buys one joker, whenever you hold it on your turn.",
        "The exchange rule from lesson 8 does not ask which copy you hold. What does it ask?",
      ),
    },
    {
      question: choice(
        "scoring-drill",
        "You make a 40-point hand on another player's discard. Jokers were used in the hand, so no jokerless bonus applies. What does the discarder pay?",
        ["40", "60", "80", "120"],
        2,
        "80: the discarder pays double the value, and with no bonus in play the value is the plain 40. Doubling once, not twice — the second doubling belongs to the jokerless bonus, which this hand does not have.",
        "One rule applies here and one does not. The discard rule doubles the discarder's share; is there any bonus to apply first?",
        { verify: counted(() => practiceCardHand("BK-2").value * 2) },
      ),
    },
    {
      question: pick(
        "winds-drill",
        "Tap every wind in this row.",
        "5m9p7s1z3z",
        [3, 4],
        "The last two tiles are winds: the East wind and the West wind. The row runs a 5 of Craks, a 9 of Dots and a 7 of Bams first — numbered tiles all, and the winds sit after them.",
        "Winds are honor tiles: no suit, no number. Which tiles in this row have no number?",
      ),
    },
    {
      question: choice(
        "wd2-single",
        "Read this line: NNNN SSSS DDD DD W. The hand is complete as printed — fourteen tiles — and one of its groups is a single. Which tile stands alone as that single?",
        ["The North wind", "The South wind", "A dragon", "The West wind"],
        3,
        "The West wind: it is the line's only single — and a single is a complete group of one, so the hand stands complete at fourteen tiles with the W unpaired. The kongs of Norths and Souths and the dragon groups are full-size beside it. The lone W is still the hand's most fragile point: a single can never be called for, and no joker can stand in it, so its match could only ever come from a draw.",
        "Walk the line group by group and find the group of one. Whose name does it carry?",
        {
          verify: () => {
            const single = practiceCardHand("WD-2").groups.find(
              (g) => g.count === 1,
            );
            return single?.kind === "wind" && single.wind === "W"
              ? "The West wind"
              : "unexpected";
          },
        },
      ),
    },
    {
      text: "That is the whole track: the set, the card, this app's Practice Card, setup, the Charleston, choosing, playing, jokers, defense, scoring, and now the drills. At a real table the card will be a different one — that is expected, and the label on ours says so. What you carry there is the skill: read any line group by group, pass with a plan, count what you hold and what you still need, call and exchange inside the rules, watch what the exposures confess, and know what a hand is worth and who pays it. Sit down, build your wall, and play.",
    },
  ]),
];
