/** Original summaries of the frozen WMO 2006 table. The executable catalog
 * supplies values; this reference explains recognition and common exclusions. */
import { mcrPatterns } from "@openmahjong/engine";
type Family =
  | "Honors"
  | "Triplets and quads"
  | "Sequences"
  | "Tile composition"
  | "Special structures"
  | "Concealment and winning"
  | "Small combinations";
const entries: Record<string, readonly [Family, string, string]> = {
  "Big Four Winds": [
    "Honors",
    "Make a triplet or quad of each of the four winds, plus a pair.",
    "Replaces Little Four Winds, Big Three Winds, All Pungs, wind awards and terminal/honor-triplet awards.",
  ],
  "Big Three Dragons": [
    "Honors",
    "Make a triplet or quad of white, green and red dragons.",
    "Replaces Little Three Dragons, Two Dragons Pungs and the individual Dragon Pung awards.",
  ],
  "All Green": [
    "Tile composition",
    "Use only 2, 3, 4, 6 and 8 bamboo and green dragons.",
    "No numbered suit other than bamboo can appear. Do not separately count Half Flush or One Voided Suit.",
  ],
  "Nine Gates": [
    "Special structures",
    "Hold a concealed single-suit 1112345678999 structure completed by one extra tile of that suit.",
    "Requires the concealed nine-way base before winning; replaces Full Flush, Concealed Hand and the implied terminal-pung award.",
  ],
  "Four Kongs": [
    "Triplets and quads",
    "Declare four quads and complete the pair.",
    "Eighteen physical tiles are required. Replaces lesser kong combinations, All Pungs and Single Wait.",
  ],
  "Seven Shifted Pairs": [
    "Special structures",
    "Make seven pairs of consecutive numbers within one suit.",
    "Replaces Seven Pairs, Full Flush, Concealed Hand, Single Wait, No Honors and One Voided Suit.",
  ],
  "Thirteen Orphans": [
    "Special structures",
    "Collect every terminal and honor kind, then duplicate one of those thirteen kinds.",
    "Closed special structure; excludes All Types, Concealed Hand and Single Wait.",
  ],
  "All Terminals": [
    "Tile composition",
    "Every tile is a suited 1 or 9.",
    "Excludes All Pungs, Outside Hand, terminal-pung awards and No Honors.",
  ],
  "Little Four Winds": [
    "Honors",
    "Use three wind triplets or quads and the fourth wind as the pair.",
    "Excludes Big Three Winds and terminal/honor-pung awards for the required winds.",
  ],
  "Little Three Dragons": [
    "Honors",
    "Use two dragon triplets or quads and a pair of the third dragon.",
    "Excludes Two Dragons Pungs and the individual required Dragon Pung awards.",
  ],
  "All Honors": [
    "Tile composition",
    "Every tile is a wind or dragon.",
    "Excludes All Pungs, Outside Hand and terminal/honor-pung awards.",
  ],
  "Four Concealed Pungs": [
    "Triplets and quads",
    "Complete four triplets or quads without taking their completing tile from another player.",
    "A discard completing a triplet makes that triplet exposed for this count. Excludes All Pungs and Concealed Hand.",
  ],
  "Pure Terminal Chows": [
    "Sequences",
    "In one suit, use two 123 sequences, two 789 sequences and a pair of 5s.",
    "Excludes Full Flush, All Chows, Pure Double Chow, Two Terminal Chows and No Honors.",
  ],
  "Quadruple Chow": [
    "Sequences",
    "Use four identical sequences in the same suit.",
    "Excludes Pure Triple Chow, Pure Double Chow and Tile Hog for the same tiles.",
  ],
  "Four Pure Shifted Pungs": [
    "Triplets and quads",
    "Use four triplets in one suit whose numbers advance by one each time.",
    "Excludes Pure Shifted Pungs and All Pungs.",
  ],
  "Four Pure Shifted Chows": [
    "Sequences",
    "Use four sequences in one suit with starting numbers separated consistently by one or by two.",
    "Excludes Pure Shifted Chows, Short Straight and Two Terminal Chows implied by this structure.",
  ],
  "Three Kongs": [
    "Triplets and quads",
    "Declare three quads, concealed or exposed.",
    "Replaces the lesser three-kong constituent combinations; concealment may contribute where the rules permit.",
  ],
  "All Terminals and Honors": [
    "Tile composition",
    "Use only suited 1s, suited 9s, winds and dragons, with both suited and honor tiles present.",
    "Excludes All Pungs, Outside Hand and terminal/honor-pung awards.",
  ],
  "Seven Pairs": [
    "Special structures",
    "Make seven pairs with no declared sets. Four identical tiles may supply two pairs in MCR.",
    "Excludes Concealed Hand and Single Wait. A self-draw can still add Fully Concealed Hand.",
  ],
  "Greater Honors and Knitted Tiles": [
    "Special structures",
    "Use all seven different honors and seven distinct suited tiles from a knitted 147/258/369 suit assignment.",
    "No repeated kind and no declared set. Excludes Lesser Honors and Knitted Tiles, All Types and Concealed Hand.",
  ],
  "All Even Pungs": [
    "Triplets and quads",
    "Every set is a triplet or quad and every number, including the pair, is even.",
    "Only 2, 4, 6 and 8 suited tiles may appear. Excludes All Pungs and All Simples.",
  ],
  "Full Flush": [
    "Tile composition",
    "Use exactly one numbered suit and no honors.",
    "Excludes One Voided Suit and No Honors. Special higher patterns may replace this award.",
  ],
  "Pure Triple Chow": [
    "Sequences",
    "Use three identical sequences in the same suit.",
    "Excludes Pure Double Chow and cannot also treat those same tiles as Pure Shifted Pungs.",
  ],
  "Pure Shifted Pungs": [
    "Triplets and quads",
    "Use three triplets in one suit with consecutive numbers.",
    "Do not reinterpret the same tiles as Pure Triple Chow in the same scoring arrangement.",
  ],
  "Upper Tiles": [
    "Tile composition",
    "Every number is 7, 8 or 9 and no honor is present.",
    "Excludes Upper Four and No Honors.",
  ],
  "Middle Tiles": [
    "Tile composition",
    "Every number is 4, 5 or 6 and no honor is present.",
    "Excludes All Simples and No Honors.",
  ],
  "Lower Tiles": [
    "Tile composition",
    "Every number is 1, 2 or 3 and no honor is present.",
    "Excludes Lower Four and No Honors.",
  ],
  "Pure Straight": [
    "Sequences",
    "Use 123, 456 and 789 sequences in one suit.",
    "The three required sequences do not also earn Short Straight or Two Terminal Chows.",
  ],
  "Three-Suited Terminal Chows": [
    "Sequences",
    "Use 123 and 789 in each of two suits, with a pair of 5s in the third suit.",
    "Excludes All Chows, Mixed Double Chow, Two Terminal Chows and No Honors.",
  ],
  "Pure Shifted Chows": [
    "Sequences",
    "Use three sequences in one suit whose starts advance consistently by one or two.",
    "The same required sequences cannot be split into other repeated combination awards.",
  ],
  "All Five": [
    "Tile composition",
    "Every set and the pair includes a suited 5.",
    "Excludes All Simples and No Honors; honor tiles cannot satisfy a five-containing set.",
  ],
  "Triple Pung": [
    "Triplets and quads",
    "Use triplets or quads of the same number in all three suits.",
    "Excludes Double Pung for pairs drawn from the required three sets.",
  ],
  "Three Concealed Pungs": [
    "Triplets and quads",
    "Have three triplets or quads completed without claiming their final tile.",
    "A discard completing one of these triplets makes that triplet exposed for this count. Excludes Two Concealed Pungs.",
  ],
  "Lesser Honors and Knitted Tiles": [
    "Special structures",
    "Use fourteen distinct tiles drawn from a knitted suit assignment and the seven honors.",
    "No declared set. Excludes All Types and Concealed Hand; Greater Honors replaces it when all seven honors appear.",
  ],
  "Knitted Straight": [
    "Special structures",
    "Use 147 in one suit, 258 in another and 369 in the third, plus an ordinary set and pair.",
    "The nine knitted tiles are a special body, not three ordinary sequences. At most one ordinary set may be declared.",
  ],
  "Upper Four": [
    "Tile composition",
    "Every number is 6, 7, 8 or 9 and no honors appear.",
    "Excludes No Honors. Upper Tiles replaces it if only 7–9 appear.",
  ],
  "Lower Four": [
    "Tile composition",
    "Every number is 1, 2, 3 or 4 and no honors appear.",
    "Excludes No Honors. Lower Tiles replaces it if only 1–3 appear.",
  ],
  "Big Three Winds": [
    "Honors",
    "Have three different wind triplets or quads.",
    "Excludes terminal/honor-pung awards for those winds; applicable seat and round wind awards can still contribute.",
  ],
  "Mixed Straight": [
    "Sequences",
    "Use 123 in one suit, 456 in a second and 789 in the third.",
    "All three suits must be different. These sets are considered together under the non-repeat rules.",
  ],
  "Reversible Tiles": [
    "Tile composition",
    "Use only 1, 2, 3, 4, 5, 8, 9 circles, 2, 4, 5, 6, 8, 9 bamboo and white dragons.",
    "The allowed kinds refer to the conventional tile faces. Excludes One Voided Suit.",
  ],
  "Mixed Triple Chow": [
    "Sequences",
    "Use the same numbered sequence in each of the three suits.",
    "Excludes Mixed Double Chow for pairs within the required trio.",
  ],
  "Mixed Shifted Pungs": [
    "Triplets and quads",
    "Use three triplets in three different suits, with numbers stepping upward by one.",
    "Suit assignment can be permuted; the numbered steps must remain consecutive.",
  ],
  "Chicken Hand": [
    "Concealment and winning",
    "Win with a valid structure that earns no other non-flower pattern.",
    "Award exactly eight for this condition. Flowers may be added, but any other scoring feature removes Chicken Hand.",
  ],
  "Last Tile Draw": [
    "Concealment and winning",
    "Self-draw the last ordinary live-wall tile.",
    "Excludes Self-Drawn. A flower replacement is not the ordinary last-wall draw.",
  ],
  "Last Tile Claim": [
    "Concealment and winning",
    "Win on the final discard after the last ordinary wall draw.",
    "The discard must be the final live-wall discard, not merely the fourth visible copy.",
  ],
  "Out with Replacement Tile": [
    "Concealment and winning",
    "Win immediately on the ordinary replacement taken for a declared quad.",
    "Excludes Self-Drawn. If that replacement is a flower, the later flower replacement does not receive this award in this edition.",
  ],
  "Robbing The Kong": [
    "Concealment and winning",
    "Win on the tile used to upgrade an exposed triplet into a quad.",
    "Excludes Last Tile. A concealed quad is not robbable in this profile.",
  ],
  "All Pungs": [
    "Triplets and quads",
    "The four sets are all triplets or quads, with one pair.",
    "A higher pattern that necessarily requires All Pungs replaces this award where specified.",
  ],
  "Half Flush": [
    "Tile composition",
    "Use one numbered suit together with honors.",
    "Both suited tiles and honors must appear. Excludes One Voided Suit.",
  ],
  "Mixed Shifted Chows": [
    "Sequences",
    "Use three sequences in different suits whose starting numbers advance by one.",
    "Do not reuse the same required combination as another instance of this pattern.",
  ],
  "All Types": [
    "Tile composition",
    "Include characters, circles, bamboo, at least one wind and at least one dragon.",
    "Special honor-and-knitted hands and Thirteen Orphans already imply these categories and exclude this award.",
  ],
  "Melded Hand": [
    "Concealment and winning",
    "Declare all four sets using other players’ discards and win by discard on the pair.",
    "Excludes Single Wait. Concealed quads prevent this fully exposed condition.",
  ],
  "Two Concealed Kongs": [
    "Triplets and quads",
    "Declare two concealed quads.",
    "This frozen 2006 profile awards eight, rather than the six used in later tables. Do not also count the two individual Concealed Kong awards.",
  ],
  "Two Dragons Pungs": [
    "Honors",
    "Have triplets or quads of two different dragons.",
    "Replaces the two individual Dragon Pung awards. Little or Big Three Dragons replaces this combination.",
  ],
  "Outside Hand": [
    "Tile composition",
    "Every set and the pair contains a terminal or an honor.",
    "A sequence qualifies only as 123 or 789. All Terminals, All Honors and All Terminals and Honors replace it.",
  ],
  "Fully Concealed Hand": [
    "Concealment and winning",
    "Keep the hand closed and win by self-draw; concealed quads are permitted.",
    "Excludes Concealed Hand and Self-Drawn. Certain special hands can add it when self-drawn.",
  ],
  "Two Melded Kongs": [
    "Triplets and quads",
    "Declare two exposed quads, whether directly claimed or upgraded.",
    "Replaces the two individual Melded Kong awards; larger quad combinations may replace it. In this 2006 edition, one concealed plus one melded kong scores six together instead of the individual awards; that combination is not another catalog pattern.",
  ],
  "Last Tile": [
    "Concealment and winning",
    "Win with the fourth copy when the other three copies are already visible before the win.",
    "Visibility comes from public tiles, not hidden hands or the actual wall. Robbing The Kong excludes it.",
  ],
  "Dragon Pung": [
    "Honors",
    "Have a triplet or quad of any one dragon.",
    "Each different dragon may qualify until a larger dragon combination replaces the individual awards.",
  ],
  "Prevalent Wind": [
    "Honors",
    "Have a triplet or quad matching the current round wind.",
    "Can combine with Seat Wind for the same set when both winds match. Do not add a terminal/honor-pung point for that same award.",
  ],
  "Seat Wind": [
    "Honors",
    "Have a triplet or quad matching your seat wind during this hand.",
    "Use the seat at decision time. It can combine with Prevalent Wind when both are the same wind.",
  ],
  "Concealed Hand": [
    "Concealment and winning",
    "Keep every ordinary set closed and win on a discard; concealed quads are permitted.",
    "Fully Concealed Hand covers a closed self-draw. Some special structures already include this condition and exclude the award.",
  ],
  "All Chows": [
    "Sequences",
    "Use four sequences and a pair of suited tiles.",
    "An honor pair disqualifies this pattern. Excludes No Honors.",
  ],
  "Tile Hog": [
    "Small combinations",
    "Use all four copies of a kind within the hand without declaring them as a quad.",
    "Count different four-copy kinds separately, except when a higher pattern explicitly includes those copies.",
  ],
  "Double Pung": [
    "Small combinations",
    "Have two triplets or quads of the same number in two different suits.",
    "Triple Pung replaces its constituent Double Pung combinations.",
  ],
  "Two Concealed Pungs": [
    "Triplets and quads",
    "Complete two triplets or quads without taking their completing tile from another player.",
    "A discard-completed triplet is exposed for this count. Three or Four Concealed Pungs replaces it.",
  ],
  "Concealed Kong": [
    "Triplets and quads",
    "Declare four identical concealed tiles as a quad and take a replacement.",
    "Two Concealed Kongs replaces two individual awards. The fourth tile is not counted again as Tile Hog.",
  ],
  "All Simples": [
    "Tile composition",
    "Every tile is a suited number from 2 through 8.",
    "Excludes No Honors. Middle Tiles, All Five and All Even Pungs already include this condition and replace it.",
  ],
  "Pure Double Chow": [
    "Small combinations",
    "Use two identical sequences in the same suit.",
    "The two sets cannot be counted as the same combination twice. Larger identical-sequence patterns replace their implied lower awards.",
  ],
  "Mixed Double Chow": [
    "Small combinations",
    "Use two sequences with the same numbers in different suits.",
    "Mixed Triple Chow replaces combinations formed solely from its required three sets.",
  ],
  "Short Straight": [
    "Small combinations",
    "Use two sequences in one suit to cover six consecutive numbers, such as 234 and 567.",
    "Pure Straight and larger shifted-sequence patterns replace the lower combinations they imply.",
  ],
  "Two Terminal Chows": [
    "Small combinations",
    "Have 123 and 789 sequences in the same suit.",
    "Pure Straight or a terminal-chow special pattern can replace this implied combination.",
  ],
  "Pung of Terminals or Honors": [
    "Small combinations",
    "Have a terminal triplet or a non-scoring wind triplet.",
    "Dragons, seat winds and round winds use their own awards. Higher wind or terminal/honor patterns may exclude this point.",
  ],
  "Melded Kong": [
    "Triplets and quads",
    "Declare an exposed quad by claiming a discard or adding to an exposed triplet.",
    "Larger quad combinations replace their constituent individual awards. No separate immediate quad payment is made.",
  ],
  "One Voided Suit": [
    "Tile composition",
    "Use exactly two of the three numbered suits; honors may also appear.",
    "Full Flush, Half Flush and other specified patterns already imply missing suits and exclude this award.",
  ],
  "No Honors": [
    "Tile composition",
    "The entire hand contains only numbered suits.",
    "Many larger composition patterns and All Chows already imply this and exclude the extra point.",
  ],
  "Unique Wait (Edge)": [
    "Concealment and winning",
    "Win with 3 completing 12, or 7 completing 89, when it is the hand’s only winning kind.",
    "A different legal completion elsewhere in the hand disqualifies the unique wait. Only one wait-type point is used.",
  ],
  "Unique Wait (Closed)": [
    "Concealment and winning",
    "Win on the middle tile of a sequence, with no other winning kind available.",
    "Use the actual winning tile and pre-win structure, rather than a convenient later rearrangement. Only one wait-type point is used.",
  ],
  "Unique Wait (Single)": [
    "Concealment and winning",
    "Win by completing the pair when this is the hand’s only winning kind.",
    "Melded Hand, Seven Pairs, Thirteen Orphans and certain higher patterns exclude this point.",
  ],
  "Self-Drawn": [
    "Concealment and winning",
    "Win on your own ordinary draw.",
    "Fully Concealed Hand, Last Tile Draw and Out with Replacement Tile replace this one-point award when applicable.",
  ],
  "Flower Tiles": [
    "Concealment and winning",
    "Expose each unique flower or season and take its replacement. Each is one point after a valid win.",
    "Flowers never help meet the eight-fan minimum. They do not fill the fourteen ordinary structural places.",
  ],
};
export function mcrPatternGuide() {
  return mcrPatterns().map((pattern) => {
    const row = entries[pattern.name];
    if (!row) throw new Error(`Missing MCR reference: ${pattern.name}`);
    return {
      ...pattern,
      family: row[0],
      description: row[1],
      restrictions: row[2],
    };
  });
}
export function validateMcrGuide(): void {
  const rows = mcrPatternGuide();
  if (Object.keys(entries).length !== 81 || rows.length !== 81)
    throw new Error("Incomplete MCR reference");
}
