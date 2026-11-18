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
  const name = (seat: number) => opts.names[seat] ?? `Player ${seat + 1}`;
  const windName = (seat: number) =>
    WIND_NAMES[windIndex(seat, context.dealer)]!;
  const winWord = (t: "ron" | "tsumo") =>
    t === "ron"
      ? "On a discard"
      : variant === "american"
        ? "Self-pick / Joker exchange"
        : "Self-draw";

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
    "Jokerless at the win",
    fast0?.variant === "american" ? fast0.jokerless : false,
  );
  const singles = checkBox(
    "Singles and Pairs hand (no jokerless double)",
    fast0?.variant === "american" ? fast0.singlesPairs : false,
  );
  const bettorSel = select(
    [
      ["none", "No bettor"],
      ["wall", "Bettor chose the wall"],
      ...opts.names.map(
        (n, i) => [String(i), `Bettor chose ${n}`] as const,
      ),
    ],
    fast0?.variant === "american"
      ? String(fast0.bettor ?? "none")
      : "none",
  );

  function contextRows(): (readonly [string, string])[] {
    const rows: [string, string][] = [
      ["Winner", `${name(context.winner)} · ${windName(context.winner)}`],
      ["Win", winWord(context.winType)],
    ];
    if (context.winType === "ron")
      rows.push([
        "Discarded by",
        `${name(context.payer)} · ${windName(context.payer)}`,
      ]);
    rows.push(["Dealer", `${name(context.dealer)} · East`]);
    if (variant === "riichi") {
      rows.push(["Repeat counter", String(context.honba)]);
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
      return "Before the repeat counter and the riichi deposit.";
    if (context.honba > 0) return "Before the repeat counter.";
    if (opts.pot > 0) return "Before the riichi deposit.";
    return "";
  }

  function renderFast(): void {
    show(opts.standalone ? "Hand calculator" : "Hand value");
    if (opts.standalone) {
      screen.append(
        el("p", "One hand, no session. East is the dealer.", "cx-note"),
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
          "Enter the printed value from your own physical card. Card hands and patterns are not included.",
          "cx-note",
        ),
        field("Printed value", valueInput),
        jokerless.node,
        singles.node,
        ...(opts.bettorName ? [field("Bettor’s choice", bettorSel)] : []),
      );
      screen.append(panel);
    } else {
      const panel = el("section", "", "cx-panel");
      hanCtl = cxStepperChips({
        label: "Han",
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
        label: "Fu",
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
        label: "Yakuman multiple",
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
          "Fast entry uses the scoring units you enter. Confirm that the hand has a scoring pattern beyond bonus tiles.",
          "cx-note",
        ),
      );
    }
    screen.append(live);
    if (variant === "riichi") {
      screen.append(
        btn("Score it from the tiles", () => renderTiles(), "cx-quiet"),
        el(
          "p",
          "Enter the tiles instead. The winner and win type carry over.",
          "cx-note",
        ),
      );
    }
    if (!opts.standalone)
      screen.append(
        btn(
          "Show payments",
          () => opts.safe(() => renderPreview(fastDraft())),
          "primary",
        ),
      );
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
            `${name(context.payer)} pays ${total.toLocaleString("en-US")} points`,
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
              `${name(s)} pays ${amount.toLocaleString("en-US")} points`,
            );
          }
        }
        const lead =
          context.winType === "ron"
            ? `${name(context.winner)} wins on a discard from ${name(context.payer)} · ${han} han · ${fu} fu`
            : `${name(context.winner)} wins by self-draw · ${han} han · ${fu} fu`;
        live.replaceChildren(
          cxPaymentBlock({
            lead,
            lines,
            big: `${name(context.winner)} receives ${total.toLocaleString("en-US")} points`,
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
            lead: `${han} han · ${fu} fu${yakuman ? ` · ${yakuman}× yakuman` : ""}`,
            lines: [],
            big: `Hand value ${total.toLocaleString("en-US")} points`,
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
    panel.append(cxLabel("Winner"), chips, cxLabel("Win type"));
    const choices = el("div", "", "cx-choices");
    for (const t of ["tsumo", "ron"] as const) {
      const c = btn(
        t === "tsumo" ? "Self-draw" : "On a discard",
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
      panel.append(cxLabel("Discarded by"));
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
      ["riichi", "Riichi · Declared ready with a closed hand"],
      ["doubleRiichi", "Double riichi · Declared on the first uninterrupted turn"],
      ["ippatsu", "One-shot · Win before the next uninterrupted turn"],
      ["haitei", "Self-draw of the last wall tile"],
      ["houtei", "Win on the final discard"],
      ["rinshan", "Win on a quad replacement draw"],
      ["chankan", "Win by robbing an added quad"],
      ["firstDrawTsumo", "Win on the first uninterrupted draw"],
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
    show(opts.standalone ? "Hand calculator" : "Hand value");
    if (!opts.standalone) screen.append(cxContextPanel(contextRows()));
    const panel = el("section", "", "cx-panel");
    const target = select(
        [
          ["hand", "Concealed tiles (include winning tile)"],
          ["meld", "Declared meld"],
          ["indicator", "Dora indicator"],
          ["ura", "Uradora indicator (riichi wins only)"],
        ],
        "hand",
      ),
      meldKind = select(
        [
          ["chi", "Open sequence (chow / chi)"],
          ["pon", "Open triplet (pung / pon)"],
          ["ankan", "Concealed quad"],
          ["daiminkan", "Open quad"],
          ["shouminkan", "Added quad"],
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
          `${concealed.length} concealed tiles · Tap an entered tile to remove it`,
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
          b.setAttribute("aria-label", `Remove ${tileTypeName(t.type)}`);
          b.append(opts.renderTile(t));
          r.append(b);
        });
        host.append(r);
      }
      row(concealed, handDisplay);
      meldDisplay.replaceChildren(el("h3", "Declared melds"));
      melds.forEach((m, i) => {
        const r = el("div", "", "tool-meld");
        r.append(
          el("span", m.kind),
          ...m.tiles.map(opts.renderTile),
          btn("Remove meld", () => {
            melds.splice(i, 1);
            drawTiles();
          }),
        );
        meldDisplay.append(r);
      });
      row(meldDraft, meldDisplay);
      bonusDisplay.replaceChildren(el("p", "Dora indicators"));
      row(indicators, bonusDisplay);
      bonusDisplay.append(el("p", "Uradora indicators"));
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
            if (dest.length >= 18) throw new Error("This tile group is full");
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
                "All physical copies of that tile have been entered",
              );
            dest.push(t);
            drawTiles();
          }),
        "tile-choice",
      );
      b.setAttribute(
        "aria-label",
        `Add ${representative.red ? "red " : ""}${tileTypeName(representative.type)}`,
      );
      b.append(opts.renderTile(representative));
      picker.append(b);
    }
    panel.append(
      el(
        "p",
        "Enter your concealed tiles including the winning tile. Add each declared meld separately. Select the winning tile and enter the visible indicators.",
        "cx-note",
      ),
      field("Add tiles to", target),
      field("Declared meld type", meldKind),
      handDisplay,
      meldDisplay,
      btn("Add declared meld", () =>
        opts.safe(() => {
          const kind = meldKind.value as Meld["kind"];
          if (melds.length >= 4) throw new Error("At most four melds");
          const n = kind === "chi" || kind === "pon" ? 3 : 4;
          if (meldDraft.length !== n)
            throw new Error(`Enter ${n} tiles for this meld`);
          melds.push({ kind, tiles: [...meldDraft] });
          meldDraft.length = 0;
          drawTiles();
        }),
      ),
      bonusDisplay,
      picker,
      field("Winning tile", winning),
      ...Object.values(flags).map((c) => c.node),
    );
    screen.append(panel);
    screen.append(
      btn(
        "Show payments",
        () =>
          opts.safe(() => {
            if (meldDraft.length)
              throw new Error("Add or remove the unfinished meld first");
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
      btn("Enter han and fu instead", () => renderFast(), "cx-quiet"),
    );
    drawTiles();
  }

  // ---- check payments ----------------------------------------------------
  function renderPreview(draft: CalculationDraft): void {
    const result = calculateDraft(draft);
    show("Check payments");
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
          ? "· Dealer"
          : ""
        : `· ${windName(s)}${s === context.dealer ? " · Dealer" : ""}`,
      delta: deltas[s]!,
    }));
    const headMain =
      context.winType === "ron"
        ? `${name(context.winner)} wins on a discard from ${name(context.payer)}.`
        : variant === "american"
          ? `${name(context.winner)} wins by self-pick.`
          : `${name(context.winner)} wins by self-draw.`;
    const headSub =
      variant === "american"
        ? `Entered value ${draft.input.variant === "american" ? draft.input.value : ""} · ${WIND_NAMES[roundWind - 27]} ${context.dealer + 1}`
        : `${result.units} han · ${result.fu} fu · ${WIND_NAMES[roundWind - 27]} ${context.dealer + 1} · Repeat ${context.honba}`;
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
            ? `Hand value ${baseTotal.toLocaleString("en-US")} · Repeat counter adds ${(300 * context.honba).toLocaleString("en-US")}`
            : `Hand value ${baseTotal.toLocaleString("en-US")} · Repeat counter adds ${(100 * context.honba).toLocaleString("en-US")} to each payment`,
        );
      if (opts.pot > 0) {
        const deps = opts.depositors ?? [];
        if (deps.length === 1 && opts.pot === 1000 && deps[0] === context.winner)
          notes.push(
            `Riichi deposit: 1,000 out of ${name(context.winner)}’s score and 1,000 back to ${name(context.winner)} as winner. No net change.`,
          );
        else if (deps.length === 1 && opts.pot === 1000)
          notes.push(
            `Riichi deposit: ${name(deps[0]!)}’s 1,000 points go to ${name(context.winner)} as winner.`,
          );
        else if (opts.pot > 0)
          notes.push(
            `Riichi deposits: ${opts.pot.toLocaleString("en-US")} points go to ${name(context.winner)} as winner.`,
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
        adjustmentLabel: "Additional manual scoring units",
        showFu: variant === "riichi",
        reasonLabel: "Reason for manual correction",
        onApply: (d) => opts.safe(() => renderPreview(d)),
        safe: opts.safe,
      }),
      ...(opts.onRecord
        ? {
            confirmLabel: existing
              ? "Confirm correction"
              : "Confirm and add to table",
            onConfirm: () => opts.onRecord!(wins),
          }
        : {}),
      ...(opts.multipleRon &&
      context.winType === "ron" &&
      !existing &&
      opts.onStage
        ? {
            extraAction: {
              label: "Add another simultaneous winner",
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
