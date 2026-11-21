/**
 * Native sign-in suite (iOS brief, Open decision 3): POST
 * /auth/google/native, POST /auth/apple/native, bearer session
 * acceptance, and GET /mobile/auth/google-config — run against the
 * in-memory store. Google verification is exercised through the real
 * tokeninfo verifier with an injected fetch; Apple verification runs
 * the real RS256 path against a test-generated RSA keypair served as
 * a fake JWKS (the crypto is proved, not mocked away).
 */

import { createServer, type Server } from "node:http";
import {
  createHash,
  createSign,
  generateKeyPairSync,
  randomUUID,
} from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import type { GoogleProfile } from "../src/google.js";
import { MemoryStore } from "../src/memory-store.js";
import {
  createAppleIdTokenVerifier,
  createGoogleIdTokenVerifier,
  type AppleIdTokenVerifier,
  type GoogleIdTokenVerifier,
} from "../src/native-auth.js";

const WEB_CLIENT_ID = "web-client-id";
const IOS_CLIENT_ID = "ios-client-id";
const APPLE_AUDIENCE = "app.openmahjong";

const baseConfig: Config = {
  port: 0,
  appOrigin: "https://openmahjong.app",
  databaseUrl: null,
  googleClientId: WEB_CLIENT_ID,
  googleClientSecret: "test-secret",
  googleIosClientId: IOS_CLIENT_ID,
  appleAudience: APPLE_AUDIENCE,
  apiOrigin: "https://api.openmahjong.app",
  cookieDomain: ".openmahjong.app",
};

const servers: Server[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

interface Ctx {
  base: string;
  store: MemoryStore;
}

async function setup(opts: {
  config?: Config;
  googleTokenVerifier?: GoogleIdTokenVerifier | null;
  appleTokenVerifier?: AppleIdTokenVerifier | null;
} = {}): Promise<Ctx> {
  const store = new MemoryStore();
  const server = createServer(
    createApp({
      store,
      google: null,
      config: opts.config ?? baseConfig,
      googleTokenVerifier:
        opts.googleTokenVerifier === undefined
          ? fakeGoogleVerifier()
          : opts.googleTokenVerifier,
      appleTokenVerifier:
        opts.appleTokenVerifier === undefined
          ? appleFixture.verifier
          : opts.appleTokenVerifier,
    }),
  );
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  return { base: `http://127.0.0.1:${addr.port}`, store };
}

function fakeGoogleVerifier(): GoogleIdTokenVerifier {
  const profiles: Record<string, GoogleProfile> = {
    "token-alice": {
      sub: "sub-alice",
      name: "Alice A",
      avatarUrl: "https://example.com/alice.png",
    },
  };
  return {
    async verifyIdToken(idToken: string): Promise<GoogleProfile> {
      const profile = profiles[idToken];
      if (!profile) throw new Error("invalid token");
      return profile;
    },
  };
}

// -- Apple fixtures: a real RSA keypair + JWKS + signer -------------------

const RAW_NONCE = "raw-nonce-123";
const NONCE_HASH = createHash("sha256").update(RAW_NONCE).digest("hex");

const appleFixture = (() => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const jwk = publicKey.export({ format: "jwk" }) as {
    kty: string;
    n: string;
    e: string;
  };
  const kid = "test-key-1";
  const jwks = {
    keys: [{ ...jwk, kid, use: "sig", alg: "RS256" }],
  };
  const fetchImpl = vi.fn<typeof fetch>(async () =>
    new Response(JSON.stringify(jwks), {
      headers: { "content-type": "application/json" },
    }),
  );
  const verifier = createAppleIdTokenVerifier({
    audience: APPLE_AUDIENCE,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });

  function sign(
    claims: Record<string, unknown>,
    opts: { kid?: string; tamper?: boolean } = {},
  ): string {
    const b64 = (value: unknown): string =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    const header = { alg: "RS256", kid: opts.kid ?? kid, typ: "JWT" };
    const input = `${b64(header)}.${b64(claims)}`;
    let signature = createSign("RSA-SHA256")
      .update(input)
      .sign(privateKey, "base64url");
    if (opts.tamper) {
      signature = (signature[0] === "A" ? "B" : "A") + signature.slice(1);
    }
    return `${input}.${signature}`;
  }

  function claims(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      iss: "https://appleid.apple.com",
      aud: APPLE_AUDIENCE,
      exp: Math.floor(Date.now() / 1000) + 600,
      iat: Math.floor(Date.now() / 1000),
      sub: "apple-sub-1",
      nonce: NONCE_HASH,
      email: "player@privaterelay.appleid.com",
      ...overrides,
    };
  }

  return { verifier, sign, claims, fetchImpl };
})();

