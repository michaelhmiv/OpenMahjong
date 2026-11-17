# Approved implementation program

Repository baseline: `da4b27b06079637bf9afe9239017a7b298035502`, refreshed 2026-11-17. Node 24.22.1 in the local environment.

## Authority and process exception

The owner explicitly authorized implementation of #39, #31, #32, #33 and #34 in that order, excluding all photo recognition. The implementation request supersedes intermediate brief/rendering approval gates in CONTRIBUTING.md, design-rules.md and issue bodies. Preserve existing visual tokens, typography, navigation and accessible controls. Capture completed application renderings and measure actual browser behavior. Historical approvals remain intact. No production deploy, merge, permission change, paid provisioning or issue comments are authorized.

## Decisions

- Review uses the existing explained coach comparisons without a new grading scale. Full replay data lives outside coach inputs.
- History reconstructs independently of the active runner. One reconstruction and 16-event checkpoints bound each timeline seek.
- Sessions are versioned ledgers, distinct from CPU replays and statistics; manual tools are local first and account optional.
- New playable variants remain unavailable until rules, AI, learning, coach, review, practice, resume, history, statistics and calculators pass acceptance.
- The earlier research file was not found in this workspace. Issue comments are evidence; payment and variant sources must be verified independently.

## Progress and acceptance

