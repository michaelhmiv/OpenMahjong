# OpenMahjong — Master Product, Architecture, Education, and Implementation Brief

**Project:** OpenMahjong  
**Repository:** https://github.com/michaelhmiv/OpenMahjong  
**Production website:** https://openmahjong.app  
**Primary objective:** Build the Lichess-equivalent platform for mahjong, with an exceptionally comprehensive, interactive, and personalized learning system.  
**Document status:** Master directive for an autonomous development agent  
**Scope:** Full repository audit, production UX audit, design and architecture evaluation, educational system design, implementation, testing, documentation, and ongoing technical improvement.

---

# 1. Executive Directive

You are acting as the principal software architect, senior full-stack engineer, game-engine specialist, mahjong rules researcher, instructional designer, product designer, accessibility specialist, and technical quality reviewer for OpenMahjong.

Your assignment is to transform the existing application into a comprehensive open-source mahjong platform modeled on the strengths of Lichess, but developed specifically around the unique properties of mahjong.

**This is not a greenfield project.** The existing repository contains substantial implementation work, including a playable riichi engine, AI opponents, tutorial scenarios, a coach, game records, and a web application. You must inspect, preserve, validate, and extend that foundation.

Do not interpret this assignment as a request to replace the existing application, change its technology stack unnecessarily, or build unrelated functionality.

The objective is to make OpenMahjong:

1. An exceptionally accessible introduction to mahjong.
2. A fully functional, enjoyable game for casual players.
3. A serious learning platform for players seeking improvement.
4. A comprehensive training environment with interactive lessons, drills, and exercises.
5. An analytical platform for understanding decisions made during games.
6. An environment that recognizes individual weaknesses and recommends appropriate practice.
7. An eventual online competitive platform with multiplayer, ratings, tournaments, and community features.
8. A modular platform capable of supporting multiple major mahjong variants.
9. A trustworthy, maintainable, open-source project that can attract community contributions.

The final product should make it possible for a person with absolutely no knowledge of mahjong to learn the rules, become comfortable playing complete games, develop sound strategic judgment, measure their improvement, and eventually become a strong competitive player without needing another application or learning resource.

**The key product principle: OpenMahjong must teach users how to think, not merely tell them what to do.**

A user should understand why a discard is efficient, why another is dangerous, why a particular wait is valuable, why a call changes their options, and how uncertainty affects the optimal decision.

This should become the defining characteristic of the platform.

---

# 2. Operating Instructions for the Development Agent

## 2.1 Begin with discovery, not implementation

Before proposing architectural modifications or writing code:

- Clone or inspect the current repository.
- Identify the default branch and latest commit.
- Inspect open pull requests, active feature branches, existing issues, and recent merged changes.
- Read the existing README, design briefs, design rules, and package documentation.
- Inspect GitHub Actions and development scripts.
- Establish how the application is built, tested, deployed, and configured.
- Inspect the production site through browser automation where accessible.
- Identify which proposed features already exist, which are incomplete, and which are absent.
- Determine the current codebase's actual behavior rather than relying on historical documentation or previous PR descriptions.

Do not assume the project is in the same state as it was when this brief was written.

The initial assessment of the repository suggests the following structure:

| Package | Existing responsibility |
|---|---|
| `packages/engine` | Tiles, walls, hand analysis, scoring, deterministic game state |
| `packages/ai` | AI opponents, hand efficiency, defensive heuristics |
| `packages/coach` | Structured discard recommendations and coaching information |
| `packages/web` | Web interface, table rendering, tutorials, animation, game records |
| `packages/server` | Authentication, accounts, saved games, settings, statistics |

Verify this inventory.

The repository also appears to have an existing deterministic event log, 11 introductory lessons, guided gameplay, an offline-capable PWA, Google authentication, and extensive automated testing.

Treat these as existing foundations to evaluate, not features to recreate.

## 2.2 Work autonomously but incrementally

Complete the audit, develop an implementation plan, and begin executing that plan.

Do not stop after producing recommendations.

However:

- Do not implement the entire roadmap as one enormous pull request.
- Use logically separated PRs with focused changes.
- Prefer backward-compatible changes and additive migrations.
- Do not merge your own PRs or deploy to production without authorization.
- Do not overwrite or discard unrelated work.
- Do not bypass failing tests.
- Do not silently modify approved product requirements.
- Do not invent test results, screenshots, benchmarks, or production observations.
- Do not claim a feature is complete merely because code exists.

Continue through independent, non-blocked work rather than waiting for unnecessary confirmations.

When a change requires an explicit product, design, security, licensing, or deployment decision, document the options and recommendation. Continue with other work while that decision remains open.

## 2.3 Preserve existing product principles

The application must remain:

- Free to play.
- Open source under its established AGPLv3 licensing model.
- Usable without creating an account.
- Browser-first, with strong mobile support.
- Minimalist and focused on mahjong.
- Free from pay-to-win mechanics.
- Understandable without previous mahjong experience.
- Respectful of users' attention and privacy.

Do not assume that the platform must be entirely advertisement-free. The current product decisions may allow advertising. Audit the actual policy and avoid making unsupported claims about advertising, monetization, or data collection.

Preserve the established visual direction unless there is a documented reason to propose a change.

---

# 3. Research and Competitive Analysis

Research the current state of digital mahjong platforms and online learning experiences.

Study the product architecture and user experience of:

- Lichess
- Chess.com
- Mahjong Soul
- Tenhou
- Riichi City
- Mahjong efficiency trainers and scoring calculators
- Established mahjong teaching websites and learning communities
- Other relevant training, puzzle, and spaced-repetition applications

These are research subjects, not instructions to copy proprietary code, visual assets, educational material, or copyrighted content.

## 3.1 Examine Lichess particularly closely

Study the following capabilities:

- Beginner lessons
- Interactive practice exercises
- Tactical puzzles
- Puzzles generated from actual games
- Game replay
- Computer analysis
- Learn-from-your-mistakes workflows
- Player performance insights
- Training categories and difficulty progression
- Studies and saved positions
- Sharing and community learning
- Multiplayer matchmaking
- Rating systems
- Tournament formats
- Open-source contribution model

Evaluate how each concept could translate into mahjong.

Be especially attentive to the differences between chess and mahjong.

Chess is a perfect-information game. Mahjong has hidden hands, an unknown wall, probabilistic outcomes, multiple opponents, and substantial short-term variance.

Consequently, mahjong analysis must emphasize decision quality, uncertainty, offensive efficiency, hand value, risk, and game situation rather than attempting to recreate a chess engine's deterministic evaluation system.

## 3.2 Research authoritative rules

Use authoritative published rules as references, including:

- World Riichi Championship rules: https://www.worldriichi.org/wrc-rules
- European Mahjong Association: https://mahjong-europe.org
- Relevant published rules for the additional variants under consideration

Distinguish between authoritative rules within a named ruleset and commonly adopted online house rules.

**Do not silently substitute WRC, EMA, Tenhou, or another ruleset for OpenMahjong's existing default.**

Document the differences and implement rules according to a versioned, explicit ruleset configuration.

All educational claims must match the ruleset selected by the user.

---

# 4. Comprehensive Audit — Mandatory First Deliverable

Produce a complete audit of the existing repository and production application.

