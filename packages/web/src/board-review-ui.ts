import { variantAdapter, type Tile } from "@openmahjong/engine";
import { tileById } from "./model.js";
import { BoardTimeline, eventLabel } from "./board-review.js";
import { mountReview, type ReviewUIController } from "./review-ui.js";
import type { ReviewDecision } from "./review.js";
import type { SkillId } from "./education/curriculum.js";

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
): void {
  const shell = el("div", "", "learning-shell game-detail");
  const header = el("header", "", "learning-header");
  const back = button("‹", onBack);
  back.setAttribute("aria-label", "Back to Games");
  header.append(back, el("h1", "Game details"));
  const main = el("main", "", "learning-content");
  const profileLabel =
    timeline.data.review.variant === "hong-kong"
      ? "Hong Kong Old Style · Clear Chapter"
      : timeline.data.review.variant === "mcr"
        ? "MCR · WMO 2006"
        : timeline.data.review.variant === "taiwanese"
          ? "Taiwanese · Every-flower, no Ting, 30/10"
          : "Riichi · OpenMahjong";
  main.append(el("p", profileLabel, "dim"), el("h2", "Final standings"));
  for (const entry of [...(timeline.data.result?.settlement ?? [])].sort(
    (a, b) => a.rank - b.rank || a.seat - b.seat,
  )) {
    const row = el("div", "", "detail-standing card");
    row.append(
      el(
        "span",
        `${entry.rank}. ${entry.seat === timeline.data.humanSeat ? "You" : `Player ${entry.seat + 1}`}`,
      ),
      el("b", `${entry.score.toLocaleString("en-US")} points`),
      el(
        "span",
        `${entry.points > 0 ? "+" : ""}${entry.points.toFixed(1)} settlement`,
      ),
    );
    main.append(row);
  }
  main.append(
    el(
      "p",
      timeline.data.review.variant
        ? "Settlement shows net points under the recorded variant profile."
        : "Settlement includes rank bonuses (+15/+5/−5/−15) and the 20-point first-place bonus.",
      "dim",
    ),
    el("h2", "Hands"),
  );
  for (const hand of timeline.hands) {
    const row = button(`${hand.label} · ${hand.result}`, () =>
      onHand(hand.index),
    );
    row.classList.add("detail-hand");
    main.append(row);
  }
  if (timeline.data.review.engineVersion === 1)
    main.append(el("p", "Historical engine 1 · Display only", "dim"));
  shell.append(header, main);
  container.replaceChildren(shell);
}
export function mountBoardReview(
  container: HTMLElement,
  options: {
    timeline: BoardTimeline;
    handIndex?: number;
    renderTile: (tile: Tile) => HTMLElement;
    onBack: () => void;
    onPractice: (position: ReviewDecision, skills: readonly SkillId[]) => void;
  },
): ReviewUIController {
  const { timeline } = options;
  const shell = el("div", "", "learning-shell board-review");
  const header = el("header", "", "learning-header");
  const back = button("‹", options.onBack);
  back.setAttribute("aria-label", "Game details");
  header.append(back, el("h1", "Board review"));
  const main = el("main", "", "learning-content");
  const handSelect = el("select");
  handSelect.setAttribute("aria-label", "Hand");
  for (const hand of timeline.hands) {
    const option = el("option", hand.label);
    option.value = String(hand.index);
    handSelect.append(option);
  }
  const board = el("div", "", "review-board");
  board.setAttribute("aria-label", "Recorded table, player perspective");
  const status = el("p", "", "timeline-status");
  status.setAttribute("aria-live", "polite");
  const range = el("input");
  range.type = "range";
  range.min = "0";
  range.max = String(timeline.data.events.length - 1);
  range.step = "1";
  range.setAttribute("aria-label", "Hand timeline");
  const controls = el("div", "", "timeline-controls");
  const previous = button("Previous event", () => seek(cursor - 1));
  const next = button("Next event", () => seek(cursor + 1));
  const prevDecision = button("Previous decision", () => jumpDecision(-1));
  const nextDecision = button("Next decision", () => jumpDecision(1));
  controls.append(previous, next, prevDecision, nextDecision);
  const jumps = el("select");
  jumps.setAttribute("aria-label", "Jump to significant event");
  const adviceHost = el("div", "", "board-advice");
  const advice = mountReview(adviceHost, {
    review: timeline.data.review,
    renderTile: options.renderTile,
    onBack: options.onBack,
    onPractice: options.onPractice,
    embedded: true,
  });
  let cursor = timeline.hands[options.handIndex ?? 0]?.start ?? 0;
  let selectedPosition: ReviewDecision | null = null;
  const tiles = (values: readonly Tile[], hidden = false): HTMLElement => {
    const row = el("div", "", "board-tiles");
    for (const value of values) {
      if (hidden) {
        const back = el("span", "", "board-tile-back");
        back.setAttribute("role", "img");
        back.setAttribute("aria-label", "Concealed tile");
        row.append(back);
      } else row.append(options.renderTile(value));
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
    status.textContent = `Event ${cursor + 1} · ${label}`;
    previous.disabled = cursor <= (hand?.start ?? 0);
    next.disabled = cursor >= (hand?.end ?? timeline.data.events.length - 1);
    board.replaceChildren();
    const center = el("div", "", "board-center");
    center.append(
      el("b", hand?.label ?? "Game"),
      el(
        "span",
        model.variant === "riichi"
          ? `${model.wallRemaining} tiles left · ${model.sticks} deposits`
          : `${model.wallRemaining} tiles left`,
      ),
      tiles(model.doraIndicators),
    );
    board.append(center);
    for (let relative = 0; relative < 4; relative++) {
      const player = model.players[(timeline.data.humanSeat + relative) % 4]!;
      const area = el("section", "", `board-seat board-seat-${relative}`);
      area.append(
        el(
          "h2",
          `${WINDS[player.seatWind - 27]}${relative === 0 ? " · You" : ""} · ${player.score.toLocaleString("en-US")}${player.riichi ? " · Riichi" : ""}`,
        ),
        tiles(
          player.handIds
            .map((id) => model.resolveTile(id))
            .sort((a, b) => a.type - b.type || a.id - b.id),
          relative !== 0,
        ),
      );
      if (player.flowers.length)
        area.append(el("span", "Flowers and seasons"), tiles(player.flowers));
      for (const meld of player.melds) {
        const group = el("div", "", "board-meld");
        group.append(
          el(
            "span",
            meld.kind === "chi"
              ? "Sequence"
              : meld.kind === "pon"
                ? "Triplet"
                : "Quad",
          ),
          tiles(
            meld.tiles,
            relative !== 0 &&
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
        if (entry.called) wrap.append(el("small", "Called"));
        if (entry.riichiDeclaration) wrap.append(el("small", "Riichi"));
        pond.append(wrap);
      }
      area.append(pond);
      board.append(area);
    }
    jumps.replaceChildren(el("option", "Jump to significant event"));
    jumps.options[0]!.value = "";
    for (const i of timeline.significant.filter(
      (i) => i >= (hand?.start ?? 0) && i <= (hand?.end ?? Infinity),
    )) {
      const option = el(
        "option",
        `${i + 1} · ${eventLabel(timeline.data.events[i]!, model)}`,
      );
      option.value = String(i);
      jumps.append(option);
    }
    const positionIndex =
      decision ??
      timeline.decisionsByEvent.get(timeline.data.events[cursor]!.seq)?.[0] ??
      -1;
    selectedPosition = timeline.data.review.positions[positionIndex] ?? null;
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
  main.append(
    handSelect,
    el(
      "p",
      "Opponents’ concealed tiles stay face-down. Coach advice uses only what you knew at each decision.",
      "dim",
    ),
    board,
    status,
    range,
    controls,
    jumps,
    adviceHost,
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
