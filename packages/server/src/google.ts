/**
 * Google OAuth 2.0 client (brief §4 A1: Google only). The two network
 * calls sit behind the `GoogleClient` interface so tests inject a
 * fake and never touch the network.
 */

export interface GoogleProfile {
  sub: string;
  name: string;
  avatarUrl: string | null;
}

export interface GoogleClient {
  /** Consent-screen URL the browser is redirected to. */
  consentUrl(state: string): string;
  /** Code exchange + userinfo lookup, resolved to a minimal profile. */
  exchangeCode(code: string): Promise<GoogleProfile>;
}

const CONSENT_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

export function createGoogleClient(input: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}): GoogleClient {
  const fetchImpl = input.fetchImpl ?? fetch;
  return {
    consentUrl(state: string): string {
      const params = new URLSearchParams({
        client_id: input.clientId,
        redirect_uri: input.redirectUri,
        response_type: "code",
        scope: "openid profile",
        state,
        access_type: "online",
      });
      return `${CONSENT_ENDPOINT}?${params.toString()}`;
    },

    async exchangeCode(code: string): Promise<GoogleProfile> {
      const tokenRes = await fetchImpl(TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: input.clientId,
          client_secret: input.clientSecret,
          redirect_uri: input.redirectUri,
          grant_type: "authorization_code",
        }).toString(),
      });
      if (!tokenRes.ok) {
        throw new Error(`google token exchange failed: ${tokenRes.status}`);
      }
      const token = (await tokenRes.json()) as { access_token?: unknown };
      if (typeof token.access_token !== "string") {
        throw new Error("google token exchange returned no access_token");
      }

      const infoRes = await fetchImpl(USERINFO_ENDPOINT, {
        headers: { authorization: `Bearer ${token.access_token}` },
      });
      if (!infoRes.ok) {
        throw new Error(`google userinfo failed: ${infoRes.status}`);
      }
      const info = (await infoRes.json()) as {
        sub?: unknown;
        name?: unknown;
        picture?: unknown;
      };
      if (typeof info.sub !== "string" || typeof info.name !== "string") {
        throw new Error("google userinfo missing sub/name");
      }
      return {
        sub: info.sub,
        name: info.name,
        avatarUrl: typeof info.picture === "string" ? info.picture : null,
      };
    },
  };
}
