# Open Mahjong — Design Rules

Implementation exception, 2026-11-17: the owner's approved #39/#31/#32/#33/#34
implementation request explicitly supersedes intermediate brief/rendering approval
stops for this program. Record decisions, retain these visual laws, and capture
completed browser renderings. It excludes every photo-input feature. This
exception does not authorize deployment, merging or issue comments. See
[implementation program](implementation-program.md).

Version 7 (learning screens; v6 green retained), ruled by Michael on 2026-11-16. This document is the
design authority for the web app. If code and this document disagree,
this document wins until it is amended.

How this document changes: a design change ships only as an approved
rendering (independent QC pass + Michael's approval), and the PR that
implements it amends this document in the same change. No silent drift:
an unrecorded token, font, or layout value in code is a defect.

## 1. Theme tokens (v6 — dark felt green + gold)

| Role | Value | Notes |
|---|---|---|
| Ground / felt | `#152620` | App background everywhere |
| Ground glow centre | `#1b3029` | Radial behind the home wordmark zone only; mid stop `#182b23` |
| Page surround | `#0d1812` | Outside the stage on wide screens |
| Panel | `#1f352b` | Cards, sheets, center panel; borderless, radius 20px |
| Panel-hi | `#2e4a3a` | Lifted green: primary pill fills and raised panel surfaces — NOT segment selection |
| Segment selected | `#c2d1be` | The §15 face tint, on-tint ink `#1c2a20` (ruled 2026-11-19: §15 governs selected states; this corrects the earlier naming of panel-hi here — the app already rendered the tint) |
| Line | `#3a5a47` | Hairlines where unavoidable |
| Ink | `#f3efe3` | Primary text (warm cream) |
| Dim | `#a9bda9` | Secondary text (sage-cream) |
| Gold | `#d9b45c` | See §2 — quarantined |
| On-gold text | `#1c2a20` | Text on gold fills (e.g. Play label) |
| Calculator Confirm disabled text | `#4d4630` | SINGLE USE ONLY: disabled text on the gold calculator Confirm in `medium.css` (§16). The shipped `--dim` measured 1.01:1 on gold; this muted dark olive measures 4.76:1 (calc-v7 QC fix). Not a general text colour; no other surface may use it |
| Decisive | `#d63c2e` | Ron / Riichi / Tsumo, riichi markers, latest-discard ring. Flat 2px ring, never a glow |
| Tile face | `#f6f1e4` | Unchanged since v5 |
| Tile back | `#33503f` | Edge `#223528` |

Retired: plum ground `#231f2e`, plum panel `#2f2a3d`, plum tile backs
`#554a6b`, and the sky-blue accent `#46a5e0` must not appear anywhere
in the web package. There is no light theme.

## 2. Gold discipline

Gold is flat. Never a gradient, never a glow, never a shadow colour.

Gold may appear ONLY on:
- the wordmark ("OPEN MAHJONG")
- the Play button fill (label in on-gold `#1c2a20`)
- progress fill on Play-tab info cards (the Continue-card context,
  as rendered in app-shell-v1 02). The Learn tab's progress bars —
  per-section and overall — are STATE GREEN, not gold (clarified
  2026-11-16: the shipped Learn bar was always state green; the
  gold progress role refers to the Play/Continue infocard context)
- the "Start ›" / "Continue ›" card CTAs
- the signed-in identity avatar fill
- the table's dealer-wind label ("East · You")
- a static content page's single app-entry button fill (the Play
  role extended to document pages; §18 — one per page, label in
  on-gold `#1c2a20`)

Gold must NEVER appear on: body text, stats, scores, labels, pills,
history rows, settings rows, or state styles. State styles — selection
rings, picked/selected tile outlines, turn rings, focus-visible
outlines, switch-on fills, positive/negative point deltas — use green
or cream accents, not gold. (This rule exists because a shared
`--accent` variable silently spread gold to dormant states in the
v6 mockups; QC caught it. Do not reintroduce a single accent variable
that carries gold into states.)

The medium surface system (§15) adds one text-grade derivative of
the chun sprite red for small dealer text on tint surfaces:
#9e2b25 (4.66:1 on the face tint, 5.40:1 on the sheet tint). The
sprite red #bf3b34 itself is reserved for tile glyphs and for
graphic marks (the dealer ring), never for text below 18px on a
tint surface.

## 3. Type system

