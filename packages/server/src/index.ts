/**
 * Entrypoint: config → store (Postgres + migrations when DATABASE_URL
 * is set, in-memory otherwise) → HTTP server. Google sign-in stays
 * disabled (503 on /auth/google/start) until its env vars land, so the
 * service can deploy before the Google Cloud setup exists.
 */

import { createServer } from "node:http";
import { Pool } from "pg";
import { OnlineHttp } from "./online/http.js";
import { OnlineTables } from "./online/service.js";
import { createApp } from "./app.js";
import { googleRedirectUri, loadConfig } from "./config.js";
import { createGoogleClient } from "./google.js";
import { MemoryStore } from "./memory-store.js";
import { runMigrations } from "./migrations.js";
import { PgStore } from "./pg-store.js";
import type { Store } from "./store.js";

async function main(): Promise<void> {
  const config = loadConfig();

  let store: Store;
  let online: OnlineHttp | undefined;
  if (config.databaseUrl) {
    const pool = new Pool({ connectionString: config.databaseUrl });
    const applied = await runMigrations(pool);
    if (applied.length > 0) {
      console.log(`[server] applied migrations: ${applied.join(", ")}`);
    }
    store = new PgStore(pool);
    const tables = new OnlineTables(pool, {
      custom: process.env.ONLINE_CUSTOM !== "off",
      friendly: process.env.ONLINE_FRIENDLY !== "off",
      ranked: process.env.ONLINE_RANKED === "on",
    });
    online = new OnlineHttp(tables);
    if (process.env.ONLINE_METRICS === "on") {
      const delivery = online;
      let measuring = false;
      setInterval(async () => {
        if (measuring) return;
        measuring = true;
        try {
          const counts = await pool.query(`SELECT origin,variant,length,pace,state,count(*)::int AS tables,
            CASE WHEN state='waiting' THEN floor(extract(epoch FROM clock_timestamp()-min(created_at)))::int END AS oldest_wait_seconds
            FROM online_rooms WHERE state IN ('playing','waiting') GROUP BY origin,variant,length,pace,state`);
          console.log(JSON.stringify({event:"online-minute",...delivery.takeMetrics(),formats:counts.rows}));
        } catch { console.error("[online] metrics unavailable"); }
        finally { measuring = false; }
      },60000).unref();
    }
    await tables.heartbeat();
    let lastHeartbeat=Date.now();
    let ticking = false;
    setInterval(async () => {
      if (ticking) return;
      ticking = true;
      try {
        if (Date.now()-lastHeartbeat>=3000) { await tables.heartbeat(); await tables.matchWaiting(); lastHeartbeat=Date.now(); }
        await tables.tick();
      }
      catch { console.error("[online] match timer transaction failed"); }
      finally { ticking = false; }
    }, 500).unref();
  } else {
    console.warn(
      "[server] DATABASE_URL is not set — using the in-memory store; " +
        "accounts and games will not survive a restart",
    );
    store = new MemoryStore();
  }

  const google =
    config.googleClientId && config.googleClientSecret
      ? createGoogleClient({
          clientId: config.googleClientId,
          clientSecret: config.googleClientSecret,
          redirectUri: googleRedirectUri(config),
        })
      : null;
  if (!google) {
    console.warn(
      "[server] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set — " +
        "sign-in is disabled (503 on /auth/google/start)",
    );
  }

  const server = createServer(createApp({ store, google, config, online }));
  server.listen(config.port, () => {
    console.log(`[server] listening on port ${config.port}`);
  });
}

main().catch((err: unknown) => {
  console.error("[server] failed to start:", err);
  process.exit(1);
});
