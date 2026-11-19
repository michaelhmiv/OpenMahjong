/** Player-perspective review UI. The caller reconstructs the review once;
 * this view requests analysis only for the selected decision and caches it. */
import { tileTypeName, type Tile } from "@openmahjong/engine";
import { adviseVariantDiscard, compareDiscards, type DiscardAdvice, type TurnAdvice } from "@openmahjong/coach";
import { analyzeReviewDecision, analyzeReviewMoments, ReviewNavigator, type DecisionReview, type ReviewDecision, type ReviewMomentAnalysis } from "./review.js";
import { momentTexts } from "./moment-text.js";
import type { SkillId } from "./education/curriculum.js";
import { pluralS, tx } from "./i18n/index.js";

export interface ReviewUIOptions {
  readonly review: DecisionReview;
  readonly renderTile: (tile: Tile) => HTMLElement;
  readonly onBack: () => void;
  readonly onPractice: (position: ReviewDecision, skills: readonly SkillId[]) => void;
  readonly onInspectTable?: (position: ReviewDecision) => void;
  /** Board review supplies the surrounding navigation. */
  readonly embedded?: boolean;
}
export interface ReviewUIController {
  readonly currentPosition: ReviewDecision | null;
  goToDecision(index: number): void;
  destroy(): void;
}
const WINDS = ["East", "South", "West", "North"];
function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function shortName(tile: Tile): string {
  const type = tile.type;
  if (type >= 34) return tileTypeName(type);
  return `${tile.red ? tx("review.red", "Red") + " " : ""}${type < 9 ? `${type + 1}m` : type < 18 ? `${type - 8}p` : type < 27 ? `${type - 17}s` : [...WINDS, tx("review.white", "White"), tx("review.green", "Green"), tx("review.red", "Red")][type - 27]}`;
}
function roundLabel(position: ReviewDecision): string {
  return tx("review.v-0-1", `${WINDS[position.view.roundWind - 27] ?? tx("review.round", "Round")} ${position.view.kyoku}`, WINDS[position.view.roundWind - 27] ?? tx("review.round", "Round"), position.view.kyoku);
}
function skillsFor(position: ReviewDecision): readonly SkillId[] {
  // Calling drills are not yet in the validated catalog. Offer the
  // existing hand-building foundation rather than silently falling back
  // to an unrelated exercise under an advanced-drill label.
  if (position.kind === "call") return ["hand-construction", ...(position.context.canRon ? ["wait-reading" as const] : [])];
  return position.action.type === "discard" ? ["ukeire", "shanten", "wait-reading"] :
    position.action.type === "ankan" || position.action.type === "shouminkan" ? ["hand-construction", "yaku"] : ["yaku", "scoring"];
}

