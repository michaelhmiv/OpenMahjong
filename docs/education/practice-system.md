# Practice foundation

Implemented code: `packages/web/src/education/practice.ts`. This is a nonvisual foundation and curated starter corpus. A dedicated Practice screen, generated puzzles, replay-to-practice, account synchronization, public content authoring, and advanced strategic assessments are not delivered by this module.

Schema version 1 exercises contain stable ID, content version, explicit ruleset reference, skill, difficulty, prompt, original explanation, provenance, exact expected answer, and a discriminated visible position. Current kinds: recognition, complete shape, shanten, waits, ukeire, yaku, scoring, and one-opponent genbutsu. The legal response domain follows the kind: recognition indices; booleans for shape; integer shanten/points; tile types for waits/ukeire/defense; yaku IDs for yaku recognition. Selection order is immaterial; strings are never coerced to numeric tile IDs.

`validateExercise` checks bounded inputs, supported ruleset, instructional metadata, physical copy limits, valid hand dimensions, and consistency between the independently authored answer and rules calculations. `checkPracticeAnswer` refuses exercises that fail the gate and returns correctness, exact expected answer, explanation, and supported numeric facts. The gate is required for future generated content too; a generator alone is not validation. Runtime content is currently curated only, so adding a generated provenance type requires an explicit extension and tests.

These are hand-based exercises/public table fragments, not fabricated complete game states. Actual lesson/game scenarios remain seed-driven through the engine. Structural waits include mathematically valid completions even if all copies are seen. Ukeire counts only improving types with unseen copies, and its feedback labels counts as unseen, never as known live-wall contents. Visible counts exclude the learner's hand and count physical tiles once. Genbutsu guarantees apply only to the named locked riichi opponent's ron; no guarantee is made against other opponents or tsumo.

## Curated fixtures

There are 13 original starter exercises: two recognition, two shapes, two shanten, two waits, one visible-count ukeire, one yaku, two scoring, and one defense. Each authored expected answer is recalculated in `education.test.ts`. The explicit winning tile and win context matter; changing either can change fu or yaku.

- Single wait: `123m123p123s777z5m` needs only 5m. With two extra visible 5m, one copy remains unseen; with three, none do.
- Two-sided wait: `123m123p777z55s45m` accepts 3m/6m.
- Riichi/pinfu ron: `234m345p345s789s22s`, won on 2m by a nondealer, no bonuses: 2 han, 30 fu, 2,000 points. The 9s prevents tanyao; the exact winning tile establishes the two-sided interpretation.
- Seven-pairs ron: `22m55m33p77p33s77s22z`, won on South by a nondealer, no bonuses: 2 han, 25 fu, 1,600 points.

A credible complete practice product still needs progressively harder corpora, invalid counterexamples, calling/riichi/push-fold/situational categories, optional deeper explanation, accessible presentation, and the complete browser pathway in the master brief. A numeric answer matching this engine does not establish that the engine is independently correct in every edge case; maintain human derivations and rule-specific regressions.
