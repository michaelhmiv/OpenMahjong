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
  /**
   * Optional Google OAuth client ID for the native iOS app. Native
   * Google ID tokens may carry this audience (or the web client ID).
   * Optional on the interface so existing literal configs keep
   * compiling; `loadConfig` always populates it.
   */
  googleIosClientId?: string | null;
  /**
   * Audience expected in Apple identity tokens: the app bundle ID.
   * Optional for the same reason as above; defaults to
   * `app.openmahjong` via `appleAudience()`.
   */
  appleAudience?: string;
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
    googleIosClientId: env["GOOGLE_IOS_CLIENT_ID"] ?? null,
    appleAudience: env["APPLE_AUDIENCE"] ?? "app.openmahjong",
    apiOrigin: env["API_ORIGIN"] ?? "https://api.openmahjong.app",
    cookieDomain: env["COOKIE_DOMAIN"] ?? ".openmahjong.app",
  };
}

export function googleRedirectUri(config: Config): string {
  return `${config.apiOrigin}/auth/google/callback`;
}

/** Every Google client ID a native ID token may be addressed to. */
export function googleAudienceClientIds(config: Config): string[] {
  return [config.googleClientId, config.googleIosClientId ?? null].filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
}

/** The audience Apple identity tokens must carry (the bundle ID). */
export function appleAudience(config: Config): string {
  return config.appleAudience ?? "app.openmahjong";
}
