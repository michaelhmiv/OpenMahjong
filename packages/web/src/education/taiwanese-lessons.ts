/**
 * Taiwanese lessons, format v2 (brief-lesson-rebuild-v2, PR D).
 *
 * Written for a player who has never seen a mahjong tile. Terms are
 * defined in plain words at first use, in this order across the track:
 * suits and honors, sets and the pair, the quad and flowers (lesson 1);
 * tai, the dealer, seat wind, round wind and the repeat (lesson 2);
 * discard win, self-draw, concealed and open hands, and eligibility
 * (lesson 3); the wall, the deal and the reserve (lesson 4); waits and
 * ready (lesson 6, before anything is disqualified by them). Every
 * pictured hand is read aloud in plain words — tile-code notation is
 * never used in teaching text. Scoring numbers that a check depends on
 * are verified against the engine's Taiwanese scorer or payment
 * function in the question's verify().
 *
 * Fix round (Nov 17, 2026): every award value spent in the payments
 * lesson is taught and pictured at its home lesson first (honor
 * triplets and all-triplets in lesson 5, suit patterns in lesson 6);
 * lessons 5, 6, 7, 8 and 9 count NEW pictured hands the teaching never
 * used, verified against the scorer; lessons 1 and 2 drill the wind
 * faces and characters numbers by face, shuffled, not by row position.
 *
 * Definition audit (Nov 17, 2026): every term's first use in this
 * track carries its own plain-words definition — claim and discard
 * are glossed where lesson 2 first spends them, the dealer bonus is
 * named only where the payments lesson prices it, and the names a
 * player meets on the win list and the calculator (meld, live wall,
 * exposed, closed wait, unique wait, Full flush, All Honors, Little
 * and Big Four Winds, quartet, Eight Immortals, Heavenly and Earthly
 * hand) are each defined at the step that teaches their value. Seat
 * wind and round wind are taught on a pictured table order in
 * lesson 2: what each names, how a player knows theirs, and what a
 * wind triplet is worth in tai (one, whichever wind it is).
 */
import {
  parseCounts,
  scoreTaiwanese,
  taiwanesePayments,
  standardShapes,
  createTaiwaneseAdapter,
  type VariantScoreInput,
} from "@openmahjong/engine";
import type {
  VariantLesson,
  VariantQuestion,
  VariantStep,
} from "./variant-content.js";

const PROFILE_ID = "openmahjong-taiwanese-every-flower";
const lesson = (
  id: string,
  title: string,
  steps: VariantStep[],
): VariantLesson => ({
  id: `tw-${id}`,
  variant: "taiwanese",
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
  id: `tw-${id}`,
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
  id: `tw-${id}`,
  prompt,
  tiles,
  picks,
  explanation,
  hint,
  verify: () => picks.join(","),
});
const scored = (hand: string, extra: Partial<VariantScoreInput> = {}) =>
  scoreTaiwanese({
    counts: parseCounts(hand),
    melds: [],
    winningTile: 31,
    selfDraw: false,
    seatWind: 28,
    roundWind: 27,
    flowers: [],
    replacement: false,
    robbingQuad: false,
    lastWall: false,
    initial: false,
    lastCopy: false,
    ...extra,
  });

/** The track's worked hand: characters 1-2-3 and 4-5-6, circles 1-2-3
 * and 4-5-6, bamboo 7-8-9, and a pair of East. Won by drawing the 6 of
 * circles, it earns exactly three tai (concealed self-draw only). */
const WORKED = "123456m123456p789s11z";
/** The same hand one tile earlier: the 4 and 5 of circles are unfinished. */
const WORKED_READY = "123456m12345p789s11z";
/** Lesson 2's counted hand: the East triplet was claimed; the rest is
 * sequences, a pair of 2 of circles, and the 4 and 5 of circles. */
const MINI = "123456m12223456p111z";
/** Lesson 7's hand: four sequences, an East triplet, and a single white
 * dragon that only a second white dragon can complete. */
const UNIQUE_HAND = "123456m123p789s111z55z";
/** Lesson 5's first counting check: three concealed triplets of
 * characters, two sequences and a pair of white dragons, won on a
 * discard of the 9 of bamboo. Earns three tai. */
const COUNT_TRIPLETS = "111222333m456p789s55z";
/** Lesson 5's all-triplets hand: five triplets and a pair of green
 * dragons, won on a discard of the third South wind. Earns eleven tai. */
const ALL_TRIPLETS = "333m555p777s999s222z66z";
/** Lesson 6's suit-pattern counting check: circles with honors, won on
 * a discard of the 9 of circles. Earns six tai. */
const HALF_FLUSH_NEW = "111234567p789p222z33z";
/** Lesson 6's one-suit counting check: bamboo only, won on a discard
 * of the 9 of bamboo. Earns eleven tai. */
const FULL_FLUSH_NEW = "123s234s456s789s111s55s";
/** Lesson 7's all-claimed counting check: every set claimed, the pair
 * of North winds completed by a discard. Earns four tai. */
const ALL_CLAIMED_NEW = "345m234p678s555777z44z";
const ALL_CLAIMED_MELDS = [
  { kind: "chi", tiles: [2, 3, 4] },
  { kind: "chi", tiles: [10, 11, 12] },
  { kind: "chi", tiles: [23, 24, 25] },
  { kind: "pon", tiles: [31, 31, 31] },
  { kind: "pon", tiles: [33, 33, 33] },
] as const;
/** Lesson 8's replacement counting check: an added quad of the 2 of
 * bamboo, won on the replacement draw. Earns five tai. */
const REPLACEMENT_NEW = "123456m123p2222s333z55z";
/** Lesson 8's last-tile counting check: an East triplet was claimed
 * and the hand was won by drawing the last ordinary tile. Three tai. */
const LAST_DRAW_NEW = "123456m123456p111z99s";
/** Lesson 8's first-draw counting check: five sequences and a pair of
 * East winds, completed by a non-dealer's very first draw. Sixteen tai. */
const FIRST_DRAW_NEW = "123456m123p456p789s11z";
/** Lesson 9's first transfer hand: three concealed triplets of
 * circles, a claimed South triplet, won by self-draw. Four tai. */
const TRANSFER_ONE = "111222333p789s222z55z";
/** Lesson 9's second transfer hand: characters with honors, the East
 * triplet claimed, the pair of West winds completed by a discard.
 * Seven tai. */
const TRANSFER_TWO = "123456789m111z222z33z";

