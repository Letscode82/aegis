/**
 * Server-only Auth0 Management API client.
 *
 * Purpose: turn an OneLegal admin invite into a *real* login. Inviting a user in
 * the Admin UI only writes the OneLegal `User` authorization row — it does not
 * create the Auth0 identity the person signs in with. On a tenant whose
 * Universal Login has no self-service sign-up (the common enterprise posture),
 * an invited user therefore has no credential and cannot log in. This client
 * closes that gap: it ensures the Auth0 user exists in the database connection
 * and mints a one-time "set your password" ticket that the invite email links
 * to.
 *
 * Shape mirrors `@aegis/email`: zero-dependency (global `fetch`, proxy-friendly),
 * env-driven, in-process token cache, and **degrade-safe** — every public call
 * returns a typed result and never throws for a "not configured" state, so the
 * dev-mode / no-Auth0 demo keeps working (the invite just skips the link).
 *
 * Credentials: a dedicated Auth0 Machine-to-Machine application authorized for
 * the Management API with the scopes `read:users`, `create:users`,
 * `create:user_tickets`. Its client id/secret go in
 * `AUTH0_MGMT_CLIENT_ID` / `AUTH0_MGMT_CLIENT_SECRET`; the tenant is the
 * existing `AUTH0_ISSUER_BASE_URL`. These are distinct from the login
 * application's `AUTH0_CLIENT_ID` / `AUTH0_CLIENT_SECRET`.
 */

import { randomBytes } from "node:crypto";

/** Default Auth0 database connection name (Auth0's out-of-the-box one). */
const DEFAULT_DB_CONNECTION = "Username-Password-Authentication";

/** Password-change ticket lifetime: 7 days. Auth0 caps this at 30 days. */
const DEFAULT_TICKET_TTL_SEC = 7 * 24 * 60 * 60;

export interface MgmtConfig {
  /** Tenant base, no trailing slash — e.g. https://aegis-demo1.us.auth0.com */
  issuerBaseUrl: string;
  clientId: string;
  clientSecret: string;
  /** Database connection new users are created in. */
  connection: string;
  /** App base URL (AUTH0_BASE_URL) — where the set-password flow returns to. */
  appBaseUrl?: string;
}

export class Auth0ManagementError extends Error {
  code: string;
  detail?: string;
  constructor(code: string, detail?: string) {
    super(`[auth0-management] ${code}${detail ? `: ${detail}` : ""}`);
    this.name = "Auth0ManagementError";
    this.code = code;
    this.detail = detail;
  }
}

/**
 * Resolve the Management API config from the environment. Returns null when the
 * three required vars are not all present — the caller then degrades instead of
 * failing. `AUTH0_DB_CONNECTION` and `AUTH0_BASE_URL` are optional.
 */
export function resolveMgmtConfig(
  env: Record<string, string | undefined> = process.env,
): MgmtConfig | null {
  const issuerBaseUrl = (env.AUTH0_ISSUER_BASE_URL || "").trim().replace(/\/+$/, "");
  const clientId = (env.AUTH0_MGMT_CLIENT_ID || "").trim();
  const clientSecret = (env.AUTH0_MGMT_CLIENT_SECRET || "").trim();
  if (!issuerBaseUrl || !clientId || !clientSecret) return null;
  const connection = (env.AUTH0_DB_CONNECTION || "").trim() || DEFAULT_DB_CONNECTION;
  const appBaseUrl = (env.AUTH0_BASE_URL || "").trim() || undefined;
  return { issuerBaseUrl, clientId, clientSecret, connection, appBaseUrl };
}

export function isAuth0ManagementConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return resolveMgmtConfig(env) !== null;
}

/**
 * Generate a throwaway password that satisfies Auth0's default policy (upper,
 * lower, digit, symbol, length ≥ 16). The invitee never sees or uses it — they
 * set their own through the password-change ticket — but the Create User call
 * requires one for a database-connection user.
 */
export function generateInitialPassword(): string {
  // 24 url-safe-ish bytes of entropy, then guarantee one of each class.
  const base = randomBytes(24).toString("base64").replace(/[+/=]/g, "");
  return `Aa1!${base}`;
}

// ── token cache ──────────────────────────────────────────────────────
// Keyed by (issuer|clientId) so rotating creds or pointing at another tenant
// invalidates cleanly. Refreshed a minute before expiry.
interface CachedToken {
  token: string;
  expiresAt: number;
}
const _tokenCache = new Map<string, CachedToken>();

/** Exposed for tests to reset the in-process cache. */
export function _clearMgmtTokenCache(): void {
  _tokenCache.clear();
}

