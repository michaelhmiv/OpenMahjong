# @openmahjong/ai

AI opponents for Open Mahjong, per brief §6: one solid level built on an
efficiency core (shanten + ukeire), hand-value judgment, and basic defense
against riichi — at human-ish pacing, with every decision under 50 ms.

**Status: placeholder.** The foundation slice ships the engine only; the
AI lands in a later slice. This package will depend solely on
`@openmahjong/engine`'s public state view, so an AI can never see hidden
information (no wall peeking, enforced by API shape, not by honor system).
