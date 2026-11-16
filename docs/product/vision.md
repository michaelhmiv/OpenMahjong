# Product vision and current decisions

OpenMahjong is a free, open-source, browser-first mahjong platform. Its learning
objective is to help a player explain a decision using the information available
at that moment, then practice that reasoning. The target journey is
**Learn → Play → Analyze → Practice → Improve**.

## Current product and target

The existing product supports guest riichi play against AI, eleven introductory
lessons, guided hints, hand/match breakdowns, local history and optional Google
accounts with private saved records/settings. The focused correctness and model
work accompanying this document strengthens that foundation.

Decision-level review, a complete Practice interface, broader/advanced curriculum,
validated probabilistic analysis, a learning dashboard, trustworthy multiplayer,
ratings and additional variants are target capabilities. Their design documents
or data models must not be presented as completed user workflows.

## Current decisions and authority

This is the current decision register. Implementation details are described in
[architecture](../architecture/overview.md), [rulesets](../architecture/rulesets.md)
and the audited source. When a later approved decision changes this register,
record its rationale and update the affected current documentation in that PR.

| Area | Current decision | Basis / treatment of older text |
|---|---|---|
| Access | Free to play; no account required to play or learn | Original floors and master brief agree; accounts add optional persistence |
| License | AGPL-3.0-only application/source | Root LICENSE and package metadata; retain notices and source obligations |
| Product focus | Riichi first; teaching reasoning is a defining long-term capability | Master brief expands the earlier “play first” slice rather than replacing working play |
| Advertising | Do not claim advertisement-free; no pay-to-win | v6 design copy law supersedes historical “no ads”; no new ad/tracking implementation is authorized by this doc |
| Appearance | Approved v6 dark felt green/gold, Fraunces/Figtree, traditional tiles | `docs/design-rules.md`; historical v5/light-theme instructions are superseded |
| Design changes | Existing approved composition is preserved; new screens/layouts require a faithful rendering and recorded review | v6 process; factual fixes and nonvisual correctness work remain in scope |
| Rules | Explicit OpenMahjong riichi choices, not a claim of WRC/EMA equivalence | Rules-compliance audit and versioned rules descriptor; do not silently substitute a tournament ruleset |
| Privacy | Guest data is browser-local; signed-in private records/settings use the account service | Actual current server/web code supersedes slice-1 “no server/no accounts” status |
| Competitive trust | Browser-submitted records are private unrated history | Never use them as authoritative rating inputs |
| Offline | Guest play after a complete shell installation is intended; browser storage is not a backup | Verification clears the HTTP cache while preserving service-worker CacheStorage, then reloads offline |
| Hosting | Existing Railway web/API/Postgres project | Audit read-only; deployment and irreversible infrastructure changes require separate authorization |
| Variants | Only riichi playable; other variants require dedicated research and acceptance tests | Original “rule packs” wording is roadmap intent, not evidence of an implemented generic engine |

The original [brief-v1](../brief-v1.md) is an unchanged historical record of
approved slice-1 decisions. [Design rules v6](../design-rules.md) govern the current
visual system. The user-supplied long-term master brief governs this implementation
sequence; its repository publication is tracked in
[PR #19](https://github.com/michaelhmiv/OpenMahjong/pull/19). That pending document
does not block the authorized audit and implementation work. Do not duplicate it
or rewrite old approvals to conceal changed decisions.

## Learner experience

| Stage | Immediate need | Evidence that the experience is useful |
|---|---|---|
| Complete beginner | Recognize tiles, form sets/pair, understand turn/discard | Can complete short unassisted recognition/shape tasks and begin a guided hand |
| Developing beginner | Yaku, waits, riichi, basic calls and points | Can explain why a legal winning action is or is not available |
| Intermediate | Shanten/ukeire, five blocks, value/speed and defense | Can compare alternatives and identify the assumptions behind safety estimates |
| Advanced | Multiple threats, match situation and uncertainty | Can reason about tradeoffs without treating approximate risk as certainty |
| Competitive | Longitudinal review and deliberate practice | Repeated independent decision quality improves on held-out positions |

Suggested progression is guidance. Advanced material must remain reachable
without mandatory completion locks. Assistance and difficulty should be visible
context for feedback, not reasons to shame or rank a beginner.

## Scope discipline

Preserve guest access, working records, the technology stack and approved design.
Prioritize rule/teaching accuracy and reliable persistence before adding breadth.
Do not introduce paid dependencies, analytics collection, model-generated rules,
moderation-heavy social features or a second variant to make the roadmap look
complete. The [roadmap](roadmap.md) defines concrete gates and unresolved decisions.
