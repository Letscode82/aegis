/**
 * Device Code OAuth orchestration — DB-backed sessions (sub-PR 4c.1
 * follow-up).
 *
 * Microsoft's eDiscovery endpoints require a delegated user token.
 * The standard non-interactive UX for service accounts is the OAuth
 * 2.0 Device Authorization grant ("Device Code"):
 *
 *   1. AEGIS asks Microsoft for a device-code session via
 *      /oauth2/v2.0/devicecode.
 *   2. UI displays the user_code + verification_uri.
 *   3. The operator opens https://microsoft.com/devicelogin in a
 *      separate tab and signs in as the dedicated service account.
 *   4. AEGIS polls Microsoft's /oauth2/v2.0/token endpoint with
 *      `grant_type=urn:ietf:params:oauth:grant-type:device_code` and
 *      the long opaque `device_code`. Microsoft returns
 *      `authorization_pending` until the user completes sign-in,
 *      then issues access + refresh tokens.
 *   5. We persist the encrypted refresh token via
 *      `persistDelegatedTokens()` and mark the session row complete.
 *
 * Why DB-backed. The 4c.1 implementation kept session state in a
 * `Map<sessionId, …>` in module scope. On Vercel that breaks: every
 * `/poll` request is dispatched to a different Lambda instance, none
 * of which has the session in memory. Tokens were lost. Storing the
 * `device_code` in `M365DeviceCodeSession` makes every poll
 * stateless — any instance can read the row and ask Microsoft for
 * tokens. The first poll to receive an authorized response writes
 * tokens in a transaction; concurrent polls see the row already in
 * `completed` state and short-circuit.
 *
 * The flow uses Microsoft's OAuth endpoints directly rather than
 * MSAL's `acquireTokenByDeviceCode` because that helper is a single
 * blocking call — incompatible with stateless polling. The two
 * Microsoft endpoints (`/devicecode`, `/token`) are well documented
 * and stable.
 */
import { randomUUID } from "node:crypto";
import { decryptSecret, prisma } from "@aegis/db";
import {
  DELEGATED_SCOPES,
  persistDelegatedTokens,
} from "./m365-graph-delegated-auth";

/** Default poll interval if Microsoft doesn't specify one. */
const DEFAULT_POLL_INTERVAL_SEC = 5;

