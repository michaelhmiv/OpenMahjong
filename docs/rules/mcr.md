# MCR — WMO 2006 profile

Identity: `mcr`, `openmahjong-mcr-2006@1`, simulation/replay engine 3, deterministic CPU policy 1. This is the **2006 WMO English edition hosted by EMA**, not tournament certification or an assertion that later amendments are identical. Source: [Mahjong Competition Rules](https://mahjong-europe.org/portal/images/docs/mcr_EN.pdf), especially §§3.6–3.9 and the fan appendix. Accessed 2026-11-17. Rules facts are paraphrased in original lessons; the copyrighted book is linked, not bundled.

## Frozen decisions

- 144 physical tiles: 136 ordinary, eight unique flowers/seasons; no red fives. Thirteen standing structural tiles, four sets and a pair; every declared quad adds one physical tile. Seven Pairs permits a four-of-a-kind to supply two pairs. Orphans, knitted straight, and both honors-and-knitted forms have their own validation.
- Flowers are immediately exposed and replaced from the back. Ordinary draws come from the front, quad replacements from the back. No fixed dead-wall reserve. The remaining wall bounds all replacement and claim opportunities.
- Any seat may win, pung or kong on a discard; only the next seat may chow. Win > pung/kong > chow; nearest eligible winner has priority. No simultaneous wins. A quad requires a drawing turn; it cannot follow a chow/pung without drawing. Only an added kong may be robbed. No Riichi furiten, declarations, deposits, indicators, dealer multipliers, bust-out or rank bonuses.
- Concealed quads remain face-down to opponents, including their physical IDs in public views. The owner sees their own faces. Replay retains complete reconstruction material separately from immutable coach inputs.
- All **81 patterns**, documented exclusions and non-repeat accounting use the same deterministic scorer in gameplay, calculation, eligible-wait analysis, teaching checks and practice. Two Concealed Kongs is **8**, as in this edition. Under pattern 57, one concealed plus one melded kong scores **6 together**, replacing the individual kong awards. This is a combination rule within the 81-pattern catalog, not an additional catalog pattern or the later five-point mixed-kong value. Flowers do **not** meet the eight-fan eligibility threshold.
- Flowers add one each only after eligibility. Ron: every loser pays 8, and the discarder additionally pays the entire hand value including flowers. Self-draw: every loser pays 8 + entire hand value. At 8 qualifying fan + 2 flowers: ron 18/8/8, self-draw 18/18/18. No separate automatic quad transfers.
- A flower replacing a quad replacement does not earn Out with Replacement Tile in this edition. Last Tile requires the other three copies to have been publicly visible; concealed opponent quads cannot establish it. Unique wait points use the actual winning kind and the scorer's structural wait validation.
- Start at zero; negative scores permitted. Four rounds × four hands, dealer advances after **every** hand, including a dealer win or draw. Short east/south match lengths preserve the same rules. Final settlement is net points. Equal scores share rank in CPU summaries; no invented tournament tiebreak or certification.

## Implementation and provenance

The MIT Jeff Wang algorithm is pinned, readable and vendored with its full license, a bounded original bridge and a reproducible Emscripten 3.1.64 build: [NOTICE](../../packages/engine/vendor/mcr/NOTICE.md). Checked-in pure JavaScript runs offline synchronously; no scoring service, runtime download or model is involved. The TypeScript boundary validates counts, sets, context and flower uniqueness before entering its fixed buffers. The generated runtime is lazy and shared within a process.

The Chinese-family coordinator is independent of the Riichi state machine. `MCR` owns its inventory, scorer, payments, legal contexts, public projection and progression. Schema 3 stores both variant and profile. Unknown IDs, versions and Riichi actions fail explicitly. Existing schema 1/2 and frozen legacy code remain intact.

Fast calculation accepts agreed **non-flower fan plus a separate flower count**. It does not pretend a hand-pattern checklist validates composition. Tile calculation detects the full pattern breakdown. Corrections preserve original facts and reasons, recalculate all payer amounts, and require confirmation before recording. In-person `mcr-2006@1` ledgers are separate from CPU records and Riichi statistics; optional private revision-checked sync uses the common ledger endpoints.

Original teaching comprises ten substantial lessons, twenty corrective checks, and an 81-item family reference with recognition/restriction copy. Review is public-information heuristic advice, not result grading. Curated practice answers are independently validated against this edition; review's preferred discard is never promoted into an exercise answer.

## Verification contract

`mcr-patterns.test.ts` has a separately constructed recognition case for every pattern. Additional tests cover negative/context cases, exclusions, wait restrictions, min fan versus flowers, arithmetic, fixed-heap input bounds, hidden quad projection, sixteen-hand progression and determinism. Full-stack traces restore through the variant seat driver, reconstruct board timelines and compare immutable prefix coaching inputs. Browser evidence exercises actual Play/Learn/Table/coach/history/review and both calculator entry paths. Final commands and results belong in the implementation verification report.
