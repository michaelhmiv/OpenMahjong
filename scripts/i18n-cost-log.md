# i18n core-5 translation cost log (Phase 2 Track A)

All figures are provider-reported usage (tokens) × the OpenRouter listed
prices verified 2026-11-18, except the program total, which is the
provider-reported key spend. Per-language figures are the list-price
computation; the provider's own per-call `cost` field runs ~1.4% lower
than the list-price computation in every sampled call, so the
provider-reported total is the authoritative actual spend.

- Key weekly spend before the first call (2026-11-18): **$2.236925468**
- Key weekly spend after the last call (2026-11-19): **$3.521605674**
- **Program actual spend (provider-reported delta): $1.2847**
- List-price sum of all runs below: $1.3034 (overstates the provider
  figure by $0.0187, ~1.4% — list-price rounding, not extra calls).
- Key budget: $50/week, resets 2026-11-23. No spend surprise: the
  largest single language (ko, $0.4897) cost less than $0.50.
- Total tokens: 708,956 in / 653,123 out across all runs below.

## Per-language totals (list-price computation)

| Language | Model | Keys | Cost | Notes |
| --- | --- | --- | --- | --- |
| zh-Hans | qwen/qwen-plus | 3,729 | $0.1553 | Smoke $0.0032 (120 keys) + full $0.1517 + ship top-up $0.0004 (13 keys). 0 failures. |
| zh-Hant | qwen/qwen-plus | 3,729 | $0.1654 | Full $0.1647 (3 failures) + recovery $0.0003 + ship top-up $0.0004 (13 keys). |
| ja | google/gemini-2.5-flash | 3,729 | $0.4714 | Full $0.4678 (16 failures) + recovery $0.0024 + one-off $0.0001 + ship top-up $0.0011 (13 keys). |
| ko | google/gemini-2.5-flash | 3,729 | $0.4908 | Full $0.4766 (72 failures, incl. one 429'd batch) + recovery $0.0131 + ship top-up $0.0011 (13 keys). |
| Benchmark (all 4) | mixed | 40 × 8 runs | $0.0235 | Provider `cost`-field sum $0.0233. Detail: `scripts/i18n-benchmark.md`. |

## Run-by-run

| Run | Model | In tokens | Out tokens | Cost | Failures |
| --- | --- | --- | --- | --- | --- |
| Benchmark × 8 | mixed | 15,834 | 12,805 | $0.0235 | 0 (2 Flash-Lite quality rejections, not failures) |
| zh-Hans smoke (120 keys) | qwen/qwen-plus | 3,589 | 2,932 | $0.0032 | 0 |
| zh-Hans full | qwen/qwen-plus | 161,775 | 140,612 | $0.1517 | 0 |
| zh-Hant full | qwen/qwen-plus | 165,612 | 155,912 | $0.1647 | 3 (empty outputs, recovered) |
| zh-Hant recovery | qwen/qwen-plus | 618 | 199 | $0.0003 | 0 |
| ja full | google/gemini-2.5-flash | 179,067 | 165,648 | $0.4678 | 16 (14 empty, 2 placeholder slips, recovered) |
| ja recovery | google/gemini-2.5-flash | 1,163 | 812 | $0.0024 | 1 (plural-suffix `{1}` dropped twice) |
| ja one-off | google/gemini-2.5-flash | 147 | 37 | $0.0001 | 0 (targeted retry with explicit instruction) |
| ko full | google/gemini-2.5-flash | 175,527 | 169,594 | $0.4766 | 72 (one 60-key batch 429'd by Google + 11 empty + 1 placeholder slip) |
| ko recovery | google/gemini-2.5-flash | 5,624 | 4,572 | $0.0131 | 0 |

## Ship top-up — 13 switcher keys (PR #90 landing, 2026-11-19)

PR #91 added 13 switcher/sheet keys to `en.json` after the bulk drafts
were written, so every draft locale was missing them and the release
gate (correctly) failed on 13 new/changed keys per locale. The driver
re-ran with translation memory — only the 13 missing keys per locale
were billed. All four runs: 0 failures, 0 glossary flags, 0 tile-ref
flags. Per-language totals above are now 3,729 keys; program actual
spend is **$1.2877** ($1.2847 bulk + $0.0030 top-up).

| Run | Model | In tokens | Out tokens | Cost | Failures |
| --- | --- | --- | --- | --- | --- |
| ja top-up (13 keys) | google/gemini-2.5-flash | 731 | 334 | $0.0011 | 0 |
| ko top-up (13 keys) | google/gemini-2.5-flash | 732 | 365 | $0.0011 | 0 |
| zh-Hans top-up (13 keys) | qwen/qwen-plus | 676 | 261 | $0.0004 | 0 |
| zh-Hant top-up (13 keys) | qwen/qwen-plus | 679 | 282 | $0.0004 | 0 |
| ja rewire top-up (28 keys) | google/gemini-2.5-flash | 1,043 | 605 | $0.0018 | 0 |
| ko rewire top-up (28 keys) | google/gemini-2.5-flash | 1,044 | 608 | $0.0018 | 0 |
| zh-Hans rewire top-up (28 keys) | qwen/qwen-plus | 929 | 512 | $0.0006 | 0 |
| zh-Hant rewire top-up (28 keys) | qwen/qwen-plus | 932 | 515 | $0.0006 | 0 |
| ja rules-screen top-up (17 keys) | google/gemini-2.5-flash | 1,514 | 1,105 | $0.0032 | 0 |
| ko rules-screen top-up (17 keys) | google/gemini-2.5-flash | 1,515 | 1,267 | $0.0036 | 0 |
| zh-Hans rules-screen top-up (17 keys) | qwen/qwen-plus | 1,417 | 1,048 | $0.0012 | 0 |
| zh-Hant rules-screen top-up (17 keys) | qwen/qwen-plus | 1,420 | 1,099 | $0.0012 | 0 |
| ja rules re-roll (2 keys) | google/gemini-2.5-flash | 565 | 141 | $0.0005 | 0 |
| ja text-screen titles (5 keys) | google/gemini-2.5-flash | 506 | 70 | $0.0003 | 0 |
| ko text-screen titles (5 keys) | google/gemini-2.5-flash | 507 | 73 | $0.0003 | 0 |
| zh-Hans text-screen titles (5 keys) | qwen/qwen-plus | 496 | 52 | $0.0002 | 0 |
| zh-Hant text-screen titles (5 keys) | qwen/qwen-plus | 499 | 55 | $0.0002 | 0 |

Rules-screen top-up notes (render-verification find, same PR): the Rules
screen's intro + 15 bullets sat behind local `p`/`li` helpers in app.ts
and had never been inventoried as ui.app keys (their values were claimed
by the pages.riichi.* inventory), so they rendered English in every
locale. Wired through tx() (+16 keys), translated here. Flags: ja 2
glossary (term-form), zh-Hant 1 glossary, ko 1 tile-ref — all
notation/term-form, meanings verified by inspection. One ja bullet
(abortive draws) came back with a wrong lead clause borrowed from the
exhaustive-draw bullet; it was re-rolled once (row above) and the
replacement verified accurate. `ui.app.improve-this-translation` was
drafted by the runs and removed again — it stays intentionally English.

## Notes

- Translation memory worked: recovery runs re-billed only the failed
  keys (zh-Hant 3, ja 16, ko 72); the 3,700+ already-drafted keys were
  skipped in each recovery run. Unchanged strings are never re-billed.
- The ko 429 was a Google-side throttle on `gemini-2.5-flash` while the
  ja run was hitting the same model in parallel; the retry with smaller
  batches (20) succeeded. No Pro/Max model was used anywhere.
- Per-language JSON logs (`scripts/i18n-cost-log-<locale>.json`) record
  only the most recent run for that locale (the driver overwrites them);
  this file is the complete history.
- No runtime translation cost exists: the shipped app makes no network
  call to any translation provider. These are one-time build-time costs.

## PR #87 top-up — 6 multiplayer keys (2026-11-19)

PR #87 (rebased onto main f93a1e8 after PR #93/#94) added exactly 6
English keys — `ui.app.solo`, `ui.app.online`, `ui.app.play-mode`,
`review.board.coach-advice-uses-only-what-you-knew-at-each-dec`,
`review.board.hide-opponents-hands`, `review.board.reveal-all-hands` —
missing from all four draft locales. The driver re-ran with translation
memory; per locale it billed 7 keys (the 6 new keys plus
`ui.app.improve-this-translation`, which was then removed again: that
key is intentionally absent from the draft locales — its shipped
rendering is the English fallback, per the baseline design). All four
runs: 0 failures, 0 glossary flags, 0 tile-ref flags. New entries are
status `draft` only. Total list-price cost $0.0015 (provider-reported
runs ~1.4% lower, per the note at the top of this file).

| Run | Model | In tokens | Out tokens | Cost | Failures |
| --- | --- | --- | --- | --- | --- |
| zh-Hans top-up (6 keys kept) | qwen/qwen-plus | 551 | 109 | $0.0002 | 0 |
| zh-Hant top-up (6 keys kept) | qwen/qwen-plus | 554 | 113 | $0.0002 | 0 |
| ja top-up (6 keys kept) | google/gemini-2.5-flash | 571 | 144 | $0.0005 | 0 |
| ko top-up (6 keys kept) | google/gemini-2.5-flash | 572 | 144 | $0.0005 | 0 |

## PR2 online top-up — 154 multiplayer keys (2026-11-19)

The Online surface (online.ts) was wired to the i18n system for the
first time (audit finding F24): 154 new English keys under the
`online.*` namespace, machine-drafted into all four locales with the
driver (translation memory billed only the new keys). All runs:
0 glossary flags, 0 tile-ref flags. ja needed two extra single-key
retries for `online.lobby.host-seats-open`: Gemini kept dropping the
{2} plural placeholder (Japanese has no plural marker; pluralS()
renders it empty), so that one entry was written by hand as a draft
with the placeholder preserved, matching the zh form. New entries are
status `draft` only; baseline.json was regenerated at this ship, per
the established mechanism. Per locale the driver billed 155 keys: the
154 new online keys plus `ui.app.improve-this-translation`, which is
intentionally absent from the draft locales (its shipped rendering is
the English fallback, per the baseline design) — its drafted entry
was removed again after each run, as in the PR #87 top-up.

| Run | Model | In tokens | Out tokens | Cost | Failures |
| --- | --- | --- | --- | --- | --- |
| zh-Hans top-up (154 keys kept) | qwen/qwen-plus | 3189 | 2118 | $0.0025 | 0 |
| zh-Hant top-up (154 keys kept) | qwen/qwen-plus | 3198 | 2221 | $0.0026 | 0 |
| ja top-up (153 of 154 keys kept) | google/gemini-2.5-flash | 3559 | 2365 | $0.0070 | 1 |
| ja retries (1 key ×2) | google/gemini-2.5-flash | 940 | 59 | $0.0004 | 1 (hand-written draft) |
| ko top-up (154 keys kept) | google/gemini-2.5-flash | 5782 | 2461 | $0.0079 | 0 |

Total list-price cost: **$0.0204**.

PR3 (table & sheets) rebase top-up, 2026-11-19: 5 new keys (Board Review
chosen/advised labels + condensed win-sheet strings) drafted in all 4
locales — zh-Hans $0.0002, zh-Hant $0.0002, ja $0.0005, ko $0.0005;
total $0.0015. The driver-drafted "Improve this translation" entry was
removed again per the PR #87 trap.

Issue #106 (Analyze for online games), 2026-11-20: 1 new key
(analyze.v-0-hand-1, the move-by-move slider's round-and-hand label)
drafted in all 4 locales — zh-Hans $0.0002, zh-Hant $0.0002, ja
$0.0003, ko $0.0002; total $0.0008 (provider-reported). The
driver-drafted "Improve this translation" entry was removed again
per the PR #87 trap (design §1.1: intentionally English-only).
