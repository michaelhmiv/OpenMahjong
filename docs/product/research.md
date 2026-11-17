# Product research and translation to mahjong

Read-only desk research conducted November 16, 2026. Public official/author pages
were opened through the connected web tool. This is not a logged-in competitive
client usability study, and a publisher's feature description is not independent
verification of quality. No third-party code, assets or lesson text was copied.

## Lichess: the useful pattern

The inspected [features page](https://lichess.org/features) explicitly describes
basic lessons, computer analysis, learning from mistakes, studies, insights and
puzzles from user games. The [Practice page](https://lichess.org/practice) groups
interactive training by concept and difficulty. [Puzzle themes](https://lichess.org/training/themes)
provide a navigable taxonomy, improvement areas/history and a route to positions
from a player's own games. The [study listing](https://lichess.org/study) displays
persistent collections of chapters. The [source page](https://lichess.org/source)
separates rules, board UI, realtime transport and analysis/puzzle services and links
its contribution ecosystem.

The transferable product idea is continuity: a game creates a reviewable decision;
a decision links to a concept; a concept has repeatable practice; evidence informs
the next suggestion. It is not necessary to reproduce Lichess's deployment scale
or copy its modules to deliver that loop.

| Inspected concept | OpenMahjong translation | Mahjong-specific limit |
|---|---|---|
| Beginner lessons and concept practice | Short real-tile interactions, corrective retry, progressively varied examples | A complete shape still needs yaku and correct furiten/win context |
| Themed puzzles | Stable skills: tile shapes, shanten, waits, yaku, scoring, defense and situation | Strategic tasks may have several reasonable alternatives |
| Puzzles from user games | Derive a validated exercise at a recorded decision boundary | Exclude future wall/opponent information from the question and evaluation |
| Computer analysis / mistakes | Exact legal facts plus explicitly heuristic candidate tradeoffs | No deterministic chess-style claim of a single optimal action or outcome-based blame |
| Studies / sharing | Private saved positions and annotated collections first | Public content needs privacy, resource bounds, rights and moderation planning |
| Insights and improvement areas | Skill-specific evidence, assistance tags and transparent review scheduling | Wins/placement have high variance; personal history is not authoritative ranked evidence |
| Matchmaking/tournaments | Later four-player coordinator and placement-aware competition | Pairwise chess ratings/arena formats cannot be adopted unchanged |
| Open-source ecosystem | Public rules fixtures, contributor setup, small modules and issue reproduction | Keep AGPL obligations and asset/content licensing explicit |

The anonymous [puzzle dashboard URL](https://lichess.org/training/dashboard/30/dashboard)
redirected to registration, so personalized dashboard internals were not inspected.
The Learn page exposed navigation but not its interactive client content to text
extraction. Those access limits do not establish a weakness or absence of features.

## Other platforms and training tools

| Subject and inspected source | What the source actually supports | Recommendation / unverified areas |
|---|---|---|
| [Chess.com lessons](https://www.chess.com/lessons) | Searchable lessons with level/theme/instructor filters and beginner-to-mastery collections | Reuse discoverable concept/level metadata. Actual lesson feedback, paid entitlements and account-specific adaptation were not tested |
| [Chess.com analysis](https://www.chess.com/analysis) and [puzzles](https://www.chess.com/puzzles) | Public entry points and navigation were readable; app content was not | Do not infer accuracy grading internals or pricing from an unauthenticated shell |
| [Mahjong Soul official site](https://mahjongsoul.yo-star.com/) | Site opened but yielded no readable client content | Requires a dedicated browser/account study before comparative UX claims; no assertions here about its coach, rules, monetization or educational quality |
| [Tenhou official site](https://tenhou.net/) | Browser/mobile play, lobby/tournament facilities, records/replay analysis and spectator access are described; high-level spectating is delayed | Study compact replay navigation and delayed spectating before multiplayer. Do not copy rules defaults from a product comparison |
| [Riichi City publisher's Steam listing](https://store.steampowered.com/app/1954420/RiichiCity/) | Publisher advertises beginner tutorials, ranked play/tournaments, game logs/spectating, hints and point calculation | These are publisher claims, not hands-on verification. Teach hints with explanatory assumptions and preserve OpenMahjong's approved visual direction |
| [Euophrys efficiency trainer](https://euophrys.itch.io/mahjong-efficiency-trainer) | Author explains discard acceptance comparison until tenpai, configurable notation/tiles and explicit limits of pure efficiency | Show the acceptance difference and why; do not score every strategic deviation as a mistake. This source itself warns efficiency is not complete strategy |
| [Euophrys development log](https://euophrys.itch.io/mahjong-efficiency-trainer/devlog) | Author records defense training, all-last scenarios and replay analyzer additions | Build separate validated task categories rather than pretending one metric covers defense/placement; client interactions were not run |
| [Riichi scoring trainer](https://riichitrainer.com/) | Public app opened without readable extracted task content | Scoring-trainer entry point identified; no claim its examples or answers were independently validated |
| [KC Riichi resources](https://www.kcriichi.com/resource) | Returned a JavaScript-required shell | Community source identified, content not treated as inspected teaching material |
| [Anki background manual](https://docs.ankiweb.net/manual/background) | Describes active recall and increasing review intervals as concepts become easier | Start with transparent spaced review, measure retention/transfer and distinguish assisted responses. Do not import an advanced scheduler before evidence warrants it |

A fuller competitive UX study remains a separate bounded task with actual
viewports, interactions and an agreed account scope. Search snippets and marketing
claims cannot substitute for those observations.

## Rules research and content rights

The [World Riichi Championship rules page](https://www.worldriichi.org/wrc-rules)
links its 2025 rules, clarifications, scoring table and optional rules. It is a
source index, not permission to replace OpenMahjong's defaults. The official
[EMA rules listing](https://mahjong-europe.org/portal/index.php?option=com_content&view=article&id=30&Itemid=166)
and [2025 English PDF](https://mahjong-europe.org/portal/images/docs/Riichi-rules-2025-EN.pdf)
were identified, but this research tool timed out fetching their full content.
Detailed rules used in fixtures require the independently inspected text cited in
the [rules audit](../audit/rules-compliance.md).

The [National Mah Jongg League site](https://www.nationalmahjonggleague.org/)
markets year-specific cards and online play. It does not grant this project rights
to reproduce annual winning-hand content. American-mahjong support therefore
requires a separate rules/card/licensing investigation. No proprietary card,
lesson, artwork or code was imported during this research.

## Architectural implications

The recommendation is to improve the existing shared reasoning/evidence path,
not add a language model to invent mahjong advice. Exact rule/score facts,
heuristic strategy and probabilistic predictions need different guarantees.
A complete learned skill requires retention and transfer, not a streak counter.
Build the smallest local-first workflow that demonstrates that value before
adding remote deep analysis, ratings, social sharing or another variant.

These recommendations are product/engineering inferences from the cited sources
and this repository's audit. They are not claims that other platforms lack the
proposed capabilities.


Implementation note, 2026-11-17: the statement above about no copied third-party code describes that earlier research pass. The approved implementation now incorporates the pinned MIT MCR algorithm with its full license and readable source; see [provenance](../../packages/engine/vendor/mcr/NOTICE.md). New lesson and reference prose is original.
