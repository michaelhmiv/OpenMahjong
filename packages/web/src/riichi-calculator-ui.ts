import {
  buildTileSet,
  calculateDraft,
  computeRiichiPoints,
  doraFromIndicator,
  tileTypeName,
  type CalculationDraft,
  type CalculationContext,
  type CalculatorInput,
  type Meld,
  type Tile,
} from "@openmahjong/engine";
import {
  WIND_NAMES,
  btn,
  cxContextPanel,
  cxCorrections,
  cxLabel,
  cxPaymentBlock,
  cxPreview,
  cxStepperChips,
  el,
  foldPayments,
  windIndex,
  type StepperChips,
} from "./compact-calc.js";
import { tx } from "./i18n/index.js";

const FU_SEQUENCE = [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110];

export interface RiichiCalculatorOptions {
  variant: "riichi" | "american";
  /** Player names by seat (the standalone calculator uses winds). */
  names: readonly string[];
  dealer: number;
  honba: number;
  roundWind: number;
  /** Outstanding riichi deposits in points (0 outside a session). */
  pot: number;
  /** Context-panel line for the pot, when there is one. */
  riichiLine?: string;
  /** Seats holding the outstanding deposits, oldest first. */
  depositors?: readonly number[];
  initialContext: { winner: number; winType: "ron" | "tsumo"; payer: number };
  /** Correction / prefill draft: opens on check payments. */
  existing?: CalculationDraft;
  /** Simultaneous winners recorded alongside, unedited. */
  partners?: readonly CalculationDraft[];
  /** Winners staged earlier in this flow (multiple ron). */
  staged?: readonly CalculationDraft[];
  multipleRon: boolean;
  bettorName?: string;
  standalone?: boolean;
  renderTile: (tile: Tile) => HTMLElement;
  safe: (fn: () => void) => void;
  setTitle: (title: string) => void;
  /** Exact score changes for a set of drafts (session fold). */
  deltasFor?: (drafts: readonly CalculationDraft[]) => number[];
  /** Absent in the standalone calculator: nothing is recorded. */
  onRecord?: (drafts: readonly CalculationDraft[]) => void;
  onStage?: (draft: CalculationDraft) => void;
}

function field(label: string, control: HTMLElement): HTMLLabelElement {
  const l = el("label", label, "tool-field");
  control.setAttribute("aria-label", label);
  l.append(control);
  return l;
}
function numInput(value: string | number): HTMLInputElement {
  const i = el("input");
  i.type = "number";
  i.value = String(value);
  i.min = "0";
  i.max = "1000000";
  i.step = "1";
  return i;
}
function select(
  values: readonly (readonly [string, string])[],
  value: string,
): HTMLSelectElement {
  const s = el("select");
  for (const [id, label] of values) {
    const o = el("option", label);
    o.value = id;
    s.append(o);
  }
  s.value = value;
  return s;
}
function checkBox(
  label: string,
  checked: boolean,
): { node: HTMLElement; control: HTMLInputElement } {
  const control = el("input");
  control.type = "checkbox";
  control.checked = checked;
  return { node: field(label, control), control };
}