The audit must be evidence-based and organized by severity, user impact, technical risk, and implementation complexity.

For every finding, provide:

- Identifier
- Area of application
- Description
- Expected behavior
- Observed behavior or code evidence
- Supporting file paths and line references
- Reproduction steps, where applicable
- Severity
- User impact
- Root-cause assessment
- Recommended correction
- Acceptance criteria
- Proposed implementation PR

Use these severity categories:

**P0 — Critical:** Security vulnerabilities, data corruption, impossible game states, severe correctness issues, or major production outages.

**P1 — High:** Incorrect rules, incorrect educational explanations, broken primary workflows, inaccessible critical controls, or other defects significantly affecting the core experience.

**P2 — Medium:** Maintainability problems, inconsistent UI, incomplete learning features, performance issues, or consequential technical debt.

**P3 — Low:** Minor polish, documentation improvements, or optional enhancements.

## 4.1 Engine audit

Inspect:

- Tile representation and identity
- Wall generation
- Randomization and seed reproducibility
- Live and dead wall accounting
- Dealer rotation
- Turn order
- Calls and call priorities
- Meld construction
- Riichi declarations
- Furiten rules
- Dora and uradora
- Kan behavior
- Exhaustive draws
- Abortive draws
- Nagashi mangan
- Round advancement
- Match termination
- Scoring and settlement
- State serialization
- Replay determinism
- Ruleset-specific behavior

Evaluate all major scoring combinations and edge cases.

Build a rules-compliance matrix identifying:

1. Implemented and independently verified
2. Implemented but insufficiently tested
3. Partially implemented
4. Missing
5. Ambiguous because of a ruleset difference

Use independently derived test cases rather than treating the implementation's existing output as proof of correctness.

## 4.2 AI audit

Examine the current opponent AI and coaching implementation.

Evaluate:

- Shanten calculations
- Ukeire calculations
- Wait identification
- Red-five handling
- Dora retention
- Yaku awareness
- Hand-value considerations
- Defensive heuristics
- Riichi decisions
- Calling decisions
- Push/fold decisions
- Performance
- Difficulty scaling potential
- Public-information restrictions

Determine how closely the coaching results correspond to the opponent policy and whether that policy produces strategically reliable decisions.

Do not assume the current heuristic AI represents an optimal or expert-level strategy.

## 4.3 Frontend and UX audit

Inspect all screens and user workflows.

Perform hands-on browser testing at representative viewport sizes, including approximately:

- 360 × 800
- 390 × 844
- 412 × 915
- Tablet portrait
- Tablet landscape
- Desktop 1440 × 900

Test:

- First-time arrival
- Guest play
- Account sign-in
- Lesson navigation
- Tutorial interactions
- Guided gameplay
- Complete game flow
- Score breakdowns
- Focus frames
- Tile selection
- Calls and special actions
- Game history
- Settings
- Resume after interruption
- PWA installation
- Offline behavior
- Reduced motion
- Browser back navigation

Collect reproducible screenshots and browser diagnostics where possible.

Do not infer successful visual behavior from CSS inspection alone.

If browser access is unavailable, explicitly document which checks remain unverified.

## 4.4 Backend, security, and data audit

Inspect:

- Google OAuth implementation
- Session creation and expiration
- CSRF protection
- Cookie behavior
- CORS configuration
- API validation
- Authorization boundaries
- Database schema
- Indexes and query efficiency
- Data retention and deletion
- Saved-game integrity
- Account synchronization
- Guest-to-account migration
- Error handling
- Rate limiting
- Logging and sensitive-data handling
- Storage limits
- Backup and recovery
- Service availability

The existing backend appears to accept client-provided game records. Determine the consequences for future rated or competitive play.

A client-authoritative record may be acceptable for private personal history, but it must never be trusted as an authoritative competitive result.

## 4.5 Code quality audit

Identify:

- Oversized modules
- Duplicated logic
- Unclear state ownership
- Weakly typed interfaces
- Overuse of dynamic objects
- Unnecessary rendering work
- Fragile event handling
- Potential memory leaks
- Inefficient game reconstruction
- Tight coupling between UI and logic
- Inconsistent test coverage
- Missing integration tests
- Unmaintained dependencies
- Documentation drift

In particular, examine the current replay architecture in `packages/web/src/runner.ts`, the large UI module in `packages/web/src/app.ts`, and the existing tutorial controller.

Do not refactor code purely for aesthetics. Refactoring should produce measurable improvements in clarity, correctness, performance, or extensibility.

## 4.6 Audit deliverables

Create:

- `docs/audit/architecture-audit.md`
- `docs/audit/rules-compliance.md`
- `docs/audit/education-audit.md`
- `docs/audit/ux-accessibility-audit.md`
- `docs/audit/security-performance-audit.md`
- `docs/audit/recommendations-and-roadmap.md`

Each should be an actionable engineering document, not a collection of general observations.

---

# 5. Educational Product Vision

OpenMahjong's primary competitive advantage must be its educational system.

Build a continuous learning experience with five integrated components:

**Learn → Play → Analyze → Practice → Improve**

These components must share progress information and reinforce one another.

A user should not feel that the game, tutorial, practice system, and analysis tool are four unrelated applications.

They should feel like parts of one coherent learning environment.

## 5.1 Learner stages

Support at least five stages.

### Stage 1 — Complete Beginner

A player has never played mahjong.

They need to learn:

- What the tiles are
- What the objective is
- How turns work
- How to discard
- What sets and pairs are
- How a hand wins
- What the interface is showing them

Do not overwhelm this player with advanced terminology or the full scoring system.

### Stage 2 — Developing Beginner

The player understands basic mechanics but struggles to complete hands consistently.

They need:

- Basic tile efficiency
- Introduction to yaku
- Tenpai and waits
- Calling decisions
- Riichi
- Simple defensive awareness
- Basic scoring

### Stage 3 — Intermediate Player

The player can finish games but wants to make better decisions.

They need:

- Five-block theory
- Shanten optimization
- Ukeire comparison
- Hand-value judgment
- Wait quality
- Dora handling
- Push/fold decisions
- Genbutsu and suji
- Match situation awareness

### Stage 4 — Advanced Player

The player is comfortable with fundamentals and wants deeper strategic analysis.

They need:

- Expected-value comparisons
- Probabilistic hand development
- Advanced defensive reading
- Multiple-threat evaluation
- Late-game decision-making
- Placement optimization
- Situational calling strategies
- Deeper opponent-model considerations

### Stage 5 — Competitive Player

The player seeks long-term performance improvement.

They need:

- Detailed game review
- Personal weakness identification
- Advanced drills
- Competitive match history
- Longitudinal performance analysis
- Study collections
- Repeated review of difficult decisions
- Competitive practice and eventually ranked play

These stages should influence suggested content and difficulty, but advanced material must never be permanently locked behind mandatory lesson completion.

---

# 6. Full Interactive Curriculum

The existing 11 introductory lessons should serve as a foundation, not the final curriculum.

Audit each existing lesson for factual correctness, clarity, interactivity, and suitability for a complete beginner.

Expand the curriculum into a structured program organized by learning domains.

## 6.1 Domain A — Mahjong Fundamentals

Include lessons and exercises covering:

