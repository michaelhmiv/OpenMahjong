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
      text: "There are also eight special tiles: four flowers and four seasons, each different. When you draw a flower or a season, you show it beside your tiles and immediately draw a replacement, so it never takes a place among the tiles you are building with. Each one you show adds one point to a winning hand later — but only to a hand that was already good enough to win without it.",
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
        [3, 4],
        "East and the red dragon are honors. The other three tiles belong to the characters, circles and bamboo suits.",
        "Honors are the winds and the dragons — the tiles with no suit and no number from 1 to 9.",
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
      text: "Each player also has a seat wind for the hand: the dealer is East, the next player in turn order is South, then West, then North. A round is a run of four hands, one with each player as dealer in turn, and the round takes its name from the wind of its first dealer — that wind is the round wind, the same for all four hands of the round. Your seat wind and the round wind matter later, because a triplet of the wind that is the same as either of them can be worth fan.",
    },
    {
      text: "On your turn you draw one tile from the wall, look at your fourteen tiles, and then throw one tile away face-up in front of you, unless you can win or declare a quad. Your thrown-away tiles, kept in the order you threw them, are your pond. Everyone can read everyone else's pond, and later lessons use ponds as evidence about which tiles are already gone.",
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
      text: "Count the pictured hand. Every set is a sequence and the pair is a suited tile, which is the pattern All Chows, worth 2 fan. The hand was kept hidden and won on a thrown tile, worth 2 more fan. Its two character sequences, 1-2-3 and 4-5-6, together cover six numbers in a row, worth 1 fan. The winning tile completed the pair and was the only wait the hand had, worth 1 fan. The patterns add to 2 + 2 + 1 + 1 = 6 fan.",
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
      text: "Now the exclusion. This hand uses no honors, which by itself is a pattern worth 1 fan, and it is missing two suits, which by itself is a pattern worth 1 fan. Neither is added: Full Flush already says, in one pattern, that the hand uses exactly one suit and no honors, so paying for those same facts again would count them twice. The total stays at the 45 fan you counted.",
    },
    {
      text: "A related rule is that one hand is counted in one arrangement. The tiles in a hand can sometimes be grouped in two different ways, and the two groupings would earn different patterns. You may not take some patterns from one grouping and some from the other — the hand is counted once, in a single arrangement, and when two arrangements are both legal the one with the higher total is used.",
    },
    {
      hand: "111222333m456p77s",
      text: "Read this pictured hand two ways. Its character tiles — three 1s, three 2s and three 3s — can be grouped as three triplets, or as the sequence 1-2-3 three times over. With the sequence 4-5-6 of circles and the pair of 7s of bamboo, both groupings complete the hand. Counted as triplets, the hand is worth 45 fan: its three triplets step up in number in one suit for 24 fan, three concealed triplets add 16, and its hidden discard win, its triplet of 1s, its lack of honors and its single wait add the rest. The sequence grouping is worth less, so the triplet grouping is the one that counts — all 45 fan of it, and nothing from the other grouping.",
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
      text: "Some sequence patterns are about sequences that shift. In this row, the three character sequences start at 2, then 3, then 4: each starts one number higher than the one before. Sequences arranged like this are shifted sequences. Three shifted sequences in one suit make one pattern; the same shifting arrangement spread over three suits makes another, and the shift can also be two numbers at a time instead of one.",
    },
    {
      tiles: "345m345p345s",
      text: "A sequence can also repeat. This row shows the sequence 3-4-5 three times, once in each suit — the same numbers in characters, circles and bamboo. Three copies of the same sequence in three suits is one named pattern; three copies in the same suit is another, worth more. Two copies of the same sequence are a smaller combination, worth 1 or 2 fan depending on whether the two copies are in the same suit or in different suits.",
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
      text: "Add honors to a knitted body and you get the knitted structures. This pictured hand holds the nine knitted suited tiles and five different honors — fourteen different tiles, with no pair and no set. With all seven honors present instead of some, the structure is worth more; with fewer honors it is worth less. Either way, any repeated tile breaks the structure, and claiming a thrown tile to meld a set ends the attempt.",
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
  ]),
  // ---------------------------------------------------------------- L8
  lesson("circumstances", "Concealment, waits and the winning tile", [
    {
      hand: WORKED,
      text: "The last family covers how a hand was kept and how it was won. The pictured hand — the same hand you have been following — was kept completely hidden and won on another player's thrown tile. That is the pattern Concealed Hand, worth 2 fan, and it was part of this hand's value every time you met it.",
    },
    {
      hand: WORKED,
      text: "Now picture the same tiles won differently: the winning tile is drawn by the hand's own player from the wall, with the hand still completely hidden. That is the pattern Fully Concealed Hand, worth 4 fan. It replaces two smaller patterns instead of adding to them: the 2 fan for a hidden discard win, and the 1 fan for winning on your own draw. Counted this way, the pictured hand's patterns are the 8 fan for its sequences across suits, 4 fan for the fully concealed self-draw win, and 2 fan for its dragon triplet — 14 fan in total.",
    },
    {
      text: "Melding changes this completely. If even one set of the hand was claimed from a thrown tile and melded, the hand is no longer concealed at all: it earns neither the hidden discard-win pattern nor the fully concealed pattern, however the winning tile arrives. A concealed quad is the one exception — declaring a quad from your own four copies does not open the hand.",
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
      text: "One more winning circumstance uses the pond and melded sets as evidence. If you win on a tile whose other three copies are all already visible — thrown into ponds or sitting in melded sets — that tile is the last copy of its kind that could possibly appear, and winning with it is worth 4 fan. Copies hidden in another player's hand or concealed quad prove nothing, because nobody can see them.",
    },
    {
      text: "Two circumstances concern quads. Winning on the replacement tile you draw after declaring a quad is worth 8 fan. And if you win on the fourth tile another player is adding to a melded triplet to make a quad — robbing the quad, from the claims lesson — that win is worth 8 fan as well. Both are rare, and both are judged on the actual winning tile and the moment it arrived, not on how the finished hand happens to look afterwards.",
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
      text: "The triplet of red dragons is a dragon triplet pattern, worth 2 fan — running total 10. The hand was kept hidden and won on a thrown tile: Concealed Hand, worth 2 fan — running total 12. No other pattern in the hand survives the exclusion rules, so its patterns add to exactly 12 fan.",
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
      text: "Look back over the whole game you have learned. Four players sit at a wall of tiles. Each holds thirteen tiles, draws and throws one away in turn, and may claim thrown tiles to meld sequences, triplets and quads — or keep a hand concealed instead. Thrown tiles collect in ponds, where everyone can read them, and flowers are shown and replaced as they appear.",
    },
    {
      text: "A hand is won by completing four sets and a pair — or one of the special structures — and its patterns are then counted in a single arrangement, with exclusions applied: the fan of its patterns must reach at least eight before the points for its flowers are added. The discarder, or all three opponents on a self-draw, then pay 8 base points each plus the hand value where the split requires it, and the deal passes to the next player.",
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
