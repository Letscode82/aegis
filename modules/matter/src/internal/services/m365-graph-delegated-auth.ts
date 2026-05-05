/**
 * M365 delegated authentication — credential storage, refresh-token
 * rotation, and per-org token cache (sub-PR 4c.1).
 *
 * Microsoft's Graph eDiscovery endpoints (`/security/cases/...`) do
 * not honor application-permissions tokens — confirmed via Microsoft
 * Q&A late 2025. The documented workaround all incumbents use
 * (Mitratech, Relativity, Exterro) is delegated authentication backed
 * by a dedicated M365 service account authorized once per org via
 * Device Code OAuth.
 *
 * This module owns the persistence + refresh side of the flow:
 *
 *   1. The Device Code orchestrator (m365-graph-device-code.ts)
 *      collects a refresh token after the operator signs in.
 *      It calls `persistDelegatedTokens()` here.
 *   2. Subsequent eDiscovery calls go through the
 *      `M365GraphDelegatedClient` (m365-graph-delegated-client.ts).
 *      Each call asks `getFreshDelegatedAccessToken()` for a token,
 *      which refreshes from the stored refresh token if expired.
 *   3. If Microsoft rejects the refresh, we surface
 *      `M365DelegatedAuthExpiredError` and clear the cache. The
 *      admin UI shows a re-authorize banner.
 *
 * The refresh-token-to-access-token swap uses
 * `@azure/msal-node`'s `acquireTokenByRefreshToken`. We don't use
 * `@azure/identity`'s DeviceCodeCredential here because that abstraction
 * doesn't expose the refresh token for cross-process persistence —
 * MSAL gives us direct cache access.
 *
 * Storage shape: `OrganizationM365Credential.delegatedRefreshToken`
 * holds the v1-encrypted refresh-token string. The cache here is a
 * simple in-process Map keyed by orgId; the access token + expiry
 * survive across requests within the same Node process. On expiry,
 * we hit the refresh-token endpoint and rotate.
 *
 * Encryption note: refresh tokens are encrypted at rest with the same
 * `encryptSecret` v1-prefix helper as `encryptedClientSecret`. The
 * sunset path (KMS) is shared — see CLAUDE.md "Documented exceptions".
 */
import { createHash } from "node:crypto";
import { decryptSecret, prisma } from "@aegis/db";
import {
  M365DelegatedAuthExpiredError,
  M365DelegatedAuthRequiredError,
} from "./m365-graph-errors";

/** Required delegated scopes — the Device Code prompt asks for these. */
export const DELEGATED_SCOPES: readonly string[] = Object.freeze([
  "https://graph.microsoft.com/eDiscovery.ReadWrite.All",
  "https://graph.microsoft.com/User.Read",
  "offline_access",
]);

/** Treat tokens with <60s remaining lifetime as expired — refresh ahead. */
const REFRESH_BUFFER_MS = 60_000;

// ────────────────────────────────────────────────────────────────────
// In-process access-token cache
// ────────────────────────────────────────────────────────────────────

interface CachedAccessToken {
  accessToken: string;
  expiresAt: number;
  /** Hash of the refresh token used to obtain this access token; on
   *  rotation the cache entry invalidates automatically. */
  refreshTokenFingerprint: string;
}

const ACCESS_TOKEN_CACHE = new Map<string, CachedAccessToken>();

export function clearDelegatedAccessTokenCache(orgId: string): void {
  ACCESS_TOKEN_CACHE.delete(orgId);
}

// ────────────────────────────────────────────────────────────────────
// Persistence
// ────────────────────────────────────────────────────────────────────