1. Understanding the objective of mahjong
2. Recognizing the three numbered suits
3. Understanding winds and dragons
4. Terminals and simple tiles
5. Identifying sequences, triplets, and pairs
6. Standard winning-hand structure
7. Special winning-hand structures
8. The four-player table
9. Drawing and discarding
10. The discard pond
11. Seat winds and round winds
12. Reading the table interface
13. The flow of a complete hand
14. Completing a first winning hand

Use visual interaction whenever possible.

A user should be able to manipulate tiles rather than simply reading explanatory paragraphs.

## 6.2 Domain B — Calls and Hand Construction

Include:

1. Chi
2. Pon
3. Kan
4. Concealed versus open melds
5. Which calls open the hand
6. Calling restrictions
7. The costs of opening a hand
8. Improving a hand using calls
9. When to decline a call
10. Hand flexibility
11. Basic yaku planning

Pay careful attention to exceptions.

For example, a concealed kan must not be incorrectly described as opening the hand in the same manner as chi or pon.

## 6.3 Domain C — Shanten and Tile Efficiency

Include:

1. What shanten means
2. Recognizing tenpai
3. Counting shanten
4. Effective tiles
5. Ukeire
6. Strong and weak shapes
7. Ryanmen and other waits
8. Incomplete sequences
9. Isolated tiles
10. Five-block theory
11. Overlapping shapes
12. Pair management
13. Terminal and honor management
14. Discard comparison
15. Speed versus value
16. Improving acceptance while retaining yaku potential
17. Complex multi-shape exercises

This is one of the most important instructional domains.

The user should repeatedly practice making discard decisions and immediately see how those decisions influence shanten and ukeire.

## 6.4 Domain D — Yaku and Hand Value

Include:

- Requirements for a valid winning hand
- The difference between yaku and dora
- Common one-han yaku
- Common two-han yaku
- More advanced yaku
- Closed-hand restrictions
- Open-hand reductions
- Dora and red dora
- Uradora
- Yakuman
- Combining yaku
- Hand-building toward specific yaku
- Recognizing invalid winning hands

Build an interactive yaku reference.

Each entry should include:

- Name
- Plain-language explanation
- Tile illustration
- Requirements
- Open or closed restrictions
- Han value
- Valid example
- Invalid counterexample
- Common beginner mistake
- Related drill

All values must be sourced from the selected ruleset.

## 6.5 Domain E — Riichi and Winning Decisions

Include:

- Tenpai identification
- Riichi eligibility
- Riichi declaration
- Riichi sticks
- Ippatsu
- Double riichi
- Tsumo versus ron
- Furiten
- Temporary furiten
- Riichi furiten
- Wait quality
- Live tile counts
- Remaining wall considerations
- Riichi versus dama
- Riichi risk
- Situational riichi decisions

## 6.6 Domain F — Scoring

Include:

- Han
- Fu
- Base points
- Limit hands
- Dealer versus non-dealer scoring
- Ron payments
- Tsumo payments
- Honba
- Riichi sticks
- Score breakdowns
- Final placement
- Uma and oka
- Round transitions
- Match termination
- Ruleset-specific scoring variations

Develop interactive scoring exercises in which users inspect a hand and predict its value.

## 6.7 Domain G — Defense

Include:

- Why defensive play matters
- Recognizing threats
- Reading discards
- Genbutsu
- Suji
- Kabe
- Visible tile accounting
- Dangerous tile identification
- Push/fold decisions
- Late-round defense
- Defensive priorities
- Playing against multiple riichi declarations
- Defense versus open hands
- Risk management based on placement

Every safety claim must state its assumptions.

Distinguish tiles that are provably safe against a particular opponent from tiles that are merely estimated to be relatively safer.

## 6.8 Domain H — Advanced Strategy

Include:

- Expected value
- Hand-value versus speed tradeoffs
- Riichi versus dama calculations
- Advanced calling
- Placement strategy
- Late-game strategy
- Dealer value
- Multi-opponent risk
- Honba and stick considerations
- Strategic flexibility
- Probabilistic reasoning
- Evaluating decisions independently of results

## 6.9 Domain I — Full-Game Understanding

Include:

- East-only matches
- East/South matches
- Dealer changes
- Round advancement
- Exhaustive draws
- Abortive draws
- Bust-out conditions
- Match settlement
- Placement considerations
- Complete match exercises

## 6.10 Curriculum implementation requirements

Every module should have:

- Stable identifier
- Version
- Learning objectives
- Prerequisites
- Estimated completion time
- Plain-language explanation
- Visual examples
- Interactive activity
- Immediate corrective feedback
- Completion criteria
- Related practice exercises
- Review eligibility
- Ruleset compatibility

Represent curriculum content as structured, testable data where practical.

Avoid hardcoding an increasingly large educational program into one monolithic TypeScript controller.

---

# 7. Interactive Lesson Engine

Create or improve a reusable lesson framework.

Lessons should support several interaction types:

- Tile identification
- Tile matching
- Sorting
- Constructing a hand
- Selecting a discard
- Selecting a call
- Predicting a wait
- Selecting possible winning tiles
- Identifying a yaku
- Calculating hand value
- Evaluating defensive safety
- Choosing between strategic alternatives
- Completing a seeded gameplay scenario

Reuse the existing deterministic game engine for genuine gameplay scenarios.

Do not fake legal game states merely to make an exercise easier.

## 7.1 Lesson state machine

The lesson framework must support:

- Initialization
- Active step
- User action
- Validation
- Corrective feedback
- Retry
- Completion
- Resume
- Restart
- Version migration

Wrong answers should not automatically advance the lesson.

Feedback should explain the mistake and allow the learner to try again.

## 7.2 Instructional quality

Prefer this instructional pattern:

1. Introduce one concept.
2. Demonstrate it visually.
3. Ask the learner to apply it.
4. Provide meaningful feedback.
5. Introduce a slightly different example.
6. Verify understanding.
7. Reintroduce the concept in subsequent practice.

Avoid excessive passive reading.

A beginner should interact with the game frequently.

## 7.3 Lesson testing

Automate checks for:

- Legal scenario states
- Correct answers
- Incorrect-answer handling
- Valid explanations
- Successful completion
- Resume behavior
- Ruleset compatibility
- Deterministic replay
- Progress persistence

Have all instructional claims reviewed against appropriate rules references.

---

# 8. Comprehensive Practice and Puzzle System

Develop a dedicated Practice area inspired by the strengths of Lichess puzzles, but specialized for mahjong.

## 8.1 Practice categories

At minimum:

| Practice category | Primary objective |
|---|---|
| Tile Recognition | Identify tiles accurately |
| Winning Shapes | Recognize legal hand structures |
| Shanten | Count distance to tenpai |
| Tile Efficiency | Choose efficient discards |
| Ukeire | Identify improving tiles |
| Wait Reading | Find winning tiles |
| Yaku Recognition | Identify valid scoring patterns |
| Scoring | Calculate hand values |
| Calling | Evaluate legal and useful calls |
| Riichi Decisions | Compare riichi and dama |
| Defense | Evaluate discard safety |
| Push/Fold | Balance offense and risk |
| Situational Strategy | Incorporate score and round context |
| Full-Hand Challenges | Apply several concepts together |

