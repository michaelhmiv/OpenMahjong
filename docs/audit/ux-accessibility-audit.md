# UX and accessibility audit

## Baseline and evidence

Audited `main` at `989927ba57dde781a4a856eaa2bbb6a1d01afb4b` and the
production application at <https://openmahjong.app> on November 16, 2026.
The production viewport run began at 3:07 p.m. America/New_York
(`2026-11-16T20:07:44Z`). Source references below refer to that immutable
baseline; subsequent implementation can move the line numbers.

This is an observed browser audit, not a WCAG conformance certification.
Headless system Chromium drove the actual built UI with Playwright; axe
checked active screens. Six independent browser contexts exercised:

| Viewport | Home | Learn index | TU-1 interactive drill | Observed geometry |
| --- | --- | --- | --- | --- |
| 360 × 800 | Captured | Captured | Captured | No primary control outside viewport |
| 390 × 844 | Captured | Captured | Captured | No primary control outside viewport |
| 412 × 915 | Captured | Captured | Captured | No primary control outside viewport |
| 768 × 1024 | Captured | Captured | Captured | Portrait stage centered; no primary clipping |
| 1024 × 768 | Captured | Captured | Captured | Portrait stage centered; reduced effective target size |
| 1440 × 900 | Captured | Captured | Captured | Portrait stage centered; no primary clipping |

Additional 390 × 844 checks exercised Settings, Rules, About, Privacy,
guest History/Stats, a real engine-backed guest game, Large Tiles,
Inspect hand, pause, reload/resume, browser Back, and first-visit offline
reload. No production account was created, changed, or deleted.

The managed environment's HTTPS proxy certificate was not in Chromium's
trust store. `curl -I https://openmahjong.app` verified HTTPS and returned
200 normally; browser inspection used an explicitly recorded certificate
bypass. This is an environment limitation, not evidence of a production
certificate defect. The committed smoke runner defaults to normal TLS.

Temporary raw evidence was saved under `/workspace/work/evidence/` during
this audit: `production-audit.json`, `baseline-audit.json`, axe JSON,
`production-{home,learn,drill}-WIDTHxHEIGHT.png`, and focused Settings,
table, Focus Frame, pause, wrong-answer, and offline screenshots. These
paths describe the execution evidence, not durable repository artifacts.
The committed `scripts/browser-smoke.mjs` regenerates reviewable JSON and
PNG evidence; CI should retain its output as an artifact.

## Verified existing strengths

- Guest landing offers Play and Learn without an account; the real
  engine-backed table starts successfully.
- TU-1 rejects a wrong tile, explains the mismatch, and remains on
  Step 3 of 8. Selecting the five bamboo tiles advances to Step 4.
- Leaving the lesson, reloading, and reopening TU-1 restores Step 4;
  the index shows “In progress.”
- A guest game survives reload and resumes to the table. This check
  covered an early hand; it does not prove every kan/late-match restore.
- Large Tiles produces two hand rows. Inspect hand displays larger tiles
  and fits the 390 × 844 viewport in the captured early-hand state.
- The approved green/gold visual direction and self-hosted fonts are
  present. No primary control overflow was found in the six captured
  home/drill states. A scrollable Learn index is expected, not overflow.
- The production viewport run reported no uncaught browser exceptions.
  Local baseline account probes produced expected CORS console errors
  because localhost is not the authorized production origin; those are
  not classified as a production availability defect.

## Findings

### UX-001 — Core tile interactions cannot be operated by keyboard

**Area:** Lessons, player hand, hand inspection. **Severity:** P1.
**Impact:** A keyboard or switch user cannot complete the introductory
identification drill or make normal discards. **Complexity:** Medium.

**Expected:** Each actionable tile is named, keyboard focusable, operable
with Enter/Space, and exposes selection state. Focus remains predictable
after the UI rerenders. Visible tile illustrations remain unchanged.

**Observed:** The TU-1 grid contains twelve clickable `span.cell`
elements and zero focusable drill elements. Tab focuses the Menu button
rather than a tile. The main hand and inspection grid use the same
click-only pattern. Axe does not detect this missing custom-control
semantics; a clean drill axe result is insufficient evidence of access.

