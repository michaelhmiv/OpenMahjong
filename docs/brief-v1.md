# Open Mahjong — Deep Design Brief v1

Status: APPROVED by Michael, 2026-11-15 (Gate 1 passed in the Open Mahjong room).
Date: 2026-11-15. Source of rulings: ~/workspace/mahjong-prep/concept-2026-11-15.md
(grill rounds 1–5, all approved by Michael 2026-11-15).

---

## 1. Goal

Build **Open Mahjong**: a free, open-source, web-first mahjong platform — "the
lichess of mahjong." Slice 1 is a complete, real riichi mahjong game against AI,
playable in a browser, offline-capable, with a clean minimalist presentation and
smooth animation as first-class features. The architecture is a variant engine:
riichi ships first; Hong Kong, MCR, and American follow as rule packs.

## 2. Audience vibe

The buyer is an adult — roughly 30+ — who has heard riichi is the deep version of
mahjong, tried the incumbents, and bounced off the presentation: anime character
banners, gacha currencies, ad stacks, account walls. They want the real game,
presented quietly and respectfully, with a way to actually get better at it.
Secondary audience: experienced riichi players who want a clean, fast, honest
client with no casino shell. Design to that vibe: calm, deliberate, nothing on
screen that isn't the game or clearly in service of it.

## 3. Product law (hard floors — Michael's rulings, verbatim substance)

- Free forever. Open source under **AGPLv3**. Public GitHub repo under Michael's
  account, open from the first commit.
- No ads. No gacha. No in-game currency. No characters/mascots. No account
  required to play.
- **All versions eventually** — riichi, Hong Kong, Chinese/MCR, American — as
  rule packs on one engine. **Play first**; teaching/coaching is woven into
  later slices, never a course with a game attached.
- **Minimalistic UI and smooth animations are a big emphasis**, not polish to
  be deferred.
- Web first. Hosting on **Railway** for both phases (static now on the existing
  Hobby plan; one always-on WebSocket service when online play arrives).
- UI work is governed by the **impeccable** skill, named here per standing rule:
  the skill holds real design authority over the look; only the hard floors in
  §8 constrain it.
- **Renderings before approval**: no UI surface is built before a faithful
  rendering of it has passed independent QC and Michael's approval.
- Animation design leverages **Inkling 2 Small** via the `openrouter_harness`
  skill (dense still sequences in; Jeff judges captures against actual game
  state; Michael's device pass is the final motion gate).

## 4. Slice 1 — spec items (verbatim scope)

- **S1-1** A complete riichi game vs AI: full East-only and East+South games,
  real scoring, in the browser, offline-capable.
- **S1-2** Modern online-standard riichi rules as the default (red fives, open
  tanyao allowed); house-rule toggles come later, not in slice 1.
- **S1-3** One solid AI level: efficiency-based hand building plus basic
  defense. Difficulty levels later.
- **S1-4** Post-game score breakdown after every hand and game. (Coaching,
  drills, and full game review are slice 2.)
- **S1-5** No accounts: anonymous play, settings and history in local browser
  storage only.
- **S1-6** Flat, straight-down table view (lichess-style). No tilted 2.5D.
- **S1-7** Tile faces are traditional designs drawn clean/flat, high contrast —
  the tiles a player would see at a physical table.
- **S1-8** Full animation set in slice 1 (§9), one consistent motion language.
- **S1-9** Portrait-first layout; scales up to desktop.
- **S1-10** Dark theme default; light theme toggle. Quiet tile-click sounds,
  on by default, one-tap mute; no music, no voices.
- **S1-11** No turn timer against the AI. Land-and-play home: one tap from
  opening the site to sitting at a table. Player's hand auto-sorts.
- **S1-12** Scoring stakes: start 25,000, return 30,000, uma +15/+5/−5/−15.
- **S1-13** Full standard draw handling: exhaustive draws with tenpai/noten
  payments (3,000 in play); abortive draws on (four riichi, four winds, nine
  terminals, four kans); nagashi mangan counts.
- **S1-14** Every remaining rules detail follows the mainstream online
  standard; an in-app rules page documents every choice the engine makes.
- **S1-15** The rules engine ships as its own open-source TypeScript library,
  separate from the web client, so others can build clients on it.

Explicitly NOT in slice 1: online multiplayer, accounts, coaching/drills,
other variants, rule toggles, difficulty levels, sound beyond tile clicks,
any monetization surface of any kind.

## 5. Engine architecture (the library, S1-15)

Monorepo, TypeScript throughout, GitHub Actions CI on every PR (Michael's
standing Actions-first rule; this VM does not run heavy builds).

- **`engine` package** — pure, deterministic, UI-free. Same inputs + same seed
  = same game, always (seeded RNG), which is what makes games replayable,
  testable, and later reviewable.
  - *Tile model*: 34 tile types × 4 copies = 136, with red fives as flagged
    copies of the three 5s. Tiles are data, never images.
  - *Wall*: live wall, dead wall (14), dora indicators flipped per kan,
    rinshan draws — modeled explicitly, not as special cases in the client.
  - *Hand analysis*: shanten calculation (standard, chiitoitsu, and kokushi
    forms), winning-hand detection, and **ukeire** (tile acceptance: which
    draws improve the hand, and how many copies remain).
  - *Scoring*: full yaku detection (all standard yaku incl. yakuman and
    double yakuman where the standard grants them), fu calculation with all
    standard rounding/pinfu exceptions, han/fu → points table incl. honba
    (300 per honba on ron, 100 each on tsumo) and riichi-stick carryover,
    kiriage mangan OFF (mainstream online default; documented on rules page).
  - *Rules core*: turn state machine (draw → discard → call window), calls
    (pon, chi — left player only, kan: ankan/shouminkan/daiminkan), riichi
    declaration incl. the 1,000-point stake and ippatsu window, dora/kandora/
    uradora, furiten in all three forms (discard, temporary, riichi), head
    bump (atama-hane) for double ron, renchan conditions, exhaustive and
    abortive draws per S1-13, nagashi mangan, final settlement with uma/oka
    per S1-12, and bust-out (tobi) ending a game early when a player falls
    below zero.
  - *Variant seam*: every rule above lives behind a ruleset object
    (tile set, calls allowed, scoring function, draw rules). Riichi is the
    first ruleset; the seam exists from day one so Hong Kong/MCR/American are
    additive, not a rewrite.
- **`ai` package** — depends only on `engine`'s public state view (an AI sees
  exactly what a human at the table would see — no wall peeking, enforced by
  API shape, not by honor system).