Each category must support progressively harder exercises.

## 8.2 Puzzle specification

Every puzzle should contain:

- Unique ID
- Ruleset and version
- Skill category
- Difficulty
- Position or scenario seed
- Public information presented
- Legal actions
- Expected answer or acceptable-answer set
- Explanation
- Evaluation method
- Source
- Validation status
- Version

Some strategic questions may have several acceptable answers.

Do not force an artificial single correct answer when the position is genuinely close or context-dependent.

## 8.3 Puzzle generation

Support both curated and automatically generated puzzles.

Potential sources:

- Handcrafted introductory examples
- Deterministically generated positions
- Real completed games
- Repeated user mistakes
- Strategically interesting decisions identified during analysis

Create a validation pipeline before exposing generated puzzles.

A puzzle must not be published merely because an AI model generated it.

## 8.4 Practice feedback

The interface should show:

- Whether the answer was correct
- Why
- The relevant tile or hand structure
- Alternative answers where appropriate
- Relevant numerical information
- A concise instructional explanation
- A way to practice the same concept again

Offer optional deeper explanations without overwhelming beginners.

---

# 9. Post-Game Analysis — Highest Priority Differentiator

Develop a comprehensive game-review system.

This should become a flagship feature of OpenMahjong.

After completing a match, the player should be able to open a review and inspect their decisions.

## 9.1 Game review interface

Include:

- Hand-by-hand navigation
- Decision-by-decision navigation
- Full table replay
- Pause and step controls
- Discard history
- Meld history
- Round context
- Player scores
- Dora indicators
- Visible tile counts
- Shanten history
- Ukeire history
- Key decision markers
- Strategic explanation panels
- Training recommendations

The player must be able to inspect the table exactly as it appeared when a decision was made.

## 9.2 Information integrity

This requirement is essential.

**Retrospective analysis must never use future or hidden information as if it was available to the player at decision time.**

Implement explicit information-visibility modes:

### Player-perspective analysis

Only information the player legitimately knew at the decision point.

This should be the default.

### Full-information replay

Reveals otherwise hidden information from the finished game for educational inspection.

This must be clearly labeled.

### Statistical analysis

Uses estimates about unknown information based on public state, assumptions, and models.

These estimates must never be presented as certainty.

Distinguish all three modes in the UI and internal data model.

## 9.3 Decision evaluation

Analyze:

- Shanten after each possible discard
- Ukeire differences
- Wait quality
- Visible tile availability
- Yaku potential
- Dora retention
- Expected hand value
- Riichi eligibility
- Defensive risk
- Call value
- Position within the round and match

When reliable evaluation is available, compare the player's choice with alternatives.

Explain the tradeoff.

## 9.4 Mistake classification

Develop a structured taxonomy.

Potential classifications:

- Inefficient discard
- Lost ukeire
- Missed tenpai
- Missed winning action
- Poor wait selection
- Missed yaku
- Unnecessary call
- Missed useful call
- Poor riichi timing
- Defensive error
- Excessive aggression
- Excessive folding
- Scoring misunderstanding
- Match-situation error

Do not classify a decision as a mistake merely because the resulting hand was lost.

A probabilistically correct decision can produce an unfavorable outcome.

## 9.5 Decision severity

Use calibrated categories such as:

- Strong decision
- Reasonable alternative
- Minor inefficiency
- Meaningful missed opportunity
- Significant strategic error

Only assign numerical grades or severe labels when supported by validated analysis.

Avoid pretending that the engine knows an objectively optimal discard when it only possesses a heuristic ranking.

## 9.6 Learn from mistakes

After reviewing a game, allow the player to:

1. Revisit a questionable decision.
2. Try another action.
3. See how the evaluation changes.
4. Read an explanation.
5. Save the position to a practice collection.
6. Add it to their personal training queue.

This should directly connect analysis with the practice system.

---

# 10. Strategic Analysis Engine

The existing AI opponent and coaching system should not automatically be treated as a sufficiently strong analysis engine.

Evaluate whether an additional analysis layer is required.

## 10.1 Analysis levels

Design at least three levels.

### Level A — Exact rules analysis

Compute information that can be established deterministically:

- Legal actions
- Shanten
- Valid winning tiles
- Ruleset-based scoring
- Furiten status
- Exposed tile counts
- Legal call options

These results should be exact, subject to validated implementation.

### Level B — Heuristic strategic analysis

Evaluate:

- Ukeire
- Hand-value potential
- Wait quality
- Defensive danger
- Opponent threats
- Riichi timing
- Call tradeoffs

Clearly mark these as heuristic assessments.

### Level C — Advanced probabilistic analysis

Research and evaluate approaches such as:

- Monte Carlo sampling
- Determinization consistent with public information
- Rollout simulations
- Expected-value comparisons
- Opponent behavior modeling
- Probability-of-winning estimates
- Expected placement outcomes

Do not implement sophisticated numerical modeling solely because it sounds impressive.

Validate whether it materially improves decision quality and educational usefulness.

## 10.2 Analysis methodology

For advanced evaluation:

- Preserve public-information boundaries.
- Sample hidden states consistent with visible information.
- Use documented assumptions.
- Compare actions under comparable conditions.
- Estimate uncertainty.
- Track sample sizes.
- Make computation interruptible.
- Separate UI rendering from heavy computation.
- Cache repeated analyses when appropriate.

Where feasible, test estimates for calibration using held-out simulated positions.

## 10.3 Coach architecture

Avoid maintaining several contradictory recommendation algorithms.

Separate:

1. Rules engine
2. Position analysis
3. Decision evaluation
4. Explanation generation
5. Educational presentation

The opponent AI may use a lightweight version of the evaluator.

The analysis system may use a deeper version.

The educational system should explain the analysis and disclose its limitations.

## 10.4 Explainable recommendations

Every recommendation should contain structured evidence.

Suggested fields:

- Candidate action
- Shanten
- Ukeire
- Waits
- Hand-value considerations
- Offensive opportunity
- Defensive risk
- Relevant rules
- Confidence or uncertainty
- Reason codes
- Explanation text
- Analysis version

Generate educational explanations from verified structured facts.

Do not rely on a language model to invent legal actions, numerical evaluations, or mahjong rules.

An optional language model may translate validated information into more natural explanations, but the underlying rules and calculations must remain authoritative.

## 10.5 Performance

Establish mobile performance benchmarks before introducing computationally expensive analysis.

Use background workers, chunked computation, or server-side analysis where justified.

Keep the gameplay interface responsive.

Do not make the player wait for deep analysis before performing an ordinary legal action.

---

# 11. Personalized Training and Learning Progress

The training platform should adapt to the user's demonstrated ability.

## 11.1 Skill model

Define a versioned skill taxonomy.

Track proficiency separately for:

- Tile recognition
- Hand construction
- Shanten
- Ukeire
- Wait reading
- Yaku recognition
- Scoring
- Calling
- Riichi
- Defense
- Push/fold
- Situational decisions

Avoid reducing all performance to one opaque learning score.

## 11.2 Evidence of ability

Use evidence from:

- Tutorial completion
- Practice responses
- Practice response times
- Repeated attempts
- Guided gameplay
- Independent gameplay
- Reviewed decisions
- Repeated mistakes

