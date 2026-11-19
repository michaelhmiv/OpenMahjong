// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onlineApp } from "../src/online.js";

/**
 * Regression (CI run 44563247084, postgres job): the signed-out lobby
 * renders inert (aria-hidden) behind the guest-entry sheet. The sheet
 * was appended INSIDE that aria-hidden screen, so it left the
 * accessibility tree — Playwright's getByRole("button", { name:
 * "Play as guest" }) waited the full 30s and the four-seat browser
 * run timed out before the first seat could sign in. Sheets over an
 * inert screen must mount beside it, never inside it.
 */

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

let root: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = "";
  root = document.createElement("div");
  document.body.append(root);
  window.history.replaceState(null, "", "/#/online");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.endsWith("/api/online/me")) {
        return {
          ok: true,
          status: 200,
          json: async () => null,
        } as Response;
      }
      throw new TypeError("unexpected fetch " + url);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("online guest entry sheet", () => {
  it("renders Play as guest outside any aria-hidden subtree", async () => {
    await onlineApp(root);
    await settle();
    const button = [...root.querySelectorAll("button")].find(
      (b) => b.textContent === "Play as guest",
    );
    expect(button, "guest sheet renders").toBeTruthy();
    let node: HTMLElement | null = button!;
    while (node) {
      expect(node.getAttribute?.("aria-hidden")).not.toBe("true");
      node = node.parentElement;
    }
    const name = root.querySelector<HTMLInputElement>(
      'input[aria-label="Display name"]',
    );
    expect(name, "display-name field renders with the sheet").toBeTruthy();
  });
});
