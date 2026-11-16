# Curriculum implementation

The actual catalog is `packages/web/src/education/curriculum.ts`, consumed and re-exported by `tutorial.ts`. It contains the 11 existing lessons, not a claim of a completed advanced program. Every module now records content version, objectives, estimated minutes, advisory prerequisites, learning domains A–I, stage, skill IDs, interaction types, completion criteria, review eligibility, ruleset reference, and source pointers.

`recommendedModule` chooses the first incomplete nonoptional lesson whose prerequisites are complete. Prerequisites never lock direct access. Five learner stages and all nine domains are representable; authored interactive lessons currently cover only beginner/developing-beginner material. Advanced and competitive material remains roadmap work.

Content version 2 corrects inaccurate universal claims while preserving existing step order. Ruleset version and content version are separate: bug fixes do not silently switch a learner to WRC. The skill taxonomy version 1 consists of tile recognition, construction, shanten, ukeire, waits, yaku, scoring, calling, riichi, defense, push/fold, and situation. It is a set of separate dimensions, not an opaque mastery score.

For changes: assign a stable ID; specify ruleset compatibility and sources; state one or more observable objectives; choose the actual interaction; document exact completion; add legal fixtures and wrong-answer checks; increment content version when meaning changes; declare a migration or restart policy. A planned topic belongs in the roadmap rather than appearing as a completed catalog module. See `docs/audit/education-audit.md` for every existing module and the missing coverage per domain.