Separate assisted from unassisted performance.

A player completing a game with extensive hints should not receive the same mastery assessment as someone making those decisions independently.

## 11.3 Personalized recommendations

Generate useful recommendations such as:

- Practice reading waits.
- Review missed yaku.
- Work on shanten efficiency.
- Revisit defense against riichi.
- Practice scoring dealer hands.

Recommendations must connect to actual evidence, not arbitrary engagement prompts.

## 11.4 Spaced repetition

Introduce an adaptive review system.

Previously learned concepts should return when the player is at risk of forgetting them.

Track:

- Last practiced
- Last successful attempt
- Recent error rate
- Estimated proficiency
- Next recommended review
- Related concepts

Begin with a simple, transparent scheduling model and improve it based on evidence.

Avoid building an unnecessarily complicated learning algorithm before confirming its usefulness.

## 11.5 Progress dashboard

Provide:

- Curriculum progress
- Skill mastery estimates
- Recent practice
- Practice accuracy trends
- Concepts needing attention
- Independent-play progress
- Suggested next lesson
- Suggested drills

The dashboard should be informative, not decorative.

Use charts only where they communicate meaningful trends.

---

# 12. Game Statistics and Player Insights

Expand the existing statistics infrastructure.

Current basic game statistics should remain available, but additional insights are needed.

## 12.1 Match statistics

Potential metrics:

- Games played
- Average placement
- Placement distribution
- Average final score
- Hands played
- Win rate
- Tsumo rate
- Ron rate
- Deal-in rate
- Riichi rate
- Call rate
- Average hand value
- Average winning-hand value

Define exact numerator, denominator, inclusion criteria, and applicable ruleset for every metric.

## 12.2 Decision-quality statistics

Potential metrics:

- Shanten-optimal discard frequency
- Ukeire opportunity loss
- Wait-reading accuracy
- Defensive decision accuracy
- Scoring accuracy
- Call-decision performance
- Riichi decision quality
- Practice-to-game transfer

Do not call a metric "optimal play" unless the evaluator can substantiate that designation.

## 12.3 Statistical integrity

Distinguish:

- Self-play versus AI
- Rated versus unrated games
- Assisted versus independent games
- Different rulesets
- Different AI strengths
- Different game lengths
- Different analysis versions

Do not aggregate incompatible data into misleading trends.

## 12.4 Presentation

Make insights understandable to nontechnical users.

Explain why a statistic matters and how the player might improve it.

Avoid excessive numerical clutter.

---

# 13. User Experience and Design System

Preserve OpenMahjong's existing minimalist design direction.

The interface should feel deliberate, refined, practical, and focused on the game.

Do not introduce anime characters, casino styling, excessive badges, or unrelated gamification merely to increase engagement.

## 13.1 Navigation architecture

Evaluate a structure centered on:

- Play
- Learn
- Practice
- Analyze
- Profile/Progress

These are conceptual destinations, not necessarily five permanent navigation buttons.

Determine the best mobile and desktop information architecture through research and usability testing.

## 13.2 Home screen

The home screen should immediately communicate the two primary opportunities:

- Play mahjong
- Learn mahjong

New players should easily locate the beginner pathway.

Returning players should be able to resume a game, continue a lesson, or practice a recommended skill.

Do not transform the home screen into a cluttered dashboard.

## 13.3 Table interaction

Preserve:

- Legible tiles
- Intuitive discard selection
- Reliable call controls
- Useful inspection controls
- Smooth animations
- Clear score and round information
- Responsive layout
- Reduced-motion support

Evaluate whether novice assistance is discoverable without making the table visually overwhelming.

## 13.4 Learning presentation

Prefer:

- Visual tile demonstrations
- Short instructional segments
- Interactive examples
- Contextual explanations
- Progressive disclosure
- Consistent terminology
- Immediate feedback

Avoid long walls of text during gameplay.

Longer explanations may be provided in optional reference panels.

## 13.5 Mobile-first standards

Ensure:

- Practical touch targets
- Visible interaction feedback
- No accidental discard from ordinary inspection
- Graceful behavior across phone aspect ratios
- Stable layout when the keyboard or browser chrome changes
- Readable information without relying on hover
- No clipped dialogs or inaccessible controls

Retain the established tile-hit-area and Focus Frame behavior unless a tested improvement justifies a change.

## 13.6 Animation

Animations should express actual game events.

They must not imply rules actions that did not occur.

Respect reduced-motion preferences.

Ensure animations do not delay urgent player decisions or hide important information.

---

# 14. Accessibility

Perform a WCAG 2.2 AA-oriented audit and address identified problems.

At minimum:

- Keyboard operation
- Focus order
- Visible focus states
- Screen-reader labels
- Non-color state indicators
- Adequate contrast
- Reduced motion
- Touch-target usability
- Accessible dialog behavior
- Clear error feedback
- Accessible forms and settings
- Text scaling where practical

Mahjong's tile density requires particular attention.

Develop an accessible way to inspect tile identities, hand composition, discards, and important game actions.

Investigate keyboard alternatives for selecting and discarding tiles.

Never make critical interactions dependent exclusively on color, sound, animation, or long-press gestures.

---

# 15. Technical Architecture and Maintainability

Maintain the modular TypeScript structure unless the audit identifies a compelling reason to change it.

## 15.1 Responsibility boundaries

The architecture should preserve clear ownership:

**Engine:** Deterministic rules and legal game state.

**AI/Analysis:** Evaluations, opponent decisions, and probabilistic models.

**Coach:** Structured instructional interpretation of valid analysis.

**Education:** Lessons, exercises, curriculum, and progress.

**Web:** Rendering, interaction, and presentation.

**Server:** Accounts, persistence, APIs, and eventually authoritative multiplayer.

Consider introducing focused packages or modules for training, replay, and analysis if doing so improves long-term maintainability.

Do not introduce packages purely for organizational appearance.

## 15.2 Event and replay architecture

Review the existing event-log model.

Define versioned event payload types and stable schemas.

Ensure:

- Deterministic reconstruction
- Reliable resume
- Backward compatibility
- Event ordering
- Replay validation
- Support for future multiplayer
- Analysis checkpoints
- Efficient navigation between positions

Investigate whether replaying the entire game from the beginning on every human action is still appropriate as the application grows.

Consider incremental state advancement, snapshots, or checkpoints where beneficial.

Benchmark before changing the architecture.

## 15.3 Data schemas

Develop versioned structures for:

- Game records
- Replay records
- Analysis results
- Lessons
- Exercises
- Practice attempts
- Skill progress
- Review schedules
- User settings
- Rulesets

Design migrations and backward compatibility deliberately.

## 15.4 API architecture

Establish consistent:

- Request validation
- Response schemas
- Authentication
- Authorization
- Error handling
- Pagination
- Rate limits
- Idempotency
- API versioning where necessary

Do not expose implementation-specific errors or sensitive information to users.

## 15.5 Performance

Measure:

- Initial loading
- Time to interactive
- Game startup
- Tile rendering
- Animation frame rate
- AI decision latency
- Analysis latency
- Replay performance
- Memory use
- Database query times
- Bundle size

Develop a representative device benchmark suite.

Preserve excellent performance on ordinary mobile devices.

---

