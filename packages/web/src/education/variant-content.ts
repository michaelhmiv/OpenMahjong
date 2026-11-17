/** Original beginner curriculum. Exercises bind to a concrete profile and
 * use independent worked examples; review heuristics never become quiz keys. */
import { TAIWANESE_LESSONS } from "./taiwanese-lessons.js";
import { MCR_LESSONS } from "./mcr-lessons.js";
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
export interface VariantQuestion {
  readonly id: string;
  readonly prompt: string;
  readonly choices: readonly string[];
  readonly answer: number;
  readonly explanation: string;
  readonly tiles?: string;
  readonly verify: () => string;
}
export interface VariantLesson {
  readonly id: string;
  readonly variant: VariantId;
  readonly profileId: string;
  readonly version: 1;
  readonly title: string;
  readonly paragraphs: readonly string[];
  readonly questions: readonly VariantQuestion[];
}
const hk = (
  id: string,
  title: string,
  paragraphs: string[],
  questions: VariantQuestion[],
): VariantLesson => ({
  id: `hk-${id}`,
  variant: "hong-kong",
  profileId: "openmahjong-hkos",
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
  id,
  prompt,
  choices,
  answer,
  explanation,
  verify: () => choices[answer]!,
});
const scored = (notation: string, selfDraw = false) =>
  scoreHongKong({
    counts: parseCounts(notation),
    melds: [],
    winningTile: 27,
    selfDraw,
    seatWind: 27,
    roundWind: 27,
    flowers: [],
    replacement: false,
    robbingQuad: false,
    lastWall: false,
    initial: false,
    lastCopy: false,
  });
