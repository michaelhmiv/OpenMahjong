# @openmahjong/ai

AI opponents for Open Mahjong, per brief §6: one solid level built on an
efficiency core (shanten + ukeire), hand-value judgment, and basic defense
against riichi — with every decision under 50 ms of compute.

The AI decides solely through `@openmahjong/engine`'s public state view
(`PlayerView`), so it can never see hidden information — no wall
peeking, enforced by API shape and by `test/hidden-state.test.ts`.

## Layout

- `src/policy.ts` — the opponent: `createAiPolicy()` returns an engine
  `Policy`. Three layers in priority order: efficiency (minimize
  shanten, maximize ukeire, tile-value tie-breaks), hand-value judgment
  (riichi vs damaten by wait quality and guaranteed value, push/fold
  against riichi, selective pon/chi/kan), and basic defense (genbutsu →
  suji → kabe against riichi only, per the brief).
- `src/analysis.ts` — fast shanten/ukeire/waits. The engine's DFS
  shanten is too slow for per-decision ukeire on dense hands, so this
  module decomposes the hand into per-suit segments with memoized
  Pareto-optimal outcomes; it is differentially tested against the
  engine's functions over thousands of seeded hands.
- `src/danger.ts` — the defense ladder: genbutsu, suji, kabe, and
  visibility-discounted honors/terminals/simples.

## Tests

- `test/analysis.test.ts` — differential agreement with the engine.
- `test/policy.test.ts` — behaviour on fabricated positions.
- `test/property.test.ts` — legality of every returned action across
  seeded random positions, including the engine's two-pass call window.
- `test/hidden-state.test.ts` — import/type/runtime enforcement.
- `test/benchmark.test.ts` — per-decision timing over full games.
- `test/soak.test.ts` — A3: AI-vs-AI games with exact score accounting.
  Count via `AI_SOAK_GAMES` / `AI_SOAK_SEED_OFFSET` (default 120; the
  CI `soak` job runs the full 10,000 across 8 shards).

The ~600–900 ms human-ish action cadence from brief §6 is presentation
and lives in the client; this package only computes.
