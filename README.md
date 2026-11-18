# Open Mahjong

A free, open-source, browser-first mahjong platform. Play four-player Riichi,
Hong Kong Old Style, MCR (WMO 2006) or Taiwanese against CPU opponents, learn
without an account, and review complete games on the board. Optional Google
sign-in carries private history, learning progress and active games across devices.

Game details show final standings, settlement and every recorded hand. Board
review seeks all players’ events using indexed checkpoints, keeps opponents
concealed and explains supported decisions from immutable public information.
Legacy engine-one review remains display-only. Saved decisions lead to validated
Practice and return to the same position.

In-person tools offer actual-tile detection and fast scoring-unit entry, a
correctable payer-first breakdown, four named players, ledgers, undo, deposits
where applicable, penalties and settlement. Manual tools save locally and work
offline without an account. Optional private ledger sync uses revision checks,
idempotent writes and conflict preservation. The American helper accepts values
from the player’s own physical card; it contains no annual-card patterns and is
not a playable American variant. Photo input is excluded.

The original Riichi curriculum is joined by thirty original variant lessons,
sixty corrective checks and a searchable reference for all 81 MCR patterns.
Profile-specific practice, public-information coaching, history, statistics and
resume use the same scoring sources as gameplay and calculators. Strategic
advice remains heuristic; no calibrated grading scale is claimed.

Open online tables for live or unlimited correspondence in every playable variant. Guests and accounts can play Friendly or invite friends into custom rooms. Ranked matchmaking has a separate release flag. [Multiplayer setup and policies](docs/architecture/multiplayer-operations.md)

Broader curricula, generated puzzles and demonstrated learning improvement are tracked in the [roadmap](docs/product/roadmap.md).

## Principles

- Free to play, with no account required for play or learning.
- Open source under AGPL-3.0-only; retain license and source obligations.
- Deterministic, testable rules separated from UI and strategic heuristics.
- Explanations grounded in valid rules and available information, with uncertainty
  stated honestly.
- Minimalist approved design, strong mobile usability and respect for privacy.

[Current decisions](docs/product/vision.md) resolve historical requirements about
accounts, advertising, themes and feature scope. The original
[brief-v1](docs/brief-v1.md) remains a historical slice-1 record;
[design-rules v7](docs/design-rules.md) governs the current visual system. The
long-term master brief is tracked in
[PR #19](https://github.com/michaelhmiv/OpenMahjong/pull/19).

## Repository layout

| Package | Responsibility |
|---|---|
| `packages/engine` | Deterministic Riichi engine, separate Chinese-family adapters, hand analysis, shared scoring/payments and ledgers |
| `packages/ai` | Public-information opponents, fast hand analysis and documented strategic heuristics |
| `packages/coach` | Ranked action facts, reasons and instructional/analysis contracts |
| `packages/web` | Vite browser client, table/animation, lessons, Practice, decision Review, local learning/history data and optional account API |
| `packages/server` | Node HTTP/Google auth, sessions, user-scoped records/settings/statistics and Postgres persistence |

Playable profiles are [Riichi](docs/architecture/rulesets.md), [Hong Kong Clear Chapter](docs/rules/hong-kong.md), [MCR WMO 2006](docs/rules/mcr.md) and [Taiwanese Every-flower, no Ting, 30/10](docs/rules/taiwanese.md). These are explicit, versioned profiles, not universal house-rule coverage. New variants use executable adapters, not renamed Riichi flags. Private browser-submitted CPU history remains unrated and is not proof of a competitive result.

The MCR scorer incorporates pinned MIT code by Jeff Wang; readable source,
licenses and the reproducible optional compiler build ship under
[engine/vendor/mcr](packages/engine/vendor/mcr/NOTICE.md). Normal npm builds run
entirely from checked-in JavaScript/TypeScript with no scoring service or compiler.

## Development

Use Node 22.22.2+ or Node 24.15+ within a supported release line and npm from the
repository root:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run check:packages
npm run check:security
npm run dev --workspace=@openmahjong/web -- --host 0.0.0.0
```

Library artifact builds run engine → AI → coach; source tests/typechecks do not
need prebuilt output. See [CONTRIBUTING](CONTRIBUTING.md) for focused checks and
change review. The server's no-database development store is ephemeral; configure
Postgres for durable account data. Google sign-in is disabled when its credentials
are absent. Guest play remains independent of the API.

## Documentation

- [Product vision and current decisions](docs/product/vision.md),
  [roadmap](docs/product/roadmap.md), [success measures](docs/product/success-metrics.md)
  and [research](docs/product/research.md).
- [Audit index and priorities](docs/audit/recommendations-and-roadmap.md) and
  [section-by-section implementation status](docs/audit/implementation-status.md).
- [Approved implementation program](docs/implementation-program.md), [in-person ledgers/API](docs/architecture/in-person.md) and [verification/evidence](docs/audit/program-verification.md).
- [Architecture](docs/architecture/overview.md), [rulesets](docs/architecture/rulesets.md),
  [replay](docs/architecture/replay.md), [decision review](docs/architecture/review.md), [analysis](docs/architecture/analysis.md),
  proposed [multiplayer](docs/architecture/multiplayer.md) and
  [variants](docs/architecture/variants.md).
- [Curriculum](docs/education/curriculum.md), [lesson framework](docs/education/lesson-framework.md),
  [practice system](docs/education/practice-system.md), [progress model](docs/education/progress-model.md)
  and [analysis methodology](docs/analysis/methodology.md).
- [Testing/evidence](docs/testing/strategy.md), [deployment and recovery](docs/deployment.md),
  [security policy](SECURITY.md) and [contributing](CONTRIBUTING.md).

Documentation distinguishes implemented behavior, tested evidence and proposals.
A passing source suite is not proof of learning effectiveness, physical-phone
performance or production recoverability. Implementation PRs include their exact
verification results and remaining limits.

## License

GNU Affero General Public License v3.0. See [LICENSE](LICENSE).
