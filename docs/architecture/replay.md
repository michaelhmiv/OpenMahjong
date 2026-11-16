# Replay format and compatibility

Current implementation: `packages/web/src/replay.ts`, `runner.ts`, `review.ts`,
and the engine's versioned rules descriptor. See [decision review](review.md)
for the nonvisual review API and [rulesets](rulesets.md) for the named profile.

## Envelopes

New games serialize as schema 2:

```json
{
  "v": 2,
  "engineVersion": 2,
  "ruleset": { "id": "openmahjong-riichi", "version": 1 },
  "aiVersion": 2,
  "seed": "example",
  "length": "east",
  "humanSeat": 0,
  "id": "a-client-generated-game-id",
  "decisions": []
}
```

Every seat's action is recorded in engine request order, including passed
call windows. A discard identifies a physical tile instance (0–135), a kan a
tile type (0–33), and chi two distinct physical instances. Turn/call phases
and the engine's legal options remain authoritative. Schema validation alone
does not establish legal play or authenticate an outcome.

`validateSavedGame(unknown)` returns canonical data after checking supported
versions, seat, length, bounded seed/id, action fields, at most 20,000 actions
and at most 2 MiB canonical JSON. Unrecognized action properties are stripped.
The engine checks legality during reconstruction. Unused trailing actions
are errors; an illegal answer to a pending position rolls back the runner's
decision log and displayed state. The log is never silently repaired.

Schema 1 remains readable and resumable. It pins the exact pre-correction
engine/AI from commit `989927ba57dde781a4a856eaa2bbb6a1d01afb4b`, isolated under
`packages/{engine,ai}/src/legacy/v1/`. These AGPL sources intentionally retain
historical behavior, including known scoring/kan defects. New games use v2.
Never reformat, optimize or fix frozen sources: doing so changes saved
outcomes. The golden v1 fixture was captured from an isolated original
checkout: 589 decisions, 1,023 events, three kans and an independently stored
event SHA-256. It is replayed without generating replacement decisions.

There is no lossy v1→v2 upgrade. Future engine/policy changes must either
remain compatible with the named revision or add an explicit adapter/frozen
revision and compatibility fixtures. Unknown revisions are rejected.

## Reconstruction and information boundaries

`GameRunner` still reconstructs from the seed for every human action. Its
work grows with the recorded prefix; it is not an incremental engine API.
This compatibility approach is correct for current local play but remains a
mobile-performance concern. A resumable engine coordinator/checkpoint API is
a measured follow-up, not claimed complete.

`buildDecisionReview` reconstructs a recorded prefix once, consumes no live
AI actions, and records immutable human `PlayerView`/context snapshots at
their original decision points. No other concealed hands, wall order or
future outcomes are analysis inputs. Analysis runs on demand per current
discard; v1 review is display-only and cannot be labeled engine 2 analysis.
`ReviewNavigator` supports decisions and hands without a new UI screen.

Current win events additionally carry awarded per-yaku han and dora, so
breakdowns render open-hand reductions from engine facts. Historical events
without these fields retain a meld-aware display fallback. A generic
`GameEvent` payload indexer remains technical debt; this document does not
claim a fully discriminated event contract has been implemented.

## Persistence and trust

The existing browser storage keys remain unchanged. Shape-corrupt saves
are ignored without deleting the stored bytes. Invalid record logs can
lose their replay action while retaining valid history summaries. Settings
and summary arrays are bounded and validated before use. Storage denial or
quota failure still allows play, but persistence is not guaranteed.

Account `/api/games` lists summaries; opening one fetches its authenticated
detail on demand. Uploaded records remain client-authoritative private
history. These formats, checksums and validations do not establish rating
eligibility, prevent deliberate tampering or replace a server-authoritative
competitive coordinator.

## Verification and remaining work

`packages/web/test/replay.test.ts` covers v1 golden results, v2 metadata,
unsupported versions, malformed/bounded actions, unused tails and rollback.
`review.test.ts` covers immutable public positions, prefix stopping,
navigation, legal red-five comparisons and legacy analysis restrictions.
`api-contract.test.ts` exercises the real client and HTTP handlers together.

Pending: step-through Review UI, full-information mode with explicit
labeling, replay-to-practice authoring/validation, asynchronous deep
analysis, account conflict resolution and incremental gameplay execution.