Two self-hosted variable fonts (SIL OFL 1.1), in `public/fonts/`:
Fraunces and Figtree. No other UI typeface. No webfont downloads at
runtime.

Two typefaces, two roles (Material's brand/plain split).
**Fraunces is the brand face**: the wordmark and screen titles —
the title at the top of every screen, tab roots included — at
their existing sizes. **Figtree is the plain face**: section
labels, buttons, body, and all tabular figures (with
`font-variant-numeric: tabular-nums` where figures align).
In-screen section heads already set in Fraunces keep it. No other
element takes Fraunces; a design that wants it elsewhere amends
this section first.

- Tile kanji use the CJK stack (`"Noto Sans CJK SC", "Noto Sans CJK
  JP", sans-serif`) — that is a glyph font, not a UI typeface.
- Type floor: 11px. Nothing renders text below 11px.

## 4. Tiles

- Faces: traditional, clean/flat, high contrast, on `#f6f1e4`.
- Every rendered tile carries the physical treatment: bottom edge +
  soft drop shadow. Tiles are objects, never flat stickers.
- The Play tab's fan is a real, complete winning hand (2m 3m 4m ·
  3p 4p red-5p · 6s 7s 8s · 9s 9s · chun chun chun), grouped as a hand
  sorts, decorative only.
- No state is carried by colour alone.

## 5. Layout laws

- Portrait-first; 390×844 is the floor case, and the stage scales to
  the device (width-locked fluid fit — no letterbox bands).
- Controls: 44px minimum tap target. Hand tiles are ~25px visual with
  expanded invisible hit areas. The home segment buttons are 40px as
  approved in the renderings (recorded exception).
- Table geometry is the approved v4: side ponds condense at their own
  13th discard (22×31, 9 rows × 2 cols); base state never condenses.
- Focus Frames are the zoom system (player frame, center frame, hand
  focus sheet at ~48px in two rows of 7). No free pinch-zoom camera.
  A call window auto-dismisses any open frame.
- Large Tiles mode: hand 28×39 in two rows of 7, ponds 22×31 with no
  condense step; Focus Frames are absolute-sized (no double zoom).
- Selected-tile magnification lives in a fixed header preview slot,
  never in-grid.

## 6. Screens

The screen inventory is fixed by the brief (§7 + slice-2 additions),
as restructured by the app shell (section 13): the four tab roots —
Play (the landing), Learn (index + lesson runner), Games (stats
header + history list; the former History and Stats screens merged),
More (account + settings + about links; the former Settings screen
re-homed) — and the drilled-in screens: Table, Hand-end breakdown,
Game-end results, Rules, About, Privacy, Language, Review, Practice.
A new screen requires a brief amendment and an approved rendering.

## 7. Copy law

Product copy is purely informational text. No slogans, no flourish,
no descriptor lines. The wordmark stands alone in the app UI: its
former companion line ("Free forever. Open source mahjong.") was
removed by ruling on 2026-11-16 — not everyone knows what open
source means, and the line was not information. Factual
free/open-source mentions in About text, page metadata, and
noscript content are not the wordmark surface and are unaffected.
Nothing is added line-by-line; any copy change is swept across the
whole surface at once.

Claims discipline: the app is free and open source. Do not claim
"no ads" or "no gacha" — ads may be shown at first at public launch.

## 8. Motion and sound

- Animation is state-to-state from the engine event log, 60fps on a
  Pixel-class device, tap-to-skip, reduced-motion respected.
- Sound is quiet tile clicks only, on by default, one-tap mute.
  No music, no voices.
- Guided-mode hint is a floating overlay anchored above the player's
  hand; it never participates in table layout, and auto-hides while a
  call prompt or Focus Frame is open.

## 9. Contrast

Every text/background pairing ≥ 4.5:1 (WCAG). Measured v6 pairs:
cream on ground 13.73, cream on panel 11.40, sage on ground 7.92,
sage on panel 6.58, gold wordmark on ground 8.00, gold CTA on panel
6.64, on-gold text on gold 7.59, white on decisive 4.62. A new pairing
is measured before it ships.

## 10. Process

- No UI change is built before its rendering is QC-passed and
  approved by Michael. Backend/infra with no display surface is
  exempt.
- QC measures the actual files (dimensions, fonts by computed style,
  copy diff, colour census, contrast, geometry). A builder's
  self-report is never the evidence.
- This document is amended in the same PR as any approved design
  change.


