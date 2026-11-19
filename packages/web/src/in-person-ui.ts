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
import { pluralS, tx } from "./i18n/index.js";

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
    pageTitle = tx("tools.inperson.at-the-table", "At the table"),
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
  back.setAttribute("aria-label", tx("tools.inperson.back", "Back"));
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
        e instanceof Error ? e.message : tx("tools.inperson.this-entry-could-not-be-saved", "This entry could not be saved");
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
    tx("tools.inperson.player-0", `Player ${seat + 1}`, seat + 1);
  function list(): void {
    current = undefined;
    flow = undefined;
    subBack = undefined;
    start(tx("tools.inperson.at-the-table", "At the table"));
    if (options.savedAccountCopy)
      main.append(
        el(
          "p",
          tx("tools.inperson.account-copy-saved-on-this-device-reconnect-and", "Account copy saved on this device. Reconnect and sign in to the same account to sync."),
          "dim",
        ),
      );
    const savedSessions = readTables(options.accountId);
    main.append(
      el(
        "p",
        tx("tools.inperson.manual-calculation-and-scorekeeping-work-offline", "Manual calculation and scorekeeping work offline. Sessions use points; agree any monetary stakes at your table."),
        "dim",
      ),
    );
    // Empty state at zero saved sessions (audit C17): starting a
    // session is the screen's primary verb (the sheet-tinted
    // .primary); the one-off calculator is the quieter panel
    // button, so the two no longer carry equal weight.
    if (!savedSessions.length)
      main.append(
        el("p", tx("tools.inperson.no-sessions-yet", "No sessions yet."), "dim"),
      );
    main.append(
      button(tx("tools.inperson.new-table-session", "New table session"), setup),
      button(tx("tools.inperson.one-off-hand-calculator", "One-off hand calculator"), showStandalone, ""),
    );
    if (options.accountId) {
      main.append(
        button(tx("tools.inperson.load-private-account-sessions", "Load private account sessions"), () => {
          status.textContent = tx("tools.inperson.loading-account-sessions", "Loading account sessions…");
          void pullTables(options.accountId!)
            .then(() => {
              if (alive) list();
            })
            .catch(() => {
              status.textContent =
                tx("tools.inperson.account-unavailable-local-sessions-are-still-ava", "Account unavailable. Local sessions are still available.");
            });
        }),
      );
      if (readTables().length)
        main.append(
          button(tx("tools.inperson.copy-device-sessions-into-this-accounts-local-li", "Copy device sessions into this account’s local library"), () =>
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
          tx("tools.inperson.saved-on-this-device-sign-in-from-more-for-optio", "Saved on this device. Sign in from More for optional private account carry-over."),
          "dim",
        ),
      );
    for (const copy of readTables(options.accountId).reverse())
      main.append(
        button(
          tx("tools.inperson.v-0-1-2", `${copy.session.variant === "american" ? tx("tools.inperson.american-payment-helper", "American payment helper") : copy.session.variant === "hong-kong" ? tx("tools.inperson.hong-kong-old-style", "Hong Kong Old Style") : copy.session.variant === "mcr" ? tx("tools.inperson.mcr", "MCR") : copy.session.variant === "taiwanese" ? tx("tools.inperson.taiwanese", "Taiwanese") : tx("tools.inperson.riichi", "Riichi")} · ${copy.session.names.join(", ")} · ${copy.session.finished || riichiBust(copy.session) ? tx("tools.inperson.finished", "Finished") : tx("tools.inperson.in-progress", "In progress")}`, copy.session.variant === "american" ? tx("tools.inperson.american-payment-helper", "American payment helper") : copy.session.variant === "hong-kong" ? tx("tools.inperson.hong-kong-old-style", "Hong Kong Old Style") : copy.session.variant === "mcr" ? tx("tools.inperson.mcr", "MCR") : copy.session.variant === "taiwanese" ? tx("tools.inperson.taiwanese", "Taiwanese") : tx("tools.inperson.riichi", "Riichi"), copy.session.names.join(", "), copy.session.finished || riichiBust(copy.session) ? tx("tools.inperson.finished", "Finished") : tx("tools.inperson.in-progress", "In progress")),
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
    start(tx("tools.inperson.new-table-session", "New table session"));
    const form = el("form"),
      preset = select(
        Object.keys(TABLE_PRESETS).map((key) => [
          key,
          key === "taiwanese-every-flower@1"
            ? tx("tools.inperson.taiwanese-every-flower-30-10", "Taiwanese · Every-flower 30/10")
            : key === "mcr-2006@1"
              ? tx("tools.inperson.mcr-wmo-2006", "MCR · WMO 2006")
              : key === "hong-kong-clear@1"
                ? tx("tools.inperson.hong-kong-old-style-clear-chapter", "Hong Kong Old Style · Clear Chapter")
                : key === "american-payments@1"
                  ? tx("tools.inperson.american-entered-card-values", "American · Entered card values")
                  : key === "riichi-multiple-winners@1"
                    ? tx("tools.inperson.riichi-multiple-winners", "Riichi · Multiple winners")
                    : tx("tools.inperson.openmahjong-riichi", "OpenMahjong Riichi"),
        ]),
        "openmahjong-riichi-table@1",
      );
    form.append(field(tx("tools.inperson.named-preset", "Named preset"), preset));
    const names = SEATS.map((wind, index) => {
      const i = input(tx("tools.inperson.player-0", `Player ${index + 1}`, index + 1), "text");
      i.maxLength = 60;
      i.required = true;
      form.append(field(tx("tools.inperson.v-0-starting-seat-name", `${wind} starting seat · Name`, wind), i));
      return i;
    });
    const scores = SEATS.map((wind) => {
      const i = input(25000);
      form.append(field(tx("tools.inperson.v-0-starting-points", `${wind} starting points`, wind), i));
      return i;
    });
    const multiple = select(
      [
        ["head-bump", tx("tools.inperson.nearest-winner-only", "Nearest winner only")],
        ["all", tx("tools.inperson.all-simultaneous-winners", "All simultaneous winners")],
      ],
      "head-bump",
    );
    const settlement = select(
      [
        ["openmahjong", tx("tools.inperson.openmahjong-rank-bonuses", "OpenMahjong rank bonuses")],
        ["raw", tx("tools.inperson.point-difference-only", "Point difference only")],
      ],
      "openmahjong",
    );
    const pot = select(
      [
        ["leader", tx("tools.inperson.award-outstanding-deposits-to-leader", "Award outstanding deposits to leader")],
        ["return-deposits", tx("tools.inperson.return-unclaimed-deposits", "Return unclaimed deposits")],
      ],
      "leader",
    );
    const bettor = input("", "text");
    bettor.maxLength = 60;
    form.append(
      field(tx("tools.inperson.discard-win-priority", "Discard win priority"), multiple),
      field(tx("tools.inperson.final-standings", "Final standings"), settlement),
      field(tx("tools.inperson.unclaimed-deposits", "Unclaimed deposits"), pot),
      field(tx("tools.inperson.american-only-optional-bettor-name", "American only · Optional bettor name"), bettor),
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
    const create = el("button", tx("tools.inperson.start-scorekeeper", "Start scorekeeper"), "primary");
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
    boxed = true,
  ): HTMLElement {
    // Ledger entries pass boxed=false: their payment line is a
    // plain divider-list row, not the deep-tint block (audit C14).
    const box = el("div", "", boxed ? "payment-lines" : "payment-lines cx-ledger-pay");
    for (const p of values)
      box.append(
        el(
          "p",
          tx("tools.inperson.v-0-pays-1-2-points", `${name(p.from)} pays ${name(p.to)} ${p.amount.toLocaleString("en-US")} points`, name(p.from), name(p.to), p.amount.toLocaleString("en-US")),
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
    if (ns.length === 2) return tx("tools.inperson.v-0-and-1", `${ns[0]} and ${ns[1]}`, ns[0], ns[1]);
    return tx("tools.inperson.v-0-and-1", `${ns.slice(0, -1).join(", ")} and ${ns[ns.length - 1]}`, ns.slice(0, -1).join(", "), ns[ns.length - 1]);
  }
  function showSession(): void {
    if (!current) return;
    subBack = undefined;
    const session = current.session;
    start(
      session.variant === "american"
        ? tx("tools.inperson.american-scorekeeper", "American scorekeeper")
        : session.variant === "hong-kong"
          ? tx("tools.inperson.hong-kong-scorekeeper", "Hong Kong scorekeeper")
          : session.variant === "mcr"
            ? tx("tools.inperson.mcr-scorekeeper", "MCR scorekeeper")
            : session.variant === "taiwanese"
              ? tx("tools.inperson.taiwanese-scorekeeper", "Taiwanese scorekeeper")
              : tx("tools.inperson.riichi-scorekeeper", "Riichi scorekeeper"),
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
          : tx("tools.inperson.v-0-1-2-2", `${WIND_NAMES[state.roundWind - 27]} ${state.dealer + 1}${
              session.variant === "riichi"
                ? " " + tx("tools.inperson.repeat-0", `· Repeat ${state.honba}`, state.honba)
                : session.variant === "taiwanese" && state.honba > 0
                  ? " " + tx("tools.inperson.dealer-repeats-0", `· Dealer repeats ${state.honba}`, state.honba)
                  : ""
            }`, WIND_NAMES[state.roundWind - 27], state.dealer + 1, session.variant === "riichi"
                ? " " + tx("tools.inperson.repeat-0", `· Repeat ${state.honba}`, state.honba)
                : session.variant === "taiwanese" && state.honba > 0
                  ? " " + tx("tools.inperson.dealer-repeats-0", `· Dealer repeats ${state.honba}`, state.honba)
                  : "");
      let stripSub: string;
      if (session.variant === "riichi") {
        if (totals.pot <= 0) stripSub = tx("tools.inperson.no-riichi-sticks", "No riichi sticks");
        else {
          const deps = depositors(session),
            sticks = totals.pot / 1000;
          stripSub =
            deps.length && Number.isInteger(sticks)
              ? tx("tools.inperson.v-0-riichi-stick-1-declared-by-2", `${sticks} riichi stick${sticks > 1 ? "s" : ""} · declared by ${joinNames(deps)}`, sticks, pluralS(sticks), joinNames(deps))
              : tx("tools.inperson.v-0-points-in-outstanding-deposits", `${totals.pot.toLocaleString("en-US")} points in outstanding deposits`, totals.pot.toLocaleString("en-US"));
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
        el("p", tx("tools.inperson.tap-a-seat-to-record-that-players-win", "Tap a seat to record that player’s win."), "cx-instruct"),
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
            tx("tools.inperson.v-0-winner-1-staged-on-2-s-discard-tap-the-next-wi", `${flow.staged.length} winner${flow.staged.length > 1 ? "s" : ""} staged on ${name(flow.stagedPayer!)}’s discard. Tap the next winner’s seat, or confirm from the staged winner’s payments.`, flow.staged.length, pluralS(flow.staged.length), name(flow.stagedPayer!)),
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
          tx("tools.inperson.a-player-fell-below-zero-points-so-this-riichi-g", "A player fell below zero points, so this Riichi game has ended. No further entries or deposits can be recorded. Corrections and undo remain available, and the final standings and settlement are below."),
          "card",
        ),
      );
    if (sealed)
      main.append(
        el(
          "p",
          tx("tools.inperson.this-session-is-finished-and-read-only-reopen-it", "This session is finished and read-only. Reopen it to make changes."),
          "dim",
        ),
      );
    const undoBtn = button(tx("tools.inperson.undo-last", "Undo last"), () =>
      safe(() => {
        save(undoTable(current!));
        showSession();
      }),
    );
    undoBtn.setAttribute("aria-label", tx("tools.inperson.undo-last-entry", "Undo last entry"));
    undoBtn.disabled = !nextUndoTarget(session);
    if (active) {
      const row = el("div", "", "cx-actions");
      const settleBtn = button(tx("tools.inperson.settlement", "Settlement"), finish);
      settleBtn.className = "cx-action cx-action-settle";
      row.append(
        actionBtn(tx("tools.inperson.drawn-hand", "Drawn hand"), () => eventForm("draw")),
        actionBtn(tx("tools.inperson.penalty", "Penalty"), () => eventForm("penalty")),
        undoBtn,
        settleBtn,
      );
      undoBtn.className = "cx-action";
      main.append(row);
      if (session.variant === "riichi")
        main.append(
          button(
            tx("tools.inperson.record-riichi-deposit", "Record riichi deposit"),
            () => eventForm("deposit"),
            "cx-deposit",
          ),
        );
    } else {
      const row = el("div", "", "cx-actions cx-actions-2");
      const settleBtn = button(tx("tools.inperson.settlement", "Settlement"), finish);
      settleBtn.className = "cx-action cx-action-settle";
      if (!sealed) {
        undoBtn.className = "cx-action";
        row.append(undoBtn);
      }
      row.append(settleBtn);
      if (sealed) {
        const reopen = button(tx("tools.inperson.reopen-session", "Reopen session"), () => safe(reopenSession));
        reopen.className = "cx-action";
        row.append(reopen);
      }
      main.append(row);
    }
    if (busted) {
      main.append(el("h2", tx("tools.inperson.final-standings-and-settlement", "Final standings and settlement")));
      renderSettlement(main);
    }
    if (options.accountId)
      main.append(
        button(tx("tools.inperson.sync-privately-to-account", "Sync privately to account"), () => {
          const auth = options.getAuth
            ? options.getAuth()
            : options.csrfToken
              ? { accountId: options.accountId!, csrfToken: options.csrfToken }
              : undefined;
          if (!auth || auth.accountId !== options.accountId) {
            status.textContent =
              tx("tools.inperson.saved-on-this-device-reconnect-and-sign-in-to-th", "Saved on this device. Reconnect and sign in to the same account to sync.");
            return;
          }
          status.textContent = tx("tools.inperson.syncing", "Syncing…");
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
                  ? tx("tools.inperson.saved-to-your-private-account", "Saved to your private account.")
                  : result === "conflict"
                    ? tx("tools.inperson.conflicting-offline-edits-preserved-keep-both-co", "Conflicting offline edits preserved. Keep both copies to continue.")
                    : tx("tools.inperson.offline-or-account-unavailable-your-local-edits", "Offline or account unavailable. Your local edits remain saved.");
            })
            .catch(
              () =>
                (status.textContent =
                  tx("tools.inperson.sync-unavailable-your-local-edits-remain-saved", "Sync unavailable. Your local edits remain saved.")),
            );
        }),
      );
    if (current.conflict)
      main.append(
        button(tx("tools.inperson.keep-both-conflicting-copies", "Keep both conflicting copies"), () =>
          safe(() => {
            current = preserveTableConflict(current!, options.accountId!);
            showSession();
          }),
        ),
      );
    main.append(el("h2", tx("tools.inperson.hand-ledger", "Hand ledger")));
    if (!totals.rows.length)
      main.append(
        el("p", tx("tools.inperson.no-hands-recorded-yet", "No hands recorded yet."), "dim"),
      );
    for (const row of totals.rows) {
      const card = el("section", "", "card ledger-row");
      card.append(
        el(
          "h3",
          row.event.kind === "win"
            ? tx("tools.inperson.winning-hand", "Winning hand")
            : row.event.kind === "draw"
              ? tx("tools.inperson.no-winner", "No winner")
              : row.event.kind === "deposit"
                ? tx("tools.inperson.riichi-deposit", "Riichi deposit")
                : tx("tools.inperson.penalty", "Penalty"),
        ),
      );
      if (row.event.kind === "win")
        for (const draft of row.event.wins)
          card.append(payments(calculateDraft(draft).payments, false));
      if (row.event.kind === "penalty")
        card.append(el("p", row.event.reason), payments(row.event.payments, false));
      card.append(
        el(
          "p",
          row.delta
            .map((delta, i) => tx("tools.inperson.v-0-1-2-2", `${name(i)} ${delta > 0 ? "+" : ""}${delta}`, name(i), delta > 0 ? "+" : delta < 0 ? "-" : "", Math.abs(delta).toLocaleString("en-US")))
            .join(" · "),
          "dim",
        ),
      );
      if (!current.session.finished)
        card.append(
          button(tx("tools.inperson.correct-this-entry", "Correct this entry"), () =>
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
        tx("tools.inperson.v-0-1-2-3", `${f.staged.length ? tx("tools.inperson.next-winner", "Next winner") : tx("tools.inperson.winner", "Winner")} · ${name(winner)} — ${wind}`, f.staged.length ? tx("tools.inperson.next-winner", "Next winner") : tx("tools.inperson.winner", "Winner"), name(winner), wind),
        "cx-label",
      ),
    );
    if (f.staged.length) {
      panel.append(
        el(
          "p",
          tx("tools.inperson.on-a-discard-from-0-the-same-discard-as-the-stag", `On a discard from ${name(f.stagedPayer!)} · the same discard as the staged winner${f.staged.length > 1 ? "s" : ""}.`, name(f.stagedPayer!), pluralS(f.staged.length)),
          "cx-note",
        ),
        (() => {
          const cont = button(
            tx("tools.inperson.continue-to-hand-value", "Continue to hand value"),
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
        ? tx("tools.inperson.self-pick-joker-exchange", "Self-pick / Joker exchange")
        : tx("tools.inperson.self-draw", "Self-draw"),
      () =>
        showCalculator(undefined, [], { winner, winType: "tsumo" }),
      "",
    );
    tsumoBtn.className = "cx-choice";
    const ronBtn = button(
      tx("tools.inperson.on-a-discard", "On a discard"),
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
      panel.append(el("p", tx("tools.inperson.discarded-by", "Discarded by"), "cx-label"));
      const others = [0, 1, 2, 3]
        .filter((s) => s !== winner)
        .sort(
          (a, b) => windIndex(a, dealer) - windIndex(b, dealer),
        );
      const chips = el("div", "", "cx-seatchips c3");
      for (const s of others) {
        const chip = button(
          tx("tools.inperson.v-0-1", `${name(s)} · ${WIND_NAMES[windIndex(s, dealer)]}`, name(s), WIND_NAMES[windIndex(s, dealer)]),
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
    start(tx("tools.inperson.hand-calculator", "Hand calculator"));
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
        ? tx("tools.inperson.correct-entry", "Correct entry")
        : kind === "draw"
          ? tx("tools.inperson.hand-without-a-winner", "Hand without a winner")
          : kind === "deposit"
            ? tx("tools.inperson.riichi-deposit", "Riichi deposit")
            : tx("tools.inperson.penalty", "Penalty"),
    );
    const form = el("form"),
      seats = current.session.names.map((n, i) => [String(i), n] as const);
    const who = select(
      seats,
      String(previous?.kind === "deposit" ? previous.seat : 0),
    );
    const reason = select(
      [
        ["exhaustive", tx("tools.inperson.wall-exhausted", "Wall exhausted")],
        ["abortive", tx("tools.inperson.aborted-hand", "Aborted hand")],
      ],
      previous?.kind === "draw" ? previous.reason : "exhaustive",
    );
    const ready = current.session.names.map((n, i) =>
      check(
        tx("tools.inperson.v-0-ready-one-tile-from-a-complete-hand", `${n} ready (one tile from a complete hand)`, n),
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
      check(tx("tools.inperson.v-0-receives-payment", `${n} receives payment`, n), i !== 0),
    );
    const penaltyType = select(
        [
          ["custom", tx("tools.inperson.agreed-penalty-payments", "Agreed penalty payments")],
          ["chombo", tx("tools.inperson.chombo-reverse-mangan", "Chombo · Reverse mangan")],
        ],
        "custom",
      ),
      penaltyDealer = derivedSessionState(current.session, recordId).dealer;
    const wallBet = check(tx("tools.inperson.bettor-selected-the-wall-and-no-player-won", "Bettor selected the wall and no player won"));
    const wallValue = input(25);
    if (kind === "draw") {
      form.append(field(tx("tools.inperson.how-the-hand-ended", "How the hand ended"), reason));
      if (current.session.variant === "riichi")
        form.append(...ready.map((c) => c.node));
      if (current.session.bettorName)
        form.append(
          wallBet.node,
          field(tx("tools.inperson.lowest-value-on-your-physical-card", "Lowest value on your physical card"), wallValue),
        );
    }
    if (kind === "deposit")
      form.append(
        field(tx("tools.inperson.player-declaring-riichi", "Player declaring riichi"), who),
        el("p", tx("tools.inperson.transfers-1-000-points-to-the-outstanding-pot", "Transfers 1,000 points to the outstanding pot.")),
      );
    if (kind === "penalty")
      form.append(
        ...(current.session.variant === "riichi"
          ? [field(tx("tools.inperson.penalty-preset", "Penalty preset"), penaltyType)]
          : []),
        field(tx("tools.inperson.paying-player", "Paying player"), who),
        field(tx("tools.inperson.points-per-recipient-agreed-payments", "Points per recipient (agreed payments)"), amount),
        ...recipients.map((c) => c.node),
        field(tx("tools.inperson.reason", "Reason"), note),
        el(
          "p",
          current.session.variant === "riichi"
            ? tx("tools.inperson.use-your-tables-agreed-penalty-reverse-mangan-pa", "Use your table’s agreed penalty. Reverse mangan pays 4,000 to each opponent for an East offender, or 4,000 to East and 2,000 to each other opponent.")
            : tx("tools.inperson.each-checked-recipient-receives-the-entered-tabl", "Each checked recipient receives the entered table-agreed penalty."),
          "dim",
        ),
      );
    const submit = el("button", tx("tools.inperson.review-entry", "Review entry"), "primary");
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
            reason: tx("tools.inperson.chombo-reverse-mangan", "Chombo · Reverse mangan"),
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
          el("h2", tx("tools.inperson.confirm-points", "Confirm points")),
          el("p", totals.scores.map((s, i) => `${name(i)} ${s}`).join(" · ")),
          ...(current!.session.variant === "riichi"
            ? [el("p", tx("tools.inperson.v-0-points-in-deposits", `${totals.pot} points in deposits`, totals.pot))]
            : []),
          button(tx("tools.inperson.confirm-and-record", "Confirm and record"), () =>
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
    // Competition ranking is kept ("1., 2., 2., 4."), but a shared
    // rank is labelled so it does not read as a numbering error
    // (audit B8).
    const rankCounts = new Map<number, number>();
    for (const entry of result.standings)
      rankCounts.set(entry.rank, (rankCounts.get(entry.rank) ?? 0) + 1);
    for (const entry of result.standings)
      host.append(
        el(
          "p",
          tx("tools.inperson.v-0-1-2-points-3-4-5", `${entry.rank}. ${name(entry.seat)} · ${entry.score.toLocaleString("en-US")} points · ${entry.points > 0 ? "+" : ""}${formatStandingsPoints(entry.points)}${current.session.settings.settlement === "openmahjong" ? " " + tx("tools.inperson.rank-settlement", "rank settlement") : " " + tx("tools.inperson.net-points", "net points")}`, entry.rank, name(entry.seat), entry.score.toLocaleString("en-US"), entry.points > 0 ? "+" : "", formatStandingsPoints(entry.points), current.session.settings.settlement === "openmahjong" ? " " + tx("tools.inperson.rank-settlement", "rank settlement") : " " + tx("tools.inperson.net-points", "net points")) +
            ((rankCounts.get(entry.rank) ?? 0) > 1
              ? " " + tx("tools.inperson.tied", "· Tied")
              : ""),
          "card",
        ),
      );
    host.append(
      el("h2", tx("tools.inperson.point-transfers", "Point transfers")),
      payments(result.transfers),
      el(
        "p",
        current.session.settings.settlement === "openmahjong"
          ? tx("tools.inperson.transfers-settle-the-point-balances-rank-bonuses", "Transfers settle the point balances. Rank bonuses above are a separate standings score.")
          : tx("tools.inperson.these-transfers-settle-each-players-net-point-ba", "These transfers settle each player’s net point balance."),
        "dim",
      ),
    );
  }
  function finish(): void {
    if (!current) return;
    subBack = () => showSession();
    start(tx("tools.inperson.settlement", "Settlement"));
    renderSettlement(main);
    if (riichiBust(current.session))
      main.append(
        el(
          "p",
          tx("tools.inperson.this-riichi-game-ended-when-a-player-fell-below", "This Riichi game ended when a player fell below zero points."),
          "dim",
        ),
      );
    else if (current.session.finished)
      main.append(
        button(tx("tools.inperson.reopen-session", "Reopen session"), () => safe(reopenSession)),
      );
    else
      main.append(
        button(tx("tools.inperson.finish-session", "Finish session"), () =>
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
      start(recordId ? tx("tools.inperson.correct-winning-hand", "Correct winning hand") : tx("tools.inperson.hand-calculator", "Hand calculator"));
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
    start(tx("tools.inperson.hand-value", "Hand value"));
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
                ? tx("tools.inperson.declared-by-0-the-1-000-point-deposit-settles-wi", `Declared by ${name(deps[0]!)} · the 1,000-point deposit settles with this hand`, name(deps[0]!))
                : tx("tools.inperson.declared-by-0-the-1-points-in-deposits-settle-wi", `Declared by ${joinNames(deps)} · the ${totals.pot.toLocaleString("en-US")} points in deposits settle with this hand`, joinNames(deps), totals.pot.toLocaleString("en-US"));
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