/** Microsoft Device Code endpoints — tenant id is interpolated. */
function deviceCodeEndpoint(tenantId: string): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/devicecode`;
}

function tokenEndpoint(tenantId: string): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
}

// ────────────────────────────────────────────────────────────────────
// Pluggable HTTP layer (for tests)
// ────────────────────────────────────────────────────────────────────

/**
 * Tests inject a deterministic HTTP responder via `setOAuthHttpClient`
 * so we don't burn Microsoft round-trips and tests stay in the
 * default `pnpm test` lane.
 */
export interface OAuthHttpClient {
  post(
    url: string,
    body: URLSearchParams,
  ): Promise<{ status: number; json: unknown }>;
}

let httpClient: OAuthHttpClient | null = null;

export function setOAuthHttpClient(client: OAuthHttpClient | null): void {
  httpClient = client;
}

async function defaultHttp(): Promise<OAuthHttpClient> {
  return {
    async post(url, body) {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      const json = (await resp.json().catch(() => null)) as unknown;
      return { status: resp.status, json };
    },
  };
}

async function postOAuth(
  url: string,
  body: URLSearchParams,
): Promise<{ status: number; json: unknown }> {
  const client = httpClient ?? (await defaultHttp());
  return client.post(url, body);
}

// ────────────────────────────────────────────────────────────────────
// Status surface
// ────────────────────────────────────────────────────────────────────

export type DeviceCodeStatus =
  | "pending"
  | "connected"
  | "error"
  | "expired";

// ────────────────────────────────────────────────────────────────────
// OAuth credential resolution
// ────────────────────────────────────────────────────────────────────

/**
 * Resolve the OAuth `client_secret` for an org so it can be included
 * in Device Code POST bodies. AEGIS's Entra app registration is a
 * **confidential client** (it has a configured client secret), and
 * Microsoft's `/devicecode` and `/token` endpoints reject confidential-
 * client requests that omit `client_secret`:
 *
 *   AADSTS7000218: The request body must contain the following
 *   parameter: 'client_assertion' or 'client_secret'.
 *
 * The 4c.1 Device Code rewrite (PR #30) replaced MSAL with direct HTTP
 * calls; MSAL's `ConfidentialClientApplication` had been silently
 * adding the secret. The direct path has to add it explicitly.
 *
 * Resolution order matches the existing m365-graph-auth.ts factory:
 *   1. per-org `OrganizationM365Credential` row (decrypt the stored
 *      secret),
 *   2. M365_CLIENT_SECRET env var,
 *   3. null — caller fails out.
 */
async function resolveClientSecret(
  organizationId: string,
): Promise<{ secret: string | null; source: "per-org" | "env" | "none" }> {
  const cred = await prisma.organizationM365Credential
    .findUnique({ where: { organizationId } })
    .catch(() => null);
  if (cred?.encryptedClientSecret) {
    try {
      const plaintext = decryptSecret(cred.encryptedClientSecret as Buffer);
      if (plaintext.length > 0) {
        return { secret: plaintext, source: "per-org" };
      }
      // Decrypted to empty — fall through to env-var fallback.
    } catch {
      // Bad cipher / wrong version — treat as not configured. The
      // env-var fallback below still has a chance.
    }
  }
  const envSecret = process.env.M365_CLIENT_SECRET;
  if (envSecret && envSecret.length > 0) {
    return { secret: envSecret, source: "env" };
  }
  return { secret: null, source: "none" };
}

// ────────────────────────────────────────────────────────────────────
// Initiate
// ────────────────────────────────────────────────────────────────────

export interface InitiateDeviceCodeInput {
  organizationId: string;
  tenantId: string;
  clientId: string;
  authorizedById: string | null;
}

export interface InitiateDeviceCodeResult {
  sessionId: string;
  userCode: string;
  verificationUri: string;
  expiresAt: string;
  message: string;
}

/**
 * Begins a Device Code session. Calls Microsoft's `/devicecode`
 * endpoint, persists the response in `M365DeviceCodeSession`, and
 * returns the user-facing user_code + verification URL.
 *
 * Throws if Microsoft refuses the request (invalid client id,
 * unsupported scope, etc.). The `/initiate` API endpoint translates
 * the throw into a 5xx with the Microsoft error.
 */
export async function initiateDeviceCodeFlow(
  input: InitiateDeviceCodeInput,
): Promise<InitiateDeviceCodeResult> {
  if (!input.authorizedById) {
    throw new Error(
      "initiateDeviceCodeFlow requires authorizedById — anonymous initiates are not allowed",
    );
  }
  // AEGIS's Entra app registration is a confidential client; Microsoft
  // requires `client_secret` in the body for both /devicecode and
  // /token. See `resolveClientSecret` for the full rationale.
  const { secret: clientSecret } = await resolveClientSecret(
    input.organizationId,
  );
  if (!clientSecret) {
    throw new Error(
      "M365_CLIENT_SECRET (or per-org encryptedClientSecret) is required " +
        "for the Device Code flow. Configure app-only credentials at " +
        "/admin/m365 first, then retry Connect.",
    );
  }
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: clientSecret,
    scope: DELEGATED_SCOPES.join(" "),
  });
  const resp = await postOAuth(deviceCodeEndpoint(input.tenantId), body);
  if (resp.status >= 400 || !resp.json || typeof resp.json !== "object") {
    const err = (resp.json ?? {}) as { error?: string; error_description?: string };
    throw new Error(
      `Microsoft /devicecode rejected: ${err.error ?? "unknown"} ` +
        `(${err.error_description ?? `HTTP ${resp.status}`})`,
    );
  }
  const j = resp.json as {
    device_code?: string;
    user_code?: string;
    verification_uri?: string;
    expires_in?: number;
    interval?: number;
    message?: string;
  };
  if (!j.device_code || !j.user_code || !j.verification_uri) {
    throw new Error(
      "Microsoft /devicecode response missing required fields (device_code / user_code / verification_uri)",
    );
  }
  const expiresAt = new Date(Date.now() + (j.expires_in ?? 900) * 1000);
  const sessionId = randomUUID();
  await prisma.m365DeviceCodeSession.create({
    data: {
      id: sessionId,
      organizationId: input.organizationId,
      initiatedById: input.authorizedById,
      deviceCode: j.device_code,
      userCode: j.user_code,
      verificationUri: j.verification_uri,
      expiresAt,
      pollIntervalSec: j.interval ?? DEFAULT_POLL_INTERVAL_SEC,
      status: "pending",
    },
  });
  return {
    sessionId,
    userCode: j.user_code,
    verificationUri: j.verification_uri,
    expiresAt: expiresAt.toISOString(),
    message:
      j.message ??
      `Open ${j.verification_uri} and enter code ${j.user_code}.`,
  };
}

// ────────────────────────────────────────────────────────────────────
// Poll
// ────────────────────────────────────────────────────────────────────

export interface PollDeviceCodeResult {
  status: DeviceCodeStatus;
  accountUpn: string | null;
  scopesGranted: string[];
  error: { code: string; message: string } | null;
}

/**
 * Stateless poll. Reads the session row, checks expiry, and asks
 * Microsoft's `/token` endpoint whether the user has completed
 * sign-in. On `authorization_pending` returns `pending`; on success
 * persists tokens to OrganizationM365Credential in the same
 * transaction that flips this row to `completed`.
 *
 * Concurrent polls (multiple Lambda instances polling the same
 * session simultaneously) are safe: the first to win the row update
 * persists tokens, the others see status='completed' and return
 * the cached result.
 */
export async function pollDeviceCodeFlow(
  sessionId: string,
): Promise<PollDeviceCodeResult> {
  const session = await prisma.m365DeviceCodeSession.findUnique({
    where: { id: sessionId },
  });
  if (!session) {
    return {
      status: "error",
      accountUpn: null,
      scopesGranted: [],
      error: { code: "SESSION_NOT_FOUND", message: "Unknown sessionId" },
    };
  }

  // Already terminal — short-circuit.
  if (session.status === "completed") {
    return {
      status: "connected",
      accountUpn: session.accountUpn,
      scopesGranted: parseScopes(session.scopesGrantedJson),
      error: null,
    };
  }
  if (session.status === "expired" || session.status === "error") {
    return {
      status: session.status as DeviceCodeStatus,
      accountUpn: null,
      scopesGranted: [],
      error: session.errorMessage
        ? { code: deriveErrorCode(session.status, session.errorMessage), message: session.errorMessage }
        : null,
    };
  }

  // TTL check before bothering Microsoft.
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.m365DeviceCodeSession
      .update({
        where: { id: sessionId },
        data: {
          status: "expired",
          errorMessage: "Device code TTL elapsed before user signed in",
        },
      })
      .catch(() => undefined);
    return {
      status: "expired",
      accountUpn: null,
      scopesGranted: [],
      error: { code: "expired_token", message: "Device code TTL elapsed" },
    };
  }

  // Resolve the tenant + client id from the org's credential row.
  // The session itself stores deviceCode but not tenantId — those
  // belong to the per-org credential row, which we re-resolve at
  // poll time so a credential rotation between initiate and poll
  // is handled safely.
  const cred = await prisma.organizationM365Credential.findUnique({
    where: { organizationId: session.organizationId },
  });
  const tenantId = cred?.tenantId ?? process.env.M365_TENANT_ID;
  const clientId = cred?.clientId ?? process.env.M365_CLIENT_ID;
  // AEGIS's Entra app registration is a confidential client; Microsoft's
  // /token endpoint rejects Device Code requests that omit
  // `client_secret` with AADSTS7000218. We re-resolve at every poll so a
  // post-initiate secret rotation is handled.
  const { secret: clientSecret } = await resolveClientSecret(
    session.organizationId,
  );
  if (!tenantId || !clientId || !clientSecret) {
    await markSessionError(
      sessionId,
      "M365 credentials missing — cannot poll for tokens",
    );
    return {
      status: "error",
      accountUpn: null,
      scopesGranted: [],
      error: {
        code: "MISSING_CREDENTIALS",
        message: "M365 credentials no longer configured for this org",
      },
    };
  }

  // Ask Microsoft. `client_secret` is required because the Entra app
  // registration is a confidential client.
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    client_id: clientId,
    client_secret: clientSecret,
    device_code: session.deviceCode,
  });
  const resp = await postOAuth(tokenEndpoint(tenantId), body);
  const j = (resp.json ?? {}) as {
    error?: string;
    error_description?: string;
    access_token?: string;
    refresh_token?: string;
    id_token?: string;
    expires_in?: number;
    scope?: string;
  };

  // Microsoft returns 400 with error=authorization_pending while we wait.
  if (resp.status === 400 || resp.status === 401) {
    if (j.error === "authorization_pending" || j.error === "slow_down") {
      return {
        status: "pending",
        accountUpn: null,
        scopesGranted: [],
        error: null,
      };
    }
    if (j.error === "expired_token") {
      await markSessionExpired(sessionId, j.error_description ?? "expired_token");
      return {
        status: "expired",
        accountUpn: null,
        scopesGranted: [],
        error: { code: "expired_token", message: j.error_description ?? "expired_token" },
      };
    }
    // access_denied, invalid_client, invalid_grant, …
    const code = j.error ?? "TOKEN_ERROR";
    const msg = j.error_description ?? `HTTP ${resp.status}`;
    await markSessionError(sessionId, `${code}: ${msg}`);
    return {
      status: "error",
      accountUpn: null,
      scopesGranted: [],
      error: { code, message: msg },
    };
  }
  if (resp.status >= 500 || !j.access_token || !j.refresh_token) {
    // Don't terminalise on 5xx — let the next poll retry.
    if (resp.status >= 500) {
      return {
        status: "pending",
        accountUpn: null,
        scopesGranted: [],
        error: null,
      };
    }
    const code = j.error ?? "MISSING_TOKENS";
    const msg = j.error_description ?? "Microsoft response lacked tokens";
    await markSessionError(sessionId, `${code}: ${msg}`);
    return {
      status: "error",
      accountUpn: null,
      scopesGranted: [],
      error: { code, message: msg },
    };
  }

  // Success — Microsoft issued tokens. Persist atomically.
  const accountUpn = extractUpn(j.id_token, j.access_token) ?? "";
  const scopesGranted = j.scope ? j.scope.split(" ").filter(Boolean) : [...DELEGATED_SCOPES];
  const expiresAt = new Date(Date.now() + (j.expires_in ?? 3600) * 1000);

  // Use a transaction so the session-completion flip and the credential
  // update either both happen or neither does. Concurrent polls will
  // serialise on the row update; the second one will read
  // status='completed' on the next loop and return without re-persisting.
  try {
    await prisma.$transaction(async (tx) => {
      // Re-read inside the transaction; if another instance already
      // completed the session, skip the persist to avoid duplicate
      // credential writes.
      const fresh = await tx.m365DeviceCodeSession.findUnique({
        where: { id: sessionId },
        select: { status: true },
      });
      if (!fresh || fresh.status !== "pending") return;

      await tx.m365DeviceCodeSession.update({
        where: { id: sessionId },
        data: {
          status: "completed",
          completedAt: new Date(),
          accountUpn,
          scopesGrantedJson: scopesGranted,
        },
      });
      await persistDelegatedTokens({
        organizationId: session.organizationId,
        refreshToken: j.refresh_token!,
        accountUpn,
        authorizedById: session.initiatedById,
        accessTokenExpiresAt: expiresAt,
        scopesGranted,
        initialAccessToken: j.access_token,
        // Needed for the upsert create branch on env-var-only
        // deployments where no OrganizationM365Credential row exists.
        tenantId,
        clientId,
        clientSecret,
      });
    });
  } catch (err) {
    await markSessionError(sessionId, `PERSIST_FAILED: ${String(err)}`);
    return {
      status: "error",
      accountUpn: null,
      scopesGranted: [],
      error: { code: "PERSIST_FAILED", message: String(err) },
    };
  }

  return {
    status: "connected",
    accountUpn,
    scopesGranted,
    error: null,
  };
}

// ────────────────────────────────────────────────────────────────────
// Cleanup
// ────────────────────────────────────────────────────────────────────

/**
 * Prune Device Code sessions older than 24 hours. Rows are tiny
 * (< 1 KB) so this is opportunistic — no harm in skipping.
 */
export async function pruneOldDeviceCodeSessions(
  organizationId?: string,
): Promise<{ deletedCount: number }> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const result = await prisma.m365DeviceCodeSession.deleteMany({
    where: {
      ...(organizationId ? { organizationId } : {}),
      createdAt: { lt: cutoff },
    },
  });
  return { deletedCount: result.count };
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function parseScopes(json: unknown): string[] {
  if (Array.isArray(json)) return json.filter((s): s is string => typeof s === "string");
  return [];
}

function deriveErrorCode(status: string, errorMessage: string): string {
  if (status === "expired") return "expired_token";
  const colonIdx = errorMessage.indexOf(":");
  return colonIdx > 0 ? errorMessage.slice(0, colonIdx) : "DEVICE_CODE_FAILED";
}

async function markSessionExpired(sessionId: string, message: string): Promise<void> {
  await prisma.m365DeviceCodeSession
    .update({
      where: { id: sessionId },
      data: { status: "expired", errorMessage: message },
    })
    .catch(() => undefined);
}

async function markSessionError(sessionId: string, message: string): Promise<void> {
  await prisma.m365DeviceCodeSession
    .update({
      where: { id: sessionId },
      data: { status: "error", errorMessage: message },
    })
    .catch(() => undefined);
}

/**
 * Extract the signed-in account's UPN from the id_token (preferred)
 * or fall back to the access_token's `upn` / `unique_name` /
 * `preferred_username` claim. Microsoft Graph access tokens carry
 * one of those for delegated tokens.
 */
function extractUpn(
  idToken: string | undefined,
  accessToken: string,
): string | null {
  for (const jwt of [idToken, accessToken]) {
    if (!jwt) continue;
    const parts = jwt.split(".");
    if (parts.length < 2 || !parts[1]) continue;
    try {
      const payload = JSON.parse(
        Buffer.from(parts[1], "base64").toString("utf8"),
      ) as Record<string, unknown>;
      const upn =
        (typeof payload.upn === "string" && payload.upn) ||
        (typeof payload.preferred_username === "string" && payload.preferred_username) ||
        (typeof payload.unique_name === "string" && payload.unique_name) ||
        (typeof payload.email === "string" && payload.email);
      if (upn) return upn;
    } catch {
      // Try the next token.
    }
  }
  return null;
}