export interface PersistDelegatedTokensInput {
  organizationId: string;
  /** Plaintext refresh token from MSAL token cache. Encrypted before write. */
  refreshToken: string;
  /** UPN of the signed-in service account, e.g. `aegis-svc@…`. */
  accountUpn: string;
  /** AEGIS user id of the admin who clicked Connect. */
  authorizedById: string | null;
  /** Access-token expiry observed from the device-code result. */
  accessTokenExpiresAt: Date;
  /** Scopes Microsoft actually granted (may differ from requested). */
  scopesGranted: readonly string[];
  /** First access token returned by Microsoft — populates cache so
   *  the next call doesn't burn a refresh round-trip. */
  initialAccessToken?: string;
  /**
   * App-only credentials needed to populate the row's non-nullable
   * columns when the upsert hits the create branch. Required for
   * env-var-only deployments where no `OrganizationM365Credential`
   * row exists yet — the persist is the row's first appearance.
   *
   * For deployments that pre-configured per-org credentials via the
   * admin UI, the update branch ignores these fields (the row's
   * existing tenant/client/secret are already populated and stay
   * authoritative).
   */
  tenantId: string;
  clientId: string;
  /** Plaintext app-only client secret; encrypted before storage. */
  clientSecret: string;
}

export async function persistDelegatedTokens(
  input: PersistDelegatedTokensInput,
): Promise<void> {
  const { encryptSecret } = await import("@aegis/db");
  const encryptedRefresh = encryptSecret(input.refreshToken);
  const now = new Date();
  // Upsert (not update) so env-var-only deployments — which never
  // create an OrganizationM365Credential row up front — get one
  // materialised on first Connect. Without this, the .update() in
  // the previous implementation failed with "Record to update not
  // found" and the user's tokens were lost despite a successful
  // Microsoft sign-in.
  await prisma.organizationM365Credential.upsert({
    where: { organizationId: input.organizationId },
    update: {
      delegatedRefreshToken: encryptedRefresh,
      delegatedAccountUpn: input.accountUpn,
      delegatedAuthorizedAt: now,
      delegatedAuthorizedById: input.authorizedById,
      delegatedTokenExpiresAt: input.accessTokenExpiresAt,
      delegatedLastRefreshedAt: now,
      delegatedLastRefreshError: null,
      delegatedScopesGranted: [...input.scopesGranted],
    },
    create: {
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      clientId: input.clientId,
      encryptedClientSecret: encryptSecret(input.clientSecret),
      isActive: true,
      delegatedRefreshToken: encryptedRefresh,
      delegatedAccountUpn: input.accountUpn,
      delegatedAuthorizedAt: now,
      delegatedAuthorizedById: input.authorizedById,
      delegatedTokenExpiresAt: input.accessTokenExpiresAt,
      delegatedLastRefreshedAt: now,
      delegatedScopesGranted: [...input.scopesGranted],
    },
  });
  if (input.initialAccessToken) {
    ACCESS_TOKEN_CACHE.set(input.organizationId, {
      accessToken: input.initialAccessToken,
      expiresAt: input.accessTokenExpiresAt.getTime(),
      refreshTokenFingerprint: hashRefreshToken(input.refreshToken),
    });
  } else {
    ACCESS_TOKEN_CACHE.delete(input.organizationId);
  }
}

/**
 * Wipe the delegated tokens for an org. Called by Disconnect and by
 * the refresh path when Microsoft rejects the stored token.
 */
export async function clearDelegatedTokens(
  organizationId: string,
  reason: { lastRefreshError?: string } = {},
): Promise<void> {
  await prisma.organizationM365Credential
    .update({
      where: { organizationId },
      data: {
        delegatedRefreshToken: null,
        delegatedAccountUpn: null,
        delegatedAuthorizedAt: null,
        delegatedAuthorizedById: null,
        delegatedTokenExpiresAt: null,
        delegatedLastRefreshedAt: null,
        delegatedLastRefreshError: reason.lastRefreshError ?? null,
        delegatedScopesGranted: [],
      },
    })
    .catch(() => undefined);
  ACCESS_TOKEN_CACHE.delete(organizationId);
}

// ────────────────────────────────────────────────────────────────────
// Status surface
// ────────────────────────────────────────────────────────────────────

export interface DelegatedAuthStatus {
  /** True iff a refresh token is stored. */
  configured: boolean;
  accountUpn: string | null;
  authorizedAt: string | null;
  authorizedByName: string | null;
  authorizedById: string | null;
  tokenExpiresAt: string | null;
  lastRefreshedAt: string | null;
  lastRefreshError: string | null;
  scopesGranted: string[];
  /** True iff lastRefreshError indicates the token is now invalid. */
  expired: boolean;
}

