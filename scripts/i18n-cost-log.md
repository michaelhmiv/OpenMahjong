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
| zh-Hans | qwen/qwen-plus | 3,716 | $0.1549 | Smoke $0.0032 (120 keys) + full $0.1517. 0 failures. |
| zh-Hant | qwen/qwen-plus | 3,716 | $0.1650 | Full $0.1647 (3 failures) + recovery $0.0003. |
| ja | google/gemini-2.5-flash | 3,716 | $0.4703 | Full $0.4678 (16 failures) + recovery $0.0024 + one-off $0.0001. |
| ko | google/gemini-2.5-flash | 3,716 | $0.4897 | Full $0.4766 (72 failures, incl. one 429'd batch) + recovery $0.0131. |
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
