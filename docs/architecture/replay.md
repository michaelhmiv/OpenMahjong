# Replay format and compatibility

Current implementation: `packages/web/src/replay.ts`, `runner.ts`, `review.ts`, `review-ui.ts`,
and the engine's versioned rules descriptor. See [decision review](review.md)
for the review core and UI and [rulesets](rulesets.md) for the named profile.

## Envelopes

New **Riichi** games continue to serialize as schema 2:

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
`ReviewNavigator` supplies the hand/decision controls in `review-ui.ts`. The
visible Review surface shows original public table details and exact candidate
facts, labels heuristic rankings/unseen-copy assumptions, and preserves the
historical-v1 analysis restriction. It does not show concealed opponent hands
or implement a full-information mode.

Current win events additionally carry awarded per-yaku han and dora, so
breakdowns render open-hand reductions from engine facts. Historical events
without these fields retain a meld-aware display fallback. A generic
`GameEvent` payload indexer remains technical debt; this document does not
claim a fully discriminated event contract has been implemented.

## Persistence and trust

Existing game/history storage keys remain unchanged. Learning uses versioned
progress/session and account-scoped cache keys. Shape-corrupt saves
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
`review-ui.test.ts` checks visible navigation, candidate comparisons, public
information, legacy restrictions and callbacks. `api-contract.test.ts` exercises
the real client and HTTP handlers together.

Review-to-Practice stores up to fifty bounded record/decision references, with
skill tags and timestamps. Reopening resolves the validated private game record
and selects that original decision. Related curated exercises retain their own
validation; saving a heuristic position never silently publishes a graded puzzle.

Pending: full-information mode with explicit labeling, a validated generated-
puzzle/graded-position authoring pipeline, richer decision markers, asynchronous
deep analysis, concurrent account conflict resolution and incremental gameplay
execution. Final integrated UI/browser results belong to the learning PR; core
model tests alone do not establish all these workflows.


## Chinese-family schema 3

```json
{"v":3,"engineVersion":3,"aiVersion":1,"variant":"taiwanese","ruleset":{"id":"openmahjong-taiwanese-every-flower","version":1},"seed":"example","length":"full","humanSeat":0,"id":"client-uuid","decisions":[]}
```

The registry accepts only the canonical profile for the selected variant, its supported version, engine3/AI1 and east/south/full length. Shared `validateVariantReplay` serves client and server. The bound is 50,000 actions and **2 MiB minus 4 KiB of UTF-8 JSON**, reserving space for the surrounding upload envelope. Old schemas keep their existing 20,000-action limits. The larger new bound accommodates long Taiwanese dealer repeats; it does not weaken tile/count/identity checks.

`VariantRunner` consumes the exact action prefix, checks every answer against the pending legal view/context, then invokes CPU seat drivers only for new decisions. Invalid human answers are rejected before generator mutation. `GameRunner.restore` explicitly refuses schema3. No schema1/2 is upgraded or reinterpreted as another variant. A new variant retains its profile on local saves, private resume, game summaries and history/statistics; unknown combinations fail explicitly.

Full reconstruction material (including concealed tiles, flower/quad events and exact chi hints) is retained outside coach inputs. `reconstructReview` builds immutable decision-time public views and all-event data once; `BoardTimeline` checkpoints every16events. Seeking folds at most15 later events and never replays the engine. Concealed opponent quads are masked in MCR and Taiwanese, including physical IDs, even though full reconstruction retains their actual identities. Historical views never overwrite the active runner or resume slot.

Taiwanese restriction hooks replay passed wins, prohibited claim swaps, passed pungs and exposed-quad self-draw restrictions. Its sixteen/seventeen-tile hand size and quad extras are validated by the five-set adapter and rendered without thirteen/fourteen-tile slicing. See [Taiwanese audit](../rules/taiwanese.md).

Versioned **in-person scoring ledgers** are not replays; [their API and conflict semantics](in-person.md) are separate. CPU records remain unrated private client claims, while ledger writes are validated with the shared completed-hand scoring/payment functions.
