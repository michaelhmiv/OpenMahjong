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
| Segment selected | `#2e4a3a` | Lifted green, cream text |
| Line | `#3a5a47` | Hairlines where unavoidable |
| Ink | `#f3efe3` | Primary text (warm cream) |
| Dim | `#a9bda9` | Secondary text (sage-cream) |
| Gold | `#d9b45c` | See §2 — quarantined |
| On-gold text | `#1c2a20` | Text on gold fills (e.g. Play label) |
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

Gold must NEVER appear on: body text, stats, scores, labels, pills,
history rows, settings rows, or state styles. State styles — selection
rings, picked/selected tile outlines, turn rings, focus-visible
outlines, switch-on fills, positive/negative point deltas — use green
or cream accents, not gold. (This rule exists because a shared
`--accent` variable silently spread gold to dormant states in the
v6 mockups; QC caught it. Do not reintroduce a single accent variable
that carries gold into states.)

## 3. Type system

Two self-hosted variable fonts (SIL OFL 1.1), in `public/fonts/`:
Fraunces and Figtree. No other UI typeface. No webfont downloads at
runtime.

- **Fraunces** — display roles only: the wordmark (weight 650, 30px,
  letter-spacing 0.045em on home), the Play button label (600), card
  titles, and the Last game value line.
- **Figtree** — everything else: buttons, pills, segment control,
  record strip, labels, body text, scores, settings, history.
- Figures are tabular wherever numbers align or update:
  `font-variant-numeric: tabular-nums` (Figtree's `tnum`).
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
Game-end results, Rules, About, Privacy, Review, Practice.
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

## 13. App shell and navigation

(Approved renderings app-shell-v1, ruled 2026-11-16; this section
records the shell the renderings specify.)

- The app is a bottom-nav shell with FOUR tab roots: Play, Learn,
  Games, More. The tab bar is 83px including its border; the active
  tab is a panel-hi pill with a cream label and a state-green icon.
  Gold never appears in the tab bar.
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
  record strip when the account has stats, the tile-back wall, and
  the AdSense slot at the foot (section 2's geometry unchanged).
  Sign-in lives on More, never on Play. The variant picker is a
  `.seg` control with content-sized segments and 12px labels — the
  four shipped names (Riichi, Hong Kong Old Style, MCR, Taiwanese)
  do not fit four-across at the segment control's 14px (approved
  rendering play-picker-v1, option B, 2026-11-17).
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
  mode), the About links (Rules, About, Privacy), and the AGPL
  footer.

## 14. Game details, board review and in-person tools

Finished Games rows open a separate game-detail surface with final standings,
settlement and a selectable row for every recorded hand. Rows use the winner's
wind during that hand. Board review uses a portrait-first four-seat board, an
event slider and labeled event/decision/jump controls. Concealed opponent tiles
remain backs. The coach comparison appears at the original decision, using the
existing explained heuristic analysis. Game details and review have no bottom nav.

Play includes an in-person calculator/scorekeeper entry. Its drilled-in screens
use the same green panels, green/cream selection roles, self-hosted fonts and
native-width scrolling shell. Both tile and fast input keep context controls
visible in the form. Payment lines lead each result; original facts and editable
corrections follow. Recording requires confirmation. Session history, correction,
undo, pot disposition and settlement are explicit controls. No account is needed
for manual use. Games labels these sessions separately from CPU statistics.

Variant table implementation retains the v4 top/side ponds, per-side13th-discard condensation and absolute-sized Focus Frames. Native44px selection targets use two rows of seven for13/14-tile hands and a third row for Taiwanese16/17-tile hands, including Large Tiles. Selected faces stay in a fixed preview slot. Guided hints float above the hand and disappear during calls, playback or an open frame. The additional row is the required five-set extension; existing Riichi table geometry remains untouched. Table settings use the same accessible sheet grammar. All four Learn sections remain collapsible and profile-specific.