export interface MgmtClientOptions {
  /** Inject config (tests / future per-tenant creds). */
  config?: MgmtConfig;
  /** Inject fetch (tests). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

async function getMgmtToken(cfg: MgmtConfig, doFetch: typeof fetch): Promise<string> {
  const key = `${cfg.issuerBaseUrl}|${cfg.clientId}`;
  const now = Date.now();
  const cached = _tokenCache.get(key);
  if (cached && cached.expiresAt > now + 60_000) return cached.token;

  const res = await doFetch(`${cfg.issuerBaseUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      audience: `${cfg.issuerBaseUrl}/api/v2/`,
    }),
  });
  if (!res.ok) {
    throw new Auth0ManagementError("token-http-" + res.status, await safeText(res));
  }
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!body.access_token) throw new Auth0ManagementError("token-missing");
  const ttl = typeof body.expires_in === "number" && body.expires_in > 0 ? body.expires_in : 3600;
  _tokenCache.set(key, { token: body.access_token, expiresAt: now + ttl * 1000 });
  return body.access_token;
}

async function safeText(res: Response): Promise<string> {
  try {
    const t = await res.text();
    return t.slice(0, 300);
  } catch {
    return "";
  }
}

interface Auth0User {
  user_id: string;
  email?: string;
}

/** Find a database-connection user by email. Returns null when none exists. */
async function findUserByEmail(
  cfg: MgmtConfig,
  token: string,
  doFetch: typeof fetch,
  email: string,
): Promise<Auth0User | null> {
  const url =
    `${cfg.issuerBaseUrl}/api/v2/users-by-email?email=` + encodeURIComponent(email.toLowerCase());
  const res = await doFetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Auth0ManagementError("users-by-email-http-" + res.status, await safeText(res));
  const list = (await res.json().catch(() => [])) as Auth0User[];
  if (!Array.isArray(list) || list.length === 0) return null;
  // Prefer a user in our target DB connection (user_id starts with "auth0|").
  return list.find((u) => u.user_id?.startsWith("auth0|")) ?? list[0] ?? null;
}

/** Ensure an Auth0 database user exists for this email; create if missing. */
async function ensureUser(
  cfg: MgmtConfig,
  token: string,
  doFetch: typeof fetch,
  email: string,
  name: string | undefined,
): Promise<{ userId: string; created: boolean }> {
  const existing = await findUserByEmail(cfg, token, doFetch, email);
  if (existing) return { userId: existing.user_id, created: false };

  const res = await doFetch(`${cfg.issuerBaseUrl}/api/v2/users`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: email.toLowerCase(),
      name: (name || "").trim() || email,
      connection: cfg.connection,
      password: generateInitialPassword(),
      email_verified: false,
      verify_email: false,
    }),
  });
  if (res.ok) {
    const body = (await res.json().catch(() => ({}))) as Auth0User;
    if (!body.user_id) throw new Auth0ManagementError("create-user-missing-id");
    return { userId: body.user_id, created: true };
  }
  // 409 = raced with another create (or already exists in another connection).
  // Re-resolve by email so the caller still gets a ticket.
  if (res.status === 409) {
    const now = await findUserByEmail(cfg, token, doFetch, email);
    if (now) return { userId: now.user_id, created: false };
  }
  throw new Auth0ManagementError("create-user-http-" + res.status, await safeText(res));
}

/** Mint a one-time password-change ticket for an existing Auth0 user. */
async function createPasswordChangeTicket(
  cfg: MgmtConfig,
  token: string,
  doFetch: typeof fetch,
  userId: string,
  ttlSec: number,
): Promise<string> {
  const payload: Record<string, unknown> = {
    user_id: userId,
    ttl_sec: ttlSec,
    mark_email_as_verified: true,
  };
  if (cfg.appBaseUrl) payload.result_url = cfg.appBaseUrl;
  const res = await doFetch(`${cfg.issuerBaseUrl}/api/v2/tickets/password-change`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Auth0ManagementError("ticket-http-" + res.status, await safeText(res));
  }
  const body = (await res.json().catch(() => ({}))) as { ticket?: string };
  if (!body.ticket) throw new Auth0ManagementError("ticket-missing");
  return body.ticket;
}

export type InviteLinkResult =
  | { ok: true; url: string; userId: string; userCreated: boolean }
  | { ok: false; reason: string };

/**
 * The one public entry point the invite flow calls: ensure the Auth0 user and
 * return a set-password URL to email them. Never throws — a configuration gap
 * or an Auth0 error comes back as `{ ok: false, reason }` so the invite (and
 * its OneLegal User row) is never rolled back by a provisioning hiccup.
 */
export async function createInviteSetPasswordLink(
  input: { email: string; name?: string; ttlSec?: number },
  opts: MgmtClientOptions = {},
): Promise<InviteLinkResult> {
  const cfg = opts.config ?? resolveMgmtConfig();
  if (!cfg) return { ok: false, reason: "not-configured" };
  const email = (input.email || "").trim();
  if (!email) return { ok: false, reason: "no-email" };
  const doFetch = opts.fetchImpl ?? fetch;
  const ttlSec = input.ttlSec && input.ttlSec > 0 ? input.ttlSec : DEFAULT_TICKET_TTL_SEC;
  try {
    const token = await getMgmtToken(cfg, doFetch);
    const { userId, created } = await ensureUser(cfg, token, doFetch, email, input.name);
    const url = await createPasswordChangeTicket(cfg, token, doFetch, userId, ttlSec);
    return { ok: true, url, userId, userCreated: created };
  } catch (err) {
    const reason = err instanceof Auth0ManagementError ? err.code : String((err as Error)?.message || err);
    return { ok: false, reason };
  }
}