## 11. Approved learning layouts (v7)

Michael approved both Practice and decision Review renderings in this
implementation session on2026-11-16: “Approve both designs.” The concrete
[proposals](design/proposals/README.md), four mobile renderings and independent
[QC](design/proposals/qc-notes.md) are the approved reference for these screens.
They extend the master brief's Practice/Review scope. V6 tokens, self-hosted
fonts, gold roles, table geometry and existing screen conventions remain.

Learning screens use an unscaled native-width shell, max430px, full viewport
height, scrollable content and persistent bottom navigation. At360px and390px,
interactive controls remain at least44×44physical pixels and UI text at least
11px. This exception applies to Practice/Review; it does not silently rework
existing scaled table geometry. New screen CSS is scoped in learning.css.

The Practice exercise is real, validated content with retry/feedback and
local-first evidence. Decision Review defaults to the original player view,
labels heuristic rankings and unseen-copy assumptions, and connects to related
practice. Additional controls needed for real content, hand/decision navigation,
exercise selection and saved-reference navigation use the same approved type,
panel, spacing and control vocabulary. They must pass actual browser QC.

Green/cream state roles remain; small semantic text uses cream/dim when the
state/decisive text color would miss4.5:1. No additional gold role is introduced.

## 12. Guided highlight and inspect tile info (v7)

Approved 2026-11-16 (renderings `guided-inspect-v1`, QC-passed): the
guided hint, the coach's hand-tile highlight, the explanation sheet,
and the inspect readout.

- The guided hint overlay keeps its §8 placement (floating, anchored
  above the hand, auto-hidden while a call prompt or Focus Frame is
  open) and becomes a flex row: the recommended discard's tile face
  (22×31) beside the headline, bubble width 300px. Only the bubble
  itself is tappable (role=button, "Why this move?"); the layer
  around it never intercepts touches.
- The recommended discard in the hand carries a flat state-green
  ring — `box-shadow: 0 0 0 2px var(--bg), 0 0 0 5px var(--state)`,
  border-radius 5px — with a gentle pulse (spread 5→7.5px, 1.6s
  ease-in-out). Under reduced motion the pulse is removed and the
  ring is static. The ring marks the exact tile instance the coach
  recommends, is deliberately distinct from the player's own
  selection treatment (the 1.5× magnification), and clears when the
  decision moves on. State green only — never gold.
- Tapping the overlay opens the explanation sheet ("Guided hint"),
  a Focus Frame in the shipped sheet grammar: The goal / The move
  (tile face 28×39 beside the plain name) / Why this tile / What
  you're waiting for (one row per wait, face 24×34). Content is
  template-rendered from the coach's structured facts — plain
  beginner language, no new evaluator. No term is used before it is
  defined at first use in the same breath (a finished hand and
  "ready", dora, riichi, the indicator, the wall — per the final
  approved Rendering C copy). The sheet pauses nothing and the
  pending decision waits untouched behind it.
- The inspect readout (hand focus sheet) leads with the plain tile
  name (17px/700 cream) — never tile notation — followed by factual
  lines only when true (13px sage): red-five/dora status, strongest
  set membership (completed set over pair over loose), copies
  visible on the table (ponds and melds; never the player's hand,
  never the dora indicators), and a waits line (13px/600 cream) for
  the hand's tenpai form. All facts come from the player's own view;
  legacy (v1) replays keep the plain label rather than attributing
  current facts to historical rules.

### The guided-play package (approved 2026-11-17)

Approved 2026-11-17 (renderings `guided-play-v1`, QC-passed after a
measured verification round; the corner-index placement was amended
by the owner's ruling the same evening — indices live on inspect
surfaces only, never on the board). Four additions to the guided
family and the hand:

- **Hand grouping and labels (guided mode only).** The hand is laid
  out in group order — completed sets first, then the pair, then
  partial shapes ("Waiting"), then loose tiles — with a plain-words
  label centred under each group (Sequence / Triplet / Pair /
  Waiting / Loose, 11px Figtree 600 in dim sage). Seven pairs reads
  as one "Seven pairs" segment. The grouped row adds **zero width**:
  every tile keeps its shipped size and margin, so face extents are
  identical to the ungrouped row; tap targets are untouched and
  tiles stay individually tappable to discard. Labels belong to the
  guided overlay family: they hide while a call prompt or a Focus
  Frame is open (the order stays grouped) and return with the hint.
  Grouping is itself a sort. If the player rearranges the hand by
  shifting tiles, labels recompute on drop when the new order still
  decomposes into the same groups, and otherwise hide until the
  next draw re-sorts.