# 16. Mahjong Variant Architecture

The long-term platform should support multiple major variants, beginning with riichi.

Potential future variants:

1. Japanese riichi
2. Hong Kong mahjong
3. Chinese Official / MCR
4. American mahjong

However, do not rush to implement all variants at once.

**Build riichi into an excellent product before expanding the platform.**

## 16.1 Audit the existing variant seam

Determine which game behaviors are currently hardcoded to riichi.

Inspect:

- Tile sets
- Hand structure
- Meld rules
- Turn flow
- Calls
- Scoring
- Draw handling
- Match structure
- Special actions
- Settlement
- Educational terminology

Document the degree of separation needed.

## 16.2 Proposed ruleset interface

Research and design a versioned ruleset contract that can express genuinely different games.

Do not assume every variant can share riichi's four-meld-and-a-pair scoring model or identical state machine.

Determine which mechanics should be shared and which require variant-specific implementations.

## 16.3 Training compatibility

Every learning module must specify its supported rulesets.

For shared concepts, reuse educational material where appropriate.

For variant-specific concepts, provide dedicated curricula.

Never show riichi-specific scoring advice while a user is playing a different ruleset.

## 16.4 American mahjong

Research American mahjong separately.

Account for:

- Charleston exchanges
- Jokers
- Annual winning-hand cards
- Card-specific hand eligibility
- Different scoring conventions
- Relevant licensing requirements

Do not reproduce proprietary annual-card content without an appropriate license or authorization.

---

# 17. Future Multiplayer and Competitive Systems

Multiplayer is an important long-term objective, but its implementation should not displace the foundational educational work.

Design for future multiplayer now without requiring immediate delivery.

## 17.1 Server-authoritative gameplay

Online matches must use an authoritative game coordinator.

The server must own or validate:

- Deck/wall generation
- Hidden information
- Legal actions
- Turn order
- Timers
- Calls
- Scoring
- Match completion
- Official results

Clients must receive only authorized information.

Never trust client-submitted match outcomes for ratings.

## 17.2 Multiplayer capabilities

Plan for:

- Private rooms
- Invite links
- Public matchmaking
- Friends
- Casual games
- Rated games
- Spectating
- Reconnection
- Disconnect handling
- Game abandonment
- Reporting and moderation

## 17.3 Competitive ratings

Research an appropriate multiplayer rating system, such as Glicko-2 or another justified multiplayer model.

Evaluate its treatment of four-player placement, uncertainty, and inactive players.

Do not copy chess rating calculations without evaluating their suitability for mahjong.

## 17.4 Competitive fairness

Develop defenses against:

- Client-side cheating
- Hidden-information leakage
- Tampered results
- Duplicate actions
- Unauthorized requests
- Coordinated collusion
- Automated abuse

The exact anti-cheat requirements should be developed before launching rated play.

## 17.5 Community features

Potential future additions:

- Public studies
- Shareable hands
- Annotated game reviews
- User-created practice collections
- Community lessons
- Training groups
- Tournaments
- Player profiles

Prioritize safe, useful educational collaboration over social features that create major moderation burdens.

---

# 18. Content Quality and Rules Accuracy

Educational trust is a central product requirement.

Establish a formal content verification process.

## 18.1 Every rules-based explanation must be testable

Where possible, educational content should reference:

- A specific ruleset
- A specific rule
- A machine-verifiable position
- An expected legal outcome
- A validated scoring result

## 18.2 Content review

Check for:

- Incorrect terminology
- Missing exceptions
- Oversimplified rules
- Inconsistent scoring
- Ambiguous tile notation
- Incorrect strategic absolutes
- Contradictory lessons
- Outdated information

## 18.3 Rules versus strategy

Clearly distinguish:

**Rule:** A deterministic requirement of the game.

**Principle:** A generally useful strategy.

**Heuristic:** An approximate method of evaluating a position.

**Probability:** An estimate dependent on available information and assumptions.

**Opinion:** A strategic preference that may vary by player or situation.

Do not present all five as equivalent facts.

## 18.4 External content

Maintain references to authoritative material.

Respect copyright, attribution, and applicable license restrictions.

Original explanations and examples should be preferred wherever practical.

---

# 19. Privacy, Security, and Trust

Preserve guest access and provide appropriate controls for stored account information.

## 19.1 Guest users

Users must remain able to play and learn without an account.

Local data should include, as appropriate:

- Settings
- Game progress
- Tutorial progress
- Practice progress
- Saved games

Clearly explain that browser-only storage may be lost when site data is removed.

## 19.2 Account users

Provide reliable synchronization for:

- Completed games
- Statistics
- Learning progress
- Practice history
- Saved studies
- Settings

Define conflict resolution and offline synchronization behavior.

## 19.3 Data minimization

Collect only information required for legitimate application functionality.

Do not expose private learning data publicly without authorization.

Keep user deletion and privacy documentation accurate.

## 19.4 Security controls

Evaluate:

- CSRF
- XSS
- Authentication and session security
- Authorization
- Input validation
- Database security
- Resource exhaustion
- API abuse
- Dependency vulnerabilities
- Secure deployment configuration

Protect against user-supplied replay data or lesson content causing excessive computation or unsafe rendering.

---

# 20. Testing and Quality Assurance

Expand the existing test suite, preserving current successful tests.

## 20.1 Unit tests

Cover:

- Tile logic
- Rules
- Scoring
- Hand analysis
- AI evaluation
- Coaching
- Curriculum
- Practice validation
- Progress calculation

## 20.2 Property-based tests

Test invariants such as:

- Tile conservation
- Legal game state
- Score conservation where applicable
- Deterministic replay
- Ruleset-consistent scoring
- No impossible tile counts
- No unauthorized hidden-information access

## 20.3 Differential testing

Where feasible, compare independent hand analyzers or scoring implementations against verified fixtures.

Investigate disagreements rather than automatically choosing one source.

## 20.4 Integration tests

Cover:

- Complete games
- Game records
- Lessons
- Practice completion
- Analysis generation
- Resume
- Authentication
- Data synchronization

## 20.5 End-to-end tests

Test real user workflows through the application.

Include a complete beginner pathway:

1. Visit the website.
2. Start a lesson without an account.
3. Learn basic tiles.
4. Complete introductory exercises.
5. Play a guided game.
6. Finish the game.
7. Open game review.
8. Practice an identified weakness.
9. Return to gameplay.
10. Confirm progress is preserved.

## 20.6 Browser and visual regression tests

Capture primary screens across representative viewports.

Check:

- Overflow
- Clipping
- Layout shifts
- Tile readability
- Call prompt placement
- Focus Frame behavior
- Navigation
- Responsive scaling

## 20.7 CI requirements

Every PR should run the relevant:

- Type checks
- Unit tests
- Integration tests
- Builds
- Linting and formatting checks, if adopted
- Security checks
- Accessibility checks, where automated
- Browser smoke tests, where available

Maintain an appropriate balance between fast PR checks and expensive nightly or scheduled testing.

---

# 21. Production Reliability and Operational Requirements

Audit the existing Railway deployment and related hosting configuration.

Develop recommendations for:

- Environment configuration
- Staging versus production
- Database migrations
- Backup and recovery
- Health checks
- Observability
- Error reporting
- Deployment rollback
- Performance monitoring
- Resource limits
- Service-cost monitoring

