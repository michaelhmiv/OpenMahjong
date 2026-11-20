import { variantAdapter, type Tile } from "@openmahjong/engine";
import { formatStandingsPoints } from "./records.js";
import { tileById } from "./model.js";
import { BoardTimeline, eventLabel } from "./board-review.js";
import { analyzeReviewDecision } from "./review.js";
import { mountReview, type ReviewUIController } from "./review-ui.js";
import type { ReviewDecision } from "./review.js";
import type { SkillId } from "./education/curriculum.js";
import { tx } from "./i18n/index.js";

const WINDS = ["East", "South", "West", "North"];
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
  className = "",
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
}
function button(text: string, action: () => void): HTMLButtonElement {
  const node = el("button", text, "primary");
  node.type = "button";
  node.addEventListener("click", action);
  return node;
}
export function mountGameDetail(
  container: HTMLElement,
  timeline: BoardTimeline,
  onBack: () => void,
  onHand: (index: number) => void,
  onAnalyze?: () => void,
): void {
  const shell = el("div", "", "learning-shell game-detail");
  const header = el("header", "", "learning-header");
  const back = button("‹", onBack);
  back.setAttribute("aria-label", tx("review.board.back-to-games", "Back to Games"));
  header.append(back, el("h1", tx("review.board.game-details", "Game details")));
  const main = el("main", "", "learning-content");
  const profileLabel =
    timeline.data.review.variant === "hong-kong"
      ? tx("review.board.hong-kong-old-style-clear-chapter", "Hong Kong Old Style · Clear Chapter")
      : timeline.data.review.variant === "mcr"
        ? tx("review.board.mcr-wmo-2006", "MCR · WMO 2006")
        : timeline.data.review.variant === "taiwanese"
          ? tx("review.board.taiwanese-every-flower-no-ting-30-10", "Taiwanese · Every-flower, no Ting, 30/10")
          : tx("review.board.riichi-openmahjong", "Riichi · OpenMahjong");
  main.append(el("p", profileLabel, "dim"), el("h2", tx("review.board.final-standings", "Final standings")));
  for (const entry of [...(timeline.data.result?.settlement ?? [])].sort(
    (a, b) => a.rank - b.rank || a.seat - b.seat,
  )) {
    const row = el("div", "", "detail-standing card");
    row.append(
      el(
        "span",
        tx("review.board.v-0-1", `${entry.rank}. ${entry.seat === timeline.data.humanSeat ? tx("review.board.you", "You") : WINDS[(entry.seat - timeline.data.humanSeat + 4) % 4]}`, entry.rank, entry.seat === timeline.data.humanSeat ? tx("review.board.you", "You") : WINDS[(entry.seat - timeline.data.humanSeat + 4) % 4]),
      ),
      el("b", tx("review.board.v-0-points", `${entry.score.toLocaleString("en-US")} points`, entry.score.toLocaleString("en-US"))),
      el(
        "span",
        tx("review.board.v-0-1-settlement", `${entry.points > 0 ? "+" : ""}${formatStandingsPoints(entry.points)} settlement`, entry.points > 0 ? "+" : "", formatStandingsPoints(entry.points)),
      ),
    );
    main.append(row);
  }
  main.append(
    el(
      "p",
      timeline.data.review.variant
        ? tx("review.board.settlement-shows-net-points-under-the-recorded-v", "Settlement shows net points under the recorded variant profile.")
        : tx("review.board.settlement-includes-rank-bonuses-15-5-5-15-and-t", "Settlement includes rank bonuses (+15/+5/−5/−15) and the 20-point first-place bonus."),
      "dim",
    ),
  );
  // Analyze entry (brief-analyze-v1): offered only when the caller
  // knows this game's archive can be graded (current riichi engine).
  if (onAnalyze) main.append(button(tx("analyze.analyze", "Analyze"), onAnalyze));
  main.append(el("h2", tx("review.board.hands", "Hands")));
  for (const hand of timeline.hands) {
    const row = button(tx("review.board.v-0-1-2", `${hand.label} · ${hand.result}`, hand.label, hand.result), () =>
      onHand(hand.index),
    );
    row.classList.add("detail-hand");
    main.append(row);
  }
  if (timeline.data.review.engineVersion === 1)
    main.append(el("p", tx("review.board.historical-engine-1-display-only", "Historical engine 1 · Display only"), "dim"));
  shell.append(header, main);
  container.replaceChildren(shell);
}
export function mountBoardReview(
  container: HTMLElement,
  options: {
    timeline: BoardTimeline;
    handIndex?: number;
    allowReveal?: boolean;
    renderTile: (tile: Tile) => HTMLElement;
    onBack: () => void;
    onPractice?: (position: ReviewDecision, skills: readonly SkillId[]) => void;
  },
): ReviewUIController {
  const { timeline } = options;
  const shell = el("div", "", "learning-shell board-review");
  const header = el("header", "", "learning-header");
  const back = button("‹", options.onBack);
  back.setAttribute("aria-label", tx("review.board.game-details", "Game details"));
  header.append(back, el("h1", tx("review.board.board-review", "Board review")));
  const main = el("main", "", "learning-content");
  const handSelect = el("select");
  handSelect.setAttribute("aria-label", tx("review.board.hand", "Hand"));
  for (const hand of timeline.hands) {
    const option = el("option", hand.label);
    option.value = String(hand.index);
    handSelect.append(option);
  }
  let revealHands = false;
  const board = el("div", "", "review-board");
  board.setAttribute("aria-label", tx("review.board.recorded-table-player-perspective", "Recorded table, player perspective"));
  const status = el("p", "", "timeline-status");
  status.setAttribute("aria-live", "polite");
  const range = el("input");
  range.type = "range";
  range.min = "0";
  range.max = String(timeline.data.events.length - 1);
  range.step = "1";
  range.setAttribute("aria-label", tx("review.board.hand-timeline", "Hand timeline"));
  const controls = el("div", "", "timeline-controls");
  const previous = button(tx("review.board.previous-event", "Previous event"), () => seek(cursor - 1));
  const next = button(tx("review.board.next-event", "Next event"), () => seek(cursor + 1));
  const prevDecision = button(tx("review.board.previous-decision", "Previous decision"), () => jumpDecision(-1));
  const nextDecision = button(tx("review.board.next-decision", "Next decision"), () => jumpDecision(1));
  controls.append(previous, next, prevDecision, nextDecision);
  const jumps = el("select");
  jumps.setAttribute("aria-label", tx("review.board.jump-to-significant-event", "Jump to significant event"));
  const adviceHost = el("div", "", "board-advice");
  const advice = mountReview(adviceHost, {
    review: timeline.data.review,
    renderTile: options.renderTile,
    onBack: options.onBack,
    ...(options.onPractice ? {onPractice:options.onPractice} : {}),
    embedded: true,
  });
  // The coach analysis for a decision is computed once and cached:
  // seek() runs on every slider step, and re-running the evaluator
  // per step would make scrubbing (and the marks) crawl.
  const analysisCache = new Map<number, ReturnType<typeof analyzeReviewDecision>>();
  const analysisFor = (position: ReviewDecision): ReturnType<typeof analyzeReviewDecision> => {
    const cached = analysisCache.get(position.decisionIndex);
    if (cached) return cached;
    const fresh = analyzeReviewDecision(position);
    analysisCache.set(position.decisionIndex, fresh);
    return fresh;
  };
  let cursor = timeline.hands[options.handIndex ?? 0]?.start ?? 0;
  let selectedPosition: ReviewDecision | null = null;
  const tiles = (
    values: readonly Tile[],
    hidden = false,
    marks?: { chosenId?: number; advisedId?: number; drawnId?: number },
  ): HTMLElement => {
    const row = el("div", "", "board-tiles");
    for (const value of values) {
      if (hidden) {
        const back = el("span", "", "board-tile-back");
        back.setAttribute("role", "img");
        back.setAttribute("aria-label", tx("review.board.concealed-tile", "Concealed tile"));
        row.append(back);
        continue;
      }
      const face = options.renderTile(value);
      const isChosen = marks?.chosenId === value.id;
      const isAdvised = marks?.advisedId === value.id;
      const isDrawn = marks?.drawnId === value.id;
      if (!isChosen && !isAdvised && !isDrawn) {
        row.append(face);
        continue;
      }
      // Decision marks (audit C19): the board itself shows which
      // discard was chosen and which the coach advised, and the
      // drawn tile is separated from the rest of the hand.
      if (isDrawn) row.append(el("span", "", "board-drawn-sep"));
      const wrap = el("span", "", `board-mark${isChosen ? " chosen" : ""}${isAdvised ? " advised" : ""}${isDrawn ? " drawn" : ""}`);
      if (isChosen) wrap.setAttribute("aria-label", tx("review.board.your-discard", "Your discard"));
      if (isAdvised) wrap.setAttribute("aria-label", tx("review.board.coachs-pick", "Coach's pick"));
      wrap.append(face);
      row.append(wrap);
    }
    return row;
  };
  function seek(index: number, decision?: number): void {
    if (index < 0 || index >= timeline.data.events.length) return;
    cursor = index;
    const model = timeline.seek(cursor),
      hand = timeline.handAt(cursor);
    handSelect.value = String(hand?.index ?? 0);
    range.min = String(hand?.start ?? 0);
    range.max = String(hand?.end ?? timeline.data.events.length - 1);
    range.value = String(cursor);
    const label = eventLabel(timeline.data.events[cursor]!, model);
    range.setAttribute("aria-valuetext", `${cursor + 1}: ${label}`);
    status.textContent = tx("review.board.event-0-1", `Event ${cursor + 1} · ${label}`, cursor + 1, label);
    previous.disabled = cursor <= (hand?.start ?? 0);
    next.disabled = cursor >= (hand?.end ?? timeline.data.events.length - 1);
    // Resolve the decision at this event before the board renders:
    // its chosen/advised discards are marked on the player's hand.
    const earlyPositionIndex =
      timeline.decisionsByEvent.get(timeline.data.events[cursor]!.seq)?.[0] ?? -1;
    const earlyPosition = timeline.data.review.positions[earlyPositionIndex] ?? null;
    const earlyAnalysis = earlyPosition ? analysisFor(earlyPosition) : null;
    const handMarks = earlyPosition && earlyPosition.kind === "turn"
      ? {
          ...(earlyPosition.action.type === "discard" ? { chosenId: earlyPosition.action.tileId } : {}),
          ...(earlyAnalysis?.available ? { advisedId: earlyAnalysis.advice.recommendation.tileId } : {}),
          ...(earlyPosition.context.drawnTile ? { drawnId: earlyPosition.context.drawnTile.id } : {}),
        }
      : undefined;
    board.replaceChildren();
    const center = el("div", "", "board-center");
    center.append(
      el("b", hand?.label ?? tx("review.board.game", "Game")),
      el(
        "span",
        model.variant === "riichi"
          ? tx("review.board.v-0-tiles-left-1-deposits", `${model.wallRemaining} tiles left · ${model.sticks} deposits`, model.wallRemaining, model.sticks)
          : tx("review.board.v-0-tiles-left", `${model.wallRemaining} tiles left`, model.wallRemaining),
      ),
      tiles(model.doraIndicators),
    );
    board.append(center);
    for (let relative = 0; relative < 4; relative++) {
      const player = model.players[(timeline.data.humanSeat + relative) % 4]!;
      const area = el("section", "", `board-seat board-seat-${relative}`);
      // The dealer mark: medium.css outlines this seat with a
      // neutral line and appends the " · Dealer" suffix (audit F9 —
      // red stays inside design rules section 3's reserved set).
      if (player.isDealer) area.setAttribute("data-dealer", "true");
      area.append(
        el(
          "h2",
          tx("review.board.v-0-1-2-3", `${WINDS[player.seatWind - 27]}${relative === 0 ? " " + tx("review.board.you-2", "· You") : ""} · ${player.score.toLocaleString("en-US")}${player.riichi ? " " + tx("review.board.riichi", "· Riichi") : ""}`, WINDS[player.seatWind - 27], relative === 0 ? " " + tx("review.board.you-2", "· You") : "", player.score.toLocaleString("en-US"), player.riichi ? " " + tx("review.board.riichi", "· Riichi") : ""),
        ),
        tiles(
          player.handIds
            .map((id) => model.resolveTile(id))
            .sort((a, b) => a.type - b.type || a.id - b.id),
          relative !== 0 && !revealHands,
          relative === 0 ? handMarks : undefined,
        ),
      );
      if (player.flowers.length)
        area.append(el("span", tx("review.board.flowers-and-seasons", "Flowers and seasons")), tiles(player.flowers));
      for (const meld of player.melds) {
        const group = el("div", "", "board-meld");
        group.append(
          el(
            "span",
            meld.kind === "chi"
              ? tx("review.board.sequence", "Sequence")
              : meld.kind === "pon"
                ? tx("review.board.triplet", "Triplet")
                : tx("review.board.quad", "Quad"),
          ),
          tiles(
            meld.tiles,
            !revealHands && relative !== 0 &&
              meld.kind === "ankan" &&
              model.variant !== "riichi" &&
              variantAdapter(model.variant).concealedQuadsFaceDown,
          ),
        );
        area.append(group);
      }
      const pond = el("div", "", "board-tiles board-pond");
      for (const entry of player.pond) {
        const wrap = el("span", "", entry.called ? "called" : "");
        wrap.append(options.renderTile(entry.tile));
        if (entry.called) wrap.append(el("small", tx("review.board.called", "Called")));
        if (entry.riichiDeclaration) wrap.append(el("small", tx("review.board.riichi-2", "Riichi")));
        pond.append(wrap);
      }
      area.append(pond);
      board.append(area);
    }
    if (handMarks && (handMarks.chosenId !== undefined || handMarks.advisedId !== undefined)) {
      const legend = el("p", tx("review.board.your-discard-is-outlined-the-coachs-pick-is-ringed", "Your discard is outlined; the coach's pick is ringed."), "board-mark-legend");
      board.append(legend);
    }
    jumps.replaceChildren(el("option", tx("review.board.jump-to-significant-event", "Jump to significant event")));
    jumps.options[0]!.value = "";
    for (const i of timeline.significant.filter(
      (i) => i >= (hand?.start ?? 0) && i <= (hand?.end ?? Infinity),
    )) {
      const option = el(
        "option",
        tx("review.board.v-0-1-2", `${i + 1} · ${eventLabel(timeline.data.events[i]!, model)}`, i + 1, eventLabel(timeline.data.events[i]!, model)),
      );
      option.value = String(i);
      jumps.append(option);
    }
    const positionIndex =
      decision ??
      timeline.decisionsByEvent.get(timeline.data.events[cursor]!.seq)?.[0] ??
      -1;
    selectedPosition = timeline.data.review.positions[positionIndex] ?? null;
    if (selectedPosition?.controller==="bot") status.textContent += " · Bot decision";
    if (selectedPosition?.controller==="clock") status.textContent += " · Clock default";
    adviceHost.hidden = !selectedPosition;
    if (selectedPosition) advice.goToDecision(positionIndex);
    prevDecision.disabled = !timeline.data.review.positions.some(
      (p) =>
        (p.eventSequence < cursor ||
          (p.eventSequence === cursor &&
            selectedPosition &&
            p.decisionIndex < selectedPosition.decisionIndex)) &&
        p.handIndex === hand?.index,
    );
    nextDecision.disabled = !timeline.data.review.positions.some(
      (p) =>
        (p.eventSequence > cursor ||
          (p.eventSequence === cursor &&
            selectedPosition &&
            p.decisionIndex > selectedPosition.decisionIndex)) &&
        p.handIndex === hand?.index,
    );
  }
  function jumpDecision(direction: -1 | 1): void {
    const hand = timeline.handAt(cursor);
    const positions = timeline.data.review.positions
      .map((p, i) => ({ p, i }))
      .filter(
        ({ p }) =>
          p.handIndex === hand?.index &&
          (direction > 0
            ? p.eventSequence > cursor ||
              (p.eventSequence === cursor &&
                selectedPosition &&
                p.decisionIndex > selectedPosition.decisionIndex)
            : p.eventSequence < cursor ||
              (p.eventSequence === cursor &&
                selectedPosition &&
                p.decisionIndex < selectedPosition.decisionIndex)),
      );
    const target = direction > 0 ? positions[0] : positions.at(-1);
    if (target) seek(target.p.eventSequence, target.i);
  }
  range.addEventListener("input", () => seek(Number(range.value)));
  handSelect.addEventListener("change", () =>
    seek(timeline.hands[Number(handSelect.value)]!.start),
  );
  jumps.addEventListener("change", () => {
    if (jumps.value !== "") seek(Number(jumps.value));
  });
  if (options.allowReveal) {
    const reveal = button(tx("review.board.reveal-all-hands", "Reveal all hands"), () => {
      revealHands = !revealHands;
      reveal.textContent = revealHands ? tx("review.board.hide-opponents-hands", "Hide opponents’ hands") : tx("review.board.reveal-all-hands", "Reveal all hands");
      reveal.setAttribute("aria-pressed", String(revealHands));
      seek(cursor);
    });
    reveal.setAttribute("aria-pressed", "false");
    controls.append(reveal);
  }
  // The coach comparison rides directly under the board status —
  // within the first screen at the decision point — not below the
  // timeline controls where it opened off-screen (audit C19).
  main.append(
    handSelect,
    el(
      "p",
      options.allowReveal ? tx("review.board.coach-advice-uses-only-what-you-knew-at-each-dec", "Coach advice uses only what you knew at each decision.") : tx("review.board.opponents-concealed-tiles-stay-face-down-coach-a", "Opponents’ concealed tiles stay face-down. Coach advice uses only what you knew at each decision."),
      "dim",
    ),
    board,
    status,
    adviceHost,
    range,
    controls,
    jumps,
  );
  shell.append(header, main);
  container.replaceChildren(shell);
  seek(cursor);
  return {
    get currentPosition() {
      return selectedPosition;
    },
    goToDecision(index) {
      const position = timeline.data.review.positions[index];
      if (!position) throw new RangeError("Unknown decision");
      seek(position.eventSequence, index);
    },
    destroy() {
      advice.destroy();
      container.replaceChildren();
    },
  };
}
