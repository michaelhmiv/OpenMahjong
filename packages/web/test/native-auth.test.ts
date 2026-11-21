import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Native sign-in bridge (iOS step 3b): the Capacitor core module and
 * the three first-party plugins are mocked, so these tests pin the
 * web-layer contract — boot restore, config gating, the two sign-in
 * exchanges, sign-out, and total inertness off the packaged shell —
 * without a device.
 */

const mocks = vi.hoisted(() => ({
  native: true,
  googleSignIn: vi.fn(),
  appleSignIn: vi.fn(),
  getToken: vi.fn(),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => mocks.native,
  },
  registerPlugin: (name: string) => {
    if (name === "OpenMahjongGoogleSignIn") return { signIn: mocks.googleSignIn };
    if (name === "OpenMahjongAppleSignIn") return { signIn: mocks.appleSignIn };
    if (name === "OpenMahjongSecureSession") {
      return {
        getToken: mocks.getToken,
        setToken: mocks.setToken,
        clearToken: mocks.clearToken,
      };
    }
    throw new Error(`unexpected plugin ${name}`);
  },
}));

import {
  API_BASE,
  fetchMe,
  getNativeSession,
  installNativeSession,
  signOut as apiSignOut,
} from "../src/api.js";
import {
  decodeStoredSession,
  encodeStoredSession,
  isGoogleUnavailable,
  isNativeShell,
  loadGoogleConfig,
  resetNativeAuthStateForTest,
  restoreNativeSession,
  signInWithAppleNative,
  signInWithGoogleNative,
  signOutNative,
} from "../src/native-auth.js";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

type FetchCall = [string, RequestInit];