Ensure infrastructure choices are appropriate for a free-to-play, cost-conscious platform.

Avoid adopting expensive services merely to support speculative features.

Prefer the simplest maintainable system that can satisfy actual requirements.

---

# 22. Documentation and Open-Source Readiness

The repository should be understandable to future contributors.

Create or update:

- Product vision
- Architecture overview
- Development setup
- Ruleset reference
- Engine API documentation
- Replay format
- Coaching architecture
- Analysis methodology
- Educational content authoring
- Testing instructions
- Deployment documentation
- Contributor guide
- Roadmap
- Security policy
- Known limitations

## 22.1 Resolve documentation drift

Existing historical design briefs may contain requirements that have since been superseded.

Audit contradictions involving:

- Accounts
- Advertising
- Visual themes
- Feature scope
- Variant support
- Coaching
- Offline behavior
- Deployment architecture

Preserve historical documents as historical records where useful.

Establish a single authoritative document for current decisions.

Do not silently rewrite historical records to make previous decisions appear different.

---

# 23. Implementation Roadmap

The following sequence is the intended default.

Adjust ordering when audit findings reveal critical dependencies or correctness problems.

## Phase 0 — Baseline and Audit

**Objective:** Establish an accurate understanding of the existing system.

Deliver:

- Repository inventory
- Production UX review
- Rules-compliance matrix
- Security audit
- Technical-debt inventory
- Educational gap analysis
- Prioritized roadmap
- Reproducible baseline test results

**Exit criterion:** Every major subsystem has documented status, known risks, and an actionable improvement plan.

## Phase 1 — Correctness and Reliability

**Objective:** Ensure the core foundation can support deeper education and analysis.

Implement:

- Critical rules fixes
- Scoring corrections
- Educational content corrections
- Replay validation
- Important security fixes
- Major accessibility defects
- Documentation inconsistencies
- Necessary regression tests

**Exit criterion:** Critical rules and core workflows are correct, stable, and protected by tests.

## Phase 2 — Architecture Foundations

**Objective:** Prepare the codebase for expansion without unnecessary rewrites.

Implement:

- Versioned replay schemas
- Typed event contracts
- Analysis interfaces
- Lesson content structure
- Practice data model
- Skill taxonomy
- Ruleset configuration improvements
- Targeted modularization

**Exit criterion:** New educational and analytical capabilities can be added without further enlargement of existing monolithic modules.

## Phase 3 — Beginner Learning Experience

**Objective:** Make the application exceptional for first-time players.

Implement:

- Improved beginner onboarding
- Expanded introductory lessons
- Stronger interactive feedback
- Lessons aligned with actual gameplay
- Beginner-friendly rules references
- Improved guided play
- Lesson progress and resume

**Exit criterion:** A new player can learn fundamental mechanics and complete a guided game without external resources.

## Phase 4 — Practice System

**Objective:** Turn knowledge into repeatable skill acquisition.

Implement:

- Practice interface
- Exercise schema
- Tile recognition
- Shanten drills
- Ukeire exercises
- Wait reading
- Yaku recognition
- Scoring exercises
- Defensive exercises
- Practice statistics

**Exit criterion:** Users can independently practice and receive useful feedback on the major beginner and intermediate skills.

## Phase 5 — Post-Game Review

**Objective:** Connect gameplay with learning.

Implement:

- Decision-level replay
- Player-perspective reconstruction
- Key decision markers
- Shanten and ukeire analysis
- Alternative action comparison
- Mistake classification
- Save-to-practice functionality

**Exit criterion:** A player can finish a game, understand important decisions, and practice a related concept.

## Phase 6 — Deeper Coaching and Analysis

**Objective:** Improve the quality and reliability of strategic recommendations.

Implement:

- Advanced evaluation architecture
- Better defense modeling
- Call evaluation
- Riichi evaluation
- Situational decision analysis
- Probabilistic analysis where justified
- Confidence/uncertainty handling
- Validated explanations

**Exit criterion:** Analytical claims are supported by a documented methodology, evaluated for accuracy, and clearly communicated.

## Phase 7 — Personalized Improvement

**Objective:** Help players systematically address weaknesses.

Implement:

- Skill tracking
- Recommended drills
- Adaptive difficulty
- Spaced review
- Performance insights
- Learning dashboard
- Practice derived from game reviews

**Exit criterion:** A player receives useful, evidence-based recommendations based on their actual performance.

## Phase 8 — Advanced Curriculum

**Objective:** Provide a credible pathway to strong competitive play.

Implement:

- Advanced strategy lessons
- Defensive strategy modules
- Expected-value exercises
- Situational drills
- Advanced study tools
- Multi-concept challenges

**Exit criterion:** Intermediate players have a clear, substantive pathway to advanced decision-making.

## Phase 9 — Multiplayer Foundation

**Objective:** Support trustworthy online gameplay.

Implement:

- Server-authoritative engine coordination
- Real-time transport
- Private games
- Reconnection
- Match persistence
- Fair-information boundaries
- Competitive integrity tests

**Exit criterion:** Real players can complete reliable online games without trusting client-reported outcomes.

## Phase 10 — Competitive and Community Features

**Objective:** Support sustained engagement and competitive improvement.

Implement as justified:

- Matchmaking
- Ratings
- Tournaments
- Friends
- Studies
- Shareable reviews
- Community-created training content

**Exit criterion:** The platform supports a healthy competitive environment without undermining its educational quality.

## Phase 11 — Additional Variants

**Objective:** Expand access to other established mahjong traditions.

Begin with the variant offering the strongest combination of user demand, rules clarity, and technical feasibility.

Develop dedicated rules and educational coverage rather than forcing variants into riichi-specific assumptions.

---

# 24. Pull Request Strategy

Do not deliver the roadmap through one PR.

Create small, coherent, reviewable implementation units.

A suggested initial PR sequence:

| PR | Scope |
|---|---|
| 1 | Audit reports and prioritized roadmap |
| 2 | Critical correctness, security, and content fixes |
| 3 | Typed replay/event contracts and regression coverage |
| 4 | Education content architecture and reusable lesson framework |
| 5 | Beginner curriculum expansion |
| 6 | Practice system foundation |
| 7 | Shanten, ukeire, and wait-reading drills |
| 8 | Yaku and scoring drills |
| 9 | Defense and decision-making drills |
| 10 | Post-game review interface |
| 11 | Decision analysis and mistake classification |
| 12 | Replay-to-practice integration |
| 13 | Skill tracking and adaptive practice |
| 14 | Player insights dashboard |
| 15 | Advanced coaching evaluation |
| 16 | Advanced strategic curriculum |
| 17+ | Multiplayer and additional variants, following separate detailed plans |

Reorganize these units if the audit reveals better dependency boundaries.

Each PR must include:

1. Problem statement
2. Scope
3. Design rationale
4. Files modified
5. Behavioral changes
6. Tests added
7. Test results
8. Screenshots for UI changes
9. Accessibility considerations
10. Security considerations
11. Performance implications
12. Migration implications
13. Known limitations
14. Follow-up work

Use draft PRs when implementation is incomplete or awaiting review.

