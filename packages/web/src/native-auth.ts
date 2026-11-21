/**
 * Native sign-in bridge (iOS step 3b, brief-ios-v1 decision 3).
 *
 * Inside the packaged Capacitor shell, sign-in runs through the
 * first-party native plugins (mobile/ios/) instead of the web
 * redirect flow: the Google and Apple plugins return ID tokens, this
 * module exchanges them at the server's native endpoints
 * (POST /auth/google/native, POST /auth/apple/native — step 3a,
 * PR #110), and the returned session is stored in the keychain via
 * OpenMahjongSecureSession and installed into api.ts, whose requests
 * then carry `Authorization: Bearer <token>` (+ the session's
 * `x-csrf-token` on mutations).
 *
 * On the web (not the packaged shell) EVERY export here is inert:
 * isNativeShell() is false, boot/sign-in/sign-out are no-ops, and
 * the existing Google redirect flow is completely untouched. Guests
 * in the shell without a stored session are likewise untouched —
 * nothing is installed and requests stay on the cookie flow.
 *
 * Keychain storage shape: ONE value under the plugin's session-token
 * account — a small JSON string, `{"token":"…","csrfToken":"…"}` —
 * so the session token and its CSRF token are stored, restored, and
 * cleared atomically as one bundle. (Munch stores a bare token
 * because its runtime re-derives CSRF per request; this server binds
 * the CSRF token to the session, so the pair travels together.)
 */

import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  API_BASE,
  installNativeSession,
  signOut as apiSignOut,
  type ApiUser,
  type NativeSession,
} from "./api.js";

// -- Plugin contracts (mirror mobile/ios/*.swift exactly) ---------------

export interface GoogleSignInPlugin {
  signIn(options: {
    clientId: string;
    serverClientId: string;
    nonce: string;
  }): Promise<{ idToken: string }>;
}

export interface AppleFullName {
  givenName?: string;
  familyName?: string;
}

export interface AppleSignInPlugin {
  signIn(options: { nonce: string }): Promise<{
    idToken: string;
    fullName?: AppleFullName;
    email?: string;
  }>;
}

export interface SecureSessionPlugin {
  getToken(): Promise<{ token: string }>;
  setToken(options: { token: string }): Promise<void>;
  clearToken(): Promise<void>;
}

const GoogleSignIn = registerPlugin<GoogleSignInPlugin>("OpenMahjongGoogleSignIn");
const AppleSignIn = registerPlugin<AppleSignInPlugin>("OpenMahjongAppleSignIn");
const SecureSession = registerPlugin<SecureSessionPlugin>("OpenMahjongSecureSession");

// -- Shell detection -------------------------------------------------------

/** True only inside the packaged Capacitor shell. */
export function isNativeShell(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

// -- Stored session (keychain bundle) --------------------------------------

export function encodeStoredSession(session: NativeSession): string {
  return JSON.stringify({ token: session.token, csrfToken: session.csrfToken });
}

export function decodeStoredSession(raw: string): NativeSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { token?: unknown; csrfToken?: unknown };
    if (typeof parsed.token === "string" && parsed.token &&
        typeof parsed.csrfToken === "string" && parsed.csrfToken) {
      return { token: parsed.token, csrfToken: parsed.csrfToken };
    }
  } catch {
    // A damaged bundle is treated as no session; the plugin deletes
    // unreadable keychain values itself, and boot simply stays guest.
  }
  return null;
}

async function storeSession(session: NativeSession): Promise<void> {
  installNativeSession(session);
  await SecureSession.setToken({ token: encodeStoredSession(session) });
}

async function clearStoredSession(): Promise<void> {
  installNativeSession(null);
  try {
    await SecureSession.clearToken();
  } catch {
    // Already uninstalled above; a keychain clear failure must not
    // strand the UI in a signed-in state.
  }
}

/**
 * Boot restore: in the shell, read the stored session bundle from
 * the keychain and install it into the API layer so the app's normal
 * /api/me probe (bootAuth) resolves the signed-in user with the
 * bearer token. Returns the restored session, or null for guests /
 * web. Never throws — a failed restore is a guest boot.
 */
export async function restoreNativeSession(): Promise<NativeSession | null> {
  if (!isNativeShell()) return null;
  try {
    const { token } = await SecureSession.getToken();
    const session = decodeStoredSession(token ?? "");
    if (session) installNativeSession(session);
    return session;
  } catch {
    return null;
  }
}

// -- Google configuration ----------------------------------------------------

export interface GoogleConfig {
  readonly iosClientId: string | null;
  readonly serverClientId: string;
}

let googleConfigCache: GoogleConfig | null | undefined;

/** The cached config from the last loadGoogleConfig(), if any. */
export function getCachedGoogleConfig(): GoogleConfig | null {
  return googleConfigCache ?? null;
}

/**
 * GET /mobile/auth/google-config — the server's public client IDs.
 * iosClientId is null until the iOS OAuth client exists server-side;
 * in that state Google sign-in is unavailable in the shell (Apple and
 * guest play are unaffected). The result is cached for the UI; a
 * failed fetch caches nothing and resolves null.
 */
