// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/app.js";
import { PRACTICE_STORAGE_KEY, type PracticeAttempt } from "../src/education/practice-progress.js";
import { TUTORIAL_SETTINGS_KEY } from "../src/tutorial.js";

const attempt = (id: string): PracticeAttempt => ({ schemaVersion: 1, taxonomyVersion: 1, id,
  exerciseId: "wait-ryanmen", exerciseVersion: 1, ruleset: { id: "openmahjong-riichi", version: 1 },
  skill: "wait-reading", at: 1000, correct: true, assisted: false, attemptNumber: 1, responseMs: 100 });
const tick = async () => { for (let i = 0; i < 25; i++) await new Promise((resolve) => setTimeout(resolve, 0)); };
beforeEach(() => { localStorage.clear(); document.body.replaceChildren(); });
afterEach(() => vi.unstubAllGlobals());
function mount(): HTMLElement { const root = document.createElement("div"); document.body.append(root); new App(root); return root; }

describe("learning account integration", () => {
  it("keeps cloud history out of guest storage when an older API omits the account id", async () => {
    const guest = { schemaVersion: 1, attempts: [attempt("guest")] };
    localStorage.setItem(PRACTICE_STORAGE_KEY, JSON.stringify(guest));
    vi.stubGlobal("fetch", vi.fn(async (input: unknown, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      if (path === "/api/me") return Response.json({ user: { name: "Older API" }, csrfToken: "csrf" });
      if (path === "/api/settings" && init?.method !== "PUT") return Response.json({ settings: {
        [PRACTICE_STORAGE_KEY]: { schemaVersion: 1, attempts: [attempt("private-cloud")] },
      } });
      if (path === "/api/games") return Response.json({ games: [] });
      return Response.json({ games: 0 });
    }));
    mount(); await tick();
    expect(JSON.parse(localStorage.getItem(PRACTICE_STORAGE_KEY)!)).toEqual(guest);
  });

  it("merges guest evidence without spilling one account's cloud learning data into another", async () => {
    localStorage.setItem(PRACTICE_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, attempts: [attempt("guest")] }));
    localStorage.setItem(TUTORIAL_SETTINGS_KEY, JSON.stringify({ done: ["tu2"], active: null }));
    let owner = "account-a";
    const writes: { owner: string; settings: Record<string, unknown> }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: unknown, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      if (path === "/api/me") return Response.json({ user: { id: owner, name: owner }, csrfToken: "csrf" });
      if (path === "/api/settings" && init?.method === "PUT") {
        writes.push({ owner, settings: JSON.parse(String(init.body)).settings }); return Response.json({ ok: true });
      }
      if (path === "/api/settings") return Response.json({ settings: {
        [PRACTICE_STORAGE_KEY]: { schemaVersion: 1, attempts: [attempt(owner)] },
        [TUTORIAL_SETTINGS_KEY]: { done: [owner === "account-a" ? "tu1" : "tu3"], active: null },
      } });
      if (path === "/api/games") return Response.json({ games: [] });
      if (path === "/api/stats") return Response.json({ games: 0, wins: 0, placementSum: 0, hands: 0, riichi: 0, dealIns: 0, handsWon: 0, winPoints: 0 });
      if (path === "/auth/signout") return new Response(null, { status: 204 });
      return Response.json({}, { status: 404 });
    }));
    const a = mount(); await tick();
    expect(JSON.parse(localStorage.getItem(PRACTICE_STORAGE_KEY)!).attempts.map((entry: PracticeAttempt) => entry.id)).toEqual(["guest"]);
    expect(localStorage.getItem(`${PRACTICE_STORAGE_KEY}.account.account-a`)).toContain("account-a");
    (a.querySelector('[aria-label="Settings"]') ?? [...a.querySelectorAll("button")].find((button) => button.textContent === "Settings"))!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    [...a.querySelectorAll<HTMLButtonElement>("#screen-settings button")].find((button) => button.textContent === "Sign out")!.click();
    await tick();
    owner = "account-b";
    a.remove(); mount(); await tick();
    const b = writes.filter((write) => write.owner === "account-b").at(-1)!.settings;
    expect((b[PRACTICE_STORAGE_KEY] as { attempts: PracticeAttempt[] }).attempts.map((entry) => entry.id).sort()).toEqual(["account-b", "guest"]);
    expect((b[TUTORIAL_SETTINGS_KEY] as { done: string[] }).done.sort()).toEqual(["tu2", "tu3"]);
  });

  it("serializes pending preference and learning snapshots instead of allowing old writes to arrive last", async () => {
    const writes: Record<string, unknown>[] = [];
    let release: (() => void) | undefined;
    vi.stubGlobal("fetch", vi.fn(async (input: unknown, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      if (path === "/api/me") return Response.json({ user: { id: "account-a", name: "Learner" }, csrfToken: "csrf" });
      if (path === "/api/settings" && init?.method === "PUT") {
        writes.push(JSON.parse(String(init.body)).settings);
        if (writes.length === 1) await new Promise<void>((resolve) => { release = resolve; });
        return Response.json({ ok: true });
      }
      if (path === "/api/settings") return Response.json({ settings: null });
      if (path === "/api/games") return Response.json({ games: [] });
      return Response.json({ games: 0 });
    }));
    const root = mount(); await tick();
    expect(writes).toHaveLength(1);
    const guided = root.querySelector<HTMLInputElement>('#screen-home input[aria-label="Guided mode"]')!;
    for (const value of [true, false, true]) { guided.checked = value; guided.dispatchEvent(new Event("change", { bubbles: true })); }
    expect(writes).toHaveLength(1);
    release!(); await tick();
    expect(writes).toHaveLength(2);
    expect(writes[1]!["guided"]).toBe(true);
    expect(Object.hasOwn(writes[1]!, PRACTICE_STORAGE_KEY)).toBe(true);
  });
});
