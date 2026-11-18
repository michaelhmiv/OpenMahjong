/**
 * MCR (Mahjong Competition Rules) lessons, rebuilt to the lesson
 * standard (brief-lesson-rebuild-v2, PR C): every term is defined in
 * plain words at its first use, tiles are shown as faces from the
 * first step, patterns are recognised in pictured hands, and the
 * worked hand in the payments lesson is counted from its pictured
 * tiles with the engine scorer (scoreMcr) as the oracle.
 */
import {
  parseCounts,
  scoreMcr,
  mcrPayments,
  mcrPatterns,
  type VariantScoreInput,
} from "@openmahjong/engine";
import type {
  VariantLesson,
  VariantQuestion,
  VariantStep,
} from "./variant-content.js";

const lesson = (
  id: string,
  title: string,
  steps: VariantStep[],
): VariantLesson => ({
  id: `mcr-${id}`,
  variant: "mcr",
  profileId: "openmahjong-mcr-2006",
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
  extra: Partial<VariantQuestion> & { tiles?: string } = {},
): VariantQuestion => ({
  kind: "choice",
  id: `mcr-${id}`,
  prompt,
  choices,
  answer,
  explanation,
  hint,
  ...(extra.tiles ? { tiles: extra.tiles } : {}),
  verify: extra.verify ?? (() => choices[answer]!),
} as VariantQuestion);

const pick = (
  id: string,
  prompt: string,
  tiles: string,
  picks: number[],
  explanation: string,
  hint: string,
): VariantQuestion => ({
  kind: "tile-pick",
  id: `mcr-${id}`,
  prompt,
  tiles,
  picks,
  explanation,
  hint,
  verify: () => picks.join(","),
});

/** Engine scorer oracle. Default context: seat South, round West, so
 * no wind triplet in the example hands earns a wind pattern. */
const score = (tiles: string, extra: Partial<VariantScoreInput> = {}) =>
  scoreMcr({
    counts: parseCounts(tiles),
    melds: [],
    winningTile: 27,
    selfDraw: false,
    seatWind: 28,
    roundWind: 29,
    flowers: [],
    replacement: false,
    robbingQuad: false,
    lastWall: false,
    initial: false,
    lastCopy: false,
    ...extra,
  });

/** The worked hand used across the track: three sequences using the
 * number groups 1-2-3, 4-5-6 and 7-8-9 in three different suits, a
 * triplet of red dragons, and a pair of white dragons. Counted in
 * full in the payments lesson: 12 fan before flowers. */
const WORKED = "123m456p789s777z55z";
/** A six-fan hand used for the eight-fan gate: its patterns add to
 * six, so three flowers still cannot make it a win. */
const GATE_HAND = "123456m789p234s55p";

export const MCR_LESSONS: VariantLesson[] = [
  // ---------------------------------------------------------------- L1
  lesson("foundation", "Meeting the tiles", [
    {
      text: "This course teaches MCR — Mahjong Competition Rules — a game of mahjong for four players, played with tiles. Start with the characters suit, shown here from 1 to 9. Each tile in this suit carries a small number at the top and a larger character below it; the number at the top is the one to read. The 5 of characters is the fifth tile in this row.",
      tiles: "123456789m",
    },
    {
      text: "The second suit is circles. A circles tile is read by counting its spots: one spot is the 1, four spots are the 4, and so on up to 9. The tiles in this row run from the 1 of circles on the left to the 9 of circles on the right.",
      tiles: "123456789p",
    },
    {
      text: "The third suit is bamboo. A bamboo tile is read by counting its green sticks. The one exception is the 1 of bamboo, which is drawn as a bird instead of a single stick. This row runs from the bird, the 1 of bamboo, to the 9 of bamboo.",
      tiles: "123456789s",
    },
    {
      text: "Tiles with no suit and no number from 1 to 9 are honors. The first four tiles in this row are the winds, in order: East, South, West and North. The last three are the dragons: the white dragon is a plain framed face, the green dragon carries a green character, and the red dragon carries a red character. An honor can never be part of a numbered run, because it has no number.",
      tiles: "1234567z",
    },
    {
      text: "There are also eight special tiles: four flowers and four seasons, each different. When you draw a flower or a season, you show it beside your tiles and immediately draw a replacement, so it never takes a place among the tiles you are building with. Each one you show adds one point — one unit of score — to a winning hand later, but only to a hand that was already good enough to win without it.",
    },
    {
      text: "Tiles are joined into sets. A set is a small group of tiles that belongs together. The first kind of set is a sequence: three tiles of the same suit whose numbers count up in a row, such as the 3, 4 and 5 of circles shown here. A sequence can never mix suits, and honors can never be in one.",
      tiles: "345p",
    },
    {
      text: "The second kind of set is a triplet: three copies of the same tile, such as the three 8s of bamboo shown here. There are four copies of every ordinary tile in the whole set of tiles, so a triplet leaves one more copy somewhere — in another player's tiles, face-up on the table, or still to be drawn.",
      tiles: "888s",
    },
    {
      text: "A finished hand also needs a pair: two copies of the same tile, such as the two white dragons shown here. A pair is not a set — it is the one group of two that completes the shape of a winning hand.",
      tiles: "55z",
    },
    {
      text: "Four copies of the same tile can be declared together as one set called a quad, such as the four 9s of circles shown here. A quad is still only one set, so when you declare one you draw a replacement tile to make up for the extra tile it uses.",
      tiles: "9999p",
    },
    {
      hand: WORKED,
      text: "Your hand is the tiles you hold. A normal winning hand has fourteen tiles: four sets and one pair. Read this pictured hand aloud: the sequences 1-2-3 of characters, 4-5-6 of circles and 7-8-9 of bamboo, then three red dragons, then a pair of white dragons. That is four sets and a pair, so the shape is complete. This same hand returns later in the course, where you will count what it is worth.",
    },
    {
      hand: WORKED,
      text: "A pattern is a named feature of a finished hand that the scoring list recognises. Look at the pictured hand again: its three red dragons form a triplet, and a triplet of dragons is one pattern. The three sequences use the number groups 1-2-3, 4-5-6 and 7-8-9 in three different suits, which is another pattern. One finished hand usually contains several patterns at once.",
    },
    {
      text: "Fan are the points that patterns are worth. Every pattern in the scoring list is worth a set number of fan, and the value of a finished hand starts by adding up the fan of all the patterns it contains. Fan are simply added together — a pattern worth eight and a pattern worth two give ten fan together.",
    },
    {
      text: "A finished hand can only be declared a win if its patterns add up to at least eight fan. That minimum is checked using pattern fan alone: the points for flowers and seasons you have shown are added afterwards, and they never help a hand reach the eight fan it needs first.",
    },
    {
      question: choice(
        "pattern-definition",
        "What is a pattern?",
        [
          "A named feature of a finished hand that the scoring list recognises",
          "Any three tiles that share a suit",
          "The order in which the four players take their turns",
          "A tile that another player has thrown away",
        ],
        0,
        "A pattern is a named, recognised feature of a finished hand — such as a triplet of dragons — and each pattern is worth fan.",
        "Think back to the pictured hand: the word was defined by pointing at features of that finished hand and naming them.",
      ),
    },
    {
      question: pick(
        "honor-pick",
        "Tap every honor tile in this row.",
        "3m1z5p7z2s",
        [1, 3],
        "East and the red dragon are honors. The other three tiles belong to the characters, circles and bamboo suits.",
        "Honors are the winds and the dragons — the tiles with no suit and no number from 1 to 9.",
      ),
    },
    {
      text: "Now read single faces on their own, with no row order to help. This characters tile stands alone: read the small number at the top of its face.",
      question: choice(
        "char-seven-drill",
        "What number is the pictured characters tile?",
        ["Two", "Four", "Seven", "Nine"],
        2,
        "The small number at the top of the face is 7, so this is the 7 of characters.",
        "For this suit, the number to read is the small one printed at the top of the face, not the large character below it.",
        { tiles: "7m" },
      ),
    },
    {
      text: "One more single characters face, in no particular order.",
      question: choice(
        "char-four-drill",
        "What number is the pictured characters tile?",
        ["Nine", "Three", "Six", "Four"],
        3,
        "The small number at the top of the face is 4, so this is the 4 of characters.",
        "Read the small number at the top of the face, not the large character below it.",
        { tiles: "4m" },
      ),
    },
    {
      text: "The winds are read by their faces too. The four winds were shown in one fixed order — East, South, West, North — and each face is different. This face stands alone.",
      question: choice(
        "wind-east-drill",
        "Which wind is the pictured tile?",
        ["East wind", "South wind", "West wind", "North wind"],
        0,
        "This face is the East wind, the first of the four winds in the order they were shown.",
        "The winds were shown in one fixed order of four. This face is the first one in that order.",
        { tiles: "1z" },
      ),
    },
    {
      text: "Another single wind face.",
      question: choice(
        "wind-west-drill",
        "Which wind is the pictured tile?",
        ["East wind", "South wind", "West wind", "North wind"],
        2,
        "This face is the West wind, the third of the four winds in the order they were shown.",
        "Count along the order the winds were shown in — first, second, third, fourth. This face sits third in that order.",
        { tiles: "3z" },
      ),
    },
  ]),
  // ---------------------------------------------------------------- L2
  lesson("claims", "Turns, claims and quads", [
    {
      text: "A game begins by shuffling all the tiles face-down and stacking them in front of the four players as a low wall. Players draw their starting tiles from the wall, and every later draw comes from the wall too. Tiles that have been thrown away stay face-up on the table where everyone can see them.",
    },
    {
      tiles: "123456m789p234s11z",
      text: "One player is the dealer for each hand. The dealer is dealt fourteen tiles while everyone else is dealt thirteen, takes the first turn, and starts the play. The pictured row is one possible group of fourteen tiles a dealer might hold: two sequences of characters, one of circles, one of bamboo, and a pair of East winds. When the hand ends, a different player becomes the dealer for the next hand — the last lesson explains exactly how the deal moves on.",
    },
    {
      tiles: "1234z",
      text: "Each player also has a seat wind for the hand — the wind of the seat they are sitting in for that hand. Picture the table: the dealer sits in the East seat, the next player in turn order (players take their turns one after another around the table) sits South, then West, then North — the four winds shown here in that order. You know your own seat wind because it follows from who is dealing: count around from the dealer, starting with East for the dealer. On the table in this app it is also written out for you: your wind appears beside your tiles, and each player's wind appears beside their score. A round is a run of four hands, one with each player as dealer in turn, and the round takes its name from the wind of its first dealer — that wind is the round wind, the same for all four hands of the round, and it is the wind shown in the centre of the table. Your seat wind and the round wind matter later, because a triplet of the wind that is the same as either of them can be worth fan.",
    },
    {
      text: "Here is exactly what a wind triplet is worth. A triplet of your own seat wind is the pattern Seat Wind, worth 2 fan. A triplet of the round wind is the pattern Prevalent Wind, worth 2 fan. If one wind is both your seat wind and the round wind, a triplet of it earns both patterns: 2 + 2 = 4 fan. A triplet of a wind that is neither your seat wind nor the round wind earns a smaller pattern, Pung of Terminals or Honors, worth 1 fan — the same one-point pattern a triplet of terminals earns (a terminal is a 1 or a 9 of a suit). A pair of a wind earns nothing.",
    },
    {
      text: "On your turn you draw one tile from the wall, look at your fourteen tiles, and then throw one tile away face-up in front of you, unless you can win or declare a quad. Your thrown-away tiles, kept in the order you threw them, are your pond. A tile you throw away is also called a discard, and the player who threw a tile is called its discarder — later lessons use both words for the thrown tiles and the players who threw them. Everyone can read everyone else's pond, and later lessons use ponds as evidence about which tiles are already gone.",
    },
    {
      text: "When another player throws a tile away, you may be able to claim it. A sequence can only be claimed by the player whose turn comes immediately after the player who threw the tile, and only if you already hold the other two numbers of that sequence in the same suit. After claiming, you show the finished sequence beside your tiles and throw a tile away without drawing.",
    },
    {
      text: "A triplet or a quad can be claimed from any player's thrown tile, as long as you hold the other copies needed. If a finished hand can be completed by the same thrown tile, the win claim beats every set claim. If two players could both win on it, the player nearest in turn order after the thrower wins.",
    },
    {
      text: "A set that you claim from another player's thrown tile, and show face-up beside your hand, is a melded set. Melded sets are fixed: their tiles can never be rearranged into a different set later, however the rest of your hand develops.",
    },
    {
      text: "Tiles that are still hidden in your own hand are concealed. A quad made from four copies you held yourself is a concealed quad: you declare that you have one and draw its replacement, but its faces stay hidden from the other players. A quad claimed from a thrown tile is a melded quad instead. If you later draw the fourth copy of a triplet you already melded, you may add it to make a melded quad — but first the other players get the chance to win on that fourth tile, which is called robbing the quad.",
    },
    {
      text: "If the wall runs out and nobody has won, the hand is a drawn hand: nobody is paid for it, no score changes, and play moves on to the next hand with a new dealer.",
    },
    {
      question: choice(
        "sequence-claim-seat",
        "West throws away the 4 of circles. You hold the 3 and 5 of circles. The player order after West is North, then you. Can you claim the 4 to make a sequence?",
        [
          "Yes — holding the other two numbers is enough",
          "Yes — but only if nobody wants it for a triplet",
          "No — only the player immediately after West can claim a tile for a sequence",
          "No — sequences can never be claimed from thrown tiles",
        ],
        2,
        "A sequence claim belongs only to the player whose turn comes immediately after the thrower — here, North. A triplet or quad claim would have been open to you.",
        "Recall which claim is restricted to one seat, and which seat that is: the one whose turn follows the thrower.",
      ),
    },
    {
      text: "The pictured hand holds a triplet of East winds alongside three sequences and a pair of circles. Answer for your seat: you are South, and the round wind is West.",
      question: choice(
        "wind-triplet-value",
        "How many fan does the East triplet in the pictured hand earn?",
        ["No fan", "1 fan", "2 fan", "4 fan"],
        1,
        "East is neither your seat wind, South, nor the round wind, West, so the triplet earns the one-point pattern for a triplet of terminals or honors.",
        "Compare the triplet's wind with the two winds named in the question, one at a time, and use the values taught in this lesson.",
        {
          tiles: "111z123m456p789s55p",
          verify: () => {
            const s = score("111z123m456p789s55p", { winningTile: 12 });
            const windFan = s.patterns
              .filter((p) =>
                ["Seat Wind", "Prevalent Wind", "Pung of Terminals or Honors"].includes(p.name),
              )
              .reduce((a, p) => a + p.units, 0);
            return `${windFan} fan`;
          },
        },
      ),
    },
    {
      text: "Two more single wind faces to read on their own.",
      question: choice(
        "wind-south-drill",
        "Which wind is the pictured tile?",
        ["East wind", "South wind", "West wind", "North wind"],
        1,
        "This face is the South wind, the second of the four winds in the order they were shown.",
        "Count along the order the winds were shown in — first, second, third, fourth. This face sits second in that order.",
        { tiles: "2z" },
      ),
    },
    {
      question: choice(
        "wind-north-drill",
        "Which wind is the pictured tile?",
        ["East wind", "South wind", "West wind", "North wind"],
        3,
        "This face is the North wind, the fourth of the four winds in the order they were shown.",
        "Count along the order the winds were shown in — first, second, third, fourth. This face sits fourth in that order.",
        { tiles: "4z" },
      ),
    },
    {
      text: "And one more single characters face.",
      question: choice(
        "char-nine-drill",
        "What number is the pictured characters tile?",
        ["Five", "Nine", "Six", "Three"],
        1,
        "The small number at the top of the face is 9, so this is the 9 of characters.",
        "Read the small number at the top of the face, not the large character below it.",
        { tiles: "9m" },
      ),
    },
    {
      question: choice(
        "concealed-quad-privacy",
        "You declare a concealed quad. What do the other players learn about it?",
        [
          "The exact tile, because every declaration is public in full",
          "That you declared a quad, but not which tile it is",
          "Nothing at all — a concealed quad is never declared",
          "The exact tile, but only once the hand has ended",
        ],
        1,
        "A concealed quad is declared and replaced like any quad, but its four faces stay hidden during the hand, so only the fact of the declaration is public.",
        "The quad is declared openly, so it is not secret in every way — think about which part of it stays hidden in your hand.",
      ),
    },
  ]),
  // ---------------------------------------------------------------- L3
  lesson("eligibility", "Waits and the fan minimum", [
    {
      hand: "123456m789p34s11z",
      text: "A wait is a tile that completes your hand. Read this pictured hand of thirteen tiles: the sequences 1-2-3 and 4-5-6 of characters, the sequence 7-8-9 of circles, a pair of East winds — and the 3 and 4 of bamboo, which are not a finished set yet. If one more tile turned those two bamboo tiles into a set, the hand would have its four sets and a pair and would be finished. The tiles that can do that are this hand's waits, and a hand that is one tile away from finished is waiting.",
    },
    {
      tiles: "34s",
      text: "Find the waits by testing each unfinished part. The 3 and 4 of bamboo can be finished by a 2 of bamboo, making the sequence 2-3-4, or by a 5 of bamboo, making 3-4-5. No other tile finishes this part, and every other part of the hand is already complete, so this hand has exactly two waits: the 2 of bamboo and the 5 of bamboo. Drawing either one, or being thrown either one, finishes the hand.",
    },
    {
      text: "Five tiles are drawn next, one at a time, in the row below. Use the method from the last step: a drawn tile is a wait only if it finishes the bamboo part of the pictured hand.",
      question: pick(
        "wait-pick",
        "Tap every tile that is a wait for the pictured hand.",
        "2m2s5s8s5z",
        [1, 2],
        "The 2 and 5 of bamboo finish the 3-4 of bamboo as a sequence. The 2 of characters, the 8 of bamboo and the white dragon finish nothing in that hand.",
        "Test each tile against the one unfinished part of the hand: the 3 and 4 of bamboo, which needs a tile directly below or above it in the same suit.",
      ),
    },
    {
      hand: GATE_HAND,
      text: "Now the fan minimum, with a hand you can count. A hand whose patterns reach at least eight fan is eligible — allowed to be declared a win. Read this pictured hand: the sequences 1-2-3 and 4-5-6 of characters, 7-8-9 of circles and 2-3-4 of bamboo, with a pair of 5s of circles. The next step counts its patterns one at a time.",
    },
    {
      hand: GATE_HAND,
      text: "Count the pictured hand. Every set is a sequence and the pair is a suited tile — suited means from one of the three suits: characters, circles or bamboo — which is the pattern All Chows, worth 2 fan. The hand was kept hidden and won on a thrown tile, worth 2 more fan. Its two character sequences, 1-2-3 and 4-5-6, together cover six numbers in a row, worth 1 fan. The winning tile completed the pair and was the only wait the hand had, worth 1 fan. The patterns add to 2 + 2 + 1 + 1 = 6 fan.",
    },
    {
      text: "Six fan is below the minimum of eight, so this hand cannot be declared a win yet — even if the player has also shown three flowers. The flowers would add three points, making nine points on paper, but flower points are only added after a hand is eligible, and six fan never becomes eligible. The player must keep playing and improve the hand's patterns.",
    },
    {
      text: "One special pattern covers the opposite case. If a finished hand contains no pattern at all — no sequence or triplet pattern, no concealment or wait pattern, nothing — it is awarded the pattern Chicken Hand, worth exactly 8 fan, so it can win after all. Chicken Hand never tops a hand up: a hand with patterns worth six fan, like the one you just counted, stays at six.",
    },
    {
      question: choice(
        "gate-flowers",
        "The counted hand above has patterns worth 6 fan, and its player has shown three flowers. Can the hand be declared a win?",
        [
          "Yes — six fan plus three flower points makes nine, which is more than eight",
          "No — its patterns reach only six fan, and flower points never count toward the eight-fan minimum",
          "Yes — flowers count toward the minimum whenever three or more are shown",
          "No — a winning hand needs at least twelve fan before flowers",
        ],
        1,
        "Eligibility is tested on pattern fan alone. Six is below eight, so the three flower points are never added and the hand must keep playing.",
        "Separate the two numbers: test the minimum with pattern fan only, then ask whether flower points are added before or after that test.",
        {
          verify: () =>
            score(GATE_HAND, {
              winningTile: 13,
              flowers: [34, 35, 36],
            }).eligible
              ? "Yes — six fan plus three flower points makes nine, which is more than eight"
              : "No — its patterns reach only six fan, and flower points never count toward the eight-fan minimum",
        },
      ),
    },
  ]),
  // ---------------------------------------------------------------- L4
  lesson("families", "Pattern families and the pattern reference", [
    {
      tiles: "19m19p19s",
      text: "The 1 and the 9 of each suit have a name: they are terminals, the numbers at the two ends of a suit. The six tiles shown here are all the terminal kinds — the 1 and 9 of characters, circles and bamboo. Several patterns are about terminals, so the word is worth having before the families.",
    },
    {
      tiles: "2345678p",
      text: "The numbers from 2 to 8 in a suit are called simples — every suited number that is not a terminal. This row shows all the simples of circles, from the 2 to the 8. Honors are neither terminals nor simples: they are not numbered at all.",
    },
    {
      hand: "123m456m789p234p55z",
      text: "A hand that uses only two of the three suits is missing a suit, and the missing suit is called the voided suit. Read this pictured hand: characters and circles appear, with a pair of white dragons — bamboo appears nowhere, so bamboo is this hand's voided suit. Patterns about which suits and kinds a hand uses form one of the families below.",
    },
    {
      text: "There are 81 patterns in total, and nobody learns them as one long list. They are grouped here into families — groups of patterns that look at the same kind of feature. The families are: honors; triplets and quads; sequences; tile composition, which covers suits, terminals, simples and voided suits; special structures, which change the shape of the whole hand; concealment and winning, which cover how the hand was kept and won; and small combinations, the one- and two-fan patterns that reward pairs of sets.",
    },
    {
      hand: WORKED,
      text: "A family is only a way of grouping — the skill is recognising patterns inside a real hand. Read the pictured hand again: 1-2-3 of characters, 4-5-6 of circles, 7-8-9 of bamboo, three red dragons, and a pair of white dragons. Its three sequences use the number groups 1-2-3, 4-5-6 and 7-8-9 spread across three suits — a pattern from the sequences family. Its triplet of red dragons belongs to the honors family. Two families in one hand is normal.",
    },
    {
      hand: "123456m789m777z55m",
      text: "Read this pictured hand: the sequences 1-2-3, 4-5-6 and 7-8-9 all in characters, three red dragons, and a pair of 5s of characters. Because every suited tile is a character and honors are also present, it has a pattern from the tile-composition family. Its three character sequences in a row are a pattern from the sequences family, and its dragon triplet is from the honors family — three families in one hand.",
    },
    {
      hand: "333m555p777s999p44z",
      text: "Read this pictured hand: triplets of the 3 of characters, the 5 of circles, the 7 of bamboo and the 9 of circles, with a pair of North winds. Every set is a triplet, so this hand's patterns come from the triplets and quads family. The next lessons take the families one at a time and count real hands from each.",
    },
    {
      text: "After this lesson you can open the full reference of all 81 patterns and search it by name. Each entry gives the pattern's fan, its family, how to recognise it, and which smaller patterns it replaces. Some names in the reference use older words for the sets: in those names, a chow is a sequence, a pung is a triplet, and a kong is a quad. The names are labels — the fan and the recognition rules are what count.",
    },
    {
      question: choice(
        "family-value",
        "Does putting a pattern into a family change how many fan that pattern is worth?",
        [
          "Yes — patterns in the sequences family are worth double",
          "Yes — patterns in the honors family lose one fan",
          "No",
          "Yes — but only for patterns worth more than eight fan",
        ],
        2,
        "Families only organise the 81 patterns for learning. A pattern's fan comes from the pattern list itself and never changes with its family.",
        "Ask what a family is for: it groups patterns by the feature they look at. Grouping is not a scoring rule.",
      ),
    },
    {
      question: choice(
        "family-fixed-set",
        "A set has been melded and shown on the table. Can its tiles later be taken apart and rearranged to make a different pattern?",
        [
          "Yes — whenever the hand is counted again",
          "Yes — but only if the set is a sequence",
          "Yes — but only before the next tile is thrown",
          "No",
        ],
        3,
        "A melded set is fixed for the rest of the hand. Only tiles still concealed in the hand can be arranged in different ways when the hand is counted.",
        "Recall the rule from the claims lesson about melded sets: once a set is shown on the table, its tiles are locked into that set.",
      ),
    },
  ]),
  // ---------------------------------------------------------------- L5
  lesson("exclusions", "Exclusions and counting each pattern once", [
    {
      hand: "123456789m111m99m",
      text: "An exclusion is a rule that a bigger pattern replaces a smaller pattern it already includes, so the smaller one is not added as well. This pictured hand shows why exclusions exist. Read it: the sequences 1-2-3, 4-5-6 and 7-8-9 of characters, a triplet of 1s of characters, and a pair of 9s of characters. Every tile is a character. The next step counts it.",
    },
    {
      hand: "123456789m111m99m",
      text: "Count the pictured hand. Using one suit and no honors is the pattern Full Flush, worth 24 fan. Its three sequences in a row are worth 16 fan. It was kept hidden and won on a thrown tile, worth 2 fan. It uses all four copies of the 1 of characters without declaring a quad, worth 2 fan. Its triplet of 1s is a triplet of terminals, worth 1 fan. The patterns add to 24 + 16 + 2 + 2 + 1 = 45 fan.",
    },
    {
      hand: "123456789m111m99m",
      text: "Now the exclusion. This hand uses no honors, which by itself is the pattern No Honors, worth 1 fan, and it is missing two suits, which by itself is a pattern worth 1 fan. Neither is added: Full Flush already says, in one pattern, that the hand uses exactly one suit and no honors, so paying for those same facts again would count them twice. The total stays at the 45 fan you counted.",
    },
    {
      text: "A related rule is that one hand is counted in one arrangement. The tiles in a hand can sometimes be grouped in two different ways, and the two groupings would earn different patterns. You may not take some patterns from one grouping and some from the other — the hand is counted once, in a single arrangement, and when two arrangements are both legal the one with the higher total is used.",
    },
    {
      hand: "111222333m456p77s",
      text: "Read this pictured hand two ways. Its character tiles — three 1s, three 2s and three 3s — can be grouped as three triplets, or as the sequence 1-2-3 three times over. With the sequence 4-5-6 of circles and the pair of 7s of bamboo, both groupings complete the hand. Counted as triplets, the hand is worth 45 fan: its three triplets step up in number in one suit for 24 fan, three concealed triplets add 16, and winning while hidden on a thrown tile, its triplet of 1s, having no honors at all, and having only one tile it could finish on add the rest. The sequence grouping is worth less, so the triplet grouping is the one that counts — all 45 fan of it, and nothing from the other grouping.",
    },
    {
      question: choice(
        "flush-exclusion",
        "For the one-suit hand counted in this lesson, which of these is added to its 45 fan?",
        [
          "The pattern for using no honors",
          "The pattern for having a voided suit",
          "Both of those smaller patterns",
          "Neither — Full Flush already covers both facts",
        ],
        3,
        "Full Flush already includes using one suit and no honors, so the two smaller patterns that pay for those same facts are excluded. The total stays at 45 fan.",
        "Ask whether the smaller patterns describe anything that the bigger pattern has not already paid for.",
        {
          tiles: "123456789m111m99m",
          verify: () => {
            const s = score("123456789m111m99m", { winningTile: 8 });
            const names = s.patterns.map((p) => p.name);
            return names.includes("Full Flush") &&
              !names.includes("No Honors") &&
              !names.includes("One Voided Suit") &&
              s.qualifyingUnits === 45
              ? "Neither — Full Flush already covers both facts"
              : "invalid";
          },
        },
      ),
    },
    {
      question: choice(
        "competing-arrangement",
        "A hand's tiles can be grouped as triplets or as repeated sequences, and the two groupings earn different patterns. How is the hand counted?",
        [
          "Add the best patterns from both groupings together",
          "Count it once, in the single legal arrangement with the higher total",
          "Count it in whichever arrangement was declared first",
          "Count only the sequence grouping, because sequences are checked first",
        ],
        1,
        "One score comes from one arrangement of the tiles. When both arrangements are legal, the higher legal total is the hand's score, and no pattern from the other arrangement is added.",
        "The rule is about wholeness: a score must come from one grouping of the tiles, never a mixture of two.",
        {
          tiles: "111222333m456p77s",
          verify: () => {
            const s = score("111222333m456p77s", { winningTile: 24 });
            return s.qualifyingUnits === 45 &&
              s.patterns.some((p) => p.name.startsWith("Pure Shifted"))
              ? "Count it once, in the single legal arrangement with the higher total"
              : "invalid";
          },
        },
      ),
    },
  ]),
  // ---------------------------------------------------------------- L6
  lesson("sequences", "Sequences across suits", [
    {
      hand: "123456789m234p55s",
      text: "The sequences family rewards how sequences relate to each other. Read this pictured hand: 1-2-3, 4-5-6 and 7-8-9 all in characters, then 2-3-4 of circles and a pair of 5s of bamboo. The three character sequences cover the whole suit from 1 to 9 in one suit: that is the pattern Pure Straight, worth 16 fan. With its hidden discard win and its all-sequence shape also counted, the hand totals 20 fan. The smaller patterns hiding inside a straight — two sequences covering six numbers, or the 1-2-3 and 7-8-9 at its ends — are not added on top of it.",
    },
    {
      hand: "123p456s789m234p66s",
      text: "Read this pictured hand: 7-8-9 of characters, 1-2-3 and 2-3-4 of circles, 4-5-6 of bamboo, and a pair of 6s of bamboo. Take one sequence from each suit — 1-2-3 of circles, 4-5-6 of bamboo and 7-8-9 of characters: the same three number groups as a Pure Straight, but spread over three suits instead of one. That is the pattern Mixed Straight, worth 8 fan, and with its hidden discard win and all-sequence shape the hand totals 12 fan.",
    },
    {
      tiles: "234m345m456m",
      text: "Some sequence patterns are about sequences that shift. Read this row as three separate groups: 2-3-4 of characters, then 3-4-5 of characters, then 4-5-6 of characters. Each group starts one number higher than the one before, and all three are in one suit. Three sequences in one suit whose starts climb by one like this form the pattern Pure Shifted Chows, worth 16 fan.",
    },
    {
      tiles: "234m456m678m",
      text: "The shift can also be two numbers at a time. Read this row as three groups in one suit: 2-3-4, then 4-5-6, then 6-7-8 of characters — each starts two numbers higher than the one before. That is the same pattern, Pure Shifted Chows, still worth 16 fan.",
    },
    {
      tiles: "234m345p456s",
      text: "Spread the shifting arrangement over three suits and the pattern changes. Read this row as three groups: 2-3-4 of characters, 3-4-5 of circles and 4-5-6 of bamboo. The starts still climb by one, but each sequence is in a different suit. That is the pattern Mixed Shifted Chows, worth 6 fan.",
    },
    {
      tiles: "345m345p345s",
      text: "A sequence can also repeat exactly. Read this row as three groups with the same numbers, 3-4-5, once in each suit: characters, circles and bamboo. The same sequence in all three suits is the pattern Mixed Triple Chow, worth 8 fan.",
    },
    {
      tiles: "345m345m345m",
      text: "The same sequence three times in one suit is worth more. Read this row as three groups of 3-4-5, all in characters. That is the pattern Pure Triple Chow, worth 24 fan.",
    },
    {
      tiles: "345m345m",
      text: "Two copies of the same sequence are a smaller combination. This row shows 3-4-5 of characters twice, as two separate groups. Two identical sequences in the same suit form the pattern Pure Double Chow, worth 1 fan.",
    },
    {
      tiles: "345m345p",
      text: "This row shows two groups with the same numbers in different suits: 3-4-5 of characters beside 3-4-5 of circles. That is the pattern Mixed Double Chow, worth 1 fan.",
    },
    {
      tiles: "123m789m",
      text: "Two more small combinations pair up sequences in one suit. This row shows two groups: 1-2-3 and 7-8-9 of characters — the two end sequences of one suit, held together. That is the pattern Two Terminal Chows, worth 1 fan.",
    },
    {
      tiles: "234m567m",
      text: "This row shows two groups in one suit: 2-3-4 and 5-6-7 of characters. Together they cover six numbers in a row. That is the pattern Short Straight, worth 1 fan.",
    },
    {
      hand: GATE_HAND,
      text: "You have already counted this hand once, in the lesson on the fan minimum: four sequences and a suited pair, worth 6 fan in total. Its all-sequence shape is the pattern All Chows, worth 2 of those fan — and All Chows requires the pair to be a suited tile. The same four sequences with a pair of honors would not have All Chows at all.",
    },
    {
      text: "The hand below was counted in this lesson. Look at its three suits before choosing.",
      question: choice(
        "mixed-straight-id",
        "The sequences 1-2-3 of circles, 4-5-6 of bamboo and 7-8-9 of characters, taken together, form which pattern?",
        [
          "Pure Straight",
          "Mixed Straight",
          "Mixed Triple Chow",
          "Pure Shifted Chows",
        ],
        1,
        "The three number groups 1-2-3, 4-5-6 and 7-8-9 are spread across three different suits, which makes the straight mixed rather than pure. The hand totals 12 fan.",
        "The word to decide is pure or mixed: count how many different suits the three number groups use.",
        {
          tiles: "123p456s789m234p66s",
          verify: () =>
            score("123p456s789m234p66s", { winningTile: 23 }).patterns.some(
              (p) => p.name === "Mixed Straight",
            )
              ? "Mixed Straight"
              : "invalid",
        },
      ),
    },
    {
      text: "Four sequences are shown below, with a pair of East winds.",
      question: choice(
        "all-chows-pair",
        "Does the pictured hand have the pattern All Chows?",
        [
          "Yes — four sequences are all the pattern asks for",
          "No — All Chows also requires the pair to be a suited tile, and this pair is honors",
          "Yes — a pair of honors counts as suited for this pattern",
          "No — All Chows requires all four sequences to be in one suit",
        ],
        1,
        "All Chows needs four sequences and a pair of suited tiles. An honor pair breaks it, even with four perfect sequences.",
        "All Chows restricts two things: what the four sets are, and what the pair is made of. Check the pair in the picture.",
        {
          tiles: "123456m789p234s11z",
          verify: () =>
            score("123456m789p234s11z", { winningTile: 27 }).patterns.some(
              (p) => p.name === "All Chows",
            )
              ? "Yes — four sequences are all the pattern asks for"
              : "No — All Chows also requires the pair to be a suited tile, and this pair is honors",
        },
      ),
    },
    {
      text: "A new hand, never counted in this course. Read its faces yourself and group its character tiles into sequences before answering.",
      question: choice(
        "pure-shifted-count",
        "How many fan is the pattern formed by the three character sequences in the pictured hand worth?",
        ["6 fan", "8 fan", "16 fan", "24 fan"],
        2,
        "The character sequences are 2-3-4, 3-4-5 and 4-5-6: their starts climb by one, all in one suit. That is Pure Shifted Chows, worth 16 fan.",
        "Group the character tiles into their three sequences and look at how their starting numbers relate to each other, and how many suits they use. Then compare that arrangement with the patterns named in this lesson.",
        {
          tiles: "234345456m789p11p",
          verify: () => {
            const p = score("234345456m789p11p", { winningTile: 3 }).patterns.find(
              (x) => x.name === "Pure Shifted Chows",
            );
            return p ? `${p.units} fan` : "invalid";
          },
        },
      ),
    },
    {
      text: "Another new hand. Find the three sequences with the same numbers before answering.",
      question: choice(
        "mixed-triple-value",
        "The pictured hand holds the sequence 3-4-5 in characters, in circles and in bamboo. Which pattern do those three sequences form, and what is it worth?",
        [
          "Mixed Double Chow — 1 fan",
          "Mixed Straight — 8 fan",
          "Pure Triple Chow — 24 fan",
          "Mixed Triple Chow — 8 fan",
        ],
        3,
        "The same sequence, 3-4-5, appears once in each of the three suits: Mixed Triple Chow, worth 8 fan. In one suit only it would have been the pure version, worth more.",
        "Count how many suits the three identical sequences use, and whether their numbers are the same or shifting from one sequence to the next.",
        {
          tiles: "345m345p345s678m55m",
          verify: () =>
            score("345m345p345s678m55m", { winningTile: 12 }).patterns.some(
              (p) => p.name === "Mixed Triple Chow",
            )
              ? "Mixed Triple Chow — 8 fan"
              : "invalid",
        },
      ),
    },
    {
      question: choice(
        "double-chow-value",
        "The row shows 3-4-5 of characters beside 3-4-5 of circles. Which pattern is that, and what is it worth?",
        [
          "Pure Double Chow — 1 fan",
          "Mixed Double Chow — 1 fan",
          "Short Straight — 1 fan",
          "Mixed Triple Chow — 8 fan",
        ],
        1,
        "The same numbers appear in two different suits, which makes the double mixed rather than pure: Mixed Double Chow, worth 1 fan.",
        "The two sequences have the same numbers. Decide whether they share one suit or use two different suits, then use the value taught for that arrangement.",
        {
          tiles: "345m345p",
          verify: () => {
            const p = mcrPatterns().find((x) => x.name === "Mixed Double Chow");
            return p && p.units === 1 ? "Mixed Double Chow — 1 fan" : "invalid";
          },
        },
      ),
    },
  ]),
  // ---------------------------------------------------------------- L7
  lesson("specials", "Pairs, orphans and knitted hands", [
    {
      hand: "1122m3344p5566s77z",
      text: "Some hands do not use sets at all. Read this pictured hand: pairs of the 1 and 2 of characters, the 3 and 4 of circles, the 5 and 6 of bamboo, and a pair of red dragons — seven pairs and nothing else. That is the special structure Seven Pairs, worth 24 fan. A hand going for seven pairs must stay hidden, because claiming a thrown tile would meld a set and break the structure. In these rules, four copies of one tile may be counted as two pairs.",
    },
    {
      hand: "11223344556677m",
      text: "Read this pictured hand: seven pairs of characters, running 1, 1, 2, 2, 3, 3 all the way to 7, 7 — seven pairs of consecutive numbers in one suit. That is Seven Shifted Pairs, worth 88 fan. It replaces Seven Pairs rather than adding to it: the smaller structure it contains is not paid for twice, which is the exclusion rule from the earlier lesson at work.",
    },
    {
      hand: "19m19p19s12345677z",
      text: "Read this pictured hand: the 1 and 9 of characters, the 1 and 9 of circles, the 1 and 9 of bamboo, all four winds, all three dragons — and one of those thirteen kinds twice, here a second red dragon. That is Thirteen Orphans, worth 88 fan: one of every terminal and honor kind, plus a duplicate of any one of them. It is a hidden hand with no sets, no sequences and no triplets.",
    },
    {
      tiles: "147m258p369s",
      text: "The last special structures are knitted hands, built from tiles that deliberately do not form sets. A knitted body takes the numbers 1, 4 and 7 in one suit, 2, 5 and 8 in a second suit, and 3, 6 and 9 in the third suit — this row shows 1-4-7 of characters, 2-5-8 of circles and 3-6-9 of bamboo. Side by side the numbers climb 1 to 9, but no three of them in one suit are consecutive, so nothing here is a sequence.",
    },
    {
      hand: "147m258p369s12345z",
      text: "Add honors to a knitted body and you get the knitted structures. Read this pictured hand: the nine knitted suited tiles and five different honors — fourteen different tiles, with no pair and no set. This structure is the pattern Lesser Honors and Knitted Tiles, worth 12 fan. Because its suited tiles are the complete knitted body — every number from 1 to 9 exactly once across the three suits — the hand also earns the pattern Knitted Straight, worth 12 fan, so its two structure patterns give 24 fan together. Any repeated tile breaks these structures, and claiming a thrown tile to meld a set ends the attempt.",
    },
    {
      hand: "147m258p3s1234567z",
      text: "When all seven honors are present, the structure is worth more. Read this pictured hand: seven knitted suited tiles — 1, 4 and 7 of characters, 2, 5 and 8 of circles, and the 3 of bamboo — together with all seven honors: East, South, West, North and the three dragons. Fourteen different tiles again, but now every honor is there. That is the pattern Greater Honors and Knitted Tiles, worth 24 fan. It replaces the lesser knitted pattern rather than adding to it.",
    },
    {
      hand: "147m258p369s345p22p",
      text: "The complete knitted body can also stand beside ordinary groups. Read this pictured hand: the nine knitted tiles, then an ordinary sequence, 3-4-5 of circles, and a pair of 2s of circles. The nine knitted tiles are the pattern Knitted Straight, worth 12 fan — the same pattern the lesser knitted hand above earned from its complete body. Here it is part of a hand that also holds a set and a pair, instead of a hand made only of single tiles.",
    },
    {
      text: "The pictured hand is the orphans hand from this lesson.",
      question: choice(
        "orphans-kinds",
        "How many different kinds of tile does Thirteen Orphans use, before one of them is duplicated?",
        ["Twelve", "Thirteen", "Fourteen", "Seven"],
        1,
        "Six terminal kinds — the 1 and 9 of each suit — plus four winds and three dragons make thirteen kinds. One of the thirteen is then held twice.",
        "Count the kinds in groups: the terminals of the three suits first, then the winds, then the dragons.",
        {
          tiles: "19m19p19s12345677z",
          verify: () =>
            String(
              parseCounts("19m19p19s12345677z").filter((c) => c > 0).length,
            ) === "13"
              ? "Thirteen"
              : "invalid",
        },
      ),
    },
    {
      question: choice(
        "seven-pairs-value",
        "How many fan is the Seven Pairs structure worth?",
        ["8 fan", "12 fan", "24 fan", "88 fan"],
        2,
        "Seven Pairs is worth 24 fan. The 88-fan figure in this lesson belongs to Seven Shifted Pairs and to Thirteen Orphans.",
        "Two values were named in this lesson for pair structures: the plain seven pairs, and the shifted version in one suit, which is worth much more.",
        {
          verify: () => {
            const s = score("1122m3344p5566s77z", { winningTile: 33 });
            const p = s.patterns.find((x) => x.name === "Seven Pairs");
            return p ? `${p.units} fan` : "invalid";
          },
        },
      ),
    },
    {
      text: "A new knitted hand, never counted in this course. Count its honors and check whether its suited tiles complete the full nine-tile body before answering.",
      question: choice(
        "lesser-knitted-count",
        "How many fan does the pictured hand score in total?",
        ["8 fan", "12 fan", "24 fan", "88 fan"],
        1,
        "The hand holds fourteen different tiles: eight knitted suited tiles and six different honors. With fewer than all seven honors it is Lesser Honors and Knitted Tiles, worth 12 fan, and its suited tiles do not complete the full nine-tile body, so no second structure pattern is added.",
        "Count the honors in the picture, and compare the hand with the two knitted structures taught in this lesson: how many honors does each one need, and is the suited body complete here?",
        {
          tiles: "147m258p36s123456z",
          verify: () => {
            const s = score("147m258p36s123456z", { winningTile: 27 });
            return s.qualifyingUnits === 12 ? "12 fan" : "invalid";
          },
        },
      ),
    },
    {
      text: "A new pairs hand. Read its faces and count it yourself before answering.",
      question: choice(
        "seven-pairs-count",
        "How many fan does the pictured hand score in total?",
        ["24 fan", "25 fan", "32 fan", "49 fan"],
        1,
        "Seven Pairs is worth 24 fan. The hand contains no honors at all, which adds the pattern No Honors, worth 1 fan: 24 + 1 = 25 fan.",
        "First name the structure the seven pairs form and its value. Then check the hand once more for a small extra pattern: look at which kinds of tiles are present, and which are absent entirely.",
        {
          tiles: "112233m445566p77s",
          verify: () => {
            const s = score("112233m445566p77s", { winningTile: 24 });
            return s.qualifyingUnits === 25 ? "25 fan" : "invalid";
          },
        },
      ),
    },
  ]),
  // ---------------------------------------------------------------- L8
  lesson("circumstances", "Concealment, waits and the winning tile", [
    {
      hand: WORKED,
      text: "The last family covers how a hand was kept and how it was won. The pictured hand — the same hand you have been following — was kept completely hidden and won on another player's thrown tile. That is the pattern Concealed Hand, worth 2 fan, and it was part of this hand's value every time you met it.",
    },
    {
      hand: WORKED,
      text: "Now picture the same tiles won differently: the winning tile is drawn by the hand's own player from the wall, with the hand still completely hidden. That is the pattern Fully Concealed Hand, worth 4 fan. It replaces two smaller patterns instead of adding to them: the 2 fan for a hidden discard win, and the 1 fan of the pattern Self-Drawn, for winning on your own draw. Counted this way, the pictured hand's patterns are the 8 fan for its sequences across suits, 4 fan for the fully concealed self-draw win, and 2 fan for its dragon triplet, the pattern Dragon Pung — 14 fan in total.",
    },
    {
      text: "Melding changes this completely. If even one set of the hand was claimed from a thrown tile and melded, the hand is no longer concealed at all: it earns neither the hidden discard-win pattern nor the fully concealed pattern, however the winning tile arrives. A concealed quad is the one exception — declaring a quad from your own four copies does not open the hand. The opposite extreme has its own pattern: a hand whose four sets were all claimed and melded, and which is won on a thrown tile that completes its pair, is the pattern Melded Hand, worth 6 fan.",
    },
    {
      hand: "123m345p678s234s99p",
      text: "Waits also have kinds, and one kind is worth 1 fan when it is the hand's only wait. Read this pictured hand: the winning 3 of characters completed the tiles 1 and 2 of characters. A wait on the tile at the end of a suit's run — the 3 completing 1-2, or the 7 completing 8-9 — is an edge wait. This hand had no other wait, so its edge wait is worth 1 fan.",
    },
    {
      tiles: "13p5s",
      text: "The other two wait kinds are shown here. A wait on the middle tile of a sequence — holding 1 and 3 of circles and waiting for the 2 — is a closed wait, named for the gap it closes. A wait on the tile that completes your pair — holding one 5 of bamboo and waiting for the second — is a single wait. Like the edge wait, each is worth 1 fan only when it is the hand's one and only wait; a hand that could have finished on a different tile as well earns none of them.",
    },
    {
      tiles: "5z",
      text: "One more winning circumstance uses the pond and melded sets as evidence. It is the pattern Last Tile, worth 4 fan. Picture it with the single tile shown here, a white dragon: if you win on a white dragon whose other three copies are all already visible — thrown into ponds or sitting in melded sets — that tile is the last copy of its kind that could possibly appear, and winning with it earns Last Tile. Copies hidden in another player's hand or concealed quad prove nothing, because nobody can see them.",
    },
    {
      tiles: "9999p",
      text: "Two circumstances concern quads, and each is worth 8 fan. The first is the pattern Out with Replacement Tile. You declare a quad, like the four 9s of circles shown here, and the replacement tile you draw for that quad completes your hand, so you win on the replacement tile itself.",
    },
    {
      tiles: "9p",
      text: "The second quad circumstance is the pattern Robbing The Kong, also worth 8 fan. Another player is adding a fourth tile — the 9 of circles shown here — to a triplet they already melded, to make it a quad, and that fourth tile completes your hand, so you win on it before it joins their set. That is robbing the quad, from the claims lesson. Both quad circumstances are rare, and both are judged on the actual winning tile and the moment it arrived, not on how the finished hand happens to look afterwards.",
    },
    {
      question: choice(
        "fully-concealed",
        "A hand is kept completely hidden and won on a tile its own player drew. Which pattern counts that way of winning?",
        [
          "Concealed Hand",
          "The one-point pattern for winning on your own draw",
          "Fully Concealed Hand",
          "Melded Hand",
        ],
        2,
        "A hidden hand won by self-draw is Fully Concealed Hand, worth 4 fan. It replaces both the hidden discard-win pattern and the one-point self-draw pattern.",
        "Two facts combine here: the hand stayed hidden, and the winning tile came from the player's own draw. One pattern covers exactly that combination, and replaces the two smaller ones.",
        {
          verify: () =>
            score(WORKED, { winningTile: 33, selfDraw: true }).patterns.some(
              (p) => p.name === "Fully Concealed Hand",
            )
              ? "Fully Concealed Hand"
              : "invalid",
        },
      ),
    },
    {
      text: "A hand holds the sequences 2-3-4 and 7-8-9 of characters, 3-4-5 of circles, a pair of 9s of circles, and the 1 and 2 of bamboo. Five tiles are drawn next, in the row below.",
      question: pick(
        "edge-wait-pick",
        "Tap every tile that finishes this hand.",
        "3m3s4s7s5z",
        [1],
        "Only the 3 of bamboo finishes the hand, completing 1-2-3 of bamboo — an edge wait. The 4 and 7 of bamboo finish nothing, the 3 of characters leaves the bamboo pair of tiles unfinished, and the white dragon completes no set and no pair.",
        "Test each tile against the hand's one unfinished part: the 1 and 2 of bamboo, which can only be completed at the edge of the suit, plus a check that no tile completes the pair instead.",
      ),
    },
    {
      question: choice(
        "replacement-tile-name",
        "You declare a quad, and the replacement tile you draw for it completes your hand. Which pattern have you earned, and what is it worth?",
        [
          "Last Tile — 4 fan",
          "Out with Replacement Tile — 8 fan",
          "Robbing The Kong — 8 fan",
          "Last Tile Claim — 8 fan",
        ],
        1,
        "Winning on the replacement tile drawn for your own declared quad is Out with Replacement Tile, worth 8 fan.",
        "Think about the moment the winning tile arrived: it came from the wall, as a draw, and it arrived because of a declaration you made yourself.",
        {
          verify: () =>
            scoreMcr({
              counts: parseCounts("9999p123m456s789s55z"),
              melds: [{ kind: "ankan", tiles: [17, 17, 17, 17] }],
              winningTile: 25,
              selfDraw: true,
              seatWind: 28,
              roundWind: 29,
              flowers: [],
              replacement: true,
              robbingQuad: false,
              lastWall: false,
              initial: false,
              lastCopy: false,
            }).patterns.some((p) => p.name === "Out with Replacement Tile")
              ? "Out with Replacement Tile — 8 fan"
              : "invalid",
        },
      ),
    },
    {
      text: "A new hand, never counted in this course. It was kept hidden and won on a tile another player threw away. Read its faces and count it yourself before answering.",
      question: choice(
        "circumstances-transfer-count",
        "How many fan does the pictured hand score in total?",
        ["8 fan", "11 fan", "12 fan", "16 fan"],
        1,
        "The sequences 1-2-3 of characters, 2-3-4 of circles and 3-4-5 of bamboo start one number higher each time across three suits: Mixed Shifted Chows, 6 fan. Four sequences with a suited pair add All Chows, 2 fan. The 1-2-3 and 7-8-9 of characters together add Two Terminal Chows, 1 fan. Kept hidden and won on a thrown tile adds Concealed Hand, 2 fan. The total is 6 + 2 + 1 + 2 = 11 fan.",
        "Work in the order this course counts: name the sets first, then the patterns those sets form together, then add what the way the hand was kept and won is worth.",
        {
          tiles: "123m234p345s789m55p",
          verify: () => {
            const s = score("123m234p345s789m55p", { winningTile: 12 });
            return s.qualifyingUnits === 11 ? "11 fan" : "invalid";
          },
        },
      ),
    },
  ]),
  // ---------------------------------------------------------------- L9
  lesson("payments", "Who pays what", [
    {
      hand: WORKED,
      text: "This lesson scores one complete hand from its tiles to its payments — the hand you have followed through the course. Read it once more: the sequences 1-2-3 of characters, 4-5-6 of circles and 7-8-9 of bamboo; a triplet of red dragons; and a pair of white dragons. It was kept hidden, and it was won on a tile another player threw away. The player also showed two flowers during the hand.",
    },
    {
      hand: WORKED,
      text: "Count its patterns first. The three sequences use the number groups 1-2-3, 4-5-6 and 7-8-9 in three different suits: that is Mixed Straight, worth 8 fan. Running total: 8 fan.",
    },
    {
      hand: WORKED,
      text: "The triplet of red dragons is the pattern Dragon Pung, worth 2 fan — running total 10. The hand was kept hidden and won on a thrown tile: Concealed Hand, worth 2 fan — running total 12. No other pattern in the hand survives the exclusion rules, so its patterns add to exactly 12 fan.",
    },
    {
      text: "Check the gate before any money moves: 12 fan is at least the minimum of eight, so the hand is eligible and the win stands. Fan decides whether a hand can win.",
    },
    {
      text: "Only now are the two shown flowers added, one point each, giving a hand value of 12 + 2 = 14 points. Fan plus flowers decides what the hand is worth.",
    },
    {
      text: "Payments follow one base rule and one split. The base rule: every player who did not win pays 8 base points toward the win. The split is about the hand value. If the win came from another player's thrown tile, that one player — the discarder — also pays the full hand value, and the other two players pay only their 8 base points. If the winner drew the winning tile themself, there is no discarder, so every opponent pays the hand value on top of the base.",
    },
    {
      text: "Apply it to the worked hand, won on a thrown tile with a value of 14 points. The discarder pays 8 base + 14 hand value = 22 points. Each of the other two players pays 8 points. The winner receives 22 + 8 + 8 = 38 points in total.",
    },
    {
      text: "The same hand value won by self-draw instead: each of the three opponents pays 8 base + 14 hand value = 22 points, and the winner receives 22 + 22 + 22 = 66 points. Self-draw wins pay more because the hand value is collected three times instead of once. Being the dealer makes no difference to any of these amounts — the deal carries no multiplier.",
    },
    {
      text: "A smaller example, with the same shape of arithmetic: a hand worth eight fan with two flowers has a value of 10 points. Won on a thrown tile, the discarder pays 8 + 10 = 18 points and the other two players pay 8 each, so the winner receives 18 + 8 + 8 = 34 points. Every payment in this game can be checked the same way: base 8 for every loser, plus the hand value from the discarder alone or from everyone on a self-draw.",
    },
    {
      question: choice(
        "worked-discarder-pays",
        "For the worked hand in this lesson — 12 fan, two flowers, won on a thrown tile — how many points does the discarder pay?",
        ["14 points", "18 points", "22 points", "38 points"],
        2,
        "The discarder pays the 8 base points plus the full hand value of 14, which is 22. The 38 is what the winner receives from all three players together.",
        "Build the discarder's payment from the two parts every payment has: the base points every loser pays, plus the hand value — and remember who pays the hand value on a discard win.",
        {
          verify: () =>
            `${mcrPayments(12, { winner: 0, payer: 1, selfDraw: false }, 2).find((p) => p.seat === 1)!.amount} points`,
        },
      ),
    },
    {
      question: choice(
        "worked-selfdraw-total",
        "The same hand value of 14 points is won by self-draw. How many points does the winner receive in total?",
        ["22 points", "38 points", "54 points", "66 points"],
        3,
        "On a self-draw each of the three opponents pays 8 base + 14 hand value = 22 points, so the winner receives 3 × 22 = 66 points.",
        "On a self-draw there is no single discarder: work out what one opponent pays, then multiply by the number of opponents.",
        {
          verify: () =>
            `${mcrPayments(12, { winner: 0, payer: 0, selfDraw: true }, 2).reduce((a, p) => a + p.amount, 0)} points`,
        },
      ),
    },
    {
      hand: "789m123p456s666z55z",
      text: "Now a hand this course has never counted. Read the pictured hand yourself — name each set and the pair from the faces. It was kept hidden and won on a tile another player threw away, and its player showed one flower during the hand. Count it before answering.",
    },
    {
      question: choice(
        "transfer-count",
        "How many fan do the pictured hand's patterns add up to?",
        ["8 fan", "10 fan", "12 fan", "14 fan"],
        2,
        "The sequences 7-8-9 of characters, 1-2-3 of circles and 4-5-6 of bamboo use the three number groups in three suits: Mixed Straight, 8 fan. The triplet of green dragons adds 2 fan, and the hidden win on a thrown tile adds Concealed Hand, 2 fan: 8 + 2 + 2 = 12 fan.",
        "Name each pattern the hand contains and add their values one at a time. The flower is not a pattern, so leave it out of this count.",
        {
          tiles: "789m123p456s666z55z",
          verify: () => {
            const s = score("789m123p456s666z55z", { winningTile: 32 });
            return s.qualifyingUnits === 12 ? "12 fan" : "invalid";
          },
        },
      ),
    },
    {
      question: choice(
        "transfer-discarder-pays",
        "That hand's patterns add to 12 fan and its player showed one flower. It was won on a thrown tile. How many points does the player who threw the winning tile pay?",
        ["13 points", "21 points", "29 points", "37 points"],
        1,
        "The hand value is 12 fan plus one flower point: 13 points. On a win from a thrown tile, the player who threw it pays the 8 base points plus the full hand value: 8 + 13 = 21 points.",
        "Build the payment in the order this lesson teaches: work out the hand value first, from its patterns and its flower, then apply the payment split for a win on a thrown tile.",
        {
          verify: () =>
            `${mcrPayments(12, { winner: 0, payer: 1, selfDraw: false }, 1).find((p) => p.seat === 1)!.amount} points`,
        },
      ),
    },
    {
      hand: "112233m445566p77s",
      text: "One more new count. Read the pictured hand from its faces and name its structure before answering. Its player drew the winning tile themself, and showed no flowers.",
    },
    {
      question: choice(
        "transfer-selfdraw-total",
        "How many points does the winner of the pictured hand receive in total?",
        ["78 points", "96 points", "102 points", "114 points"],
        2,
        "The hand is Seven Pairs, worth 24 fan. It contains no honors at all, which adds No Honors for 1 fan, and winning on your own draw adds Self-Drawn for 1 fan: 26 fan in total, with no flowers. On a self-draw each of the three opponents pays 8 + 26 = 34 points, so the winner receives 3 × 34 = 102 points.",
        "Count the hand's patterns first, including what winning on your own draw adds to this structure. Then use the self-draw payment split, in which every opponent pays the same amount.",
        {
          tiles: "112233m445566p77s",
          verify: () => {
            const s = score("112233m445566p77s", {
              winningTile: 24,
              selfDraw: true,
            });
            const total = mcrPayments(
              s.qualifyingUnits,
              { winner: 0, payer: 0, selfDraw: true },
              0,
            ).reduce((a, p) => a + p.amount, 0);
            return `${total} points`;
          },
        },
      ),
    },
  ]),
  // --------------------------------------------------------------- L10
  lesson("match", "The full game and looking back", [
    {
      tiles: "1234z",
      text: "A match is the whole contest: a series of hands played until every player has dealt in every round. A full match has four rounds — East, South, West and North, the four winds shown here in order — and each round has four hands, one with each player as dealer. Four rounds of four hands make sixteen hands in a full match. Shorter matches that stop after the East round, or after East and South, use exactly the same rules for every hand.",
    },
    {
      text: "The deal moves after every single hand. When a hand ends — whether the dealer won it, another player won it, or the wall ran out with no winner — the next player in turn order becomes the dealer for the next hand. The dealer never keeps the deal for a repeat hand, so a round of four hands always gives each player exactly one turn as dealer.",
    },
    {
      text: "Every player starts a match with a score of zero. Payments move points from the players who lost a hand to the player who won it; points are never created or destroyed, so the four scores always add up to zero. A score can fall below zero during a match, and play simply continues. At the end, the four scores are ranked from highest to lowest to give the final standings.",
    },
    {
      text: "Look back over the whole game you have learned. Four players sit at a wall of tiles. Each holds thirteen tiles, draws and throws one away in turn, and may claim thrown tiles to meld sequences, triplets and quads — or keep a hand concealed, hidden in their own hand, instead. Thrown tiles collect in ponds, where everyone can read them, and flowers are shown and replaced as they appear.",
    },
    {
      text: "A hand is won by completing four sets and a pair — or one of the special structures, a hand built to a special shape such as seven pairs — and its patterns are then counted in a single arrangement, with exclusions applied, bigger patterns replacing the smaller ones they already include: the fan of its patterns must reach at least eight before the points for its flowers are added. The discarder, or all three opponents on a self-draw, then pay 8 base points each plus the hand value where the split requires it, and the deal passes to the next player.",
    },
    {
      text: "That is the complete game: read the tiles, build sets toward patterns worth eight fan or more, watch the ponds and the waits, and count every winning hand from its tiles before working out who pays what. The pattern reference from the families lesson stays available whenever you want to look a pattern up.",
    },
    {
      question: choice(
        "match-hands",
        "How many hands are played in a full match?",
        ["Four", "Eight", "Twelve", "Sixteen"],
        3,
        "A full match has four rounds — East, South, West and North — with four hands in each round, which makes sixteen hands.",
        "Multiply the number of rounds in a full match by the number of dealer turns in each round.",
      ),
    },
    {
      question: choice(
        "dealer-advances",
        "The dealer wins a hand. Who deals the next hand?",
        [
          "The dealer again, as a reward for winning",
          "The next player in turn order",
          "The player who threw away the winning tile",
          "The player with the lowest score",
        ],
        1,
        "The deal moves to the next player after every hand in this game, whoever won it — there are no repeat deals.",
        "Recall the rule that keeps every round to exactly four hands: it is about how the deal moves, win, loss or drawn hand alike.",
      ),
    },
  ]),
];
