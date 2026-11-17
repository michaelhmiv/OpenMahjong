# Rulesets and simulation versions

Current extension (2026-11-17): this descriptor continues to identify **Riichi only**. Executable Hong Kong, MCR and Taiwanese adapters live in `engine/src/variants/` with schema-three records; see [variants](variants.md) and the [rule briefs](../rules/). Calculator house settings live with in-person ledger entries and never mutate CPU defaults.

The active profile in the Riichi descriptor is **`openmahjong-riichi@1`**, exported as
`DEFAULT_RULESET` from `packages/engine/src/ruleset.ts`. It names the project's
existing intended house rules. It is neither WRC nor EMA certification, and
there are no selectable WRC/EMA/Tenhou presets or non-riichi variants yet.

`new Game({ seed, policies, ruleset: { id: "openmahjong-riichi", version: 1 } })`
validates that exact reference. Omitting `ruleset` selects the same profile.
`resolveRuleset` rejects any unknown ID/version instead of silently running
riichi behind another label. `game-start` records the profile reference.
The descriptor documents the single supported implementation; changing a
property on a copied descriptor does not implement another set of rules.

## Independent version boundaries

| Version | Meaning | Current value / compatibility |
| --- | --- | --- |
| Ruleset | Intended gameplay and scoring choices | `openmahjong-riichi@1` |
| Simulation engine | Code that executes those rules, including bug fixes | `ENGINE_VERSION = 2`; frozen v1 for historical games |
| Opponent policy | How legal choices are selected | `AI_POLICY_VERSION = 2`; frozen v1 for historical continuation |
| Replay schema | Envelope and validation of stored decisions | See [replay.md](replay.md); new records pin engine/policy/profile |
| Analysis | Meaning and assumptions of facts/judgments | `discard-analysis-2`, schema 1; see [analysis.md](analysis.md) |
| Curriculum / exercises | Authored content and compatible rules references | See [curriculum.md](../education/curriculum.md) |

Correcting honroutou scoring or replenishing the dead wall changes the engine
revision because those were implementation errors, rather than a decision to
use another house rule. Historical v1 sources remain unchanged so an old seed
and decision log is not reinterpreted into a different match. New games use
the corrected current engine. Historical execution must not be presented as
evidence that a known scoring bug is the intended active rule.

## Current named choices

| Area | OpenMahjong riichi v1 |
| --- | --- |
| Players / wall | Four players; 136 physical tiles, four copies of 34 types; one red five in each numbered suit |
| Match lengths | East or East/South; 25,000 starting points; 30,000 return; uma +15/+5/−5/−15, oka 20 |
| Tanyao / dora | Open tanyao allowed; red/dora/uradora bonus han require a yaku |
| Limits | Kiriage mangan off; 13+ han counted yakuman; true yakuman stack |
| Double yakuman | Specific-wait doubles enabled; big four winds double |
| Wind pair | Double seat/round wind pair contributes two fu total; the triplet contributes both yaku |
| Ron priority | Ron before pon/kan before chi; simultaneous ron resolved by head bump in turn order |
| Riichi | Closed hand, at least 1,000 points, at least four live tiles, genuine physically possible tenpai |
| Riichi ankan | The new draw completes the quad and the original set of wait types remains unchanged |
| Kan | At most four; requires replacement and live-wall replenishment capacity; any completed call/kan interrupts ippatsu |
| Kan indicators | Concealed kan flips before replacement draw; open kan flips immediately after replacement draw, before the discard decision |
| Ankan robbery | Not offered, including kokushi |
| Draws | Exhaustive tenpai/noten 3,000 exchange; four specified abortive draws; nagashi mangan |
| Temporary furiten | Ends at next own draw, including replacement draw; not cleared merely by chi/pon |
| Match end | A negative score ends the match; no agari-yame; final dealer repeats can extend it |
| Settlement ties | Average the occupied-rank uma/oka; remaining sticks go to first place with deterministic starting-seat tie break |
| Liability / kuikae | No liability payment rule; immediate discard-exchange restriction is not implemented |

The kan layout is a deterministic library representation, not a literal stack
animation: the fourteen-tile dead wall reserves four replacement tiles and
five dora/ura pairs. Each replacement draw retires one tail tile of the live
wall. Thus an exhaustive hand has `normalDraws + replacementDraws = 70`, after
the initial 52 tiles are dealt; retired tails are never drawn.

The riichi-ankan gate checks wait sets, not every possible interpretation of
the hand. WRC's stricter interpretation-preservation requirement must not be
claimed as implemented. Independent regression cases permit an unchanged-wait
ankan and deny `234456m7778899p` drawing 7p: its original 7p/8p/9p waits would
become 8p/9p. Reconstructing the pre-draw ownership vector is essential.

## Sources and verification

The initial authority for the house choices is the approved historical
[`../brief-v1.md`](../brief-v1.md), especially S1-2/S1-12/S1-13, followed by
verified code and explicit decisions documented in the
[rules-compliance audit](../audit/rules-compliance.md). Historical documents
are preserved rather than rewritten to imply that older decisions differed.

The official [WRC rules page](https://www.worldriichi.org/wrc-rules) linked
[WRC Rules 2025, v20250526](https://www.worldriichi.org/s/WRC-Rules-2025-42fx.pdf)
when retrieved on 2026-11-16. Its shared structural rules and yaku were used to
independently check fixes. Relevant sections include 8.4, 8.7, 8.9.1, 8.11.2,
8.13, 11.3 and 11.5. The [EMA site](https://mahjong-europe.org) rejected the
initial attempted read with HTTP 403; no fresh EMA verification is claimed.

Known WRC differences include no red fives, kiriage mangan on, different riichi
point/live-wall eligibility, no abortive draws/nagashi/bust-out, and different
yakuman/match policies. The detailed comparison and per-feature test gaps live
in the audit. WRC/EMA must never silently replace this profile in engine,
curriculum, analysis or fixtures.

## Adding a ruleset or variant

The reference is a compatibility boundary, not a completed multi-variant
engine. Adding another profile requires a reviewed rule specification,
implemented branches where behavior differs, independent scoring/action/wall
fixtures, replay identity, and compatible original educational content.
Unrecognized IDs must continue to fail explicitly. Other variants additionally
need dedicated hand structure, scoring, tile inventory and action contracts;
they cannot be expressed by relabeling riichi-only calculations. Proposed
extension work is described in [variants.md](variants.md).

Any material change to intended eligibility, scoring or settlement choices
requires a new profile version and an explicit migration/old-replay policy.
A bug fix retains the intended profile but advances simulation/analysis
revisions whenever deterministic outcomes or evaluation semantics change.
