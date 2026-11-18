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
  const b =
    [...root.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent === text || b.getAttribute("aria-label") === text,
    ) ?? seatButtonByLabel(text);
  if (!b) throw new Error(`Missing ${text}`);
  b.click();
}
function seatButtonByLabel(label: string): HTMLButtonElement | null {
  // Seat taps are addressed by their old label form
  // ("Player 2 · 25,000 points"); seats carry no aria-label any
  // more, so resolve through the tile's visible name/score.
  const tile = seatTile(label);
  return tile instanceof HTMLButtonElement ? tile : null;
}
function buttonByText(text: string): HTMLButtonElement {
  const b = [...root.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent === text,
  );
  if (!b) throw new Error(`Missing button ${text}`);
  return b;
}
function seatTile(label: string): HTMLElement | null {
  // Label form: "Name · SCORE points". The tile's accessible
  // name is its visible text now, so match the name/score spans.
  const m = /^(.*) · (.*)$/.exec(label);
  if (!m) return null;
  return seatWith(m[1]!, m[2]!);
}
function dealerTile(): HTMLElement | null {
  return root.querySelector('[data-dealer="true"]');
}
function seatLabelOf(tile: Element | null | undefined): string | null {
  // The tile's label as the player sees it (and as its accessible
  // name): "Name · SCORE points", composed from the text spans.
  if (!tile) return null;
  const name = tile.querySelector(".cx-seat-name")?.textContent;
  const score = tile.querySelector(".cx-seat-score")?.textContent;
  return name && score ? `${name} · ${score}` : null;
}
function seatWith(name: string, score: string): HTMLElement | null {
  // Seats are buttons while the session is active and plain tiles
  // once it ends; either way the tile shows name and score.
  return (
    [...root.querySelectorAll<HTMLElement>(".cx-seat")].find(
      (t) =>
        t.querySelector(".cx-seat-name")?.textContent === name &&
        t.querySelector(".cx-seat-score")?.textContent === score,
    ) ?? null
  );
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
    // Compact flow: tap the winner's seat, name the discarder, enter
    // the value with steppers/chips, then confirm on Check payments.
    click("Player 2 · 25,000 points");
    click("On a discard");
    click("Player 4 · North");
    click("3");
    click("40");
    expect(root.textContent).toContain("Hand value 5,200 points");
    click("Show payments");
    expect(root.textContent).toContain("Player 4 pays Player 2 5,200 points");
    expect(readTables()[0]!.session.ledger).toHaveLength(0);
    // The Check payments screen is the recording gate: its Confirm is
    // live as soon as the breakdown is eligible.
    expect(buttonByText("Confirm and add to table").disabled).toBe(false);
    click("Confirm and add to table");
    const id = readTables()[0]!.session.id;
    ui.destroy();
    mount(id);
    expect(seatTile("Player 2 · 30,200 points")).not.toBeNull();
    // Dealer, round wind and honba are derived from the ledger: the
    // non-dealer win moved the deal to Player 2 with no manual entry.
    expect(root.textContent).toContain("East 2 · Repeat 0");
    expect(
      [...root.querySelectorAll("label")].some((l) =>
        l.textContent?.startsWith("Dealer (East)"),
      ),
    ).toBe(false);
    click("Correct this entry");
    click("Correct the breakdown");
    fill("Entered han · Original 3", "4");
    fill("Reason for manual correction", "Table corrected han");
    click("Apply corrections and recalculate");
    expect(root.textContent).toContain("8,000 points");
    click("Confirm correction");
    expect(readTables()[0]!.session.ledger).toHaveLength(2);
    expect(seatTile("Player 2 · 33,000 points")).not.toBeNull();
    // Undo last entry removes the ENTRY — original recording and its
    // correction — not just the correction: scores return to the
    // pre-entry state and the ledger row is gone.
    click("Undo last entry");
    expect(seatTile("Player 2 · 25,000 points")).not.toBeNull();
    expect(root.querySelectorAll(".ledger-row")).toHaveLength(0);
    expect(readTables()[0]!.session.ledger).toHaveLength(4);
    click("Settlement");
    click("Finish session");
    expect(readTables()[0]!.session.finished).toBe(true);
    // A finished session is sealed: seats are no longer buttons and
    // no entry or undo controls remain.
    expect(root.querySelectorAll("button.cx-seat")).toHaveLength(0);
    expect(
      [...root.querySelectorAll("button")].some(
        (b) => b.getAttribute("aria-label") === "Undo last entry",
      ),
    ).toBe(false);
    const sealedCopy = readTables()[0]!;
    expect(() =>
      appendTableEvent(sealedCopy, { kind: "deposit", seat: 0 }),
    ).toThrow(/finished/);
    expect(() => undoTable(sealedCopy)).toThrow(/finished/);
    // Reopening deliberately returns it to editable.
    click("Reopen session");
    expect(root.querySelectorAll("button.cx-seat")).toHaveLength(4);
    expect(readTables()[0]!.session.finished).toBe(false);
  });
  it("derives dealer and honba across consecutive riichi hands", () => {
    mount();
    click("New table session");
    click("Start scorekeeper");
    // Hand 1: the dealer (Player 1) wins on a discard — deal repeats,
    // honba rises, and the next hand's payments include the honba.
    click("Player 1 · 25,000 points");
    click("On a discard");
    click("Player 4 · North");
    click("3");
    click("40");
    click("Show payments");
    expect(root.textContent).toContain("Player 4 pays Player 1 7,700 points");
    click("Confirm and add to table");
    expect(root.textContent).toContain("East 1 · Repeat 1");
    expect(seatLabelOf(dealerTile())).toBe("Player 1 · 32,700 points");
    // Hand 2: a non-dealer wins — the deal passes and honba resets.
    click("Player 2 · 25,000 points");
    click("On a discard");
    click("Player 3 · West");
    click("3");
    click("40");
    click("Show payments");
    expect(root.textContent).toContain("Player 3 pays Player 2 5,500 points");
    click("Confirm and add to table");
    expect(root.textContent).toContain("East 2 · Repeat 0");
    // The dealer mark moved to Player 2's tile with the deal.
    expect(seatLabelOf(dealerTile())).toBe("Player 2 · 30,500 points");
  });
  it("ends a riichi session when a player falls below zero (tobi)", () => {
    mount();
    click("New table session");
    click("Start scorekeeper");
    click("Player 1 · 25,000 points");
    click("On a discard");
    click("Player 2 · South");
    click("Increase Yakuman multiple");
    click("Show payments");
    expect(root.textContent).toContain("Player 2 pays Player 1 48,000 points");
    click("Confirm and add to table");
    expect(seatWith("Player 2", "-23,000 points")).not.toBeNull();
    expect(root.textContent).toContain("fell below zero points");
    // No further entries or deposits are offered; the settlement is
    // presented in place and still settles the negative player exactly.
    const buttons = [...root.querySelectorAll("button")].map(
      (b) => b.textContent,
    );
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
    click("Player 1 · 1,000 points");
    click("On a discard");
    click("Player 2 · South");
    click("5");
    expect(root.textContent).toContain("Player 2 pays Player 1 48 points");
    click("Show payments");
    click("Confirm and add to table");
    click("Settlement");
    expect(root.textContent).toContain("+96 net points");
    expect(root.textContent).not.toContain(".0 net points");
  });
  it("detects entered tiles, keeps opponents/card patterns out and invalidates edited results", () => {
    mount();
    click("New table session");
    click("Start scorekeeper");
    click("Player 1 · 25,000 points");
    click("On a discard");
    click("Player 2 · South");
    click("Score it from the tiles");
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
    click("Show payments");
    expect(root.textContent).toContain("2 han · 25 fu");
    expect(root.textContent).toContain("2,400 points");
    // Editing the breakdown without applying the correction locks
    // Confirm again until the recalculation happens.
    click("Correct the breakdown");
    fill("Additional manual scoring units", "1");
    expect(buttonByText("Confirm and add to table").disabled).toBe(true);
    expect(readTables()[0]!.session.ledger).toHaveLength(0);
  });
});
describe("compact scorekeeper", () => {
  it("preselects the winner from the seat tap", () => {
    mount();
    click("New table session");
    click("Start scorekeeper");
    expect(seatLabelOf(dealerTile())).toBe("Player 1 · 25,000 points");
    click("Player 3 · 25,000 points");
    const selected = root.querySelector("button.cx-seat.sel");
    expect(seatLabelOf(selected)).toBe("Player 3 · 25,000 points");
    expect(selected?.getAttribute("aria-pressed")).toBe("true");
    expect(root.textContent).toContain("Winner · Player 3 — West");
    click("Self-draw");
    // The value screen's context panel carries the tapped winner in.
    expect(root.textContent).toContain("Player 3 · West");
    expect(root.textContent).toContain("Self-draw");
  });
  it("lays out the compact scorekeeper for every variant", () => {
    for (const presetKey of [
      "openmahjong-riichi-table@1",
      "hong-kong-clear@1",
      "mcr-2006@1",
      "taiwanese-every-flower@1",
    ]) {
      const ui = mount();
      click("New table session");
      const preset = control("Named preset");
      preset.value = presetKey;
      preset.dispatchEvent(new Event("change", { bubbles: true }));
      click("Start scorekeeper");
      expect(root.querySelector(".cx-strip")).not.toBeNull();
      expect(root.querySelectorAll("button.cx-seat")).toHaveLength(4);
      // Seat tiles sit in table order: North, West over East, South.
      const winds = [...root.querySelectorAll(".cx-seat-wind")].map((n) =>
        n.textContent!.replace(" · Dealer", ""),
      );
      expect(winds).toEqual(["North", "West", "East", "South"]);
      expect(dealerTile()).not.toBeNull();
      ui.destroy();
    }
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
