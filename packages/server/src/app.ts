/**
 * HTTP layer: routing, CORS, session auth, CSRF, and the API contract
 * the web client is built against. All policy lives here and in
 * `validate.ts`; storage is behind the `Store` interface.
 *
 * Contract summary (see README for the full version):
 * - Session cookie `om_session`: httpOnly, Secure, SameSite=Lax,
 *   Domain=.openmahjong.app. Only its SHA-256 hash is stored.
 * - Mutations under /api require the session's CSRF token in the
 *   `x-csrf-token` header: 401 without a session, 403 on a bad token.
 * - CORS on /api/*: exactly the app origin, credentials allowed.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { validateScoringSession } from "@openmahjong/engine";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_MS,
  clearedSessionCookie,
  hashToken,
  newToken,
  parseCookies,
  oauthStateCookie,
  sessionCookie,
} from "./auth.js";
import type { Config } from "./config.js";
import type { GoogleClient } from "./google.js";
import type {
  GameRecord,
  GameSummary,
  Session,
  Store,
  User,
  GameVariant,
} from "./store.js";
import { ValidationError, validateGame, validateGameList, validateResume, validateSettings, validatedGameId } from "./validate.js";

import type { OnlineHttp } from "./online/http.js";

export interface AppDeps {
  online?: OnlineHttp | undefined;
  store: Store;
  google: GoogleClient | null;
  config: Config;
}

const MAX_GAME_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_BYTES = 16 * 1024 * 1024;
// Bounded 2,000-attempt learning evidence plus lesson snapshots and
// saved decision references must synchronize without silent truncation.
const MAX_SETTINGS_BYTES = 2 * 1024 * 1024;
// The resume state itself is capped at 2 MiB in validateResume; the
// raw body gets envelope slack ({ state, savedAt } plus whitespace).
const MAX_RESUME_BYTES = 2 * 1024 * 1024 + 64 * 1024;
/** Bound unauthenticated, process-local state even under a sign-in flood. */
const MAX_PENDING_STATES = 1000;
const GAME_LIST_LIMIT = 200;

interface Authed {
  user: User;
  session: Session;
}

function gameJson(game: GameRecord): Record<string, unknown> {
  return {
    id: game.id,
    ...(game.variant ? { variant: game.variant } : {}),
    length: game.length,
    placement: game.placement,
    score: game.score,
    finishedAt: game.finishedAt.toISOString(),
    log: game.log,
    stats: game.stats,
  };
}

function summaryJson(game: GameSummary): Record<string, unknown> {
  return {
    id: game.id,
    ...(game.variant ? { variant: game.variant } : {}),
    finishedAt: game.finishedAt.toISOString(),
    length: game.length,
    placement: game.placement,
    score: game.score,
  };
}

