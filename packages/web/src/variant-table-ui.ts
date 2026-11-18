import {
  variantAdapter,
  tileTypeName,
  type Tile,
  type VariantPublicView,
} from "@openmahjong/engine";
import { adviseVariantDiscard } from "@openmahjong/coach";
import { TableModel } from "./model.js";
import { VariantRunner } from "./variant-runner.js";
import type { Decision } from "./runner.js";
import { renderVariantPublicBoard } from "./variant-board-ui.js";
import type { Settings } from "./settings.js";
import type { ClickKind } from "./sound.js";

const WINDS = ["East", "South", "West", "North"];
const NAMES: Record<string, string> = {
  "hong-kong": "Hong Kong Old Style",
  mcr: "MCR",
  taiwanese: "Taiwanese",
};
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
  className = "",
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  n.textContent = text;
  n.className = className;
  return n;
}
function button(
  text: string,
  action: () => void,
  className = "primary",
): HTMLButtonElement {
  const b = el("button", text, className);
  b.type = "button";
  b.addEventListener("click", action);
  return b;
}
export function mountVariantTable(
  container: HTMLElement,
  options: {
    runner: VariantRunner;
    renderTile: (tile: Tile) => HTMLElement;
    onBack: () => void;
    onSave: () => void;
    onFinish: () => void;
    onReview: () => void;
    onSound?: (kind: ClickKind) => void;
    onSettings?: (settings: Partial<Settings>) => void;
    soundEnabled?: boolean;
    guided: boolean;
    largeTiles: boolean;
    reducedMotion: boolean;
    resume?: boolean;
  },
): { destroy(): void } {
  const runner = options.runner,
    model = new TableModel(runner.humanSeat);
  let alive = true,
    cursor = 0,
    selected: number | undefined,
    playing = false,
    paused = false,
    finished = false,
    guided = options.guided,
    largeTiles = options.largeTiles,
    reducedMotion = options.reducedMotion,
    soundEnabled = options.soundEnabled ?? true;
  let analysisFor: unknown,
    analysis: ReturnType<typeof adviseVariantDiscard> | undefined;
  const shell = el(
      "div",
      "",
      `learning-shell variant-table${options.largeTiles ? " variant-large" : ""}`,
    ),
    header = el("header"),
    main = el("main", "", "variant-table-content");
  const back = button("‹", options.onBack);
  back.setAttribute("aria-label", "Back to Play");
  const menu = button("⋯", () => showSettings());
  menu.setAttribute("aria-label", "Table settings");
  header.append(back, el("h1", NAMES[runner.variant] ?? runner.variant), menu);
  shell.append(header, main);
  container.replaceChildren(shell);
  const summary = el("div", "", "variant-center"),
    board = el("div", "", "variant-public-board"),
    hand = el("div", "", "variant-own-hand"),
    controls = el("div", "", "variant-actions"),
    coach = el("div", "", "variant-coach"),
    status = el("p", "", "dim");
  status.setAttribute("role", "status");
  hand.setAttribute("aria-label", "Your concealed tiles");
  // Board scrolls in its own zone; the dock (hand, actions, coach,
  // status) is pinned on screen — decisions never open below the
  // fold and the coach never overlays the player's own pond.
  const boardScroll = el("div", "", "variant-board-scroll"),
    dock = el("div", "", "variant-dock");
  boardScroll.append(board);
  dock.append(hand, controls, coach, status);
  main.append(summary, boardScroll, dock);
  const tile = (value: Tile) => {
    const n = options.renderTile(value);
    n.setAttribute("role", "img");
    n.setAttribute("aria-label", tileTypeName(value.type));
    return n;
  };
  function meldTiles(
    m: { kind: string; tiles: readonly Tile[] },
    opponent: boolean,
  ): HTMLElement[] {
    if (
      opponent &&
      m.kind === "ankan" &&
      variantAdapter(runner.variant).concealedQuadsFaceDown
    )
      return m.tiles.map(() => {
        const b = el("span", "", "board-tile-back");
        b.setAttribute("role", "img");
        b.setAttribute("aria-label", "Concealed quad tile");
        return b;
      });
    return m.tiles.map(tile);
  }
  function showSettings(): void {
    const d = el("dialog", "", "variant-focus");
    d.setAttribute("aria-label", "Table settings");
    d.append(el("h2", "Table settings"));
    const toggle = (
      label: string,
      value: () => boolean,
      change: (v: boolean) => void,
    ) => {
      const b = button("", () => {
        change(!value());
        b.textContent = `${label} · ${value() ? "On" : "Off"}`;
        b.setAttribute("aria-pressed", String(value()));
      });
      b.textContent = `${label} · ${value() ? "On" : "Off"}`;
      b.setAttribute("aria-pressed", String(value()));
      d.append(b);
    };
    toggle(
      "Sound",
      () => soundEnabled,
      (v) => {
        soundEnabled = v;
        options.onSettings?.({ sound: v });
      },
    );
    toggle(
      "Large tiles",
      () => largeTiles,
      (v) => {
        largeTiles = v;
        shell.classList.toggle("variant-large", v);
        options.onSettings?.({ largeTiles: v });
        render();
      },
    );
    toggle(
      "Reduced motion",
      () => reducedMotion,
      (v) => {
        reducedMotion = v;
        options.onSettings?.({ motion: v ? "reduced" : "standard" });
      },
    );
    toggle(
      "Guided hints",
      () => guided,
      (v) => {
        guided = v;
        options.onSettings?.({ guided: v });
        render();
      },
    );
    d.append(
      button("Close", () => {
        d.close();
        d.remove();
      }),
    );
    shell.append(d);
    d.showModal();
  }
  function showFrame(kind: "hand" | "center" | number): void {
    const dialog = el("dialog", "", "variant-focus"),
      title = el(
        "h2",
        kind === "hand"
          ? "Your hand"
          : kind === "center"
            ? "Table context"
            : `${WINDS[model.players[kind]!.seatWind - 27]} player`,
      );
    dialog.setAttribute("aria-label", title.textContent!);
    dialog.append(title);
    if (kind === "hand") {
      const row = el("div", "", "variant-focus-tiles");
      for (const id of model.players[runner.humanSeat]!.handIds) {
        const value = model.resolveTile(id),
          b = button(
            "",
            () => {
              selected = id;
              dialog.close();
              dialog.remove();
              render();
              hand
                .querySelector<HTMLButtonElement>('[aria-pressed="true"]')
                ?.focus();
            },
            "tile-choice",
          );
        b.setAttribute("aria-label", `Select ${tileTypeName(value.type)}`);
        b.disabled =
          runner.pending?.kind !== "turn" ||
          !runner.pending.view.legalDiscardIds.includes(id);
        b.append(tile(value));
        row.append(b);
      }
      dialog.append(row);
    } else if (kind === "center")
      dialog.append(
        el(
          "p",
          `${WINDS[model.roundWind - 27]} round · Hand ${model.kyoku} · ${model.wallRemaining} live tiles`,
        ),
        el(
          "p",
          runner.variant === "hong-kong"
            ? "Hong Kong Old Style · At least three fan to win; fan are scoring units converted into payer amounts. The number after the round wind is the hand number within the round. Live tiles are the tiles still left to draw from the wall. Repeat counts extra hands the same dealer deals again after winning a hand."
            : runner.variant === "mcr"
              ? "WMO 2006 · At least eight fan before flowers. Every loser pays eight base points."
              : "Every-flower · No Ting · Five sets and a pair, no minimum tai. Base 30 plus 10 per tai; dealer bonuses apply per payer.",
        ),
      );
    else {
      const p = model.players[kind]!;
      dialog.append(
        el("p", `${p.score} points · ${p.handIds.length} concealed tiles`),
      );
      const row = el("div", "", "board-tiles");
      for (const d of p.pond) row.append(tile(d.tile));
      for (const m of p.melds) row.append(...meldTiles(m, true));
      dialog.append(row);
    }
    dialog.append(
      button("Close", () => {
        dialog.close();
        dialog.remove();
      }),
    );
    shell.append(dialog);
    dialog.showModal();
  }
  function act(action: Decision): void {
    if (playing || paused || !runner.pending) return;
    try {
      runner.act(action);
      selected = undefined;
      options.onSave();
      void playback();
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : "Move unavailable";
    }
  }
  function render(): void {
    if (!alive) return;
    const centerButton = button(
        `${WINDS[model.roundWind - 27]} ${model.kyoku} · ${model.wallRemaining} tiles left`,
        () => showFrame("center"),
      ),
      handButton = button("Focus hand", () => showFrame("hand"));
    centerButton.disabled =
      playing || paused || runner.pending?.kind === "call";
    handButton.disabled = playing || paused || runner.pending?.kind === "call";
    const preview = el("div", "", "variant-selection-preview");
    if (selected !== undefined)
      preview.append(tile(model.resolveTile(selected)));
    summary.replaceChildren(centerButton, handButton, preview);
    if (!playing && !paused && runner.pending?.kind === "call")
      for (const d of shell.querySelectorAll("dialog")) {
        d.close();
        d.remove();
      }
    renderVariantPublicBoard(board, {
      model,
      humanSeat: runner.humanSeat,
      renderTile: options.renderTile,
      onFrame: (kind) => {
        if (!playing && runner.pending?.kind !== "call") showFrame(kind);
      },
      largeTiles,
    });
    // The player's own pond lives in the dock, directly above the
    // hand (the Riichi table's arrangement): always on screen and
    // inspectable, never scrolled away inside the board zone and
    // never under the coach panel.
    const mine = board.querySelector(".variant-my-pond");
    if (mine) dock.insertBefore(mine, hand);
    const own = model.players[runner.humanSeat]!,
      pending = runner.pending;
    if (
      pending?.kind === "turn" &&
      !playing &&
      guided &&
      analysisFor !== pending
    ) {
      analysisFor = pending;
      analysis = adviseVariantDiscard(pending.view);
    }
    hand.replaceChildren(
      el(
        "h2",
        `${WINDS[own.seatWind - 27]} · You · ${own.score.toLocaleString("en-US")} points`,
      ),
    );
    const grid = el("div", "", "variant-hand-grid");
    for (const id of [...own.handIds].sort(
      (a, b) => model.resolveTile(a).type - model.resolveTile(b).type || a - b,
    )) {
      const value = model.resolveTile(id),
        b = button(
          "",
          () => {
            selected = id;
            render();
          },
          "variant-hand-tile",
        );
      b.setAttribute("aria-label", `Select ${tileTypeName(value.type)}`);
      b.setAttribute("aria-pressed", String(selected === id));
      b.disabled =
        playing ||
        paused ||
        pending?.kind !== "turn" ||
        !pending.view.legalDiscardIds.includes(id);
      b.append(tile(value));
      if (guided && analysis?.advice.recommendation.tileId === id)
        b.classList.add("coach-choice");
      grid.append(b);
    }
    hand.append(grid);
    const ownPublic = el("div", "", "board-tiles");
    for (const m of own.melds)
      for (const t of m.tiles) ownPublic.append(tile(t));
    for (const f of own.flowers) ownPublic.append(tile(f));
    hand.append(ownPublic);
    controls.replaceChildren();
    coach.replaceChildren();
    if (paused) {
      const breakdown = el("section", "", "card variant-breakdown");
      if (model.lastWin) {
        const win = model.lastWin;
        breakdown.append(
          el("h2", `Won by ${WINDS[model.players[win.seat]!.seatWind - 27]}`),
          el(
            "p",
            `${win.han} ${({ taiwanese: "tai" } as Record<string, string>)[runner.variant] ?? "fan"}`,
          ),
        );
        for (const p of win.patterns ?? [])
          breakdown.append(el("p", `${p.name} · ${p.units}`));
        if (runner.variant === "hong-kong")
          breakdown.append(
            el(
              "p",
              "Each line above names a scoring pattern taught in the Hong Kong lessons and the fan it earns; the lines below show who pays the winner.",
            ),
          );
        for (const p of win.payments)
          breakdown.append(
            el(
              "p",
              `${WINDS[model.players[p.seat]!.seatWind - 27]} pays ${p.amount} points`,
            ),
          );
      } else
        breakdown.append(
          el("h2", "No winner"),
          el("p", "The live wall is exhausted. No win payment is made."),
        );
      breakdown.append(
        button(
          cursor >= runner.events.length && runner.result
            ? "Final standings"
            : "Next hand",
          () => {
            paused = false;
            void playback();
          },
        ),
      );
      controls.append(breakdown);
      return;
    }
    if (playing) {
      status.textContent = "Recorded moves are being shown…";
      return;
    }
    if (runner.result) {
      status.textContent = "Game complete";
      controls.append(el("h2", "Final standings"));
      for (const s of [...runner.result.settlement].sort(
        (a, b) => a.rank - b.rank,
      ))
        controls.append(
          el(
            "p",
            `${s.rank}. ${s.seat === runner.humanSeat ? "You" : `Player ${s.seat + 1}`} · ${s.score} points · ${s.points > 0 ? "+" : ""}${s.points} net`,
          ),
        );
      controls.append(
        button("Game details and review", options.onReview),
        button("Back to Play", options.onBack),
      );
      if (!finished) {
        finished = true;
        options.onFinish();
      }
      return;
    }
    status.textContent =
      pending?.view.winRestriction ??
      (pending?.kind === "call"
        ? "A discarded tile is available for a legal claim."
        : "Select a tile, then discard.");
    if (pending?.kind === "turn") {
      const c = pending.context,
        discard = button(
          selected === undefined
            ? "Select a tile to discard"
            : `Discard ${tileTypeName(model.resolveTile(selected).type)}`,
          () => {
            if (selected !== undefined)
              act({ type: "discard", tileId: selected });
          },
        );
      discard.disabled =
        selected === undefined ||
        !pending.view.legalDiscardIds.includes(selected);
      controls.append(discard);
      if (c.canTsumo)
        controls.append(
          button("Win by self-draw", () => act({ type: "tsumo" })),
        );
      for (const t of c.ankanOptions)
        controls.append(
          button(`Concealed quad · ${tileTypeName(t)}`, () =>
            act({ type: "ankan", tileType: t }),
          ),
        );
      for (const t of c.shouminkanOptions)
        controls.append(
          button(`Add to triplet · ${tileTypeName(t)}`, () =>
            act({ type: "shouminkan", tileType: t }),
          ),
        );
      controls.append(
        button(guided ? "Hide guided hint" : "Show guided hint", () => {
          guided = !guided;
          options.onSettings?.({ guided });
          render();
        }),
      );
      if (guided && analysis) {
        const why = button("Why this move?", () => {
          const d = el("dialog", "", "variant-focus");
          d.setAttribute("aria-label", "Guided explanation");
          d.append(
            el("h2", "Guided explanation"),
            el("p", analysis!.explanation),
            el("p", analysis!.limitations),
            button("Close", () => {
              d.close();
              d.remove();
            }),
          );
          shell.append(d);
          d.showModal();
        });
        why.setAttribute("aria-label", "Why this move?");
        coach.append(
          el(
            "p",
            `Coach prefers ${tileTypeName(analysis.advice.recommendation.type)}.`,
          ),
          why,
        );
      }
    } else if (pending) {
      const c = pending.context;
      if (c.canRon)
        controls.append(
          button(
            c.phase === "chankan"
              ? "Win by robbing the quad"
              : "Win on this discard",
            () => act({ type: "ron" }),
          ),
        );
      if (c.canPon)
        controls.append(button("Triplet (pung)", () => act({ type: "pon" })));
      if (c.canKan)
        controls.append(
          button("Open quad (kong)", () => act({ type: "daiminkan" })),
        );
      for (const ids of c.chiOptions) {
        const b = button("Sequence (chow)", () =>
          act({ type: "chi", tileIds: ids }),
        );
        for (const id of ids) b.append(tile(model.resolveTile(id)));
        controls.append(b);
      }
      controls.append(button("Pass", () => act({ type: "pass" })));
      coach.append(
        el(
          "p",
          "A win takes priority over a triplet or quad. Only the next seat may claim a sequence. The claim buttons use short names in brackets: a triplet (pung) is a claim to make three matching tiles, an open quad (kong) is a claim to make four matching tiles, and a sequence (chow) is a claim to make three numbers in a row in one suit. These buttons show only the claims the rules allow for this discard.",
          "dim",
        ),
      );
    }
  }
  async function playback(): Promise<void> {
    if (playing || !alive) return;
    playing = true;
    render();
    while (cursor < runner.events.length && alive) {
      const event = runner.events[cursor++]!;
      model.apply(event, runner.chiHints.get(event.seq));
      if (event.type === "discard")
        soundEnabled && options.onSound?.("discard");
      else if (event.type === "call" || event.type === "kan")
        soundEnabled && options.onSound?.("call");
      else if (event.type === "win") soundEnabled && options.onSound?.("win");
      if (event.type === "hand-start") selected = undefined;
      if (event.type === "hand-end") {
        paused = true;
        break;
      }
      if (["draw", "discard", "call", "kan", "flower"].includes(event.type)) {
        render();
        if (!reducedMotion)
          await new Promise<void>((resolve) => setTimeout(resolve, 90));
      }
    }
    playing = false;
    render();
  }
  if (options.resume) {
    for (const e of runner.events) model.apply(e, runner.chiHints.get(e.seq));
    cursor = runner.events.length;
    render();
  } else void playback();
  return {
    destroy() {
      alive = false;
      for (const d of shell.querySelectorAll("dialog")) d.remove();
      container.replaceChildren();
    },
  };
}
