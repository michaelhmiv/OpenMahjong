/** Shared v4 table geometry for Chinese-variant public boards. Rule state
 * stays in the adapter; this module only projects the recorded table. */
import { variantAdapter, tileTypeName, type Tile } from "@openmahjong/engine";
import type { TableModel } from "./model.js";
import { tx } from "./i18n/index.js";
const WINDS = ["East", "South", "West", "North"];
function el(tag: string, className = ""): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  return e;
}
function back(): HTMLElement {
  const b = el("span", "tile t-back");
  b.setAttribute("role", "img");
  b.setAttribute("aria-label", tx("play.variant.concealed-tile", "Concealed tile"));
  b.innerHTML =
    '<svg viewBox="0 0 40 56" aria-hidden="true"><use href="#t-back"/></svg>';
  return b;
}
export function renderVariantPublicBoard(
  host: HTMLElement,
  options: {
    model: TableModel;
    humanSeat: number;
    renderTile: (t: Tile) => HTMLElement;
    onFrame: (kind: "center" | number) => void;
    largeTiles: boolean;
  },
): void {
  const { model, humanSeat, onFrame } = options;
  const relative = (r: number) => (humanSeat + r) % 4;
  const tile = (t: Tile, cls = "t-pond") => {
    const n = options.renderTile(t);
    n.classList.add(...cls.split(" "));
    n.setAttribute("role", "img");
    n.setAttribute("aria-label", tileTypeName(t.type));
    return n;
  };
  const inspect = (
    node: HTMLElement,
    label: string,
    kind: "center" | number,
  ) => {
    node.setAttribute("role", "button");
    node.tabIndex = 0;
    node.setAttribute("aria-label", label);
    node.addEventListener("click", () => onFrame(kind));
    node.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onFrame(kind);
      }
    });
  };
  const pond = (seat: number, side: "grid" | "left" | "right") => {
    const node = el(
      "div",
      side === "grid"
        ? `pond${seat === relative(2) ? " flip" : ""}`
        : `sp ${side}`,
    );
    for (const entry of model.players[seat]!.pond.filter((d) => !d.called)) {
      if (side === "grid") node.append(tile(entry.tile));
      else {
        const c = el("span", "cell");
        c.append(tile(entry.tile, "t-pond rot"));
        node.append(c);
      }
    }
    if (model.players[seat]!.pond.some((d) => !d.called))
      inspect(
        node,
        tx("play.variant.inspect-0-discards", `Inspect ${WINDS[model.players[seat]!.seatWind - 27]} discards`, WINDS[model.players[seat]!.seatWind - 27]),
        seat,
      );
    return node;
  };
  const publicSets = (seat: number) => {
    const row = el("div", "variant-board-sets");
    for (const m of model.players[seat]!.melds) {
      const group = el("span", "meld");
      if (
        m.kind === "ankan" &&
        seat !== humanSeat &&
        variantAdapter(model.variant).concealedQuadsFaceDown
      )
        m.tiles.forEach(() => group.append(back()));
      else
        for (const t of m.tiles)
          group.append(
            tile(t, `t-meld${t.id === m.calledTile?.id ? " side" : ""}`),
          );
      row.append(group);
    }
    for (const f of model.players[seat]!.flowers) row.append(tile(f, "t-meld"));
    return row;
  };
  host.className = `variant-public-board variant-v4${options.largeTiles ? " variant-large" : ""}`;
  host.replaceChildren();
  const top = relative(2),
    left = relative(3),
    right = relative(1),
    zone = el("div", "zone-top"),
    topHand = el("div", "opp-hand");
  for (const _ of model.players[top]!.handIds) topHand.append(back());
  zone.append(topHand, publicSets(top));
  const topPond = el("div", "pondwrap");
  topPond.append(pond(top, "grid"));
  zone.append(topPond);
  host.append(zone);
  const band = el("div", "band"),
    labels = el("div", "bandtop");
  for (const seat of [left, top, right]) {
    const p = model.players[seat]!,
      label = el(
        "button",
        `chip${seat === top ? " west" : ""}${model.currentTurn === seat ? " turn" : ""}`,
      );
    label.textContent = `${WINDS[p.seatWind - 27]} · ${p.score.toLocaleString("en-US")}`;
    label.setAttribute("aria-label", tx("play.variant.v-0-inspect-player", `${label.textContent} · Inspect player`, label.textContent));
    label.addEventListener("click", () => onFrame(seat));
    labels.append(label);
  }
  band.append(labels);
  const middle = el("div", "stage-mid");
  for (const [seat, side] of [
    [left, "left"],
    [right, "right"],
  ] as const) {
    const h = el("div", `sidehand ${side}`);
    for (const _ of model.players[seat]!.handIds) h.append(back());
    middle.append(h, pond(seat, side));
  }
  const center = el("button", "center");
  center.setAttribute("title", "Table context");
  const round = el("div", "round"),
    wind = el("span", "wind");
  wind.textContent = WINDS[model.roundWind - 27]!.slice(0, 1);
  const name = el("span", "rname");
  name.textContent = `${WINDS[model.roundWind - 27]} ${model.kyoku}`;
  round.append(wind, name);
  const sub = el("p", "sub");
  sub.textContent = tx("play.variant.v-0-tiles-left", `${model.wallRemaining} tiles left`, model.wallRemaining);
  center.append(round, sub);
  if (model.honba) {
    const repeat = el("p", "sub");
    repeat.textContent = tx("play.variant.repeat-0", `Repeat ${model.honba}`, model.honba);
    center.append(repeat);
  }
  center.addEventListener("click", () => onFrame("center"));
  middle.append(center);
  band.append(middle);
  host.append(band);
  const sets = el("div", "variant-side-sets");
  sets.append(publicSets(left), publicSets(right));
  host.append(sets);
  const mine = el("div", "pondwrap variant-my-pond");
  mine.append(pond(humanSeat, "grid"));
  host.append(mine);
}
