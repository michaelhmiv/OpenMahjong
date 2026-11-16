/**
 * Environment configuration. Every value has a production-shaped
 * default except secrets; missing Google credentials are NOT fatal —
 * the server boots and /auth/google/start answers 503, so deployment
 * can precede the Google Cloud setup (brief §5).
 */

export interface Config {
  port: number;
  /** Web app origin: the only CORS origin, and the post-sign-in redirect. */
  appOrigin: string;
  databaseUrl: string | null;
  googleClientId: string | null;
  googleClientSecret: string | null;
  /** This server's public origin; the OAuth redirect URI hangs off it. */
  apiOrigin: string;
  cookieDomain: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env["PORT"] ?? 8080),
    appOrigin: env["APP_ORIGIN"] ?? "https://openmahjong.app",
    databaseUrl: env["DATABASE_URL"] ?? null,
    googleClientId: env["GOOGLE_CLIENT_ID"] ?? null,
    googleClientSecret: env["GOOGLE_CLIENT_SECRET"] ?? null,
    apiOrigin: env["API_ORIGIN"] ?? "https://api.openmahjong.app",
    cookieDomain: env["COOKIE_DOMAIN"] ?? ".openmahjong.app",
  };
}

export function googleRedirectUri(config: Config): string {
  return `${config.apiOrigin}/auth/google/callback`;
}
