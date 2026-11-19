# i18n core-5 model benchmark (Phase 2 Track A)

Date: 2026-11-18. Sample: fixed 40 strings (`scripts/i18n-benchmark-sample.json` —
UI chrome, one lesson passage, calculator copy, review copy, placeholder /
tile-reference strings, locked-glossary-term strings). Same sample for every
candidate. Raw outputs: `scripts/i18n-benchmark-results/<locale>.<model>.json`.
Prices verified live against OpenRouter `/api/v1/models` on 2026-11-18.
No `qwen-turbo` model id exists on OpenRouter; `qwen/qwen-plus` is the live
Turbo-class Qwen and was benchmarked in its place.

## Verdict (models used for the bulk drafts)

| Language | Model | Why |
| --- | --- | --- |
| zh-Hans | `qwen/qwen-plus` | Glossary terms all correct, placeholders all preserved, lesson prose the most natural of the two; 2.5× cheaper than Gemini Flash. |
| zh-Hant | `qwen/qwen-plus` | Same as zh-Hans; correct traditional forms (榮和, 寶牌, 槓). |
| ja | `google/gemini-2.5-flash` | Flash-Lite failed meaning fidelity on the lesson passage (5 of dots rendered as 五萬 / 5 of characters; dots suit described as 萬子). Flash got both right. |
| ko | `google/gemini-2.5-flash` | Flash-Lite rendered the dots suit as 점수 ("score") in two strings; Flash used 통수패 correctly. |

## Results table

| Candidate | Language | Quality notes | Cost (40 strings) |
| --- | --- | --- | --- |
| qwen/qwen-plus | zh-Hans | All 12 glossary terms correct (荣和, 立直, 自摸, 碰, 吃, 宝牌, 杠, 番, 符). Placeholders 100%. Lesson prose plain and natural. One addition to watch: step02 adds "（又称‘饼子’）", not in the source — reviewer trims. | $0.0017 (1,890 in / 1,487 out) |
| google/gemini-2.5-flash | zh-Hans | Same glossary/placeholder record. Slightly stiffer lesson prose; "开始" for Play vs Qwen "游玩". | $0.0043 (2,017 in / 1,491 out) |
| qwen/qwen-plus | zh-Hant | All terms correct in traditional forms (榮和, 寶牌, 槓, 役滿). Same 饼子-style parenthetical in step02. | $0.0018 (1,894 in / 1,619 out) |
| google/gemini-2.5-flash | zh-Hant | Same term record. "開始遊戲" for Play. | $0.0045 (2,019 in / 1,553 out) |
| google/gemini-2.5-flash | ja | All terms correct (ロン, リーチ, ツモ, ポン, チー, ドラ, カン, 翻, 符). Placeholders 100%. Lesson passage faithful (5 of dots → 筒子の5). | $0.0045 (2,003 in / 1,562 out) |
| google/gemini-2.5-flash-lite | ja | **FAIL on meaning fidelity.** Lesson step01: 5 of dots → 五萬 (5 of characters); step02: dots suit called 萬子. Also drops "イベント" from `review.board.event-0-1`. Terms/placeholders otherwise fine. Rejected for ja. | $0.0008 (2,003 in / 1,566 out) |
| google/gemini-2.5-flash | ko | All terms correct (론, 리치, 쯔모, 퐁, 치, 도라, 깡, 판, 부). Dots suit → 통수패, correct. | $0.0050 (2,004 in / 1,778 out) |
| google/gemini-2.5-flash-lite | ko | **FAIL on meaning fidelity.** Dots suit rendered 점수 ("score") in step01 and step02. Terms/placeholders otherwise fine. Rejected for ko. | $0.0009 (2,004 in / 1,749 out) |

Total benchmark spend: **$0.0235** (provider-reported usage × listed prices).

## Scoring notes (what the "problems" counts mean)

- Zero placeholder problems in all 8 runs — every `{0}`/`{1}` survived.
- The 2–3 flagged items per run were checker artifacts, not translation
  defects, and the checker has since been fixed (word-boundary term
  matching): "Chi" matched inside "Chinese", "Fu" matched inside
  "furiten", and the American-card description "Pungs of 1s and 9s"
  matched the tile-reference regex on prose suit mentions ("1s" = ones
  of characters) whose meaning every candidate preserved. No candidate
  left a locked term in English and none dropped a placeholder.
- The Flash-Lite failures above are real meaning errors found by reading
  the outputs, not checker flags: a dots tile rendered as a characters
  tile teaches the wrong suit, which is exactly what the lesson passage
  exists to prevent.
- No candidate used "AI" for the CPU opponent; the glossary "Bot" term
  has no in-app key using the standalone word "Bot" yet (all 10 hits
  were the word "Both"), so Bot rendering is untested by the sample and
  is a review-queue item, not a benchmark result.
- No Pro/Max-class model was needed. No cheap candidate failed outright
  for Chinese; the two Flash-Lite failures were handled by using the
  next step up within the Flash class (2.5 Flash), not a Pro model.
