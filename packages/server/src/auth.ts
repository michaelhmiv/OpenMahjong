/**
 * Session tokens and cookies (brief §8): the cookie carries an opaque
 * 32-byte token; only its SHA-256 hash is stored server-side. Sessions
 * live 30 days. The per-session CSRF token is stored with the session
 * and compared against the `x-csrf-token` header on mutations.
 */

import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE = "om_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionCookie(
  token: string,
  cookieDomain: string,
): string {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return [
    `${SESSION_COOKIE}=${token}`,
    `Domain=${cookieDomain}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

export function clearedSessionCookie(cookieDomain: string): string {
  return [
    `${SESSION_COOKIE}=`,
    `Domain=${cookieDomain}`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

/** Parse a Cookie header into a name→value map. */
export function parseCookies(header: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name) out.set(name, value);
  }
  return out;
}