**Evidence:** `packages/web/src/app.ts:1627`–`1645` (hand wrapper and click),
`1935`–`1945` (inspection cells), `2243`–`2248` (drill cells).

**Reproduce:** Learn → The tiles → Continue twice → press Tab and attempt
to select a bamboo tile using only the keyboard. Repeat in Play and
Inspect hand.

**Root cause:** Tile visuals are reused as pointer targets without a
shared semantic interaction layer. `renderTable()` rebuilds its subtree,
so adding `tabindex` alone would still lose focus after every selection.

**Correction:** Introduce a shared tile-control helper that supplies
button semantics, readable tile names, Enter/Space activation, selection
state, stable focus identity, and focus restoration after rerender.
Keep decorative/opponent tile backs out of the tab order.

**Acceptance:** Complete all TU-1 drills by keyboard; select and discard a
legal tile by keyboard; inspect/select/close by keyboard; names include
suit/rank or wind/dragon and red-five identity. No duplicate activation
from Space, and no focus loss to the document body after selection.

**Proposed PR:** Accessibility and navigation reliability.

### UX-002 — Guided and Settings switches lack accessible names

**Area:** Home and Settings. **Severity:** P1. **Impact:** Screen-reader
users cannot identify which preference a checkbox controls.
**Complexity:** Small.

**Expected:** Each checkbox's accessible name matches its visible setting
label; explanatory text can be associated as its description.

**Observed:** Axe reports one critical `label` violation on Home and four
on Settings. A wrapping label contains only the invisible input and
visual switch track; its visible setting label is a separate sibling.

**Evidence:** `packages/web/src/app.ts:470`–`482` and `909`–`916`.

**Reproduce:** Open Home or Settings; inspect checkbox accessible names or
run axe on the active screen.

**Root cause:** The presentation row and switch generator do not share a
label identifier/name.

**Correction:** Bind visible labels with `aria-labelledby` or supply
matching `aria-label` values through the toggle helper.

**Acceptance:** Named checkboxes for Guided mode, Sound, Reduced motion,
and Large tiles; no serious/critical axe violations on these screens;
Space toggles the intended preference and the value survives reload.

**Proposed PR:** Accessibility and navigation reliability.

### UX-003 — Pause and Focus Frames lack dialog focus behavior

**Area:** Pause, lesson menu, Focus Frames, result breakdown overlays.
**Severity:** P1. **Impact:** Focus travels behind a visible modal;
screen-reader users receive no dialog context. **Complexity:** Medium.

**Expected:** Opening a modal moves focus inside, marks its accessible
name and modal role, contains Tab/Shift+Tab, supports Escape when
cancellation is allowed, and restores focus on close.

**Observed:** Open pause → press Tab: focus moves to a background
`.iconbtn`. The browser finds zero elements with role `dialog`. Frame
wrappers also lack dialog semantics. The captured hand sheet's Close
button works with a pointer, but this does not establish keyboard access.

**Evidence:** `packages/web/src/app.ts:1800`–`1809` (`frameShell`),
`1908`–`1935` (hand sheet), `2148`–`2175` (lesson menu),
`2306`–`2347` (pause), `2350`–`2375` (breakdown).

**Reproduce:** Play → Menu → Tab repeatedly. Repeat Inspect hand and
Shift+Tab. Press Escape and check whether the frame closes.

**Root cause:** Overlays are appended visual containers with click
handlers, without a shared focus lifecycle.

**Correction:** Shared dialog behavior covering all modal types; preserve
required progression on a non-dismissable hand-end breakdown. Prevent
Escape from bypassing required game settlement.

**Acceptance:** Automated browser focus containment and restoration for
pause/hand inspection; test lesson menu and breakdown progression;
underlying table controls are not reachable until the modal closes.

**Proposed PR:** Accessibility and navigation reliability.

### UX-004 — Browser Back leaves the application from Learn

**Area:** Screen navigation. **Severity:** P2. **Impact:** Mobile users
lose their place visually or leave the site when using the browser's
native Back gesture. **Complexity:** Medium.

