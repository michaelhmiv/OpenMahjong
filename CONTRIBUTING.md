# Contributing to OpenMahjong

OpenMahjong is AGPL-3.0-only, free to play and usable without an account.
Preserve the [current product decisions](docs/product/vision.md),
[approved design](docs/design-rules.md) and private-information boundaries.

## Local setup

Use Node 22.22.2+ or Node 24.15+ within a supported release line, or a later
release supported by every lockfile dependency. The declared root `engines`
range is authoritative; Node 20 does not support the current test toolchain. From the repository root:

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

Source-based typechecks/tests do not require prebuilt libraries. Library output
builds do require engine → AI → coach order. The artifact smoke deliberately
imports emitted packages without source aliases.

The account server can run without Google credentials, with sign-in disabled.
Its in-memory development fallback is ephemeral. Follow the server README and
[deployment guide](docs/deployment.md) for environment variables; never commit
credentials, session cookies, database dumps or user records.

## Working on a change

1. Read the relevant [audit](docs/audit/recommendations-and-roadmap.md) and source;
   reproduce the actual behavior before choosing a correction.
2. Keep the PR coherent. Rule fixes include independent rule derivation and
   replay/version compatibility. Do not bundle speculative features with a
   framework rewrite.
3. Add meaningful regression cases for correctness/security/learning behavior.
   Fix an incorrect fixture only after re-deriving the rules and documenting why.
4. Run the focused checks, then repository gates appropriate to the change.
   Describe exact commands/results and any unverified environment in the PR.
5. Update current documentation; retain historical briefs and approvals intact.

## Domain-specific review

- **Rules/scoring:** name OpenMahjong's ruleset, source the rule, show tile counts,
  hand interpretation, fu/han/payments and conservation where applicable.
- **AI/coach/review:** use only the decision-time public view; distinguish exact
  rules, heuristic strategy and uncertain predictions. Do not grade from outcome.
- **Education:** original examples, stable content/version/rules identity,
  corrective retry, resume/migration and machine-verified answers where possible.
- **Persistence:** validate unknown input, bound computation/storage, retain
  historical data compatibility and document conflicts/failures.
- **UI:** preserve approved v6 tokens/composition; new screens or layout require
  a faithful rendering, independent QC and recorded owner approval. Include actual
  screenshots and keyboard/accessibility checks for changed surfaces.
- **Server:** tests must cover authentication, CSRF, user ownership, malformed and
  oversized inputs; private browser records never become rated results.

## PR description

Lead with the user-visible problem and resulting behavior. Include scope/design
rationale, changed areas, meaningful new tests and executed results, screenshots
for UI changes, accessibility/security/performance implications, compatibility or
migration impact, limitations and specific follow-up work. Use a draft if an
acceptance item is incomplete. Do not claim production verification from local
unit tests.

Do not merge or deploy production as part of an implementation contribution
without explicit authorization. Report security issues privately through the
repository's [security policy](SECURITY.md), rather than publishing sensitive
exploit details or credentials in an issue.
