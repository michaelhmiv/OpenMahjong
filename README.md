# Open Mahjong

A free, open-source, browser-first mahjong platform. Play four-player riichi
against AI and learn without an account. Optional Google sign-in saves private
game records and settings across devices.

The existing application includes real scoring and match flow, guided play,
eleven introductory lessons, hand/match breakdowns, local history and an
offline-capable PWA. The long-term goal is a connected **Learn → Play → Analyze
→ Practice → Improve** experience. Full decision-level review, broader practice,
advanced curriculum, multiplayer and additional variants remain phased work;
see the [roadmap](docs/product/roadmap.md).

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
[design-rules v6](docs/design-rules.md) governs the current visual system. The
long-term master brief is tracked in
[PR #19](https://github.com/michaelhmiv/OpenMahjong/pull/19).

## Repository layout

| Package | Responsibility |
|---|---|
| `packages/engine` | Pure deterministic riichi tiles, walls, hand analysis, scoring, legal actions and complete matches |
| `packages/ai` | Public-information opponents, fast hand analysis and documented strategic heuristics |
| `packages/coach` | Ranked action facts, reasons and instructional/analysis contracts |
| `packages/web` | Vite browser client, table/animation, lessons, replay, local data and optional account API |
| `packages/server` | Node HTTP/Google auth, sessions, user-scoped records/settings/statistics and Postgres persistence |

Only riichi is playable. A named rules descriptor is not a generic implementation
of Hong Kong, MCR or American mahjong. Private browser-submitted history is unrated
and must not be used as an authoritative competitive result.

## Development

Use Node 22.22.2+ or Node 24.15+ within a supported release line and npm from the
repository root:

```sh
npm ci
npm run typecheck
npx vitest run --maxWorkers=2
npm run build --workspace=@openmahjong/engine
npm run build --workspace=@openmahjong/ai
npm run build --workspace=@openmahjong/coach
node scripts/check-package-imports.mjs
npm run build --workspace=@openmahjong/web
npm run build --workspace=@openmahjong/server
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
A passing source suite is not proof of a complete learner journey, physical-phone
performance or production recoverability. Implementation PRs include their exact
verification results and remaining limits.

## License

GNU Affero General Public License v3.0. See [LICENSE](LICENSE).
