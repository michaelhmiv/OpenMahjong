# Learning success and measurement plan

Status: proposed measurement definitions. Existing match/tutoring records supply
some inputs; this document does not introduce remote analytics, tracking cookies
or a new collection service. No target improvement or user-performance result has
been measured here.

## Decision and measurement principles

The decision is whether learning/review/practice helps a player make better
independent choices and retain the concepts. Time in app, streaks and repeat
visits are not substitutes. Start with inspectable local calculations and consented
research; aggregate remotely only after a concrete privacy/data-retention decision.

Keep exercise identity/version, ruleset/version, evaluator version, assistance,
difficulty and sample size alongside evidence. A completion is exposure; a
correct answer after feedback is different from a first unassisted answer.
Do not compare hidden-information analysis with ordinary player-perspective play.

## Core measures

| Measure | Exact numerator and denominator / inclusion | What a change would mean |
|---|---|---|
| Introductory completion | Distinct learners completing the defined introductory set ÷ learners starting that set in the same observed cohort; exclude optional TU-10 from mandatory-set completion | Finds a beginner pathway drop-off; does not prove rule understanding |
| First guided game completion | Learners completing a first guided match ÷ learners starting a first guided match; use match ID, not every resume | Indicates navigability; distinguish unfinished games from storage loss |
| First unassisted tile/shape accuracy | Correct first answers ÷ valid first attempts on specified unseen tile/shape tasks, assistance=false | Measures a specific basic skill; show number of distinct tasks |
| Wait-reading accuracy | Correct complete wait sets ÷ unassisted first attempts on supported ruleset/version; extra or missing waits are incorrect | Finds wait-reading gaps rather than measuring match luck |
| Retained skill accuracy | Correct unassisted responses on scheduled review tasks ÷ valid review attempts, bucketed by time since last success | Tests retention; use held-out equivalent positions to reduce memorized-answer effects |
| Retry burden | Sum of wrong attempts before first success ÷ completed exercise sessions; report abandoned sessions separately | Reveals confusing content or difficulty; never reward retry counts as mastery |
| Review uptake | Distinct finished local/unrated matches with at least one decision inspected ÷ reviewable finished matches | Shows discoverability of review, not analysis quality |
| Review-to-practice conversion | Reviewed decisions saved and subsequently attempted in practice ÷ reviewed decisions saved for practice | Tests whether the workflow connects; deduplicate a position/content revision |
| Shanten opportunity | Decisions choosing a minimum-shanten legal discard ÷ analyzed discard decisions with exact legal candidate facts | A narrow efficiency measure; never label overall “optimal play” |
| Ukeire opportunity loss | For decisions at the minimum shanten, sum(best visible-availability ukeire − chosen ukeire) ÷ comparable decisions; retain tradeoff/assistance tags | Shows acceptance tradeoffs; value/defense can justify a lower number |
| Practice transfer | Change in held-out unassisted skill accuracy before/after a specified practice unit, within learner and skill | Suggests transfer; observational before/after alone does not prove causation |
| Perceived explanation usefulness | Optional useful/unclear responses ÷ explanations rated; offer a “rule appears wrong” report | Finds explanation problems; do not infer unobserved satisfaction |

“Learner” is a local profile or consented research participant. Device-local data
cannot honestly estimate unique people across browsers. Cross-device account
cohorts need a reviewed pseudonymous aggregation design before those denominators
are reported globally. Cohort windows and observation cutoff must be explicit.

## Match statistics already represented

`records.ts` counts hands from `hand-start`, riichi declarations, own ron deal-ins,
hand wins and won payments plus awarded riichi sticks. `sumRecords` combines
private client records; the server stores client-provided counters. These are
useful personal statistics, not verified competitive performance.

| Metric | Definition | Caveat |
|---|---|---|
| Games played | Number of included completed match records | User/id deduplication required; exclude partial matches |
| Match win rate | First-place match records ÷ included matches | Distinct from hand-win rate |
| Average placement | Sum of placements ÷ included matches | Show sample and match length; do not compare incompatible rulesets |
| Riichi rate | Own riichi declarations ÷ hands played | Abortive redeals count as hands in the current event fold |
| Deal-in rate | Hands lost by own ron discard ÷ hands played | Self-reported history; clarify multi-ron policy if later changed |
| Hand-win rate | Own winning hands ÷ hands played | Separate ron/tsumo only when recorded, rather than inventing a split |
| Average won points | Won payments plus awarded sticks ÷ own hand wins | Not average pre-honba hand base value; label consistently |

Placement distribution, average score, call rate, ron/tsumo splits and situational
statistics require explicit event-derived counters and versioned migrations.
Legacy rows with missing hand statistics must remain outside hand-level
denominators; zero means an observed zero, not “unknown.”

## Mandatory segmentation

Keep ruleset/version, engine/analysis version, East vs East+South, AI strength,
assisted vs independent, guest/account storage scope, and local/unrated vs future
server-authoritative/rated games distinct. Aggregate only compatible strata and
show counts. Never silently mix old incorrectly scored legacy records with
corrected-engine records to claim a player trend.

Small samples should show counts/ranges and a neutral “more evidence needed”
state. A proficiency estimate needs a transparent formula, evidence count and
content coverage; do not turn every completed lesson into a confident rating.

## Evaluation plan and guardrails

1. Validate instrumented event identity, deduplication and version/assistance tags
   with deterministic synthetic fixtures before collecting user data.
2. Run a short consented beginner usability study through Learn → guided Play.
   Record task success and misconceptions, not raw keystrokes or unrelated pages.
3. Once Review/Practice ships, compare unseen equivalent tasks before/after the
   targeted practice unit; report attrition and uncertainty.
4. Audit recommendations: each must link to actual weak-skill evidence and an
   available exercise. Track a wrong/unclear explanation report as a quality issue.
5. Set numerical product targets only after a reproducible baseline exists. A
   desirable direction is higher held-out independent accuracy and retention,
   with stable accessibility, crash-free saves and ordinary-action latency.

Guardrails: no mandatory account for learning, no public exposure of private
weaknesses, no addiction-oriented notifications, no inferred demographic profiles,
no raw OAuth/session identifiers in metrics, and user deletion/export semantics
before account-linked learning analytics. Use aggregates only at an agreed
minimum cohort size; retention/collection periods require a recorded decision.
