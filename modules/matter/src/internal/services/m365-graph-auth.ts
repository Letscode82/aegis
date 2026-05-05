/**
 * M365 credential resolution + per-org client cache.
 *
 * Resolution order (matches CLAUDE.md "Architectural Foundations:
 * M365 integration"):
 *   1. row in OrganizationM365Credential (per-org override)
 *   2. M365_TENANT_ID + M365_CLIENT_ID + M365_CLIENT_SECRET env vars
 *   3. null → caller falls back to MockM365Client
 *
 * Cache: keyed by orgId. Entries store the resolved tenantId,
 * clientId, secret fingerprint (sha256 prefix) and the constructed
 * SDK Client. On each lookup we recompute the fingerprint of the
 * current source — if it differs (env var rotated, per-org row
 * rotated), the cache entry is dropped and rebuilt. No Redis;
 * Map<orgId, Cached> in module scope.
 *
 * The SDK Client itself is wrapped with the throttle middleware
 * configured in m365-graph-throttle and the audit middleware lives
 * one layer up at the call site (withGraphAudit).
 */
import { ClientSecretCredential } from "@azure/identity";
import {
  AuthenticationHandler,
  Client,
  HTTPMessageHandler,
  RetryHandler,
  RetryHandlerOptions,
  TelemetryHandler,
} from "@microsoft/microsoft-graph-client";
import {
  decryptSecret,
  prisma,
  secretFingerprint,
} from "@aegis/db";
import { mapGraphError } from "./m365-graph-errors";
import {
  DEFAULT_THROTTLE_POLICY,
} from "./m365-graph-throttle";
import { withGraphAudit } from "./m365-graph-audit";
import type { M365VerifyResult } from "./m365-graph-types";

// ────────────────────────────────────────────────────────────────────
// Production guard — fail loud on partial config.
// ────────────────────────────────────────────────────────────────────

if (process.env.NODE_ENV === "production") {
  const tenantId = process.env.M365_TENANT_ID;
  const clientId = process.env.M365_CLIENT_ID;
  const clientSecret = process.env.M365_CLIENT_SECRET;
  const allSet = !!tenantId && !!clientId && !!clientSecret;
  const allUnset = !tenantId && !clientId && !clientSecret;
  if (!allSet && !allUnset) {
    throw new Error(
      `[m365-graph-auth] In production, M365_TENANT_ID, M365_CLIENT_ID, and ` +
        `M365_CLIENT_SECRET must either ALL be set (env-var path) or ALL be ` +
        `unset (per-org credentials only). Partial config detected. ` +
        `Refusing to boot — fix the deployment env vars.`,
    );
  }
}

// ────────────────────────────────────────────────────────────────────
// Credential resolution
// ────────────────────────────────────────────────────────────────────

export interface ResolvedCredentials {
  /** Where the credentials came from — drives the connection-status UI. */
  source: "per-org" | "env";
  tenantId: string;
  clientId: string;
  /** Plaintext — never persisted past credential resolution. */
  clientSecret: string;
  /** Stable fingerprint for cache invalidation. */
  fingerprint: string;
  graphBaseUrl: string;
}

export async function resolveCredentialsForOrg(
  organizationId: string,
): Promise<ResolvedCredentials | null> {
  const row = await prisma.organizationM365Credential.findUnique({
    where: { organizationId },
  });
  if (row && row.isActive) {
    let plaintext: string | null = null;
    try {
      plaintext = decryptSecret(row.encryptedClientSecret as Buffer);
    } catch {
      // Bad cipher / wrong version — treat as not configured. Falls
      // through to the env-var path below so a misencoded per-org
      // row doesn't lock out an otherwise-working deployment.
    }
    // An empty plaintext also counts as not configured — Microsoft
    // would reject the OAuth call and the operator would see a
    // confusing AADSTS error instead of MISSING_CREDENTIALS. This
    // matches what the post-PR-31 device-code-side resolver was
    // doing; this fix consolidates the two checks into one.
    if (plaintext && plaintext.length > 0) {
      return {
        source: "per-org",
        tenantId: row.tenantId,
        clientId: row.clientId,
        clientSecret: plaintext,
        fingerprint: `org:${secretFingerprint(plaintext)}:${row.rotatedAt?.getTime() ?? "init"}`,
        graphBaseUrl: row.graphBaseUrl,
      };
    }
  }

  const tenantId = process.env.M365_TENANT_ID;
  const clientId = process.env.M365_CLIENT_ID;
  const clientSecret = process.env.M365_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) return null;

  return {
    source: "env",
    tenantId,
    clientId,
    clientSecret,
    fingerprint: `env:${secretFingerprint(clientSecret)}`,
    graphBaseUrl: "https://graph.microsoft.com",
  };
}