- **`web` package** — the client (§7–§10). Renders engine state; holds no
  game logic of its own. If the client and engine ever disagree, the engine
  is right by definition.

## 6. AI design (S1-3)

One level, honest play, three layers in priority order:

1. **Efficiency core**: every discard decision minimizes shanten, tie-broken
   by ukeire (count and quality of improving tiles), with tile-value heuristics
   (terminals vs simples, dora and red-five retention, yaku direction —
   tanyao/honitsu/pinfu-shaped hands preferred when the tiles suggest them).
2. **Hand-value judgment**: the AI does not race every cheap hand. It weighs
   speed against value (a closed hand with dora potential is kept closed;
   riichi is declared when tenpai with a reasonable wait and score situation
   justifies it — and not declared into obviously bad waits late in the hand).
3. **Basic defense**: when another player declares riichi, the AI shifts:
   discards genbutsu (tiles the riichi player has discarded) first, then
   suji-safe tiles, and will break its own hand (fully fold) when it is far
   from tenpai against a riichi. No defense theater outside riichi for
   slice 1 (dealing around open hands is a later difficulty level).

Pacing: AI actions land with a human-ish cadence (~600–900 ms per action,
slightly varied) so the table reads as alive, never instant-robotic and never
sluggish. Every AI decision must complete in <50 ms of compute on a mid-range
phone — the cadence is presentation, not thinking time.

## 7. Screen & flow inventory (slice 1)

- **Home (land-and-play)**: wordmark, one primary action — Play (East game /
  East+South chosen by a simple two-option selector, defaulting to the last
  played). Secondary, quiet: Rules, Settings, About. Nothing else. No news,
  no banners, no feed.
- **Table**: the game itself (§8 layout). Includes round/score header,
  four player areas, center pond information (round wind, honba, riichi
  sticks, wall count, dora indicators), call prompts (pon/chi/kan/ron/
  riichi/tsumo/pass) as large, unmissable buttons when available, and a
  pause/menu affordance (resume, restart, quit to home, mute, theme).
- **Hand-end breakdown**: winning hand rendered in tiles, yaku list with
  han, fu, points, who paid whom, dora/uradora reveal — then auto-advance
  or tap to continue.
- **Game-end results**: final scores, placement, uma/oka settlement math
  shown plainly, Play again / Home.
- **Rules page**: every engine rules choice in plain language (S1-14) —
  stakes, dora, furiten, draws, settlement. This page is a deliverable of
  the engine, not marketing copy.
