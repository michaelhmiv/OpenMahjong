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
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  clearedSessionCookie,
  hashToken,
  newToken,
  parseCookies,
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
} from "./store.js";
import { ValidationError, validateGame, validateGameList } from "./validate.js";

export interface AppDeps {
  store: Store;
  google: GoogleClient | null;
  config: Config;
}

const MAX_BODY_BYTES = 16 * 1024 * 1024;
const STATE_TTL_MS = 10 * 60 * 1000;
const GAME_LIST_LIMIT = 200;

interface Authed {
  user: User;
  session: Session;
}

function gameJson(game: GameRecord): Record<string, unknown> {
  return {
    id: game.id,
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

  async function readJsonBody(req: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of req) {
      const buf = chunk as Buffer;
      total += buf.length;
      if (total > MAX_BODY_BYTES) {
        throw new ValidationError("request body too large");
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
    pendingStates.set(state, now + STATE_TTL_MS);
    res.writeHead(302, { location: deps.google.consentUrl(state) });
    res.end();
  }

  async function handleGoogleCallback(
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
    const stateExpiry = pendingStates.get(state);
    pendingStates.delete(state);
    if (stateExpiry === undefined || stateExpiry <= Date.now()) {
      sendError(res, 400, "invalid or expired state");
      return;
    }

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
      "set-cookie": sessionCookie(token, config.cookieDomain),
    });
    res.end();
  }

  async function handleSignout(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const token = parseCookies(req.headers.cookie).get(SESSION_COOKIE);
    if (token) await store.deleteSession(hashToken(token));
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

    // CORS: exactly the app origin, credentials allowed.
    const origin = req.headers.origin;
    const corsOk = origin === config.appOrigin;
    if (corsOk) {
      res.setHeader("access-control-allow-origin", config.appOrigin);
      res.setHeader("access-control-allow-credentials", "true");
      res.setHeader("vary", "Origin");
    }
    if (method === "OPTIONS") {
      if (corsOk) {
        res.setHeader(
          "access-control-allow-methods",
          "GET, POST, PUT, DELETE, OPTIONS",
        );
        res.setHeader(
          "access-control-allow-headers",
          "content-type, x-csrf-token",
        );
        res.setHeader("access-control-max-age", "86400");
      }
      res.writeHead(204);
      res.end();
      return;
    }

    if (path === "/api/me" && method === "GET") {
      const authed = await authenticate(req);
      if (!authed) {
        sendJson(res, 200, { user: null });
        return;
      }
      sendJson(res, 200, {
        user: {
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
      const game = validateGame(await readJsonBody(req));
      const inserted = await store.insertGame(authed.user.id, game);
      if (inserted) {
        sendJson(res, 201, gameJson(game));
      } else {
        const existing = await store.getGame(authed.user.id, game.id);
        sendJson(res, 200, gameJson(existing ?? game));
      }
      return;
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
        decodeURIComponent(gameMatch[1]!),
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
      sendJson(res, 200, await store.getStats(authed.user.id));
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
      const body = await readJsonBody(req);
      if (
        typeof body !== "object" ||
        body === null ||
        !("settings" in body)
      ) {
        throw new ValidationError("body must be { settings }");
      }
      await store.putSettings(
        authed.user.id,
        (body as Record<string, unknown>)["settings"],
      );
      res.writeHead(204);
      res.end();
      return;
    }

    if (path === "/api/import" && method === "POST") {
      const authed = await requireMutationAuth(req, res);
      if (!authed) return;
      const games = validateGameList(await readJsonBody(req));
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
          await handleGoogleCallback(url, res);
          return;
        }
        if (path === "/auth/signout" && method === "POST") {
          await handleSignout(req, res);
          return;
        }
        if (path === "/api" || path.startsWith("/api/")) {
          await handleApi(req, res, url);
          return;
        }
        sendError(res, 404, "not found");
      } catch (err) {
        if (err instanceof ValidationError) {
          sendError(res, 400, err.message);
          return;
        }
        console.error("[server] request failed:", err);
        if (!res.headersSent) sendError(res, 500, "internal error");
        else res.end();
      }
    })();
  };
}
