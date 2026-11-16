# Decision analysis methodology

Status: implemented discard analysis, revision `discard-analysis-2`. This is a
deterministic teaching aid backed by a lightweight opponent policy. It does not
claim expert play, calibrated danger probabilities, expected value, or optimal
actions. The active profile is `openmahjong-riichi@1`; WRC/EMA are useful rule
references, not a silent replacement for that profile.

## Information boundary

`adviseDiscard(view, context)` accepts the viewing player's own concealed tiles,
public ponds/melds/indicators/scores, and the engine's action context. Other
hands, future events, eventual outcomes, and unrevealed wall tiles are absent
from the input. Review callers must reconstruct the view at the decision point,
not derive it from the final table. Full-information inspection must use a
different, explicitly labeled mode; the current coach exposes only
`player-perspective`.

An analysis result identifies its schema, evaluator, engine revision, opponent
policy revision, and ruleset. A saved position or cached result must retain all
five. Historical engine/policy v1 remains frozen for replay compatibility and
must not be relabeled as current revision 2 analysis.

## Facts and judgments

| Output | Meaning | Qualification |
| --- | --- | --- |
| `shantenAfter` | Minimum structural shanten over applicable standard, seven-pairs and thirteen-orphans forms after a discard | Zero means shape tenpai, not guaranteed yaku, drawable copies, or legal ron |
| `waits` | Shape-completing types, excluding a fifth copy already owned across hand and melds | Engine win legality still governs yaku and all forms of furiten |
| `improvingTotal` | Sum of unseen copies whose draw reduces structural shanten | Some copies may be in opponents' hands or the dead wall |
| `TileRef.live` / `liveTotal` | Legacy field names for unseen-copy counts | These are not known live-wall tile counts |
| `furiten` | A wait type appears in the player's own discard history, including the proposed discard | Does not include temporary or riichi-pass furiten; those flags are not exposed by `PlayerView` |
| `genbutsuAgainst` | Riichi opponents who previously discarded this type | Protects against ron from those opponents only |
| `genbutsu` | The type appears in every current riichi opponent's discard history | Says nothing about an unmodeled non-riichi opponent or tsumo |
| `danger` | Maximum relative heuristic danger across current riichi opponents | Arbitrary relative units; neither probability nor expected loss |
| `isRed` / `doraDiscarded` | Physical red-five identity and bonus dora lost by an exact discard instance | Dora alone never establish a yaku; this is not a final hand-value estimate |
| Ordering / `recommendation` | Shared opponent-policy preference under its documented priorities | A suggestion, not an objectively best move |
| `riichi.recommended` | The shared policy's riichi/dama heuristic favors declaration on that candidate | No expected-value comparison is computed |

For a proposed discard `d`, unseen copies of type `t` are
`4 - concealedAfterDiscard[t] - publicAfterDiscard[t]`. Public counts include
all exposed meld tiles and indicators. A called tile remains in pond history,
but is counted physically in its meld only. The discarded tile joins public
counts immediately; it is never returned to the unseen pool. Exhausted public
waits may have count zero. A hypothetical fifth owned tile is excluded.

## Shared evaluation

The opponent and coach use `evaluateDiscards`, `rankDiscardCandidates`, and
`shouldDeclareRiichi` from the AI package. The coach no longer maintains a
second copy of discard ranking or riichi reasoning.

1. Opponents evaluate one representative per type, keeping a plain five when
   possible. Coaching requests all physical instances, so review can analyze a
   different plain copy or a deliberate red-five discard. Equal plain copies
   retain stable hand order; the recommendation agrees with the canonical
   opponent choice. In
   riichi, the actual drawn instance is the sole discard candidate, including
   a red five drawn alongside plain copies.
2. Prefer lower shanten. Within that tier, score unseen acceptance, number of
   improving types, tile-retention value, red fives, and selected yakuhai waits.
3. Preserve a legal riichi declaration among shanten-best candidates when not
   folding.
4. Against riichi, fold when not tenpai unless one-shanten and the hand remains
   closed or reaches the policy's rough value threshold. When pushing, prefer
   lower danger within the shanten-best pool. When folding, prioritize danger
   even if the shape worsens.
5. Decline riichi with no unseen winning copies or a single unseen copy late in
   the hand. The high-value dama shortcut requires an independently known yaku;
   dora alone never qualify. Repeated dora indicators count separately and a
   double seat/round wind triplet contributes two han to the value proxy.

These thresholds are heuristics. The value proxy omits many yaku and fu, does
not predict a final score, and does not evaluate placement or future hand
development. Current defense covers riichi threats only. Suji discounts
ryanmen possibilities under furiten assumptions; middle tiles need both suji
partners to cover both sides. Kanchan, penchan, tanki, shanpon, special hands,
and other opponents can remain dangerous. Kabe likewise narrows possibilities
without proving safety.

`most-improving-tiles` is derived from actual unseen acceptance within the
shanten-best tier. `policy-preference` identifies the weighted evaluation.
Two wait types are labeled `two-wait-types`, since two types may be shanpon
rather than a two-sided sequence wait.

## Review comparisons

`compareDiscards(advice, chosenTileId, alternativeTileId?)` reports chosen-minus-
alternative shanten, unseen acceptance, relative danger, and bonus dora
discarded. Red/plain five alternatives have the same structural counts but
different dora-retention evidence. The default
alternative is the shared policy's recommendation. Observations such as
`higher-shanten` or `fewer-unseen-improving-copies` describe a tradeoff; they do
not declare a strategic mistake. The function accepts only analyzed options
and does not consume later game outcomes. It is a headless primitive, not a
finished game-review screen or a personalized training queue.

## Verification and future calibration

The suite combines hand-derived wait and shanten fixtures with seeded
differential comparisons against the independent engine implementation. A
disagreement requires investigating both implementations. Matching two
implementations is not itself proof of rules correctness.

Regression cases cover called-tile identity, post-discard visibility/furiten,
multiple riichi, partial versus complete suji, red-five tsumogiri, repeated
indicators, double wind, dora without yaku, and coach/policy agreement on real
games. Whole-game soaks check legality, determinism, wall and score accounting.
The benchmark measures compute latency on its actual host; it is not evidence
of mobile frame rate or long-term strategic strength.

Before adding probabilities or severe mistake grades, collect independently
reviewed positions, reserve held-out evaluation sets, compare against stronger
validated policies, and report uncertainty and model assumptions. Sampling
must preserve all public observations, use comparable randomness across
alternatives, expose sample size, and support cancellation. These advanced
probabilistic methods and their calibration are proposed work, not implemented
capabilities.
