# In-person calculation and scoring ledgers

These tools are independent of CPU replays. Manual entry, correction, scorekeeping,
undo and settlement use local storage without an account or network. The Play entry
opens the session library; Games lists sessions under **At the table**, outside CPU
statistics. No photo/camera/model/provider path is implemented.

## Rules and named presets

`openmahjong-riichi-table@1` preserves the engine's han/fu, rounding, limits and
honba payments. `riichi-multiple-winners@1` changes the in-person table's discard
priority to simultaneous winners. The CPU rules are unchanged. Configurable
settings are discard-win priority, raw/rank standings, starting scores and the
outstanding-pot disposition. OpenMahjong rank bonuses require 25,000 starts.
Ties use the existing engine settlement. Cash conversion is not inferred: final
point transfers settle score balances; rank-bonus standings are shown separately.

The calculator's tile path calls `scoreHand`. It stores counts, declared melds,
winning tile, seat/round/win context, indicators and exact physical tile evidence.
The fast path accepts han/fu or true yakuman multiples. Both use the extracted
`computeRiichiPoints` function, also used by gameplay. Facts and manual corrections
are retained separately; each override has a reason and a new confirmed breakdown.
Deposits belong to the ledger and are never silently added by a hand calculation.
Simultaneous ron payments use each winner's scoring, with the pot paid once to the
nearest winner in turn order. Exhaustive draws use the 3,000-point ready/not-ready
exchange. Aborted hands have no exchange. Chombo uses the documented reverse
mangan preset; other penalties require explicit table-agreed payment lines.

`american-payments@1` accepts a value entered from the player's physical card,
win method, jokerless/Singles-and-Pairs circumstances and optional bettor choice.
It has no card pattern catalog, imported card data or playable American game.
Discarder pays twice the entered value; other players pay once. Self-pick or a
winning joker exchange makes all three pay twice. Jokerless doubles those payments
except Singles and Pairs. An optional fifth balance represents the bettor. A
correct bet duplicates the backed player's payments; a losing wall bet pays the
non-discarder amount. A successful wall bet uses the lowest card value entered by
the player and collects that amount from each of the four seats.

Verified 2026-11-17 against the
[American Mah Jongg Association payment rules](https://guide.americanmahjonggassociation.com/how-to-play-american-mah-jongg/hand-value-and-payment/),
[Mahj Life's bettor rules citing MJME 2024 p25](https://mahjlife.com/wiki/5th-player-betting-rules-and-payment-article-150/)
and [its payment clarification](https://mahjlife.com/wiki/hoptois-release-notes-for-mah-jongg-made-easy-2024-article-226/).
No proprietary hand content from these sources is copied. The Riichi payment
derivations remain in the engine scoring corpus and ruleset reference.

## Ledger, edits and conservation

`ScoringSession.v = 1` pins variant and preset, four named players, starting scores,
supported settings, timestamps and a bounded sequence of operations. A `set`
operation records a hand, draw, deposit or penalty under a stable record ID.
Corrections set that record again, preserving its original order. Undo references
an earlier operation; recomputation determines active edits before applying events.
Every active row has its running scores, deltas and outstanding pot. The sum of
scores plus the pot always equals the starting total. Each player's riichi deposit
is allowed once per hand. Pot settlement is explicit and deterministic.

Both active and inactive entries are validated. Bounds include 100 sessions per
account/device, 1,000 operations per ledger, 512 KB per canonical session, 60-character
names, bounded payments and exact known fields. Unknown variants/presets/paths and
hidden arbitrary payloads fail instead of being reinterpreted. No credentials are
stored in local session data.

## Private account API

- `GET /api/table-sessions`: up to 100 owner-private summaries.
- `GET /api/table-sessions/:id`: owner's session and server revision.
- `PUT /api/table-sessions/:id`: `{ expectedRevision, mutationId, session }`.

Reads require a valid account session. Writes additionally require the existing
CSRF token. The server validates the ledger, checks ID consistency, fingerprints
canonical content and performs an atomic revision comparison. Repeating the same
mutation/content is idempotent; reusing a mutation ID for another payload fails.
A stale revision returns 409 with the current private copy. Migration 006 adds
owner-scoped tables and write IDs, with account-deletion cascades. PostgreSQL
serializes creation/revision checks using the owning user row lock. Client records
remain private and unrated.

The device saves first. Failed writes retain their original mutation ID and exact
snapshot for retry. Edits made during a write remain local and queue another
revision. Offline conflicts preserve local and remote copies; **Keep both** assigns
the local branch a new session ID. Account caches are scoped by account ID and
cleared on sign-out/deletion. In-flight responses cannot recreate a cleared cache.
An account ID marker, containing no authentication material, lets a reload reopen
that account's local library even when the network's online hint is inaccurate.
The screen identifies it as a saved account copy. A sync requires current
authentication to that same account; reconnecting
does not turn a remembered identity into a credential. Explicit sign-out or
deletion clears both the marker and that account's local table cache.
Copying guest sessions into an account is an explicit local action, followed by
optional private sync. Production sync is not implied by local mock-identity tests.

## Completed variant calculators

The ledger preset catalog also includes `hong-kong-clear@1`, `mcr-2006@1` and `taiwanese-every-flower@1`. Each has actual-tile and fast entry, reasoned corrections, payer-first confirmation, the common scorekeeper and raw settlement. CPU gameplay and manual tools share each variant's scorer and payment function. See the [Hong Kong](../rules/hong-kong.md), [MCR](../rules/mcr.md) and [Taiwanese](../rules/taiwanese.md) briefs for exact tables and primary sources.

MCR fast entry separates qualifying fan from flower points; corrected flower facts still cannot satisfy the eight-fan threshold. Taiwanese fast entry excludes dealer bonuses; base/unit and dealer-repeat context are stored with the hand, and each payer is priced independently. These settings cannot change a CPU game's recorded rules. Non-Riichi ledgers have no Riichi deposits, exhaustive-draw ready payments or rank settlement. Unsupported combinations fail shared validation on both client and server.

A delayed duplicate acknowledgement may contain a newer account revision written by another device. The client treats that as a conflict instead of adopting a revision it has never observed as its editing base. Both copies survive Keep Both. Sign-out/deletion epochs prevent late network results from repopulating a cleared private cache.