export function mountReview(container: HTMLElement, options: ReviewUIOptions): ReviewUIController {
  const navigator = new ReviewNavigator(options.review);
  const adviceCache = new Map<number, TurnAdvice | null>();
  const momentCache = new Map<number, ReviewMomentAnalysis>();
  const alternatives = new Map<number, number>();
  const variantCache = new Map<number, ReturnType<typeof adviseVariantDiscard>>();
  let destroyed = false;
  let showHelp = false;

  const button = (label: string, className: string, action: () => void, key?: string): HTMLButtonElement => {
    const element = node("button", className, label);
    element.type = "button";
    if (key) element.dataset["reviewControl"] = key;
    element.addEventListener("click", () => { if (!destroyed) action(); });
    return element;
  };
  const tile = (value: Tile): HTMLElement => {
    const element = options.renderTile(value);
    element.setAttribute("role", "img");
    element.setAttribute("aria-label", shortName(value));
    return element;
  };
  const tileList = (values: readonly Tile[], className = "hand"): HTMLElement => {
    const list = node("div", className);
    for (const value of values) list.append(tile(value));
    return list;
  };
  const getAdvice = (position: ReviewDecision): TurnAdvice | null => {
    if (!adviceCache.has(position.decisionIndex)) {
      const result = analyzeReviewDecision(position);
      adviceCache.set(position.decisionIndex, result.available ? result.advice : null);
    }
    return adviceCache.get(position.decisionIndex) ?? null;
  };
  const getMoments = (position: ReviewDecision): ReviewMomentAnalysis => {
    if (!momentCache.has(position.decisionIndex)) {
      momentCache.set(position.decisionIndex, analyzeReviewMoments(options.review, position));
    }
    return momentCache.get(position.decisionIndex)!;
  };
  const momentPanels = (position: ReviewDecision, analysis: Extract<ReviewMomentAnalysis, { available: true }>): HTMLElement => {
    const wrap = node("div", "review-moments");
    for (const text of momentTexts(analysis.grades, position)) {
      const card = node("section", "card moment-card");
      card.dataset["momentKind"] = text.kind;
      card.append(node("p", "card-label", text.title.toUpperCase()));
      card.append(node("h2", "", text.headline));
      card.append(node("p", "", text.choiceLine));
      const facts = node("div", "moment-facts");
      for (const fact of text.facts) facts.append(node("p", "", fact));
      card.append(facts);
      const terms = node("details", "review-facts");
      terms.append(node("summary", "", tx("review.the-moment-terms-in-plain-words", "The moment — terms in plain words")));
      for (const term of text.terms) terms.append(node("p", "", term));
      card.append(terms);
      wrap.append(card);
    }
    return wrap;
  };
  const publicTable = (position: ReviewDecision): HTMLElement => {
    const detail = node("details", "review-public-table");
    detail.append(node("summary", "", tx("review.table-at-this-decision", "Table at this decision")));
    const indicators = node("div", "review-indicators");
    indicators.append(node("p", "card-label", tx("review.dora-indicators", "DORA INDICATORS")), tileList(position.view.doraIndicators, "review-tiles"));
    if (!position.variant) detail.append(indicators);
    for (const player of position.view.players) {
      const section = node("section", "review-player");
      const name = `${WINDS[player.seatWind - 27] ?? tx("review.seat-0", `Seat ${player.seat + 1}`, player.seat + 1)}${player.seat === position.view.seat ? " " + tx("review.you", "· You") : ""}`;
      section.append(node("h3", "review-scoreline", tx("review.v-0-1-points-2", `${name} · ${player.score.toLocaleString("en-US")} points${player.riichi ? " " + tx("review.riichi", "· Riichi") : ""}`, name, player.score.toLocaleString("en-US"), player.riichi ? " " + tx("review.riichi", "· Riichi") : "")));
      section.append(node("p", "dim", tx("review.v-0-concealed-tiles", `${player.handCount} concealed tiles`, player.handCount)));
      section.append(node("p", "card-label", tx("review.discards", "DISCARDS")));
      const pond = node("div", "review-tiles");
      for (const discard of player.discards) {
        const wrap = node("span", discard.called ? "review-discard called" : "review-discard");
        wrap.append(tile(discard.tile));
        if (discard.called) wrap.append(node("span", "dim", tx("review.called", "Called")));
        if (discard.riichiDeclaration) wrap.append(node("span", "dim", tx("review.riichi-2", "Riichi")));
        pond.append(wrap);
      }
      if (!player.discards.length) pond.append(node("span", "dim", tx("review.no-discards-yet", "No discards yet")));
      section.append(pond);
      if (player.melds.length) {
        section.append(node("p", "card-label", tx("review.melds", "MELDS")));
        for (const meld of player.melds) {
          const group = node("div", "review-meld");
          group.append(node("span", "dim", meld.kind), tileList(meld.tiles, "review-tiles"));
          section.append(group);
        }
      }
      detail.append(section);
    }
    if (options.onInspectTable) detail.append(button(tx("review.inspect-table-position", "Inspect table position"), "primary", () => options.onInspectTable!(position)));
    return detail;
  };
  const optionRow = (position: ReviewDecision, option: DiscardAdvice, label: string, kind: "chosen" | "alternative"): HTMLElement => {
    const row = node("div", `option${kind === "alternative" ? " selected" : ""}`);
    row.setAttribute("role", "row");
    row.dataset["reviewOption"] = kind;
    const name = node("div", "option-name");
    name.setAttribute("role", "rowheader");
    const value = position.view.hand.find((value) => value.id === option.tileId)!;
    const labelText = node("span", "", label);
    labelText.append(node("br"), node("b", "", shortName(value)));
    name.append(tile(value), labelText);
    row.append(name);
    for (const [fact, value] of [["shanten", option.shantenAfter], ["unseen-copies", option.improvingTotal]] as const) {
      const figure = node("b", "", String(value));
      figure.setAttribute("role", "cell");
      figure.dataset["fact"] = fact;
      row.append(figure);
    }
    return row;
  };
  const analysisPanel = (position: ReviewDecision, advice: TurnAdvice): HTMLElement => {
    if (position.kind !== "turn" || position.action.type !== "discard") throw new Error("Discard position required");
    const panel = node("div", "review-analysis");
    const chosenTileId = position.action.tileId;
    const chosen = advice.options.find((option) => option.tileId === chosenTileId)!;
    const otherOptions = advice.options.filter((option) => option.tileId !== chosenTileId);
    const defaultAlternative = advice.recommendation.tileId !== chosenTileId ? advice.recommendation : otherOptions[0];
    const alternative = otherOptions.find((option) => option.tileId === alternatives.get(position.decisionIndex)) ?? defaultAlternative;
    const alternativeId = alternative?.tileId;
    const compare = node("div", "compare card");
    compare.setAttribute("role", "table");
    compare.setAttribute("aria-label", tx("review.discard-comparison", "Discard comparison"));
    const head = node("div", "compare-head");
    head.setAttribute("role", "row");
    for (const label of ["Discard", "Shanten", tx("review.unseen-copies", "Unseen copies*")]) {
      const cell = node("span", "", label); cell.setAttribute("role", "columnheader"); head.append(cell);
    }
    compare.append(head, optionRow(position, chosen, tx("review.your-discard", "Your discard"), "chosen"));
    if (alternative) compare.append(optionRow(position, alternative, "Alternative", "alternative"));
    const pickerLabel = node("label", "review-alternative-label", tx("review.try-another-discard", "Try another discard"));
    const picker = node("select", "review-alternative comparison-select");
    picker.setAttribute("aria-label", tx("review.compare-another-discard", "Compare another discard"));
    picker.dataset["reviewControl"] = "alternative";
    for (const candidate of otherOptions) {
      const value = position.view.hand.find((value) => value.id === candidate.tileId)!;
      const option = node("option", "", tx("review.v-0-copy-1", `${shortName(value)} · copy ${value.id % 4 + 1}`, shortName(value), value.id % 4 + 1));
      option.value = String(candidate.tileId);
      option.selected = candidate.tileId === alternativeId;
      picker.append(option);
    }
    picker.addEventListener("change", () => {
      const id = Number(picker.value);
      if (!destroyed && otherOptions.some((option) => option.tileId === id)) {
        alternatives.set(position.decisionIndex, id); render();
      }
    });
    pickerLabel.append(picker);
    const difference = alternative ? compareDiscards(advice, chosen.tileId, alternative.tileId) : null;
    const explanation = node("div", "explanation");
    explanation.setAttribute("role", "status");
    const headline = !difference ? tx("review.one-legal-discard", "One legal discard") : difference.shantenDifference > 0 ? tx("review.fewer-steps-from-ready", "Fewer steps from ready") : difference.shantenDifference < 0 ? tx("review.a-speed-tradeoff", "A speed tradeoff") :
      difference.unseenImprovingDifference < 0 ? tx("review.more-ways-to-improve", "More ways to improve") : difference.unseenImprovingDifference > 0 ? tx("review.compare-the-tradeoff", "Compare the tradeoff") : tx("review.the-same-hand-efficiency", "The same hand efficiency");
    explanation.append(node("h2", "", headline));
    const choiceFacts = tx("review.your-discard-leaves-0-shanten-and-1-unseen-impro", `Your discard leaves ${chosen.shantenAfter} shanten and ${chosen.improvingTotal} unseen improving copies.`, chosen.shantenAfter, chosen.improvingTotal);
    explanation.append(node("p", "", alternative ? tx("review.v-0-the-alternative-leaves-1-shanten-and-2-unseen", `${choiceFacts} The alternative leaves ${alternative.shantenAfter} shanten and ${alternative.improvingTotal} unseen improving copies.`, choiceFacts, alternative.shantenAfter, alternative.improvingTotal) :
      tx("review.v-0-1", `${position.view.players[position.view.seat]!.riichi ? tx("review.only-the-drawn-tile-may-be-discarded-after-riich", "Only the drawn tile may be discarded after riichi.") : tx("review.only-one-discard-is-available-in-this-position", "Only one discard is available in this position.")} ${choiceFacts}`, position.view.players[position.view.seat]!.riichi ? tx("review.only-the-drawn-tile-may-be-discarded-after-riich", "Only the drawn tile may be discarded after riichi.") : tx("review.only-one-discard-is-available-in-this-position", "Only one discard is available in this position."), choiceFacts)));
    const bonus = node("p", "review-dora", tx("review.v-0-dora-alone-do-not-establish-a-yaku", `${alternative ? tx("review.dora-discarded-your-choice-0-alternative-1", `Dora discarded: your choice ${chosen.doraDiscarded}; alternative ${alternative.doraDiscarded}.`, chosen.doraDiscarded, alternative.doraDiscarded) : tx("review.dora-discarded-0", `Dora discarded: ${chosen.doraDiscarded}.`, chosen.doraDiscarded)} Dora alone do not establish a yaku.`, alternative ? tx("review.dora-discarded-your-choice-0-alternative-1", `Dora discarded: your choice ${chosen.doraDiscarded}; alternative ${alternative.doraDiscarded}.`, chosen.doraDiscarded, alternative.doraDiscarded) : tx("review.dora-discarded-0", `Dora discarded: ${chosen.doraDiscarded}.`, chosen.doraDiscarded)));
    bonus.dataset["fact"] = "dora-discarded";
    explanation.append(bonus, node("p", "dim", tx("review.unseen-copies-may-be-in-opponents-hands-or-the-d", "*Unseen copies may be in opponents’ hands or the dead wall. The ranking and relative danger are heuristics, not win probabilities or an objective grade.")));
    const facts = node("details", "review-facts");
    facts.append(node("summary", "", tx("review.improving-tiles-waits-and-defensive-facts", "Improving tiles, waits, and defensive facts")));
    const displayedOptions: readonly (readonly [string, DiscardAdvice])[] = alternative ? [[tx("review.your-discard", "Your discard"), chosen], ["Alternative", alternative]] : [[tx("review.your-discard", "Your discard"), chosen]];
    for (const [label, candidate] of displayedOptions) {
      const section = node("section", "fact-detail");
      section.append(node("h3", "", label));
      section.append(node("p", "", tx("review.shape-completing-waits-0", `Shape-completing waits: ${candidate.waits.length ? candidate.waits.map((wait) => tx("review.v-0-1-unseen", `${wait.name} (${wait.live} unseen)`, wait.name, wait.live)).join(", ") : tx("review.none", "none")}.`, candidate.waits.length ? candidate.waits.map((wait) => tx("review.v-0-1-unseen", `${wait.name} (${wait.live} unseen)`, wait.name, wait.live)).join(", ") : tx("review.none", "none"))));
      section.append(node("p", "", tx("review.improving-tiles-0", `Improving tiles: ${candidate.improving.length ? candidate.improving.map((entry) => `${entry.name} (${entry.live})`).join(", ") : tx("review.none", "none")}.`, candidate.improving.length ? candidate.improving.map((entry) => `${entry.name} (${entry.live})`).join(", ") : tx("review.none", "none"))));
      section.append(node("p", "", tx("review.relative-danger-0-heuristic-units-discard-based", `Relative danger: ${candidate.danger} heuristic units. Discard-based furiten: ${candidate.furiten ? tx("review.yes", "yes") : tx("review.no", "no")}.`, candidate.danger, candidate.furiten ? tx("review.yes", "yes") : tx("review.no", "no"))));
      section.append(node("p", "dim", tx("review.genbutsu-against-riichi-seats-0-other-opponents", `Genbutsu against riichi seats: ${candidate.genbutsuAgainst.length ? candidate.genbutsuAgainst.map((seat) => WINDS[position.view.players[seat]!.seatWind - 27]).join(", ") : tx("review.none", "none")}. Other opponents may still ron. Temporary and riichi-pass furiten are not included.`, candidate.genbutsuAgainst.length ? candidate.genbutsuAgainst.map((seat) => WINDS[position.view.players[seat]!.seatWind - 27]).join(", ") : tx("review.none", "none"))));
      facts.append(section);
    }
    panel.append(compare);
    if (alternative) panel.append(pickerLabel);
    panel.append(explanation, facts);
    return panel;
  };
  function render(): void {
    if (destroyed) return;
    const focusKey = container.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset["reviewControl"] : undefined;
    const position = navigator.current;
    const shell = node("div", "learning-shell review-shell");
    shell.dataset["reviewVersion"] = String(options.review.engineVersion);
    const header = node("header", "learning-header");
    const back = button("‹", "back", options.onBack, "back"); back.setAttribute("aria-label", tx("review.back", "Back"));
    const help = button("?", "help", () => { showHelp = !showHelp; render(); }, "help"); help.setAttribute("aria-label", tx("review.review-help", "Review help"));
    help.setAttribute("aria-expanded", String(showHelp));
    header.append(back, node("div", "wordmark", tx("review.open-mahjong", "OPEN MAHJONG")), help);
    const content = options.embedded ? node("section", "learning-content content") : node("main", "learning-content content");
    content.tabIndex = 0;
    content.setAttribute("aria-label", tx("review.game-review", "Game review"));
    if (showHelp) content.append(node("p", "card", tx("review.review-uses-only-what-you-could-see-at-each-deci", "Review uses only what you could see at each decision. Compare choices before considering the eventual result. Unseen-copy counts describe unknown locations; strategic rankings are estimates.")));
    if (!position) {
      content.append(node("h1", "", tx("review.review-a-decision", "Review a decision")), node("p", "", tx("review.no-player-decisions-have-been-recorded-in-this-r", "No player decisions have been recorded in this replay.")));
    } else {
      content.append(node("div", "eyebrow", tx("review.v-0-your-1", `${roundLabel(position)} · YOUR ${position.kind === "turn" ? tx("review.turn", "TURN") : tx("review.call-decision", "CALL DECISION")}`, roundLabel(position), position.kind === "turn" ? tx("review.turn", "TURN") : tx("review.call-decision", "CALL DECISION"))));
      if(options.embedded)content.append(node("p","review-position-count",tx("review.v-0-1-decisions", `${navigator.positionIndex+1} / ${options.review.positions.length} decisions`, navigator.positionIndex+1, options.review.positions.length)));
      const title = node("div", "title-row"); title.append(node("h1", "", tx("review.review-a-decision", "Review a decision")));
      const navigation = node("div", "decision-nav"); navigation.setAttribute("aria-label", tx("review.decision-navigation", "Decision navigation"));
      const previous = button("‹", "", () => { navigator.previous(); render(); }, "previous"); previous.setAttribute("aria-label", tx("review.previous-decision", "Previous decision")); previous.disabled = navigator.positionIndex === 0;
      const next = button("›", "", () => { navigator.next(); render(); }, "next"); next.setAttribute("aria-label", tx("review.next-decision", "Next decision")); next.disabled = navigator.positionIndex + 1 === options.review.positions.length;
      navigation.append(previous, node("span", "", tx("review.v-0-1-2", `${navigator.positionIndex + 1} / ${options.review.positions.length}`, navigator.positionIndex + 1, options.review.positions.length)), next); if (!options.embedded) title.append(navigation); content.append(title);
      const handLabel = node("label", "review-hand-label", tx("review.hand", "Hand")); const hands = node("select", "review-hand-select"); hands.setAttribute("aria-label", tx("review.hand", "Hand")); hands.dataset["reviewControl"] = "hand";
      const seenHands = new Set<number>();
      for (const entry of options.review.positions) if (!seenHands.has(entry.handIndex)) {
        seenHands.add(entry.handIndex); const option = node("option", "", tx("review.v-0-1-honba-hand-2", `${roundLabel(entry)} · ${entry.view.honba} honba · hand ${entry.handIndex + 1}`, roundLabel(entry), entry.view.honba, entry.handIndex + 1));
        option.value = String(entry.handIndex); option.selected = entry.handIndex === position.handIndex; hands.append(option);
      }
      hands.addEventListener("change", () => { navigator.goToHand(Number(hands.value)); render(); }); handLabel.append(hands); if (!options.embedded) content.append(handLabel);
      content.append(node("div", "perspective", tx("review.player-perspective", "Player perspective ✓")));
      if (position.engineVersion === 1) content.append(node("p", "legacy-notice card", tx("review.historical-replay-engine-version-1-current-strat", "Historical replay · engine version 1. Current strategic analysis is unavailable; this replay preserves its historical rules behavior.")));
      const handCard = node("div", "card hand-card"); handCard.append(node("div", "card-label", tx("review.your-hand-at-this-decision", "YOUR HAND AT THIS DECISION")), tileList(position.view.hand));
      const threats = position.view.players.filter((player) => player.seat !== position.view.seat && player.riichi).length;
      handCard.append(node("div", "hand-caption", tx("review.v-0-in-the-live-wall-1", `${position.view.wallRemaining} in the live wall · ${threats ? tx("review.v-0-riichi-threat-1", `${threats} riichi threat${threats === 1 ? "" : "s"}`, threats, pluralS(threats)) : tx("review.no-riichi-threats", "no riichi threats")}.`, position.view.wallRemaining, threats ? tx("review.v-0-riichi-threat-1", `${threats} riichi threat${threats === 1 ? "" : "s"}`, threats, pluralS(threats)) : tx("review.no-riichi-threats", "no riichi threats")))); content.append(handCard);
      if (position.variant) handCard.querySelector(".hand-caption")!.textContent = tx("review.v-0-tiles-in-the-live-wall", `${position.view.wallRemaining} tiles in the live wall.`, position.view.wallRemaining);
      const advice = getAdvice(position);
      const moments = getMoments(position);
      if (position.variant && position.kind === "turn" && position.action.type === "discard") {
        if (!variantCache.has(position.decisionIndex)) variantCache.set(position.decisionIndex, adviseVariantDiscard(position.view));
        const read = variantCache.get(position.decisionIndex)!;
        const played = position.view.hand.find(t => position.action.type === "discard" && t.id === position.action.tileId)!;
        const panel = node("section", "card variant-comparison");
        panel.append(node("h2", "", tx("review.played-move-and-coach-preference", "Played move and coach preference")), node("p", "", tx("review.you-discarded-0", `You discarded ${shortName(played)}.`, shortName(played))), node("p", "", read.explanation), node("p", "dim", read.limitations));
        content.append(panel);
      } else if (advice) content.append(analysisPanel(position, advice));
      else {
        const facts = node("div", "card review-action-facts"); facts.append(node("h2", "", position.kind === "call" ? tx("review.call-decision-2", "Call decision") : tx("review.recorded-action", "Recorded action")), node("p", "", tx("review.your-action-0", `Your action: ${position.action.type}.`, position.action.type)));
        if (position.kind === "call") facts.append(node("p", "", tx("review.v-0-1-3", `${position.engineVersion === 1 ? tx("review.recorded-historical-call-flags", "Recorded historical call flags") : tx("review.legal-opportunities-in-this-window", "Legal opportunities in this window")}: ${[position.context.canRon ? "ron" : "", position.context.canPon ? "pon" : "", position.context.canKan ? tx("review.open-kan", "open kan") : "", position.context.chiOptions.length ? "chi" : "", "pass"].filter(Boolean).join(", ")}.`, position.engineVersion === 1 ? tx("review.recorded-historical-call-flags", "Recorded historical call flags") : tx("review.legal-opportunities-in-this-window", "Legal opportunities in this window"), [position.context.canRon ? "ron" : "", position.context.canPon ? "pon" : "", position.context.canKan ? tx("review.open-kan", "open kan") : "", position.context.chiOptions.length ? "chi" : "", "pass"].filter(Boolean).join(", "))));
        else facts.append(node("p", "", tx("review.winning-by-tsumo-was-0-at-this-turn", `Winning by tsumo was ${position.context.canTsumo ? tx("review.legal", "legal") : tx("review.unavailable", "unavailable")} at this turn.`, position.context.canTsumo ? tx("review.legal", "legal") : tx("review.unavailable", "unavailable"))));
        if (position.engineVersion !== 1 && !moments.available) {
          facts.append(node("p", "dim", position.variant ? tx("review.this-action-is-ungraded-the-recorded-legal-oppor", "This action is ungraded. The recorded legal opportunities are shown; discard comparisons use a public-information heuristic.") : moments.reason === "not-recorded"
            ? tx("review.this-game-was-recorded-before-moment-capture-so", "This game was recorded before moment capture, so this window is not graded. Games recorded now grade call, kan, riichi, and win choices as well as discards.")
            : tx("review.this-view-records-legality-it-does-not-grade-cal", "This view records legality. It does not grade calling, kan, or winning-action strategy.")));
        }
        content.append(facts);
      }
      if (moments.available) content.append(momentPanels(position, moments));
      content.append(publicTable(position));
      const practiceLabel = position.kind === "call" ? tx("review.practice-hand-building", "Practice hand building") : advice ? tx("review.practice-tile-efficiency", "Practice tile efficiency") : tx("review.practice-this-concept", "Practice this concept");
      const practice = button(practiceLabel, "primary", () => options.onPractice(position, skillsFor(position)), "practice"); practice.disabled = position.engineVersion === 1; content.append(practice);
      content.append(node("p", "source", position.engineVersion === 1 ? tx("review.historical-engine-1-display-only", "Historical engine 1 · display only") : position.variant ? tx("review.v-0-heuristic-advice", `${position.variant} · Heuristic advice`, position.variant) : tx("review.openmahjong-riichi-0-1", `OpenMahjong riichi · ${advice?.analysis.analysisVersion ?? tx("review.exact-legal-context", "exact legal context")}${options.review.complete ? "" : " " + tx("review.recorded-prefix", "· recorded prefix")}`, advice?.analysis.analysisVersion ?? tx("review.exact-legal-context", "exact legal context"), options.review.complete ? "" : " " + tx("review.recorded-prefix", "· recorded prefix"))));
    }
    if (options.embedded) shell.append(content);
    else shell.append(header, content);
    container.replaceChildren(shell);
    if (focusKey) container.querySelector<HTMLElement>(`[data-review-control="${focusKey}"]`)?.focus();
  }
  render();
  return {
    get currentPosition() { return navigator.current; },
    goToDecision(index) { if (!destroyed) { navigator.goTo(index); render(); } },
    destroy() { destroyed = true; adviceCache.clear(); momentCache.clear(); alternatives.clear(); variantCache.clear(); container.replaceChildren(); },
  };
}
