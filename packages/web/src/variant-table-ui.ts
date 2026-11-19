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
import { keyStatus, slugify, t, tx } from "./i18n/index.js";

const WINDS = ["East", "South", "West", "North"];
/** Variant id -> { key, label }. Module scope (built before initI18n),
 *  so it stores the en.json key + the English label (the extractor's
 *  source) instead of calling t()/tx(); the render site resolves the
 *  key (see the header below). Unknown ids fall back to the id. */
const NAMES: Record<string, { key: string; label: string }> = {
  "hong-kong": { key: "play.variant.hong-kong-old-style", label: "Hong Kong Old Style" },
  mcr: { key: "play.variant.mcr", label: "MCR" },
  taiwanese: { key: "play.variant.taiwanese", label: "Taiwanese" },
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
  back.setAttribute("aria-label", tx("play.variant.back-to-play", "Back to Play"));
  const menu = button("⋯", () => showSettings());
  menu.setAttribute("aria-label", tx("play.variant.table-settings", "Table settings"));
  header.append(back, el("h1", t(NAMES[runner.variant]?.key ?? runner.variant)), menu);
  shell.append(header, main);
  container.replaceChildren(shell);
  const summary = el("div", "", "variant-center"),
    board = el("div", "", "variant-public-board"),
    hand = el("div", "", "variant-own-hand"),
    controls = el("div", "", "variant-actions"),
    coach = el("div", "", "variant-coach"),
    status = el("p", "", "dim");
  status.setAttribute("role", "status");
  hand.setAttribute("aria-label", tx("play.variant.your-concealed-tiles", "Your concealed tiles"));
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
        b.setAttribute("aria-label", tx("play.variant.concealed-quad-tile", "Concealed quad tile"));
        return b;
      });
    return m.tiles.map(tile);
  }
  function showSettings(): void {
    const d = el("dialog", "", "variant-focus");
    d.setAttribute("aria-label", tx("play.variant.table-settings", "Table settings"));
    d.append(el("h2", tx("play.variant.table-settings", "Table settings")));
    const toggle = (
      label: string,
      value: () => boolean,
      change: (v: boolean) => void,
    ) => {
      const b = button("", () => {
        change(!value());
        b.textContent = tx("play.variant.v-0-1", `${label} · ${value() ? tx("play.variant.on", "On") : tx("play.variant.off", "Off")}`, label, value() ? tx("play.variant.on", "On") : tx("play.variant.off", "Off"));
        b.setAttribute("aria-pressed", String(value()));
      });
      b.textContent = tx("play.variant.v-0-1", `${label} · ${value() ? tx("play.variant.on", "On") : tx("play.variant.off", "Off")}`, label, value() ? tx("play.variant.on", "On") : tx("play.variant.off", "Off"));
      b.setAttribute("aria-pressed", String(value()));
      d.append(b);
    };
    toggle(
      tx("play.variant.sound", "Sound"),
      () => soundEnabled,
      (v) => {
        soundEnabled = v;
        options.onSettings?.({ sound: v });
      },
    );
    toggle(
      tx("play.variant.large-tiles", "Large tiles"),
      () => largeTiles,
      (v) => {
        largeTiles = v;
        shell.classList.toggle("variant-large", v);
        options.onSettings?.({ largeTiles: v });
        render();
      },
    );
    toggle(
      tx("play.variant.reduced-motion", "Reduced motion"),
      () => reducedMotion,
      (v) => {
        reducedMotion = v;
        options.onSettings?.({ motion: v ? "reduced" : "standard" });
      },
    );
    toggle(
      tx("play.variant.guided-hints", "Guided hints"),
      () => guided,
      (v) => {
        guided = v;
        options.onSettings?.({ guided: v });
        render();
      },
    );
    d.append(
      button(tx("play.variant.close", "Close"), () => {
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
          ? tx("play.variant.your-hand", "Your hand")
          : kind === "center"
            ? tx("play.variant.table-context", "Table context")
            : tx("play.variant.v-0-player", `${WINDS[model.players[kind]!.seatWind - 27]} player`, WINDS[model.players[kind]!.seatWind - 27]),
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
        b.setAttribute("aria-label", tx("play.variant.select-0", `Select ${tileTypeName(value.type)}`, tileTypeName(value.type)));
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
          tx("play.variant.v-0-round-hand-1-2-tiles-left-to-draw", `${WINDS[model.roundWind - 27]} round · Hand ${model.kyoku} · ${model.wallRemaining} tiles left to draw`, WINDS[model.roundWind - 27], model.kyoku, model.wallRemaining),
        ),
        el(
          "p",
          runner.variant === "hong-kong"
            ? tx("play.variant.hong-kong-old-style-at-least-three-fan-to-win-fa", "Hong Kong Old Style · At least three fan to win; fan are scoring units converted into payer amounts. The number after the round wind is the hand number within the round. Live tiles are the tiles still left to draw from the wall. Repeat counts extra hands the same dealer deals again after winning a hand.")
            : runner.variant === "mcr"
              ? tx("play.variant.mcr-mahjong-competition-rules-a-winning-hand-nee", "MCR (Mahjong Competition Rules) · A winning hand needs at least eight fan from its patterns before flower points are added. Every player who did not win pays eight base points.")
              : tx("play.variant.every-flower-earns-one-tai-whichever-plant-or-se", "Every flower earns one tai, whichever plant or season it is. You do not need to announce a ready hand before you may win. Five sets and a pair, no minimum tai. Base 30 plus 10 per tai; dealer bonuses apply per payer."),
        ),
      );
    else {
      const p = model.players[kind]!;
      dialog.append(
        el("p", tx("play.variant.v-0-points-1-concealed-tiles", `${p.score} points · ${p.handIds.length} concealed tiles`, p.score, p.handIds.length)),
      );
      const row = el("div", "", "board-tiles");
      for (const d of p.pond) row.append(tile(d.tile));
      for (const m of p.melds) row.append(...meldTiles(m, true));
      dialog.append(row);
    }
    dialog.append(
      button(tx("play.variant.close", "Close"), () => {
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
        error instanceof Error ? error.message : tx("play.variant.move-unavailable", "Move unavailable");
    }
  }
  function render(): void {
    if (!alive) return;
    const centerButton = button(
        tx("play.variant.v-0-1-2-tiles-left", `${WINDS[model.roundWind - 27]} ${model.kyoku} · ${model.wallRemaining} tiles left`, WINDS[model.roundWind - 27], model.kyoku, model.wallRemaining),
        () => showFrame("center"),
      ),
      handButton = button(tx("play.variant.focus-hand", "Focus hand"), () => showFrame("hand"));
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
        tx("play.variant.v-0-you-1-points", `${WINDS[own.seatWind - 27]} · You · ${own.score.toLocaleString("en-US")} points`, WINDS[own.seatWind - 27], own.score.toLocaleString("en-US")),
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
      b.setAttribute("aria-label", tx("play.variant.select-0", `Select ${tileTypeName(value.type)}`, tileTypeName(value.type)));
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
      // MCR win patterns have guide keys (learn.mcr.guide.pattern.<slug>.name);
      // Hong Kong / Taiwanese patterns have no standalone keys yet, so
      // their English engine names render as-is (follow-up: mint keys).
      // The keyStatus guard keeps a future engine pattern from leaking a
      // key id onto the screen — t() returns the key itself on a miss.
      const patternName = (name: string): string => {
        if (runner.variant !== "mcr") return name;
        const key = `learn.mcr.guide.pattern.${slugify(name)}.name`;
        return keyStatus(key) === "missing" ? name : t(key);
      };
      const breakdown = el("section", "", "card variant-breakdown");
      if (model.lastWin) {
        const win = model.lastWin;
        breakdown.append(
          el("h2", tx("play.variant.won-by-0", `Won by ${WINDS[model.players[win.seat]!.seatWind - 27]}`, WINDS[model.players[win.seat]!.seatWind - 27])),
          el(
            "p",
            tx("play.variant.v-0-1-2", `${win.han} ${({ taiwanese: tx("play.variant.tai", "tai") } as Record<string, string>)[runner.variant] ?? tx("play.variant.fan", "fan")}`, win.han, ({ taiwanese: tx("play.variant.tai", "tai") } as Record<string, string>)[runner.variant] ?? tx("play.variant.fan", "fan")),
          ),
        );
        for (const p of win.patterns ?? [])
          breakdown.append(el("p", tx("play.variant.v-0-1", `${p.name} · ${p.units}`, patternName(p.name), p.units)));
        if (runner.variant === "hong-kong")
          breakdown.append(
            el(
              "p",
              tx("play.variant.each-line-above-names-a-scoring-pattern-taught-i", "Each line above names a scoring pattern taught in the Hong Kong lessons and the fan it earns; the lines below show who pays the winner."),
            ),
          );
        if (runner.variant === "mcr")
          breakdown.append(
            el(
              "p",
              tx("play.variant.each-pattern-line-above-is-a-named-feature-of-th", "Each pattern line above is a named feature of the winning hand and the fan it is worth. Each payment line below is what that player pays the winner."),
              "dim",
            ),
          );
        for (const p of win.payments)
          breakdown.append(
            el(
              "p",
              tx("play.variant.v-0-pays-1-points", `${WINDS[model.players[p.seat]!.seatWind - 27]} pays ${p.amount} points`, WINDS[model.players[p.seat]!.seatWind - 27], p.amount),
            ),
          );
      } else
        breakdown.append(
          el("h2", tx("play.variant.no-winner", "No winner")),
          el("p", tx("play.variant.the-wall-is-exhausted-no-tiles-are-left-to-draw", "The wall is exhausted — no tiles are left to draw. No win payment is made.")),
        );
      breakdown.append(
        button(
          cursor >= runner.events.length && runner.result
            ? tx("play.variant.final-standings", "Final standings")
            : tx("play.variant.next-hand", "Next hand"),
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
      status.textContent = tx("play.variant.recorded-moves-are-being-shown", "Recorded moves are being shown…");
      return;
    }
    if (runner.result) {
      status.textContent = tx("play.variant.game-complete", "Game complete");
      controls.append(el("h2", tx("play.variant.final-standings", "Final standings")));
      for (const s of [...runner.result.settlement].sort(
        (a, b) => a.rank - b.rank,
      ))
        controls.append(
          el(
            "p",
            tx("play.variant.v-0-1-2-points-3-4-across-the-whole-match", `${s.rank}. ${s.seat === runner.humanSeat ? tx("play.variant.you", "You") : tx("play.variant.player-0", `Player ${s.seat + 1}`, s.seat + 1)} · ${s.score} points · ${s.points > 0 ? "+" : ""}${s.points} across the whole match`, s.rank, s.seat === runner.humanSeat ? tx("play.variant.you", "You") : tx("play.variant.player-0", `Player ${s.seat + 1}`, s.seat + 1), s.score, s.points > 0 ? "+" : "", s.points),
          ),
        );
      controls.append(
        button(tx("play.variant.game-details-and-review", "Game details and review"), options.onReview),
        button(tx("play.variant.back-to-play", "Back to Play"), options.onBack),
      );
      if (!finished) {
        finished = true;
        options.onFinish();
      }
      return;
    }
    status.textContent =
      pending?.view.winRestriction && runner.variant === "taiwanese"
        ? tx("play.variant.you-may-not-win-on-this-draw-a-passed-win-is-sta", "You may not win on this draw: a passed win is standing against you, or this draw is the replacement for a quad you claimed. A passed win clears when you discard a tile that could not complete your hand, or declare a quad from a drawn tile.")
        : (pending?.view.winRestriction ??
          (pending?.kind === "call"
            ? tx("play.variant.a-discarded-tile-is-available-for-a-legal-claim", "A discarded tile is available for a legal claim.")
            : tx("play.variant.select-a-tile-then-discard", "Select a tile, then discard.")));
    if (pending?.kind === "turn") {
      const c = pending.context,
        discard = button(
          selected === undefined
            ? tx("play.variant.select-a-tile-to-discard", "Select a tile to discard")
            : tx("play.variant.discard-0", `Discard ${tileTypeName(model.resolveTile(selected).type)}`, tileTypeName(model.resolveTile(selected).type)),
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
          button(tx("play.variant.win-by-self-draw", "Win by self-draw"), () => act({ type: "tsumo" })),
        );
      for (const t of c.ankanOptions)
        controls.append(
          button(tx("play.variant.concealed-quad-0", `Concealed quad · ${tileTypeName(t)}`, tileTypeName(t)), () =>
            act({ type: "ankan", tileType: t }),
          ),
        );
      for (const t of c.shouminkanOptions)
        controls.append(
          button(tx("play.variant.add-to-triplet-0", `Add to triplet · ${tileTypeName(t)}`, tileTypeName(t)), () =>
            act({ type: "shouminkan", tileType: t }),
          ),
        );
      controls.append(
        button(guided ? tx("play.variant.hide-guided-hint", "Hide guided hint") : tx("play.variant.show-guided-hint", "Show guided hint"), () => {
          guided = !guided;
          options.onSettings?.({ guided });
          render();
        }),
      );
      if (guided && analysis) {
        const why = button(tx("play.variant.why-this-move", "Why this move?"), () => {
          const d = el("dialog", "", "variant-focus");
          d.setAttribute("aria-label", tx("play.variant.guided-explanation", "Guided explanation"));
          d.append(
            el("h2", tx("play.variant.guided-explanation", "Guided explanation")),
            el("p", analysis!.explanation),
            el("p", analysis!.limitations),
            button(tx("play.variant.close", "Close"), () => {
              d.close();
              d.remove();
            }),
          );
          shell.append(d);
          d.showModal();
        });
        why.setAttribute("aria-label", tx("play.variant.why-this-move", "Why this move?"));
        coach.append(
          el(
            "p",
            tx("play.variant.coach-prefers-0", `Coach prefers ${tileTypeName(analysis.advice.recommendation.type)}.`, tileTypeName(analysis.advice.recommendation.type)),
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
              ? tx("play.variant.win-by-robbing-the-quad", "Win by robbing the quad")
              : tx("play.variant.win-on-this-discard", "Win on this discard"),
            () => act({ type: "ron" }),
          ),
        );
      if (c.canPon)
        controls.append(
          button(
            runner.variant === "taiwanese"
              ? tx("play.variant.triplet-claim-for-three-of-a-kind", "Triplet — claim for three of a kind")
              : tx("play.variant.triplet-pung", "Triplet (pung)"),
            () => act({ type: "pon" }),
          ),
        );
      if (c.canKan)
        controls.append(
          button(
            runner.variant === "taiwanese"
              ? tx("play.variant.open-quad-claim-for-four-of-a-kind", "Open quad — claim for four of a kind")
              : tx("play.variant.open-quad-kong", "Open quad (kong)"),
            () => act({ type: "daiminkan" }),
          ),
        );
      for (const ids of c.chiOptions) {
        const b = button(
          runner.variant === "taiwanese"
            ? tx("play.variant.sequence-claim-for-a-run-of-three-in-one-suit", "Sequence — claim for a run of three in one suit")
            : tx("play.variant.sequence-chow", "Sequence (chow)"),
          () => act({ type: "chi", tileIds: ids }),
        );
        for (const id of ids) b.append(tile(model.resolveTile(id)));
        controls.append(b);
      }
      controls.append(button(tx("play.variant.pass", "Pass"), () => act({ type: "pass" })));
      coach.append(
        el(
          "p",
          runner.variant === "taiwanese"
            ? tx("play.variant.a-win-takes-priority-over-a-triplet-or-quad-only", "A win takes priority over a triplet or quad. Only the next player in turn may claim a sequence. These buttons show only the claims the rules allow right now: a triplet is three of a kind, a quad is four of a kind, and a sequence is a run of three numbers in one suit.")
            : tx("play.variant.a-win-takes-priority-over-a-triplet-or-quad-only-2", "A win takes priority over a triplet or quad. Only the next seat may claim a sequence. The claim buttons use short names: pung is another word for a triplet — a triplet (pung) is a claim to make three matching tiles; kong is another word for a quad — an open quad (kong) is a claim to make four matching tiles; chow is another word for a sequence — a sequence (chow) is a claim to make three numbers in a row in one suit. These buttons show only the claims the rules allow for this discard."),
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