export function createApp(deps: AppDeps): (
  req: IncomingMessage,
  res: ServerResponse,
) => void {
  const { store, config } = deps;
  /** OAuth state values awaiting a callback: state → expiry epoch ms. */
  const pendingStates = new Map<string, number>();

  function sendJson(
    res: ServerResponse,
    status: number,
    body: unknown,
  ): void {
    const text = JSON.stringify(body);
    res.writeHead(status, { "content-type": "application/json" });
    res.end(text);
  }

  function sendError(res: ServerResponse, status: number, error: string): void {
    sendJson(res, status, { error });
  }

  async function readJsonBody(req: IncomingMessage, maxBytes: number): Promise<unknown> {
    const declaredLength = Number(req.headers["content-length"]);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new ValidationError("request body too large", 413);
    }
    const chunks: Buffer[] = [];
    let total = 0;
    // Do not destroy the socket when leaving early: the caller must send a
    // useful 413 before closing it. Stop reading/buffering as soon as bounded.
    for await (const chunk of req.iterator({ destroyOnReturn: false })) {
      const buf = chunk as Buffer;
      total += buf.length;
      if (total > maxBytes) {
        throw new ValidationError("request body too large", 413);
      }
      chunks.push(buf);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    if (!text) throw new ValidationError("request body must be JSON");
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new ValidationError("request body must be JSON");
    }
  }

  async function authenticate(req: IncomingMessage): Promise<Authed | null> {
    const token = parseCookies(req.headers.cookie).get(SESSION_COOKIE);
    if (!token) return null;
    const session = await store.getSessionByTokenHash(hashToken(token));
    if (!session) return null;
    if (session.expiresAt.getTime() <= Date.now()) {
      await store.deleteSession(session.tokenHash);
      return null;
    }
    const user = await store.getUserById(session.userId);
    if (!user) return null;
    return { user, session };
  }

  /** Session + CSRF gate for mutations: sends 401/403 and returns null. */
  async function requireMutationAuth(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<Authed | null> {
    const authed = await authenticate(req);
    if (!authed) {
      sendError(res, 401, "unauthorized");
      return null;
    }
    if (req.headers["x-csrf-token"] !== authed.session.csrfToken) {
      sendError(res, 403, "bad csrf token");
      return null;
    }
    return authed;
  }

  async function requireAuth(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<Authed | null> {
    const authed = await authenticate(req);
    if (!authed) {
      sendError(res, 401, "unauthorized");
      return null;
    }
    return authed;
  }

  // -- auth routes --------------------------------------------------------

  function handleGoogleStart(res: ServerResponse): void {
    if (!deps.google) {
      sendError(res, 503, "google sign-in is not configured");
      return;
    }
    const state = newToken();
    const now = Date.now();
    for (const [key, expiry] of pendingStates) {
      if (expiry <= now) pendingStates.delete(key);
    }
    if (pendingStates.size >= MAX_PENDING_STATES) {
      res.setHeader("retry-after", "60");
      sendError(res, 429, "too many pending sign-ins; try again shortly");
      return;
    }
    pendingStates.set(state, now + OAUTH_STATE_TTL_MS);
    res.writeHead(302, {
      location: deps.google.consentUrl(state),
      "set-cookie": oauthStateCookie(state),
    });
    res.end();
  }

  async function handleGoogleCallback(
    req: IncomingMessage,
    url: URL,
    res: ServerResponse,
  ): Promise<void> {
    if (!deps.google) {
      sendError(res, 503, "google sign-in is not configured");
      return;
    }
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) {
      sendError(res, 400, "missing code or state");
      return;
    }
    const browserState = parseCookies(req.headers.cookie).get(OAUTH_STATE_COOKIE);
    const stateExpiry = pendingStates.get(state);
    if (browserState !== state || stateExpiry === undefined || stateExpiry <= Date.now()) {
      sendError(res, 400, "invalid or expired state");
      return;
    }
    // Consume only after browser binding is checked. A callback delivered to
    // another browser cannot sign that browser in or cancel a legitimate flow.
    pendingStates.delete(state);
    res.setHeader("set-cookie", oauthStateCookie("", true));

    let profile;
    try {
      profile = await deps.google.exchangeCode(code);
    } catch (err) {
      console.error("[server] google exchange failed:", err);
      sendError(res, 502, "google sign-in failed");
      return;
    }

    const user = await store.upsertUser({
      googleSub: profile.sub,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
    });
    const token = newToken();
    await store.createSession({
      userId: user.id,
      tokenHash: hashToken(token),
      csrfToken: newToken(),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });
    res.writeHead(302, {
      location: `${config.appOrigin}/`,
      "set-cookie": [sessionCookie(token, config.cookieDomain), oauthStateCookie("", true)],
    });
    res.end();
  }

  async function handleSignout(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const authed = await requireMutationAuth(req, res);
    if (!authed) return;
    await store.deleteSession(authed.session.tokenHash);
    res.writeHead(204, {
      "set-cookie": clearedSessionCookie(config.cookieDomain),
    });
    res.end();
  }

  // -- api routes -----------------------------------------------------------

  async function handleApi(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<void> {
    const method = req.method ?? "GET";
    const path = url.pathname;

    if (path === "/api/me" && method === "GET") {
      const authed = await authenticate(req);
      if (!authed) {
        sendJson(res, 200, { user: null });
        return;
      }
      sendJson(res, 200, {
        user: {
          id: authed.user.id,
          name: authed.user.name,
          avatarUrl: authed.user.avatarUrl,
        },
        csrfToken: authed.session.csrfToken,
      });
      return;
    }

    if (path === "/api/me" && method === "DELETE") {
      const authed = await requireMutationAuth(req, res);
      if (!authed) return;
      await store.deleteUser(authed.user.id);
      res.writeHead(204, {
        "set-cookie": clearedSessionCookie(config.cookieDomain),
      });
      res.end();
      return;
    }

    if (path === "/api/games" && method === "POST") {
      const authed = await requireMutationAuth(req, res);
      if (!authed) return;
      const game = validateGame(await readJsonBody(req, MAX_GAME_BYTES));
      const inserted = await store.insertGame(authed.user.id, game);
      if (inserted) {
        sendJson(res, 201, gameJson(game));
      } else {
        const existing = await store.getGame(authed.user.id, game.id);
        sendJson(res, 200, gameJson(existing ?? game));
      }
      return;
    }

    if (path === "/api/table-sessions" && method === "GET") {
      const authed = await requireAuth(req, res); if (!authed) return;
      const entries = await store.listTables(authed.user.id);
      sendJson(res, 200, { sessions: entries.map(entry => {
        const state = validateScoringSession(entry.state);
        return { id: entry.id, revision: entry.revision, variant: state.variant, names: state.names, finished: state.finished, updatedAt: state.updatedAt };
      }) }); return;
    }
    if (path.startsWith("/api/table-sessions/")) {
      const id = path.slice("/api/table-sessions/".length);
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new ValidationError("invalid session id");
      if (method === "GET") {
        const authed = await requireAuth(req, res); if (!authed) return;
        const entry = await store.getTable(authed.user.id, id);
        if (!entry) sendError(res, 404, "session not found"); else sendJson(res, 200, { session: entry }); return;
      }
      if (method === "PUT") {
        const authed = await requireMutationAuth(req, res); if (!authed) return;
        const body = await readJsonBody(req, 576000) as Record<string, unknown>;
        if (!body || !Number.isSafeInteger(body["expectedRevision"]) || Number(body["expectedRevision"]) < 0 || Number(body["expectedRevision"]) > 1000000 || typeof body["mutationId"] !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(body["mutationId"])) throw new ValidationError("invalid session write");
        let state;
        try { state = validateScoringSession(body["session"]); } catch { throw new ValidationError("invalid scoring ledger"); }
        if (state.id !== id) throw new ValidationError("session id mismatch");
        const digest = createHash("sha256").update(JSON.stringify(state)).digest("hex");
        const result = await store.writeTable(authed.user.id, id, Number(body["expectedRevision"]), body["mutationId"], digest, state);
        sendJson(res, result.status === "saved" || result.status === "duplicate" ? 200 : 409, result); return;
      }
    }

    if (path === "/api/games" && method === "GET") {
      const authed = await requireAuth(req, res);
      if (!authed) return;
      const games = await store.listGames(authed.user.id, GAME_LIST_LIMIT);
      sendJson(res, 200, games.map(summaryJson));
      return;
    }

    const gameMatch = /^\/api\/games\/([^/]+)$/.exec(path);
    if (gameMatch && method === "GET") {
      const authed = await requireAuth(req, res);
      if (!authed) return;
      const game = await store.getGame(
        authed.user.id,
        validatedGameId(gameMatch[1]!),
      );
      if (!game) {
        sendError(res, 404, "game not found");
        return;
      }
      sendJson(res, 200, gameJson(game));
      return;
    }

    if (path === "/api/stats" && method === "GET") {
      const authed = await requireAuth(req, res);
      if (!authed) return;
      const variant = url.searchParams.get("variant") ?? "riichi";
      if (!["riichi","hong-kong","mcr","taiwanese"].includes(variant)) throw new ValidationError("unsupported stats variant");
      sendJson(res, 200, await store.getStats(authed.user.id, variant as GameVariant));
      return;
    }

    if (path === "/api/settings" && method === "GET") {
      const authed = await requireAuth(req, res);
      if (!authed) return;
      sendJson(res, 200, {
        settings: await store.getSettings(authed.user.id),
      });
      return;
    }

    if (path === "/api/settings" && method === "PUT") {
      const authed = await requireMutationAuth(req, res);
      if (!authed) return;
      const settings = validateSettings(await readJsonBody(req, MAX_SETTINGS_BYTES));
      await store.putSettings(
        authed.user.id,
        settings,
      );
      res.writeHead(204);
      res.end();
      return;
    }

    // In-progress carry-over (ruling, 2026-11-16): one stored game per
    // user, keyed by the session — a request can only ever touch the
    // caller's own row.
    if (path === "/api/resume" && method === "GET") {
      const authed = await requireAuth(req, res);
      if (!authed) return;
      const entry = await store.getResume(authed.user.id);
      sendJson(res, 200, {
        resume: entry
          ? {
              state: entry.state,
              savedAt: entry.clientSavedAt.toISOString(),
            }
          : null,
      });
      return;
    }

    if (path === "/api/resume" && method === "PUT") {
      const authed = await requireMutationAuth(req, res);
      if (!authed) return;
      const upload = validateResume(await readJsonBody(req, MAX_RESUME_BYTES));
      await store.putResume(authed.user.id, {
        state: upload.state,
        clientSavedAt: upload.clientSavedAt,
      });
      res.writeHead(204);
      res.end();
      return;
    }

    if (path === "/api/resume" && method === "DELETE") {
      const authed = await requireMutationAuth(req, res);
      if (!authed) return;
      await store.deleteResume(authed.user.id);
      res.writeHead(204);
      res.end();
      return;
    }

    if (path === "/api/import" && method === "POST") {
      const authed = await requireMutationAuth(req, res);
      if (!authed) return;
      const games = validateGameList(await readJsonBody(req, MAX_IMPORT_BYTES));
      let inserted = 0;
      for (const game of games) {
        if (await store.insertGame(authed.user.id, game)) inserted += 1;
      }
      sendJson(res, 200, { inserted });
      return;
    }

    sendError(res, 404, "not found");
  }

  // -- root handler ---------------------------------------------------------

  return (req, res) => {
    void (async () => {
      try {
        const url = new URL(req.url ?? "/", "http://localhost");
        const path =
          url.pathname.length > 1 && url.pathname.endsWith("/")
            ? url.pathname.slice(0, -1)
            : url.pathname;
        url.pathname = path;
        const method = req.method ?? "GET";

        res.setHeader("x-content-type-options", "nosniff");
        res.setHeader("referrer-policy", "no-referrer");
        // Responses include private history, OAuth transactions or CSRF tokens.
        res.setHeader("cache-control", "no-store");
        const apiPath = path === "/api" || path.startsWith("/api/");
        if (apiPath || path === "/auth/signout") {
          res.setHeader("vary", "Origin");
          const corsOk = req.headers.origin === config.appOrigin;
          if (corsOk) {
            res.setHeader("access-control-allow-origin", config.appOrigin);
            res.setHeader("access-control-allow-credentials", "true");
          }
          if (method === "OPTIONS") {
            if (corsOk) {
              res.setHeader("access-control-allow-methods", "GET, POST, PUT, DELETE, OPTIONS");
              res.setHeader("access-control-allow-headers", "content-type, x-csrf-token");
              res.setHeader("access-control-max-age", "86400");
            }
            res.writeHead(204);
            res.end();
            return;
          }
        }

        if (path === "/healthz" && method === "GET") {
          res.writeHead(200, { "content-type": "text/plain" });
          res.end("ok");
          return;
        }
        if (path === "/auth/google/start" && method === "GET") {
          handleGoogleStart(res);
          return;
        }
        if (path === "/auth/google/callback" && method === "GET") {
          await handleGoogleCallback(req, url, res);
          return;
        }
        if (path === "/auth/signout" && method === "POST") {
          await handleSignout(req, res);
          return;
        }
        if (path.startsWith("/api/online/")) {
          if (!deps.online) { sendError(res,503,"Online tables need a database connection"); return; }
          await deps.online.handle(req,res,url,config.appOrigin,()=>authenticate(req),()=>readJsonBody(req,4096));
          return;
        }
        if (apiPath) {
          await handleApi(req, res, url);
          return;
        }
        sendError(res, 404, "not found");
      } catch (err) {
        if (err instanceof ValidationError) {
          if (err.status === 413) res.setHeader("connection", "close");
          sendError(res, err.status, err.message);
          return;
        }
        console.error("[server] request failed:", err);
        if (!res.headersSent) sendError(res, 500, "internal error");
        else res.end();
      }
    })();
  };
}
