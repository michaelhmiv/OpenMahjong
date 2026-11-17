# Taiwanese — Every-flower, no Ting, 30/10

Identity: `taiwanese`, `openmahjong-taiwanese-every-flower@1`, engine/replay 3, CPU policy 1. This is a **named OpenMahjong table profile**, not a claim to implement every Taiwanese house rule or to reproduce a commercial app exactly. Rules facts were checked 2026-11-17 against:

- [IGS/gametower, Taiwanese 16-tile scoring](https://www.gametower.com.tw/Games/Freeplay/MJ/Star31/Data/count.aspx), **the 16-tile section only**, including its every-flower/every-wind special rules. The page also contains unrelated 13-tile tables; those are not imported.
- [IGS/gametower inventory and hand structure](https://www.gametower.com.tw/Games/Freeplay/MJ/Star31/Data/mjintro.aspx).
- [Chinese Mahjong League tournament rules](https://cml88.com/賽事規則/), Taiwanese sections II–IX, XVII and XIX, for flower passes, claim restrictions, passed wins, fixed reserve and the completed-hand eight-flower option.
- [Mahjong Wiki's IGS/LA comparison](https://mahjong.wikidot.com/rules:taiwanese-scoring) and [optional Ting](https://mahjong.wikidot.com/rules:taiwanese-gameplay), cross-checking exclusions and marking genuine table differences.
- [Mahjong Orchid payment/profile comparison](https://mahjongorchid.com/en/rules/), for payer-specific dealer arithmetic and clearly identified alternative profiles. Its own seat-flower profile is not substituted for this every-flower table.

All tutorial and explanatory prose is original. Sources are linked, not copied wholesale. Ambiguities are resolved below and frozen in the recorded profile; no claim of commercial-app or tournament certification.

## Inventory, lifecycle and legal actions

144 tiles, no red fives; sixteen standing structural tiles, **seventeen to win: five sets and a pair**, plus one extra physical tile per quad. Five quads therefore require 22 physical tiles. Seven Pairs, Orphans, Nine Gates and MCR knitted structures are not special wins here. Flowers are exposed and replaced, never structural tiles.

Packet-deal sixteen each, then give the dealer the extra door tile **before** initial flower replacement, for seventeen. The digital profile assigns East to the dealer (matching IGS's introduction); no separate random wall-opening seat wind is scored in this every-wind table. During initial replacement, dealer-ordered passes replace the flowers currently exposed; a replacement flower waits until the next pass. During play replacements chain immediately from the tail. Keep a fixed sixteen-tile reserve, replenished as replacements consume tail tiles; no extra reserve growth per quad in this profile. At wall exhaustion no replacement or discard is invented.

Win > pung/kong > chow; nearest eligible winner wins a discard. Chow only from the preceding player. Pung/open kong from any other seat (CML's stated claim rule); no simultaneous wins. Ordinary set claims require at least four live tiles remaining. Concealed/added quads require a drawing turn and replacement capacity; no quad immediately after chow/pung. All four faces and IDs of an opponent's concealed quad remain hidden in live, review and coach views.

After chow, prohibit discarding the taken kind or the equivalent tile at the other end of the sequence; after pung prohibit the taken kind. A chow option that immediately reverses the player's prior discard is also excluded until their next drawing turn. Passing a pung blocks another pung/open kong of that kind until the player's next ordinary draw. Added kong robbery is allowed; concealed kong robbery is not.

**Passed win (過水):** declining an eligible discard win or self-draw blocks every win, including self-draw, until a discard outside the pre-turn winning kinds, or a concealed/added quad, restores eligibility. Merely drawing does not clear it. An open-kong replacement cannot be won by self-draw, including subsequent flower replacements; a later concealed/added kong restores this eligibility. These restrictions have isolated per-match adapter state, replay deterministically, and appear in the owning player's public view. They are not Riichi furiten flags.

East repeats after its win or a drawn hand, incrementing the dealer-repeat count. A nondealer win advances the dealer and resets repeats. This named digital profile caps repeats at ten, then advances even after a win/draw; the cap is explicitly taught and comes from the published online-table convention. Full game: four rounds of four dealer positions plus repeats. Short lengths use identical hand rules. Start 1,000 each, allow negative scores, no bust-out, deposits or rank bonuses.

Ting, Heavenly/Earthly Ready declarations, seven-flower robbery, immediate four-quad wins, automatic penalty adjudication and physical handling/timing fouls are excluded from this **no-Ting** preset. Legal controls prevent invalid tile actions. This is not a playable American variant.

## Frozen tai table

Tai add linearly, with no minimum and no cap. A zero-tai complete hand wins the base. The following is the entire enabled table:

| Feature                                          |       Tai | Counting rule                                                                                                                             |
| ------------------------------------------------ | --------: | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Each wind triplet/quad                           |         1 | Every wind; no seat/round awards on top                                                                                                   |
| Each dragon triplet/quad                         |         1 | Replaced by Little/Big Three Dragons                                                                                                      |
| Each exposed flower/season                       |         1 | Every flower, independent of seat                                                                                                         |
| Complete plant or season quartet                 |         2 | Adds to the four individual flower points                                                                                                 |
| Eight Immortals                                  |         8 | Replaces all individual/quartet flower awards; **requires a completed five-set hand**, following CML XIX(6), not IGS's instant-win option |
| Concealed discard win                            |         1 | Concealed quads allowed                                                                                                                   |
| Self-draw                                        |         1 | Replaced by concealed self-draw when closed                                                                                               |
| Concealed self-draw                              |         3 | Replaces the preceding two awards                                                                                                         |
| Unique edge/closed/pair wait                     |         1 | Actual winning kind must be the sole structural wait; All Claimed replaces it                                                             |
| All Claimed                                      |         2 | All five sets exposed, discard win, no concealed quad; excludes unique wait                                                               |
| All sequences                                    |         2 | Five sequences, suited pair, no flowers/honors, actual two-sided discard completion; not self-draw, pair completion or unique wait        |
| No honors or flowers                             |         2 | Every-flower special rule; a separate additive award in this named profile, including when All Sequences also applies                     |
| Three / four / five concealed triplets           | 2 / 5 / 8 | Highest tier only; a ron-completed triplet is exposed for this count                                                                      |
| All triplets                                     |         4 | Five triplets/quads plus pair; can add to All Honors/five concealed triplets                                                              |
| One suit plus honors / Full flush / All Honors   | 4 / 8 / 8 | Mutually exclusive suit-composition awards                                                                                                |
| Little / Big Three Dragons                       |     4 / 8 | Replace individual dragon awards                                                                                                          |
| Little / Big Four Winds                          |    8 / 16 | Replace individual wind awards in this every-wind profile                                                                                 |
| Each open/added quad / concealed quad            |     1 / 2 | Concealed quad gets two, not two plus one                                                                                                 |
| Quad or flower replacement win                   |         1 | Adds self-draw/closed self-draw as applicable; open-kong replacement restriction still governs eligibility                                |
| Robbing an added quad                            |         1 | Discard payment, no self-draw                                                                                                             |
| Last ordinary live-wall self-draw                |         1 | Adds self-draw; no last-discard bonus in this profile                                                                                     |
| Heavenly / Earthly first uninterrupted self-draw |   24 / 16 | Replace concealment, self-draw and unique-wait awards; other structural/flower awards remain additive                                     |

The primary and comparison tables disagree on All Claimed, replacement value, instant flower wins and flower/seat treatment. The selected values above are deliberate supported defaults. The UI, tests and calculators all use this same table. Ambiguous concealed decompositions use the maximum coherent score; declared sets remain fixed. This is documented OpenMahjong behavior rather than an undocumented attempt to emulate a commercial tie-breaking heuristic.

## Payments

Default base **30**, each tai **10**. Ron: discarder alone pays. Self-draw: all three pay individually. For each payer, add **1 + 2 × dealer repeats** tai only if the winner **or that payer** is the dealer. The bonus is per payment, never added indiscriminately to the hand's detected tai. Example: a nondealer's 3-tai self-draw on the dealer's second repeat receives 110 from the dealer and 60 from each other player. The same winner's ron against a nondealer receives only 60.

In-person base/unit may be changed to positive integer point values. Dealer, repeat count, winning event and settings are recorded with the hand. Fast entry takes agreed tai **excluding dealer bonuses**. Tile entry detects the table above, then permits separate, reasoned corrections before confirmation. CPU defaults remain 30/10. No cash unit, account or paid service is assumed.

## Fixed-size audit

The separate adapter/controller uses `standingTiles=16`, `sets=5`; generic structural validation counts quad extras. AI uses a five-set suit-segment analyzer, differentially checked against the engine's independent five-set DFS. Eligible waits use the shared Taiwanese scorer. Schema-three restore validates and reproduces legal actions and adapter restrictions. TableModel records actual deal/draw/meld IDs without slicing to thirteen/fourteen. Own-hand and review grids wrap seventeen tiles; Large Tiles and Focus Frames preserve legal selection and public masking. Educational tile rows and executable examples use seventeen-tile structures; no Riichi exercise validator is reused.