export async function getDelegatedAuthStatus(
  organizationId: string,
): Promise<DelegatedAuthStatus> {
  const row = await prisma.organizationM365Credential.findUnique({
    where: { organizationId },
  });
  if (!row || !row.delegatedRefreshToken) {
    return {
      configured: false,
      accountUpn: null,
      authorizedAt: null,
      authorizedByName: null,
      authorizedById: null,
      tokenExpiresAt: null,
      lastRefreshedAt: null,
      lastRefreshError: row?.delegatedLastRefreshError ?? null,
      scopesGranted: [],
      expired: false,
    };
  }
  let authorizedByName: string | null = null;
  if (row.delegatedAuthorizedById) {
    const u = await prisma.user
      .findUnique({ where: { id: row.delegatedAuthorizedById } })
      .catch(() => null);
    authorizedByName = u?.name ?? null;
  }
  return {
    configured: true,
    accountUpn: row.delegatedAccountUpn,
    authorizedAt: row.delegatedAuthorizedAt?.toISOString() ?? null,
    authorizedByName,
    authorizedById: row.delegatedAuthorizedById,
    tokenExpiresAt: row.delegatedTokenExpiresAt?.toISOString() ?? null,
    lastRefreshedAt: row.delegatedLastRefreshedAt?.toISOString() ?? null,
    lastRefreshError: row.delegatedLastRefreshError,
    scopesGranted: row.delegatedScopesGranted,
    expired: !!row.delegatedLastRefreshError,
  };
}

// ────────────────────────────────────────────────────────────────────
// Token refresh
// ────────────────────────────────────────────────────────────────────

/**
 * Pluggable refresh-token-to-access-token exchange. Production wires
 * this to MSAL; tests inject a stub that returns a deterministic
 * token without burning Microsoft round-trips.
 */
export interface RefreshTokenExchanger {
  exchange(input: {
    tenantId: string;
    clientId: string;
    refreshToken: string;
    scopes: readonly string[];
  }): Promise<{
    accessToken: string;
    expiresOn: Date;
    /** Microsoft sometimes rotates the refresh token. If it does,
     *  callers persist the new one. */
    rotatedRefreshToken?: string;
  }>;
}

let exchanger: RefreshTokenExchanger | null = null;

export function setRefreshTokenExchanger(
  next: RefreshTokenExchanger | null,
): void {
  exchanger = next;
}

async function defaultExchanger(): Promise<RefreshTokenExchanger> {
  // Lazy import keeps msal-node out of the bundle when only app-only
  // auth is in use (CI, mock-only tests). The msal-node version is
  // pinned exactly in package.json (no caret) because the call below
  // uses the public-but-undocumented `acquireTokenByRefreshToken`
  // API; minor-version bumps have reorganised internal APIs in the
  // past. Sunset path: replace with direct HTTP to /oauth2/v2.0/token
  // (grant_type=refresh_token), the same pattern that
  // m365-graph-device-code.ts already uses.
  const { PublicClientApplication } = await import("@azure/msal-node");
  return {
    async exchange({ tenantId, clientId, refreshToken, scopes }) {
      const pca = new PublicClientApplication({
        auth: {
          clientId,
          authority: `https://login.microsoftonline.com/${tenantId}`,
        },
      });
      // `acquireTokenByRefreshToken` is a public-but-undocumented
      // API on MSAL. It's the only way to swap a refresh token for an
      // access token without re-prompting the user.
      const result = await (
        pca as unknown as {
          acquireTokenByRefreshToken(req: {
            refreshToken: string;
            scopes: string[];
          }): Promise<{
            accessToken: string;
            expiresOn: Date | null;
          } | null>;
        }
      ).acquireTokenByRefreshToken({
        refreshToken,
        scopes: scopes.filter((s) => s !== "offline_access"),
      });
      if (!result) {
        throw new Error("MSAL acquireTokenByRefreshToken returned null");
      }
      return {
        accessToken: result.accessToken,
        expiresOn: result.expiresOn ?? new Date(Date.now() + 3600_000),
      };
    },
  };
}