Do not mix unrelated feature work with broad refactoring.

---

# 25. Mandatory Acceptance Criteria

A phase is not complete merely because its implementation has been committed.

Apply these checks.

## Functional correctness

- Required behavior works.
- Game rules remain valid.
- Existing behavior has not unintentionally regressed.
- Relevant edge cases are tested.

## Educational correctness

- Explanations match the actual rules.
- Learning objectives are clear.
- Exercises provide accurate feedback.
- Strategic judgments are properly qualified.
- No false certainty is introduced.

## Accessibility

- Critical workflows remain usable.
- Interactive controls are reachable.
- Visual information is understandable.
- Reduced-motion preferences are honored.

## Performance

- Gameplay remains responsive.
- Analysis does not block critical interactions.
- Mobile performance remains acceptable.
- Significant regressions are addressed.

## Persistence

- Progress survives reload where intended.
- Resume works.
- Account synchronization is correct.
- Existing user records remain accessible.

## Maintainability

- Ownership boundaries remain clear.
- New code is reasonably modular.
- Tests protect important behavior.
- Documentation reflects the implementation.

## User experience

- The interface remains coherent.
- New users can understand primary actions.
- Important functionality is discoverable.
- Existing visual conventions are respected.

---

# 26. Product Success Measures

Develop a measurement plan using privacy-conscious aggregate or local-first methods.

Evaluate whether the platform actually helps users learn.

Potential outcomes include:

### Beginner success

- Percentage of learners who complete introductory lessons
- Percentage who complete a first guided game
- Time to first correct winning-hand identification
- Improvement in tile recognition
- Improvement in basic wait reading

### Practice effectiveness

- Improvement in repeated exercise performance
- Retention of previously learned concepts
- Reduction in repeated mistakes
- Transfer of practice skills into actual gameplay

### Analytical usefulness

- Percentage of completed games reviewed
- Number of decisions explored
- Number of positions saved for practice
- Improvement after targeted review

### Player development

- Improvement in independently evaluated decisions
- Skill-specific progress
- Reduction in repeated strategic errors
- Long-term engagement with useful practice

Avoid equating more time spent in the application with better learning.

Do not optimize the product around addictive engagement mechanics.

---

# 27. Major Risks and Mitigation

## Risk: The coach teaches its own weaknesses

**Mitigation:** Independently validate strategic evaluation, document uncertainty, and avoid describing heuristic recommendations as optimal.

## Risk: Outcome bias in game review

**Mitigation:** Evaluate decisions using information available at the time, not whether a later random event produced a win or loss.

## Risk: Incorrect instructional content

**Mitigation:** Ruleset-specific content review and machine-verified examples.

## Risk: Unmanageable feature complexity

**Mitigation:** Modular architecture, phased implementation, small PRs, and explicit acceptance criteria.

## Risk: Slow mobile performance

**Mitigation:** Benchmarking, computation budgets, caching, and asynchronous deep analysis.

## Risk: Historical replay incompatibility

**Mitigation:** Versioned data formats, migrations, and compatibility tests.

## Risk: Multiplayer cheating

**Mitigation:** Server-authoritative state and rigorous hidden-information enforcement.

## Risk: Variant architecture becomes a rewrite

**Mitigation:** Audit and design flexible ruleset boundaries before implementing additional variants.

## Risk: Poor beginner retention caused by complexity

**Mitigation:** Progressive disclosure, short interactive lessons, guided gameplay, and frequent practical exercises.

## Risk: Excessive operational cost

**Mitigation:** Measure actual usage, prefer local computation where appropriate, and defer expensive infrastructure until justified.

---

# 28. Required Documentation Artifacts

Maintain the following documents throughout implementation:

- `docs/product/vision.md`
- `docs/product/roadmap.md`
- `docs/product/success-metrics.md`
- `docs/architecture/overview.md`
- `docs/architecture/rulesets.md`
- `docs/architecture/replay.md`
- `docs/architecture/analysis.md`
- `docs/education/curriculum.md`
- `docs/education/lesson-framework.md`
- `docs/education/practice-system.md`
- `docs/education/progress-model.md`
- `docs/analysis/methodology.md`
- `docs/testing/strategy.md`
- `docs/audit/` for all initial audit reports

Adapt paths to established repository conventions if appropriate.

Documentation must describe implemented reality and clearly distinguish proposed future behavior.

---

# 29. Definition of the Finished Product

The ultimate OpenMahjong experience should work as follows:

A person hears about mahjong and visits OpenMahjong for the first time.

They do not need an account.

They choose to learn.

They receive an interactive introduction to the tiles and rules, with clear examples and opportunities to manipulate real tile arrangements.

They progress through structured lessons and begin to understand how winning hands are formed.

They start a guided game against AI opponents.

When faced with an unfamiliar decision, they can inspect the game state and receive an understandable explanation.

After finishing a game, they can replay their decisions.

The analysis distinguishes correct strategic decisions from favorable or unfavorable outcomes.

It identifies opportunities for improvement and explains why an alternative action might have been stronger.

The player can immediately practice the relevant concept.

As they improve, the platform gradually introduces more advanced material, more demanding exercises, and deeper strategic analysis.

Their learning progress follows them across sessions and, if they choose to create an account, across devices.

Eventually, they play independently, analyze their games, develop more sophisticated judgment, and participate in competitive multiplayer.

Throughout that entire journey, OpenMahjong remains approachable, transparent, performant, accessible, and free to play.

**The objective is not merely to teach users the rules of mahjong. It is to build an environment that helps them progressively master the game.**

---

# 30. Final Execution Instructions

Begin immediately with a comprehensive evaluation of the existing repository and production application.

Your first tasks are:

1. Read the full repository and relevant architectural documentation.
2. Inspect active branches and pending pull requests to avoid conflicts.
3. Run existing tests and builds.
4. Inspect the live website using an appropriate browser testing environment.
5. Create a rules-compliance and educational-content audit.
6. Identify critical correctness, accessibility, security, and performance issues.
7. Evaluate the current lesson and coaching architecture against this master brief.
8. Produce a dependency-ordered implementation roadmap.
9. Create an initial audit/documentation PR.
10. Begin the highest-priority non-blocked implementation work in subsequent PRs.

For each implementation phase:

- Inspect relevant existing code.
- Research domain-specific requirements.
- Establish acceptance criteria.
- Implement the feature.
- Add comprehensive tests.
- Execute the tests.
- Verify UI behavior where relevant.
- Update documentation.
- Create a draft pull request.
- Summarize results and remaining risks.
- Continue to the next independent task when appropriate.

Do not treat this document as permission to merge branches, deploy production changes, or make irreversible account or infrastructure modifications.

Do not sacrifice correctness for speed.

Do not fabricate verification evidence.

Do not rebuild existing working functionality without justification.

Do not prematurely expand into multiple variants or multiplayer at the expense of the learning platform.

Do not consider the assignment complete when an audit report has been written.

**Use this document as the governing long-term product and engineering specification, with the current repository and verified decisions serving as the source of truth for implementation details.**

The expected outcome is a comprehensive, evidence-based audit followed by a sequence of real, tested, documented improvements that steadily move OpenMahjong toward becoming the definitive open-source platform for learning, playing, analyzing, and mastering mahjong.