export async function loadGoogleConfig(
  fetchFn: typeof fetch = fetch,
): Promise<GoogleConfig | null> {
  if (!isNativeShell()) return null;
  if (googleConfigCache !== undefined) return googleConfigCache;
  try {
    const res = await fetchFn(`${API_BASE}/mobile/auth/google-config`, {
      method: "GET",
      credentials: "include",
      headers: { "content-type": "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      iosClientId?: string | null;
      serverClientId?: string;
    };
    googleConfigCache = {
      iosClientId: typeof body.iosClientId === "string" && body.iosClientId
        ? body.iosClientId
        : null,
      serverClientId: typeof body.serverClientId === "string" ? body.serverClientId : "",
    };
  } catch {
    return null;
  }
  return googleConfigCache;
}

/** True when the config positively reports no iOS client ID yet. */
export function isGoogleUnavailable(): boolean {
  return googleConfigCache !== undefined && googleConfigCache !== null &&
    googleConfigCache.iosClientId === null;
}

// -- Sign-in flows -----------------------------------------------------------

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type NativeSignInResult =
  | { readonly ok: true; readonly user: ApiUser }
  | { readonly ok: false; readonly reason: "unavailable" | "failed"; readonly message: string };

interface NativeSessionResponse {
  token?: unknown;
  csrfToken?: unknown;
  user?: ApiUser | null;
}

async function exchangeNativeToken(
  path: string,
  body: Record<string, unknown>,
  fetchFn: typeof fetch,
): Promise<NativeSignInResult> {
  let parsed: NativeSessionResponse | null = null;
  try {
    const res = await fetchFn(`${API_BASE}${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) parsed = (await res.json()) as NativeSessionResponse;
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed.token !== "string" || !parsed.token ||
      typeof parsed.csrfToken !== "string" || !parsed.csrfToken || !parsed.user) {
    return { ok: false, reason: "failed", message: "Sign-in could not be completed." };
  }
  const session: NativeSession = { token: parsed.token, csrfToken: parsed.csrfToken };
  try {
    await storeSession(session);
  } catch {
    return { ok: false, reason: "failed", message: "Sign-in could not be completed." };
  }
  return { ok: true, user: parsed.user };
}

function pluginFailure(err: unknown): NativeSignInResult {
  // The plugins reject with one shared failure message shape (the
  // Munch pattern); surface it verbatim when present.
  const message = err instanceof Error && err.message
    ? err.message
    : "Sign-in was cancelled or could not be completed";
  return { ok: false, reason: "failed", message };
}

/**
 * Google sign-in in the shell: config first (a null iosClientId is
 * "unavailable", never a fall back to the web redirect inside the
 * webview), then the native plugin, then the server exchange.
 */
export async function signInWithGoogleNative(
  fetchFn: typeof fetch = fetch,
): Promise<NativeSignInResult> {
  if (!isNativeShell()) {
    return { ok: false, reason: "unavailable", message: "Google sign-in is not available here." };
  }
  const config = await loadGoogleConfig(fetchFn);
  if (!config || !config.iosClientId) {
    return { ok: false, reason: "unavailable", message: "Google sign-in is not available in the app yet." };
  }
  const nonce = generateNonce();
  let idToken: string;
  try {
    const result = await GoogleSignIn.signIn({
      clientId: config.iosClientId,
      serverClientId: config.serverClientId,
      nonce,
    });
    idToken = result.idToken;
  } catch (err) {
    return pluginFailure(err);
  }
  if (!idToken) {
    return { ok: false, reason: "failed", message: "Google did not return an ID token" };
  }
  return exchangeNativeToken("/auth/google/native", { idToken }, fetchFn);
}

/**
 * Apple sign-in in the shell: the plugin runs ASAuthorization with
 * the SHA-256 hex of the raw nonce; the raw nonce and the plugin's
 * first-authorization fullName go to the server exchange, which
 * captures the display name from fullName on first sign-in.
 */
export async function signInWithAppleNative(
  fetchFn: typeof fetch = fetch,
): Promise<NativeSignInResult> {
  if (!isNativeShell()) {
    return { ok: false, reason: "unavailable", message: "Sign in with Apple is not available here." };
  }
  const nonce = generateNonce();
  let result: { idToken: string; fullName?: AppleFullName; email?: string };
  try {
    result = await AppleSignIn.signIn({ nonce });
  } catch (err) {
    return pluginFailure(err);
  }
  if (!result.idToken) {
    return { ok: false, reason: "failed", message: "Apple did not return an ID token" };
  }
  const body: Record<string, unknown> = { idToken: result.idToken, nonce };
  if (result.fullName) body["fullName"] = result.fullName;
  return exchangeNativeToken("/auth/apple/native", body, fetchFn);
}

/**
 * Sign-out in the shell: the server sign-out runs first (api.ts adds
 * the bearer + CSRF headers from the installed session; the server
 * accepts bearer sign-out), then the stored session is cleared
 * whatever the server said — a device must never stay signed in
 * locally because a request failed.
 */
export async function signOutNative(
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  if (!isNativeShell()) return false;
  let serverOk = false;
  try {
    serverOk = await apiSignOut(null, fetchFn);
  } catch {
    serverOk = false;
  }
  await clearStoredSession();
  return serverOk;
}

/** Test seam: reset the cached Google config between cases. */
export function resetNativeAuthStateForTest(): void {
  googleConfigCache = undefined;
  installNativeSession(null);
}
