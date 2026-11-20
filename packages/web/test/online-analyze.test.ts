// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onlineApp } from "../src/online.js";
import { initI18n } from "../src/i18n/index.js";

/** Analyze for online games (issue #106) — the results surface
 *  offers the two-scope Analyze entry only when the complete-record
 *  fetch succeeds. The API is stubbed at fetch; everything above it
 *  (routing, results rendering, the shipped analyze-ui) is real.
 *  The record served is a real online match's record (the
 *  om-online-1 fixture), so the click grades a real game. */
const record = (
  JSON.parse(readFileSync("packages/web/test/fixtures/om-online-1.json", "utf8")) as {
    record: unknown;
  }
).record;

const ID = "123e4567-e89b-42d3-a456-426614174000";
const snapshot = {
  id: ID,
  variant: "riichi",
  length: "east",
  pace: "correspondence",
  origin: "friendly",
  state: "finished",
  host: true,
  generation: 0,
  controlling: true,
  listed: false,
  invite: null,
  seat: 0,
  seats: [0, 1, 2, 3].map((seat) => ({
    seat,
    name: "Seat " + seat,
    bot: seat !== 0,
    covered: false,
    endRequested: false,
    coverAt: null,
    ready: true,
  })),
  result: [
    { seat: 0, rank: 1, score: 36000, points: 21 },
    { seat: 1, rank: 4, score: 11700, points: -19 },
    { seat: 2, rank: 2, score: 30700, points: 5.7 },
    { seat: 3, rank: 3, score: 21600, points: -7.7 },
  ],
};

async function settle(times = 12): Promise<void> {
  for (let i = 0; i < times; i++) await new Promise((r) => setTimeout(r, 0));
}

let root: HTMLElement;
let analyzeStatus = 200;

beforeEach(() => {
  document.body.innerHTML = "";
  root = document.createElement("div");
  document.body.append(root);
  window.history.replaceState(null, "", "/#/match/" + ID);
  initI18n({ pathname: "/" });
  vi.stubGlobal(
    "EventSource",
    class {
      onmessage: unknown = null;
      onerror: unknown = null;
      onopen: unknown = null;
      close() {}
    },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = String(input);
      const reply = (status: number, body: unknown) =>
        ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
      if (url.endsWith("/api/online/me"))
        return reply(200, { name: "Host", account: false, csrf: "csrf" });
      if (url.includes("/presence")) return reply(200, { ok: true });
      if (url.includes("/analyze"))
        return analyzeStatus === 200
          ? reply(200, record)
          : reply(analyzeStatus, { error: "Analysis opens after final settlement" });
      if (url.includes("/matches/")) return reply(200, snapshot);
      throw new TypeError("unexpected fetch " + url);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const actionButtons = () =>
  [...root.querySelectorAll<HTMLElement>(".mp-actions button")].map((b) => b.textContent);

describe("online results — Analyze entry (issue #106)", () => {
  it("offers Analyze when the record is fetchable, and it opens the two-scope grader", async () => {
    analyzeStatus = 200;
    await onlineApp(root);
    await settle();
    expect(actionButtons()).toContain("Board review");
    expect(actionButtons()).toContain("Analyze");
    const entry = [...root.querySelectorAll<HTMLElement>(".mp-actions button")].find(
      (b) => b.textContent === "Analyze",
    )!;
    entry.click();
    await settle();
    expect(root.textContent).toContain("Match summary");
    expect(root.textContent).toContain("Read this first.");
    const back = root.querySelector<HTMLElement>('button[aria-label="Back to review"]')!;
    back.click();
    await settle();
    expect(root.textContent).toContain("Final standings");
  }, 30_000);

  it("leaves the entry out when the record is refused — Board review remains", async () => {
    analyzeStatus = 409;
    await onlineApp(root);
    await settle();
    expect(actionButtons()).toContain("Board review");
    expect(actionButtons()).not.toContain("Analyze");
  }, 30_000);
});