export const VARIANT_LESSONS: VariantLesson[] = [
  hk(
    "tiles",
    "Tiles, suits and flowers",
    [
      "Hong Kong Old Style uses three numbered suits: characters, circles and bamboo. Each suit runs from 1 to 9. Four physical copies exist of each ordinary tile. The four winds—East, South, West and North—and the white, green and red dragons are honors. Honors have no neighboring numbers: East cannot join South and West to make a numbered sequence.",
      "This table adds eight unique bonus tiles: four plants and four seasons. A flower is displayed beside your sets and replaced immediately; it does not occupy a place in the winning hand. There are 136 ordinary tiles plus eight bonus tiles, so the complete inventory is 144. Unlike the Riichi table, no five has a red bonus version here. A red dragon is an ordinary honor, not a red five.",
      "Your seat wind changes as the dealer moves. It tells you which plant and season are your own-seat bonuses: number 1 belongs to East, 2 to South, 3 to West and 4 to North. The wind printed on an ordinary tile and the seat you hold are different things. Keep that distinction when reading a scoring breakdown. In the table view, opponents’ standing tiles stay face-down; their flowers, declared sets and discarded tiles are public.",
    ],
    [
      fact(
        "hk-inventory",
        "How many physical tiles are in this table’s inventory?",
        ["136", "144", "152"],
        1,
        "Four copies of 34 ordinary kinds make 136, plus eight unique bonus tiles.",
      ),
      fact(
        "hk-flower-kind",
        "Does a season fill a place in a numbered sequence?",
        ["Yes", "No"],
        1,
        "A season is exposed and replaced. It never belongs to a sequence, triplet or pair.",
      ),
    ],
  ),
  hk(
    "shape",
    "Four sets and a pair",
    [
      "A standard winning shape contains four sets and one pair. A sequence, also called a chow, is three consecutive numbers in one suit, such as 3–4–5 circles. A triplet, also called a pung, is three identical tiles, such as three South winds. A pair is two identical tiles. Numbered suits cannot be mixed inside a sequence, even if their numbers are consecutive.",
      "Between turns you normally hold thirteen ordinary tiles, counting the three structural places in each declared set. Draw one ordinary tile and you have fourteen to consider. If you do not win or make a quad, discard one and return to thirteen. A quad is four identical tiles declared as one set. Its extra physical tile is balanced by a replacement draw, so a winning hand with one quad contains fifteen physical tiles while still having four sets and a pair.",
      "Recognizing the shape is only the first check. Hong Kong also requires a minimum score before you can win. An exposed set is fixed: once you claim a discard and display its set, you cannot later move those tiles into another arrangement. The scorer considers different arrangements of the concealed portion and chooses the highest valid score. Thirteen Orphans is a separate closed-hand shape, taught later; Seven Pairs is not enabled in this Clear Chapter profile.",
    ],
    [
      {
        ...fact(
          "hk-complete-shape",
          "How many sets does the displayed standard hand contain?",
          ["Three", "Four", "Five"],
          1,
          "123m, 456m, 123p and 789s are four sequences. The two East tiles form the pair.",
        ),
        tiles: "123456m123p789s11z",
        verify: () =>
          String(
            standardShapes(parseCounts("123456m123p789s11z"), [], 4)[0]!.groups
              .length === 4
              ? "Four"
              : "invalid",
          ),
      },
      fact(
        "hk-quad-count",
        "How many physical tiles are in a standard winning hand with one declared quad?",
        ["Fourteen", "Fifteen", "Seventeen"],
        1,
        "Four sets and a pair use fourteen structural places. A quad contributes one extra physical tile.",
      ),
    ],
  ),
  hk(
    "turns",
    "Draws, discards and claims",
    [
      "The dealer is East and takes the first turn. Turns proceed from East to South, West and North. On an ordinary turn, draw a tile and then discard one tile face-up. A discard remains public even after a later player takes it. The display marks a claimed discard so it is not counted twice as both a discard and part of an exposed set.",
      "You may claim the newest discard to complete a triplet or quad from any other player. A sequence claim is narrower: only the player immediately after the discarder may make it. To form a sequence, you must already hold the other two numbers in the same suit. After claiming a sequence or triplet you discard without taking an ordinary draw. After a quad you take its replacement first.",
      "A legal win outranks every set claim. A triplet or quad outranks a sequence. This table resolves competing wins in favor of the player nearest the discarder in turn order. A passed opportunity does not create Riichi-style furiten: there is no special ban merely because the same winning kind appeared in your own discards. The engine still checks the complete shape and minimum fan every time. Never assume that a claim button means the whole hand already qualifies to win; set claims and win claims are separate legal actions.",
    ],
    [
      fact(
        "hk-chow-seat",
        "South discards. Which seat may claim that tile for a sequence?",
        ["East", "West", "North"],
        1,
        "West is immediately after South in turn order. A triplet could be claimed by any opponent.",
      ),
      fact(
        "hk-priority",
        "East can win and North can claim a triplet on the same discard. Which has priority?",
        ["The win", "The triplet"],
        0,
        "A legal win takes priority over triplets, quads and sequences.",
      ),
    ],
  ),
  hk(
    "flowers",
    "Replacing and scoring flowers",
    [
      "Expose a flower or season as soon as it is found, including during the initial deal. Replace it from the wall’s tail. If that replacement is another bonus tile, expose and replace again. Your ordinary hand keeps its required size. This profile keeps a sixteen-tile reserve, replenished as replacements use the tail. The remaining-live-tile counter reflects that boundary; the hidden reserve is never part of a coach input.",
      "A winner with no bonus tiles receives one fan. Otherwise, an own-seat plant earns one fan and an own-seat season earns one fan. A complete set of all four plants adds two fan, and all four seasons adds two fan. The own-seat tile within a complete quartet still earns its one, making that quartet worth three in this profile. A flower belonging to another seat earns nothing by itself.",
      "Collecting all eight replaces the individual flower and quartet awards with eight fan. It does not end the hand by itself at this table: you still need a winning structure. Some Hong Kong tables allow robbing an eighth flower or end immediately on all eight; those local rules are not part of this preset. If your in-person table uses another scoring practice, confirm the supported house settings before recording a result. A flower replacement and a quad replacement are different events; only the latter earns this profile’s quad-replacement win bonus.",
    ],
    [
      fact(
        "hk-own-flower",
        "Which plant number belongs to West?",
        ["1", "2", "3", "4"],
        2,
        "East is 1, South 2, West 3 and North 4.",
      ),
      fact(
        "hk-quartet",
        "At this table, how much is one complete plant quartet worth, including its own-seat plant?",
        ["One fan", "Two fan", "Three fan"],
        2,
        "The complete quartet adds two fan and its own-seat plant adds one.",
      ),
    ],
  ),
  hk(
    "minimum",
    "Shape, fan and eligibility",
    [
      "Fan are scoring units awarded for patterns and circumstances. The table requires at least three fan to win. A complete shape below that threshold must continue playing. Flowers count toward this Hong Kong minimum. A self-draw can supply an extra fan that a discard win would not have, so the same tile arrangement may qualify by one method and fail by the other.",
      "Four sequences and a pair earn one fan. With no flowers, the no-flower award adds one more. That arrangement has only two fan on a discard. If the winner draws the final needed tile themself, self-draw adds one and reaches three. The example below deliberately uses several suits and no scoring honor triplet, so nothing else raises its value. A pair of East tiles does not earn a wind-triplet award.",
      "Other accessible routes include all triplets, worth three fan, or one numbered suit together with honors, also worth three. The latter is a half flush. One suit with no honors is a full flush, worth seven. A minimum-score check is an exact rule; choosing how to develop the hand is a strategic judgment. Guided advice reports shape progress and unseen improving copies, while the shared scorer determines whether a completed hand really qualifies.",
    ],
    [
      {
        id: "hk-two-fan",
        prompt: "Can the displayed hand win on a discard with no flowers?",
        choices: ["Yes", "No"],
        answer: 1,
        explanation:
          "All sequences gives one fan and no flowers gives one. Two is below the three-fan minimum.",
        tiles: "123456m123p789s11z",
        verify: () => (scored("123456m123p789s11z").eligible ? "Yes" : "No"),
      },
      {
        id: "hk-three-fan",
        prompt: "Can that same arrangement win by self-draw?",
        choices: ["Yes", "No"],
        answer: 0,
        explanation: "Self-draw adds the third fan, making the hand eligible.",
        tiles: "123456m123p789s11z",
        verify: () =>
          scored("123456m123p789s11z", true).eligible ? "Yes" : "No",
      },
    ],
  ),
  hk(
    "honors",
    "Wind and dragon patterns",
    [
      "A triplet or quad of your seat wind earns one fan. A triplet or quad of the round wind earns one fan. The same East triplet earns both awards when you are East during the East round. A pair does not earn either award. A wind that is neither yours nor the round wind gives no ordinary wind fan in this profile, although it may help build a larger pattern.",
      "Each dragon triplet normally earns one fan. Two dragon triplets plus a pair of the third dragon form Little Three Dragons, worth five. Three dragon triplets form Big Three Dragons, worth eight. Those larger dragon patterns replace the individual dragon awards. Adding both would count the same required feature twice. The calculator and game use the same exclusion so the breakdown stays consistent.",
      "Three wind triplets and the fourth wind as the pair form Little Four Winds, worth ten. All four wind triplets form Big Four Winds, worth fifteen before the cap. A hand made entirely of honors is worth ten. Rare high-scoring patterns may overlap, but the ten-fan cap limits payments. When reviewing a hand, identify its sets first, then check the seat and round winds held during that hand. A player's final-game seat wind cannot be used to score an earlier hand.",
    ],
    [
      fact(
        "hk-double-wind",
        "You hold East in the East round. How much does an East triplet earn from wind awards?",
        ["One fan", "Two fan", "No fan"],
        1,
        "The seat-wind and round-wind awards each contribute one.",
      ),
      fact(
        "hk-dragon-exclusion",
        "Does Big Three Dragons also add three separate dragon-triplet awards?",
        ["Yes", "No"],
        1,
        "Its eight-fan award replaces the individual dragon awards.",
      ),
    ],
  ),
  hk(
    "payments",
    "From fan to payer amounts",
    [
      "Count the fan first, then apply the agreed conversion table. This preset uses half-spicy scoring: three fan converts to eight base points, four to sixteen, five to twenty-four, six to thirty-two, and higher levels continue up to the ten-fan cap of 128. Half-spicy is a conversion rule, not another pattern added to the hand. A different conversion scale changes payments without changing which tile patterns were detected.",
      "On a discard win in this Clear Chapter preset, the discarder pays twice the base and the other two opponents each pay the base once. At three fan, that means 16 from the discarder and 8 from each other opponent, for 32 received. On self-draw, all three opponents pay twice the base. A three-fan self-draw therefore receives 16 from each opponent, for 48 total. East pays and receives on the same basis as the other seats; there is no dealer multiplier.",
      "The calculator leads with these individual payment lines so players can check their own amount before recording. The scorekeeper transfers points between the named players and recomputes every later total after a correction. It does not silently turn points into money. Agree any stake separately. At the end of a session, raw point gains and losses determine the settlement. This Hong Kong profile has no Riichi deposits, rank bonuses or return-score adjustment.",
    ],
    [
      {
        id: "hk-discard-payment",
        prompt: "At three fan, how many points does the discarder pay?",
        choices: ["8", "16", "32"],
        answer: 1,
        explanation:
          "Three fan converts to base 8. The discarder pays twice the base, or 16.",
        verify: () =>
          String(
            hongKongPayments(3, { winner: 0, payer: 1, selfDraw: false }).find(
              (p) => p.seat === 1,
            )!.amount,
          ),
      },
      {
        id: "hk-self-payment",
        prompt: "At three fan by self-draw, how much does each opponent pay?",
        choices: ["8", "16", "48"],
        answer: 1,
        explanation:
          "Every opponent pays twice base 8. Forty-eight is the combined gain, not one player's payment.",
        verify: () =>
          String(
            hongKongPayments(3, { winner: 0, payer: 1, selfDraw: true })[0]!
              .amount,
          ),
      },
    ],
  ),
  hk(
    "quads",
    "Quads and replacement wins",
    [
      "A quad, also called a kong, is four identical tiles declared as one set. If all four are in your concealed hand, declare a concealed quad. If you hold three and claim the fourth from a discard, it is an open quad. If you previously exposed a triplet and later draw its fourth copy, you may add that tile to make an added quad. All three forms require a replacement draw and enough wall capacity.",
      "An added quad creates a win-claim opportunity before the fourth tile joins the set. An opponent whose eligible hand is completed by that tile may rob the quad. If they win, the original exposed triplet remains a triplet and the fourth tile goes to the winner. A concealed quad is not robbed at this table. A win on the ordinary replacement after a quad receives the quad-replacement fan; a flower replacement does not automatically receive it.",
      "Four completed quads plus the pair form a rare high-scoring hand, with eighteen physical tiles. It is still scored under the cap. Declaring quads can expose information and consume replacement capacity; an available quad is not proof that declaring it is strategically best. Live controls show legal options, and review leaves unsupported strategic judgments ungraded. No Riichi indicator is flipped after a quad, and no dora bonus exists in this variant.",
    ],
    [
      fact(
        "hk-robbing",
        "Which quad can be robbed at this table?",
        ["An added quad", "Every concealed quad"],
        0,
        "The exposed triplet's fourth tile is offered for a win claim before the upgrade completes.",
      ),
      fact(
        "hk-no-dora",
        "Does a quad reveal a dora indicator in Hong Kong Old Style?",
        ["Yes", "No"],
        1,
        "Dora is a Riichi rule. This variant awards its own scoring patterns instead.",
      ),
    ],
  ),
  hk(
    "specials",
    "Special hands and the cap",
    [
      "Thirteen Orphans is a closed hand made from one of every terminal and honor kind, plus a duplicate of one of those thirteen kinds. Terminals are the 1 and 9 of each numbered suit. Add the four winds and three dragons to get thirteen required kinds. It is not four ordinary sets and a pair, so the shape checker treats it separately. At this table its thirteen fan exceed the ten-fan payment cap.",
      "Nine Gates uses one numbered suit and a concealed arrangement containing three 1s, one each of 2 through 8, and three 9s, plus one additional tile in that suit. Its fifteen fan also exceed the cap. A dealer who wins on the initial uninterrupted draw receives the Heavenly Hand award. A nondealer's first uninterrupted self-draw can receive Earthly Hand. These initial wins are ten-fan hands in this profile; do not add an ordinary result's fan to invent a larger payment.",
      "Optional patterns vary sharply across Hong Kong tables. Seven Pairs, concealed-hand fan and flower robbery are not enabled in this Clear Chapter preset. Other apps may offer them under a different profile. The name and version recorded with the game identify which rules apply. Historical records are replayed with their recorded implementation; opening a past game never converts its rules or changes the active game on your device.",
    ],
    [
      fact(
        "hk-orphans-shape",
        "How many different kinds are required for Thirteen Orphans before its duplicate?",
        ["Twelve", "Thirteen", "Fourteen"],
        1,
        "Six terminal kinds plus four winds and three dragons make thirteen.",
      ),
      fact(
        "hk-cap",
        "Does a fifteen-fan hand pay more than a ten-fan hand under this preset?",
        ["Yes", "No"],
        1,
        "Both use the ten-fan cap when converting to payments.",
      ),
    ],
  ),
  hk(
    "match",
    "Match progression and review",
    [
      "A full match covers East, South, West and North rounds. Each round advances through four dealer positions. East keeps the deal after winning, so repeated hands can make a round longer than four actual deals. A nondealer win or a hand without a winner advances the deal in this profile. The app labels repeats separately; two rows called East 2 can refer to different recorded hands.",
      "Each player starts with 1,000 points. Payments always transfer points rather than create them, so the four scores still total 4,000 throughout the game. Scores may fall below zero without immediately ending this profile's match. Final standings rank the scores, and settlement reports each player's change from the starting score. Short East-only or East–South sessions use the same hand rules with a shorter recorded match length.",
      "Game details show the final context and every hand. In board review, the slider visits all players' recorded moves, while decision jumps reach your own useful moments. Opponents’ concealed tiles remain face-down. A coach comparison uses only the information available before your choice, never the later winner or a tile you eventually lost to. Its strategic preference is a heuristic, an explained estimate rather than a calibrated grade. Related Practice uses separate, validated examples; a saved game decision does not become a quiz answer just because the coach preferred another move.",
    ],
    [
      fact(
        "hk-repeat",
        "East wins. Who deals the next hand?",
        ["East again", "South"],
        0,
        "East repeats after its win in this profile.",
      ),
      fact(
        "hk-public-review",
        "May a later winning hand be used to judge an earlier discard?",
        ["Yes", "No"],
        1,
        "Review is outcome-blind and uses the immutable public information from the original decision.",
      ),
    ],
  ),
  ...MCR_LESSONS,
  ...TAIWANESE_LESSONS,
];
export function variantLessons(variant: VariantId): VariantLesson[] {
  return VARIANT_LESSONS.filter((l) => l.variant === variant);
}
export function validateVariantContent(): void {
  validateMcrGuide();
  const ids = new Set<string>();
  for (const l of VARIANT_LESSONS) {
    if (ids.has(l.id) || l.version !== 1)
      throw new Error("Invalid lesson identity");
    ids.add(l.id);
    for (const q of l.questions) {
      if (ids.has(q.id) || q.choices[q.answer] !== q.verify())
        throw new Error(`Invalid exercise ${q.id}`);
      ids.add(q.id);
    }
  }
}