function recordingFetch(handler: (url: string, init: RequestInit) => Response) {
  const calls: FetchCall[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push([url, init]);
    return handler(url, init);
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const sessionBody = {
  token: "sess-token",
  csrfToken: "csrf-1",
  user: { id: "u1", name: "Michael M" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.native = true;
  resetNativeAuthStateForTest();
  mocks.getToken.mockResolvedValue({ token: "" });
  mocks.setToken.mockResolvedValue(undefined);
  mocks.clearToken.mockResolvedValue(undefined);
});

describe("stored session bundle", () => {
  it("round-trips token + csrfToken as one JSON value", () => {
    const session = { token: "t", csrfToken: "c" };
    expect(decodeStoredSession(encodeStoredSession(session))).toEqual(session);
  });

  it("treats empty and damaged values as no session", () => {
    expect(decodeStoredSession("")).toBeNull();
    expect(decodeStoredSession("not json")).toBeNull();
    expect(decodeStoredSession(JSON.stringify({ token: "t" }))).toBeNull();
  });
});

describe("boot restore", () => {
  it("installs the stored session into the API layer", async () => {
    mocks.getToken.mockResolvedValue({
      token: encodeStoredSession({ token: "sess-token", csrfToken: "csrf-1" }),
    });
    await expect(restoreNativeSession()).resolves.toEqual({
      token: "sess-token",
      csrfToken: "csrf-1",
    });
    expect(getNativeSession()).toEqual({ token: "sess-token", csrfToken: "csrf-1" });
  });

  it("installs nothing for a guest (empty keychain value)", async () => {
    await expect(restoreNativeSession()).resolves.toBeNull();
    expect(getNativeSession()).toBeNull();
  });

  it("never throws when the keychain read fails", async () => {
    mocks.getToken.mockRejectedValue(new Error("keychain gone"));
    await expect(restoreNativeSession()).resolves.toBeNull();
    expect(getNativeSession()).toBeNull();
  });
});

describe("google config gating", () => {
  it("null iosClientId -> Google unavailable, config still cached for the UI", async () => {
    const { fn, calls } = recordingFetch(() =>
      jsonResponse({ iosClientId: null, serverClientId: "web-client" }),
    );
    await expect(loadGoogleConfig(fn)).resolves.toEqual({
      iosClientId: null,
      serverClientId: "web-client",
    });
    expect(calls[0]?.[0]).toBe(`${API_BASE}/mobile/auth/google-config`);
    expect(isGoogleUnavailable()).toBe(true);
  });

  it("google sign-in refuses while iosClientId is null and never calls the plugin", async () => {
    const { fn } = recordingFetch(() =>
      jsonResponse({ iosClientId: null, serverClientId: "web-client" }),
    );
    const result = await signInWithGoogleNative(fn);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unavailable");
    expect(mocks.googleSignIn).not.toHaveBeenCalled();
  });
});

describe("google sign-in happy path", () => {
  it("posts the plugin idToken to /auth/google/native and stores the session", async () => {
    mocks.googleSignIn.mockResolvedValue({ idToken: "google-id-token" });
    const { fn, calls } = recordingFetch((url) =>
      url.endsWith("/mobile/auth/google-config")
        ? jsonResponse({ iosClientId: "ios-client", serverClientId: "web-client" })
        : jsonResponse(sessionBody),
    );
    const result = await signInWithGoogleNative(fn);
    expect(result).toEqual({ ok: true, user: sessionBody.user });

    const pluginArgs = mocks.googleSignIn.mock.calls[0]?.[0] as {
      clientId: string;
      serverClientId: string;
      nonce: string;
    };
    expect(pluginArgs.clientId).toBe("ios-client");
    expect(pluginArgs.serverClientId).toBe("web-client");
    expect(pluginArgs.nonce).toMatch(/^[0-9a-f]{32}$/);

    const post = calls.find(([url]) => url.endsWith("/auth/google/native"));
    expect(post).toBeDefined();
    expect(JSON.parse(String(post?.[1].body))).toEqual({ idToken: "google-id-token" });

    expect(mocks.setToken).toHaveBeenCalledWith({
      token: encodeStoredSession({ token: "sess-token", csrfToken: "csrf-1" }),
    });
    expect(getNativeSession()).toEqual({ token: "sess-token", csrfToken: "csrf-1" });
  });

  it("surfaces the plugin's shared failure message verbatim", async () => {
    mocks.googleSignIn.mockRejectedValue(
      new Error("Google sign-in was cancelled or could not be completed"),
    );
    const { fn } = recordingFetch(() =>
      jsonResponse({ iosClientId: "ios-client", serverClientId: "web-client" }),
    );
    const result = await signInWithGoogleNative(fn);
    expect(result).toEqual({
      ok: false,
      reason: "failed",
      message: "Google sign-in was cancelled or could not be completed",
    });
    expect(mocks.setToken).not.toHaveBeenCalled();
  });
});

describe("apple sign-in", () => {
  it("forwards idToken, the raw nonce, and first-authorization fullName", async () => {
    mocks.appleSignIn.mockResolvedValue({
      idToken: "apple-id-token",
      fullName: { givenName: "Michael", familyName: "Murphy" },
      email: "m@example.com",
    });
    const { fn, calls } = recordingFetch(() => jsonResponse(sessionBody));
    const result = await signInWithAppleNative(fn);
    expect(result).toEqual({ ok: true, user: sessionBody.user });

    const pluginArgs = mocks.appleSignIn.mock.calls[0]?.[0] as { nonce: string };
    expect(pluginArgs.nonce).toMatch(/^[0-9a-f]{32}$/);

    const post = calls.find(([url]) => url.endsWith("/auth/apple/native"));
    expect(post).toBeDefined();
    expect(JSON.parse(String(post?.[1].body))).toEqual({
      idToken: "apple-id-token",
      nonce: pluginArgs.nonce,
      fullName: { givenName: "Michael", familyName: "Murphy" },
    });
    expect(mocks.setToken).toHaveBeenCalledTimes(1);
    expect(getNativeSession()).toEqual({ token: "sess-token", csrfToken: "csrf-1" });
  });

  it("omits fullName when Apple does not provide it (later authorizations)", async () => {
    mocks.appleSignIn.mockResolvedValue({ idToken: "apple-id-token" });
    const { fn, calls } = recordingFetch(() => jsonResponse(sessionBody));
    await signInWithAppleNative(fn);
    const post = calls.find(([url]) => url.endsWith("/auth/apple/native"));
    const body = JSON.parse(String(post?.[1].body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty("fullName");
  });
});

describe("sign-out", () => {
  it("calls the server sign-out, then clears storage and the installed session", async () => {
    mocks.getToken.mockResolvedValue({
      token: encodeStoredSession({ token: "sess-token", csrfToken: "csrf-1" }),
    });
    await restoreNativeSession();
    const { fn, calls } = recordingFetch(() => jsonResponse({}, true, 204));
    await expect(signOutNative(fn)).resolves.toBe(true);
    const post = calls.find(([url]) => url.endsWith("/auth/signout"));
    expect(post).toBeDefined();
    const headers = (post?.[1].headers ?? {}) as Record<string, string>;
    expect(headers["authorization"]).toBe("Bearer sess-token");
    expect(headers["x-csrf-token"]).toBe("csrf-1");
    expect(mocks.clearToken).toHaveBeenCalledTimes(1);
    expect(getNativeSession()).toBeNull();
  });

  it("clears the local session even when the server call fails", async () => {
    mocks.getToken.mockResolvedValue({
      token: encodeStoredSession({ token: "sess-token", csrfToken: "csrf-1" }),
    });
    await restoreNativeSession();
    const { fn } = recordingFetch(() => jsonResponse({}, false, 500));
    await expect(signOutNative(fn)).resolves.toBe(false);
    expect(mocks.clearToken).toHaveBeenCalledTimes(1);
    expect(getNativeSession()).toBeNull();
  });
});

describe("api session provider", () => {
  it("adds the bearer token to reads and bearer + CSRF to mutations while installed", async () => {
    installNativeSession({ token: "sess-token", csrfToken: "csrf-1" });
    const { fn, calls } = recordingFetch((url) =>
      url.endsWith("/api/me")
        ? jsonResponse({ user: { id: "u1", name: "Michael M" }, csrfToken: "csrf-1" })
        : jsonResponse({}, true, 204),
    );
    await fetchMe(fn);
    await apiSignOut(null, fn);
    const meHeaders = (calls[0]?.[1].headers ?? {}) as Record<string, string>;
    expect(meHeaders["authorization"]).toBe("Bearer sess-token");
    expect(meHeaders).not.toHaveProperty("x-csrf-token");
    const outHeaders = (calls[1]?.[1].headers ?? {}) as Record<string, string>;
    expect(outHeaders["authorization"]).toBe("Bearer sess-token");
    expect(outHeaders["x-csrf-token"]).toBe("csrf-1");
  });

  it("sends neither header when no session is installed (cookie flow unchanged)", async () => {
    const { fn, calls } = recordingFetch(() =>
      jsonResponse({ user: null, csrfToken: null }),
    );
    await fetchMe(fn);
    const headers = (calls[0]?.[1].headers ?? {}) as Record<string, string>;
    expect(headers).not.toHaveProperty("authorization");
    expect(headers).not.toHaveProperty("x-csrf-token");
  });
});

describe("non-native platform", () => {
  beforeEach(() => {
    mocks.native = false;
  });

  it("is fully inert: no plugin calls, no fetches, nothing installed", async () => {
    expect(isNativeShell()).toBe(false);
    await expect(restoreNativeSession()).resolves.toBeNull();
    const { fn, calls } = recordingFetch(() => jsonResponse(sessionBody));
    await expect(loadGoogleConfig(fn)).resolves.toBeNull();
    expect((await signInWithGoogleNative(fn)).ok).toBe(false);
    expect((await signInWithAppleNative(fn)).ok).toBe(false);
    await expect(signOutNative(fn)).resolves.toBe(false);
    expect(calls).toHaveLength(0);
    expect(mocks.getToken).not.toHaveBeenCalled();
    expect(mocks.googleSignIn).not.toHaveBeenCalled();
    expect(mocks.appleSignIn).not.toHaveBeenCalled();
    expect(mocks.setToken).not.toHaveBeenCalled();
    expect(mocks.clearToken).not.toHaveBeenCalled();
    expect(getNativeSession()).toBeNull();
  });
});
