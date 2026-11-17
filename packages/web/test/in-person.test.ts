// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TABLE_PRESETS, type ScoringSession } from "@openmahjong/engine";
import { mountInPerson } from "../src/in-person-ui.js";
import {
  appendTableEvent,
  deleteTableAccountCache,
  preserveTableConflict,
  readTables,
  syncTable,
  tableStorageKey,
  undoTable,
  writeTable,
  type TableCopy,
} from "../src/in-person-store.js";
let root: HTMLElement;
beforeEach(() => {
  localStorage.clear();
  document.body.replaceChildren();
  root = document.createElement("div");
  document.body.append(root);
});
function click(text: string) {
  const b = [...root.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent === text || b.getAttribute("aria-label") === text,
  );
  if (!b) throw new Error(`Missing ${text}`);
  b.click();
}
function control(label: string): HTMLInputElement | HTMLSelectElement {
  const l = [...root.querySelectorAll("label")].find(
    (l) => l.childNodes[0]?.textContent === label,
  );
  if (!l) throw new Error(`Missing field ${label}`);
  return l.querySelector("input,select")!;
}
function fill(label: string, value: string) {
  const i = control(label);
  i.value = value;
  i.dispatchEvent(new Event("input", { bubbles: true }));
}
function mount(initialId?: string) {
  return mountInPerson(root, {
    onBack: () => {},
    renderTile: (t) => {
      const el = document.createElement("span");
      el.textContent = String(t.type);
      return el;
    },
    ...(initialId ? { initialId } : {}),
  });
}
const state = (): ScoringSession => ({
  v: 1,
  id: "table-a",
  variant: "riichi",
  preset: "openmahjong-riichi-table@1",
  names: ["A", "B", "C", "D"],
  startingScores: [25000, 25000, 25000, 25000],
  settings: TABLE_PRESETS["openmahjong-riichi-table@1"].settings,
  revision: 0,
  updatedAt: "2026-11-17T00:00:00Z",
  finished: false,
  ledger: [],
});
describe("offline in-person workflows", () => {
  it("records fast payments only after confirmation, reloads, corrects, undoes and settles", () => {
    const ui = mount();
    click("New table session");
    click("Start scorekeeper");
    click("Fast han / fu");
    fill("Winner", "1");
    fill("Discarding player", "3");
    fill("Han · Scoring doubles, including bonus tiles", "3");
    fill("Fu · Hand points before the han multipliers", "40");
    click("Calculate payments");
    expect(root.textContent).toContain("Player 4 pays Player 2 5,200 points");
    expect(readTables()[0]!.session.ledger).toHaveLength(0);
    expect(
      [...root.querySelectorAll<HTMLButtonElement>("button")].find(
        (b) => b.textContent === "Confirm and add to table",
      )!.disabled,
    ).toBe(true);
    const confirm = control(
      "I confirm the payment breakdown",
    ) as HTMLInputElement;
    confirm.checked = true;
    confirm.dispatchEvent(new Event("change"));
    click("Confirm and add to table");
    const id = readTables()[0]!.session.id;
    ui.destroy();
    mount(id);
    expect(root.textContent).toContain("Player 2 · 30,200 points");
    // Dealer, round wind and honba are derived from the ledger: the
    // non-dealer win moved the deal to Player 2 with no manual entry.
    expect(root.textContent).toContain(
      "East round · Player 2 deals next · Repeat counter (honba) 0",
    );
    expect(
      [...root.querySelectorAll("label")].some((l) =>
        l.textContent?.startsWith("Dealer (East)"),
      ),
    ).toBe(false);
    click("Correct this entry");
    fill("Entered han · Original 3", "4");
    fill("Reason for manual correction", "Table corrected han");
    click("Apply corrections and recalculate");
    expect(root.textContent).toContain("8,000 points");
    const confirm2 = control(
      "I confirm the payment breakdown",
    ) as HTMLInputElement;
    confirm2.checked = true;
    confirm2.dispatchEvent(new Event("change"));
    click("Confirm correction");
    expect(readTables()[0]!.session.ledger).toHaveLength(2);
    expect(root.textContent).toContain("Player 2 · 33,000 points");
    // Undo last entry removes the ENTRY — original recording and its
    // correction — not just the correction: scores return to the
    // pre-entry state and the ledger row is gone.
    click("Undo last entry");
    expect(root.textContent).toContain("Player 2 · 25,000 points");
    expect(root.querySelectorAll(".ledger-row")).toHaveLength(0);
    expect(readTables()[0]!.session.ledger).toHaveLength(4);
    click("Final standings and settlement");
    click("Finish session");
    expect(readTables()[0]!.session.finished).toBe(true);
    // A finished session is sealed: no entry or edit controls remain.
    expect(
      [...root.querySelectorAll("button")].some(
        (b) => b.textContent === "Calculate a hand",
      ),
    ).toBe(false);
    expect(
      [...root.querySelectorAll("button")].some(
        (b) => b.textContent === "Undo last entry",
      ),
    ).toBe(false);
    const sealedCopy = readTables()[0]!;
    expect(() =>
      appendTableEvent(sealedCopy, { kind: "deposit", seat: 0 }),
    ).toThrow(/finished/);
    expect(() => undoTable(sealedCopy)).toThrow(/finished/);
    // Reopening deliberately returns it to editable.
    click("Reopen session");
    expect(
      [...root.querySelectorAll("button")].some(
        (b) => b.textContent === "Calculate a hand",
      ),
    ).toBe(true);
    expect(readTables()[0]!.session.finished).toBe(false);
  });
  it("derives dealer and honba across consecutive riichi hands", () => {
    mount();
    click("New table session");
    click("Start scorekeeper");
    // Hand 1: the dealer (Player 1) wins on a discard — deal repeats,
    // honba rises, and the next hand's payments include the honba.
    click("Fast han / fu");
    fill("Discarding player", "3");
    fill("Han · Scoring doubles, including bonus tiles", "3");
    fill("Fu · Hand points before the han multipliers", "40");
    click("Calculate payments");
    expect(root.textContent).toContain("Player 4 pays Player 1 7,700 points");
    let confirm = control(
      "I confirm the payment breakdown",
    ) as HTMLInputElement;
    confirm.checked = true;
    confirm.dispatchEvent(new Event("change"));
    click("Confirm and add to table");
    expect(root.textContent).toContain(
      "East round · Player 1 deals next · Repeat counter (honba) 1",
    );
    // Hand 2: a non-dealer wins — the deal passes and honba resets.
    click("Calculate a hand");
    click("Fast han / fu");
    fill("Winner", "1");
    fill("Discarding player", "2");
    fill("Han · Scoring doubles, including bonus tiles", "3");
    fill("Fu · Hand points before the han multipliers", "40");
    click("Calculate payments");
    expect(root.textContent).toContain("Player 3 pays Player 2 5,500 points");
    confirm = control("I confirm the payment breakdown") as HTMLInputElement;
    confirm.checked = true;
    confirm.dispatchEvent(new Event("change"));
    click("Confirm and add to table");
    expect(root.textContent).toContain(
      "East round · Player 2 deals next · Repeat counter (honba) 0",
    );
  });
  it("ends a riichi session when a player falls below zero (tobi)", () => {
    mount();
    click("New table session");
    click("Start scorekeeper");
    click("Fast han / fu");
    fill("True yakuman multiple (0 for ordinary hands)", "1");
    click("Calculate payments");
    expect(root.textContent).toContain("Player 2 pays Player 1 48,000 points");
    const confirm = control(
      "I confirm the payment breakdown",
    ) as HTMLInputElement;
    confirm.checked = true;
    confirm.dispatchEvent(new Event("change"));
    click("Confirm and add to table");
    expect(root.textContent).toContain("Player 2 · -23,000 points");
    expect(root.textContent).toContain("fell below zero points");
    // No further entries or deposits are offered; the settlement is
    // presented in place and still settles the negative player exactly.
    const buttons = [...root.querySelectorAll("button")].map(
      (b) => b.textContent,
    );
    expect(buttons).not.toContain("Calculate a hand");
    expect(buttons).not.toContain("Record riichi deposit");
    expect(buttons).toContain("Correct this entry");
    expect(root.textContent).toContain("Player 2 pays Player 1 48,000 points");
    const busted = readTables()[0]!;
    expect(() =>
      appendTableEvent(busted, { kind: "deposit", seat: 0 }),
    ).toThrow(/ended/);
    expect(() =>
      appendTableEvent(busted, {
        kind: "draw",
        reason: "abortive",
        ready: [],
      }),
    ).toThrow(/ended/);
  });
  it("prints whole-number settlement nets as integers", () => {
    mount();
    click("New table session");
    const preset = control("Named preset");
    preset.value = "hong-kong-clear@1";
    preset.dispatchEvent(new Event("change", { bubbles: true }));
    click("Start scorekeeper");
    click("Fast fan entry");
    fill("Fan · Scoring units", "5");
    click("Calculate payments");
    expect(root.textContent).toContain("Player 2 pays Player 1 48 points");
    const confirm = control(
      "I confirm the payment breakdown",
    ) as HTMLInputElement;
    confirm.checked = true;
    confirm.dispatchEvent(new Event("change"));
    click("Confirm and add to table");
    click("Final standings and settlement");
    expect(root.textContent).toContain("+96 net points");
    expect(root.textContent).not.toContain(".0 net points");
  });
  it("detects entered tiles, keeps opponents/card patterns out and invalidates edited results", () => {
    mount();
    click("New table session");
    click("Start scorekeeper");
    for (const tile of [
      "1m",
      "1m",
      "2m",
      "2m",
      "3p",
      "3p",
      "4p",
      "4p",
      "5s",
      "5s",
      "6s",
      "6s",
      "Rd",
      "Rd",
    ])
      click(`Add ${tile}`);
    fill("Winning tile", "33");
    click("Calculate payments");
    expect(root.textContent).toContain("2 han · 25 fu");
    expect(root.textContent).toContain("2,400 points");
    const c = control("I confirm the payment breakdown") as HTMLInputElement;
    c.checked = true;
    c.dispatchEvent(new Event("change"));
    fill("Additional manual scoring units", "1");
    c.checked = true;
    c.dispatchEvent(new Event("change"));
    expect(
      [...root.querySelectorAll<HTMLButtonElement>("button")].find(
        (b) => b.textContent === "Confirm and add to table",
      )!.disabled,
    ).toBe(true);
    expect(readTables()[0]!.session.ledger).toHaveLength(0);
  });
});
describe("optional account sync", () => {
  it("retries the exact write id after failure and keeps conflicting offline edits", async () => {
    let copy: TableCopy = {
      session: state(),
      baseRevision: 0,
      syncedLocalRevision: -1,
    };
    writeTable(copy, "account-a");
    const fail = vi.fn(async () => {
      throw new TypeError("offline");
    });
    expect(
      await syncTable(
        "table-a",
        { accountId: "account-a", csrfToken: "test-only" },
        fail,
      ),
    ).toBe("offline");
    const pending = readTables("account-a")[0]!.pending!;
    copy = appendTableEvent(readTables("account-a")[0]!, {
      kind: "deposit",
      seat: 0,
    });
    writeTable(copy, "account-a");
    const requests: unknown[] = [];
    const remote = {
      ...state(),
      revision: 1,
      ledger: [
        {
          id: "remote",
          kind: "set" as const,
          recordId: "one",
          event: { kind: "deposit" as const, seat: 1 },
        },
      ],
    };
    const conflict = vi.fn(async (_url: unknown, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify({
          status: "conflict",
          entry: { revision: 1, state: remote },
        }),
        { status: 409 },
      );
    });
    expect(
      await syncTable(
        "table-a",
        { accountId: "account-a", csrfToken: "test-only" },
        conflict,
      ),
    ).toBe("conflict");
    expect(requests[0]).toEqual(pending);
    const both = readTables("account-a")[0]!;
    expect(both.session.ledger).toHaveLength(1);
    expect(both.conflict!.state.ledger[0]!.id).toBe("remote");
    const preserved = preserveTableConflict(both, "account-a");
    expect(preserved.session.id).not.toBe("table-a");
    expect(readTables("account-a")).toHaveLength(2);
    expect(readTables()).toHaveLength(0);
    expect(readTables("account-b")).toHaveLength(0);
  });
  it("does not recreate private data after sign-out while a write is in flight", async () => {
    writeTable(
      { session: state(), baseRevision: 0, syncedLocalRevision: -1 },
      "account-a",
    );
    let resolve!: (r: Response) => void;
    const wait = () => new Promise<Response>((r) => (resolve = r));
    const syncing = syncTable(
      "table-a",
      { accountId: "account-a", csrfToken: "test-only" },
      wait,
    );
    deleteTableAccountCache("account-a");
    resolve(
      new Response(
        JSON.stringify({
          status: "saved",
          entry: { revision: 1, state: state() },
        }),
      ),
    );
    expect(await syncing).toBe("offline");
    expect(localStorage.getItem(tableStorageKey("account-a"))).toBeNull();
  });
  it("recognizes a delayed duplicate acknowledgement after another device changed the account copy", async () => {
    writeTable(
      { session: state(), baseRevision: 0, syncedLocalRevision: -1 },
      "account-a",
    );
    const changed = appendTableEvent(
      { session: state(), baseRevision: 1, syncedLocalRevision: 0 },
      { kind: "deposit", seat: 1 },
    ).session;
    const duplicate = async () =>
      new Response(
        JSON.stringify({
          status: "duplicate",
          entry: { revision: 2, state: changed },
        }),
      );
    expect(
      await syncTable(
        "table-a",
        { accountId: "account-a", csrfToken: "test-only" },
        duplicate,
      ),
    ).toBe("conflict");
    const copy = readTables("account-a")[0]!;
    expect(copy.baseRevision).toBe(0);
    expect(copy.session.ledger).toHaveLength(0);
    expect(copy.conflict!.state.ledger).toHaveLength(1);
  });
});

describe("offline account copy identity", () => {
  it("remembers no credential, opens the account scope offline, and clears it on explicit cache deletion", async () => {
    const { rememberTableAccount, offlineTableAccount } = await import(
      "../src/in-person-store.js"
    );
    rememberTableAccount("account-a");
    expect(offlineTableAccount()).toBe("account-a");
    writeTable(
      { session: state(), baseRevision: 0, syncedLocalRevision: -1 },
      "account-a",
    );
    deleteTableAccountCache("account-a");
    expect(offlineTableAccount()).toBeUndefined();
    expect(readTables("account-a")).toEqual([]);
  });
});
