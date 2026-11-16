# Independent prototype QC

Status: **automated rendering checks passed; owner approved both designs on 2026-11-16**. This is a design proposal, not a released application screen or proof of a completed learner workflow.

The final files were inspected independently with headless system Chromium at 390×844 and 360×800, with Playwright and axe. The earlier review revision overflowed both phone heights and was rejected; the final fixed shell and scrollable content were remeasured after correction.

| Check | Practice | Decision review |
|---|---|---|
| Horizontal/document overflow | None at both viewports | None at both viewports |
| Controls smaller than 44×44 px | None | None |
| Controls outside initial viewport | None | None |
| UI text below 11 px | None | None |
| Loaded UI fonts | Figtree, Fraunces | Figtree, Fraunces |
| Minimum measured UI text contrast | 6.58:1 | 4.89:1 |
| Axe violations | 0 at both viewports | 0 at both viewports |
| Uncaught browser errors | 0 | 0 |

Computed styles show Figtree body text and Fraunces wordmark/card headings. Both self-hosted font faces reached `loaded` status. Gold is used only for the wordmark. The rendered Practice 360×800 and Review 390×844 screenshots were also inspected visually; tile faces and edge/shadow treatment are present and readable, and the primary action and bottom navigation remain visible.

The source proof was recomputed independently with the current built engine and coach. Seed `design-review-2`, first seat-0 draw, matches the captured `PlayerView` exactly. Discarding 3s leaves 3 shanten and 42 unseen improving copies; discarding West leaves 3 shanten and 58 unseen improving copies. The player view contains opponent public fields and hand counts, with no opponent tile identities or wall contents. No result or future state was used. The wait exercise hand `123m123p777z55s45m` independently completes on tile types 2 and 5 (3m and 6m).

These checks do not constitute owner approval, human usability testing, production UI implementation, screen-reader testing, or device performance evidence. The prototype uses static demonstration state and does not persist learning progress. New navigation and layouts received owner approval; the implementation records that amendment in `docs/design-rules.md` §§6 and 10.

Raw measurements: [qc-report.json](qc-report.json). Screenshots are generated in the task's intermediate evidence directory and selected deliverables are copied by the design author.