export function mountRiichiCalculator(
  root: HTMLElement,
  opts: RiichiCalculatorOptions,
): void {
  const variant = opts.variant;
  const existing = opts.existing;
  const staged: CalculationDraft[] = [...(opts.staged ?? [])];
  const partners = opts.partners ?? [];
  // A mutable working copy: the standalone calculator edits the
  // winner context in place; session flows never change it.
  const context: {
    winner: number;
    dealer: number;
    payer: number;
    winType: "ron" | "tsumo";
    honba: number;
  } = existing?.input.context
    ? { ...existing.input.context }
    : {
        winner: opts.initialContext.winner,
        dealer: opts.dealer,
        payer: opts.initialContext.payer,
        winType: opts.initialContext.winType,
        honba: opts.honba,
      };
  const roundWind =
    existing?.input.variant === "riichi" && existing.input.path === "tiles"
      ? existing.input.hand.roundWind
      : opts.roundWind;
  const screen = el("div", "", "cx-screen");
  root.append(screen);
  const show = (title: string): void => {
    opts.setTitle(title);
    screen.replaceChildren();
  };
  const name = (seat: number) => opts.names[seat] ?? tx("calc.riichi.player-0", `Player ${seat + 1}`, seat + 1);
  const windName = (seat: number) =>
    WIND_NAMES[windIndex(seat, context.dealer)]!;
  const winWord = (t: "ron" | "tsumo") =>
    t === "ron"
      ? tx("calc.riichi.on-a-discard", "On a discard")
      : variant === "american"
        ? tx("calc.riichi.self-pick-joker-exchange", "Self-pick / Joker exchange")
        : tx("calc.riichi.self-draw", "Self-draw");

  // ---- fast-path state -------------------------------------------------
  const fast0 =
    existing?.input.variant === variant && existing.input.path === "fast"
      ? existing.input
      : undefined;
  let hanCtl: StepperChips | undefined,
    fuCtl: StepperChips | undefined,
    yakCtl: StepperChips | undefined;
  // Stepper values live at mount level so Edit returns and path
  // switches keep the entry in progress.
  let hanVal =
      fast0?.variant === "riichi" && fast0.path === "fast" ? fast0.han : 1,
    fuVal =
      fast0?.variant === "riichi" && fast0.path === "fast" ? fast0.fu : 30,
    yakVal =
      fast0?.variant === "riichi" && fast0.path === "fast"
        ? fast0.yakuman
        : 0;
  const valueInput = numInput(
    fast0?.variant === "american" ? fast0.value : 25,
  );
  const jokerless = checkBox(
    tx("calc.riichi.jokerless-at-the-win", "Jokerless at the win"),
    fast0?.variant === "american" ? fast0.jokerless : false,
  );
  const singles = checkBox(
    tx("calc.riichi.singles-and-pairs-hand-no-jokerless-double", "Singles and Pairs hand (no jokerless double)"),
    fast0?.variant === "american" ? fast0.singlesPairs : false,
  );
  const bettorSel = select(
    [
      ["none", tx("calc.riichi.no-bettor", "No bettor")],
      ["wall", tx("calc.riichi.bettor-chose-the-wall", "Bettor chose the wall")],
      ...opts.names.map(
        (n, i) => [String(i), tx("calc.riichi.bettor-chose-0", `Bettor chose ${n}`, n)] as const,
      ),
    ],
    fast0?.variant === "american"
      ? String(fast0.bettor ?? "none")
      : "none",
  );

  function contextRows(): (readonly [string, string])[] {
    const rows: [string, string][] = [
      [tx("calc.riichi.winner", "Winner"), `${name(context.winner)} · ${windName(context.winner)}`],
      ["Win", winWord(context.winType)],
    ];
    if (context.winType === "ron")
      rows.push([
        tx("calc.riichi.discarded-by", "Discarded by"),
        `${name(context.payer)} · ${windName(context.payer)}`,
      ]);
    rows.push(["Dealer", tx("calc.riichi.v-0-east", `${name(context.dealer)} · East`, name(context.dealer))]);
    if (variant === "riichi") {
      rows.push([tx("calc.riichi.repeat-counter", "Repeat counter"), String(context.honba)]);
      if (opts.riichiLine) rows.push(["Riichi", opts.riichiLine]);
    }
    return rows;
  }

  function fastDraft(): CalculationDraft {
    let entered: CalculatorInput;
    if (variant === "american")
      entered = {
        variant,
        path: "fast",
        context,
        value: Number(valueInput.value),
        jokerless: jokerless.control.checked,
        singlesPairs: singles.control.checked,
        ...(bettorSel.value !== "none"
          ? {
              bettor:
                bettorSel.value === "wall"
                  ? ("wall" as const)
                  : Number(bettorSel.value),
            }
          : {}),
      };
    else
      entered = {
        variant,
        path: "fast",
        context,
        han: hanVal,
        fu: fuVal,
        yakuman: yakVal,
      };
    return { input: entered, corrections: [] };
  }

  function handValueNote(): string {
    if (context.honba > 0 && opts.pot > 0)
      return tx("calc.riichi.before-the-repeat-counter-and-the-riichi-deposit", "Before the repeat counter and the riichi deposit.");
    if (context.honba > 0) return tx("calc.riichi.before-the-repeat-counter", "Before the repeat counter.");
    if (opts.pot > 0) return tx("calc.riichi.before-the-riichi-deposit", "Before the riichi deposit.");
    return "";
  }

  function renderFast(): void {
    show(opts.standalone ? tx("calc.riichi.hand-calculator", "Hand calculator") : tx("calc.riichi.hand-value", "Hand value"));
    if (opts.standalone) {
      screen.append(
        el("p", tx("calc.riichi.one-hand-no-session-east-is-the-dealer", "One hand, no session. East is the dealer."), "cx-note"),
      );
      screen.append(standaloneWinnerPanel());
    } else {
      screen.append(cxContextPanel(contextRows()));
    }
    const live = el("div");
    if (variant === "american") {
      const panel = el("section", "", "cx-panel");
      panel.append(
        el(
          "p",
          tx("calc.riichi.enter-the-printed-value-from-your-own-physical-c", "Enter the printed value from your own physical card. Card hands and patterns are not included."),
          "cx-note",
        ),
        field(tx("calc.riichi.printed-value", "Printed value"), valueInput),
        jokerless.node,
        singles.node,
        ...(opts.bettorName ? [field(tx("calc.riichi.bettors-choice", "Bettor’s choice"), bettorSel)] : []),
      );
      screen.append(panel);
    } else {
      const panel = el("section", "", "cx-panel cx-value-panel");
      hanCtl = cxStepperChips({
        label: tx("calc.riichi.han", "Han"),
        value: hanVal,
        min: 1,
        max: 13,
        chips: [1, 2, 3, 4, 5],
        onChange: (n) => {
          hanVal = n;
          paintLive();
        },
      });
      fuCtl = cxStepperChips({
        label: tx("calc.riichi.fu", "Fu"),
        value: fuVal,
        min: 20,
        max: 110,
        sequence: FU_SEQUENCE,
        chips: [20, 25, 30, 40, 50, 60],
        onChange: (n) => {
          fuVal = n;
          paintLive();
        },
      });
      yakCtl = cxStepperChips({
        label: tx("calc.riichi.yakuman-multiple", "Yakuman multiple"),
        value: yakVal,
        min: 0,
        max: 6,
        onChange: (n) => {
          yakVal = n;
          paintLive();
        },
      });
      panel.append(
        hanCtl.node,
        el("div", "", "cx-divider"),
        fuCtl.node,
        el("div", "", "cx-divider"),
        yakCtl.node,
      );
      screen.append(panel);
      screen.append(
        el(
          "p",
          tx("calc.riichi.fast-entry-uses-the-scoring-units-you-enter-conf", "Fast entry uses the scoring units you enter. Confirm that the hand has a scoring pattern beyond bonus tiles."),
          "cx-note",
        ),
      );
    }
    screen.append(live);
    // The primary verb comes first: with the tiles escalation
    // interposed above it, "Show payments" fell below the fold
    // at 390×844 (audit B7). The escalation follows it.
    if (!opts.standalone)
      screen.append(
        btn(
          tx("calc.riichi.show-payments", "Show payments"),
          () => opts.safe(() => renderPreview(fastDraft())),
          "primary",
        ),
      );
    if (variant === "riichi") {
      screen.append(
        btn(tx("calc.riichi.score-it-from-the-tiles", "Score it from the tiles"), () => renderTiles(), "cx-quiet"),
        el(
          "p",
          tx("calc.riichi.enter-the-tiles-instead-the-winner-and-win-type", "Enter the tiles instead. The winner and win type carry over."),
          "cx-note",
        ),
      );
    }
    paintLive();

    function paintLive(): void {
      if (variant !== "riichi") return;
      const han = hanVal,
        fu = fuVal,
        yakuman = yakVal;
      if (opts.standalone) {
        const pts = computeRiichiPoints(
          han,
          fu,
          yakuman,
          context.winner === context.dealer,
          context.winType,
          0,
        );
        const lines: string[] = [];
        let total = 0;
        if (context.winType === "ron") {
          total = pts.ronPoints!;
          lines.push(
            tx("calc.riichi.v-0-pays-1-points", `${name(context.payer)} pays ${total.toLocaleString("en-US")} points`, name(context.payer), total.toLocaleString("en-US")),
          );
        } else {
          for (let s = 0; s < 4; s++) {
            if (s === context.winner) continue;
            const amount =
              s === context.dealer
                ? pts.tsumoPoints!.dealer
                : pts.tsumoPoints!.nonDealer;
            total += amount;
            lines.push(
              tx("calc.riichi.v-0-pays-1-points", `${name(s)} pays ${amount.toLocaleString("en-US")} points`, name(s), amount.toLocaleString("en-US")),
            );
          }
        }
        const lead =
          context.winType === "ron"
            ? tx("calc.riichi.v-0-wins-on-a-discard-from-1-2-han-3-fu", `${name(context.winner)} wins on a discard from ${name(context.payer)} · ${han} han · ${fu} fu`, name(context.winner), name(context.payer), han, fu)
            : tx("calc.riichi.v-0-wins-by-self-draw-1-han-2-fu", `${name(context.winner)} wins by self-draw · ${han} han · ${fu} fu`, name(context.winner), han, fu);
        live.replaceChildren(
          cxPaymentBlock({
            lead,
            lines,
            big: tx("calc.riichi.v-0-receives-1-points", `${name(context.winner)} receives ${total.toLocaleString("en-US")} points`, name(context.winner), total.toLocaleString("en-US")),
          }),
        );
      } else {
        const pts = computeRiichiPoints(
          han,
          fu,
          yakuman,
          context.winner === context.dealer,
          context.winType,
          0,
        );
        const total =
          context.winType === "ron"
            ? pts.ronPoints!
            : context.winner === context.dealer
              ? 3 * pts.tsumoPoints!.nonDealer
              : 2 * pts.tsumoPoints!.nonDealer + pts.tsumoPoints!.dealer;
        const note = handValueNote();
        live.replaceChildren(
          cxPaymentBlock({
            lead: tx("calc.riichi.v-0-han-1-fu-2", `${han} han · ${fu} fu${yakuman ? " " + tx("calc.riichi.v-0-yakuman", `· ${yakuman}× yakuman`, yakuman) : ""}`, han, fu, yakuman ? " " + tx("calc.riichi.v-0-yakuman", `· ${yakuman}× yakuman`, yakuman) : ""),
            lines: [],
            big: tx("calc.riichi.hand-value-0-points", `Hand value ${total.toLocaleString("en-US")} points`, total.toLocaleString("en-US")),
            ...(note ? { notes: [note] } : {}),
          }),
        );
      }
    }
  }

  /** Standalone only: winner / win type / discarder chips (07c). */
  function standaloneWinnerPanel(): HTMLElement {
    const panel = el("section", "", "cx-panel slim");
    const chips = el("div", "", "cx-seatchips c4");
    for (let s = 0; s < 4; s++) {
      const c = btn(
        WIND_NAMES[s]!,
        () => {
          context.winner = s;
          if (context.payer === s) context.payer = (s + 1) % 4;
          renderFast();
        },
        "cx-seatchip",
      );
      if (s === context.winner) c.classList.add("sel");
      c.setAttribute("aria-pressed", String(s === context.winner));
      chips.append(c);
    }
    panel.append(cxLabel(tx("calc.riichi.winner", "Winner")), chips, cxLabel(tx("calc.riichi.win-type", "Win type")));
    const choices = el("div", "", "cx-choices");
    for (const t of ["tsumo", "ron"] as const) {
      const c = btn(
        t === "tsumo" ? tx("calc.riichi.self-draw", "Self-draw") : tx("calc.riichi.on-a-discard", "On a discard"),
        () => {
          context.winType = t;
          renderFast();
        },
        "cx-choice",
      );
      if (context.winType === t) c.classList.add("on");
      c.setAttribute("aria-pressed", String(context.winType === t));
      choices.append(c);
    }
    panel.append(choices);
    if (context.winType === "ron") {
      panel.append(cxLabel(tx("calc.riichi.discarded-by", "Discarded by")));
      const others = [0, 1, 2, 3].filter((s) => s !== context.winner);
      const row = el("div", "", "cx-seatchips c3");
      for (const s of others) {
        const c = btn(
          WIND_NAMES[s]!,
          () => {
            context.payer = s;
            renderFast();
          },
          "cx-seatchip",
        );
        if (s === context.payer) c.classList.add("sel");
        c.setAttribute("aria-pressed", String(s === context.payer));
        row.append(c);
      }
      panel.append(row);
    }
    return panel;
  }

  // ---- tiles-path state --------------------------------------------------
  const all = buildTileSet();
  const concealed: Tile[] = [],
    melds: { kind: Meld["kind"]; tiles: Tile[] }[] = [],
    indicators: Tile[] = [],
    ura: Tile[] = [],
    meldDraft: Tile[] = [];
  const flags: Record<string, { node: HTMLElement; control: HTMLInputElement }> =
    {};
  let tilesSeeded = false;
  function seedTiles(from: CalculationDraft | undefined): void {
    if (tilesSeeded) return;
    tilesSeeded = true;
    if (from?.input.variant === "riichi" && from.input.path === "tiles") {
      const hand = from.input.hand;
      if (from.input.evidence) {
        const e = from.input.evidence;
        concealed.push(...e.concealedIds.map((id) => all[id]!));
        e.meldIds.forEach((ids, i) =>
          melds.push({
            kind: hand.melds[i]!.kind,
            tiles: ids.map((id) => all[id]!),
          }),
        );
        indicators.push(...e.indicatorIds.map((id) => all[id]!));
        ura.push(...e.uraIds.map((id) => all[id]!));
      } else {
        const used = new Set<number>();
        const take = (type: number) => {
          const tile = all.find((t) => t.type === type && !used.has(t.id))!;
          used.add(tile.id);
          return tile;
        };
        const counts = [...hand.handCounts];
        for (const m of hand.melds) {
          melds.push({ kind: m.kind, tiles: m.tiles.map(take) });
          m.tiles.forEach((t) => counts[t]!--);
        }
        counts.forEach((n, t) => {
          for (let i = 0; i < n; i++) concealed.push(take(t));
        });
      }
    }
    for (const [key, label] of [
      ["riichi", tx("calc.riichi.riichi-declared-ready-with-a-closed-hand", "Riichi · Declared ready with a closed hand")],
      ["doubleRiichi", tx("calc.riichi.double-riichi-declared-on-the-first-uninterrupte", "Double riichi · Declared on the first uninterrupted turn")],
      ["ippatsu", tx("calc.riichi.one-shot-win-before-the-next-uninterrupted-turn", "One-shot · Win before the next uninterrupted turn")],
      ["haitei", tx("calc.riichi.self-draw-of-the-last-wall-tile", "Self-draw of the last wall tile")],
      ["houtei", tx("calc.riichi.win-on-the-final-discard", "Win on the final discard")],
      ["rinshan", tx("calc.riichi.win-on-a-quad-replacement-draw", "Win on a quad replacement draw")],
      ["chankan", tx("calc.riichi.win-by-robbing-an-added-quad", "Win by robbing an added quad")],
      ["firstDrawTsumo", tx("calc.riichi.win-on-the-first-uninterrupted-draw", "Win on the first uninterrupted draw")],
    ]) {
      const checked =
        from?.input.variant === "riichi" && from.input.path === "tiles"
          ? Boolean(
              (from.input.hand as unknown as Record<string, unknown>)[key!],
            )
          : false;
      flags[key!] = checkBox(label!, checked);
    }
  }

  function renderTiles(): void {
    seedTiles(existing);
    show(opts.standalone ? tx("calc.riichi.hand-calculator", "Hand calculator") : tx("calc.riichi.hand-value", "Hand value"));
    if (!opts.standalone) screen.append(cxContextPanel(contextRows()));
    const panel = el("section", "", "cx-panel");
    const target = select(
        [
          ["hand", tx("calc.riichi.concealed-tiles-include-winning-tile", "Concealed tiles (include winning tile)")],
          ["meld", tx("calc.riichi.declared-meld", "Declared meld")],
          ["indicator", tx("calc.riichi.dora-indicator", "Dora indicator")],
          ["ura", tx("calc.riichi.uradora-indicator-riichi-wins-only", "Uradora indicator (riichi wins only)")],
        ],
        "hand",
      ),
      meldKind = select(
        [
          ["chi", tx("calc.riichi.open-sequence-chow-chi", "Open sequence (chow / chi)")],
          ["pon", tx("calc.riichi.open-triplet-pung-pon", "Open triplet (pung / pon)")],
          ["ankan", tx("calc.riichi.concealed-quad", "Concealed quad")],
          ["daiminkan", tx("calc.riichi.open-quad", "Open quad")],
          ["shouminkan", tx("calc.riichi.added-quad", "Added quad")],
        ],
        "chi",
      );
    const handDisplay = el("div", "", "tool-entered-tiles"),
      meldDisplay = el("div"),
      bonusDisplay = el("div"),
      picker = el("div", "", "tool-tile-picker");
    const winning = select(
      all
        .filter((t) => t.id % 4 === 0)
        .map((t) => [String(t.type), tileTypeName(t.type)]),
      String(
        existing?.input.variant === "riichi" &&
          existing.input.path === "tiles"
          ? existing.input.hand.winningTileType
          : 0,
      ),
    );
    const targetTiles = () =>
      target.value === "hand"
        ? concealed
        : target.value === "meld"
          ? meldDraft
          : target.value === "indicator"
            ? indicators
            : ura;
    function drawTiles(): void {
      handDisplay.replaceChildren(
        el(
          "p",
          tx("calc.riichi.v-0-concealed-tiles-tap-an-entered-tile-to-remove", `${concealed.length} concealed tiles · Tap an entered tile to remove it`, concealed.length),
        ),
      );
      function row(values: Tile[], host: HTMLElement): void {
        const r = el("div", "", "tool-tile-row");
        values.forEach((t, i) => {
          const b = btn(
            "",
            () => {
              values.splice(i, 1);
              drawTiles();
            },
            "tile-choice",
          );
          b.setAttribute("aria-label", tx("calc.riichi.remove-0", `Remove ${tileTypeName(t.type)}`, tileTypeName(t.type)));
          b.append(opts.renderTile(t));
          r.append(b);
        });
        host.append(r);
      }
      row(concealed, handDisplay);
      meldDisplay.replaceChildren(el("h3", tx("calc.riichi.declared-melds", "Declared melds")));
      melds.forEach((m, i) => {
        const r = el("div", "", "tool-meld");
        r.append(
          el("span", m.kind),
          ...m.tiles.map(opts.renderTile),
          btn(tx("calc.riichi.remove-meld", "Remove meld"), () => {
            melds.splice(i, 1);
            drawTiles();
          }),
        );
        meldDisplay.append(r);
      });
      row(meldDraft, meldDisplay);
      bonusDisplay.replaceChildren(el("p", tx("calc.riichi.dora-indicators", "Dora indicators")));
      row(indicators, bonusDisplay);
      bonusDisplay.append(el("p", tx("calc.riichi.uradora-indicators", "Uradora indicators")));
      row(ura, bonusDisplay);
    }
    for (const representative of [
      ...all.filter((t) => t.id % 4 === 1),
      ...all.filter((t) => t.red),
    ]) {
      const b = btn(
        "",
        () =>
          opts.safe(() => {
            const dest = targetTiles();
            if (dest.length >= 18) throw new Error(tx("calc.riichi.this-tile-group-is-full", "This tile group is full"));
            const used = [
              ...concealed,
              ...melds.flatMap((m) => m.tiles),
              ...meldDraft,
              ...indicators,
              ...ura,
            ];
            const t = all.find(
              (t) =>
                t.type === representative.type &&
                t.red === representative.red &&
                !used.some((u) => u.id === t.id),
            );
            if (!t)
              throw new Error(
                tx("calc.riichi.all-physical-copies-of-that-tile-have-been-enter", "All physical copies of that tile have been entered"),
              );
            dest.push(t);
            drawTiles();
          }),
        "tile-choice",
      );
      b.setAttribute(
        "aria-label",
        tx("calc.riichi.add-0-1", `Add ${representative.red ? tx("calc.riichi.red", "red") + " " : ""}${tileTypeName(representative.type)}`, representative.red ? tx("calc.riichi.red", "red") + " " : "", tileTypeName(representative.type)),
      );
      b.append(opts.renderTile(representative));
      picker.append(b);
    }
    panel.append(
      el(
        "p",
        tx("calc.riichi.enter-your-concealed-tiles-including-the-winning", "Enter your concealed tiles including the winning tile. Add each declared meld separately. Select the winning tile and enter the visible indicators."),
        "cx-note",
      ),
      field(tx("calc.riichi.add-tiles-to", "Add tiles to"), target),
      field(tx("calc.riichi.declared-meld-type", "Declared meld type"), meldKind),
      handDisplay,
      meldDisplay,
      btn(tx("calc.riichi.add-declared-meld", "Add declared meld"), () =>
        opts.safe(() => {
          const kind = meldKind.value as Meld["kind"];
          if (melds.length >= 4) throw new Error(tx("calc.riichi.at-most-four-melds", "At most four melds"));
          const n = kind === "chi" || kind === "pon" ? 3 : 4;
          if (meldDraft.length !== n)
            throw new Error(tx("calc.riichi.enter-0-tiles-for-this-meld", `Enter ${n} tiles for this meld`, n));
          melds.push({ kind, tiles: [...meldDraft] });
          meldDraft.length = 0;
          drawTiles();
        }),
      ),
      bonusDisplay,
      picker,
      field(tx("calc.riichi.winning-tile", "Winning tile"), winning),
      ...Object.values(flags).map((c) => c.node),
    );
    screen.append(panel);
    screen.append(
      btn(
        tx("calc.riichi.show-payments", "Show payments"),
        () =>
          opts.safe(() => {
            if (meldDraft.length)
              throw new Error(tx("calc.riichi.add-or-remove-the-unfinished-meld-first", "Add or remove the unfinished meld first"));
            const tiles = [...concealed, ...melds.flatMap((m) => m.tiles)],
              counts = new Array<number>(34).fill(0);
            tiles.forEach((t) => counts[t.type]!++);
            const declared = Object.fromEntries(
              Object.entries(flags).map(([k, c]) => [k, c.control.checked]),
            );
            const bonus = [
              ...indicators,
              ...(flags["riichi"]!.control.checked ? ura : []),
            ].map((t) => doraFromIndicator(t.type));
            const dora =
              tiles.filter((t) => t.red).length +
              tiles.reduce(
                (n, t) => n + bonus.filter((d) => d === t.type).length,
                0,
              );
            const entered: CalculatorInput = {
              variant: "riichi",
              path: "tiles",
              context,
              evidence: {
                concealedIds: concealed.map((t) => t.id),
                meldIds: melds.map((m) => m.tiles.map((t) => t.id)),
                indicatorIds: indicators.map((t) => t.id),
                uraIds: ura.map((t) => t.id),
              },
              hand: {
                handCounts: counts,
                melds: melds.map((m) => ({
                  kind: m.kind,
                  tiles: m.tiles.map((t) => t.type),
                })),
                winningTileType: Number(winning.value),
                winType: context.winType,
                seatWind: 27 + windIndex(context.winner, context.dealer),
                roundWind,
                riichi: flags["riichi"]!.control.checked,
                ...declared,
                dora,
                honba: context.honba,
                riichiSticks: 0,
              },
            };
            renderPreview({ input: entered, corrections: [] });
          }),
        "primary",
      ),
      btn(tx("calc.riichi.enter-han-and-fu-instead", "Enter han and fu instead"), () => renderFast(), "cx-quiet"),
    );
    drawTiles();
  }

  // ---- check payments ----------------------------------------------------
  function renderPreview(draft: CalculationDraft): void {
    const result = calculateDraft(draft);
    show(tx("calc.riichi.check-payments", "Check payments"));
    const wins = [...staged, draft, ...partners];
    const deltas = opts.deltasFor
      ? opts.deltasFor(wins)
      : foldPayments(4, result.payments);
    const order = [
      context.winner,
      ...(context.winType === "ron" ? [context.payer] : []),
      ...[0, 1, 2, 3]
        .filter(
          (s) =>
            s !== context.winner &&
            !(context.winType === "ron" && s === context.payer),
        )
        .sort(
          (a, b) =>
            windIndex(a, context.dealer) - windIndex(b, context.dealer),
        ),
    ];
    const rows = order.map((s) => ({
      name: name(s),
      suffix: opts.standalone
        ? s === context.dealer
          ? tx("calc.riichi.dealer", "· Dealer")
          : ""
        : `· ${windName(s)}${s === context.dealer ? " " + tx("calc.riichi.dealer", "· Dealer") : ""}`,
      delta: deltas[s]!,
    }));
    const headMain =
      context.winType === "ron"
        ? tx("calc.riichi.v-0-wins-on-a-discard-from-1", `${name(context.winner)} wins on a discard from ${name(context.payer)}.`, name(context.winner), name(context.payer))
        : variant === "american"
          ? tx("calc.riichi.v-0-wins-by-self-pick", `${name(context.winner)} wins by self-pick.`, name(context.winner))
          : tx("calc.riichi.v-0-wins-by-self-draw", `${name(context.winner)} wins by self-draw.`, name(context.winner));
    const headSub =
      variant === "american"
        ? tx("calc.riichi.entered-value-0-1-2", `Entered value ${draft.input.variant === "american" ? draft.input.value : ""} · ${WIND_NAMES[roundWind - 27]} ${context.dealer + 1}`, draft.input.variant === "american" ? draft.input.value : "", WIND_NAMES[roundWind - 27], context.dealer + 1)
        : tx("calc.riichi.v-0-han-1-fu-2-3-repeat-4", `${result.units} han · ${result.fu} fu · ${WIND_NAMES[roundWind - 27]} ${context.dealer + 1} · Repeat ${context.honba}`, result.units, result.fu, WIND_NAMES[roundWind - 27], context.dealer + 1, context.honba);
    const notes: string[] = [];
    if (variant === "riichi" && !opts.standalone) {
      const base = computeRiichiPoints(
        result.units,
        result.fu,
        0,
        context.winner === context.dealer,
        context.winType,
        0,
      );
      const baseTotal =
        context.winType === "ron"
          ? base.ronPoints!
          : context.winner === context.dealer
            ? 3 * base.tsumoPoints!.nonDealer
            : 2 * base.tsumoPoints!.nonDealer + base.tsumoPoints!.dealer;
      if (context.honba > 0)
        notes.push(
          context.winType === "ron"
            ? tx("calc.riichi.hand-value-0-repeat-counter-adds-1", `Hand value ${baseTotal.toLocaleString("en-US")} · Repeat counter adds ${(300 * context.honba).toLocaleString("en-US")}`, baseTotal.toLocaleString("en-US"), (300 * context.honba).toLocaleString("en-US"))
            : tx("calc.riichi.hand-value-0-repeat-counter-adds-1-to-each-payme", `Hand value ${baseTotal.toLocaleString("en-US")} · Repeat counter adds ${(100 * context.honba).toLocaleString("en-US")} to each payment`, baseTotal.toLocaleString("en-US"), (100 * context.honba).toLocaleString("en-US")),
        );
      if (opts.pot > 0) {
        const deps = opts.depositors ?? [];
        if (deps.length === 1 && opts.pot === 1000 && deps[0] === context.winner)
          notes.push(
            tx("calc.riichi.riichi-deposit-1-000-out-of-0-s-score-and-1-000", `Riichi deposit: 1,000 out of ${name(context.winner)}’s score and 1,000 back to ${name(context.winner)} as winner. No net change.`, name(context.winner), name(context.winner)),
          );
        else if (deps.length === 1 && opts.pot === 1000)
          notes.push(
            tx("calc.riichi.riichi-deposit-0-s-1-000-points-go-to-1-as-winne", `Riichi deposit: ${name(deps[0]!)}’s 1,000 points go to ${name(context.winner)} as winner.`, name(deps[0]!), name(context.winner)),
          );
        else if (opts.pot > 0)
          notes.push(
            tx("calc.riichi.riichi-deposits-0-points-go-to-1-as-winner", `Riichi deposits: ${opts.pot.toLocaleString("en-US")} points go to ${name(context.winner)} as winner.`, opts.pot.toLocaleString("en-US"), name(context.winner)),
          );
      }
    }
    cxPreview(screen, {
      headMain,
      headSub,
      rows,
      paymentLines: result.payments.map(
        (p) =>
          `${name(p.from)} pays ${name(p.to)} ${p.amount.toLocaleString("en-US")} points`,
      ),
      ...(notes.length ? { paymentNotes: notes } : {}),
      corrections: cxCorrections({
        draft,
        result,
        adjustmentLabel: tx("calc.riichi.additional-manual-scoring-units", "Additional manual scoring units"),
        showFu: variant === "riichi",
        reasonLabel: tx("calc.riichi.reason-for-manual-correction", "Reason for manual correction"),
        onApply: (d) => opts.safe(() => renderPreview(d)),
        safe: opts.safe,
      }),
      ...(opts.onRecord
        ? {
            confirmLabel: existing
              ? tx("calc.riichi.confirm-correction", "Confirm correction")
              : tx("calc.riichi.confirm-and-add-to-table", "Confirm and add to table"),
            onConfirm: () => opts.onRecord!(wins),
          }
        : {}),
      ...(opts.multipleRon &&
      context.winType === "ron" &&
      !existing &&
      opts.onStage
        ? {
            extraAction: {
              label: tx("calc.riichi.add-another-simultaneous-winner", "Add another simultaneous winner"),
              action: () => opts.onStage!(draft),
            },
          }
        : {}),
      onEdit: () =>
        draft.input.path === "tiles" ? renderTiles() : renderFast(),
    });
  }

  if (existing) opts.safe(() => renderPreview(existing));
  else renderFast();
}