**Expected:** Going Home → Learn → Back returns to Home. An open lesson,
Focus Frame, or pause menu follows a documented, non-destructive Back
policy. Reload does not discard saved learning/game progress.

**Observed:** Home → Learn keeps the same URL and creates no history
entry. Browser Back from a fresh visit returns to `about:blank` in the
audit context. The in-app Back control works but does not repair native
navigation.

**Evidence:** `packages/web/src/app.ts:382`–`389` (`showScreen`) and
`807`–`821` (`textScreen`). Browser evidence includes unchanged before/
after Learn URLs and `browserBack.result = about:blank` on production
and the local baseline.

**Root cause:** Screen state is held only in CSS classes; there is no
`pushState`/`popstate` or equivalent navigation contract.

**Correction:** Introduce minimal screen-history ownership, route native
Back through safe screen transitions, and preserve in-progress records.
Avoid reconstructing an entire routing framework for these screens.

**Acceptance:** Browser Back returns Learn/Settings/Rules to the previous
screen, leaves lessons with saved progress, and does not accidentally
start a second game. Back/Forward/reload behavior has browser coverage.

**Proposed PR:** Accessibility and navigation reliability.

### UX-005 — First-visit offline reload can produce a blank application

**Area:** PWA reliability. **Severity:** P1. **Impact:** The documented
“play offline after first load” promise fails when bundle assets are not
in the browser HTTP cache. **Complexity:** Medium.

**Expected:** Once the installed worker controls the page, the app shell,
its exact built JavaScript/CSS, fonts, and static privacy page can load
without network access. Upgrade handling keeps matching shell/assets.

**Observed:** A fresh production context waited for an activated,
controlling service worker. CacheStorage contained only `/`,
`index.html`, `manifest.webmanifest`, and `icon.svg`. Going offline and
reloading produced empty body text and no `#screen-home`. The local
baseline's warm HTTP-cache reload happened to work; clearing Chromium's
HTTP cache while preserving service-worker CacheStorage reproduced
failed JS/CSS requests and a blank app there as well.

**Evidence:** `packages/web/src/main.ts:7`–`17` (registration after load),
`packages/web/public/sw.js:5`–`15` (four-item precache),
`packages/web/vite.config.ts:32`–`35` (hashed production bundles).

**Reproduce:** New browser profile → visit built app once → wait for
`navigator.serviceWorker.controller` → clear only HTTP cache, preserving
CacheStorage → go offline → reload. A repeat visit before going offline
can mask the bug by warming asset caches.

**Root cause:** The service worker begins observing requests after the
initial bundle/font fetches and never explicitly precaches those build
outputs. Its manually fixed cache name does not identify a build.

**Correction:** Generate a build-specific precache manifest from actual
output files; install the complete matching shell atomically; retain
only the application's own obsolete caches. Do not cache authenticated
API responses or arbitrary application-origin GETs as static assets.

**Acceptance:** Fresh visit + cold HTTP-cache offline reload renders Home,
starts a real game, displays fonts/tiles, and opens the static privacy
page. A subsequent version upgrades cleanly. Failed precache installation
does not replace a functioning prior worker. Browser smoke must clear
HTTP cache so this failure cannot be hidden by opportunistic caching.

**Proposed PR:** Built-asset offline reliability.

### UX-006 — Screen scaling reduces effective tap and text sizes

**Area:** Responsive accessibility. **Severity:** P2. **Impact:** Some
controls are harder to operate on small phones and short landscape
screens; small text becomes smaller than the established 11px floor.
**Complexity:** Medium; approved rendering needed for geometry changes.

**Expected:** The design's 44px target and 11px type floors apply at the
physical viewport size, apart from the explicitly approved 40px home
segment exception.

**Observed:** At 360px width, a nominal 44px navigation control becomes
40.62px after stage scaling; the 11px footer becomes approximately
10.15px. Home switches are only 32px high even at 390px; at 360px they
measure 29.54px. At 1024 × 768, navigation buttons are approximately
40.04px high. No primary clipping was observed in these states.