Implementation is complete in [draft PR #42](https://github.com/michaelhmiv/OpenMahjong/pull/42).
All five requested issues have their included functionality, with American remaining
a payment helper and photo recognition excluded. The [verification report](audit/program-verification.md)
maps each issue to the implemented behavior, source briefs and actual checks.

All required local gates pass: 1,097 standard tests, the separate three real
PostgreSQL tests, builds/type checking/package imports/security, and the actual
browser workflows. GitHub CI also passes on the final implementation commit.
The gallery contains 208 completed-application screenshots; capture scripts and
machine-readable reports cover mobile/desktop, offline use, private sync conflicts,
review performance, and every new variant's full stack. The report names the
unverified production OAuth and physical-device boundaries.

Changes are grouped into rules/scoring, server persistence, web integration,
targeted correctness fixes and documentation commits. No issue was closed or
commented on; #31 remains open for review with all included calculators implemented.
Nothing was merged or deployed to production. The owner's visual-design requirements
remain in force; only the intermediate approval stops were superseded.

## Refreshed issues (all pages of comments)

### #39: Game detail + review: study a finished game on the board

https://github.com/michaelhmiv/OpenMahjong/issues/39

## What this is

From the Games tab, tapping a finished game currently drops straight to results. A player who wants to study a game — the lichess use case this app is modelled on — needs to open a hand and follow how it actually unfolded. Directed by Michael on 2026-11-16.

## The need

- **An entry from a finished game into its hands**, with the game's context (final standings, settlement) at hand level.
- **Inside a hand: the board as it was, moment by moment.** Every player's draws, discards, and calls as they happened — not only the reviewing player's own turns. A hand is roughly forty discards; tapping through every one is not the need. A player must be able to move through the hand and land on the moments that matter.
- **At the reviewing player's own decisions, the coach's read:** what they did, what the coach preferred if anything, and why — graded **only on what they could see at that moment**. Standing ruling: review is outcome-blind; the hand's result never colours a grade, and a deal-in is never marked.
- **Opponents' concealed tiles as the player saw them live** (face-down) is the honest default presentation.
- **In-progress games are distinguishable in the Games list** and resumable from there as well as from Play (Michael's call, 2026-11-16).
- **Hand rows name the winner by the seat wind held that hand** ("Won by East") (Michael's call, 2026-11-16).

## Constraints that apply

- Shell nav law: drilled-in screens carry no bottom nav; the four tabs live only on the tab roots.
- Design rules v7 governs all UI; copy law: factual text only.
- The game's recorded event log is the source (replay machinery exists in the client); a signed-in player's history is private to their account.

## How this gets built

The building agent interprets the need above and brings its own design to Michael for approval (standing rule: no UI build before an approved rendering). This issue deliberately carries needs, rulings, and constraints — not a pre-made design.

### #31: Score calculator for in-person play (all variants)

https://github.com/michaelhmiv/OpenMahjong/issues/31

## What this is

A calculator tool inside Open Mahjong for people playing mahjong **in person**: pick the variant, enter the winning hand / situation, get the score and who pays what. Directed by Michael on 2026-11-16 after seeing that in-person players of the non-riichi variants rely on calculators at the table.

This issue is the hand-off point: research and design iterate here first; when Michael wraps the design, an agent gets pointed at this issue to build it.

## Status

- [x] Research: existing calculators per variant (input methods, outputs, scorekeeper modes) — in progress, report lands in `~/workspace/mahjong-prep/calculator-research.md` and its recommendation gets pasted into this issue
- [ ] Design brief + rendering approved by Michael (standing rule: no UI build before an approved rendering)
- [ ] Build

## Known shape so far

- **Riichi:** our engine already scores hands (han/fu, payments) — the calculator is largely a new face on existing math. Open: tile-entry vs pattern/context entry, honba/riichi-stick handling.
- **Hong Kong:** fan counting; the fan→points conversion is house-table dependent — research will say which table(s) to offer.
- **MCR:** 81-pattern checklist with the 8-fan minimum validation; payment structure differs (verify in research).
- **Taiwanese:** 16-tile hands, its own scoring unit — lands with its rule pack.
- **American:** hands carry printed values from the copyrighted annual card — a calculator cannot reproduce the card. At most a payment/doubling helper. Variant is ON HOLD regardless.

## Product constraints that apply

- Variant parity law (2026-11-16): every variant eventually gets the full stack; the calculator is per-variant, not riichi-only.
- Shell nav law (2026-11-16): bottom nav only on the four tab roots; the calculator is a drilled-in screen (no nav bar). Placement candidate: an entry on the Play tab — Michael's instinct was 'incorporated into the play screen'.
- Audience is US players, many beginners: labels plain, every term explained.
- Copy law: factual text only.

## Open questions for the research/design pass

1. Input method per variant: tile-picker hand entry, pattern checklist, or hybrid (enter hand → tool detects patterns → user confirms context)?
2. One-off hand calculation only, or also a 4-player in-person scorekeeper (names, running totals, hand-by-hand)?
3. Output: total + per-player payment split presentation.

https://github.com/michaelhmiv/OpenMahjong/issues/31#issuecomment-6934290895

## Research complete (2026-11-16)

Full sourced report: `~/workspace/mahjong-prep/calculator-research.md` (~50 KB). Headlines:

**The market's verdict: the durable product is a scorekeeper with a calculator inside it, not a bare calculator.** RiichiKun, Mahjiku, TileBuddy, Mahjong Points, Mahjong Helper and the American apps (Mahjongg Circle, The Mahj Report, Bird Bam) all keep a running 4-player game — named seats, hand-by-hand entry, undo/edit, end-of-night recap. Three layers exist: hand calculator → whole-game scorekeeper → end-of-game settlement. The brief must pick layers explicitly.

**Input:** tile-picker entry with automatic pattern detection is the beginner flagship, but experienced tables demand a fast path — the best tools offer both. Detected patterns must show as a _correctable_ breakdown (reviewers savage tools whose detection fails on special hands). Camera scanning is out for v1 (every vendor warns it misreads flowers/seasons). Win-context controls must be visible, never swipe-hidden. **Offline + no account is a hard expectation** — the most negative reviews found are for a tracker that forced online use.

**Per variant (verified against authoritative sources):**

- **Riichi:** honba stepper belongs in the calculator (+300 ron / +100 each tsumo); riichi sticks (kyotaku) belong only to the scorekeeper layer. Our shipped engine makes this variant ~free.
- **Hong Kong:** the real product is the conversion layer — half-spicy vs full-spicy tables vs the additive model, full-gun/half-gun splits, min-faan and cap as table settings, per-pattern house overrides.
- **MCR:** payments verified — discard win: discarder pays fan+8, others pay 8 each; self-draw: all pay fan+8. The 8-fan minimum excludes flowers. The exclusion/non-repeat engine is shared with the MCR rule pack.
- **Taiwanese:** scored in tai （台）; each payer pays base （底） + tai × per-tai value (table-agreed); dealer streak adds 2N+1 tai to settlements involving the dealer; no minimum. No single canon — tools anchor to a published app standard.
- **American:** a calculator **cannot** touch hands or values (copyrighted NMJL card) — but a legitimate feature exists: type the printed value, apply the non-copyrightable payment rules (discarder 2×/others 1×; self-pick all 2×; jokerless double except Singles & Pairs; bettor rule), plus scorekeeping. Cheapest variant to build; Michael's American hold was about the playable variant — whether this helper is in bounds is his call.

**Report recommendation:** calculator first with an 'Add to table' flow into a scorekeeper second half; entry as a mode card on the **Play tab** (≤2 taps from launch — it's opened mid-game, one-handed); finished sessions optionally surfaced in Games under 'At the table'; payer-by-payer payment lines lead the output, breakdown second; settlement (uma/oka) and multi-phone shared viewing deferred.

**Flagged gaps in the research:** direct r/Mahjong thread text wasn't retrievable (community evidence is from app-store reviews and mahjong press/blogs); TileBuddy's FAQ is internally inconsistent on HK numbers (report relied on the Wikipedia/Mahjiku-consistent tables); 'big play apps don't bundle calculators' is listing-based, not a hands-on audit.

Next: design brief + rendering for Michael's approval, per the standing gates.

https://github.com/michaelhmiv/OpenMahjong/issues/31#issuecomment-6934373138

## Rulings (Michael, 2026-11-16)

1. **All three layers are in scope**: hand calculator → whole-game scorekeeper → end-of-game settlement. Build order stays calculator first, with the "Add to table" growth path into the scorekeeper.
2. **American helper APPROVED** in its no-copyright shape only: the player types the value printed on their own physical card; the app applies the standard payment rules and keeps score. The app never ships, stores, or reproduces NMJL card contents or hand patterns. If any part of the helper would require card data, that part is out.
3. **Sequencing**: a variant's calculator depends on that variant's scoring engine. Riichi's calculator can go first (engine exists). Hong Kong / MCR / Taiwanese calculators land with their rule packs (#32 / #33 / #34).

## The two input speeds (for the design brief)

- **Tile-picker (teaching speed)**: the player taps the winning hand's actual tiles into a hand builder, marks melds open/closed, win type (self-draw vs discard + who dealt), seat/round context. The app detects the patterns itself and shows a **correctable breakdown** — every pattern and its points listed, each overridable before the result is written to the score. For beginners and disputed hands; ~30–60s per hand.
- **Fast path (table speed)**: the player who already knows the hand picks its patterns from a checklist (or enters fan/points directly where the variant scores that way) plus win type and payer. A few taps, ~5–10s. For experienced tables where entering 14 tiles every hand would kill the flow.

Both are required: real tables mix experience levels, and the correctable breakdown is the trust mechanism in both paths — detection errors are the top complaint in competitor reviews.

https://github.com/michaelhmiv/OpenMahjong/issues/31#issuecomment-6934442364

## Third input speed APPROVED (Michael, 2026-11-16): photo input

- The player photographs the winning hand laid out in a row; a **cheap vision model** (via OpenRouter, selected by a model-champion bake-off like the other seats) reads the tiles and returns a tile list.
- The result lands in the tile-picker as a **draft** — the player confirms or corrects it, then **our engine does all scoring**. The model never scores, never does math, and a photo never writes a result unconfirmed.
- The photo is **not retained** (same rule as Munch photo logging: confirm before save, photo discarded).
- Photo input is an **online add-on only**: it needs network, so the tile-picker remains the offline default at a real table. Calls route through our server with rate limits so the API key can't be abused.
- Not a Jev seat: the Jev decision models are text/structured-data only (image verification was explicitly kept out of their scope in the Munch program). This is a separate vision seat under the same champion policy.
- Expectations for the brief: clean reads on flat, well-lit, standard tile sets; corrections expected with glare, stacked melds, or non-standard sets — which is exactly what the draft-and-confirm step absorbs.

https://github.com/michaelhmiv/OpenMahjong/issues/31#issuecomment-6934496331

## Correction (2026-11-16): Jev CAN take images — earlier comment corrected

The photo-input comment above says the Jev models are "text/structured-data only." **That is wrong, and Michael flagged it.** Verified record (2026-11-11, from OpenRouter's Multimodal Decisions documentation): `typesafe/jev-1.14` accepts images via the **Decisions API** (POST /api/alpha/decisions) as an `image_url` part in the top-level `state` array (base64 data URL, PNG/JPEG only) or via the `assets` map; 1.14 also adds Box questions.

What actually "stays dead" is narrower: the Munch pattern of Jev **verifying** another model's photo identifications — measured ineffective on food photos (precision 55.2% → 55.8%, caught 0 of 13 recall gaps). Tile reading is **extraction**, not verification, so that verdict does not apply here.

Updated scope for photo input:

- **Jev is a candidate for the vision seat** (Decisions API), alongside small VLMs; the champion-policy bake-off on real tile photos decides, measuring accuracy, latency, and cost per photo.
- Known Jev image constraints to design around: images must be **256–1568 px per side** (rejected, not resized), image input is gated behind the `TypeSafe-Danger-Zone-Images: true` header, image requests run in a slower long-context mode, and TypeSafe labels image input an early feature.
- Everything else in the photo-input scope stands: draft into the tile-picker, player confirms/corrects, our engine scores, photo not retained, online add-on, server-routed and rate-limited.

https://github.com/michaelhmiv/OpenMahjong/issues/31#issuecomment-6936082853

## Rulings (Michael, 2026-11-16)

- **All three layers are approved:** (1) a hand calculator, (2) a whole-game scorekeeper the hand result can be added to, (3) end-of-game settlement. Build order: calculator first.
- **Two input speeds are both required:** entering the actual tiles (the tool works out the patterns and shows a breakdown the player can correct before anything is recorded), and a fast path for experienced players. Correctability before recording is the trust mechanism in both.
- **Photo input is approved as a third input speed:** a photo of the winning hand becomes a draft entry the player confirms or corrects; the engine does all scoring (a model never scores); the photo is not retained. Online add-on only — the manual paths work fully offline with no account.
- **Vision seat is open:** Jev (typesafe/jev-1.14) accepts images via the Decisions API and is a candidate alongside small vision models; a bake-off on real tile photos (accuracy, latency, cost) decides. (Corrects an earlier note here that Jev could not take images.)
- **American helper is approved** in this shape only: the player types the value printed on their own physical card; the app applies the standard payment rules and keeps score. The app never ships, stores, or reproduces NMJL card contents or hand patterns.

## Situations a real table produces (the need, stated plainly)

Hands end with no winner. Players declare riichi and put points on the table. Two players can win off the same discard. Fouls happen and carry a standard penalty payment. People mis-enter a result and need to fix it. A scorekeeper that cannot absorb the ordinary events of a real game sends the table back to paper — handling these is part of the need, in whatever form the design gives them.

## How this gets built

The building agent interprets the need above and brings its own design to Michael for approval (standing rule: no UI build before an approved rendering). This issue deliberately carries needs, rulings, and constraints — not a pre-made design.

### #32: Variant: Hong Kong mahjong — full parity implementation

https://github.com/michaelhmiv/OpenMahjong/issues/32

## What this is

Implement **Hong Kong mahjong** as a playable variant in Open Mahjong, at **full parity with riichi** (Michael's parity law, 2026-11-16: every variant encompasses everything riichi has). First variant after riichi in the program order: Hong Kong → MCR → Taiwanese.

## Scope (parity checklist)

- [ ] Rules-engine rule pack: Hong Kong rules (fan-based scoring, flower/season bonus tiles, chow/pung/kong play; no riichi/dora/furiten)
- [ ] CPU opponent on the same driver seam
- [ ] Tutorial set for Hong Kong (ship gate: a variant does not ship without a substantial tutorial, §11 north star)
- [ ] Guided coach for Hong Kong games (hints + explanation sheets via the ruleset seam)
- [ ] Review / Practice support for Hong Kong games
- [ ] Stats, history, resume carry-over — variant-aware throughout
- [ ] Score calculator support for Hong Kong (see #31)

## Process gates (standing rules)

- No code before an approved brief; decisions recorded in the project files
- Any UI surface: approved rendering first (Impeccable + independent QC), then build
- Design law: docs/design-rules.md; shell nav law: bottom nav only on the four tab roots; Learn lessons live in collapsible per-variant sections
- Copy law: factual text only; US beginner audience — every term explained at first use

## Notes

Hong Kong is the social/traditional Chinese style: simpler scoring than riichi, fast hands — the gentlest second variant for a US audience. Scoring-table choice (fan→points) is a brief-level decision; the calculator research (#31) covers what tables existing tools offer.

### #33: Variant: MCR (Mahjong Competition Rules) — full parity implementation

https://github.com/michaelhmiv/OpenMahjong/issues/33

## What this is

Implement **MCR — Mahjong Competition Rules** (the official Chinese tournament ruleset) as a playable variant in Open Mahjong, at **full parity with riichi** (Michael's parity law, 2026-11-16). Second in the program order: Hong Kong → MCR → Taiwanese.

## Scope (parity checklist)

- [ ] Rules-engine rule pack: MCR rules — 81 scoring patterns (fan), **8-fan minimum to win**, flower/season tiles score, no dora/riichi/furiten; MCR payment structure (verify against an authoritative MCR source in the brief)
- [ ] CPU opponent on the same driver seam
- [ ] Tutorial set for MCR (ship gate: a variant does not ship without a substantial tutorial — with 81 patterns, the tutorial and pattern-teaching surface is the biggest design problem in this variant)
- [ ] Guided coach for MCR games (hints + explanation sheets via the ruleset seam; pattern-progress reads are the MCR coach's core)
- [ ] Review / Practice support for MCR games
- [ ] Stats, history, resume carry-over — variant-aware throughout
- [ ] Score calculator support for MCR (see #31 — the 81-pattern checklist calculator is a natural fit here)

## Process gates (standing rules)

- No code before an approved brief; decisions recorded in the project files
- Any UI surface: approved rendering first (Impeccable + independent QC), then build
- Design law: docs/design-rules.md; shell nav law: bottom nav only on the four tab roots; Learn lessons live in collapsible per-variant sections
- Copy law: factual text only; US beginner audience — every term explained at first use

## Notes

MCR's complexity is different from riichi's: no live betting mechanics, but a large pattern catalog and a minimum threshold — the challenge is teaching pattern-building. Sequence after Hong Kong lands.

### #34: Variant: Taiwanese mahjong (16-tile) — full parity implementation

https://github.com/michaelhmiv/OpenMahjong/issues/34

## What this is

Implement **Taiwanese mahjong** as a playable variant in Open Mahjong, at **full parity with riichi** (Michael's parity law, 2026-11-16). Third in the program order: Hong Kong → MCR → Taiwanese.

## Scope (parity checklist)

- [ ] Rules-engine rule pack: Taiwanese rules — **16-tile hands** (five sets + pair), its own scoring unit (tai/台） and pattern set; verify all rules against authoritative sources in the brief (the engine's 13-tile assumptions — hand size, wall, draw flow — need a deliberate audit for 16-tile play)
- [ ] CPU opponent on the same driver seam
- [ ] Tutorial set for Taiwanese (ship gate: a variant does not ship without a substantial tutorial)
- [ ] Guided coach for Taiwanese games (hints + explanation sheets via the ruleset seam)
- [ ] Review / Practice support for Taiwanese games
- [ ] Stats, history, resume carry-over — variant-aware throughout
- [ ] Score calculator support for Taiwanese (see #31)

## Process gates (standing rules)

- No code before an approved brief; decisions recorded in the project files
- Any UI surface: approved rendering first (Impeccable + independent QC), then build
- Design law: docs/design-rules.md; shell nav law: bottom nav only on the four tab roots; Learn lessons live in collapsible per-variant sections
- Copy law: factual text only; US beginner audience — every term explained at first use

## Notes

Taiwanese is regionally huge (Taiwan + diaspora), less visible in the US. The 16-tile hand is the structural difference most likely to stress existing engine/table assumptions — the brief must audit table geometry (hand display, ponds) for 16 tiles plus melds.
