import { describe, expect, it, vi } from "vitest";
import { createGoogleClient } from "../src/google.js";

describe("Google OAuth client", () => {
  const config = {
    clientId: "client", clientSecret: "secret",
    redirectUri: "https://api.openmahjong.app/auth/google/callback",
  };

  it("uses minimal scopes and deadlines on both network calls, without retaining access tokens", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "provider-token" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sub: "subject", name: "Player", picture: "https://example.com/avatar.png" })));
    const client = createGoogleClient({ ...config, fetchImpl });
    const consent = new URL(client.consentUrl("browser-state"));
    expect(consent.searchParams.get("scope")).toBe("openid profile");
    expect(consent.searchParams.get("state")).toBe("browser-state");
    const profile = await client.exchangeCode("code");
    expect(profile).toEqual({ sub: "subject", name: "Player", avatarUrl: "https://example.com/avatar.png" });
    const [tokenCall, profileCall] = fetchImpl.mock.calls;
    expect(tokenCall?.[0]).toBe("https://oauth2.googleapis.com/token");
    expect(new URLSearchParams(tokenCall?.[1]?.body as string).get("redirect_uri")).toBe(config.redirectUri);
    expect(profileCall?.[0]).toBe("https://openidconnect.googleapis.com/v1/userinfo");
    for (const call of fetchImpl.mock.calls) expect(call[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(profile).not.toHaveProperty("access_token");
  });

  it("fails closed if token exchange or provider identity is invalid", async () => {
    const cases = [
      [new Response("unavailable", { status: 503 })],
      [new Response(JSON.stringify({}))],
      [new Response(JSON.stringify({ access_token: "token" })), new Response(JSON.stringify({ name: "Player" }))],
    ];
    for (const responses of cases) {
      const fetchImpl = vi.fn<typeof fetch>();
      for (const response of responses) fetchImpl.mockResolvedValueOnce(response);
      await expect(createGoogleClient({ ...config, fetchImpl }).exchangeCode("code")).rejects.toThrow();
    }
  });
});