**Evidence:** `packages/web/src/app.ts:356`–`379` (`fit()` scales the whole
stage); `packages/web/src/styles.css:67`, `81`–`84`, `483`–`484`.
The only target-size exception recorded in `docs/design-rules.md` §5 is
the home segment, not switches or the globally scaled navigation.

**Reproduce:** Set viewport 360 × 800 or 1024 × 768; measure transformed
`getBoundingClientRect()` values rather than raw CSS dimensions.

**Root cause:** A single visual scale is applied to geometry, text, and
hit targets; switch visuals and input hit area have the same short box.

**Correction:** Prepare an approved rendering for accessible physical hit
areas and minimum text at narrow/short viewports. Invisible expanded hit
areas may preserve the approved appearance, but overlap must be measured.

**Acceptance:** Record physical dimensions at all six viewports, including
switches and adjacent tile targets; no overlapping hit areas or new
clipping; document any explicitly approved exception.

**Proposed PR:** Responsive target-size follow-up after rendering review.

### UX-007 — Round button's accessible name excludes visible text

**Area:** Table and Focus Frames. **Severity:** P2. **Impact:** Speech
input users cannot invoke the displayed round label by its visible name.
**Complexity:** Small.

**Expected:** The accessible name includes visible round/hand text and
can additionally describe the action.

**Observed:** Axe reports serious `label-content-name-mismatch` on
`button.center`: its visible round is “East 1,” while its accessible name
is only “Round details.” The same background control is present while a
hand Focus Frame is open.

**Evidence:** `packages/web/src/app.ts:1563`–`1570`.

**Reproduce:** Start Play; run axe or compare the button's rendered text
and accessible name.

**Root cause:** An icon-style ARIA label overrides meaningful text.

**Correction:** Use the visible content as the name or incorporate it in
a fuller action name. Avoid duplicating every decorative tile glyph.

**Acceptance:** Voice/text name contains the visible round and axe no
longer reports the mismatch on table/inspection screens.

**Proposed PR:** Accessibility and navigation reliability.

### UX-008 — Reduced-motion setting does not cover all decoration

**Area:** Focus Frames and changed-tile pulses. **Severity:** P2.
**Impact:** A player opting out of motion still receives some animations.
**Complexity:** Small.

**Expected:** In-app reduced motion and OS reduced motion consistently
suppress nonessential movement/flashes.

**Observed/code evidence:** The setting changes event playback/FLIP, but
frame/sheet CSS animations are controlled only by an OS media query.
The `.pulse` animation is not included in that baseline query, and
`closeFrame()` adds it without checking reduced motion. Browser viewport
runs used OS reduced motion and therefore do not prove the in-app-only
setting's full behavior.

**Evidence:** `packages/web/src/app.ts:330`–`332`, `1215`,
`1781`–`1790`; `packages/web/src/styles.css:352`, `400`, `509`–`514`.

**Reproduce:** OS motion normal → enable Reduced motion in Settings →
open Inspect hand → inspect computed animation name/duration. Check
changed-tile pulse after a frame update with OS reduction enabled.

**Root cause:** JavaScript's combined preference and CSS's OS-only
preference are separate sources of truth.

**Correction:** Apply the combined preference as a root state class and
cover frame, sheet, pulse, and tile transitions. Respect live OS changes.

**Acceptance:** Computed nonessential animation/transition durations are
zero with either preference enabled; normal mode remains unchanged;
no geometry or theme changes.

**Proposed PR:** Accessibility and navigation reliability.

### UX-009 — Rules and Privacy scroll regions cannot receive keyboard focus

**Area:** Long informational screens. **Severity:** P1. **Impact:** A
keyboard user can reach Back but cannot reliably scroll through all rules
or privacy information while the document body itself cannot scroll.
**Complexity:** Small.

**Expected:** The page content region is reachable and scrollable by
keyboard, with its heading identifying the region.

**Observed:** Production axe reports serious `scrollable-region-focusable`
on `div.page` in Rules and in-app Privacy. The region has no focusable
content or `tabindex`; `body` has `overflow:hidden`.

**Evidence:** `packages/web/src/app.ts:803`–`806` (`buildPage`),
`packages/web/src/styles.css:54` and `468`.