- **Discard-safety badges (guided mode, discard decision pending
  only).** A tile carries a state-green disc with a cream check at
  the face's top-right corner **only** when it is safe against
  every player currently in riichi — present in each riichi
  player's pond. Certainty only: suji, kabe, and every other
  likelihood are never badged. Badges are recomputed from the live
  ponds every turn and hide with the hint. Selecting a badged tile
  adds the reason as a full-width row in the hint bubble, naming
  each riichi player ("Safe against North — North has discarded
  this tile, so North cannot win on it"); the badge is never colour
  alone, and the tile's accessible name carries the same fact.
- **Manual tile shifting.** Press-and-hold grabs a hand tile: it
  lifts with a shadow, a dashed ghost marks the vacated slot, and
  neighbours part as it slides; release drops it into its new
  place. A grab never discards, and a call window opening cancels
  it. Auto-sort reconciles as follows: the hand sorts on the deal;
  on a draw, the drawn tile arrives apart at the right and the
  player's arrangement of the other tiles is left untouched; a
  **Sort** control appears in the hand-control row whenever the
  hand is out of its resting order and restores the full sort in
  one tap; grabbing is disabled after the player declares riichi;
  the arrangement resets each new hand.
- **Corner indices — inspect surfaces only.** Board tiles (hand,
  ponds, melds, dora indicators) never carry an index, and there
  is no setting for one. The index appears where a tile is
  magnified or inspected: the Inspect hand sheet (grid and selected
  preview), the Focus Frames (ponds, melds, the your-hand anchor,
  the dora pairs), and the guided explanation sheet. The glyph sits
  at the face's top-left corner in the face's own ink family —
  suits carry their rank digit and winds E/S/W/N in dark ink
  (#22252b); the White dragon carries W in slate (#7a8699), the
  Green dragon G (#22763d), the Red dragon R (#bf3b34); a red five
  carries its plain rank digit. Size steps up with the magnified
  face so the glyph sits clear of the art. In lessons, tapping a
  pictured tile on a teaching step reveals its index; on a check
  step the index appears only after the learner has answered (a
  found drill tile, a correctly answered question) — a check is
  never tappable into revealing its answer.

## 13. App shell and navigation

(Approved renderings app-shell-v1, ruled 2026-11-16; this section
records the shell the renderings specify.)

- The app is a bottom-nav shell with FOUR tab roots: Play, Learn,
  Games, More. The tab bar is 83px including its border; the active
  tab is a face-tint pill (§15, `#c2d1be`) with an on-tint label and
  a state-green icon. Gold never appears in the tab bar.
- NAV LAW: the tab bar exists ONLY on the four tab roots. Every
  drilled-in screen — the live game, a lesson, Review, Practice,
  results, Rules, About, Privacy — renders WITHOUT the tab bar and
  keeps its top-area navigation (the bar header with its back
  control, the game's hamburger), with swipe-back as the return
  gesture where the platform does not already provide one. Space
  is precious; the board and its tools get all of it.
- Play is the former landing, restructured: wordmark (alone, per
  section 7), the section-4 fan, the motif row in the fresh state,
  the Continue card when a game is in progress, the variant segment
  control, the length segment control, the guided row, Play, the
  Solo/Online segment (§20), the in-person calculator entry (§14),
  the record strip when the account has at least one finished game
  (at zero games it does not render, exactly as for signed-out
  visitors; the full record lives on Games), and the AdSense slot
  at the foot (section 2's geometry unchanged). The tile-back wall
  that shipped at the Play foot is REMOVED (Play cleanup v1,
  2026-11-19): the section-4 fan is the screen's one tile moment.
  Sign-in lives on More, never on Play. The variant picker is a
  `.seg` control with content-sized segments and 12px labels — the
  four shipped names (Riichi, Hong Kong Old Style, MCR, Taiwanese)
  do not fit four-across at the segment control's 14px (approved
  rendering play-picker-v1, option B, 2026-11-17).
- Play stack discipline (Play cleanup v1, approved 2026-11-19):
  one column, one rhythm. Every block in the Play stack takes the
  full column width (334px at the 390 stage); no centred pills or
  content-width strays. Blocks inside a group sit 10px apart and
  groups are separated by 18px — the groups are the game card (or
  motif row), then setup (variant, length, guided), then action
  (Play, Solo/Online, calculator). Segment margins are zeroed
  inside the stack; all spacing comes from the rhythm. No block
  flex-shrinks: the spacers alone absorb the slack (audit B1/B2 —
  the Play button must hold its full 56px in every state).
- Learn organizes lessons in collapsible per-variant sections
  (today: Riichi), each with its own progress bar (state green,
  section 2). Hong Kong, MCR, and Taiwanese sections slot into the
  same structure without restructuring the tab. Practice and the
  guided row sit above the sections.
- Games merges the former History and Stats screens: a stats
  header (placement distribution + the six shipped stat blocks,
  labels and formulas unchanged) over the finished-games list. An
  in-progress game is listed at the top with a state-green dot, an
  IN PROGRESS pill, its live state, and a Resume action; tapping
  it resumes, never reviews. Completed games keep their results →
  Review path until the game-summary restructure lands.
- More carries the account block (identity, sign out, delete),
  every settings row (sound, reduced motion, large tiles, guided
  mode), the LANGUAGE section — one row showing the current
  language, opening the drilled-in Language screen — the About
  links (Rules, About, Privacy), and the AGPL footer.
- Language (i18n-switcher-v1, approved 2026-11-19): the drilled-in
  Language screen lists shipped locales only, each row the
  language's own name over its English name, the current locale
  marked bold with a state-green check (never colour alone, never
  gold). Unshipped locales are hidden, not listed. A first visit
  whose browser language matches a shipped locale other than
  English is offered a quiet, dismissible confirmation sheet over
  Play — never a silent auto-switch; either direction remembers the
  choice. Switching languages opens that locale's URL (English at
  the root, e.g. `/ja/` for Japanese); the choice is remembered
  and wins over browser detection thereafter. Shipped locales that
  are machine translations (owner ruling Nov 19, 2026: ship now,
  community reviews later) are marked, never passed off as
  reviewed copy: " · Machine translated" on the row's English-name
  line, a footnote on the Language screen, and a line on the
  first-visit sheet.

## 14. Game details, board review and in-person tools

Finished Games rows open a separate game-detail surface with final standings,
settlement and a selectable row for every recorded hand. Rows use the winner's
wind during that hand. Board review uses a portrait-first four-seat board, an
event slider and labeled event/decision/jump controls. Concealed opponent tiles
remain backs. The coach comparison appears at the original decision, using the
existing explained heuristic analysis. Game details and review have no bottom nav.

Play includes an in-person calculator/scorekeeper entry. Its drilled-in screens
use the medium surface system (§15) in the compact calculator form (§16),
self-hosted fonts and native-width scrolling shell. The entry flow is
seat-first: win context (winner, win type, discarder) is chosen on the
scorekeeper, and the value screens show the derived context — dealer,
round, repeat counter, deposits — read-only; it is never asked. A
dedicated check-payments screen leads with every player's score change,
then the payment lines; original facts and editable corrections follow
behind "Correct the breakdown", and its Confirm is the recording gate.
Session history, correction, undo, pot disposition and settlement are
explicit controls. No account is needed for manual use. Games labels
these sessions separately from CPU statistics.

Variant table implementation retains the v4 top/side ponds, per-side13th-discard condensation and absolute-sized Focus Frames. Native44px selection targets use two rows of seven for13/14-tile hands and a third row for Taiwanese16/17-tile hands, including Large Tiles. Selected faces stay in a fixed preview slot. Guided hints float above the hand and disappear during calls, playback or an open frame. The additional row is the required five-set extension; existing Riichi table geometry remains untouched. Table settings use the same accessible sheet grammar. All four Learn sections remain collapsible and profile-specific.

## 15. The medium surface system

Locked Nov 17, 2026 (calc-v6 scorekeeper iteration; carried
across all non-table screens in calc-v7). The in-game table is
out of scope.

**Tints.** Three surfaces derived from the app's own palette —
state green #5e9273 mixed toward the tile face #f6f1e4 in sRGB:
sheet #d8decd (20/80), face #c2d1be (34/66), deep #a7c0a9
(52/48). Ink on tints is #1c2a20; secondary ink is the tile-back
#33503f. No other tint or hue may be introduced.

**Emphasis order.** One primary object per screen, one step
down, then quiet chrome: sheet → face → panel → felt. A screen's
commit verb wears the sheet tint. The settlement/payment block
wears the deep tint (a flipped tile). Selected states wear the
face tint with real tile depth (lit top edge inset, weighted
drop shadow, four-sided border language, 6px corners on small
objects, 8px on large surfaces).

**Seats are tile objects.** Anywhere seats or standings appear
off the table — scorekeeper, review, games — they are small
tiles in the face tint, never plain boxes.

**The dealer mark is the one color job.** Chun red marks the
dealer and nothing else: the wind-chip glyph, a full ring on
the dealer's seat tile, the wind label, or a "Dealer" suffix.
Red never means selection, error, or emphasis elsewhere.
Small dealer text on tints uses the text-grade red of §2.

**De-boxing.** One container per unified subject. Lists —
ledger entries, standings, game rows, hand rows, settings
rows, session rows — are unboxed: spacing, hairline dividers,
type hierarchy. An expanded row stays on the list's own
surface; it never becomes a darker island.

**Actions.** Slim and sharp: 36px visual height, 6px corners,
with an invisible expansion to a 48px tap area. Text size never
shrinks to slim a button. Navigation chrome quiets down: the
back control is a bare 30px/600 glyph with no fill on a 44×44
tap box.

**Headers (alignment).** A screen's title and its back glyph
are optically centered on one shared line; measured text-box
centers must agree within 1px. The back button is a 44×44
flex box centering the glyph at line-height 1; titles take
line-height 1.2.

**Density and type.** The shipped screens' information density
is kept. Type sizes do not change under this system; §3's
typeface roles are the only typographic change.

## 16. The compact calculator

Locked Nov 17, 2026 (owner ruling: "i like this compact form for
the entire calculator"; approved set: calc-v2 compact frames
01b/02c–07c under the §15 medium treatment, calc-v7 frames
00/15–17). Applies to every in-person calculator screen — the
scorekeeper, the hand-value entry, check payments, and the
standalone one-off calculator — for all variants. The in-game
table is out of scope.

**Scorekeeper layout.** One line of state as text (round wind +
hand number + repeat counter on the left; the riichi pot as
"N riichi sticks · declared by …" or "No riichi sticks" on the
right — status is text, not a panel, per §15 R9). Below it the
instruction "Tap a seat to record that player's win." and the
four seat tiles in table order — North, West across the top;
East, South across the bottom — then one action row (Drawn
hand / Penalty / Undo last / Settlement; Settlement wears the
deep tint), then the hand ledger as the §15 divider list.

**Seat tiles.** A seat is a tile object in the face tint (§15):
a 34×46 wind chip in the tile face with the wind glyph, the
wind label in 11px caps (the dealer's in text-grade chun, and
the dealer's chip glyph in sprite chun — the one color job),
the player name at 17px and the score at 16px tabular. Tapping
a seat selects it (state-green ring) and opens the winner panel
in place: win-type choices, then discarder chips for a discard
win; choosing the discarder (or Self-draw) advances to hand
value with that context preselected.

**Value entry.** Context is a read-only sheet panel of
label/value rows (winner, win, discarder, dealer, repeat
counter, table minimum and the riichi line where they apply).
Values are entered with a 48px stepper (− / value / +) over
quick chips at 46px: riichi han chips 1–5 with fu chips
20–60 over the full fu sequence; Hong Kong fan chips
3,4,5,6,7,8,10 in a 4-wide grid. The live hand value (riichi)
or live payment block (variants) updates on the same screen.
"Score it from the tiles" escalates to tile entry with the
context carried over. Hong Kong table settings and Taiwanese
base/unit stay editable on the value screen and are recorded
with the hand.

**Check payments.** A dedicated screen: a one-line summary,
then the score-changes panel (sheet; deltas at 22px in ink —
the sign carries direction, state green is not used for text
on the sheet), then the payment block in the deep tint with
its explanation lines (hand value, repeat-counter and deposit
accounting). Edit returns to value entry; Confirm records.
Corrections live behind "Correct the breakdown" on this
screen; editing them without applying disables Confirm, as
before. Simultaneous winners are staged from this screen and
recorded as one entry.

**Deposits stay ledger events.** A riichi deposit is recorded
from the scorekeeper ("Record riichi deposit", a slim row
under the action row) as its own ledger entry, deducted when
declared and settled with the next win — the shipped ledger
model. The compact frames show deposits as strip state only;
folding them into win entries was not adopted, as it would
rewrite recorded sessions' ledgers.

**Standalone calculator.** The one-off hand calculator (07c)
needs no session: winner and win type are wind chips on the
screen, East is the dealer, payments update live, and nothing
is recorded. Riichi only.

**Geometry.** Seat tiles ≈70px tall in a 2×2 grid with 8px
gaps; action row buttons follow §15 R6 (36px visual / 48px
tap); steppers 48px; chips 46px; seat chips and choices carry
no invisible tap expansion (their real size clears the 44px
floor). Type sizes are the shipped scale (§15 R12).

## 17. American training — Practice Card notation inks

Approved 2026-11-18 (renderings `american-card-v1`, QC-passed;
owner ruling the same day: "Ratify all three inks"). The Practice
Card's hand notation is typeset in coloured inks because on a card
a change of colour is a change of suit — colour is data there,
not decoration. Three inks sit outside the shipped palette, and
they are confined to notation glyphs on the Practice Card
surfaces (the Learn card view, its section detail, and the
printed card) and nowhere else:

- **Suit blue `#1e4f7a`** — the second suit's ink. The palette's
  two dark greens (ink `#1c2a20`, tile-back `#33503f`) cannot be
  told apart as suit colours, so a third distinguishable suit ink
  is unavoidable. 6.21:1 on the sheet, 8.56:1 on white.
- **Dragon green `#27632f`** — the green dragon's ink on the
  card. The system's green-dragon ink `#22763d` (§12) measures
  4.09:1 on the sheet — below the §9 floor of 4.5:1 — while
  `#27632f` measures 5.24:1 on the sheet and 7.21:1 on white.
  §12's inspect-surface ink is unchanged; this substitution
  applies to card notation only.
- **Dragon white `#44554a`** — the white dragon's ink on the
  card, a dark slate-green (a white dragon still has to print).
  §12's inspect W is slate `#7a8699`, which computes to 2.68:1
  on the sheet; `#44554a` measures 5.77:1 on the sheet and
  7.94:1 on white.

The remaining notation inks are palette colours: suit 0 and the
winds in the card ink `#1c2a20`, suit 2 and the red dragon in
text-grade chun `#9e2b25` (§2), flowers in the tint secondary
`#33503f`. This section is a scoped exception to §15's "no other
tint or hue" rule: it licenses these three inks for Practice
Card notation glyphs only, and introduces no tint, surface, or
general-purpose colour.

## 18. Static content pages

Approved 2026-11-18 (renderings `content-pages-v1`, QC-passed;
owner approval the same day). The site carries real static
documents beside the app — the rules and lesson-index pages built
after the AdSense review found "ads on screens without
publisher-content". They are documents, not app screens (§6 does
not govern them), and they follow the shipped `/privacy` pattern:

- **Form.** Each page is a real directory + `index.html` under
  `packages/web/public/` (`/riichi/`, `/learn/`, `/hong-kong/`,
  `/mcr/`, `/taiwanese/`, `/calculator/`), served as its own
  document by `server.mjs`; unknown paths stay real 404s. One
  shared sheet, `public/pages.css`, carries the v6 tokens and type
  roles: Fraunces for the wordmark and the H1 only, Figtree for
  everything else, a 680px reading column on the felt ground.
- **Per-page head.** Every page carries its own title, meta
  description, canonical, Open Graph / Twitter tags, and JSON-LD
  (`WebPage` + `BreadcrumbList`), and is listed in `sitemap.xml`.
  Page content is drawn from the app's own text (the Rules screen,
  the lesson data, the in-app guides) and guarded by drift tests
  in `packages/web/test/content-pages.test.ts`: if the app's
  lessons or riichi rules change, the pages must change with them
  or the tests fail.
- **Gold on static pages.** Gold appears only as the wordmark and
  as the fill of the page's single app-entry button — the §2 Play
  role extended to a document page's one app-entry action
  (ratified with this section). Body links are cream with a
  dim-sage underline decoration, never gold; the current-page nav
  state is a state-green inset underline. State green is never a
  text colour on these pages (it measures 4.39:1 on felt — above
  the 3:1 non-text threshold, below the §9 text floor).
- **Home shell.** The initial HTML for `/` carries the factual
  home content (H1, intro, link rows) inside `#app`; the app
  replaces it on mount. Its styles are scoped under `.om-shell`
  so no shell rule can reach the running app, and the noscript
  fallback carries the same facts.
- **/privacy link correction.** The shipped privacy page coloured
  its links gold (`a { color: #d9b45c; }`) — not an enumerated §2
  role, and unrecorded until this section. Corrected to the
  cream-link treatment above in the same PR that shipped these
  pages; gold links on any static page are drift.

## 19. The app icon

The app icon (owner ruling, Nov 18, 2026) is the green-dragon tile from the
app's own tile sprite at full scale: cream face, green dragon glyph, on a
gold plate that reads as the tile's border, over the felt ground. Gold is
licensed for the icon as that border — this is an icon-only license and does
not extend the §2 quarantine inside the app. The master is
`packages/web/public/icon-1024.png`; `icon.svg` is the same composition with
the glyph as an embedded path (no font dependency). Exploration record:
~/workspace/mahjong-prep/renderings/app-icon-v1/ (concepts 01–13, QC rounds
1–6).

## 20. Multiplayer (Play-tab Online lobby, table furniture, paces)

Approved 2026-11-18 (renderings `multiplayer-ui-v1`, QC-passed;
owner picked Option B on 2026-11-18 and ruled the revisions and the
clock presets the same evening). The multiplayer front end is built
entirely from the shipped surfaces; PR #87's separate online page
structure and its light shell are retired.

- **The lobby is the Play tab.** A Solo/Online segment on the Play
  tab swaps the body: the Online body is one scrolling surface —
  the Play picker grammar (Rules / Length / Pace segments), the
  queue actions, the offer-my-seats switch, public Friendly seats
  as rows, My games (your-move first; All / Your move / Waiting
  filter; correspondence games are rows here, there is no separate
  correspondence surface), and the identity row (guests carry the
  recovery-code replacement there). There is no separate Online
  screen and no standalone lobby page.
- **Queue actions.** "Find Friendly game" and the Ranked entry
  ("Find Ranked game", or "Sign in for Ranked" for guests) sit side
  by side at equal size — equal width AND equal height (48px,
  set explicitly on both: the medium layer's 40px ghost height must
  never shrink the Ranked half of the duo), squared-off at 6px.
  "Create custom room" is subordinate on every dimension: centred
  below the duo, 44px tall, 13.5px type, a friends/person icon, and
  a width capped below one duo button's width (150px against the
  duo's 162px in the 334px lobby column).
- **States fold into sheets.** Guest entry and the recovery code,
  join-by-invite-link (the room's facts as label/value rows), the
  waiting room (host, guest, Friendly queue and Ranked queue are
  one sheet in four states; seats are medium tile objects per §15),
  and the Friendly room offer (a card) all live over the lobby.
  No state gets its own page.
- **Pace presets (ruled).** Live is 5+20 — 5 seconds per move plus
  a 20-second reserve that refills each hand; Ranked runs at the
  Live pace only and launches enabled (no gate). The casual Relaxed
  sub-format doubles both numbers (10+40). There is no Unlimited
  live pace. Correspondence is untimed. The claim window is a flat
  5 seconds at every timed pace and never draws on the reserve.
- **The online table is the solo table.** The shipped four-sided
  table DOM and geometry, unchanged; online states integrate into
  its furniture only: the clock is a single named row inside the
  center panel under the dora row (the player to move + remaining
  time in tabular figures; "Your move" / "Your claim" for the
  viewer; correspondence reads "Correspondence · No time limit");
  a riichi player's chip carries the riichi point stick itself
  instead of the word; a bot-covered opponent's chip gains "· Bot"
  (the full wording lives in that seat's Focus Frame); your own
  cover is a "Reconnecting…" strip under the header plus a cover
  bar where the prompt row sits ("A bot is playing your seat" +
  "Reclaim my seat", your hand visible and dimmed); correspondence
  proposes ending by agreement from the hand control row. No
  stacked seat list, no second table.
- **Results.** The solo results grammar (standings table) plus,
  for rated games, a rating block (before → after per player); a
  rating voided by the server shows the unrated line with the
  server-supplied reason instead. Friendly results offer a rematch.
  Analyze is the existing Board review, unchanged.
- **Copy.** Factual only (§7 applies in full): no copy states the
  ranked abandonment settlement (unruled) and nothing says Ranked
  is closed or opening later. "Bot" never "AI".

