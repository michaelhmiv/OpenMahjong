# Prioritized recommendations and audit index

Baseline: `989927b`, November 16, 2026. Severity describes user impact and technical
risk; it is not a count of features completed. The implementation sequence opens
focused PRs and leaves deployment/merge under owner control.

## Audit artifacts

| Report | Scope / evidence |
|---|---|
| [Architecture](architecture-audit.md) | Five-package inventory, replay/contracts, module ownership, packaging, CI and documentation drift |
| [Rules compliance](rules-compliance.md) | Independent scoring/rule fixtures and named-default differences; implemented/test gaps/partial/missing/ambiguous matrix |
| [AI and coach](ai-coach-audit.md) | Information boundaries, tile counts, legal action identity, danger estimates and strategic claim limits |
| [Education](education-audit.md) | All eleven actual lessons, factual exceptions, state/resume validation and missing domain coverage |
| [UX and accessibility](ux-accessibility-audit.md) | Actual production/local browser workflows, viewport geometry, keyboard/labels, offline and diagnostic evidence |
| [Security and performance](security-performance-audit.md) | OAuth/session/CSRF/CORS, user authorization, bounded inputs, data trust and operational limitations |

## Order of work

| Priority | User/technical risk | Correction unit and dependency | Acceptance evidence |
|---|---|---|---|
| First | Incorrect scoring/kan/call behavior undermines play, lesson truth and every analysis result | Engine correctness; **must pair with executable-version replay compatibility** | Independently derived cases, conservation/legality/determinism, historic replay fixtures |
| First, independent | OAuth state and API/persistence defects harm accounts or lose expected cloud state | Browser-bound OAuth and bounded authenticated HTTP contracts | Browser-swap/reuse/expiry/CSRF tests; real client envelope/204 tests; private ownership preserved |
| First, independent | Coach tile accounting or “safe” claims can teach false certainty | Shared AI/coach correctness, multiple-threat assumptions and qualification | Duplicate physical tiles not counted twice; exact drawn tile legal; partial-genbutsu case |
| Next | Factual lesson exceptions and malformed progress can mislead or break learning | Lesson corrections plus validated/migrated progress | Every module scripted to completion; wrong answer stays put; resume/reload corruption cases |
| Next | Broken emitted package entries hide behind source aliases | Src-only ordered library builds + Node import smoke | Actual dist entries/declarations and smoke import, without Vite/Vitest source aliases |
| Next | Inaccessible controls/offline-update defects block core paths | Nonvisual semantics/error handling; real-browser gate | Keyboard and screen-reader semantics, measured viewport checks, offline reload with the HTTP cache cleared while preserving service-worker CacheStorage |
| Then | Review/practice expansion without boundaries creates new coupling and hidden-information risk | Versioned analysis/lesson/practice contracts, then separately approved surfaces | Traceable exact-vs-heuristic output, bounded computation and successful integrated guest path |
| Later | Ratings/variants promised before integrity/licensing established | Dedicated multiplayer/variants plans | Authoritative results/per-seat projections; independent variant fixtures and rights review |

Detailed IDs, observed/expected behavior, baseline file/line evidence, reproduction,
root causes, proposed PRs and acceptance criteria are in each report. No P0
production outage is inferred merely from a source defect; high-impact correctness
findings require reproduction and scoped verification before release.

## Roadmap and accountable status

[Product roadmap](../product/roadmap.md) maps the master brief to phases, concrete
units and exit criteria. The [implementation register](implementation-status.md)
tracks all thirty numbered sections against source evidence and remaining gates. [Vision/current decisions](../product/vision.md)
resolves historical-document drift. [Research](../product/research.md) records which
external sources were actually read and which UIs remain untested.

This sequence delivers real code corrections and reusable foundations after the
audit. It does **not** declare the full long-term platform complete. Reviewable
models are not a complete Practice interface; result replay is not a full analysis
workspace; a rules descriptor is not support for multiple mahjong traditions.

## Release gates and evidence gaps

- Preserve the established successful regression suite; a fixture that repeats
  an incorrect rule must be independently re-derived and explained when corrected.
- Rule revisions require old-record compatibility and explicit version handling.
- New educational/analysis claims require ruleset references and reproducible
  examples; heuristic judgments must carry their assumptions.
- New visual surfaces require concrete rendering/QC review under the approved
  design process. Continue independent correctness/model work meanwhile.
- Production OAuth, real Postgres migration/restore, physical-phone frame timing,
  PWA OS installation and full beginner-to-review-to-practice transfer need their
  own evidence. Do not convert source inspection or desktop smoke into those claims.
- Railway was inspected read-only. Observed health is a point-in-time state, not
  proof of backup recoverability or authorization to deploy.
