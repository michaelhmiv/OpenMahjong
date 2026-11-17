import {
  TABLE_PRESETS,
  activeTableEvents,
  buildTileSet,
  calculateDraft,
  computeRiichiPoints,
  doraFromIndicator,
  recomputeSession,
  sessionSettlement,
  tileTypeName,
  validateScoringSession,
  type CalculationDraft,
  type CalculationContext,
  type CalculatorInput,
  type Meld,
  type ScoringSession,
  type TableEvent,
  type Tile,
} from "@openmahjong/engine";
import { mountVariantCalculator } from "./variant-calculator-ui.js";
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

export function mountInPerson(
  container: HTMLElement,
  options: TableUIOptions,
): { destroy(): void } {
  let alive = true,
    current: TableCopy | undefined,
    pageTitle = "At the table";
  const shell = el("div", "", "learning-shell table-tools"),
    header = el("header"),
    main = el("main", "", "tools-content");
  const status = el("p", "", "tool-status");
  status.setAttribute("role", "status");
  const back = button("‹", () => (current ? list() : options.onBack()));
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
          `${copy.session.variant === "american" ? "American payment helper" : copy.session.variant === "hong-kong" ? "Hong Kong Old Style" : copy.session.variant === "mcr" ? "MCR" : copy.session.variant === "taiwanese" ? "Taiwanese" : "Riichi"} · ${copy.session.names.join(", ")} · ${copy.session.finished ? "Finished" : "In progress"}`,
          () => {
            current = copy;
            showSession();
          },
          "tool-session",
        ),
      );
  }
  function setup(): void {
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
        showCalculator();
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
    save(appendTableEvent(current, event, recordId));
    showSession();
  }
  function showSession(): void {
    if (!current) return;
    start(
      current.session.variant === "american"
        ? "American scorekeeper"
        : current.session.variant === "hong-kong"
          ? "Hong Kong scorekeeper"
          : current.session.variant === "mcr"
            ? "MCR scorekeeper"
            : current.session.variant === "taiwanese"
              ? "Taiwanese scorekeeper"
              : "Riichi scorekeeper",
    );
    const totals = recomputeSession(current.session);
    const scores = el("section", "", "card tool-scores");
    totals.scores.forEach((score, i) =>
      scores.append(
        el("p", `${name(i)} · ${score.toLocaleString("en-US")} points`),
      ),
    );
    if (current.session.variant === "riichi")
      scores.append(
        el(
          "p",
          `${totals.pot.toLocaleString("en-US")} points in outstanding deposits`,
          "dim",
        ),
      );
    main.append(scores);
    main.append(
      button("Calculate a hand", () => showCalculator()),
      button("Hand without a winner", () => eventForm("draw")),
      button("Penalty", () => eventForm("penalty")),
    );
    if (current.session.variant === "riichi")
      main.append(button("Record riichi deposit", () => eventForm("deposit")));
    const undo = button("Undo last entry", () =>
      safe(() => {
        save(undoTable(current!));
        showSession();
      }),
    );
    undo.disabled = !nextUndoTarget(current.session);
    main.append(undo, button("Final standings and settlement", finish));
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
        button("Correct this entry", () =>
          row.event.kind === "win"
            ? showCalculator(row.id, row.event.wins)
            : eventForm(row.event.kind, row.id, row.event),
        ),
      );
      main.append(card);
    }
  }
  function eventForm(
    kind: "draw" | "deposit" | "penalty",
    recordId?: string,
    previous?: TableEvent,
  ): void {
    if (!current) return;
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
      penaltyDealer = select(seats, "0");
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
          ? [
              field("Penalty preset", penaltyType),
              field("Dealer (East)", penaltyDealer),
            ]
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
            east = Number(penaltyDealer.value),
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
  function finish(): void {
    if (!current) return;
    start("Settlement");
    const result = sessionSettlement(current.session);
    for (const entry of result.standings)
      main.append(
        el(
          "p",
          `${entry.rank}. ${name(entry.seat)} · ${entry.score.toLocaleString("en-US")} points · ${entry.points > 0 ? "+" : ""}${entry.points.toFixed(1)}${current.session.settings.settlement === "openmahjong" ? " rank settlement" : " net points"}`,
          "card",
        ),
      );
    main.append(
      el("h2", "Point transfers"),
      payments(result.transfers),
      el(
        "p",
        current.session.settings.settlement === "openmahjong"
          ? "Transfers settle the point balances. Rank bonuses above are a separate standings score."
          : "These transfers settle each player’s net point balance.",
        "dim",
      ),
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
          showSession();
        }),
      ),
    );
  }
  function showCalculator(
    recordId?: string,
    existing: readonly CalculationDraft[] = [],
  ): void {
    if (!current) return;
    start(recordId ? "Correct winning hand" : "Hand calculator");
    if (
      current.session.variant !== "riichi" &&
      current.session.variant !== "american"
    ) {
      mountVariantCalculator(main, {
        session: current.session,
        ...(existing[0] ? { existing: existing[0] } : {}),
        renderTile: options.renderTile,
        onBack: showSession,
        onRecord: (draft) =>
          safe(() => record({ kind: "win", wins: [draft] }, recordId)),
      });
      return;
    }
    const variant = current.session.variant,
      first = existing[0];
    let path = first?.input.path ?? "tiles";
    if (variant === "american") path = "fast";
    const context = first?.input.context ?? {
      winner: 0,
      dealer: 0,
      payer: 1,
      winType: "ron",
      honba: 0,
    };
    const form = el("form"),
      ctxBox = el("div", "", "tool-grid"),
      choices = current.session.names.map((n, i) => [String(i), n] as const);
    const winner = select(choices, String(context.winner)),
      dealer = select(choices, String(context.dealer)),
      payer = select(choices, String(context.payer)),
      win = select(
        [
          ["ron", "Win on a discard"],
          [
            "tsumo",
            variant === "american" ? "Self-pick / Joker exchange" : "Self-draw",
          ],
        ],
        context.winType,
      ),
      honba = input(context.honba);
    const round = select(
      SEATS.map((n, i) => [String(27 + i), n]),
      String(
        first?.input.variant === "riichi" && first.input.path === "tiles"
          ? first.input.hand.roundWind
          : 27,
      ),
    );
    if (variant === "riichi") ctxBox.append(field("Round wind", round));
    ctxBox.append(
      field("Winner", winner),
      field("Dealer (East)", dealer),
      field("Win type", win),
      field("Discarding player", payer),
    );
    if (variant === "riichi")
      ctxBox.append(field("Repeat counter (honba)", honba));
    form.append(ctxBox);
    const paths = el("div", "", "tool-grid"),
      tilePath = button("Enter actual tiles", () => switchPath("tiles")),
      fastPath = button(
        variant === "american" ? "Entered card value" : "Fast han / fu",
        () => switchPath("fast"),
      );
    if (variant !== "american") paths.append(tilePath, fastPath);
    form.append(paths);
    const tilePanel = el("section"),
      fastPanel = el("section");
    const han = input(
        first?.input.variant === "riichi" && first.input.path === "fast"
          ? first.input.han
          : 1,
      ),
      fu = select(
        [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110].map((n) => [
          String(n),
          String(n),
        ]),
        String(
          first?.input.variant === "riichi" && first.input.path === "fast"
            ? first.input.fu
            : 30,
        ),
      ),
      yakuman = input(
        first?.input.variant === "riichi" && first.input.path === "fast"
          ? first.input.yakuman
          : 0,
      );
    const value = input(
        first?.input.variant === "american" ? first.input.value : 25,
      ),
      jokerless = check(
        "Jokerless at the win",
        first?.input.variant === "american" && first.input.jokerless,
      ),
      singles = check(
        "Singles and Pairs hand (no jokerless double)",
        first?.input.variant === "american" && first.input.singlesPairs,
      );
    const bettor = select(
      [
        ["none", "No bettor"],
        ["wall", "Bettor chose the wall"],
        ...choices.map(([id, n]) => [id, `Bettor chose ${n}`] as const),
      ],
      first?.input.variant === "american"
        ? String(first.input.bettor ?? "none")
        : "none",
    );
    if (variant === "american")
      fastPanel.append(
        el(
          "p",
          "Enter the printed value from your own physical card. Card hands and patterns are not included.",
          "dim",
        ),
        field("Printed value", value),
        jokerless.node,
        singles.node,
        ...(current.session.bettorName
          ? [field("Bettor’s choice", bettor)]
          : []),
      );
    else
      fastPanel.append(
        field("Han · Scoring doubles, including bonus tiles", han),
        field("Fu · Hand points before the han multipliers", fu),
        field("True yakuman multiple (0 for ordinary hands)", yakuman),
        el(
          "p",
          "Fast entry uses the scoring units you enter. Confirm that the hand has a scoring pattern beyond bonus tiles.",
          "dim",
        ),
      );
    const concealed: Tile[] = [],
      melds: { kind: Meld["kind"]; tiles: Tile[] }[] = [],
      indicators: Tile[] = [],
      ura: Tile[] = [],
      meldDraft: Tile[] = [];
    const all = buildTileSet();
    if (first?.input.variant === "riichi" && first.input.path === "tiles") {
      if (first.input.evidence) {
        const e = first.input.evidence;
        concealed.push(...e.concealedIds.map((id) => all[id]!));
        e.meldIds.forEach((ids, i) =>
          melds.push({
            kind:
              first.input.variant === "riichi" && first.input.path === "tiles"
                ? first.input.hand.melds[i]!.kind
                : "chi",
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
        const counts = [...first.input.hand.handCounts];
        for (const m of first.input.hand.melds) {
          melds.push({ kind: m.kind, tiles: m.tiles.map(take) });
          m.tiles.forEach((t) => counts[t]!--);
        }
        counts.forEach((n, t) => {
          for (let i = 0; i < n; i++) concealed.push(take(t));
        });
      }
    }
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
        first?.input.variant === "riichi" && first.input.path === "tiles"
          ? first.input.hand.winningTileType
          : 0,
      ),
    );
    const flags: Record<string, ReturnType<typeof check>> = {};
    for (const [key, label] of [
      ["riichi", "Riichi · Declared ready with a closed hand"],
      [
        "doubleRiichi",
        "Double riichi · Declared on the first uninterrupted turn",
      ],
      ["ippatsu", "One-shot · Win before the next uninterrupted turn"],
      ["haitei", "Self-draw of the last wall tile"],
      ["houtei", "Win on the final discard"],
      ["rinshan", "Win on a quad replacement draw"],
      ["chankan", "Win by robbing an added quad"],
      ["firstDrawTsumo", "Win on the first uninterrupted draw"],
    ]) {
      const checked =
        first?.input.variant === "riichi" && first.input.path === "tiles"
          ? Boolean(
              (first.input.hand as unknown as Record<string, unknown>)[key!],
            )
          : false;
      flags[key!] = check(label!, checked);
    }
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
          const b = button(
            "",
            () => {
              values.splice(i, 1);
              drawTiles();
              output.replaceChildren();
            },
            "tile-choice",
          );
          b.setAttribute("aria-label", `Remove ${tileTypeName(t.type)}`);
          b.append(options.renderTile(t));
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
          ...m.tiles.map(options.renderTile),
          button("Remove meld", () => {
            melds.splice(i, 1);
            drawTiles();
            output.replaceChildren();
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
      const b = button(
        "",
        () =>
          safe(() => {
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
            output.replaceChildren();
          }),
        "tile-choice",
      );
      b.setAttribute(
        "aria-label",
        `Add ${representative.red ? "red " : ""}${tileTypeName(representative.type)}`,
      );
      b.append(options.renderTile(representative));
      picker.append(b);
    }
    const addMeld = button("Add declared meld", () =>
      safe(() => {
        const kind = meldKind.value as Meld["kind"];
        if (melds.length >= 4) throw new Error("At most four melds");
        const n = kind === "chi" || kind === "pon" ? 3 : 4;
        if (meldDraft.length !== n)
          throw new Error(`Enter ${n} tiles for this meld`);
        melds.push({ kind, tiles: [...meldDraft] });
        meldDraft.length = 0;
        drawTiles();
        output.replaceChildren();
      }),
    );
    tilePanel.append(
      el(
        "p",
        "Enter your concealed tiles including the winning tile. Add each declared meld separately. Select the winning tile and enter the visible indicators.",
        "dim",
      ),
      field("Add tiles to", target),
      field("Declared meld type", meldKind),
      handDisplay,
      meldDisplay,
      addMeld,
      bonusDisplay,
      picker,
      field("Winning tile", winning),
      ...Object.values(flags).map((c) => c.node),
    );
    form.append(tilePanel, fastPanel);
    const submit = el("button", "Calculate payments", "primary");
    submit.type = "submit";
    form.append(submit);
    const output = el("section", "", "calculator-output");
    let pending: CalculationDraft[] = [...existing.slice(1)];
    function switchPath(next: "tiles" | "fast"): void {
      path = next;
      tilePanel.hidden = path !== "tiles";
      fastPanel.hidden = path !== "fast";
      tilePath.setAttribute("aria-pressed", String(path === "tiles"));
      fastPath.setAttribute("aria-pressed", String(path === "fast"));
      output.replaceChildren();
    }
    function makeDraft(): CalculationDraft {
      const ctx: CalculationContext = {
        winner: Number(winner.value),
        dealer: Number(dealer.value),
        payer: Number(payer.value),
        winType: win.value as "ron" | "tsumo",
        honba: Number(honba.value),
      };
      let entered: CalculatorInput;
      if (variant === "american")
        entered = {
          variant,
          path: "fast",
          context: ctx,
          value: Number(value.value),
          jokerless: jokerless.control.checked,
          singlesPairs: singles.control.checked,
          ...(bettor.value !== "none"
            ? {
                bettor: bettor.value === "wall" ? "wall" : Number(bettor.value),
              }
            : {}),
        };
      else if (path === "fast")
        entered = {
          variant,
          path: "fast",
          context: ctx,
          han: Number(han.value),
          fu: Number(fu.value),
          yakuman: Number(yakuman.value),
        };
      else {
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
        entered = {
          variant,
          path: "tiles",
          context: ctx,
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
            winType: ctx.winType,
            seatWind: 27 + ((ctx.winner - ctx.dealer + 4) % 4),
            roundWind: Number(round.value),
            riichi: flags["riichi"]!.control.checked,
            ...declared,
            dora,
            honba: ctx.honba,
            riichiSticks: 0,
          },
        };
      }
      return { input: entered, corrections: [] };
    }
    function renderResult(draft: CalculationDraft): void {
      const result = calculateDraft(draft);
      output.replaceChildren(el("h2", "Who pays"), payments(result.payments));
      output.append(
        el(
          "h3",
          `${result.units} ${variant === "american" ? "entered value" : "han"}${result.fu ? ` · ${result.fu} fu` : ""}`,
        ),
        el(
          "p",
          `${draft.input.path === "tiles" ? "Detected from entered tiles and context" : "Entered by the player"}${result.manual ? " · Manual entry or correction" : ""}`,
          "dim",
        ),
      );
      const correctionFields = result.detected.map((f) => {
        const v = input(
          result.corrected.find((c) => c.id === f.id)?.units ?? f.units,
        );
        output.append(field(`${f.label} · Original ${f.units}`, v));
        return { id: f.id, control: v, original: f.units };
      });
      const adjustment = input(
          draft.corrections.find((c) => c.id === "table-adjustment")?.units ??
            0,
        ),
        correctedFu = input(result.fu),
        reason = input(draft.corrections[0]?.reason ?? "", "text");
      reason.maxLength = 240;
      output.append(field("Additional manual scoring units", adjustment));
      if (variant === "riichi")
        output.append(field("Corrected fu", correctedFu));
      output.append(
        field("Reason for manual correction", reason),
        button("Apply corrections and recalculate", () =>
          safe(() => {
            const corrections = correctionFields
              .filter((f) => Number(f.control.value) !== f.original)
              .map((f) => ({
                id: f.id,
                units: Number(f.control.value),
                reason: reason.value,
              }));
            if (Number(adjustment.value))
              corrections.push({
                id: "table-adjustment",
                units: Number(adjustment.value),
                reason: reason.value,
              });
            if (Number(correctedFu.value) !== result.fu && !reason.value.trim())
              throw new Error("Enter a correction reason");
            renderResult({
              input: draft.input,
              corrections,
              ...(variant === "riichi" &&
              (draft.fuCorrection !== undefined ||
                Number(correctedFu.value) !== result.fu)
                ? {
                    fuCorrection: Number(correctedFu.value),
                    correctionNote: reason.value,
                  }
                : {}),
            });
          }),
        ),
      );
      const confirm = check("I confirm the payment breakdown");
      output.append(confirm.node);
      let dirty = false;
      const recordButton = button(
        recordId ? "Confirm correction" : "Confirm and add to table",
        () =>
          safe(() => {
            if (!confirm.control.checked)
              throw new Error("Confirm the breakdown before recording");
            record({ kind: "win", wins: [draft, ...pending] }, recordId);
          }),
      );
      recordButton.disabled = true;
      confirm.control.addEventListener(
        "change",
        () => (recordButton.disabled = !confirm.control.checked),
      );
      output.append(recordButton);
      output.addEventListener(
        "input",
        (e) => {
          if (e.target !== confirm.control) {
            dirty = true;
            confirm.control.checked = false;
            recordButton.disabled = true;
          }
        },
        { once: false },
      );
      confirm.control.addEventListener("change", () => {
        recordButton.disabled = dirty || !confirm.control.checked;
        if (dirty)
          status.textContent =
            "Apply corrections and recalculate before confirming.";
      });
      if (
        variant === "riichi" &&
        current!.session.settings.multipleRon === "all"
      )
        output.append(
          button(
            `Add another simultaneous winner (${pending.length + 1} entered)`,
            () =>
              safe(() => {
                if (!confirm.control.checked)
                  throw new Error("Confirm this winner first");
                if (pending.length >= 2)
                  throw new Error("At most three winners");
                pending.push(draft);
                output.replaceChildren(
                  el(
                    "p",
                    "Winner staged. Enter the next winner with the same discard context.",
                  ),
                );
              }),
          ),
        );
    }
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      safe(() => renderResult(makeDraft()));
    });
    form.addEventListener("input", () => output.replaceChildren());
    main.append(form, output, button("Return to scorekeeper", showSession));
    drawTiles();
    switchPath(path);
    if (first) safe(() => renderResult(first));
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