**Reproduce:** Home → Rules → navigate with Tab/arrow/PageDown without
using a pointer. Repeat Privacy; run axe on the active screen.

**Root cause:** Content panes are independently scrollable but receive no
keyboard or semantic region ownership.

**Correction:** Make the content pane focusable, associate its heading,
and preserve its scroll position where useful. Retain the existing layout.

**Acceptance:** Keyboard can reach and scroll each long content region;
no serious/critical axe findings on Rules/Privacy; Back remains reachable.

**Proposed PR:** Accessibility and navigation reliability.

### UX-010 — Small colored text falls below the documented contrast floor

**Area:** About, in-progress lessons, final standings. **Severity:** P2.
**Impact:** Links, learning status, and final point changes are less
readable than the minimum required by the design authority.
**Complexity:** Small.

**Expected:** Normal text/background pairings meet at least 4.5:1.

**Observed:** Production axe reports serious `color-contrast` on the
GitHub link: foreground `#5e9273`, background `#152620`, 14px normal weight,
measured ratio **4.38:1**. Broader local patched-build testing then exposed
two more pre-existing uses of the same state colors: “In progress” in
Learn measures **3.64:1** on the selected panel, and completed standings
point values measure **4.38:1** for green positive text and **3.41:1** for
red negative text on the ground. These latter measurements are local
browser evidence from the first patched pass, not production observations.
The baseline CSS defines all three pairings. Approved main text/dim
colors have stronger contrast on these backgrounds.

**Evidence:** `packages/web/src/styles.css:36` (`--state`) and `475`
(`.page a`), `503`–`504` (final point text), `580` (in-progress status),
About link in `packages/web/src/app.ts:865`–`870`. Raw follow-up evidence:
`patched-final/axe-learn-in-progress.json` and `axe-results.json`.

**Reproduce:** Home → About → run axe, or independently measure the link's
computed foreground/background colors. Start a lesson, leave it incomplete,
and inspect its Learn row; finish a game and inspect signed point values.

**Root cause:** A state-indicator color is reused for small link text
without verifying the actual text/background pairing.

**Correction:** Use existing approved text colors for these text roles,
preserving link recognition with underlining and point direction with its
explicit plus/minus sign. Keep state strokes distinct from body text.
Avoid inventing a new palette token.

**Acceptance:** All three screens meet 4.5:1 for normal-sized text; links
remain recognizable/focusable and point direction remains explicit; no
serious/critical axe violations on About, in-progress Learn, or results.

**Proposed PR:** Accessibility and navigation reliability.

### UX-011 — The legacy history bridge counts completed games twice

**Area:** Guest History, Stats, account import. **Severity:** P1.
**Impact:** A single completed match appears as two games in local history
and aggregate statistics; legacy records also cannot satisfy the server's
UUID requirement when imported. **Complexity:** Medium.

**Expected:** A match contributes once to History/Stats. Historical
summary-only records remain accessible, mirrored old/new records merge
without loss, and legacy imports use stable valid identifiers.

**Code evidence:** On the immutable baseline, completion writes the same
match to `appendHistory()` and `appendRecord()`. `localGameRecords()` then
concatenates the converted legacy summaries and full records without
deduplication. Converted IDs use `legacy-INDEX-DATE`, while server upload
validation requires UUIDs. The initial browser smoke required only a
nonempty History list and therefore did not detect this data invariant;
the follow-up full-match assertion explicitly checks the count.

**Evidence:** `packages/web/src/app.ts:717`–`728` (legacy conversion and
concatenation), `1169`–`1189` (dual writes), and
`packages/server/src/validate.ts` (UUID validation).

**Reproduce:** On the baseline with empty guest storage, finish one match
and open Settings → History/Stats. Trace both completion writes and the
unfiltered merged collection. For import, submit a converted legacy ID
to the validated upload boundary; it does not match the UUID format.

**Root cause:** A compatibility store continued receiving new writes
after full records were introduced, and the read/import bridge treated
both representations as independent authoritative games.