// ────────────────────────────────────────────────────────────────────
// Client cache
// ────────────────────────────────────────────────────────────────────

interface CachedClient {
  client: Client;
  fingerprint: string;
  tenantId: string;
}

const CACHE = new Map<string, CachedClient>();

function buildClient(creds: ResolvedCredentials): Client {
  const credential = new ClientSecretCredential(
    creds.tenantId,
    creds.clientId,
    creds.clientSecret,
  );
  const authProvider = {
    getAccessToken: async (): Promise<string> => {
      const token = await credential.getToken(
        `${creds.graphBaseUrl}/.default`,
      );
      if (!token) throw new Error("ClientSecretCredential returned null token");
      return token.token;
    },
  };
  // Build the SDK middleware chain manually so the RetryHandler is
  // constructed with our `DEFAULT_THROTTLE_POLICY` rather than the
  // SDK's defaults. Order is fixed by the SDK's contract:
  //
  //   AuthenticationHandler → RetryHandler → TelemetryHandler → HTTPMessageHandler
  //
  // The previous implementation passed `middleware: undefined` and
  // separately called `buildRetryHandlerOptions(...)` while
  // discarding the return value — so 429s and 5xx surfaced as
  // `M365ThrottleExceededError` after a single attempt instead of
  // being absorbed by the middleware as the throttle module's
  // comment promised.
  const policy = DEFAULT_THROTTLE_POLICY;
  const retryOptions = new RetryHandlerOptions(
    policy.backoffBaseMs / 1000, // seconds — SDK convention
    policy.maxRetries,
    (_delay, attempt, _request, _options, response) => {
      if (attempt >= policy.maxRetries) return false;
      if (response.status === 429) return true;
      if (response.status >= 500 && response.status < 600) return true;
      return false;
    },
  );
  const auth = new AuthenticationHandler(authProvider);
  const retry = new RetryHandler(retryOptions);
  const telemetry = new TelemetryHandler();
  const http = new HTTPMessageHandler();
  auth.setNext(retry);
  retry.setNext(telemetry);
  telemetry.setNext(http);
  return Client.initWithMiddleware({
    middleware: auth,
    defaultVersion: "v1.0",
  });
}

/**
 * Get a Graph SDK Client for the org, building (or rebuilding) on
 * cache miss / fingerprint change. Returns null if no credentials
 * resolve — caller should fall back to MockM365Client.
 */
export async function getGraphClientForOrg(
  organizationId: string,
): Promise<{ client: Client; tenantId: string; source: "per-org" | "env" } | null> {
  const creds = await resolveCredentialsForOrg(organizationId);
  if (!creds) {
    CACHE.delete(organizationId);
    return null;
  }
  const cached = CACHE.get(organizationId);
  if (cached && cached.fingerprint === creds.fingerprint) {
    return { client: cached.client, tenantId: cached.tenantId, source: creds.source };
  }
  const client = buildClient(creds);
  CACHE.set(organizationId, {
    client,
    fingerprint: creds.fingerprint,
    tenantId: creds.tenantId,
  });
  return { client, tenantId: creds.tenantId, source: creds.source };
}

/** Drop the cache entry for an org; next call rebuilds. */
export function invalidateGraphClientCache(organizationId: string): void {
  CACHE.delete(organizationId);
}

// ────────────────────────────────────────────────────────────────────
// Public connection-management surface (used by api.ts)
// ────────────────────────────────────────────────────────────────────

export interface UpsertCredentialsInput {
  organizationId: string;
  tenantId: string;
  clientId: string;
  /** Plaintext; encrypted via @aegis/db.encryptSecret before storage. */
  clientSecret: string;
  graphBaseUrl?: string;
}

/**
 * Insert or update the per-org credentials row. The cache is
 * invalidated; the next Graph call re-resolves and re-builds the
 * Client. Plaintext is wrapped through `encryptSecret` (4c dev-only
 * plaintext implementation, sunset before first paying customer).
 */
