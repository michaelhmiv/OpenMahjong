# @openmahjong/web

The Open Mahjong web client, per brief §7–§10: land-and-play home, a flat
straight-down table (portrait-first, dark theme default, theme v5 tokens),
traditional tile faces drawn clean, the §9 animation set as one motion
language, the §8 Focus Frame inspect system, and tile-click sound only.
Offline-capable PWA; anonymous play with settings and history in local
storage only (brief §11).

The client renders `@openmahjong/engine` state and holds no game logic of
its own — if client and engine disagree, the engine is right by
definition.

## Architecture

- `src/model.ts` — TableModel: the rendered table as a pure fold of the
  engine's event log (brief §9).
- `src/drivers.ts` — the seat-driver seam. `HumanDriver` defers every
  decision to the UI; `AiDriver` adapts the real opponent from
  `@openmahjong/ai` (brief §6) to the same interface.
- `src/runner.ts` — GameRunner: drives the synchronous engine from the
  event-driven UI via deterministic replay (brief A5). Every decision is
  logged; replaying seed + log reproduces the identical event prefix and
  suspends at the human's next decision. The saved game in local storage
  is exactly that log, so a mid-game refresh resumes the same state
  (A8).
- `src/app.ts` — screens (§7), table rendering, playback/FLIP animation,
  prompts, Focus Frames, breakdown, results.
- `src/sound.ts` — synthesized WebAudio tile clicks (no audio assets).
- `src/settings.ts` — local-storage settings, saved game, history.

## Build & hosting

```sh
npm install          # from the repo root (workspaces)
npm run build        # in this package: vite build -> packages/web/dist/
```

The build output is a static site (`packages/web/dist/`, relative asset
paths, service worker included) suitable for Railway static hosting per
brief §11: point a Railway static service at `packages/web/dist` (build
command `npm run build` in `packages/web`). No server component exists in
slice 1. Deployment itself is a separate, owner-run step.

## Tests

From the repo root: `npm test` (Vitest) — includes the model fold,
driver legality/determinism, and runner resume round-trip suites.
