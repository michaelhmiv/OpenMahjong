import {
  TABLE_PRESETS,
  activeTableEvents,
  calculateDraft,
  computeRiichiPoints,
  derivedSessionState,
  recomputeSession,
  riichiBust,
  sessionSettlement,
  validateScoringSession,
  type CalculationDraft,
  type ScoringSession,
  type TableEvent,
  type Tile,
} from "@openmahjong/engine";
import { formatStandingsPoints } from "./records.js";
import {
  trackCalculatorUsed,
  trackScorekeeperSessionFinished,
} from "./analytics.js";
import { mountVariantCalculator } from "./variant-calculator-ui.js";
import { mountRiichiCalculator } from "./riichi-calculator-ui.js";
import {
  WIND_NAMES,
  cxSeatGrid,
  cxStrip,
  windIndex,
} from "./compact-calc.js";
import {
  appendTableEvent,
  nextUndoTarget,
  preserveTableConflict,
  pullTables,
  readTables,
  syncTable,
  tableId,
  undoTable,
  writeTable,
  type TableCopy,
} from "./in-person-store.js";

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
function field(label: string, control: HTMLElement): HTMLLabelElement {
  const l = el("label", label, "tool-field");
  control.setAttribute("aria-label", label);
  l.append(control);
  return l;
}
function input(value: string | number, type = "number"): HTMLInputElement {
  const i = el("input");
  i.type = type;
  i.value = String(value);
  if (type === "number") {
    i.min = "0";
    i.max = "1000000";
    i.step = "1";
  }
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
function check(
  label: string,
  checked = false,
): { node: HTMLElement; control: HTMLInputElement } {
  const control = input("", "checkbox");
  control.checked = checked;
  return { node: field(label, control), control };
}
const SEATS = ["East", "South", "West", "North"];
export interface TableUIOptions {
  onBack: () => void;
  renderTile: (tile: Tile) => HTMLElement;
  accountId?: string;
  csrfToken?: string;
  initialId?: string;
  onChange?: () => void;
  savedAccountCopy?: boolean;
  getAuth?: () => { accountId: string; csrfToken: string } | undefined;
}

interface WinFlow {
  winner?: number;
  winType?: "ron" | "tsumo";
  payer?: number;
  staged: CalculationDraft[];
  stagedPayer?: number;
}

export function mountInPerson(
  container: HTMLElement,
  options: TableUIOptions,
): { destroy(): void } {
  let alive = true,
    current: TableCopy | undefined,
    pageTitle = "At the table",
    subBack: (() => void) | undefined,
    flow: WinFlow | undefined;
  const shell = el("div", "", "learning-shell table-tools"),
    header = el("header"),
    main = el("main", "", "tools-content");
  const status = el("p", "", "tool-status");
  status.setAttribute("role", "status");
  const back = button("‹", () => {
    if (subBack) subBack();
    else if (current) list();
    else options.onBack();
  });
  back.setAttribute("aria-label", "Back");
  const title = el("h1", pageTitle);
  header.append(back, title);
  shell.append(header, main);
  container.replaceChildren(shell);
  function start(titleText: string): void {
    pageTitle = titleText;
    title.textContent = pageTitle;
    main.replaceChildren(status);
    main.scrollTop = 0;
    status.textContent = "";
  }
  function safe(action: () => void): void {
    try {
      action();
    } catch (e) {
      status.textContent =
        e instanceof Error ? e.message : "This entry could not be saved";
    }
  }
  function save(copy: TableCopy): void {
    writeTable(copy, options.accountId);
    current = copy;
    options.onChange?.();
  }
  const name = (seat: number) =>
    current?.session.names[seat] ??
    current?.session.bettorName ??
    `Player ${seat + 1}`;
  function list(): void {
    current = undefined;
    flow = undefined;
    subBack = undefined;
    start("At the table");
    if (options.savedAccountCopy)
      main.append(
        el(
          "p",
          "Account copy saved on this device. Reconnect and sign in to the same account to sync.",
          "dim",
        ),
      );
    main.append(
      el(
        "p",
        "Manual calculation and scorekeeping work offline. Sessions use points; agree any monetary stakes at your table.",
        "dim",
      ),
      button("New table session", setup),
      button("One-off hand calculator", showStandalone),
    );
    if (options.accountId) {
      main.append(
        button("Load private account sessions", () => {
          status.textContent = "Loading account sessions…";
          void pullTables(options.accountId!)
            .then(() => {
              if (alive) list();
            })
            .catch(() => {
              status.textContent =
                "Account unavailable. Local sessions are still available.";
            });
        }),
      );
      if (readTables().length)
        main.append(
          button("Copy device sessions into this account’s local library", () =>
            safe(() => {
              for (const row of readTables())
                if (
                  !readTables(options.accountId).some(
                    (r) => r.session.id === row.session.id,
                  )
                )
                  writeTable(
                    {
                      session: row.session,
                      baseRevision: 0,
                      syncedLocalRevision: -1,
                    },
                    options.accountId,
                  );
              list();
            }),
          ),
        );
    } else
      main.append(
        el(
          "p",
          "Saved on this device. Sign in from More for optional private account carry-over.",
          "dim",
        ),
      );
    for (const copy of readTables(options.accountId).reverse())
      main.append(
        button(
          `${copy.session.variant === "american" ? "American payment helper" : copy.session.variant === "hong-kong" ? "Hong Kong Old Style" : copy.session.variant === "mcr" ? "MCR" : copy.session.variant === "taiwanese" ? "Taiwanese" : "Riichi"} · ${copy.session.names.join(", ")} · ${copy.session.finished || riichiBust(copy.session) ? "Finished" : "In progress"}`,
          () => {
            current = copy;
            flow = undefined;
            showSession();
          },
          "tool-session",
        ),
      );
  }
  function setup(): void {
    subBack = () => list();
    start("New table session");
    const form = el("form"),
      preset = select(
        Object.keys(TABLE_PRESETS).map((key) => [
          key,
          key === "taiwanese-every-flower@1"
            ? "Taiwanese · Every-flower 30/10"
            : key === "mcr-2006@1"
              ? "MCR · WMO 2006"
              : key === "hong-kong-clear@1"
                ? "Hong Kong Old Style · Clear Chapter"
                : key === "american-payments@1"
                  ? "American · Entered card values"
                  : key === "riichi-multiple-winners@1"
                    ? "Riichi · Multiple winners"
                    : "OpenMahjong Riichi",
        ]),
        "openmahjong-riichi-table@1",
      );
    form.append(field("Named preset", preset));
    const names = SEATS.map((wind, index) => {
      const i = input(`Player ${index + 1}`, "text");
      i.maxLength = 60;
      i.required = true;
      form.append(field(`${wind} starting seat · Name`, i));
      return i;
    });
    const scores = SEATS.map((wind) => {
      const i = input(25000);
      form.append(field(`${wind} starting points`, i));
      return i;
    });
    const multiple = select(
      [
        ["head-bump", "Nearest winner only"],
        ["all", "All simultaneous winners"],
      ],
      "head-bump",
    );
    const settlement = select(
      [
        ["openmahjong", "OpenMahjong rank bonuses"],
        ["raw", "Point difference only"],
      ],
      "openmahjong",
    );
    const pot = select(
      [
        ["leader", "Award outstanding deposits to leader"],
        ["return-deposits", "Return unclaimed deposits"],
      ],
      "leader",
    );
    const bettor = input("", "text");
    bettor.maxLength = 60;
    form.append(
      field("Discard win priority", multiple),
      field("Final standings", settlement),
      field("Unclaimed deposits", pot),
      field("American only · Optional bettor name", bettor),
    );
    preset.addEventListener("change", () => {
      const p = TABLE_PRESETS[preset.value as keyof typeof TABLE_PRESETS];
      scores.forEach((i) => (i.value = String(p.startingScore)));
      multiple.value = p.settings.multipleRon;
      settlement.value = p.settings.settlement;
      multiple.disabled = p.variant !== "riichi";
      settlement.disabled = p.variant !== "riichi";
      pot.disabled = p.variant !== "riichi";
    });
    const create = el("button", "Start scorekeeper", "primary");
    create.type = "submit";
    form.append(create);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      safe(() => {
        const p = TABLE_PRESETS[preset.value as keyof typeof TABLE_PRESETS];
        const session = validateScoringSession({
          v: 1,
          id: tableId(),
          variant: p.variant,
          preset: preset.value,
          names: names.map((i) => i.value),
          startingScores: scores.map((i) => Number(i.value)),
          settings: {
            multipleRon: multiple.value,
            settlement: settlement.value,
            finalPot: pot.value,
          },
          ...(p.variant === "american" && bettor.value.trim()
            ? { bettorName: bettor.value.trim() }
            : {}),
          revision: 0,
          updatedAt: new Date().toISOString(),
          finished: false,
          ledger: [],
        });
        save({ session, baseRevision: 0, syncedLocalRevision: -1 });
        flow = undefined;
        showSession();
      });
    });
    main.append(form);
  }
  function payments(
    values: readonly { from: number; to: number; amount: number }[],
  ): HTMLElement {
    const box = el("div", "", "payment-lines");
    for (const p of values)
      box.append(
        el(
          "p",
          `${name(p.from)} pays ${name(p.to)} ${p.amount.toLocaleString("en-US")} points`,
        ),
      );
    return box;
  }
  function record(event: TableEvent, recordId?: string): void {
    if (!current) return;
    flow = undefined;
    save(appendTableEvent(current, event, recordId));
    showSession();
  }
  /** Seats holding the outstanding deposits, in declaration order. */
  function depositors(session: ScoringSession): number[] {
    const seats: number[] = [];
    for (const { event } of activeTableEvents(session)) {
      if (event.kind === "win") seats.length = 0;
      else if (event.kind === "deposit" && !seats.includes(event.seat))
        seats.push(event.seat);
    }
    return seats;
  }
  function joinNames(seats: readonly number[]): string {
    const ns = seats.map((s) => name(s));
    if (ns.length <= 1) return ns[0] ?? "";
    if (ns.length === 2) return `${ns[0]} and ${ns[1]}`;
    return `${ns.slice(0, -1).join(", ")} and ${ns[ns.length - 1]}`;
  }
  function showSession(): void {
    if (!current) return;
    subBack = undefined;
    const session = current.session;
    start(
      session.variant === "american"
        ? "American scorekeeper"
        : session.variant === "hong-kong"
          ? "Hong Kong scorekeeper"
          : session.variant === "mcr"
            ? "MCR scorekeeper"
            : session.variant === "taiwanese"
              ? "Taiwanese scorekeeper"
              : "Riichi scorekeeper",
    );
    const totals = recomputeSession(session);
    const busted = riichiBust(session);
    const sealed = session.finished;
    const active = !sealed && !busted;
    const state = derivedSessionState(session);
    if (!sealed) {
      const stripMain =
        session.variant === "american"
          ? `Hand ${totals.rows.length + 1}`
          : `${WIND_NAMES[state.roundWind - 27]} ${state.dealer + 1}${
              session.variant === "riichi"
                ? ` · Repeat ${state.honba}`
                : session.variant === "taiwanese" && state.honba > 0
                  ? ` · Dealer repeats ${state.honba}`
                  : ""
            }`;
      let stripSub: string;
      if (session.variant === "riichi") {
        if (totals.pot <= 0) stripSub = "No riichi sticks";
        else {
          const deps = depositors(session),
            sticks = totals.pot / 1000;
          stripSub =
            deps.length && Number.isInteger(sticks)
              ? `${sticks} riichi stick${sticks > 1 ? "s" : ""} · declared by ${joinNames(deps)}`
              : `${totals.pot.toLocaleString("en-US")} points in outstanding deposits`;
        }
      } else stripSub = `${name(state.dealer)} deals`;
      main.append(cxStrip(stripMain, stripSub));
    }
    const seatInfos = [0, 1, 2, 3].map((i) => ({
      seat: i,
      name: name(i),
      score: totals.scores[i]!,
      wind: windIndex(i, state.dealer),
      dealer: i === state.dealer,
    }));
    if (active) {
      main.append(
        el("p", "Tap a seat to record that player’s win.", "cx-instruct"),
      );
      main.append(
        cxSeatGrid(seatInfos, {
          interactive: true,
          ...(flow?.winner !== undefined
            ? { selectedSeat: flow.winner }
            : {}),
          onTap: tapSeat,
        }),
      );
      if (flow?.staged.length)
        main.append(
          el(
            "p",
            `${flow.staged.length} winner${flow.staged.length > 1 ? "s" : ""} staged on ${name(flow.stagedPayer!)}’s discard. Tap the next winner’s seat, or confirm from the staged winner’s payments.`,
            "cx-staged",
          ),
        );
      if (flow?.winner !== undefined) main.append(winnerPanel(state.dealer));
    } else {
      main.append(cxSeatGrid(seatInfos, { interactive: false }));
    }
    if (busted)
      main.append(
        el(
          "p",
          "A player fell below zero points, so this Riichi game has ended. No further entries or deposits can be recorded. Corrections and undo remain available, and the final standings and settlement are below.",
          "card",
        ),
      );
    if (sealed)
      main.append(
        el(
          "p",
          "This session is finished and read-only. Reopen it to make changes.",
          "dim",
        ),
      );
    const undoBtn = button("Undo last", () =>
      safe(() => {
        save(undoTable(current!));
        showSession();
      }),
    );
    undoBtn.setAttribute("aria-label", "Undo last entry");
    undoBtn.disabled = !nextUndoTarget(session);
    if (active) {
      const row = el("div", "", "cx-actions");
      const settleBtn = button("Settlement", finish);
      settleBtn.className = "cx-action cx-action-settle";
      row.append(
        actionBtn("Drawn hand", () => eventForm("draw")),
        actionBtn("Penalty", () => eventForm("penalty")),
        undoBtn,
        settleBtn,
      );
      undoBtn.className = "cx-action";
      main.append(row);
      if (session.variant === "riichi")
        main.append(
          button(
            "Record riichi deposit",
            () => eventForm("deposit"),
            "cx-deposit",
          ),
        );
    } else {
      const row = el("div", "", "cx-actions cx-actions-2");
      const settleBtn = button("Settlement", finish);
      settleBtn.className = "cx-action cx-action-settle";
      if (!sealed) {
        undoBtn.className = "cx-action";
        row.append(undoBtn);
      }
      row.append(settleBtn);
      if (sealed) {
        const reopen = button("Reopen session", () => safe(reopenSession));
        reopen.className = "cx-action";
        row.append(reopen);
      }
      main.append(row);
    }
    if (busted) {
      main.append(el("h2", "Final standings and settlement"));
      renderSettlement(main);
    }
    if (options.accountId)
      main.append(
        button("Sync privately to account", () => {
          const auth = options.getAuth
            ? options.getAuth()
            : options.csrfToken
              ? { accountId: options.accountId!, csrfToken: options.csrfToken }
              : undefined;
          if (!auth || auth.accountId !== options.accountId) {
            status.textContent =
              "Saved on this device. Reconnect and sign in to the same account to sync.";
            return;
          }
          status.textContent = "Syncing…";
          const id = current!.session.id;
          void syncTable(id, auth)
            .then((result) => {
              if (!alive) return;
              current = readTables(options.accountId).find(
                (c) => c.session.id === id,
              );
              showSession();
              status.textContent =
                result === "saved"
                  ? "Saved to your private account."
                  : result === "conflict"
                    ? "Conflicting offline edits preserved. Keep both copies to continue."
                    : "Offline or account unavailable. Your local edits remain saved.";
            })
            .catch(
              () =>
                (status.textContent =
                  "Sync unavailable. Your local edits remain saved."),
            );
        }),
      );
    if (current.conflict)
      main.append(
        button("Keep both conflicting copies", () =>
          safe(() => {
            current = preserveTableConflict(current!, options.accountId!);
            showSession();
          }),
        ),
      );
    main.append(el("h2", "Hand ledger"));
    for (const row of totals.rows) {
      const card = el("section", "", "card ledger-row");
      card.append(
        el(
          "h3",
          row.event.kind === "win"
            ? "Winning hand"
            : row.event.kind === "draw"
              ? "No winner"
              : row.event.kind === "deposit"
                ? "Riichi deposit"
                : "Penalty",
        ),
      );
      if (row.event.kind === "win")
        for (const draft of row.event.wins)
          card.append(payments(calculateDraft(draft).payments));
      if (row.event.kind === "penalty")
        card.append(el("p", row.event.reason), payments(row.event.payments));
      card.append(
        el(
          "p",
          row.delta
            .map((delta, i) => `${name(i)} ${delta > 0 ? "+" : ""}${delta}`)
            .join(" · "),
          "dim",
        ),
      );
      if (!current.session.finished)
        card.append(
          button("Correct this entry", () =>
            row.event.kind === "win"
              ? showCalculator(row.id, row.event.wins)
              : eventForm(row.event.kind, row.id, row.event),
          ),
        );
      main.append(card);
    }
  }
  function actionBtn(text: string, action: () => void): HTMLButtonElement {
    const b = button(text, action, "");
    b.className = "cx-action";
    return b;
  }
  function tapSeat(seat: number): void {
    if (flow?.winner === seat && !flow.winType && !flow.staged.length) {
      flow = undefined;
      showSession();
      return;
    }
    if (flow?.staged.length) {
      flow = {
        staged: flow.staged,
        ...(flow.stagedPayer !== undefined
          ? { stagedPayer: flow.stagedPayer }
          : {}),
        winner: seat,
        winType: "ron",
        payer: flow.stagedPayer!,
      };
    } else {
      flow = { staged: flow?.staged ?? [], winner: seat };
    }
    showSession();
  }
  function winnerPanel(dealer: number): HTMLElement {
    const f = flow!;
    const winner = f.winner!;
    const panel = el("section", "", "cx-panel cx-winner-panel");
    const wind = WIND_NAMES[windIndex(winner, dealer)]!;
    panel.append(
      el(
        "p",
        `${f.staged.length ? "Next winner" : "Winner"} · ${name(winner)} — ${wind}`,
        "cx-label",
      ),
    );
    if (f.staged.length) {
      panel.append(
        el(
          "p",
          `On a discard from ${name(f.stagedPayer!)} · the same discard as the staged winner${f.staged.length > 1 ? "s" : ""}.`,
          "cx-note",
        ),
        (() => {
          const cont = button(
            "Continue to hand value",
            () =>
              showCalculator(undefined, [], {
                winner,
                winType: "ron",
                payer: f.stagedPayer!,
              }),
            "",
          );
          cont.className = "cx-choice on";
          return cont;
        })(),
      );
      return panel;
    }
    const choices = el("div", "", "cx-choices");
    const tsumoBtn = button(
      current!.session.variant === "american"
        ? "Self-pick / Joker exchange"
        : "Self-draw",
      () =>
        showCalculator(undefined, [], { winner, winType: "tsumo" }),
      "",
    );
    tsumoBtn.className = "cx-choice";
    const ronBtn = button(
      "On a discard",
      () => {
        flow = { ...f, winType: "ron" };
        showSession();
      },
      "",
    );
    ronBtn.className = `cx-choice${f.winType === "ron" ? " on" : ""}`;
    ronBtn.setAttribute("aria-pressed", String(f.winType === "ron"));
    choices.append(tsumoBtn, ronBtn);
    panel.append(choices);
    if (f.winType === "ron") {
      panel.append(el("p", "Discarded by", "cx-label"));
      const others = [0, 1, 2, 3]
        .filter((s) => s !== winner)
        .sort(
          (a, b) => windIndex(a, dealer) - windIndex(b, dealer),
        );
      const chips = el("div", "", "cx-seatchips c3");
      for (const s of others) {
        const chip = button(
          `${name(s)} · ${WIND_NAMES[windIndex(s, dealer)]}`,
          () =>
            showCalculator(undefined, [], {
              winner,
              winType: "ron",
              payer: s,
            }),
          "",
        );
        chip.className = "cx-seatchip";
        chips.append(chip);
      }
      panel.append(chips);
    }
    return panel;
  }
  function sessionDeltas(
    drafts: readonly CalculationDraft[],
    recordId?: string,
  ): number[] {
    const totals = recomputeSession(current!.session);
    const proposed = appendTableEvent(
      current!,
      { kind: "win", wins: drafts },
      recordId,
    );
    const next = recomputeSession(proposed.session);
    return next.scores.map((s, i) => s - totals.scores[i]!);
  }
  function showStandalone(): void {
    subBack = () => list();
    trackCalculatorUsed();
    start("Hand calculator");
    const root = el("div");
    main.append(root);
    mountRiichiCalculator(root, {
      variant: "riichi",
      names: [...WIND_NAMES],
      dealer: 0,
      honba: 0,
      roundWind: 27,
      pot: 0,
      initialContext: { winner: 0, winType: "tsumo", payer: 1 },
      multipleRon: false,
      standalone: true,
      renderTile: options.renderTile,
      safe,
      setTitle: (t) => {
        start(t);
        main.append(root);
      },
    });
  }
  function eventForm(
    kind: "draw" | "deposit" | "penalty",
    recordId?: string,
    previous?: TableEvent,
  ): void {
    if (!current) return;
    subBack = () => showSession();
    start(
      recordId
        ? "Correct entry"
        : kind === "draw"
          ? "Hand without a winner"
          : kind === "deposit"
            ? "Riichi deposit"
            : "Penalty",
    );
    const form = el("form"),
      seats = current.session.names.map((n, i) => [String(i), n] as const);
    const who = select(
      seats,
      String(previous?.kind === "deposit" ? previous.seat : 0),
    );
    const reason = select(
      [
        ["exhaustive", "Wall exhausted"],
        ["abortive", "Aborted hand"],
      ],
      previous?.kind === "draw" ? previous.reason : "exhaustive",
    );
    const ready = current.session.names.map((n, i) =>
      check(
        `${n} ready (one tile from a complete hand)`,
        previous?.kind === "draw" && previous.ready.includes(i),
      ),
    );
    const amount = input(1000),
      note = input(
        previous?.kind === "penalty" ? previous.reason : "Agreed penalty",
        "text",
      );
    note.maxLength = 240;
    const recipients = current.session.names.map((n, i) =>
      check(`${n} receives payment`, i !== 0),
    );
    const penaltyType = select(
        [
          ["custom", "Agreed penalty payments"],
          ["chombo", "Chombo · Reverse mangan"],
        ],
        "custom",
      ),
      penaltyDealer = derivedSessionState(current.session, recordId).dealer;
    const wallBet = check("Bettor selected the wall and no player won");
    const wallValue = input(25);
    if (kind === "draw") {
      form.append(field("How the hand ended", reason));
      if (current.session.variant === "riichi")
        form.append(...ready.map((c) => c.node));
      if (current.session.bettorName)
        form.append(
          wallBet.node,
          field("Lowest value on your physical card", wallValue),
        );
    }
    if (kind === "deposit")
      form.append(
        field("Player declaring riichi", who),
        el("p", "Transfers 1,000 points to the outstanding pot."),
      );
    if (kind === "penalty")
      form.append(
        ...(current.session.variant === "riichi"
          ? [field("Penalty preset", penaltyType)]
          : []),
        field("Paying player", who),
        field("Points per recipient (agreed payments)", amount),
        ...recipients.map((c) => c.node),
        field("Reason", note),
        el(
          "p",
          current.session.variant === "riichi"
            ? "Use your table’s agreed penalty. Reverse mangan pays 4,000 to each opponent for an East offender, or 4,000 to East and 2,000 to each other opponent."
            : "Each checked recipient receives the entered table-agreed penalty.",
          "dim",
        ),
      );
    const submit = el("button", "Review entry", "primary");
    submit.type = "submit";
    form.append(submit);
    const preview = el("div");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      safe(() => {
        let event: TableEvent;
        if (kind === "deposit") event = { kind, seat: Number(who.value) };
        else if (kind === "draw")
          event = {
            kind,
            reason: reason.value as "exhaustive" | "abortive",
            ready: ready.flatMap((c, i) => (c.control.checked ? [i] : [])),
            ...(wallBet.control.checked
              ? { wallBetValue: Number(wallValue.value) }
              : {}),
          };
        else
          event = {
            kind,
            reason: note.value,
            payments: recipients.flatMap((c, i) =>
              c.control.checked
                ? [
                    {
                      from: Number(who.value),
                      to: i,
                      amount: Number(amount.value),
                    },
                  ]
                : [],
            ),
          };
        if (kind === "penalty" && penaltyType.value === "chombo") {
          const offender = Number(who.value),
            east = penaltyDealer,
            p = computeRiichiPoints(
              5,
              0,
              0,
              offender === east,
              "tsumo",
              0,
            ).tsumoPoints!;
          event = {
            kind: "penalty",
            reason: "Chombo · Reverse mangan",
            payments: [0, 1, 2, 3]
              .filter((i) => i !== offender)
              .map((i) => ({
                from: offender,
                to: i,
                amount: i === east ? p.dealer : p.nonDealer,
              })),
          };
        }
        const proposed = appendTableEvent(current!, event, recordId);
        const totals = recomputeSession(proposed.session);
        preview.replaceChildren(
          el("h2", "Confirm points"),
          el("p", totals.scores.map((s, i) => `${name(i)} ${s}`).join(" · ")),
          ...(current!.session.variant === "riichi"
            ? [el("p", `${totals.pot} points in deposits`)]
            : []),
          button("Confirm and record", () =>
            safe(() => record(event, recordId)),
          ),
        );
      });
    });
    form.addEventListener("input", () => preview.replaceChildren());
    main.append(form, preview);
  }
  function reopenSession(): void {
    if (!current) return;
    save({
      ...current,
      session: {
        ...current.session,
        finished: false,
        revision: current.session.revision + 1,
        updatedAt: new Date().toISOString(),
      },
    });
    showSession();
  }
  function renderSettlement(host: HTMLElement): void {
    if (!current) return;
    const result = sessionSettlement(current.session);
    for (const entry of result.standings)
      host.append(
        el(
          "p",
          `${entry.rank}. ${name(entry.seat)} · ${entry.score.toLocaleString("en-US")} points · ${entry.points > 0 ? "+" : ""}${formatStandingsPoints(entry.points)}${current.session.settings.settlement === "openmahjong" ? " rank settlement" : " net points"}`,
          "card",
        ),
      );
    host.append(
      el("h2", "Point transfers"),
      payments(result.transfers),
      el(
        "p",
        current.session.settings.settlement === "openmahjong"
          ? "Transfers settle the point balances. Rank bonuses above are a separate standings score."
          : "These transfers settle each player’s net point balance.",
        "dim",
      ),
    );
  }
  function finish(): void {
    if (!current) return;
    subBack = () => showSession();
    start("Settlement");
    renderSettlement(main);
    if (riichiBust(current.session))
      main.append(
        el(
          "p",
          "This Riichi game ended when a player fell below zero points.",
          "dim",
        ),
      );
    else if (current.session.finished)
      main.append(
        button("Reopen session", () => safe(reopenSession)),
      );
    else
      main.append(
        button("Finish session", () =>
          safe(() => {
            save({
              ...current!,
              session: {
                ...current!.session,
                finished: true,
                revision: current!.session.revision + 1,
                updatedAt: new Date().toISOString(),
              },
            });
            trackScorekeeperSessionFinished();
            showSession();
          }),
        ),
      );
  }
  function showCalculator(
    recordId?: string,
    existing: readonly CalculationDraft[] = [],
    ctx?: { winner: number; winType: "ron" | "tsumo"; payer?: number },
  ): void {
    if (!current) return;
    trackCalculatorUsed();
    subBack = () => showSession();
    const session = current.session;
    const root = el("div");
    const setTitle = (t: string) => {
      start(t);
      main.append(root);
    };
    if (
      session.variant !== "riichi" &&
      session.variant !== "american"
    ) {
      start(recordId ? "Correct winning hand" : "Hand calculator");
      main.append(root);
      mountVariantCalculator(root, {
        session,
        ...(existing[0] ? { existing: existing[0] } : {}),
        ...(ctx
          ? {
              context: {
                winner: ctx.winner,
                winType: ctx.winType,
                payer: ctx.payer ?? (ctx.winner === 1 ? 2 : 1),
              },
            }
          : {}),
        renderTile: options.renderTile,
        onBack: showSession,
        setTitle,
        previewDeltas: (draft) => sessionDeltas([draft], recordId),
        onRecord: (draft) =>
          safe(() => record({ kind: "win", wins: [draft] }, recordId)),
      });
      return;
    }
    const variant = session.variant;
    // Dealer, round wind and honba are derived from the ledger, never
    // asked. A correction keeps the context its entry was recorded in.
    const derived = derivedSessionState(session, recordId);
    const totals = recomputeSession(session);
    const first = existing[0];
    const winnerCtx = first?.input.context ??
      (ctx
        ? {
            winner: ctx.winner,
            winType: ctx.winType,
            payer: ctx.payer ?? (ctx.winner === 1 ? 2 : 1),
          }
        : { winner: 0, winType: "ron" as const, payer: 1 });
    start("Hand value");
    main.append(root);
    mountRiichiCalculator(root, {
      variant,
      names: session.names,
      dealer: first?.input.context.dealer ?? derived.dealer,
      honba: first?.input.context.honba ?? derived.honba,
      roundWind: derived.roundWind,
      pot: recordId ? 0 : totals.pot,
      ...(!recordId && variant === "riichi" && totals.pot > 0
        ? {
            riichiLine: (() => {
              const deps = depositors(session);
              return deps.length === 1 && totals.pot === 1000
                ? `Declared by ${name(deps[0]!)} · the 1,000-point deposit settles with this hand`
                : `Declared by ${joinNames(deps)} · the ${totals.pot.toLocaleString("en-US")} points in deposits settle with this hand`;
            })(),
            depositors: depositors(session),
          }
        : {}),
      initialContext: winnerCtx,
      ...(first ? { existing: first } : {}),
      ...(existing.length > 1 ? { partners: existing.slice(1) } : {}),
      ...(flow?.staged.length ? { staged: flow.staged } : {}),
      multipleRon:
        variant === "riichi" && session.settings.multipleRon === "all",
      ...(session.bettorName ? { bettorName: session.bettorName } : {}),
      renderTile: options.renderTile,
      safe,
      setTitle,
      deltasFor: (drafts) => sessionDeltas(drafts, recordId),
      onRecord: (drafts) =>
        safe(() => record({ kind: "win", wins: drafts }, recordId)),
      onStage: (draft) => {
        if (!flow) flow = { staged: [] };
        flow = {
          staged: [...flow.staged, draft],
          stagedPayer: draft.input.context.payer,
        };
        showSession();
      },
    });
  }
  if (options.initialId)
    current = readTables(options.accountId).find(
      (c) => c.session.id === options.initialId,
    );
  if (current) showSession();
  else list();
  return {
    destroy() {
      alive = false;
      container.replaceChildren();
    },
  };
}