async function postNative(
  ctx: Ctx,
  path: string,
  body: unknown,
): Promise<Response> {
  return fetch(`${ctx.base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

interface NativeSessionBody {
  token: string;
  csrfToken: string;
  user: { id: string; name: string; avatarUrl: string | null };
}

// -- Google native ---------------------------------------------------------

describe("POST /auth/google/native", () => {
  it("creates a user + session and returns token, csrfToken, and user; also sets the cookie", async () => {
    const ctx = await setup();
    const res = await postNative(ctx, "/auth/google/native", {
      idToken: "token-alice",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as NativeSessionBody;
    expect(typeof body.token).toBe("string");
    expect(body.token.length).toBeGreaterThan(20);
    expect(typeof body.csrfToken).toBe("string");
    expect(body.user.name).toBe("Alice A");
    expect(body.user.avatarUrl).toBe("https://example.com/alice.png");

    const setCookie = res.headers
      .getSetCookie()
      .find((c) => c.startsWith("om_session="));
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain(`om_session=${body.token}`);
    expect(setCookie).toContain("HttpOnly");

    expect(ctx.store.users.size).toBe(1);
    expect(ctx.store.sessions.size).toBe(1);
    const [user] = [...ctx.store.users.values()];
    expect(user!.googleSub).toBe("sub-alice");
    // The returned bearer token authenticates immediately.
    const me = await fetch(`${ctx.base}/api/me`, {
      headers: { authorization: `Bearer ${body.token}` },
    });
    expect(((await me.json()) as { user: { id: string } }).user.id).toBe(
      body.user.id,
    );
  });

  it("repeat sign-in returns the same user", async () => {
    const ctx = await setup();
    const first = (await (
      await postNative(ctx, "/auth/google/native", { idToken: "token-alice" })
    ).json()) as NativeSessionBody;
    const second = (await (
      await postNative(ctx, "/auth/google/native", { idToken: "token-alice" })
    ).json()) as NativeSessionBody;
    expect(second.user.id).toBe(first.user.id);
    expect(ctx.store.users.size).toBe(1);
    expect(ctx.store.sessions.size).toBe(2);
  });

  it("failed verification is 401 and creates nothing", async () => {
    const ctx = await setup();
    const res = await postNative(ctx, "/auth/google/native", {
      idToken: "bogus",
    });
    expect(res.status).toBe(401);
    expect(ctx.store.users.size).toBe(0);
    expect(ctx.store.sessions.size).toBe(0);
  });

  it("malformed bodies are 400", async () => {
    const ctx = await setup();
    for (const body of [{}, { idToken: 42 }, { idToken: "" }, []]) {
      const res = await postNative(ctx, "/auth/google/native", body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    const notJson = await fetch(`${ctx.base}/auth/google/native`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    expect(notJson.status).toBe(400);
  });

  it("is 503 when no verifier is configured", async () => {
    const ctx = await setup({ googleTokenVerifier: null });
    const res = await postNative(ctx, "/auth/google/native", {
      idToken: "token-alice",
    });
    expect(res.status).toBe(503);
  });
});

describe("Google tokeninfo verifier (real, fake fetch)", () => {
  function verifierReturning(payload: Record<string, unknown>) {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify(payload)),
    );
    return createGoogleIdTokenVerifier({
      audienceClientIds: [WEB_CLIENT_ID, IOS_CLIENT_ID],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
  }

  const goodPayload = {
    aud: IOS_CLIENT_ID,
    iss: "https://accounts.google.com",
    exp: String(Math.floor(Date.now() / 1000) + 600),
    sub: "sub-alice",
    name: "Alice A",
    picture: "https://example.com/alice.png",
  };

  it("accepts a token addressed to the iOS client ID", async () => {
    const profile = await verifierReturning(goodPayload).verifyIdToken("tok");
    expect(profile).toEqual({
      sub: "sub-alice",
      name: "Alice A",
      avatarUrl: "https://example.com/alice.png",
    });
  });

  it("rejects a wrong audience", async () => {
    await expect(
      verifierReturning({ ...goodPayload, aud: "someone-else" }).verifyIdToken(
        "tok",
      ),
    ).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    await expect(
      verifierReturning({
        ...goodPayload,
        exp: String(Math.floor(Date.now() / 1000) - 60),
      }).verifyIdToken("tok"),
    ).rejects.toThrow();
  });

  it("rejects a foreign issuer and a missing name", async () => {
    await expect(
      verifierReturning({ ...goodPayload, iss: "https://evil.example" })
        .verifyIdToken("tok"),
    ).rejects.toThrow();
    const noName: Record<string, unknown> = { ...goodPayload };
    delete noName["name"];
    await expect(verifierReturning(noName).verifyIdToken("tok")).rejects
      .toThrow();
  });
});

// -- Apple native ----------------------------------------------------------

describe("POST /auth/apple/native", () => {
  it("verifies a real RS256 token, captures the first-sign-in name, and issues a session", async () => {
    const ctx = await setup();
    const res = await postNative(ctx, "/auth/apple/native", {
      idToken: appleFixture.sign(appleFixture.claims()),
      nonce: RAW_NONCE,
      fullName: { givenName: "Grace", familyName: "Hopper" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as NativeSessionBody;
    expect(body.user.name).toBe("Grace Hopper");
    expect(body.user.avatarUrl).toBeNull();
    expect(typeof body.token).toBe("string");

    expect(ctx.store.users.size).toBe(1);
    const [user] = [...ctx.store.users.values()];
    expect(user!.appleSub).toBe("apple-sub-1");
    expect(user!.googleSub).toBeNull();
    expect(user!.email).toBe("player@privaterelay.appleid.com");
  });

  it("repeat sign-in without fullName keeps the captured name and the same user", async () => {
    const ctx = await setup();
    const first = (await (
      await postNative(ctx, "/auth/apple/native", {
        idToken: appleFixture.sign(appleFixture.claims()),
        nonce: RAW_NONCE,
        fullName: { givenName: "Grace", familyName: "Hopper" },
      })
    ).json()) as NativeSessionBody;
    const secondRes = await postNative(ctx, "/auth/apple/native", {
      idToken: appleFixture.sign(appleFixture.claims({ email: undefined })),
      nonce: RAW_NONCE,
    });
    expect(secondRes.status).toBe(200);
    const second = (await secondRes.json()) as NativeSessionBody;
    expect(second.user.id).toBe(first.user.id);
    expect(second.user.name).toBe("Grace Hopper");
    expect(ctx.store.users.size).toBe(1);
  });

  it("accepts the raw nonce as the token's nonce claim (tolerance)", async () => {
    const ctx = await setup();
    const res = await postNative(ctx, "/auth/apple/native", {
      idToken: appleFixture.sign(appleFixture.claims({ nonce: RAW_NONCE })),
      nonce: RAW_NONCE,
    });
    expect(res.status).toBe(200);
  });

  it("rejects a nonce mismatch with 401", async () => {
    const ctx = await setup();
    const res = await postNative(ctx, "/auth/apple/native", {
      idToken: appleFixture.sign(appleFixture.claims()),
      nonce: "a-different-nonce",
    });
    expect(res.status).toBe(401);
    expect(ctx.store.users.size).toBe(0);
  });

  it("rejects expired, wrong-audience, and tampered tokens with 401", async () => {
    const ctx = await setup();
    const cases: Array<[string, string]> = [
      [
        "expired",
        appleFixture.sign(
          appleFixture.claims({
            exp: Math.floor(Date.now() / 1000) - 60,
          }),
        ),
      ],
      [
        "wrong audience",
        appleFixture.sign(appleFixture.claims({ aud: "com.someone.else" })),
      ],
      [
        "tampered signature",
        appleFixture.sign(appleFixture.claims(), { tamper: true }),
      ],
      [
        "unknown kid",
        appleFixture.sign(appleFixture.claims(), { kid: "no-such-key" }),
      ],
    ];
    for (const [label, idToken] of cases) {
      const res = await postNative(ctx, "/auth/apple/native", {
        idToken,
        nonce: RAW_NONCE,
      });
      expect(res.status, label).toBe(401);
    }
    expect(ctx.store.users.size).toBe(0);
  });

  it("malformed bodies are 400", async () => {
    const ctx = await setup();
    for (const body of [
      {},
      { idToken: "x" },
      { nonce: RAW_NONCE },
      { idToken: "x", nonce: RAW_NONCE, fullName: { givenName: 7 } },
    ]) {
      const res = await postNative(ctx, "/auth/apple/native", body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("an Apple identity and a Google identity are different accounts", async () => {
    const ctx = await setup();
    await postNative(ctx, "/auth/google/native", { idToken: "token-alice" });
    await postNative(ctx, "/auth/apple/native", {
      idToken: appleFixture.sign(appleFixture.claims()),
      nonce: RAW_NONCE,
      fullName: { givenName: "Alice", familyName: "A" },
    });
    expect(ctx.store.users.size).toBe(2);
  });
});

// -- Bearer sessions --------------------------------------------------------

describe("bearer session acceptance", () => {
  async function nativeSignIn(ctx: Ctx): Promise<NativeSessionBody> {
    const res = await postNative(ctx, "/auth/google/native", {
      idToken: "token-alice",
    });
    expect(res.status).toBe(200);
    return (await res.json()) as NativeSessionBody;
  }

  it("authenticates /api/me and a CSRF mutation; sign-out via bearer works", async () => {
    const ctx = await setup();
    const session = await nativeSignIn(ctx);
    const bearer = { authorization: `Bearer ${session.token}` };

    const me = await fetch(`${ctx.base}/api/me`, { headers: bearer });
    const meBody = (await me.json()) as {
      user: { name: string };
      csrfToken: string;
    };
    expect(meBody.user.name).toBe("Alice A");
    expect(meBody.csrfToken).toBe(session.csrfToken);

    const game = {
      id: randomUUID(),
      length: "south",
      placement: 2,
      score: 28700,
      finishedAt: "2026-11-16T12:00:00.000Z",
      log: { decisions: [{ type: "discard", tile: "5p" }] },
      stats: { hands: 8, riichi: 2, dealIns: 0, handsWon: 2, winPoints: 9100 },
    };
    const noCsrf = await fetch(`${ctx.base}/api/games`, {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer },
      body: JSON.stringify(game),
    });
    expect(noCsrf.status).toBe(403);

    const posted = await fetch(`${ctx.base}/api/games`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...bearer,
        "x-csrf-token": session.csrfToken,
      },
      body: JSON.stringify(game),
    });
    expect(posted.status).toBe(201);

    const signout = await fetch(`${ctx.base}/auth/signout`, {
      method: "POST",
      headers: { ...bearer, "x-csrf-token": session.csrfToken },
    });
    expect(signout.status).toBe(204);
    expect(ctx.store.sessions.size).toBe(0);
    const after = await fetch(`${ctx.base}/api/me`, { headers: bearer });
    expect(await after.json()).toEqual({ user: null });
  });

  it("a bogus bearer token does not authenticate", async () => {
    const ctx = await setup();
    const me = await fetch(`${ctx.base}/api/me`, {
      headers: { authorization: "Bearer not-a-session" },
    });
    expect(await me.json()).toEqual({ user: null });
    const games = await fetch(`${ctx.base}/api/games`, {
      headers: { authorization: "Bearer not-a-session" },
    });
    expect(games.status).toBe(401);
  });

  it("cookie auth still works alongside bearer", async () => {
    const ctx = await setup();
    const session = await nativeSignIn(ctx);
    const me = await fetch(`${ctx.base}/api/me`, {
      headers: { cookie: `om_session=${session.token}` },
    });
    const body = (await me.json()) as { user: { name: string } };
    expect(body.user.name).toBe("Alice A");
  });
});

// -- google-config -----------------------------------------------------------

describe("GET /mobile/auth/google-config", () => {
  it("returns both client IDs when the iOS env is set", async () => {
    const ctx = await setup();
    const res = await fetch(`${ctx.base}/mobile/auth/google-config`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      iosClientId: IOS_CLIENT_ID,
      serverClientId: WEB_CLIENT_ID,
    });
  });

  it("returns iosClientId null when the iOS env is unset", async () => {
    const { googleIosClientId: _omit, ...rest } = baseConfig;
    const ctx = await setup({ config: rest });
    const res = await fetch(`${ctx.base}/mobile/auth/google-config`);
    expect(await res.json()).toEqual({
      iosClientId: null,
      serverClientId: WEB_CLIENT_ID,
    });
  });
});
