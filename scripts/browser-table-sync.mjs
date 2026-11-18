import { browserLaunchOptions } from "./browser-harness.mjs";
/** Two real browser storage contexts, real local account/session endpoints,
 * ephemeral synthetic authentication and a MemoryStore. No live OAuth or
 * production account is used; runtime-only cookie/CSRF values are never logged. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createApp } from "../packages/server/dist/app.js";
import { MemoryStore } from "../packages/server/dist/memory-store.js";
import { hashToken } from "../packages/server/dist/auth.js";
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
const base = process.argv[2] ?? "http://127.0.0.1:4173",
  out = resolve(process.argv[3] ?? "work/table-sync");
mkdirSync(out, { recursive: true });
const store = new MemoryStore(),
  owner = await store.upsertUser({
    googleSub: randomUUID(),
    name: "Synthetic Table Owner",
    avatarUrl: null,
  }),
  sessionToken = randomBytes(32).toString("hex"),
  csrf = randomBytes(32).toString("hex");
await store.createSession({
  userId: owner.id,
  tokenHash: hashToken(sessionToken),
  csrfToken: csrf,
  expiresAt: new Date(Date.now() + 3600000),
});
const server = createServer(
  createApp({
    store,
    config: {
      port: 0,
      appOrigin: new URL(base).origin,
      apiOrigin: "https://api.openmahjong.app",
      cookieDomain: ".openmahjong.app",
      databaseUrl: null,
      googleClientId: null,
      googleClientSecret: null,
    },
    google: null,
  }),
);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const local = `http://127.0.0.1:${server.address().port}`,
  browser = await chromium.launch(browserLaunchOptions()),
  statuses = [],
  errors = [];
const report = {
  scope:
    "Synthetic local authenticated HTTP API; OAuth consent and production cookies not exercised",
};
async function device(width) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    reducedMotion: "reduce",
  });
  let offline = false;
  await ctx.route("https://api.openmahjong.app/**", async (route) => {
    if (offline) {
      await route.abort("internetdisconnected");
      return;
    }
    const req = route.request(),
      url = new URL(req.url()),
      headers = {
        "content-type": "application/json",
        origin: new URL(base).origin,
        cookie: `om_session=${sessionToken}`,
      };
    const supplied = req.headers()["x-csrf-token"];
    if (supplied) headers["x-csrf-token"] = supplied;
    const res = await fetch(local + url.pathname + url.search, {
      method: req.method(),
      headers,
      ...(!["GET", "HEAD"].includes(req.method())
        ? { body: req.postData() }
        : {}),
    });
    statuses.push({
      method: req.method(),
      path: url.pathname,
      status: res.status,
    });
    await route.fulfill({
      status: res.status,
      contentType: "application/json",
      headers: {
        "access-control-allow-origin": new URL(base).origin,
        "access-control-allow-credentials": "true",
      },
      body: await res.text(),
    });
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page
    .getByRole("button", {
      name: "In-person calculator and scorekeeper",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Load private account sessions", exact: true })
    .waitFor();
  return {
    page,
    ctx,
    setOffline: async (value) => {
      offline = value;
      await ctx.setOffline(value);
    },
  };
}
const click = (page, name) =>
  page.getByRole("button", { name, exact: true }).click();
async function draw(page) {
  await click(page, "Drawn hand");
  await click(page, "Review entry");
  await click(page, "Confirm and record");
}
try {
  const a = await device(390);
  await click(a.page, "New table session");
  await click(a.page, "Start scorekeeper");
  // Compact flow: seat tap, discarder chip, stepper quick chips,
  // then Confirm on the Check payments screen (no checkbox).
  await a.page
    .getByRole("button", { name: /Player 1 · .* points/ })
    .click();
  await click(a.page, "On a discard");
  await a.page.locator(".cx-seatchip", { hasText: "Player 2" }).click();
  await click(a.page, "3");
  await click(a.page, "40");
  await click(a.page, "Show payments");
  await click(a.page, "Confirm and add to table");
  await click(a.page, "Sync privately to account");
  await a.page
    .getByText("Saved to your private account.", { exact: true })
    .waitFor();
  const first = (await store.listTables(owner.id))[0];
  assert.equal(first.revision, 1);
  report.firstWriteRevision = first.revision;
  const b = await device(1440);
  await click(b.page, "Load private account sessions");
  await b.page.locator(".tool-session").first().click();
  assert.equal(await b.page.locator(".ledger-row").count(), 1);
  await a.page.evaluate(() => navigator.serviceWorker.ready);
  const offlineCdp = await a.ctx.newCDPSession(a.page);
  await offlineCdp.send("Network.clearBrowserCache");
  await a.setOffline(true);
  await draw(a.page);
  await click(a.page, "Sync privately to account");
  await a.page
    .getByText(
      "Offline or account unavailable. Your local edits remain saved.",
      { exact: true },
    )
    .waitFor();
  await a.page.screenshot({ path: resolve(out, "offline-write-390.png") });
  await a.page.reload();
  report.offlineReloadState = await a.page.evaluate(() => ({
    online: navigator.onLine,
    rememberedAccount: !!localStorage.getItem(
      "openmahjong.tables.last-account.v1",
    ),
    localAccountLibraries: Object.keys(localStorage).filter((k) =>
      k.startsWith("openmahjong.tables.v1.account."),
    ).length,
  }));
  await click(a.page, "In-person calculator and scorekeeper");
  // Chromium's onLine hint can reset on navigation despite failed network
  // requests. Prove the uncached origin is unreachable instead.
  assert.equal(
    await a.page.evaluate(() =>
      fetch("/healthz?offline-probe=1").then(
        (r) => r.ok,
        () => false,
      ),
    ),
    false,
  );
  assert.equal(report.offlineReloadState.rememberedAccount, true);
  await a.page
    .getByText(
      "Account copy saved on this device. Reconnect and sign in to the same account to sync.",
      { exact: true },
    )
    .waitFor();
  await a.page.locator(".tool-session").first().click();
  assert.equal(await a.page.locator(".ledger-row").count(), 2);
  await a.page.screenshot({
    path: resolve(out, "offline-account-reload-390.png"),
  });
  await click(a.page, "Sync privately to account");
  await a.page
    .getByText(
      "Saved on this device. Reconnect and sign in to the same account to sync.",
      { exact: true },
    )
    .waitFor();
  report.offlineAccountReload = true;
  await draw(b.page);
  await click(b.page, "Sync privately to account");
  await b.page
    .getByText("Saved to your private account.", { exact: true })
    .waitFor();
  assert.equal((await store.getTable(owner.id, first.id)).revision, 2);
  const reauthenticated = a.page.waitForResponse(
    (r) => r.url().endsWith("/api/settings") && r.request().method() === "GET",
  );
  await a.setOffline(false);
  // Reload establishes a real authenticated session even in browsers that
  // fail to emit an online event after navigation during emulation.
  await a.page.reload();
  await reauthenticated;
  await click(a.page, "In-person calculator and scorekeeper");
  await a.page.locator(".tool-session").first().click();
  await click(a.page, "Sync privately to account");
  await a.page
    .getByText(
      "Conflicting offline edits preserved. Keep both copies to continue.",
      { exact: true },
    )
    .waitFor();
  await a.page.screenshot({ path: resolve(out, "conflict-390.png") });
  const axe = await new AxeBuilder({ page: a.page })
    .include("#screen-tables")
    .analyze();
  assert.deepEqual(
    axe.violations.map((v) => v.id),
    [],
  );
  await click(a.page, "Keep both conflicting copies");
  await click(a.page, "Sync privately to account");
  await a.page
    .getByText("Saved to your private account.", { exact: true })
    .waitFor();
  assert.equal((await store.listTables(owner.id)).length, 2);
  await a.page.screenshot({
    path: resolve(out, "preserved-local-copy-390.png"),
  });
  await click(b.page, "Back");
  await click(b.page, "Load private account sessions");
  await b.page.locator(".tool-session").nth(1).waitFor();
  assert.equal(await b.page.locator(".tool-session").count(), 2);
  await b.page.screenshot({
    path: resolve(out, "both-account-copies-1440.png"),
  });
  report.conflictPreservedBoth = true;
  // Delete only this disposable fixture through the actual account UI.
  await b.page.goto(base);
  await b.page.locator("[data-tab=more]").click();
  await click(b.page, "Delete");
  await click(b.page, "Confirm delete");
  await b.page
    .getByRole("button", { name: "Sign in with Google", exact: true })
    .waitFor();
  assert.equal((await store.listTables(owner.id)).length, 0);
  assert.equal(store.tableWrites.size, 0);
  assert.equal(
    await b.page.evaluate(
      (id) => localStorage.getItem(`openmahjong.tables.v1.account.${id}`),
      owner.id,
    ),
    null,
  );
  report.accountDeletionCascaded = true;
  assert.deepEqual(errors, []);
  report.errors = errors;
  report.statuses = statuses;
  report.axe = [];
  console.log(
    "PASS private table carry-over, offline conflict preservation and fixture account deletion",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  writeFileSync(resolve(out, "report.json"), JSON.stringify(report, null, 2));
}
