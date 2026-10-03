/**
 * Provider-agnostic OAuth2 authorization-code flow (F-8).
 *
 * Pure except for the injected `OAuthHttp` transport — no global `fetch`, no
 * provider SDK. `buildAuthorizeUrl` composes the consent redirect;
 * `exchangeCodeForToken` / `refreshAccessToken` drive the token endpoint; the
 * expiry helpers decide when a stored token must be refreshed. Every provider
 * (DMS, e-sign, research) rides this one implementation.
 */
import type { OAuthConfig, OAuthHttp, TokenSet } from "./types.js";

/** Default clock skew (ms) treated as "already expired" so refresh happens early. */
export const DEFAULT_SKEW_MS = 60_000;

/** Build the authorize-endpoint URL the user is redirected to for consent. */
export function buildAuthorizeUrl(
  config: OAuthConfig,
  opts: { state: string; codeChallenge?: string },
): string {
  const url = new URL(config.authorizeUrl);
  const p = url.searchParams;
  p.set("response_type", "code");
  p.set("client_id", config.clientId);
  p.set("redirect_uri", config.redirectUri);
  p.set("scope", config.scopes.join(" "));
  p.set("state", opts.state);
  if (config.usePkce) {
    if (!opts.codeChallenge) throw new Error("PKCE connector requires a codeChallenge");
    p.set("code_challenge", opts.codeChallenge);
    p.set("code_challenge_method", "S256");
  }
  return url.toString();
}

/** Normalize a provider token response (`expires_in` seconds → absolute `expiresAt`). */
export function parseTokenResponse(raw: unknown, now = Date.now()): TokenSet {
  const r = (raw ?? {}) as Record<string, unknown>;
  const accessToken = typeof r.access_token === "string" ? r.access_token : "";
  if (!accessToken) throw new Error("Token response missing access_token");
  const expiresInSec = typeof r.expires_in === "number" ? r.expires_in : Number(r.expires_in);
  const expiresAt = Number.isFinite(expiresInSec) ? now + expiresInSec * 1000 : now + 3600 * 1000;
  return {
    accessToken,
    refreshToken: typeof r.refresh_token === "string" ? r.refresh_token : undefined,
    expiresAt,
    scope: typeof r.scope === "string" ? r.scope : undefined,
    tokenType: typeof r.token_type === "string" ? r.token_type : undefined,
  };
}

function basicAuthHeader(config: OAuthConfig): Record<string, string> {
  if (!config.clientSecret) return {};
  const cred = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  return { Authorization: `Basic ${cred}` };
}

async function postForm(config: OAuthConfig, http: OAuthHttp, form: Record<string, string>, now: number): Promise<TokenSet> {
  const res = await http(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", ...basicAuthHeader(config) },
    body: new URLSearchParams(form).toString(),
  });
  if (res.status < 200 || res.status >= 300) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OAuth token endpoint returned ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  return parseTokenResponse(await res.json(), now);
}

/** Exchange an authorization code for a token set. */
export async function exchangeCodeForToken(
  config: OAuthConfig,
  code: string,
  http: OAuthHttp,
  opts: { codeVerifier?: string } = {},
  now = Date.now(),
): Promise<TokenSet> {
  const form: Record<string, string> = {
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
  };
  if (!config.clientSecret) {
    if (!opts.codeVerifier) throw new Error("Public client requires a PKCE code_verifier");
    form.code_verifier = opts.codeVerifier;
  }
  return postForm(config, http, form, now);
}

/** Exchange a refresh token for a fresh access token. */
export async function refreshAccessToken(
  config: OAuthConfig,
  refreshToken: string,
  http: OAuthHttp,
  now = Date.now(),
): Promise<TokenSet> {
  if (!refreshToken) throw new Error("No refresh token available");
  return postForm(config, http, { grant_type: "refresh_token", refresh_token: refreshToken, client_id: config.clientId }, now);
}

/** Milliseconds until the token expires (negative once past expiry). */
export function tokenExpiresInMs(token: Pick<TokenSet, "expiresAt">, now = Date.now()): number {
  return token.expiresAt - now;
}

/** True once the token is within `skewMs` of expiry (or past it). */
export function isTokenExpired(token: Pick<TokenSet, "expiresAt">, now = Date.now(), skewMs = DEFAULT_SKEW_MS): boolean {
  return tokenExpiresInMs(token, now) <= skewMs;
}

/** Alias that reads intentionally at call sites deciding whether to refresh. */
export function needsRefresh(token: Pick<TokenSet, "expiresAt">, now = Date.now(), skewMs = DEFAULT_SKEW_MS): boolean {
  return isTokenExpired(token, now, skewMs);
}
