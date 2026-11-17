# Executable variant adapters

Status, 2026-11-17: Riichi retains its existing controller and historical engines. Hong Kong Old Style, MCR WMO 2006 and Taiwanese Every-flower now have executable, engine-three profiles. American is a payment helper only. Photo recognition is excluded. See the [approved program](../implementation-program.md) for the owner's process exception and [verification](../audit/program-verification.md) for actual checks.

`engine/src/variants/types.ts` defines the adapter boundary. Adapters own inventory, standing size, winning structure, score, payments, legal contexts, public projection, replacement semantics and dealer progression. Taiwanese's per-match restriction state is created fresh by the registry; it is never shared across independent games. The common Chinese-family coordinator shares proven packet dealing, physical identities, calls and event transport without executing the Riichi state machine.

| Variant | Recorded profile | Hand | Scorer and lifecycle |
| --- | --- | --- | --- |
| Hong Kong Old Style | `openmahjong-hkos@1` | 13/14; four sets | Clear Chapter, min3/cap10, flowers, half-spicy, sourced splits/repeats |
| MCR | `openmahjong-mcr-2006@1` | 13/14 plus special forms | All81/exclusions, flower-excluded minimum8, MCR payments,16 fixed hands |
| Taiwanese | `openmahjong-taiwanese-every-flower@1` | 16/17; five sets | Every-flower tai, passed-win/claim restrictions, per-payer dealer bonus, repeats |

Every profile integrates CPU seat drivers, original lessons, heuristic coaching, board review, validated practice, calculator, variant-scoped statistics/history and local/private account resume. Their rule briefs record supported defaults and excluded alternatives. Shared schema-three validation is imported by both client and server; unknown identities/versions fail explicitly. In-person ledgers have their own version and endpoints, and never enter CPU statistics.

The sections below retain the baseline investigation and design rationale. Statements about baseline coupling describe Riichi, not the new adapters.

## Actual coupling

The baseline uses 34 tile kinds ×4 physical copies, fixed suit/honor indexing,
four seats, a four-meld-and-pair/chiitoitsu/kokushi analyzer, riichi/furiten/dora,
Japanese han/fu scoring, riichi draw rules and East/South match settlement.
`Game`, scoring, the AI policy, coach reasons and tutorial terminology all assume
those mechanics. A descriptor naming those choices makes current behavior
explicit; it does not make another tradition an additive configuration file.

## Shared primitives versus game family

| Reasonable reusable primitive | Must remain variant-owned unless proven shared |
|---|---|
| Deterministic RNG and shuffle utilities | Tile inventory, flowers/seasons/jokers and replacement draws |
| Physical tile identity and serialization framework | Legal hand families and wildcard interpretation |
| Seat/turn identifiers and action-envelope transport | Seat count, exchanges, turn phases, claims and priorities |
| Versioned record/content identity and validated storage | Win eligibility, scoring/fan/limits and settlement |
| UI tile-rendering/accessibility primitives | Required table controls, scoring explanations and terminology |
| Generic exercise/review lifecycle | Correct answers, skill taxonomy extensions and curriculum |

Avoid a “riichi plus flags” interface with dozens of mutually dependent options.
A variant implementation may share an analyzer without sharing a controller or
scorer. American exchanges cannot be expressed honestly as another riichi draw
flag.

## Contract rationale

A registry entry identifies a variant family, immutable ruleset ID and
version, executable rules implementation version, supported record schema,
capabilities and educational vocabulary. A family-specific adapter owns:

1. Tile inventory and validated physical instances.
2. Initial state and legal action contexts by phase.
3. Transition validation/application and public-seat projection.
4. Winning-shape/eligibility evaluation and settlement.
5. Match lifecycle and termination policy.
6. Versioned serialization/restore and deterministic replay.

Shared consumers should ask capabilities such as “supports declaration” or
“supports tile exchange,” not infer them from a riichi action name. Prefer typed
family-specific command/state unions over a dictionary of optional fields. This
is a proposed contract shape; implement it after authoritative fixtures expose
what the second game's adapter actually needs.

## Candidate investigation

| Candidate | Questions before implementation | Education implications |
|---|---|---|
| Hong Kong | Which named published rules/scoring variant? Flowers/seasons? Minimum fan and settlement choices? | Dedicated fan/eligibility/call explanations, not riichi han/fu copy |
| Chinese Official / MCR | Authoritative current rules edition, 81-pattern scoring/exclusions, minimum-score legality and flower handling | Dedicated pattern-combination exercises and restrictions |
| American | Which rules authority/card arrangement, Charleston, jokers, exchange restrictions, card eligibility and scoring? | Card/version-specific original or licensed examples; no riichi yaku advice |

Select the next variant using demonstrated demand, accessible authoritative rules,
implementation clarity, content rights and maintainable test scope. No demand
survey or licensing agreement was completed in this audit, so no candidate is
represented as approved.

## American content and rights gate

The inspected [National Mah Jongg League site](https://www.nationalmahjonggleague.org/)
markets annual cards. That source is evidence of year-specific content, not a
license to reproduce it. Before importing any annual-card hand patterns or assets,
record the rights holder, permitted use, attribution/redistribution terms,
applicable edition and expiration/update procedure. If permission is unavailable,
keep proprietary content out of repository, fixtures, generated puzzles and UI.

Do not call a generic joker/Charleston experiment full American mahjong support.
Rules, card eligibility and player-facing explanations must agree.

## Compatibility and acceptance

Every replay, saved position, analysis result, module and exercise binds to the
selected ruleset/version and implementation version. Unknown combinations are
rejected or shown as unsupported without reinterpreting them as riichi. Shared
concepts may list multiple compatible rulesets only after their examples and
exceptions are verified for each.

A second variant ships only after independent legal/illegal/scoring fixtures,
conservation/determinism tests, actual table/browser accessibility checks,
progress/replay migration tests and original/authorized teaching content pass.
Existing riichi records and defaults must remain unchanged by introducing the
registry. A new variant is a separate focused implementation sequence after the
riichi learning platform is strong.
