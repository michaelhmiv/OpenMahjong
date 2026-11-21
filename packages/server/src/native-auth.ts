/**
 * Native (in-app) identity-token verification for the iOS shell
 * (iOS brief, Open decision 3). The web flow exchanges an OAuth code
 * server-side (`google.ts`); the native plugins instead hand the
 * server a provider ID token, and the server verifies it here.
 *
 * Both verifiers sit behind injectable interfaces in the `google.ts`
 * style — every network call goes through an injectable `fetch` — so
 * tests inject fakes and never touch the network. The Apple verifier
 * is the exception that proves the crypto: it verifies RS256 locally
 * against Apple's JWKS, and its tests exercise that path with a real
 * generated keypair.
 */

import {
  createHash,
  createPublicKey,
  verify as cryptoVerify,
  type KeyObject,
} from "node:crypto";
import type { GoogleProfile } from "./google.js";

// -- Google ---------------------------------------------------------------

export interface GoogleIdTokenVerifier {
  /** Verify a Google ID token; resolves to the caller's profile. */
  verifyIdToken(idToken: string): Promise<GoogleProfile>;
}

const GOOGLE_TOKENINFO_ENDPOINT = "https://oauth2.googleapis.com/tokeninfo";
const GOOGLE_ISSUERS = new Set([
  "accounts.google.com",
  "https://accounts.google.com",
]);

export function createGoogleIdTokenVerifier(input: {
  /** Client IDs accepted as the token audience (web + iOS). */
  audienceClientIds: string[];
  fetchImpl?: typeof fetch;
  now?: () => number;
}): GoogleIdTokenVerifier {
  const fetchImpl = input.fetchImpl ?? fetch;
  const now = input.now ?? Date.now;
  return {
    async verifyIdToken(idToken: string): Promise<GoogleProfile> {
      const url = `${GOOGLE_TOKENINFO_ENDPOINT}?id_token=${encodeURIComponent(idToken)}`;
      const res = await fetchImpl(url, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        throw new Error(`google tokeninfo failed: ${res.status}`);
      }
      const info = (await res.json()) as {
        aud?: unknown;
        iss?: unknown;
        exp?: unknown;
        sub?: unknown;
        name?: unknown;
        picture?: unknown;
      };
      if (
        typeof info.aud !== "string" ||
        !input.audienceClientIds.includes(info.aud)
      ) {
        throw new Error("google id token audience mismatch");
      }
      if (typeof info.iss !== "string" || !GOOGLE_ISSUERS.has(info.iss)) {
        throw new Error("google id token issuer mismatch");
      }
      const expSeconds = Number(info.exp);
      if (!Number.isFinite(expSeconds) || expSeconds * 1000 <= now()) {
        throw new Error("google id token expired");
      }
      if (typeof info.sub !== "string" || typeof info.name !== "string") {
        throw new Error("google id token missing sub/name");
      }
      return {
        sub: info.sub,
        name: info.name,
        avatarUrl: typeof info.picture === "string" ? info.picture : null,
      };
    },
  };
}

// -- Apple ----------------------------------------------------------------

export interface AppleProfile {
  /** The token's `sub`: the stable per-app Apple user identifier. */
  sub: string;
  /** Email claim when present (may be an Apple private relay). */
  email: string | null;
}

export interface AppleIdTokenVerifier {
  /**
   * Verify an Apple identity token against the raw nonce the client
   * generated. The token's `nonce` claim must equal the SHA-256 hex
   * of the raw nonce (what the native plugin puts on the
   * authorization request) or the raw nonce itself.
   */
  verifyIdToken(idToken: string, rawNonce: string): Promise<AppleProfile>;
}

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;

interface Jwk {
  kty: string;
  kid: string;
  use?: string;
  alg?: string;
  n: string;
  e: string;
}

function decodeSegment(segment: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(
    Buffer.from(segment, "base64url").toString("utf8"),
  );
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("apple id token segment is not an object");
  }
  return parsed as Record<string, unknown>;
}

export function createAppleIdTokenVerifier(input: {
  /** Expected audience: the app bundle ID. */
  audience: string;
  fetchImpl?: typeof fetch;
  jwksUrl?: string;
  now?: () => number;
  cacheTtlMs?: number;
}): AppleIdTokenVerifier {
  const fetchImpl = input.fetchImpl ?? fetch;
  const jwksUrl = input.jwksUrl ?? APPLE_JWKS_URL;
  const now = input.now ?? Date.now;
  const cacheTtlMs = input.cacheTtlMs ?? JWKS_CACHE_TTL_MS;
  let cachedKeys: Map<string, KeyObject> | null = null;
  let cachedAt = 0;

  async function fetchKeys(): Promise<Map<string, KeyObject>> {
    const res = await fetchImpl(jwksUrl, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`apple jwks fetch failed: ${res.status}`);
    const body = (await res.json()) as { keys?: unknown };
    if (!Array.isArray(body.keys)) throw new Error("apple jwks malformed");
    const keys = new Map<string, KeyObject>();
    for (const raw of body.keys as Jwk[]) {
      if (raw.kty !== "RSA" || typeof raw.kid !== "string") continue;
      keys.set(
        raw.kid,
        createPublicKey({
          key: { kty: raw.kty, n: raw.n, e: raw.e },
          format: "jwk",
        }) as KeyObject,
      );
    }
    cachedKeys = keys;
    cachedAt = now();
    return keys;
  }

  async function keyFor(kid: string): Promise<KeyObject> {
    if (cachedKeys && now() - cachedAt < cacheTtlMs) {
      const hit = cachedKeys.get(kid);
      if (hit) return hit;
      // Unknown kid on a fresh cache: Apple may have rotated — refetch once.
    }
    const keys = await fetchKeys();
    const key = keys.get(kid);
    if (!key) throw new Error("apple id token signing key not found");
    return key;
  }

  return {
    async verifyIdToken(
      idToken: string,
      rawNonce: string,
    ): Promise<AppleProfile> {
      const parts = idToken.split(".");
      if (parts.length !== 3) throw new Error("apple id token malformed");
      const [headerSeg, payloadSeg, signatureSeg] = parts as [
        string,
        string,
        string,
      ];
      const header = decodeSegment(headerSeg);
      if (header["alg"] !== "RS256" || typeof header["kid"] !== "string") {
        throw new Error("apple id token header mismatch");
      }
      const key = await keyFor(header["kid"]);
      const signingInput = Buffer.from(`${headerSeg}.${payloadSeg}`, "utf8");
      const signature = Buffer.from(signatureSeg, "base64url");
      const valid = cryptoVerify("RSA-SHA256", signingInput, key, signature);
      if (!valid) throw new Error("apple id token signature invalid");

      const claims = decodeSegment(payloadSeg);
      if (claims["iss"] !== APPLE_ISSUER) {
        throw new Error("apple id token issuer mismatch");
      }
      if (claims["aud"] !== input.audience) {
        throw new Error("apple id token audience mismatch");
      }
      const expSeconds = Number(claims["exp"]);
      if (!Number.isFinite(expSeconds) || expSeconds * 1000 <= now()) {
        throw new Error("apple id token expired");
      }
      const expectedHash = createHash("sha256").update(rawNonce).digest("hex");
      if (claims["nonce"] !== expectedHash && claims["nonce"] !== rawNonce) {
        throw new Error("apple id token nonce mismatch");
      }
      if (typeof claims["sub"] !== "string" || !claims["sub"]) {
        throw new Error("apple id token missing sub");
      }
      return {
        sub: claims["sub"],
        email: typeof claims["email"] === "string" ? claims["email"] : null,
      };
    },
  };
}