export const TAIWANESE_LESSONS: VariantLesson[] = [
  lesson("tiles", "Tiles, suits and the sixteen-tile hand", [
    {
      text: "Taiwanese mahjong is played with tiles. The printed side of a tile is its face. The tiles come in three suits — three groups that share one kind of face. The first suit is characters, numbered 1 to 9 and shown here in order. A characters tile has a two-part face: the dark character on top is the number, and the red mark below is the same on every characters tile. Read the row left to right: 1, 2, 3, and so on to 9.",
      tiles: "123456789m",
    },
    {
      text: "The number is in the face itself, not in where the tile sits. Out of order, the four faces shown here read 7, 3, 9 and 5. The drills later in this lesson ask you to read single faces on their own, the way you will meet them in a hand.",
      tiles: "7m3m9m5m",
    },
    {
      text: "The second suit is circles, numbered 1 to 9 and shown here in order. Read a circles tile by counting its circles: the number of circles is the tile's number. The first tile shows one large circle, the last shows nine.",
      tiles: "123456789p",
    },
    {
      text: "The third suit is bamboo, numbered 1 to 9 and shown here in order. Read a bamboo tile by counting its green sticks: the number of sticks is the tile's number. One exception: the 1 of bamboo, first in this row, is a picture of a bird — it has no sticks to count.",
      tiles: "123456789s",
    },
    {
      text: "Seven tiles belong to no suit. They are honors, and they have no numbers. The first four are winds, named East, South, West and North in the order shown; each wind's face is a single dark character. The last three are dragons: the white dragon's face is blank inside a frame, the green dragon's face is a green character, and the red dragon's face is a red character. Honors can never be part of a numbered run.",
      tiles: "1234567z",
    },
    {
      text: "Each wind has its own face, and the name belongs to the face, not to its place in a row. Out of order, the four wind faces shown here read West, East, North and South.",
      tiles: "3z1z4z2z",
    },
    {
      question: pick(
        "honors-pick",
        "Tap every honor tile in this row.",
        "5m3p1z7z",
        [2, 3],
        "The East wind and the red dragon are honors. The 5 of characters and the 3 of circles are suited tiles — each carries a suit and a number.",
        "Honors are the tiles with no suit and no number: the four winds and the three dragons. Suited tiles always show a number in one of the three suits.",
      ),
    },
    {
      question: choice(
        "wind-name",
        "Which wind does this face show?",
        ["East", "South", "West", "North"],
        2,
        "That face is the West wind. Each of the four winds has its own face — they do not share one.",
        "Compare this face with the four wind faces from the honors step, one at a time, until one matches it exactly.",
        { tiles: "3z" },
      ),
    },
    {
      question: pick(
        "wind-pick-north",
        "Tap the North wind.",
        "2z1z4z3z",
        [2],
        "The third tile in the row is the North wind. The row is shuffled, so the face itself — not its place — gives the name.",
        "Hold the four wind faces from the honors step in mind and match each tile in this row against them, one at a time.",
      ),
    },
    {
      question: pick(
        "wind-pick-east",
        "Tap the East wind.",
        "3z4z2z1z",
        [3],
        "The last tile in the row is the East wind — the first wind named in the honors step, here sitting at the end of a shuffled row.",
        "Match faces, not places: find the tile whose face is the same as the East face from the honors step.",
      ),
    },
    {
      question: pick(
        "wind-pick-south",
        "Tap the South wind.",
        "4z3z1z2z",
        [3],
        "The last tile in the row is the South wind. In a shuffled row each wind still carries its own name on its own face.",
        "Work along the row comparing each face with the South face from the honors step.",
      ),
    },
    {
      question: choice(
        "char-number",
        "What number does this characters tile show?",
        ["Five", "Six", "Seven", "Eight"],
        2,
        "The tile shows seven: the dark character at the top of the face is the number seven, written as a character.",
        "The number is the dark character at the top of the face. Compare it with the characters row from the first step, where the faces run 1 to 9.",
        { tiles: "7m" },
      ),
    },
    {
      question: pick(
        "char-pick-six",
        "Tap the 6 of characters.",
        "8m3m6m5m1m",
        [2],
        "The middle tile is the 6 of characters. The row is shuffled — the number was read from the face, not from counting along the row.",
        "Read the top character on each face in the row until one reads six. The red mark below is the same on every characters tile and carries no number.",
      ),
    },
    {
      question: pick(
        "char-pick-two",
        "Tap the 2 of characters.",
        "4m9m2m7m",
        [2],
        "The third tile is the 2 of characters, read from its own face in a shuffled row.",
        "Read each face's top character in turn. One of them is the number two written as a character.",
      ),
    },
    {
      text: "A hand is built from sets and a pair. A set is a small group of tiles that go together, in one of the shapes in this step. A sequence is three tiles in a row in one suit, like the 3, 4 and 5 of circles shown first here. A triplet is three copies of the same tile, like the three copies of the 9 of bamboo. A pair is two copies of the same tile, like the two East winds at the end. A sequence can only use one suit — numbers from different suits cannot be mixed in one sequence.",
      tiles: "345p999s11z",
    },
    {
      text: "One more kind of set: a quad is four copies of the same tile, like the four copies of the 2 of bamboo shown here. A quad counts as one set, even though it holds four tiles. Because the fourth tile is extra, you draw one more tile to make up for it when you declare a quad — declare means announce that you have it — and that extra draw is a replacement tile, a tile drawn to make up the number. Quads are covered in full in the quad lesson.",
      tiles: "2222s",
    },
    {
      text: "There are also eight tiles that never join a set or the pair: four plants — plum, orchid, chrysanthemum and the bamboo plant — and four seasons — spring, summer, autumn and winter. Together they are called flowers. When a flower comes to you, you set it aside face-up beside your hand and draw another tile in its place, so your hand keeps its proper size. A tile sitting face-up beside a hand like that is exposed — exposed means shown where every player can see it. There are four copies of each of the 34 ordinary kinds — 136 tiles — plus the eight flowers: 144 tiles in all.",
    },
    {
      text: "In Taiwanese mahjong you hold sixteen tiles between turns, and you win with seventeen: five sets and a pair. The pictured hand is a complete one. Read it group by group: 1, 2, 3 of characters and 4, 5, 6 of characters; 1, 2, 3 of circles; 7, 8, 9 of bamboo; three East winds; and a pair of white dragons — two white dragons. That is five sets and a pair, seventeen tiles.",
      hand: "123456m123p789s111z55z",
    },
    {
      question: choice(
        "shape",
        "How many sets are in the pictured hand?",
        ["Three sets", "Four sets", "Five sets", "Six sets"],
        2,
        "Five sets: the 1, 2, 3 of characters, the 4, 5, 6 of characters, the 1, 2, 3 of circles, the 7, 8, 9 of bamboo, and the three East winds. The two white dragons are the pair, not a set.",
        "Count the groups of three in the pictured hand, one group at a time, and keep the pair separate — a pair is two tiles, not a set.",
        {
          tiles: "123456m123p789s111z55z",
          verify: () =>
            standardShapes(parseCounts("123456m123p789s111z55z"), [], 5)[0]
              ?.groups.length === 5
              ? "Five sets"
              : "invalid",
        },
      ),
    },
  ]),
  lesson("profile", "The dealer, the winds and how hands score", [
    {
      text: "Hands score in tai. A tai is a scoring unit: a hand earns tai for what it contains and for how it was won, the tai are added together, and the total is later turned into points. Tai never multiply anything — two awards of one tai and two tai are simply three tai in all. For example, the three red dragons shown here are a dragon triplet, and a dragon triplet earns one tai.",
      tiles: "777z",
    },
    {
      text: "Three everyday ways to earn tai, each shown or named here. Every flower you set aside earns one tai, whichever plant or season it is. A triplet of any wind earns one tai — the three East winds shown here earn one. And a triplet of any dragon earns one tai, like the red dragons in the step before this one.",
      tiles: "111z",
    },
    {
      text: "Now count one small hand all the way to a payment. The pictured hand holds: 1, 2, 3 of characters and 4, 5, 6 of characters; 1, 2, 3 of circles, a pair of the 2 of circles, and the 4 and 5 of circles; and three East winds, which were claimed — taken by this player from a tile another player had put out, to complete the triplet — and are shown with the hand. Another player then discarded the 6 of circles — put it out face-up on their turn — completing the 4, 5 and 6 of circles. The hand's only tai is its East triplet: one tai. A hand's payment is a base of 30 points plus 10 points for each tai, so the player who discarded the winning tile pays 30 plus 10 — 40 points.",
      hand: MINI,
    },
    {
      question: choice(
        "mini-price",
        "A new hand earns two tai and is won on another player's discard. How much does the discarder pay?",
        ["30 points", "40 points", "50 points", "60 points"],
        2,
        "The payment is the base of 30 plus 10 for each tai: 30 plus 2 times 10 is 50 points, paid by the discarder alone.",
        "Start from the base payment and add ten points for each tai the hand earned. Only the discarder pays when a hand is won on a discard.",
        {
          verify: () =>
            String(
              taiwanesePayments(2, {
                winner: 1,
                payer: 2,
                selfDraw: false,
                dealer: 0,
                dealerRepeats: 0,
              })[0]!.amount,
            ) === "50"
              ? "50 points"
              : "invalid",
        },
      ),
    },
    {
      text: "Four players sit around the table, and each player holds a seat wind for the hand being played. The player who deals the hand — the dealer — holds East. Going around the table in the order play passes, the other players hold South, then West, then North. The four faces shown here are the seat winds in that table order: East, South, West, North. Your seat wind changes as the deal passes from player to player. Picture the four seats around a square table in the order the pictured winds run: the dealer sits at East, the player whose turn comes next sits at South, the player across from the dealer sits at West, and the last player sits at North. That is how you know your own seat wind: find the dealer, then count seats in turn order from East. If you dealt, you are East; if the player just before you in turn order dealt, you are North. Your seat wind is yours for one deal only — when the deal passes, every seat wind moves with it. One deal of play is called a hand, as well as the tiles a player holds.",
      tiles: "1234z",
    },
    {
      text: "A game is played in rounds, and each round is named by a wind: the round wind. The game begins with the East round, then comes the South round, then West, then North. During the East round, every hand is an East-round hand, whoever deals it. At this table the seat wind and the round wind do not change what a wind triplet earns: every wind triplet earns one tai, as the everyday awards said. The round wind stays the same while each of the four players deals once — four deals in a row share one round wind — and then the next round begins. A hand label like East 1 names the round wind first and then which deal of the round it is: East 1 is the first deal of the East round. And the worth of a wind triplet in tai, concretely: if you are the dealer — East seat — in the South round, a triplet of East (your seat wind), a triplet of South (the round wind) and a triplet of any other wind each earn exactly one tai. No wind triplet earns two tai for matching your seat or the round, and a pair of any wind earns nothing.",
      tiles: "1234z",
    },
    {
      question: pick(
        "dealer-wind-pick",
        "Tap the seat wind the dealer holds.",
        "3z2z4z1z",
        [3],
        "The last tile in the row is East, and the dealer holds East as a seat wind in every round. The row is shuffled — the name was read from the face.",
        "Two facts meet here: which wind the dealer always holds, and which face in this shuffled row carries that name. Match the faces one at a time.",
      ),
    },
    {
      question: choice(
        "char-number-seat",
        "What number does this characters tile show?",
        ["Three", "Four", "Five", "Six"],
        1,
        "The tile shows four — the dark character at the top of the face is the number, read from the face itself.",
        "Read the dark character at the top of the face and compare it with the characters faces from the tiles lesson.",
        { tiles: "4m" },
      ),
    },
    {
      text: "The dealer does not always pass the deal on. When the dealer wins a hand, or when a hand ends with no winner, the same player deals again. Each time the dealer deals again like this is one repeat, and the repeats are counted: first repeat, second repeat, and so on. When a player who is not the dealer wins, the deal passes to the next player and the repeat count starts again at zero. The repeat count matters later, when payments are worked out.",
    },
    {
      question: choice(
        "seat-round",
        "During the South round, you are the dealer. What is your seat wind, and what is the round wind?",
        [
          "Seat wind East, round wind South",
          "Seat wind South, round wind East",
          "Seat wind South, round wind South",
          "Seat wind West, round wind South",
        ],
        0,
        "The dealer always holds East as a seat wind, in every round. The round wind is the wind the current round is named by — South in the South round.",
        "Separate the two winds. Your seat wind follows the deal: the dealer holds one particular wind in every round. The round wind is the wind the round itself is named by.",
      ),
    },
    {
      text: "A few things about this table, stated plainly as house rules. Every flower earns its tai the same way, and every wind triplet earns its tai the same way — no wind or flower is worth more because of your seat. You never have to announce that your hand is one tile away before you may win, and your hand stays free to change until it wins. Collecting all eight flowers does not win by itself: you still need five sets and a pair. Each player starts a game with 1,000 points.",
    },
  ]),
  lesson("turns", "Turns, claims and the swap ban", [
    {
      text: "Play passes in seat order: East, South, West, North, and back to East. On your turn you draw one tile — the pictured sixteen tiles become seventeen — and then you discard one tile, placing it face-up where everyone can see it. The pictured hand is a hand between turns: 1 to 6 of characters, 1 to 5 of circles, 7, 8 and 9 of bamboo, and a pair of East winds.",
      hand: WORKED_READY,
    },
    {
      text: "There are two ways to win a hand. A discard win: you complete your hand with a tile another player has just discarded. A self-draw: you complete your hand with a tile you drew yourself on your turn. Both ways need the same complete shape — five sets and a pair — but they are paid differently, as the payment lesson shows.",
    },
    {
      text: "When a tile is discarded, another player may claim it to complete a set. A win claim comes before every other claim. After that, a triplet or quad claim comes before a sequence claim. Any other player holding the matching tiles may claim a discard for a triplet or a quad. A sequence claim is narrower: only the player whose turn comes immediately after the discarder may claim for a sequence, and only when they already hold the other two numbers of that sequence in the same suit. After claiming a sequence or a triplet, you discard without drawing. After claiming a quad, you first draw a replacement tile.",
      tiles: "222p",
    },
    {
      text: "A set you claim is shown face-up beside your hand, like the 3, 4 and 5 of characters shown here, and it cannot be changed later. A claimed set shown like that is also called a meld, or a declared set — the same set under another name — and a quad you declare is a meld too. Tiles that stay in your hand, where only you can see them, are concealed tiles. A hand with no claimed sets at all is a concealed hand. A hand with one or more claimed sets is an open hand. Claiming is what opens a hand — drawing and discarding never do.",
      tiles: "345m",
    },
    {
      text: "One ban follows every claim: you may not discard at once a tile that simply swaps places with the set you just claimed. After claiming a triplet, you may not immediately discard that same kind of tile. After claiming a sequence, you may not immediately discard the tile you took, or the tile at the other end of the same sequence. The pictured tiles are the 3, 4 and 5 of circles: if you claimed the 3 with your 4 and 5, you may not now discard a 3 of circles or a 6 of circles — the 6 would rebuild the same sequence one step along.",
      tiles: "345p",
    },
    {
      question: choice(
        "swap",
        "You claimed the 3 of circles using your 4 and 5 of circles. Which tile may you discard now?",
        [
          "The 3 of circles",
          "The 6 of circles",
          "The 9 of bamboo",
          "Either the 3 or the 6 of circles",
        ],
        2,
        "The 9 of bamboo may be discarded. The 3 of circles is the tile you took, and the 6 of circles sits at the other end of the same sequence — both are banned as your immediate discard after that claim.",
        "After a sequence claim, two discards are banned: the tile you took, and the tile at the other end of that same sequence. Any other tile in your hand may be discarded.",
        { tiles: "345p" },
      ),
    },
    {
      text: "A complete hand is eligible to win. Eligible means the hand may be declared a win: it has five sets and a pair and was completed in one of the two ways. There is no minimum tai. A complete hand that earns no tai at all is still eligible, and it still collects the base payment of 30 points. Tai change how much a win is paid — never whether a complete hand may win.",
    },
    {
      question: choice(
        "zero-eligible",
        "A player completes five sets and a pair, and the hand earns no tai at all. Can the hand win?",
        [
          "Yes — a complete hand can win with no tai, and it collects the base payment",
          "No — a hand needs at least one tai to win",
          "No — a hand needs at least three tai to win",
          "Only when the hand was won on a discard",
        ],
        0,
        "A complete hand is eligible with no tai at all. It collects the base payment of 30 points from the discarder on a discard win.",
        "Eligibility is about the shape being complete — five sets and a pair. Tai change the size of the payment, not whether a complete hand may win.",
        {
          verify: () =>
            scored("123456m234p567789s11z", {
              winningTile: 26,
              melds: [{ kind: "chi", tiles: [0, 1, 2] }],
            }).eligible &&
            scored("123456m234p567789s11z", {
              winningTile: 26,
              melds: [{ kind: "chi", tiles: [0, 1, 2] }],
            }).units === 0
              ? "Yes — a complete hand can win with no tai, and it collects the base payment"
              : "invalid",
        },
      ),
    },
    {
      text: "Two smaller claim rules complete the picture. If you pass up the chance to claim a discard for a triplet, you may not then claim a later discard of the same kind for a triplet or a quad until you have had an ordinary drawing turn. And near the end of a hand, when fewer than four tiles are left to draw, ordinary sequence, triplet and quad claims stop — win claims are still allowed.",
    },
  ]),
  lesson("flowers", "The deal, flowers and replacements", [
    {
      text: "A game starts with the setup. All the tiles are shuffled face-down and built into a wall: long rows of tiles standing in front of the players. Each player draws sixteen tiles from the wall, and the dealer draws one more, so the dealer starts with seventeen and discards first. The pictured sixteen tiles are one player's dealt hand: 1 to 6 of characters, 1 to 5 of circles, 7, 8 and 9 of bamboo, and a pair of East winds. Ordinary draws during play come from one end of the wall. The tiles still left to draw during a hand are called the live wall: when a game shows a count of tiles left, it is counting the live wall.",
      hand: WORKED_READY,
    },
    {
      text: "Flowers are dealt with right after the deal. If your dealt tiles include a flower — a plant or a season — you set it aside face-up beside your hand and draw a replacement from the far end of the wall. Players do this in turn order. If a replacement tile is itself a flower, it is set aside on the next round of replacements, so every player gets a turn. During play the same thing happens at once: a flower you draw is set aside and replaced straight away. Your hand keeps its proper size throughout — a flower never takes the place of an ordinary tile in your hand.",
    },
    {
      text: "The far end of the wall has a name: the last sixteen tiles there are the reserve. Ordinary draws never touch the reserve. The reserve exists only to supply replacement draws — the extra tiles drawn for flowers and for quads. When the ordinary tiles run out, no more replacements can be made, because the reserve is not a supply of ordinary draws.",
    },
    {
      text: "Flowers earn tai, as the table lesson said: every flower or season you set aside earns one tai, whichever plant or season it is. If you set aside all four plants, or all four seasons, that adds two more tai on top of the four single ones. If you set aside all eight flowers, they earn eight tai in total instead of the separate amounts — and, as the house rules said, you still need five sets and a pair to win. On a win's list of awards, a complete set of four like the four plants is named a complete flower or season quartet — a quartet is a complete set of four — and the all-eight award is named Eight Immortals.",
    },
    {
      question: choice(
        "quartet",
        "A winner set aside all four plants and no seasons. How many tai do the flowers earn?",
        ["4 tai", "6 tai", "8 tai", "10 tai"],
        1,
        "Each of the four plants earns one tai, and the complete set of four plants adds two more: six tai in all.",
        "Count each plant on its own first. Then add what completing the full set of four plants adds on top.",
        {
          verify: () =>
            `${scored(UNIQUE_HAND, { flowers: [34, 35, 36, 37] })
              .patterns.filter((p) => p.id.startsWith("tw-flower"))
              .reduce((n, p) => n + p.units, 0)} tai`,
        },
      ),
    },
    {
      text: "A hand can also end with no winner: the live wall runs out and nobody has completed a hand. That is a drawn hand. In a drawn hand nobody is paid anything. The same dealer then deals the next hand — the dealer repeats, in the sense the table lesson defined: a hand with no winner is one of the two results that keep the same dealer on.",
    },
    {
      question: choice(
        "drawn-hand",
        "The ordinary tiles run out and no player has won. What happens?",
        [
          "Nobody is paid, and the same dealer deals again as a repeat",
          "The player holding the most tai is paid",
          "Each hand is paid for the sets it contains",
          "The deal passes, and the last discarder pays the base",
        ],
        0,
        "A drawn hand pays nobody. The dealer deals again — a repeat — just as when the dealer wins.",
        "A drawn hand has no winner to pay. Think about the deal instead: a hand with no winner is one of the results that keep the same dealer on, with the repeat count rising.",
        {
          verify: () =>
            createTaiwaneseAdapter().progression(null, 0, 0).repeat
              ? "Nobody is paid, and the same dealer deals again as a repeat"
              : "invalid",
        },
      ),
    },
  ]),
  lesson("tai", "Everyday tai: how a hand earns more", [
    {
      text: "The first everyday award is for keeping a hand concealed. The pictured hand is a complete hand: 1, 2, 3 and 4, 5, 6 of characters; 1, 2, 3 and 4, 5, 6 of circles; 7, 8, 9 of bamboo; and a pair of East winds. Nothing in it was claimed — and it was won on another player's discard of the 6 of circles. A concealed hand won on a discard earns one tai. That is this hand's only tai: a pair earns nothing, and three suits earn no suit award.",
      hand: WORKED,
    },
    {
      text: "The matching award is for winning on your own draw. The pictured hand claimed its three East winds, so it is an open hand. This time the player drew the winning 6 of circles themself, completing the 4, 5 and 6 of circles. A self-draw earns one tai. Added to the East triplet's one tai, this hand earns two tai in all.",
      hand: MINI,
    },
    {
      text: "Honor triplets carry their own everyday price, pictured here: three South winds and three red dragons. A triplet of any wind earns one tai — East, South, West or North, whichever wind it is and wherever you sit. A triplet of any dragon also earns one tai — white, green or red. Each of the two triplets pictured here therefore earns one tai. A pair of a wind or a dragon earns nothing: the price is for three of a kind.",
      tiles: "222z777z",
    },
    {
      text: "When a hand is both concealed and won by self-draw, the two awards are replaced by one combined award: a concealed self-draw earns three tai in total. Take the hand from the first step of this lesson and change only how it was won — the player drew the 6 of circles themself. The hand earns three tai, all from the combined award. Do not add the separate concealed tai and the separate self-draw tai on top of the three: the combined award replaces them. This is the track's clearest counting rule — bigger awards replace the smaller ones inside them; they never stack.",
      hand: WORKED,
    },
    {
      question: choice(
        "concealed-self",
        "How many tai does the combined concealed self-draw award give, in total?",
        ["1 tai", "2 tai", "3 tai", "5 tai"],
        2,
        "Three tai in total. The combined award replaces the separate concealed-hand tai and the separate self-draw tai — it is not added to them.",
        "The combined award replaces the two separate awards it contains. Adding the parts on top of the combined amount would count the same features twice.",
        {
          tiles: WORKED,
          verify: () =>
            `${scored(WORKED, { winningTile: 14, selfDraw: true }).patterns.find((p) => p.id === "tw-concealed-self")?.units} tai`,
        },
      ),
    },
    {
      text: "Triplets you build in your hand, without claiming, are concealed triplets — the three shown here are triplets of the 1, the 2 and the 3 of characters. Concealed triplets earn tai by count: three concealed triplets earn two tai, four earn five tai, and five earn eight tai. Only the highest amount counts — five concealed triplets earn eight, not two plus five plus eight. One caution: a triplet completed by the winning discard does not count as concealed for this award, even when the rest of the hand is concealed, because that triplet was completed by a tile another player threw.",
      tiles: "111222333m",
    },
    {
      question: choice(
        "tier",
        "A hand has five concealed triplets. How many tai does the concealed-triplet award give?",
        ["2 tai", "5 tai", "8 tai", "15 tai"],
        2,
        "Eight tai. The three amounts — two, five and eight — are alternatives for three, four and five concealed triplets. Only the highest one that fits is counted.",
        "The concealed-triplet amounts replace each other as the count rises. Take the single amount that matches the number of concealed triplets; do not add the lower amounts to it.",
        {
          verify: () =>
            `${scored("111m222p333s111222z55z", { winningTile: 31, selfDraw: true }).patterns.find((p) => p.id === "tw-concealed-pungs")?.units} tai`,
        },
      ),
    },
    {
      text: "Now count a hand you have not seen before. The pictured hand is: three triplets of characters — one each of the 1, the 2 and the 3; the 4, 5 and 6 of circles; the 7, 8 and 9 of bamboo; and a pair of white dragons. Nothing in it was claimed, and it was won on another player's discard of the 9 of bamboo, which completed the bamboo sequence.",
      hand: COUNT_TRIPLETS,
    },
    {
      hand: COUNT_TRIPLETS,
      question: choice(
        "count-triplets",
        "How many tai does this hand earn in all?",
        ["2 tai", "3 tai", "4 tai", "5 tai"],
        1,
        "Three tai: the three concealed triplets earn two tai, and the concealed hand won on a discard earns one tai. The white dragons are only a pair, so no dragon tai — and the hand holds an honor, so the award for having no honors does not apply.",
        "Count in the order this lesson taught: first the concealed triplets and what their number earns, then how the hand was kept and won. A pair earns nothing by itself.",
        {
          verify: () =>
            `${scored(COUNT_TRIPLETS, { winningTile: 26 }).units} tai`,
        },
      ),
    },
    {
      text: "One more everyday award ties the triplet family together, and this time it is pictured in a hand. The pictured hand is: triplets of the 3 of characters, the 5 of circles, the 7 of bamboo and the 9 of bamboo; a triplet of South winds; and a pair of green dragons. All five sets are triplets. A hand whose five sets are all triplets or quads earns four tai for being all triplets — on top of what its triplets earn in the other awards. Wind triplets and dragon triplets still earn their one tai each inside such a hand, and the concealed-triplet count still applies to the triplets that were never claimed. The pair earns nothing.",
      hand: ALL_TRIPLETS,
    },
    {
      hand: ALL_TRIPLETS,
      question: choice(
        "count-all-triplets",
        "That pictured hand was won on another player's discard of the third South wind, which completed the South triplet. Nothing in the hand was claimed. How many tai does it earn in all?",
        ["8 tai", "9 tai", "11 tai", "13 tai"],
        2,
        "Eleven tai: four for being all triplets; five for the concealed triplets — the South triplet was completed by the winning discard, so it does not count as concealed, and the remaining four concealed triplets earn five tai; one for the South wind triplet; and one for the concealed hand won on a discard.",
        "Work award by award: all triplets first, then the concealed-triplet count — remembering that a triplet completed by the winning discard is not concealed — then the wind triplet, then how the hand was kept and won.",
        {
          verify: () =>
            `${scored(ALL_TRIPLETS, { winningTile: 28 }).units} tai`,
        },
      ),
    },
  ]),
  lesson("structure", "One tile away, and suit patterns", [
    {
      text: "A hand that needs only one more tile to be complete is ready — it is one tile away. The tiles that would complete it are its waits. The pictured hand is ready: 1, 2, 3 and 4, 5, 6 of characters are complete; 1, 2, 3 of circles and 7, 8, 9 of bamboo are complete; the pair of East winds is complete. Only the 4 and 5 of circles are unfinished. This hand's waits are the 3 of circles and the 6 of circles — either one completes the hand. Ready is only a description: nobody announces it, nothing is locked, and the hand can still change as tiles come and go.",
      hand: WORKED_READY,
    },
    {
      text: "Waits come in kinds, named by what is unfinished. A two-sided wait is an open-ended pair of numbers like the 4 and 5 of circles: two different tiles complete it, one at each end. An edge wait sits at the end of a suit — the 1 and 2 shown here can only be completed by the 3, and an 8 and 9 only by the 7 — so only one tile completes it. A middle wait (also called a closed wait) is the two ends of a sequence with the middle missing, like a 2 and a 4 waiting only for the 3. A pair wait is a single tile waiting for its matching tile to make the pair.",
      tiles: "12p",
    },
    {
      hand: WORKED_READY,
      question: pick(
        "wait-pick",
        "The pictured hand is ready. Tap every tile in this row that would complete the hand.",
        "3m3p6p9s5z",
        [1, 2],
        "The 3 of circles and the 6 of circles complete the hand: each finishes the 4 and 5 of circles as a sequence. The 3 of characters completes nothing — the characters are already in complete sets — the 9 of bamboo is already part of a complete set, and a white dragon has no matching tile in this hand.",
        "Look at the one unfinished part of the pictured hand — the 4 and 5 of circles — and at which numbers would finish a sequence with them, at either end. The pair of East winds is already complete.",
      ),
    },
    {
      text: "Some awards turn on how a hand was waiting. The pictured hand is five sequences and a pair: 1, 2, 3 and 4, 5, 6 of characters; 2, 3, 4 of circles; 5, 6, 7 and 7, 8, 9 of bamboo; and a pair of the 2 of circles. It was won on a discard of the 9 of bamboo, which completed the 7, 8 and 9 of bamboo — a two-sided wait, since the 6 of bamboo would also have completed it. Five sequences with a pair from a suit, no honors, no flowers set aside, and a two-sided discard win like this earn the All Sequences award: two tai. A self-draw, completing the pair, or a wait on only one kind of tile would not have earned it.",
      hand: "123456m234p567789s22p",
    },
    {
      text: "That same pictured hand earns one more everyday award: it contains no honor tiles and no flowers were set aside, which earns two tai. And it was a concealed hand won on a discard, which earns one tai. So its full count can now be added up: two for All Sequences, two for having no honors and no flowers, and one for the concealed discard win — five tai in all. This is how a real count works: name each award the hand actually has, apply any replacement, and add what remains.",
    },
    {
      question: choice(
        "sequences-total",
        "How many tai does the pictured hand earn in all?",
        ["2 tai", "3 tai", "5 tai", "7 tai"],
        2,
        "Five tai: two for All Sequences, two for having no honors and no flowers, and one for the concealed hand won on a discard.",
        "Add the three awards the last two steps named for this hand: the sequences award, the award for having no honors and no flowers, and the concealed-hand award.",
        {
          tiles: "123456m234p567789s22p",
          verify: () =>
            `${scored("123456m234p567789s22p", { winningTile: 26 }).units} tai`,
        },
      ),
    },
    {
      text: "Suit patterns pay more for narrower hands. The pictured hand uses one numbered suit with honors: 1, 2, 3, 4, 5, 6, 7, 8 and 9 of characters; three East winds; three South winds; and a pair of North winds. One numbered suit together with honors earns four tai. The same shape with no honors at all — one suit only — earns eight tai. A hand of honors only, with no numbered suit, also earns eight tai. These three are alternatives: a hand earns only the one that matches it, never two of them added together. On a win's list of awards, the one-suit-only award is named Full flush — flush is the list's word for a hand built from a single suit — and the honors-only award is named All Honors.",
      hand: "123456789m11122233z",
    },
    {
      text: "The largest honor patterns follow the same replacement rule. The pictured hand holds three white dragons, three green dragons, and a pair of red dragons, with three sequences: that is Little Three Dragons — two dragon triplets with the third dragon as the pair — earning four tai, which replaces the two separate dragon-triplet tai inside it. Three dragon triplets earn Big Three Dragons, eight tai, replacing all three separate awards. Three wind triplets with the fourth wind as the pair earn eight tai, named Little Four Winds on the awards list, and four wind triplets earn sixteen tai, named Big Four Winds — each replacing the separate wind-triplet tai inside it.",
      hand: "555666z123m456p789s77z",
    },
    {
      text: "Count the suit patterns on a hand you have not seen before. The pictured hand is circles with honors: a triplet of the 1 of circles; the 2, 3, 4 of circles; the 5, 6, 7 of circles; the 7, 8, 9 of circles; a triplet of South winds; and a pair of West winds. Nothing in it was claimed, and it was won on another player's discard of the 9 of circles.",
      hand: HALF_FLUSH_NEW,
    },
    {
      hand: HALF_FLUSH_NEW,
      question: choice(
        "count-half-flush",
        "How many tai does this hand earn in all?",
        ["4 tai", "5 tai", "6 tai", "8 tai"],
        2,
        "Six tai: four for one numbered suit together with honors, one for the South wind triplet, and one for the concealed hand won on a discard. The West winds are only a pair, so they earn nothing.",
        "Name each award this hand has, in the order the track taught them: the suit pattern first, then any honor triplet, then how the hand was kept and won.",
        {
          verify: () =>
            `${scored(HALF_FLUSH_NEW, { winningTile: 17 }).units} tai`,
        },
      ),
    },
    {
      text: "One suit narrower still, on another new hand. The pictured hand is bamboo only: the 1, 2, 3 of bamboo; the 2, 3, 4 of bamboo; the 4, 5, 6 of bamboo; the 7, 8, 9 of bamboo; a triplet of the 1 of bamboo; and a pair of the 5 of bamboo. Nothing in it was claimed, no flowers were set aside, and it was won on another player's discard of the 9 of bamboo.",
      hand: FULL_FLUSH_NEW,
    },
    {
      hand: FULL_FLUSH_NEW,
      question: choice(
        "count-full-flush",
        "How many tai does this hand earn in all?",
        ["8 tai", "9 tai", "11 tai", "13 tai"],
        2,
        "Eleven tai: eight for one suit only, two for having no honors and no flowers set aside, and one for the concealed hand won on a discard.",
        "Three awards meet in this hand: the suit pattern at its narrowest, the award for what the hand does not contain, and the way it was kept and won.",
        {
          verify: () =>
            `${scored(FULL_FLUSH_NEW, { winningTile: 26 }).units} tai`,
        },
      ),
    },
  ]),
  lesson("waits", "Waits that pay, and passed wins", [
    {
      text: "A one-kind wait pays. If only one kind of tile could complete a ready hand, winning earns one extra tai. The pictured hand shows why: 1, 2, 3 and 4, 5, 6 of characters; 1, 2, 3 of circles; 7, 8, 9 of bamboo; three East winds; and a single white dragon. Only a second white dragon completes this hand — a pair wait with one possible kind. Edge waits and middle waits can also be one-kind waits. A two-sided wait can never be one, because two kinds of tile complete it. On a win's list of awards, this one-kind award is named Unique edge, closed or pair wait: unique because only one kind of tile could complete the hand.",
      hand: "123456m123p789s111z5z",
    },
    {
      question: choice(
        "unique-count",
        "The pictured hand was completed by the white dragon, on another player's discard. How many tai does it earn in all?",
        ["1 tai", "2 tai", "3 tai", "5 tai"],
        2,
        "Three tai: one for the East triplet, one for the concealed hand won on a discard, and one for the one-kind wait — only the white dragon could complete the hand.",
        "Count three separate things in the pictured hand: its honor triplet, the way the hand was kept, and the kind of wait it was won on.",
        {
          tiles: UNIQUE_HAND,
          verify: () => `${scored(UNIQUE_HAND, { winningTile: 31 }).units} tai`,
        },
      ),
    },
    {
      text: "The opposite shape also pays. If all five sets were claimed and shown, and the pair is then completed by another player's discard, the hand earns two tai for being all claimed. The pictured tiles show such a hand's shape: 1, 2, 3 of characters; 4, 5, 6 of circles; 7, 8, 9 of bamboo; three East winds; three South winds; and a pair of North winds — every set claimed, the pair finished by a discard. The two tai replace the one-kind-wait tai rather than adding to it, even when the pair was the hand's only wait.",
      hand: "123m456p789s111222z33z",
    },
    {
      text: "Count that shape on a new hand. The pictured hand's five sets were all claimed and shown: the 3, 4, 5 of characters; the 2, 3, 4 of circles; the 6, 7, 8 of bamboo; three white dragons; and three red dragons. Its pair of North winds was then completed by another player's discard of a North wind.",
      hand: ALL_CLAIMED_NEW,
    },
    {
      hand: ALL_CLAIMED_NEW,
      question: choice(
        "count-all-claimed",
        "How many tai does this hand earn in all?",
        ["2 tai", "3 tai", "4 tai", "6 tai"],
        2,
        "Four tai: two for being all claimed — every set claimed and shown, the pair finished by a discard — and one each for the white dragon triplet and the red dragon triplet. The all-claimed award replaces the one-kind-wait tai, so the pair wait adds nothing more.",
        "Count the award for how the sets were gathered first, then the honor triplets. Remember what the all-claimed award replaces.",
        {
          verify: () =>
            `${scored(ALL_CLAIMED_NEW, { winningTile: 30, melds: [...ALL_CLAIMED_MELDS] }).units} tai`,
        },
      ),
    },
    {
      text: "One restriction guards winning itself. If you could have won — on a discard, or on a tile you drew — and you let the chance pass, that is a passed win. While a passed win stands against you, you may not win at all, on any tile, even one you draw yourself. Drawing again does not clear it. To clear a passed win you must either discard a tile that could not have completed your hand, or declare a quad using a tile you drew. A quad claimed from a discard does not clear it.",
    },
    {
      question: choice(
        "passed-draw",
        "You passed up a win you could have taken. On your next turn you draw a tile. Are you free to win again?",
        [
          "Yes — drawing a tile clears a passed win",
          "No — you must first discard a tile that could not complete your hand, or declare a quad from a drawn tile",
          "Yes — a passed win only blocks the same tile you passed on",
          "No — a passed win blocks you for the rest of the game",
        ],
        1,
        "A passed win is cleared only by discarding a tile that could not have completed your hand, or by declaring a quad from a drawn tile. Drawing alone changes nothing, and the block covers every winning tile, not just the one passed on — but it can always be cleared in one of those two ways.",
        "Clearing a passed win takes one of two specific actions. Think about which actions those are — and about whether simply taking your next turn is one of them.",
      ),
    },
  ]),
  lesson("quads", "Quads, replacements and first draws", [
    {
      text: "A quad — four copies of the same tile, like the four copies of the 2 of bamboo shown here — comes in three kinds. A concealed quad is four copies you held in your hand; you declare it and its faces stay hidden from the other players. A claimed quad is three copies in your hand completed by claiming another player's discard. An added quad starts as a triplet you already claimed and showed; when you later draw the fourth copy, you add it to that shown triplet. No quad can be declared straight after claiming a sequence or a triplet — you need a drawing turn first.",
      tiles: "2222s",
    },
    {
      text: "Quads earn tai: a claimed quad or an added quad earns one tai, and a concealed quad earns two tai — the two replace the one for that set; they are not added to it. A claimed quad or an added quad is shown where every player can see it, and a win's list of awards calls such a quad an exposed quad; a concealed quad's faces stay hidden. After declaring any quad you draw a replacement tile from the reserve, to make up for the fourth tile. Winning on a replacement draw earns one more tai. One house rule limits that: if you claimed a quad from another player's discard, you cannot win on the replacement draw that follows it.",
    },
    {
      question: choice(
        "quad-tai",
        "A hand contains one concealed quad and no other quad. How many tai does that quad earn?",
        ["1 tai", "2 tai", "3 tai", "4 tai"],
        1,
        "Two tai. A concealed quad earns two, replacing the one tai an ordinary quad earns for the same set.",
        "A concealed quad's award replaces the ordinary quad award for that set. The question is which single amount applies to a quad nobody saw you build.",
        {
          tiles: "2222s",
          verify: () =>
            `${scored("1111m456m123p789s111z55z", { winningTile: 31, melds: [{ kind: "ankan", tiles: [0, 0, 0, 0] }] }).patterns.find((p) => p.id === "tw-quad-0")?.units} tai`,
        },
      ),
    },
    {
      text: "An added quad can be robbed. In the moment you try to add the fourth tile to your shown triplet, any other player whose hand that tile would complete may win on it instead. The tile goes to the winner, your set stays a triplet, and you pay as the discarder of that tile. Winning by robbing an added quad earns one tai, and it is paid as a discard win, never as a self-draw. A concealed quad cannot be robbed — its tiles were never offered to anyone — and neither can a claimed quad, which is already complete.",
    },
    {
      question: choice(
        "robbable",
        "Which quad can another player rob?",
        [
          "A concealed quad",
          "A claimed quad",
          "An added quad",
          "Any quad, if the tile completes their hand",
        ],
        2,
        "An added quad. Robbing happens in the moment the fourth tile is being added to a triplet that is already shown, before the tile joins the set.",
        "Robbing needs a moment when a single tile is offered before it joins a set. Think about which kind of quad has such a moment — and which kinds are already complete, or were never shown, when they form.",
      ),
    },
    {
      text: "Two timing awards end the scoring list. Winning by self-draw on the very last tile of the live wall earns one tai. And a win on the very first draw of a hand, before anything else has happened, earns the largest everyday awards in the game: if the dealer does it, the hand earns twenty-four tai and the award is named Heavenly hand; if any other player does it on their first draw, sixteen tai, and the award is named Earthly hand. Those first-draw awards are tai, like every award in this track, and they replace the concealed, self-draw and one-kind-wait awards rather than adding to them.",
    },
    {
      text: "Count a replacement win on a new hand. The pictured hand holds: the 1, 2, 3 and the 4, 5, 6 of characters; the 1, 2 and 3 of circles; a quad of the 2 of bamboo; a triplet of West winds; and a pair of white dragons. The bamboo triplet had already been claimed and shown when the player drew the fourth 2 of bamboo and added it, making the quad an added quad. The replacement tile drawn for that quad was the 3 of circles, and it completed the hand.",
      hand: REPLACEMENT_NEW,
    },
    {
      hand: REPLACEMENT_NEW,
      question: choice(
        "count-replacement",
        "How many tai does this hand earn in all?",
        ["3 tai", "4 tai", "5 tai", "7 tai"],
        2,
        "Five tai: one for the West wind triplet, one for the added quad, one for winning by self-draw, one for the one-kind wait — only the 3 of circles could complete the hand — and one for winning on the replacement draw.",
        "Count award by award: the honor triplet, the quad, the way the hand was won, the kind of wait it was sitting on, and the draw the winning tile came on.",
        {
          verify: () =>
            `${scored(REPLACEMENT_NEW, { winningTile: 11, selfDraw: true, replacement: true, melds: [{ kind: "shouminkan", tiles: [19, 19, 19, 19] }] }).units} tai`,
        },
      ),
    },
    {
      text: "Count the last-tile award on a new hand. The pictured hand holds: the 1, 2, 3 and the 4, 5, 6 of characters; the 1, 2, 3 and the 4, 5, 6 of circles; three East winds, which were claimed; and a pair of the 9 of bamboo. The player drew the very last tile of the live wall — the 6 of circles — and it completed the hand.",
      hand: LAST_DRAW_NEW,
    },
    {
      hand: LAST_DRAW_NEW,
      question: choice(
        "count-last-draw",
        "How many tai does this hand earn in all?",
        ["1 tai", "2 tai", "3 tai", "4 tai"],
        2,
        "Three tai: one for the East wind triplet, one for winning by self-draw, and one for winning on the very last tile of the live wall.",
        "Three separate one-tai awards meet here: an honor triplet, the way the hand was won, and which tile it was won on.",
        {
          verify: () =>
            `${scored(LAST_DRAW_NEW, { winningTile: 14, selfDraw: true, lastWall: true, melds: [{ kind: "pon", tiles: [27, 27, 27] }] }).units} tai`,
        },
      ),
    },
    {
      text: "Count a first-draw win on a new hand. The pictured hand is: the 1, 2, 3 and the 4, 5, 6 of characters; the 1, 2, 3 and the 4, 5, 6 of circles; the 7, 8, 9 of bamboo; and a pair of East winds. A player who is not the dealer drew the 6 of circles as the very first draw of the hand, before anything else had happened, and it completed this hand.",
      hand: FIRST_DRAW_NEW,
    },
    {
      hand: FIRST_DRAW_NEW,
      question: choice(
        "count-first-draw",
        "How many tai does that first-draw win earn in all?",
        ["3 tai", "8 tai", "16 tai", "24 tai"],
        2,
        "Sixteen tai. A first-draw win by a player who is not the dealer earns sixteen tai, and that award replaces the concealed, self-draw and one-kind-wait awards rather than adding to them. The East winds are only a pair, so nothing else is added. Twenty-four tai would be the amount for the dealer's own first-draw win.",
        "The first-draw award depends on who won: the dealer, or any other player. It replaces the everyday way-of-winning awards instead of stacking on them.",
        {
          verify: () =>
            `${scored(FIRST_DRAW_NEW, { winningTile: 14, selfDraw: true, initial: true, seatWind: 30 }).units} tai`,
        },
      ),
    },
  ]),
  lesson("payments", "Scoring a whole hand: tai, price and the dealer", [
    {
      text: "This lesson scores one complete hand from its tiles to its payments. The pictured hand is: 1, 2, 3 of characters and 4, 5, 6 of characters; 1, 2, 3 of circles and 4, 5, 6 of circles; 7, 8, 9 of bamboo; and a pair of East winds. Five sets and a pair — the shape the tiles lesson taught, with every face now readable.",
      hand: WORKED,
    },
    {
      text: "How it was won: before the last draw, the hand was the ready hand from the waits lesson — four sets complete, the pair of East winds complete, and the 4 and 5 of circles unfinished, waiting on the 3 or the 6 of circles. The player drew the 6 of circles themself. So this is a self-draw, and nothing in the hand was ever claimed: the hand is concealed from start to finish.",
    },
    {
      text: "Count the tai award by award, using the prices from the lessons where each award was taught. Start with how the hand was kept and won: it is concealed and self-drawn, and the everyday-tai lesson priced that combination as one combined award of three tai, replacing the separate one tai for a concealed hand and the separate one tai for a self-draw. Those two are not added as well.",
    },
    {
      text: "Then check the hand for every other award, one family at a time. Honor triplets: the East winds are only a pair, and a pair is not a triplet, so no wind tai. Suit patterns: the hand uses all three suits, so no suit award. The award for having no honors: the East pair is an honor, so that award does not apply. Flowers: none were set aside. Quads: none was declared. Concealed triplets: the hand has none — every set is a sequence. The total is three tai, all of it from the combined award.",
    },
    {
      text: "Turn the tai into a payment. Each payer owes the base of 30 points plus 10 points for each tai: at three tai, that is 30 plus 30 — 60 points. A self-draw is paid by all three opponents, so each opponent would pay 60 points, before the extra amount for a payment involving the dealer is added — that extra amount is the dealer bonus, worked out in the next step. A discard win is different: only the player who discarded the winning tile pays.",
    },
    {
      text: "Now add the dealer. Say the dealer is on the second repeat — the dealer has stayed on for two extra hands, in the sense the table lesson defined. A payment that involves the dealer — the dealer paying, or the dealer winning — adds a dealer bonus to that one payment: one extra tai, plus two more for each repeat. On the second repeat that is one plus two times two: five extra tai. The winner of our hand is not the dealer, so only the dealer's own payment carries the bonus: the dealer pays 30 plus eight times ten — 110 points. The other two opponents pay the plain 60 points each. The winner receives 230 points in all.",
    },
    {
      question: choice(
        "dealer-pays",
        "In that example — a three-tai self-draw won by a player who is not the dealer, on the dealer's second repeat — how much does the dealer pay?",
        ["60 points", "110 points", "170 points", "230 points"],
        1,
        "The dealer pays 110 points: the base of 30 plus ten for each of the hand's three tai and the five bonus tai — one plus two for each of the two repeats. The 230 is what the winner receives from all three opponents together.",
        "Only the dealer's payment carries the dealer bonus. Work out the bonus first — one extra tai plus two for each repeat — add it to the hand's tai for that one payment, and price it at the base plus ten per tai.",
        {
          verify: () =>
            `${taiwanesePayments(3, { winner: 1, payer: 1, selfDraw: true, dealer: 0, dealerRepeats: 2 })[0]!.amount} points`,
        },
      ),
    },
    {
      question: choice(
        "nondealer-pays",
        "In the same example, how much does each of the other two opponents pay?",
        ["60 points", "110 points", "170 points", "230 points"],
        0,
        "Each pays 60 points: the base of 30 plus ten for each of the hand's three tai. Neither payment involves the dealer, so neither carries the dealer bonus.",
        "A payment between two players who are not the dealer carries no dealer bonus, even in a hand where the dealer pays more. Price the hand's tai on its own for these two payments.",
        {
          verify: () =>
            `${taiwanesePayments(3, { winner: 1, payer: 1, selfDraw: true, dealer: 0, dealerRepeats: 2 })[1]!.amount} points`,
        },
      ),
    },
    {
      text: "Two contrasts fix the method. If a three-tai hand is won on a discard instead, only the discarder pays: 60 points from an ordinary player, or 110 points when the discarder is the dealer on that second repeat — the bonus follows the payment, not the hand. And a complete hand with no tai at all still collects the base: on a discard win, the discarder pays 30 points. Count the tai, price each payment, and add the dealer bonus only where the dealer is part of that payment.",
    },
    {
      text: "Now a hand you have never seen, scored the same way from its tiles. The pictured hand is: triplets of the 1, the 2 and the 3 of circles; the 7, 8, 9 of bamboo; a triplet of South winds; and a pair of white dragons. The South triplet was claimed from another player's discard; everything else stayed in the player's hand. The player then drew the 9 of bamboo themself, completing the bamboo sequence.",
      hand: TRANSFER_ONE,
    },
    {
      hand: TRANSFER_ONE,
      question: choice(
        "transfer-one-count",
        "Count the tai award by award. How many tai does this hand earn in all?",
        ["3 tai", "4 tai", "5 tai", "6 tai"],
        1,
        "Four tai: two for its three concealed triplets, one for the South wind triplet, and one for winning by self-draw. The claimed South triplet is not concealed, so the concealed-triplet count is three, not four — and the white dragons are only a pair.",
        "Separate the triplets that were never claimed from the one that was: only the never-claimed ones feed the concealed-triplet count. Then add the wind triplet and the award for how the hand was won.",
        {
          verify: () =>
            `${scored(TRANSFER_ONE, { winningTile: 26, selfDraw: true, melds: [{ kind: "pon", tiles: [28, 28, 28] }] }).units} tai`,
        },
      ),
    },
    {
      text: "Price that hand. The winner is not the dealer. The dealer is on the first repeat — the dealer has dealt one extra hand — so the dealer's own payment carries the dealer bonus: one extra tai plus two more for the one repeat, three extra tai in all. The other two opponents' payments carry no bonus.",
    },
    {
      question: choice(
        "transfer-one-dealer",
        "How much does the dealer pay for that hand?",
        ["70 points", "90 points", "100 points", "240 points"],
        2,
        "The dealer pays 100 points: the base of 30 plus ten for each of the hand's four tai and the three bonus tai — seven tai priced in all. The 240 points is what the winner receives from all three opponents together.",
        "Price the dealer's payment on its own: the hand's tai plus the dealer bonus for one repeat, charged at the base plus ten per tai.",
        {
          verify: () =>
            `${taiwanesePayments(4, { winner: 1, payer: 1, selfDraw: true, dealer: 0, dealerRepeats: 1 })[0]!.amount} points`,
        },
      ),
    },
    {
      question: choice(
        "transfer-one-other",
        "How much does each of the other two opponents pay for that hand?",
        ["40 points", "70 points", "100 points", "240 points"],
        1,
        "Each pays 70 points: the base of 30 plus ten for each of the hand's four tai. Neither payment involves the dealer, so neither carries the dealer bonus.",
        "A payment between two players who are not the dealer carries no dealer bonus, even in a hand where the dealer pays more. Price the hand's tai on its own for these two payments.",
        {
          verify: () =>
            `${taiwanesePayments(4, { winner: 1, payer: 1, selfDraw: true, dealer: 0, dealerRepeats: 1 })[1]!.amount} points`,
        },
      ),
    },
    {
      text: "A second new hand, won the other way. The pictured hand is characters with honors: the 1, 2, 3, the 4, 5, 6 and the 7, 8, 9 of characters; a triplet of East winds; a triplet of South winds; and a pair of West winds. The East triplet was claimed; everything else stayed in the player's hand. Another player then discarded a West wind, completing the pair.",
      hand: TRANSFER_TWO,
    },
    {
      hand: TRANSFER_TWO,
      question: choice(
        "transfer-two-count",
        "Count the tai award by award. How many tai does this hand earn in all?",
        ["5 tai", "6 tai", "7 tai", "8 tai"],
        2,
        "Seven tai: four for one numbered suit together with honors; one for the East wind triplet; one for the South wind triplet; and one for the one-kind wait — only a West wind could complete the hand. The hand is open, so there is no concealed award.",
        "Work through the families: the suit pattern, each wind triplet, and the kind of wait the pair was finished from. The hand was opened by a claim, which rules one everyday award out.",
        {
          verify: () =>
            `${scored(TRANSFER_TWO, { winningTile: 29, melds: [{ kind: "pon", tiles: [27, 27, 27] }] }).units} tai`,
        },
      ),
    },
    {
      question: choice(
        "transfer-two-pays",
        "The player who discarded the West wind is the dealer, on no repeats. How much does the dealer pay?",
        ["70 points", "80 points", "110 points", "140 points"],
        2,
        "The dealer pays 110 points. A discard win is paid by the discarder alone, and because that payment involves the dealer it carries the dealer bonus for no repeats — one extra tai: the base of 30 plus ten for each of eight tai in all.",
        "Only one player pays on a discard win. Work out that one payment with the dealer bonus for zero repeats added to the hand's tai.",
        {
          verify: () =>
            `${taiwanesePayments(7, { winner: 1, payer: 0, selfDraw: false, dealer: 0, dealerRepeats: 0 })[0]!.amount} points`,
        },
      ),
    },
    {
      text: "That is the whole method, used on two hands you had never seen: read the tiles, name the sets, count the tai award by award from the prices taught in their own lessons, price each payment at the base of 30 plus 10 for each tai, and add the dealer bonus only to a payment the dealer takes part in.",
    },
  ]),
  lesson("match", "The whole game", [
    {
      text: "A full game runs through four rounds, named by the winds in the order shown: the East round, the South round, the West round and the North round. In each round, every player deals once in turn. The dealer repeats after winning a hand and after a drawn hand, and each repeat raises the repeat count used in that dealer's payments. A win by a player who is not the dealer passes the deal and resets the repeat count to zero. One house rule caps it: at this table the deal passes after ten repeats, even if the dealer wins again.",
      tiles: "1234z",
    },
    {
      question: choice(
        "draw-repeat",
        "A hand ends with no winner, and the dealer has repeated fewer than ten times. What happens to the deal?",
        [
          "The same player deals again, and the repeat count goes up by one",
          "The deal passes to the next player, and the repeat count resets",
          "The game ends, and the scores are settled",
          "The player with the most points deals the next hand",
        ],
        0,
        "A hand with no winner keeps the same dealer on, and the repeat count rises by one — the same result as when the dealer wins, up to the ten-repeat cap.",
        "Think about the two results that keep the same dealer on, and about what a hand with no winner does to the repeat count. The ten-repeat cap is the only limit mentioned.",
        {
          verify: () =>
            createTaiwaneseAdapter().progression(null, 0, 0).repeat
              ? "The same player deals again, and the repeat count goes up by one"
              : "invalid",
        },
      ),
    },
    {
      text: "Each player starts the game with 1,000 points. Payments move points from the players who pay to the player who won — they never create points and never remove them. So after every hand, the four scores still add up to 4,000 points. A score can fall below zero and the game continues; at the end, each player's standing is their score compared with the 1,000 they started with.",
    },
    {
      question: choice(
        "sum",
        "Four players started with 1,000 points each. After a hand's payments have been made, what do the four scores add up to?",
        ["3,000 points", "4,000 points", "4,030 points", "It depends on the tai"],
        1,
        "4,000 points. Every payment moves points from one player to another, so the total across the four players never changes, whatever the hand was worth.",
        "Payments transfer points between players; they neither create nor destroy them. Think about what that means for the total of the four scores.",
      ),
    },
    {
      text: "The whole game, as a recap. Build the wall, deal sixteen tiles to each player and one more to the dealer, and set flowers aside, replacing them from the reserve. Take turns drawing and discarding. Claim a discard for a sequence only if your turn comes next, and for a triplet or a quad from any seat — and remember the swap ban on the discard right after a claim. The pictured hand is the scored hand from the payment lesson: five sets and a pair, ready when one tile could complete it, and won when that tile arrived.",
      hand: WORKED,
    },
    {
      text: "And scoring, as a recap. Count the hand's tai award by award — each flower, each wind or dragon triplet, the way the hand was kept and won — remembering that bigger awards replace the smaller ones inside them instead of stacking. Turn tai into points at the base of 30 plus 10 for each tai. A discard win is paid by the discarder alone; a self-draw is paid by all three opponents; and any payment involving the dealer adds the dealer bonus of one tai plus two for each repeat, to that payment only. Read the tiles, build five sets and a pair, count the tai, and settle each payment — that is the whole game.",
    },
  ]),
];
