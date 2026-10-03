import { describe, it, expect } from "vitest";
import {
  buildAuthorizeUrl,
  parseTokenResponse,
  exchangeCodeForToken,
  refreshAccessToken,
  isTokenExpired,
  needsRefresh,
  tokenExpiresInMs,
} from "../src/oauth.js";
import type { OAuthConfig, OAuthHttp } from "../src/types.js";

const CONF: OAuthConfig = {
  authorizeUrl: "https://provider.example/oauth/authorize",
  tokenUrl: "https://provider.example/oauth/token",
  clientId: "aegis-client",
  clientSecret: "shh",
  redirectUri: "https://aegis.example/api/connectors/callback",
  scopes: ["read", "write"],
};

/** A one-shot http stub that returns a fixed JSON body + status. */
function stubHttp(status: number, body: unknown, capture?: (url: string, init: { body: string }) => void): OAuthHttp {
  return async (url, init) => {
    capture?.(url, init);
    return {
      status,
      json: async () => body,
      text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    };
  };
}

describe("buildAuthorizeUrl", () => {
  it("composes response_type, scope, and state", () => {
    const url = new URL(buildAuthorizeUrl(CONF, { state: "xyz" }));
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("aegis-client");
    expect(url.searchParams.get("scope")).toBe("read write");
    expect(url.searchParams.get("state")).toBe("xyz");
    expect(url.searchParams.has("code_challenge")).toBe(false);
  });

  it("adds PKCE params when the connector requires them", () => {
    const url = new URL(buildAuthorizeUrl({ ...CONF, usePkce: true }, { state: "s", codeChallenge: "chal" }));
    expect(url.searchParams.get("code_challenge")).toBe("chal");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("throws if PKCE is required but no challenge is given", () => {
    expect(() => buildAuthorizeUrl({ ...CONF, usePkce: true }, { state: "s" })).toThrow(/codeChallenge/);
  });
});

describe("parseTokenResponse", () => {
  it("derives an absolute expiry from expires_in", () => {
    const t = parseTokenResponse({ access_token: "a", refresh_token: "r", expires_in: 3600, token_type: "Bearer" }, 1_000_000);
    expect(t.accessToken).toBe("a");
    expect(t.refreshToken).toBe("r");
    expect(t.expiresAt).toBe(1_000_000 + 3600 * 1000);
  });

  it("defaults to one hour when expires_in is absent", () => {
    const t = parseTokenResponse({ access_token: "a" }, 0);
    expect(t.expiresAt).toBe(3600 * 1000);
  });

  it("throws when access_token is missing", () => {
    expect(() => parseTokenResponse({ refresh_token: "r" })).toThrow(/access_token/);
  });
});

describe("exchangeCodeForToken / refreshAccessToken", () => {
  it("posts the authorization_code grant and parses the result", async () => {
    let sentBody = "";
    const http = stubHttp(200, { access_token: "at", refresh_token: "rt", expires_in: 7200 }, (_u, init) => {
      sentBody = init.body;
    });
    const t = await exchangeCodeForToken(CONF, "the-code", http, {}, 0);
    expect(sentBody).toContain("grant_type=authorization_code");
    expect(sentBody).toContain("code=the-code");
    expect(t.accessToken).toBe("at");
    expect(t.expiresAt).toBe(7200 * 1000);
  });

  it("requires a PKCE verifier for a public client", async () => {
    const pub = { ...CONF, clientSecret: undefined };
    await expect(exchangeCodeForToken(pub, "c", stubHttp(200, {}), {})).rejects.toThrow(/code_verifier/);
  });

  it("surfaces a non-2xx token response as an error", async () => {
    const http = stubHttp(400, "invalid_grant");
    await expect(refreshAccessToken(CONF, "rt", http)).rejects.toThrow(/400/);
  });

  it("refuses to refresh without a token", async () => {
    await expect(refreshAccessToken(CONF, "", stubHttp(200, {}))).rejects.toThrow(/No refresh token/);
  });
});

describe("expiry helpers", () => {
  it("reports time remaining and expiry within skew", () => {
    const token = { expiresAt: 100_000 };
    expect(tokenExpiresInMs(token, 40_000)).toBe(60_000);
    // 60s remaining, default skew 60s → treated as expired.
    expect(isTokenExpired(token, 40_000)).toBe(true);
    expect(isTokenExpired(token, 30_000)).toBe(false);
    expect(needsRefresh(token, 40_000)).toBe(true);
  });
});