- **Settings**: theme (dark/light), sound on/off, animation speed
  (standard/reduced), and a reduced-motion respect for the OS setting.
  Stored locally (S1-5).
- **About**: what Open Mahjong is, the AGPLv3 license, link to the public
  repo, "free forever, no ads" statement. One screen, no email capture.

No other screens exist in slice 1. Adding one later requires a brief change.

## 8. Table & tile presentation (UI law for slice 1)

Governing skill: **impeccable** — it holds design authority over the look
within these hard floors (Michael's rulings + standing floors):

- Flat, straight-down table (S1-6). Minimalist above all: the table shows
  the game and nothing else — no decorative chrome, no panels competing
  with the tiles, no explanatory paragraphs on the play screen.
- Tiles are the color story. Dark neutral table by default (S1-10);
  traditional tile faces drawn clean and flat (S1-7), legible at phone
  size — a tile face must be identifiable at a glance at its smallest
  on-screen size (opponents' hands and ponds), verified in renderings.
- Type floor 11px; tap targets ≥44px (call buttons comfortably above it).
  Clarification (Michael's ruling, 2026-11-15, adopting Jeff's recommendation
  after QC surfaced it on rendering v1): the 44px floor governs CONTROLS —
  buttons, prompts, menu items. Hand tiles are not controls-sized: 14 tiles
  cannot each be 44px across a 390px screen. In the client build, hand tiles
  carry EXPANDED INVISIBLE HIT AREAS (generous touch slop overlapping
  neighbors, nearest-tile resolution) so selection is never fiddly despite
  the ~25px visual width.
  No emojis anywhere in UI. No anime, no characters, no mascots.
- Portrait-first geometry: player hand along the bottom at full readable
  size, opponents left/top/right with compact but legible tiles, ponds in
  orderly 6-per-row grids, center block carrying round/score/dora.
  Desktop is the same composition with more air, not a different design.
- Rendering gate: the table, tiles, and every screen in §7 get faithful
  renderings — built from the actual layout, not mood boards — through
  independent QC and Michael's approval BEFORE the client is built.
- **Accessibility is a first-class requirement, not a setting afterthought
  (Michael's ruling, 2026-11-16 — the tiles are small, so users must be
  able to manage and understand the table):**
  - **Selected-tile magnification:** tapping a hand tile lifts AND enlarges
    it (~1.5×) before any commitment; the riichi-armed lift is the same
    language. A player can always inspect a tile big before acting on it.
  - **Meld dividend:** when melds shrink the closed hand (10/7/4 tiles),
    hand tiles grow into the freed width automatically.
  - **Responsive scale-up:** the table scales with the viewport — desktop
    and tablet tiles are substantially larger; 390px portrait is the
    minimum case, not the design case.
  - **"Large tiles" Settings toggle:** pond tiles step down (~22px) and
    hand tiles step up (~28px) for players who need the hand above all.
    Gets its own rendering through the QC + approval gate before build.
  - **Large-print tile faces:** an alternate face set with enlarged glyphs
    at the same tile geometry, for legibility without layout change.
  - **No state by color alone:** every game state carried by color (riichi,
    dora, the decisive prompt button) is also carried by shape, position,
    or text, so the table reads correctly for color-blind players.
  - Reduced motion and animation speed already live in §9; sound is
    one-tap mutable in §10. These are part of the same commitment.
- **Focus Frame — the zoom/inspect system (Michael's direction 2026-11-16,
  after the accessibility research report
  `~/workspace/mahjong-prep/accessibility-research-2026-11-16.md`; all four
  design decisions approved "yes to all" the same day):**
  - **Player frame:** tapping any pond opens that player's frame — pond
    tiles upright and un-rotated at ~44–50px, melds in the SAME frame (read
    together, never split across views), latest discard badged, riichi
    declaration tile marked, tsumogiri/tedashi shading shown WITH a small
    legend (frames are inspection tools: minimal labels are exempt from the
    table's no-explanatory-text law — decision 2). A context strip carries
    that player's score/wind/riichi status and the PLAYER'S OWN HAND as the
    comparison anchor — hand only, no waits/danger summary (that is
    coaching, parked for slice 2 — decision 3). Read-only and LIVE: new
    discards animate in while the frame is open; it is a view of state,
    never a snapshot.
  - **Center frame:** tapping the center block opens dora indicators each
    shown BESIDE the dora it indicates (~56px), plus wall/round/honba/
    sticks/all scores — semantic enrichment, not just bigger pixels.
  - **Hand focus sheet:** the hand re-wraps at ~48px in TWO ROWS OF 7,
    order preserved, everything visible (decision 1 — no scrolling row).
    Fully actionable inside: discard selection, and Riichi/Tsumo/Kan
    prompts at full size. Entry via a visible hand-expand control (no
    long-press-only paths anywhere in the system).
  - **Animation:** shared-element FLIP — tiles travel from their table
    positions into the frame (un-rotating as they go), ~250–300ms in /
    ~200ms out; the table stays visible, dimmed, behind. OS reduced-motion
    swaps travel for crossfade.
  - **Exit & pre-emption:** tap outside, tap the dimmed zone, back, or
    swipe down — always the same reverse animation home; no edge-swipe
    exits. A call window for the player AUTO-DISMISSES any open frame (the
    game never waits inside a zoom); the player's own turn arriving shows a
    banner on the frame edge without force-dismissing; hand end closes the
    frame into the breakdown; tiles that changed while zoomed pulse briefly
    on the table after exit.
  - **No free pinch-zoom camera** (rejected on the research evidence:
    camera drift, event camera-theft, two-handed, WCAG 2.5.1). Semantic
    tap-to-frame is the only zoom. Tsumogiri shading lives in frames only,
    never on the base table (decision 4). The system is taught in the first
    game with a scripted pond tap, plus a one-time hint when an opponent's
    pond passes ~8 discards.

## 9. Animation spec (S1-8) — a headline feature

One motion language: tiles are physical objects that glide, lift, and
settle; nothing teleports, nothing fades through anything else. Motion is
state-to-state (FLIP-style transforms driven by engine state changes), so
what animates is always exactly what the engine did — the CyberCache law:
the stage conveys what is legitimately happening, nothing invented.

Motion inventory for slice 1 (each item is a separate acceptance check):
deal (walls → hands, 4-4-4-1 rhythm), draw (wall → hand), discard (hand →
pond, with the drawn tile's tsumogiri visually distinguishable), calls
(discard → caller's meld, correct tile rotation for the called tile),
kan (incl. rinshan draw + indicator flip), riichi (stick placement +
declaration discard marked sideways), tsumo/ron win reveal (hand opens,
breakdown panel rises), exhaustive draw (tenpai hands reveal), score
changes (points count between values, sticks move), round transitions
(wind/honba update, ponds clear, new wall), and game-end settlement.

Performance/behavior floors: 60fps on a Pixel-class phone; every animation
skippable by tapping (fast-forward to settled state, never to a wrong
state); a global animation-speed setting and OS reduced-motion support
(§7 Settings) collapse motion to near-instant without changing state
order. Long games must never desync: animation is a view of the engine's
event log, and killing animation entirely still leaves a correct game.

Design process for motion: per standing practice, key sequences are
designed from dense still frame sets critiqued with **Inkling 2 Small**
(`openrouter_harness` skill — generous frame sequences, since Inkling
judges from stills), Jeff audits resulting captures frame-by-frame
against the engine event they depict, and Michael's pass on a real build
is the final gate. Inkling advises; it never approves.

## 10. Sound (S1-10)

Tile clicks only: a soft click on discard placement, a slightly firmer
one on calls and the win. Synthesized or recorded-once, tiny footprint,
no library of effects, no music, no voices. On by default, one-tap mute
on the table and in Settings.

## 11. Offline, storage, hosting

- PWA: installable, fully playable offline after first load (service
  worker caches the app shell and assets; there is no server component
  in slice 1 to call).
- Local storage only: settings, in-progress game (resume after the tab
  closes — a game in progress is never lost to a refresh), and finished-
  game history (score lines only).
- Hosting: Railway static service on Michael's existing Hobby plan
  (~$0 marginal). Custom domain is a launch errand, not slice-1 scope
  (openmahjong.* names are taken/parked — revisit at launch).
- Repo: monorepo, public from the first commit, AGPLv3 LICENSE at root,
  GitHub Actions CI (engine tests + web build) gating every PR.

## 12. Phasing beyond slice 1 (for orientation — not this brief's scope)

- **Slice 2**: coaching layer — discard coach in practice mode, efficiency
  and defense drills, full game review from the deterministic replay log.
- **Slice 3**: Hong Kong ruleset pack (simplest second variant) on the
  engine seam; MCR after.
- **Slice 4**: American — blocked on the NMJL card answer (user-supplied
  card data vs licensing); briefed separately when reached.
- **Later**: online multiplayer (accounts arrive here, and only here),
  one always-on Railway WebSocket service; difficulty levels; rule
  toggles. Donations (lichess model) only once there is something to
  donate to — never paywalls, never ads, at any phase.

## 13. Acceptance checks — slice 1 (defined now; Gate 2 evidence later)

Engine (automated, CI):
- **A1** Scoring vectors: a published corpus of ≥150 known hands (covering
  every yaku, fu edge cases incl. pinfu-tsumo and seven pairs fixed 25 fu,
  mangan-through-yakuman, honba and stick arithmetic) scores exactly right.
- **A2** Shanten/ukeire vectors: ≥100 known positions return exact shanten
  and acceptance counts.
- **A3** Simulation: ≥10,000 AI-vs-AI full games complete with zero illegal
  states, zero stuck games, wall/dead-wall accounting exact in every hand,
  and final scores summing to the starting total in every game.
- **A4** Rules cases: scripted scenarios prove furiten (all three forms),
  head bump, each abortive draw, nagashi mangan, renchan conditions, tobi
  ending, and exhaustive-draw payments.
- **A5** Determinism: same seed replays to the identical game, event for
  event — the property slice-2 review is built on.

Client (captures + device):
- **A6** Renderings for every §7 screen approved by Michael before build;
  shipped screens audited against those renderings by independent QC.
- **A7** Animation: every §9 inventory item captured and audited against
  the engine event it depicts; 60fps on a Pixel-class device; tap-to-skip
  and reduced-motion paths exercised and correct.
- **A8** Offline: first load online, then airplane-mode full game
  completes; mid-game refresh resumes the same game at the same state.
- **A9** Michael plays a full East+South game on his Pixel and passes it —
  readability, pacing, and feel. This check is his, and it closes slice 1.

## 14. Risks & open items (named, not hidden)

- **American/NMJL card copyright** — deferred to slice 4 by design (§12).
- **Name/domain** — "Open Mahjong" is the product name; matching domains
  are taken/parked. Launch-time errand; does not block slice 1.
- **Inkling is stills-only** — it informs motion design; it cannot judge
  motion itself. Mitigated by Jeff's frame audits + A9 device pass (§9).
- **AI strength calibration** — "beats a beginner, honest vs intermediate"
  is judged by simulation stats (A3: deal-in rate, win rate by seat should
  be near-even across identical AIs) plus Michael's A9 play pass.

THEME v5 — APPROVED (Michael, 2026-11-16, after QC pass + notes fix).
Supersedes the v1–v4 token set everywhere, including the Focus Frame files
(their geometry and interaction stand; their colours adopt these tokens in
the client build). Direction: friendlier scheme per the Two Dots reference
(research: mahjong-prep/two-dots-reference-2026-11-16.md) — quiet ground,
colour lives in the pieces, closed accent vocabulary.
- Ground #231f2e (deep plum-charcoal); panel #2f2a3d, borderless, radius
  20px, separation by a soft 1.16:1 value step (device-pass watch item;
  fallback is deepening the panel, never restoring borders).
- Tile backs #554a6b muted plum-slate (edge #3a3249) — green is a piece
  colour only, never ground. Faces #f6f1e4 warm cream. Ink #f2eff8, dim
  #b8b0cc. Suit glyph colours unchanged (they outrank the theme).
- Accents, closed vocabulary: primary sky blue #46a5e0 for chrome only
  (dealer marker, selection/inspect rings, primary fills); decisive coral
  red #d63c2e quarantined to Ron/Riichi/Tsumo buttons, riichi markers, the
  riichi stick's dot, and the call-prompt latest-discard ring. Red never a
  large surface; NO glow halos — rings are flat 2px.
- Buttons: true pills (radius = half height), flat fills, no borders or
  gradients.
- Type: Nunito (variable, SIL OFL 1.1), self-hosted; digits tabular by
  construction (600/1000 upm) + tabular-nums set. All text contrasts
  >= 4.5:1, QC-verified. Renderings:
  mahjong-prep/renderings/table-theme-v5/ (base + prompt states).

DARK THEME ONLY (Michael, 2026-11-16, superseding the section 8
"dark default + light toggle" line): the derived light theme is removed
from the client — no theme toggle anywhere; theme v5's dark tokens are
the single theme. "For now" — a light theme may return later only as a
separately approved design, never as a derivation.

ADS / CLAIMS RULING (Michael, 2026-11-16): Michael expects to show ads
at first when the game launches publicly, so the product must not claim
"no ads" or "no gacha" anywhere. Those claims are removed from the home
tagline, About page, README, package description, page meta, and the
GitHub repo description. Free forever and no-accounts stand. This
supersedes the founding "no ads, no gacha" copy line in section 1/2
wherever it appears as a public claim.