**Correction:** Write new completions only to full records. Merge old
mirrors conservatively by their completion context while retaining
unmatched legacy-only records; give the latter deterministic UUIDs for
idempotent import. Preserve old browser data rather than deleting it.

**Acceptance:** One newly completed match produces exactly one History
row and Games-played value of one. Reopening its record preserves the
result. Tests cover historical mirror matching, nearby distinct matches,
legacy-only retention, stable import IDs, and repeated reads/imports.

**Proposed PR:** Browser persistence, account contract, and reliability.

## Important capability gaps, not regressions

The History row currently reconstructs a completed game directly to final
standings (`packages/web/src/app.ts:1042`–`1059` on the baseline). It does
not provide decision-level navigation, player-perspective alternatives,
key decisions, or save-to-practice. There is no dedicated Practice screen
or personal learning dashboard. The beginner → guided game → analysis →
targeted practice journey in the master brief therefore cannot yet be
passed as a whole. See the architecture/education audits and roadmap;
these capabilities must not be described as delivered by fixing the
existing History rows.

`docs/design-rules.md` §§6 and 10 require an approved rendering for new
screens and visible design changes. The master brief authorizes building
these features but also preserves established design decisions. A
concrete rendering review is the next product gate for the Practice,
decision-review, and learning-dashboard surfaces; nonvisual models,
correctness fixes, and browser testing can proceed independently.

## Checks that remain unverified

- Real Google OAuth, cross-device settings/progress synchronization,
  account import/deletion, and session-expiry UX. No personal account was
  used and no production data mutation was authorized by this audit.
- Native PWA installation prompts, home-screen launch, OS storage eviction,
  and a physical mobile device's accessibility services.
- A complete production match's hand-end/score breakdown, every call
  prompt, late-game pond growth, all lesson scenes, and every Focus Frame
  state at all six viewports. Screenshots of an early table do not verify
  those states. The optional full-game smoke path provides additional
  local evidence when executed; it is not a substitute for all edge cases.
- VoiceOver/TalkBack/NVDA behavior and 200–400% browser/text zoom. Headless
  Chromium keyboard/axe checks are a useful floor, not equivalent tests.
- Pixel-class 60fps, battery behavior, soft-keyboard/visual-viewport
  interaction, or weak-device long-game latency. No benchmark is inferred
  from desktop headless responsiveness.

## Reproducible verification

Build the client and serve the built output, not Vite's development
modules. Install the repository's browser dev dependencies and provide a
Chromium executable; then run:

```sh
npm run build --workspace @openmahjong/web
# In another terminal, serve packages/web/dist at http://127.0.0.1:4173.
node scripts/browser-smoke.mjs http://127.0.0.1:4173 work/browser-smoke
# Optional slower match/history check:
BROWSER_FULL_GAME=1 node scripts/browser-smoke.mjs http://127.0.0.1:4173 work/browser-smoke-full
```

Set `BROWSER_EXECUTABLE` if Chromium is elsewhere. Container environments
that cannot run Chromium's sandbox can explicitly set
`BROWSER_NO_SANDBOX=1`. The runner records whether a TLS bypass or live
account API was requested; neither is enabled by default. Its default
guest-auth fixture prevents a client smoke test from depending on a
production account. It checks real tile/game interactions through the UI
and writes a machine-readable report, screenshots, and full axe output.

Baseline failures are intentionally findings, not tests to suppress.
Patched-build results should be appended with exact commands and observed
counts after the fixes are implemented.

## Patched-build verification

The corrected built client was served locally at `http://127.0.0.1:4175`
and verified on November 16, 2026. The final run began at 3:54 p.m.
America/New_York (`2026-11-16T20:54:39.413Z`). The exact command, run from
the repository root, was:

```sh
BROWSER_FULL_GAME=1 BROWSER_NO_SANDBOX=1 node scripts/browser-smoke.mjs \
  http://127.0.0.1:4175 /workspace/work/evidence/final
```

**Result: 27 of 27 checks passed; process exit 0.** Chromium
`156.0.8078.79` used normal TLS handling and the runner's explicit guest
API fixture. This was a local built-client test; it did not exercise real
Google sign-in or mutate production accounts. The container's Chromium
sandbox exception was explicit in the command.

