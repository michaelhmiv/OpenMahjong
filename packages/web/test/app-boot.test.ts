// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/app.js";

/**
 * Boot behavior (slice-2 brief §8): the landing must come up as a guest
 * with Play front and center when the account API is unreachable, and
 * pick up the signed-in chrome when it answers. Play never waits on
 * the network.
 */

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 404, json: async () => body } as unknown as Response;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

let root: HTMLElement;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
  root = document.createElement("div");
  document.body.append(root);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App boot", () => {
  it("lands on Play, signed out, when the API is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    new App(root);
    await settle();
    const play = root.querySelector("#screen-home .play");
    expect(play?.textContent).toBe("Play");
    // Signed-out chrome: Google button present, no account surfaces.
    expect(root.querySelector("#screen-home .gbtn")?.textContent).toContain(
      "Sign in with Google",
    );
    expect(root.querySelector("#screen-home .idchip")).toBeNull();
    expect(root.querySelector("#screen-home .recstrip")).toBeNull();
    // The tutorial's Learn entry is on the landing for guests too
    // (brief §9: no account required) — it is the only secondary-row
    // pill a guest gets.
    const guestSec = [...root.querySelectorAll("#screen-home .secrow .pillbtn")].map(
      (b) => b.textContent,
    );
    expect(guestSec).toEqual(["Learn"]);
    expect(root.querySelector("#screen-home .wordmark .sub")?.textContent).toBe(
      "Free forever. Open source mahjong.",
    );
  });

  it("shows the identity chip and record strip when signed in", async () => {
    const sums = {
      games: 12, wins: 3, placementSum: 29, hands: 126, riichi: 23,
      dealIns: 9, handsWon: 31, winPoints: 181040, since: "2026-11-11T12:00:00.000Z",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.endsWith("/api/me")) {
          return jsonResponse({ user: { name: "Michael M" }, csrfToken: "tok" });
        }
        if (u.endsWith("/api/stats")) return jsonResponse(sums);
        if (u.endsWith("/api/games")) return jsonResponse({ games: [] });
        return jsonResponse({}, false);
      }),
    );
    new App(root);
    await settle();
    expect(root.querySelector("#screen-home .idchip")?.textContent).toContain("Michael M");
    const strip = root.querySelector("#screen-home .recstrip")?.textContent ?? "";
    expect(strip).toContain("Games 12");
    expect(strip).toContain("Won 3");
    expect(strip).toContain("Avg place 2.4");
    expect(root.querySelector("#screen-home .gbtn")).toBeNull();
    const secButtons = [...root.querySelectorAll("#screen-home .secrow .pillbtn")].map(
      (b) => b.textContent,
    );
    expect(secButtons).toEqual(["History", "Stats", "Learn"]);
  });

  it("offers the one-time import when the account is empty and local games exist", async () => {
    localStorage.setItem(
      "openmahjong.history.v1",
      JSON.stringify([
        { date: "2026-11-15T12:00:00.000Z", length: "east", scores: [35200, 24100, 22800, 17900], humanRank: 1 },
      ]),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.endsWith("/api/me")) {
          return jsonResponse({ user: { name: "Michael M" }, csrfToken: "tok" });
        }
        if (u.endsWith("/api/games")) return jsonResponse({ games: [] });
        if (u.endsWith("/api/stats")) {
          return jsonResponse({
            games: 0, wins: 0, placementSum: 0, hands: 0, riichi: 0,
            dealIns: 0, handsWon: 0, winPoints: 0, since: null,
          });
        }
        return jsonResponse({}, false);
      }),
    );
    new App(root);
    await settle();
    expect(root.querySelector("#screen-home .importbox .txt")?.textContent).toBe(
      "Import 1 games from this device",
    );
  });
});
