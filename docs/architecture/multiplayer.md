# Multiplayer and competitive integrity proposal

Status: design proposal for phases9–10. The current server stores private
client-submitted records; it is not an authoritative online game service. No
multiplayer, rating or tournament capability is claimed by this document.

## Authority and information

A match coordinator must own wall generation, hidden hands, turn/call windows,
timers, legality, scoring, round advancement and final results. A browser sends
intent, never a score or next authoritative state. Reuse validated engine rules;
add an explicit incremental command boundary rather than a second independent
rules implementation in socket handlers.

Do not transmit the engine's internal event log directly. `deal`/`draw` events can
contain physical tile identities that other seats must not see. Produce a
validated per-seat projection; a spectator projection has no private hand unless
policy explicitly authorizes a delayed/finished reveal. Test both the object shape
and serialized bytes for leakage.

Proposed command envelope fields:

| Field | Purpose |
|---|---|
| protocolVersion, matchId | Reject incompatible clients and wrong-match intents |
| actionId | Idempotency key per actor/match; duplicates return the original receipt |
| expectedRevision | Reject stale/out-of-order decisions without applying twice |
| action | Typed, size-bounded legal intent, validated against current context |

Actor identity comes from authenticated transport/session authorization, never a
client `seat` property. A receipt identifies committed revision and projection;
rejected commands leave state unchanged. Separate reconnect tokens from public
invite links, rate-limit room/actions and verify WebSocket Origin/session expiry.

## Persistence and reconnection

Proposed minimal design: one coordinator owner per match, append-only accepted
commands/events with rules/engine versions, periodic tested snapshots, and a
monotonic revision. Persist before acknowledging a committed action. A transaction
or fencing lease prevents two recovered coordinators from advancing one match.

On reconnect, authenticate membership, compare last acknowledged revision and
send the authorized snapshot plus missing projected events. Never replay opponent
private payloads to “catch up.” Timers use server deadlines; a disconnect cannot
reset a call window. Define grace period, bot substitution/forced discard,
abandonment and completion policies before enabling rated matches.

Private casual rooms with expiring invites are the first delivery unit. Public
matchmaking, friends, spectating and rated queues are separate units with their
own acceptance tests and abuse budgets. Keep the local guest game available while
online transport is unavailable.

## Rating research and recommendation

[Glickman's Glicko-2 specification](https://glicko.net/glicko/glicko2.pdf), inspected
November 16, 2026, models a rating, rating deviation and volatility using outcomes
against opponents over rating periods. Its input is pairwise win/draw/loss.
Treating one four-player match as six independent games would overcount correlated
placement evidence unless the adaptation is explicitly derived and validated.
Inactivity/uncertainty handling is useful, but copying chess update constants is
not a justified mahjong model.

The [OpenSkill paper](https://joss.theoj.org/papers/10.21105/joss.05901.pdf) describes
ranked multiplayer Bayesian approximations, including Plackett–Luce. Its
[versioned manual](https://openskill.me/en/v6.0.0/manual.html) provides rank/tie input
and separate skill/uncertainty values. This is a plausible four-player candidate,
not evidence that a particular implementation is calibrated for riichi.

Recommended research gate: compare a placement-native Plackett–Luce/Weng–Lin model
with a carefully weighted pairwise Glicko-2 adaptation on held-out, consented or
simulated authoritative four-player matches. No package/service is provisioned
or selected for production here.

| Evaluation | Required treatment |
|---|---|
| Outcome | One completed match, four ordered placements and ties; same final-settlement policy as the game |
| Uncertainty | New-player/provisional state and inactivity increase uncertainty under documented parameters |
| Variance | Tune to mahjong's noisy outcomes; report calibration and convergence by match count |
| Queue compatibility | Separate ruleset, match length and rated/casual populations; never include assisted CPU games |
| Validation | Held-out placement log loss/calibration, predictive ranking quality, seat/strength symmetry and stability |
| Abuse | Collusion/repeated-opponent diagnostics, abandonment and multi-account policies; do not infer cheating from one unlikely result |
| Reproducibility | Versioned rating algorithm/parameters, immutable official result IDs and idempotent transactional updates |

Do not publish ratings until official results are server-derived. Private uploaded
history, client counters and a complete-looking replay are insufficient authority.

## Integrity tests before launch

- Four clients complete seeded games and observe only their authorized tiles.
- Wrong-user/seat/match, malformed, oversized, duplicated, stale and illegal actions
  are rejected without state mutation.
- Call priorities and simultaneous responses are resolved by server rules, not
  network arrival luck outside the selected ruleset's timing policy.
- Reconnect after every action boundary and crash recovery reproduce the same
  committed state; old tokens cannot reclaim an unrelated seat.
- Timer, disconnect and abandonment behavior survives worker restarts and clock
  changes within the documented deployment model.
- Spectator/finished-game sharing respects delay and private-data policy; changing
  visibility mode cannot contaminate player-perspective analysis.
- Rating writes occur once per official completed match, and settlement ties,
  tobi, reconnect and canceled matches have explicit outcomes.

## Community scope

Start with private studies and local annotations. Public studies, user-authored
lessons, chat, groups, reports and tournaments require moderation ownership,
content validation, resource quotas, private-data removal and abuse procedures.
A simple link-sharing feature still needs an explicit visibility/authorization
model. They are not prerequisites for the core learning loop.