/**
 * Returns a fresh access token for the org's eDiscovery service
 * account. Throws `M365DelegatedAuthRequiredError` if no refresh
 * token is stored, or `M365DelegatedAuthExpiredError` if Microsoft
 * rejects the refresh.
 */
export async function getFreshDelegatedAccessToken(
  organizationId: string,
): Promise<{ accessToken: string; accountUpn: string | null }> {
  const row = await prisma.organizationM365Credential.findUnique({
    where: { organizationId },
  });
  if (!row || !row.delegatedRefreshToken) {
    throw new M365DelegatedAuthRequiredError(
      "eDiscovery delegated authorization required. " +
        "An admin must connect an M365 service account at /admin/m365 " +
        "(Device Code flow) before eDiscovery operations can proceed.",
    );
  }

  let plaintextRefresh: string;
  try {
    plaintextRefresh = decryptSecret(row.delegatedRefreshToken as Buffer);
  } catch {
    throw new M365DelegatedAuthExpiredError(
      "Stored delegated refresh token could not be decrypted — re-authorize via /admin/m365.",
      { upstreamCode: "DECRYPT_FAILED", lastWorkingAt: row.delegatedLastRefreshedAt },
    );
  }

  const fingerprint = hashRefreshToken(plaintextRefresh);
  const cached = ACCESS_TOKEN_CACHE.get(organizationId);
  if (
    cached &&
    cached.refreshTokenFingerprint === fingerprint &&
    cached.expiresAt - REFRESH_BUFFER_MS > Date.now()
  ) {
    return { accessToken: cached.accessToken, accountUpn: row.delegatedAccountUpn };
  }

  const ex = exchanger ?? (await defaultExchanger());
  try {
    const result = await ex.exchange({
      tenantId: row.tenantId,
      clientId: row.clientId,
      refreshToken: plaintextRefresh,
      scopes: row.delegatedScopesGranted.length > 0
        ? row.delegatedScopesGranted
        : DELEGATED_SCOPES,
    });
    ACCESS_TOKEN_CACHE.set(organizationId, {
      accessToken: result.accessToken,
      expiresAt: result.expiresOn.getTime(),
      refreshTokenFingerprint: result.rotatedRefreshToken
        ? hashRefreshToken(result.rotatedRefreshToken)
        : fingerprint,
    });
    // Persist rotated refresh token (Microsoft may rotate periodically).
    if (result.rotatedRefreshToken && result.rotatedRefreshToken !== plaintextRefresh) {
      const { encryptSecret } = await import("@aegis/db");
      await prisma.organizationM365Credential.update({
        where: { organizationId },
        data: {
          delegatedRefreshToken: encryptSecret(result.rotatedRefreshToken),
          delegatedTokenExpiresAt: result.expiresOn,
          delegatedLastRefreshedAt: new Date(),
          delegatedLastRefreshError: null,
        },
      });
    } else {
      await prisma.organizationM365Credential.update({
        where: { organizationId },
        data: {
          delegatedTokenExpiresAt: result.expiresOn,
          delegatedLastRefreshedAt: new Date(),
          delegatedLastRefreshError: null,
        },
      });
    }
    return { accessToken: result.accessToken, accountUpn: row.delegatedAccountUpn };
  } catch (err) {
    const e = err as { errorCode?: string; errorMessage?: string; message?: string };
    const upstreamCode = e.errorCode ?? null;
    const upstreamMessage = e.errorMessage ?? e.message ?? null;
    const errSummary = `${upstreamCode ?? "REFRESH_FAILED"}: ${
      upstreamMessage?.slice(0, 200) ?? "unknown"
    }`;
    await clearDelegatedTokens(organizationId, { lastRefreshError: errSummary });
    throw new M365DelegatedAuthExpiredError(
      "Microsoft rejected the stored delegated refresh token. " +
        "An admin must re-authorize via /admin/m365.",
      {
        upstreamCode,
        upstreamMessage,
        lastWorkingAt: row.delegatedLastRefreshedAt,
      },
    );
  }
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex").slice(0, 16);
}
