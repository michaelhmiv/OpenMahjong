# Open Mahjong — Design Rules

Version 6 (green), ruled by Michael on 2026-11-16. This document is the
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
- the Learn progress-bar fill
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
- The home screen strip is a real, complete winning hand (2m 3m 4m ·
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

The screen inventory is fixed by the brief (§7 + slice-2 additions):
Landing, Table, Hand-end breakdown, Game-end results, Rules, Settings,
About, Privacy, History, Stats, Review, Learn (index + lesson runner).
A new screen requires a brief amendment and an approved rendering.

## 7. Copy law

Product copy is purely informational text. No slogans, no flourish,
no descriptor lines. The wordmark carries exactly one line:
"Free forever. Open source mahjong." Nothing is added line-by-line;
any copy change is swept across the whole surface at once.

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