The run generated screenshots of Home, Learn, the TU-1 drill, the real
table, and the hand Focus Frame at all six requested viewport sizes.
Measured primary controls stayed within the viewport. An independent
reviewer additionally inspected actual phone, desktop, results, and
corrective-feedback captures and found no new clipping or overlap in
those images. Physical target/text sizes in UX-006 remain outstanding.

Nine actual screens/states passed the serious/critical axe gate: Home,
Rules, About, Privacy, in-progress Learn, Settings, Table, a real Ron
breakdown, and completed standings. The runner also verified actual
keyboard PageDown scrolling on Rules/Privacy, Enter/Space drill answers,
hand selection/discard with retained focus, hand/pause dialog containment
and focus restoration, lesson/game reload and resume, native Back after
fresh navigation, and in-app reduced motion with OS reduction disabled.
The normal phone walkthroughs separately used OS reduced motion.

The complete East-match check asserted that its initial saved envelope
was **v2, engine revision 2, AI revision 2, `openmahjong-riichi@1`** before
resuming the deterministic `browser-smoke-east-v2` seed. It completed 91
UI actions, including 14 passes, four Next-hand transitions, and Final
results. Guest History contained exactly **one** row, reopened the record
with identical standings, and guest Stats showed **one game played**.
The first captured hand-end was a real Ron showing Haku 1 han + Dora 2
han, 3 han / 30 fu, and a 3,900-point payment. This verifies a real
breakdown path; it does not independently establish every scoring case.

The offline check installed cache `openmahjong-5adceb8803c33d25`, whose
nine URLs covered the matching shell, JavaScript/CSS, both fonts,
manifest, icon, and static privacy document. After clearing Chromium's
HTTP cache while retaining CacheStorage and forcing offline mode, Home
rendered, a real game started, both fonts loaded, and `/privacy` opened
the static policy. Zero uncaught browser exceptions or online console
errors were recorded. One resource-failure console message occurred
during the intentionally offline phase; this is retained in the report.

Raw evidence is in `final/report.json`, nine `axe-*.json` files, and 44 PNG
captures under the audit's temporary evidence directory.
The first patched pass is preserved separately in `patched-final/`: it
passed 21/24 checks and exposed the stale history state plus the Learn
and standings contrast defects. Those findings were corrected before
the corrected reruns. An intermediate `patched-verified/` pass also
passed 27/27; after the legacy-history bridge was repaired, this final
run added explicit one-match History/Stats assertions and reverified the
whole suite against the rebuilt client. A warm-cache-only offline check
was not substituted.

| Finding | Verified correction and remaining limit |
| --- | --- |
| UX-001 | Drill and normal hand work by keyboard; focus survives selection. An exhaustive keyboard pass through every lesson remains unverified. |
| UX-002 | Home/Settings checkboxes are named; their screens pass axe. |
| UX-003 | Hand/pause focus containment, Escape/close, and restoration pass; real hand-end continuation works. The complete modal/state matrix is still broader than this smoke. |
| UX-004 | Learn → native Back returns Home after navigation/reload. All lesson/table Back/Forward permutations are not claimed. |
| UX-005 | Cold-cache first-visit offline play, fonts, and privacy pass. Failed-update retention and multi-version upgrade behavior need a dedicated matrix. |
| UX-006 | Open: approved physical target/type-size correction is still needed. |
| UX-007 | Real table passes the visible-name axe check. Voice-input software was not used. |
| UX-008 | In-app-only hand-sheet motion is suppressed; OS-reduced walkthroughs pass. Physical-device motion/performance testing remains open. |
| UX-009 | Both long content regions accept focus and scroll by PageDown. |
| UX-010 | About, in-progress Learn, and final signed points pass axe after using existing approved text colors. |
| UX-011 | A completed fresh match contributes exactly one History row and one Stats game; reopening preserves standings. Historical merge/import cases require the separate persistence unit tests; real account import remains unverified here. |

These checks protect the repaired existing experience. They do not claim
that the master brief's future decision-review, dedicated Practice,
personal dashboard, multiplayer, or additional-variant screens exist.