export async function upsertOrgM365Credentials(
  input: UpsertCredentialsInput,
): Promise<void> {
  // Lazy import to avoid pulling encryptSecret into the production
  // factory when only the env path is used.
  const { encryptSecret } = await import("@aegis/db");
  const encrypted = encryptSecret(input.clientSecret);
  await prisma.organizationM365Credential.upsert({
    where: { organizationId: input.organizationId },
    update: {
      tenantId: input.tenantId,
      clientId: input.clientId,
      encryptedClientSecret: encrypted,
      graphBaseUrl: input.graphBaseUrl ?? "https://graph.microsoft.com",
      isActive: true,
      rotatedAt: new Date(),
      lastErrorMessage: null,
    },
    create: {
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      clientId: input.clientId,
      encryptedClientSecret: encrypted,
      graphBaseUrl: input.graphBaseUrl ?? "https://graph.microsoft.com",
      isActive: true,
    },
  });
  invalidateGraphClientCache(input.organizationId);
}

/** Rotate just the secret while keeping tenantId / clientId. */
export async function rotateOrgM365Secret(
  organizationId: string,
  newPlaintextSecret: string,
): Promise<void> {
  const { encryptSecret } = await import("@aegis/db");
  const encrypted = encryptSecret(newPlaintextSecret);
  await prisma.organizationM365Credential.update({
    where: { organizationId },
    data: {
      encryptedClientSecret: encrypted,
      rotatedAt: new Date(),
    },
  });
  invalidateGraphClientCache(organizationId);
}

/**
 * Round-trip Graph `/me` (when delegated) or `/organization` (when
 * app-only — our case) to confirm the credentials work. Updates
 * `lastVerifiedAt` and `lastErrorMessage` on the per-org row.
 */
export async function verifyM365Credentials(
  organizationId: string,
): Promise<M365VerifyResult> {
  const startedAt = Date.now();
  const resolved = await getGraphClientForOrg(organizationId);
  if (!resolved) {
    return {
      ok: false,
      durationMs: Date.now() - startedAt,
      tenantId: null,
      error: { name: "M365NotConfigured", message: "No M365 credentials resolved for org" },
    };
  }
  try {
    const orgInfo: { id: string; verifiedDomains?: { name?: string }[] } | undefined =
      await withGraphAudit(
        {
          organizationId,
          endpoint: "/organization",
          method: "GET",
          tenantId: resolved.tenantId,
          actor: null,
          actorType: "SYSTEM",
        },
        () => resolved.client.api("/organization").get(),
      );
    const durationMs = Date.now() - startedAt;
    await prisma.organizationM365Credential
      .update({
        where: { organizationId },
        data: { lastVerifiedAt: new Date(), lastErrorMessage: null },
      })
      .catch(() => undefined); // env-var path won't have a row — OK
    return {
      ok: true,
      durationMs,
      tenantId: resolved.tenantId,
      error: null,
    };
  } catch (err) {
    const mapped = mapGraphError(err, "/organization");
    await prisma.organizationM365Credential
      .update({
        where: { organizationId },
        data: { lastErrorMessage: `${mapped.name}: ${mapped.message.slice(0, 240)}` },
      })
      .catch(() => undefined);
    return {
      ok: false,
      durationMs: Date.now() - startedAt,
      tenantId: resolved.tenantId,
      error: { name: mapped.name, message: mapped.message },
    };
  }
}

/**
 * Surface the connection status for /admin/m365 + /api/_health/m365.
 */
export async function getM365ConnectionStatus(
  organizationId: string,
): Promise<{
  organizationId: string;
  mode: "real" | "mock";
  configured: boolean;
  tenantIdMasked: string | null;
  lastVerifiedAt: string | null;
  lastErrorMessage: string | null;
  source: "per-org" | "env" | null;
}> {
  const creds = await resolveCredentialsForOrg(organizationId);
  if (!creds) {
    return {
      organizationId,
      mode: "mock",
      configured: false,
      tenantIdMasked: null,
      lastVerifiedAt: null,
      lastErrorMessage: null,
      source: null,
    };
  }
  const row = await prisma.organizationM365Credential.findUnique({
    where: { organizationId },
  });
  return {
    organizationId,
    mode: "real",
    configured: true,
    tenantIdMasked:
      creds.tenantId.length > 8
        ? `${creds.tenantId.slice(0, 4)}…${creds.tenantId.slice(-4)}`
        : creds.tenantId,
    lastVerifiedAt: row?.lastVerifiedAt?.toISOString() ?? null,
    lastErrorMessage: row?.lastErrorMessage ?? null,
    source: creds.source,
  };
}
