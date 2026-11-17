import {
  parseCounts,
  scoreTaiwanese,
  taiwanesePayments,
  standardShapes,
  createTaiwaneseAdapter,
  type VariantScoreInput,
} from "@openmahjong/engine";
import type { VariantLesson, VariantQuestion } from "./variant-content.js";
const lesson = (
  id: string,
  title: string,
  paragraphs: string[],
  questions: VariantQuestion[],
): VariantLesson => ({
  id: `tw-${id}`,
  variant: "taiwanese",
  profileId: "openmahjong-taiwanese-every-flower",
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
  id: `tw-${id}`,
  prompt,
  choices,
  answer,
  explanation,
  verify: () => choices[answer]!,
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
export const TAIWANESE_LESSONS: VariantLesson[] = [
  lesson(
    "tiles",
    "Sixteen in hand, seventeen to win",
    [
      "Taiwanese mahjong gives you a larger hand: sixteen ordinary structural tiles between turns and seventeen at the moment of winning. A standard win contains five sets and a pair. Each set is a three-number sequence in one suit, a triplet of identical tiles or a declared quad. The extra set changes hand building substantially. A complete fourteen-tile Riichi or Hong Kong shape is still one set short here.",
      "The inventory has 144 physical tiles: four copies of each of the 34 ordinary kinds, plus eight unique flowers and seasons. The ordinary kinds are three numbered suits, four winds and three dragons. Honors do not form sequences. Flowers are exposed and replaced, so they never occupy a structural place in your hand. No red fives or dora indicators are used in this profile.",
      "A quad contains four physical tiles but fills one set. Its replacement balances the fourth tile. A winning hand with one quad therefore contains eighteen ordinary physical tiles; five quads and a pair would contain twenty-two. The screen wraps the larger hand into rows, and Focus hand opens larger selectable faces. Only your own standing tiles are visible. Opponents’ standing tiles and concealed quad faces remain hidden.",
    ],
    [
      {
        ...fact(
          "shape",
          "How many sets are in this complete Taiwanese hand?",
          ["Four", "Five", "Six"],
          1,
          "123m, 456m, 123p, 789s and the East triplet make five sets, plus the dragon pair.",
        ),
        tiles: "123456m123p789s111z55z",
        verify: () =>
          standardShapes(parseCounts("123456m123p789s111z55z"), [], 5)[0]
            ?.groups.length === 5
            ? "Five"
            : "invalid",
      },
      fact(
        "one-quad",
        "How many ordinary physical tiles are in a winning hand with one quad?",
        ["Seventeen", "Eighteen", "Twenty-two"],
        1,
        "Seventeen structural places plus the quad’s extra physical tile makes eighteen.",
      ),
    ],
  ),
  lesson(
    "profile",
    "Know this table before playing",
    [
      "Taiwanese tables differ in genuine ways. OpenMahjong records a named Every-flower, no-Ting profile with 30 base points and 10 points per tai. Its published rule brief identifies the IGS scoring source and the competition sources used for legal actions. It does not claim that every Taiwanese club or commercial app uses these exact choices. The recorded profile and version travel with a saved game.",
      "Every exposed flower earns one tai, and every wind triplet earns one tai regardless of seat. This replaces own-seat flower and seat/round wind scoring. Declaring ready, often called Ting, is optional at many real tables and is disabled here. There is no ready declaration button, locked-hand bonus or deposit. Your hand can change through ordinary legal draws and claims until you win.",
      "This preset requires a normal completed hand for its eight-flower bonus. Some tables instead win immediately on the eighth flower; that is a different profile choice. Seven-flower robbery and immediate four-quad wins are also absent. A named table prevents these differences from being discovered only at settlement. In-person payment settings can change the positive base and tai unit, while the CPU table keeps its recorded defaults.",
    ],
    [
      fact(
        "every-wind",
        "Does a West triplet score when West is neither your seat nor the round?",
        ["Yes", "No"],
        0,
        "Every-wind scoring gives one tai to any wind triplet in this profile.",
      ),
      fact(
        "ting",
        "Must you declare Ting before winning here?",
        ["Yes", "No"],
        1,
        "The named no-Ting profile has no ready declaration requirement or bonus.",
      ),
    ],
  ),
  lesson(
    "turns",
    "Turns, claims and prohibited swaps",
    [
      "The dealer takes the first draw and begins with seventeen ordinary tiles. If you cannot or choose not to win, discard one tile. Turns continue in seat order. An eligible win claim outranks a triplet or quad claim, which outranks a sequence claim. Only the next player may take a discard for a sequence. Any opponent may claim a triplet or exposed quad when the required matching tiles are held.",
      "After a sequence or triplet claim, discard without drawing. Declared tiles remain fixed on the table. An immediate swap is prohibited: after a triplet claim you cannot discard the same kind, and after a sequence claim you cannot discard the taken kind or an equivalent tile at the other end of the sequence. For example, taking 3 with 4 and 5 prohibits an immediate 3 or 6 discard. The legal controls disable those choices.",
      "Passing a triplet opportunity blocks another triplet or exposed quad of that kind until your next ordinary drawing turn. A sequence cannot immediately reverse your own prior discard within the same turn cycle. Near the wall’s end, ordinary sequence, triplet and exposed-quad claims require at least four live tiles remaining. Win claims are still considered. These are Taiwanese table restrictions, not Riichi furiten or riichi declaration rules.",
    ],
    [
      fact(
        "swap",
        "You chow a 3 using 4 and 5. May you immediately discard a 6 of that suit?",
        ["Yes", "No"],
        1,
        "That would swap the same sequence position. This profile prohibits the 3 and 6 discards.",
      ),
      fact(
        "late-claim",
        "Only three live tiles remain. May you make an ordinary triplet claim?",
        ["Yes", "No"],
        1,
        "Ordinary set claims require at least four live tiles in this profile; win claims are separate.",
      ),
    ],
  ),
  lesson(
    "flowers",
    "Flowers, replacements and the reserve",
    [
      "After the deal, players expose and replace their flowers in dealer order. A replacement that is itself a flower waits for the next initial replacement pass, so every player gets their turn in the pass. During ordinary play a drawn flower is exposed immediately and replaced from the tail; another flower continues that replacement chain. Your ordinary hand stays at the required structural size.",
      "Every flower or season is one tai here. A complete quartet of all four plants or all four seasons adds two tai to its four individual flower points. All eight flowers instead receive Eight Immortals, eight tai, replacing all individual and quartet flower awards. The named profile follows the competition option that still requires five completed sets and a pair. Simply collecting eight bonus tiles does not end this table’s hand.",
      "Sixteen tiles remain reserved at the wall’s tail boundary, and replacement draws reduce the remaining live capacity. The reserve stays sixteen in this profile rather than growing after each quad. If no live capacity remains, the app does not invent a replacement or discard. A flower or legal quad replacement win earns the replacement bonus, subject to the exposed-quad self-draw restriction taught in the quad lesson. Bonus tiles are public information; the hidden wall order is never used by the coach.",
    ],
    [
      {
        ...fact(
          "quartet",
          "A winner exposed all four plants and no seasons. How many flower-related tai are counted?",
          ["4", "6", "8"],
          1,
          "Four individual flowers plus the complete-quartet bonus of two makes six.",
        ),
        verify: () =>
          String(
            scored("123456m123p789s111z55z", { flowers: [34, 35, 36, 37] })
              .patterns.filter((p) => p.id.startsWith("tw-flower"))
              .reduce((n, p) => n + p.units, 0),
          ),
      },
      fact(
        "eight",
        "Do eight flowers end the hand before its ordinary structure is complete in this profile?",
        ["Yes", "No"],
        1,
        "The completed-hand eight-flower option is explicitly selected here.",
      ),
    ],
  ),
  lesson(
    "tai",
    "Everyday tai and the concealment ladder",
    [
      "Tai are additive scoring units. They do not double a base and they do not require Riichi fu. A closed discard win earns Concealed Hand, one tai. An open self-draw earns Self-draw, one tai. A closed self-draw receives three tai as a combined award; do not add one for closed, one for self-draw and then three again. Concealed quads preserve a closed hand, while sequences, triplets and open quads claimed from others open it.",
      "Triplets or quads of dragons earn one each unless replaced by a larger dragon pattern. Wind triplets similarly earn one each under this every-wind table. Three concealed triplets earn two tai, four earn five, and five earn eight; use only the highest tier. A discard that completes a triplet makes that particular triplet exposed for this concealed-triplet count, even though the overall hand may still qualify as a closed discard win.",
      "Every exposed or added quad earns one tai; each concealed quad earns two, replacing the one-tai quad award for that same set. All Triplets earns four when all five sets are triplets or quads. The scorer considers coherent arrangements of the concealed portion and retains the highest total. It never rearranges a fixed exposed set or mixes incompatible decompositions. Detected facts remain visible when the table makes a separate manual correction.",
    ],
    [
      {
        ...fact(
          "concealed-self",
          "How many tai does the combined closed self-draw award contribute?",
          ["2", "3", "5"],
          1,
          "Concealed self-draw is three total, replacing the individual closed and self-draw awards.",
        ),
        verify: () =>
          String(
            scored("123456m123p789s111z55z", { selfDraw: true }).patterns.find(
              (p) => p.id === "tw-concealed-self",
            )?.units,
          ),
      },
      fact(
        "tier",
        "Five concealed triplets are present. Do you add the three- and four-triplet tiers too?",
        ["Yes", "No"],
        1,
        "Only the highest concealed-triplet tier is counted.",
      ),
    ],
  ),
  lesson(
    "structure",
    "Suit patterns, sequences and exclusions",
    [
      "A single numbered suit together with honors earns four tai. One numbered suit with no honors earns Full Flush, eight. An all-honor hand earns eight in this profile. These suit-composition awards are alternatives, so they are not added to each other. All Triplets can still add to an all-honor hand. No Honors or Flowers is a separate two-tai award from the published every-flower special table; it adds when its own condition is met.",
      "All Sequences is stricter than merely spotting five runs. The pair must be suited, no honors or flowers may be present, and the actual discard must complete a two-sided sequence wait. Self-draw, pair completion and a unique edge or closed wait disqualify it. When the conditions hold, its two tai can add to No Honors or Flowers in this named profile. Other Taiwanese tables may account for those features differently.",
      "Little Three Dragons uses two dragon triplets and the third dragon as the pair for four tai. Big Three Dragons uses all three triplets for eight. Both replace the individual dragon awards. Little Four Winds uses three wind triplets and the fourth wind as the pair for eight; Big Four Winds uses all four wind triplets for sixteen. In this every-wind profile both replace their individual wind awards. Seven Pairs and Thirteen Orphans are not substitute winning structures in the sixteen-tile game.",
    ],
    [
      fact(
        "sequence-self",
        "Can a self-drawn hand receive the strict All Sequences award here?",
        ["Yes", "No"],
        1,
        "This profile requires an actual two-sided discard completion for All Sequences.",
      ),
      fact(
        "dragon-exclusion",
        "Big Three Dragons is present. Are its three individual dragon-triplet awards added too?",
        ["Yes", "No"],
        1,
        "The larger dragon award replaces the individual dragon awards.",
      ),
    ],
  ),
  lesson(
    "waits",
    "Unique waits and passed wins",
    [
      "A unique edge, closed or pair wait earns one tai when only one structural kind could complete the pre-win hand. Edge means 12 waiting for 3 or 89 waiting for 7; closed means the middle of a sequence; pair means the matching second tile. If another structural completion exists elsewhere, the unique-wait award is absent. All Claimed—five exposed sets and a discard-completed pair—earns two tai and replaces the unique-wait point.",
      "Passing an eligible win creates a temporary restriction called passed win, or guoshui. This applies whether you decline a discard win or choose another action instead of an available self-draw. While restricted, every winning kind is blocked, including self-draw. Merely drawing another tile does not restore eligibility. You must discard a kind outside the hand’s pre-turn winning kinds, or make a concealed or added quad, to restore it.",
      "An exposed quad does not clear passed win. Its immediate replacement also cannot be won by self-draw in this profile, even if flowers cause more replacements. A later concealed or added quad can restore eligibility. The app records the exact actions that establish and clear restrictions; resuming a match reproduces them. In board review the coach sees only your own known restrictions and the public table, not hidden opponent hands or future results.",
    ],
    [
      fact(
        "passed-draw",
        "You passed an eligible win. Does the next draw alone restore all win eligibility?",
        ["Yes", "No"],
        1,
        "A non-winning-kind discard or a concealed/added quad is required; drawing alone does not clear passed win.",
      ),
      fact(
        "all-claimed",
        "All Claimed is awarded. Is the unique pair-wait point added too?",
        ["Yes", "No"],
        1,
        "The two-tai All Claimed award replaces the unique-wait point in this profile.",
      ),
    ],
  ),
  lesson(
    "quads",
    "Quads, timing and privacy",
    [
      "A concealed quad uses four self-drawn copies and shows four backs to opponents. A directly claimed quad takes a discard with three matching held tiles. An added quad upgrades an exposed triplet with its fourth held tile. All consume replacement capacity and require the profile’s legal turn context. No quad can be declared immediately after a sequence or triplet claim before a drawing turn.",
      "Only an added quad may be robbed. Opponents are offered their eligible win before the fourth tile joins the exposed set. If one wins, the original triplet remains and the upgrading player pays as discarder. A successful robbery adds one tai and never a self-draw award. Declaring an available quad is still a strategic choice: the legal controls establish permission, while the coach’s view remains an explained heuristic.",
      "Winning on a legal quad or flower replacement adds one tai. A last ordinary live-wall self-draw adds one, while a final discard has no separate last-discard bonus in this profile. The dealer’s initial uninterrupted self-draw receives Heavenly Hand, twenty-four; a nondealer’s first uninterrupted self-draw receives Earthly Hand, sixteen. Those initial awards replace ordinary concealment, self-draw and unique-wait awards; other applicable structural and flower awards remain additive.",
    ],
    [
      fact(
        "robbable",
        "Which quad may be robbed?",
        ["An added quad", "Every concealed quad"],
        0,
        "The fourth tile upgrading an exposed triplet is offered for a win claim first.",
      ),
      fact(
        "quad-replacement",
        "Can the immediate replacement after a directly claimed exposed quad be won by self-draw here?",
        ["Yes", "No"],
        1,
        "This profile explicitly prohibits that self-draw, including a following flower-replacement chain.",
      ),
    ],
  ),
  lesson(
    "payments",
    "Base, tai and each payer’s dealer bonus",
    [
      "At this table, a payer owes base thirty plus ten for each tai. The number of payers depends on the win: the discarder alone pays a discard win; all three opponents pay a self-draw. A complete zero-tai hand is eligible and collects the base. The calculator takes ordinary tai separately from dealer bonuses so the payer lines can apply the bonus correctly to each individual transfer.",
      "The dealer adds one bonus tai plus two for every repeat. Apply that bonus only to a payment involving the dealer as winner or payer. If a nondealer wins a three-tai self-draw on the dealer’s second repeat, the dealer pays thirty plus eight times ten: one hundred ten. The other two players each pay thirty plus three times ten: sixty. Do not charge all three one hundred ten just because the dealer is at the table.",
      "If the same nondealer wins on another nondealer’s discard, the sole payment is sixty; the dealer has no part in it. If the dealer wins, every applicable payer includes the dealer bonus. The scorekeeper transfers points between four named players, preserves corrections and undo, and recomputes later totals. It does not choose a cash stake. In-person base and unit can be changed explicitly, while the CPU preset remains thirty/ten.",
    ],
    [
      {
        ...fact(
          "dealer-pays",
          "A nondealer self-draws at three tai on the dealer’s second repeat. How much does the dealer pay at 30/10?",
          ["60", "110", "180"],
          1,
          "Dealer involvement adds 1 + 2×2 = 5 tai. Base30 + (3+5)×10 = 110.",
        ),
        verify: () =>
          String(
            taiwanesePayments(3, {
              winner: 1,
              payer: 1,
              selfDraw: true,
              dealer: 0,
              dealerRepeats: 2,
            })[0]!.amount,
          ),
      },
      {
        ...fact(
          "nondealer-pays",
          "How much does either other nondealer pay in that example?",
          ["60", "110", "180"],
          0,
          "Their payment does not involve the dealer: base30 + 3×10 = 60.",
        ),
        verify: () =>
          String(
            taiwanesePayments(3, {
              winner: 1,
              payer: 1,
              selfDraw: true,
              dealer: 0,
              dealerRepeats: 2,
            })[1]!.amount,
          ),
      },
    ],
  ),
  lesson(
    "match",
    "Repeats, history and useful practice",
    [
      "A full game has East, South, West and North rounds, each with four dealer positions. The dealer repeats after winning and after a hand without a winner. Each repeat increases the repeat count used in that dealer’s payments. A nondealer win passes the deal and resets the count. This named digital profile caps the dealer at ten repeats, then advances even after a win or draw; many physical tables use a different cap or none.",
      "Each player starts with one thousand points. Scores may become negative without ending the game. All payments transfer points, so the four-player sum remains four thousand. Final settlement uses each player’s net point change without Riichi rank bonuses. Games keeps Taiwanese history separate from other variants, and in-person ledgers remain distinct from CPU games and statistics. Resume restores both the tile state and the adapter’s legal restrictions.",
      "Game details list every hand, including repeats, with the winner’s seat wind during that hand. Board review reconstructs every player’s recorded events and offers useful event and decision jumps. Opponents stay concealed. A coach comparison never uses the eventual winner or a later deal-in to judge an earlier choice. Related Practice uses authored, checked examples and can return to the same saved decision. Lessons and manual tools remain available offline after the application shell has been cached.",
    ],
    [
      {
        ...fact(
          "draw-repeat",
          "The hand ends without a winner before the repeat cap. Does the dealer repeat?",
          ["Yes", "No"],
          0,
          "Draws retain the dealer and increase the repeat count in this profile.",
        ),
        verify: () =>
          createTaiwaneseAdapter().progression(null, 0, 0).repeat
            ? "Yes"
            : "No",
      },
      fact(
        "sum",
        "Four players started with 1,000 each. What is the total after ordinary win transfers?",
        ["3,000", "4,000", "It depends on tai"],
        1,
        "Payments transfer points, so the combined total stays 4,000.",
      ),
    ],
  ),
];
