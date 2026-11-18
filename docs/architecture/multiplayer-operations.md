# Running online tables

The home screen’s **Play online** entry opens `/#/online`. A custom room can seat guests, accounts, invited friends, explicit bots, and people who accept a matching Friendly offer. Friendly and Ranked queues pair the same rules, length, and pace. Ranked requires four accounts. A custom room and a rematch are always unrated.

| Rules | Lengths | Paces |
| --- | --- | --- |
| Riichi | East, East–South | Live, unlimited correspondence |
| Hong Kong Old Style, MCR WMO 2006, Taiwanese Every-flower | East, East–South, four rounds | Live, unlimited correspondence |

Live turns allow 20 seconds, discard claims allow 5 seconds, and a seat can receive bot cover after 60 seconds away. The owner can reclaim control. A new controlling tab fences commands from older tabs. Correspondence stores a null deadline for turns **and** claims. An outstanding win claim can wait across days and restarts. A player may explicitly withdraw to let a bot continue. Unanimous human consent closes a correspondence game without rating settlement.

## Railway configuration

Use the existing API, web, and PostgreSQL services. The API takes `DATABASE_URL`, applies ordered migrations before listening, and exposes `/healthz`. Set `APP_ORIGIN` to the exact web origin. Keep API and web on HTTPS same-site domains for the Secure, HttpOnly guest and account cookies. The built web bundle defaults to `https://api.openmahjong.app`. Set `VITE_ONLINE_API_ORIGIN` **at web build time** for a preview. Google accounts use the existing API OAuth configuration.

| API setting | Default | Effect |
| --- | --- | --- |
| `ONLINE_CUSTOM` | enabled | Set to `off` to stop creating custom rooms |
| `ONLINE_FRIENDLY` | enabled | Set to `off` to pause new Friendly queue entries and offers |
| `ONLINE_RANKED` | disabled | Set to `on` to open ranked matchmaking |
| `ONLINE_METRICS` | disabled | Set to `on` for aggregate one-minute API logs |

A worker restores the latest hand boundary, walls, and subsequent decisions. PostgreSQL locks serialize actions and settlement across replicas. A retry with the same action ID returns its original acknowledgment. The API sends a private snapshot immediately upon SSE connection, checks for changes once a second, and issues heartbeats every ten seconds. Each principal can hold eight streams per worker. The minute log includes stream counts, projected bytes, accepted-command latency and waiting time by format. The client’s transport delay includes the stream polling interval.

Close admissions before changing incompatible rule, replay, or bot versions. Preserve a compatible serving version for existing matches and their reviews. A shared heartbeat gap over 15 seconds makes affected active live Ranked games unrated. Results still settle. Database administrators need to protect backups as private game data. Walls and journals are retained so participants can review completed games. A guest browser credential lasts 30 days. The separate recovery code remains valid until used, replaced, or claimed into an account. An expired session never consumes a correspondence decision.

## Verification

Run from the repository root with a supported Node version, Chromium, and a disposable loopback PostgreSQL database. The example assumes the web is at `http://localhost:4187` and the API is at `http://localhost:4188`.

```sh
npm ci
npm run typecheck
VITE_ONLINE_API_ORIGIN=http://localhost:4188 npm run build
npm run check:packages
npm run check:security
OPENMAHJONG_TEST_DB="$DATABASE_URL" npm test
```

Start the built API with `PORT=4188 APP_ORIGIN=http://localhost:4187 ONLINE_RANKED=on` and the PostgreSQL connection. Start `PORT=4187 node packages/web/server.mjs` in another process. Run `node scripts/browser-multiplayer.mjs`. The script creates four isolated guest contexts, including a narrow viewport, joins by invite, makes the first discard on screen and drives remaining decisions through each seat’s authenticated API. It compares settlements, verifies hidden and revealed hands on a dealt board, and opens a fresh rematch. Set `ONLINE_BROWSER_PACE` to `live` or `correspondence`, and `ONLINE_BROWSER_LENGTH` to `east`, `south`, or `full`. The full run covers the three engines supporting that length.

The database tests run migrations into disposable schemas, exercise contested assignments, multi-tab control, a month of absence, credential rotation and account conversion, concurrent settlement and worker interruption. For a separate backup rehearsal, run `OPENMAHJONG_TEST_DB="$DATABASE_URL" node scripts/multiplayer-restore.mjs CONTAINER` against the same local Docker PostgreSQL instance. This creates and removes two freshly named databases, restores a real pg_dump archive, checks the entire finished replay and all four rating ledger entries, and submits the same next move to both copies of a pending match.

## Ranked calibration

The initial pool uses OpenSkill Plackett–Luce 4.1.1, separate by ruleset, length, pace and policy version. All four placements enter one update, including ties. A player who received a bot move can lose rating or stay level. The remaining seats use their ordinary updates. This cap can lower a pool’s average.

`node scripts/multiplayer-ratings.mjs` runs 4,500 synthetic training games and 2,000 independent evaluation games with the same population. A fixed seed makes it reproducible. A Glicko‑2 comparison weights each of three opponents by one third per rating period. First-place probabilities use OpenSkill’s group predictor or normalized exponential Glicko means. Pairwise predictions use the respective models' two-player formulas. Tied targets split credit.

| Held-out log loss (lower is better) | Uniform | OpenSkill | Weighted Glicko‑2 |
| --- | ---: | ---: | ---: |
| First place | 1.386 | 1.093 | 1.029 |
| Pairwise result | 0.693 | 0.759 | 0.487 |

The 12,000 held-out pairs included 504 ties. OpenSkill’s mean first-place probability error by seat ranged from −0.7 to +1.5 percentage points. Simulating one covered seat in 360 training games lowered the final average displayed rating by 63 points compared with the uncapped model. This synthetic population favors a particular outcome distribution. Assess actual game populations by variant and length and revisit abandonment treatment before enabling Ranked publicly.

The PR exercises the system locally and in GitHub CI. A Railway preview still needs a same-site sign-in, streaming across the hosting proxy, and a rolling restart on the target environment. Production enablement is a separate release decision.
