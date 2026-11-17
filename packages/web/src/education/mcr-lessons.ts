import {
  parseCounts,
  scoreMcr,
  mcrPayments,
  mcrDistance,
  type VariantScoreInput,
} from "@openmahjong/engine";
import type { VariantLesson, VariantQuestion } from "./variant-content.js";
const lesson = (
  id: string,
  title: string,
  paragraphs: string[],
  questions: VariantQuestion[],
): VariantLesson => ({
  id: `mcr-${id}`,
  variant: "mcr",
  profileId: "openmahjong-mcr-2006",
  version: 1,
  title,
  paragraphs,
  questions,
});
const fact = (
  id: string,
  prompt: string,
  choices: string[],
  answer: number,
  explanation: string,
): VariantQuestion => ({
  id: `mcr-${id}`,
  prompt,
  choices,
  answer,
  explanation,
  verify: () => choices[answer]!,
});
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
export const MCR_LESSONS: VariantLesson[] = [
  lesson(
    "foundation",
    "The MCR table and its tiles",
    [
      "Mahjong Competition Rules, usually shortened to MCR, is a Chinese competition form with a broad pattern vocabulary. This app records the WMO 2006 edition hosted by the European Mahjong Association. Its table contains 81 scoring patterns. A saved profile identifies that edition precisely: later competition amendments and house practices do not silently replace it. The reference in this course describes all 81 patterns and calls out common restrictions.",
      "Three numbered suits contain characters, circles and bamboo from 1 through 9, with four copies of each kind. Four winds and three dragons add seven honor kinds. Eight unique flowers and seasons bring the physical inventory to 144. Flowers are exposed and replaced immediately. They never become a sequence, triplet or pair. There are no red fives, dora indicators, riichi declarations or riichi deposits on this table.",
      "A standing hand normally has thirteen ordinary structural tiles between turns. A standard win has four sets and a pair. A sequence, called a chow, is three consecutive numbers in one suit; a triplet, called a pung, is three identical tiles. A declared quad, called a kong, uses four identical physical tiles but occupies one set. Its extra tile is balanced by a replacement, so each quad adds one physical tile to the usual fourteen-tile winning total.",
    ],
    [
      fact(
        "inventory",
        "Which tiles count toward the fourteen ordinary places?",
        ["Flowers and seasons", "Ordinary suit and honor tiles"],
        1,
        "Bonus flowers are exposed and replaced, so they never fill a structural place.",
      ),
      fact(
        "edition",
        "How many patterns belong to this frozen profile?",
        ["34", "81", "82"],
        1,
        "The WMO 2006 table has 81 named patterns. Its six-point concealed-plus-melded kong combination is specified under Two Melded Kongs, not listed as another named pattern.",
      ),
    ],
  ),
  lesson(
    "claims",
    "Turns, claims and hidden quads",
    [
      "The dealer starts the hand. On an ordinary turn, draw one tile and either declare an eligible win or discard one tile face-up. Other players may win on the newest discard if their hand has an eligible score. A win outranks a triplet or quad claim. If more than one player could win, the nearest eligible seat in turn order has priority. This profile does not settle simultaneous winners.",
      "Any opponent may claim a discard for a triplet or an exposed quad when holding the necessary matching tiles. Only the player immediately after the discarder may claim a sequence. The controls offer the exact physical tiles used for each legal sequence; a claim never substitutes a different tile later in replay. After a sequence or triplet claim, discard without drawing. You cannot declare a quad in that same no-draw turn.",
      "A concealed quad is declared on a drawing turn and its four faces stay hidden from opponents during the hand. An exposed triplet may be upgraded with its fourth tile; that added tile is offered to opponents for a win before the upgrade completes. This is robbing the kong. Concealed quads cannot be robbed in this profile. Replacements come from the wall’s back, and play uses the whole live wall without a fixed dead-wall reserve. There is no Riichi furiten rule: a previously discarded kind may later complete a legal win.",
    ],
    [
      fact(
        "claim-priority",
        "A sequence claim and an eligible win claim target the same discard. Which takes priority?",
        ["The sequence", "The win"],
        1,
        "Winning has priority over every ordinary set claim.",
      ),
      fact(
        "quad-privacy",
        "May an opponent’s coach use the faces of their concealed quad?",
        ["Yes", "No"],
        1,
        "The declaration is public, but its tile kind remains hidden during the hand. Coaching sees masked copies.",
      ),
    ],
  ),
  lesson(
    "eligibility",
    "Eight fan before flowers",
    [
      "A complete shape is necessary but usually insufficient. MCR requires at least eight fan before flower points. Fan here means the points assigned to recognized patterns; it is not a doubling scale like some other variants. Add permitted pattern values after exclusions. Then test the eight-fan minimum. Only an eligible winner adds one point for each exposed flower or season when computing the final payment value.",
      "Suppose the non-flower patterns total six and you exposed three flowers. The displayed total is nine points, but the hand is still ineligible: six is below eight. By contrast, an eight-fan hand with those flowers is eligible and has an eleven-point payment value. The calculator shows both figures and blocks recording a below-minimum result until the entered facts or a documented manual correction establish eligibility.",
      "Chicken Hand is a special eight-fan award for an otherwise valid hand that earns no other non-flower pattern. It is not a top-up from six or seven to eight. A single qualifying feature, including an applicable wait or self-draw award, prevents Chicken Hand. This makes its exact circumstances important. Do not assume that an unrecognized-looking hand earns it; use the complete entered tiles, declared sets and actual win context.",
    ],
    [
      {
        ...fact(
          "flowers-threshold",
          "A hand has six non-flower fan and three flower points. Is it eligible?",
          ["Yes", "No"],
          1,
          "Only non-flower fan meets the eight-fan minimum.",
        ),
        verify: () => {
          const a = score("123456m234p567s11z", {
            flowers: [34, 35, 36, 37, 38, 39, 40, 41],
          });
          return a.eligible ? "Yes" : "No";
        },
      },
      fact(
        "chicken",
        "Does Chicken Hand add two points to a six-fan hand?",
        ["Yes", "No"],
        1,
        "Chicken Hand applies only when no other non-flower scoring pattern exists.",
      ),
    ],
  ),
  lesson(
    "families",
    "Pattern families and the 81-pattern reference",
    [
      "Learn the pattern table in families. Honors cover dragons and winds. Triplet and quad patterns reward repeated kinds, concealment and quad counts. Sequence families compare numbers within one suit or across several suits. Tile-composition families restrict the whole hand to particular suits, ranks or allowed kinds. Special structures change how the fourteen tiles fit together. Winning circumstances and small combinations complete the table.",
      "A family is a learning aid, not a separate scoring rule. A hand may legitimately combine several families, such as a sequence pattern, a suit restriction and a winning circumstance. The scorer evaluates possible arrangements of ambiguous concealed tiles and selects a maximum legal total. Once a set has been declared, its tiles remain fixed and cannot be redistributed into another arrangement to claim extra patterns.",
      "Use the searchable reference below to inspect each pattern’s value, recognition rule and common exclusions. Begin with the hand’s structure, then its larger patterns, then smaller combinations, concealment, the winning event and flowers. The list is a reference for this recorded edition, not a checklist that can be summed indiscriminately. Actual-tile calculation applies the full exclusion and non-repeat rules. Fast fan entry records a table-agreed total without claiming to verify its tile composition.",
    ],
    [
      fact(
        "families-structure",
        "Does the teaching family change a pattern’s payment value?",
        ["Yes", "No"],
        1,
        "Families organize learning; the frozen pattern table determines values.",
      ),
      fact(
        "fixed-set",
        "Can an exposed sequence be rearranged later into triplets for extra points?",
        ["Yes", "No"],
        1,
        "Declared sets are fixed. Only the still-concealed portion can be rearranged.",
      ),
    ],
  ),
  lesson(
    "exclusions",
    "Exclusions and non-repeat counting",
    [
      "High-value patterns often include the very feature that a smaller pattern rewards. Full Flush necessarily omits honors and two suits, so it excludes No Honors and One Voided Suit. Big Three Dragons replaces its individual Dragon Pung awards. Seven Shifted Pairs replaces Seven Pairs and Full Flush. These are defined exclusions, not optional table discounts. The breakdown lists only the awards that survive them.",
      "Non-repeat counting governs combinations of sets. You cannot repeatedly score the same combination under the same pattern, and you cannot break one chosen arrangement into incompatible alternative arrangements. When several small combinations compete for the same sets, the scorer considers permitted combinations and keeps the highest legal total. Counting a sequence once in a larger arrangement does not grant unlimited reuse in every imaginable pairwise combination.",
      "An actual hand can have more than one possible decomposition. For example, repeated suited numbers may be arranged as triplets or as repeated sequences. Choose one coherent scoring arrangement. You may not take the triplet pattern from one arrangement and the repeated-sequence pattern from another, then add them. Manual corrections remain visibly separate from detected facts, with a reason, so an agreed exception never masquerades as an automatically verified pattern.",
    ],
    [
      {
        ...fact(
          "shifted-exclusion",
          "Seven Shifted Pairs is detected. Is Seven Pairs also added?",
          ["Yes", "No"],
          1,
          "The higher special structure replaces Seven Pairs.",
        ),
        tiles: "11223344556677m",
        verify: () =>
          score("11223344556677m", { winningTile: 6 }).patterns.some(
            (p) => p.name === "Seven Pairs",
          )
            ? "Yes"
            : "No",
      },
      fact(
        "rearrange-exclusion",
        "May one total mix incompatible sequence and triplet decompositions?",
        ["Yes", "No"],
        1,
        "A score must come from one coherent arrangement with the permitted combinations.",
      ),
    ],
  ),
  lesson(
    "sequences",
    "Sequences across suits",
    [
      "A Pure Straight is 123, 456 and 789 in one suit. A Mixed Straight uses those three number groups in three different suits. Pure Triple Chow repeats one sequence three times in one suit; Mixed Triple Chow repeats its numbers in all three suits. The word pure refers to one suit, while mixed refers to a comparison across suits. It does not describe whether the hand is concealed.",
      "Shifted sequences move their starting numbers. Three Pure Shifted Chows advance by one or two within one suit. Mixed Shifted Chows advance by one across three different suits. The remaining fourth set and pair still have to complete the hand and may contribute other permitted patterns. A pattern matching three sets does not excuse a broken pair or an incomplete fourth set.",
      "All Chows means all four sets are sequences and the pair is suited. An honor pair disqualifies this two-fan pattern, even if all four sequences are present. All Chows already implies No Honors, so that extra point is excluded. Small sequence combinations such as Pure Double Chow, Mixed Double Chow, Short Straight and Two Terminal Chows are useful additions only when the larger chosen patterns and non-repeat rules permit them.",
    ],
    [
      fact(
        "straight-mixed",
        "123 characters, 456 circles and 789 bamboo form which family member?",
        ["Pure Straight", "Mixed Straight"],
        1,
        "Three different suits make a Mixed Straight.",
      ),
      fact(
        "chows-pair",
        "Four sequences with an East pair automatically earn All Chows. True?",
        ["True", "False"],
        1,
        "The pair must be suited for MCR All Chows.",
      ),
    ],
  ),
  lesson(
    "specials",
    "Pairs, orphans and knitted hands",
    [
      "Seven Pairs is a closed special structure worth twenty-four fan. In this MCR edition, four identical tiles may be used as two pairs, unlike the Riichi seven-pairs rule. Seven consecutive pairs in one suit form Seven Shifted Pairs instead. Thirteen Orphans uses the six terminal kinds and seven honor kinds, with one duplicate. These special hands are validated by the shared scorer rather than forced into four ordinary sets.",
      "A knitted suit assignment spreads 147, 258 and 369 across three different suits. The nine chosen kinds do not form ordinary sequences. Knitted Straight combines that nine-tile body with one ordinary set and one pair. Lesser Honors and Knitted Tiles uses fourteen different kinds selected from a knitted body and honors; Greater Honors and Knitted Tiles contains all seven honors and seven of the knitted suited kinds. Repeated kinds break these two all-distinct structures.",
      "The CPU and coach consider these structural routes when analyzing a closed hand. An improving tile is one that reduces shape distance, and an eligible wait is checked with the same score function used to win. This remains heuristic strategy: it does not predict hidden draws or guarantee a future score. Declaring a set can remove special closed-hand routes, so a legal call is a choice, not an automatic recommendation.",
    ],
    [
      {
        ...fact(
          "pairs-shape",
          "Is 11223344556677 characters a complete special structure?",
          ["Yes", "No"],
          0,
          "It is Seven Shifted Pairs.",
        ),
        tiles: "11223344556677m",
        verify: () =>
          mcrDistance(parseCounts("11223344556677m")) === -1 ? "Yes" : "No",
      },
      fact(
        "knitted-suits",
        "Can 147, 258 and 369 all use the same suit in a knitted body?",
        ["Yes", "No"],
        1,
        "A knitted body assigns the three groups to three different suits.",
      ),
    ],
  ),
  lesson(
    "circumstances",
    "Concealment, waits and the winning event",
    [
      "A closed discard win can receive Concealed Hand. A closed self-draw instead receives Fully Concealed Hand, which replaces Concealed Hand and Self-Drawn. A concealed quad does not open the hand. For concealed-triplet patterns, however, the tile that completed a triplet matters: taking that completing tile from another player makes the triplet exposed for the concealed-triplet count.",
      "An edge, closed or single wait earns one point only when that kind is the hand’s unique winning kind. Edge means completing 12 with 3 or 89 with 7. Closed means taking the middle of a sequence. Single means completing the pair. A different legal completion elsewhere prevents the unique-wait point. Use the actual winning tile and the pre-win hand, rather than assigning a convenient wait from the final arrangement.",
      "Last Tile is the fourth copy when the other three copies were already publicly visible before the win. It is different from drawing the last wall tile or winning on its final discard. Hidden concealed quads cannot supply public evidence. Robbing an added quad excludes Last Tile. Out with Replacement Tile applies to the ordinary quad replacement, not a later replacement after that tile proved to be a flower. The calculator asks for these circumstances explicitly because tiles alone cannot establish them.",
    ],
    [
      fact(
        "concealed-triplet",
        "A discard completes a triplet. Does that triplet count as concealed for a concealed-pungs award?",
        ["Yes", "No"],
        1,
        "The completing tile came from another player, so that triplet is exposed for this count.",
      ),
      fact(
        "last-copy",
        "May a hidden opponent quad establish Last Tile for your coach?",
        ["Yes", "No"],
        1,
        "Only visible evidence can establish that three earlier copies are already out.",
      ),
    ],
  ),
  lesson(
    "payments",
    "Payments led by the payer",
    [
      "Every loser contributes eight base points to a legal win. On a discard win, the discarder also pays the hand’s full value, including flowers. The other two losers pay only their eight base points. If the qualifying patterns total eight and two flowers were exposed, the discarder pays eighteen and each other loser pays eight. The winner receives thirty-four in total. Dealer status does not multiply these amounts.",
      "On self-draw, each of the three opponents pays eight plus the full hand value. The same eight-fan, two-flower hand receives eighteen from each opponent, for fifty-four overall. The calculator leads with these individual amounts, then explains the detected patterns and corrections. Always check who won, who discarded and whether the win was self-drawn before recording; those context choices directly determine payer responsibility.",
      "The in-person scorekeeper starts from the agreed four named scores and records transfers in a versioned ledger. A correction replaces the original hand entry and recomputes later totals. Undo restores the earlier ledger state. A hand without a winner makes no win transfer. Table-agreed penalties can be recorded with an explanation, without pretending that a digital scorekeeper is a tournament umpire. Settlement reports net point transfers; it does not assume a cash stake.",
    ],
    [
      {
        ...fact(
          "discard-payment",
          "Eight qualifying fan and two flowers: how much does the discarder pay?",
          ["8", "18", "34"],
          1,
          "The discarder contributes base eight plus hand value ten.",
        ),
        verify: () =>
          String(
            mcrPayments(8, { winner: 0, payer: 1, selfDraw: false }, 2)[0]!
              .amount,
          ),
      },
      {
        ...fact(
          "self-payment",
          "The same hand is self-drawn. How much does each opponent pay?",
          ["10", "18", "54"],
          1,
          "Each opponent contributes eight plus the ten-point hand value.",
        ),
        verify: () =>
          String(
            mcrPayments(8, { winner: 0, payer: 0, selfDraw: true }, 2)[0]!
              .amount,
          ),
      },
    ],
  ),
  lesson(
    "match",
    "Sixteen hands, history and practice",
    [
      "A full MCR match contains four rounds of four hands: East, South, West and North. The dealer advances after every hand, including a dealer win or a draw. There are no dealer repeats in this profile. The shorter East-only and East–South choices use the same scoring and claim rules while stopping after fewer rounds. Scores begin at zero and may become negative. Every payment is a transfer, so the sum of the four scores remains zero.",
      "Completed games open to final standings and selectable hands. Board review includes every player’s recorded draw, discard, claim and flower exposure. Significant-event and decision jumps avoid stepping through an entire pond one discard at a time. Opponents’ standing hands and concealed quads remain face-down. Opening history does not replace an active match, and schema-three records preserve the variant and profile used at the time.",
      "Practice questions use checked examples attached to this edition. They do not turn a coach’s heuristic preference into a calibrated grade. If you miss a question, read its explanation, retry and keep the earlier attempt in your learning record. Review can send you to related practice and return to the same decision. Local play and manual scoring work without an account; optional private account carry-over keeps variant history and progress separate from Riichi metrics.",
    ],
    [
      fact(
        "dealer-repeat",
        "East wins. Does East repeat the deal in this MCR profile?",
        ["Yes", "No"],
        1,
        "The dealer advances after every hand.",
      ),
      fact(
        "full-count",
        "How many hands are in a full match?",
        ["4", "8", "16"],
        2,
        "Four rounds of four dealer positions make sixteen hands.",
      ),
    ],
  ),
];
