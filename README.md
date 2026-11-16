# Open Mahjong

**The lichess of mahjong.** A free, open-source, web-first mahjong platform.
Four-player riichi mahjong; no account required to play.

The rules engine will carry every major variant — riichi first, then
Hong Kong, MCR, and American — as rule packs on one shared core.

## Principles

- **Free forever.** No paywalls, ever.
- **Open source** under the GNU AGPL v3.0 — anyone can read, run, and build
  on the code; anyone who runs a modified version as a service must share
  their changes.
- **Play first.** Teaching and coaching tools are woven into the game in
  later slices; the game itself is the product.
- **Deterministic engine.** The rules engine is a standalone TypeScript
  library with a seeded RNG: same seed, same game, every time — so games
  are replayable, testable, and reviewable.
- **Minimal UI, smooth animation** are first-class features, not polish.

## Repository layout

| Package | What it is |
| --- | --- |
| `packages/engine` | The rules engine library (brief §5): tiles, wall, hand analysis (shanten/ukeire), scoring. Pure TypeScript, no UI, no runtime dependencies. |
| `packages/ai` | The AI opponents (brief §6). Depends only on the engine's public state view. |
| `packages/coach` | The coach (slice-2 brief §9): the AI's discard evaluation opened up — ranked options with structured reasons (efficiency, waits, danger) for guided hints and lessons. Depends on the engine and the AI evaluation. |
| `packages/web` | The web client (brief §7–§10). Renders engine state; holds no game logic. |

The approved design brief lives at [`docs/brief-v1.md`](docs/brief-v1.md)
and is the governing spec for slice 1.

## Development

```sh
npm install
npm run typecheck   # TypeScript strict, all packages
npm test            # Vitest — engine test vectors and unit tests
```

CI (GitHub Actions) runs install, typecheck, and the full test suite on
every pull request and every push to `main`.

## License

GNU AGPL v3.0. See [`LICENSE`](LICENSE).
