/**
 * Device Code OAuth orchestration (sub-PR 4c.1).
 *
 * Microsoft's eDiscovery endpoints require a delegated user token.
 * The standard non-interactive UX for service accounts is the OAuth
 * 2.0 Device Authorization grant ("Device Code"):
 *
 *   1. AEGIS asks Microsoft for a device-code session.
 *   2. UI displays the user code + verification URL.
 *   3. The operator opens https://microsoft.com/devicelogin in a
 *      separate tab and signs in as the dedicated service account.
 *   4. AEGIS polls Microsoft for completion. On success it receives
 *      access token + refresh token.
 *   5. We persist the encrypted refresh token via
 *      `persistDelegatedTokens()`.
 *
 * The `DeviceCodeOrchestrator` here is a thin state machine over MSAL
 * Node's `acquireTokenByDeviceCode` API. The polling lifecycle is:
 *
 *   pending  → user hasn't entered the code yet
 *   complete → tokens stored, session can be discarded
 *   error    → MSAL surfaced an error (network, expired code, etc.)
 *   expired  → device code TTL elapsed without user interaction
 *
 * The orchestrator is intentionally injectable: the production wiring
 * uses MSAL via `@azure/msal-node`; tests can pass a stubbed
 * `DeviceCodeFactory` that returns a controllable promise.
 */
import { randomUUID } from "node:crypto";
import {
  DELEGATED_SCOPES,
  persistDelegatedTokens,
} from "./m365-graph-delegated-auth";

export interface DeviceCodePromptInfo {
  userCode: string;
  verificationUri: string;
  expiresOn: Date;
  message: string;
}

export interface DeviceCodeResult {
  accessToken: string;
  refreshToken: string;
  accountUpn: string;
  expiresOn: Date;
  scopesGranted: readonly string[];
}

/**
 * Pluggable device-code provider. The default implementation wires
 * MSAL Node; tests inject a stub.
 *
 * `start()` kicks off the device-code request. It returns the prompt
 * info (user code + verification URL) and a `complete` promise that
 * resolves when the user signs in (or rejects with an error). The
 * caller (orchestrator) awaits `complete` to extract refresh token.
 */
export interface DeviceCodeFactory {
  start(input: {
    tenantId: string;
    clientId: string;
    scopes: readonly string[];
  }): Promise<{
    prompt: DeviceCodePromptInfo;
    complete: Promise<DeviceCodeResult>;
  }>;
}

let factory: DeviceCodeFactory | null = null;

export function setDeviceCodeFactory(next: DeviceCodeFactory | null): void {
  factory = next;
}

async function defaultFactory(): Promise<DeviceCodeFactory> {
  const { PublicClientApplication } = await import("@azure/msal-node");
  return {
    async start({ tenantId, clientId, scopes }) {
      const pca = new PublicClientApplication({
        auth: {
          clientId,
          authority: `https://login.microsoftonline.com/${tenantId}`,
        },
      });
      // `acquireTokenByDeviceCode` invokes `deviceCodeCallback` with
      // the user code + URL synchronously, then returns a promise
      // that resolves when the user signs in.
      let resolvePrompt!: (info: DeviceCodePromptInfo) => void;
      const promptPromise = new Promise<DeviceCodePromptInfo>((resolve) => {
        resolvePrompt = resolve;
      });
      const filteredScopes = scopes.filter((s) => s !== "offline_access");
      const acquirePromise = pca.acquireTokenByDeviceCode({
        deviceCodeCallback: (info) => {
          resolvePrompt({
            userCode: info.userCode,
            verificationUri: info.verificationUri,
            expiresOn: new Date(Date.now() + (info.expiresIn ?? 900) * 1000),
            message: info.message ?? "",
          });
        },
        scopes: filteredScopes,
      }) as unknown as Promise<{
        accessToken: string;
        expiresOn: Date | null;
        account: { username?: string; homeAccountId?: string } | null;
        scopes?: string[];
      } | null>;
      const prompt = await promptPromise;
      const complete = (async (): Promise<DeviceCodeResult> => {
        const result = await acquirePromise;
        if (!result) {
          throw new Error("MSAL acquireTokenByDeviceCode returned null");
        }
        // Pull refresh token from MSAL's in-memory cache. MSAL exposes
        // it via `serializeCache()`.
        const cacheJson = pca.getTokenCache().serialize();
        const refreshToken = extractRefreshToken(cacheJson);
        if (!refreshToken) {
          throw new Error(
            "Device code flow succeeded but no refresh token in MSAL cache. " +
              "Verify `offline_access` was requested.",
          );
        }
        return {
          accessToken: result.accessToken,
          refreshToken,
          accountUpn: result.account?.username ?? "",
          expiresOn: result.expiresOn ?? new Date(Date.now() + 3600_000),
          scopesGranted: result.scopes ?? scopes,
        };
      })();
      return { prompt, complete };
    },
  };
}

function extractRefreshToken(cacheJson: string): string | null {
  try {
    const parsed = JSON.parse(cacheJson) as {
      RefreshToken?: Record<string, { secret?: string }>;
    };
    if (!parsed.RefreshToken) return null;
    for (const entry of Object.values(parsed.RefreshToken)) {
      if (entry?.secret) return entry.secret;
    }
    return null;
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────
// Session state machine
// ────────────────────────────────────────────────────────────────────

export type DeviceCodeStatus =
  | "pending"
  | "connected"
  | "error"
  | "expired";

interface DeviceCodeSession {
  sessionId: string;
  organizationId: string;
  authorizedById: string | null;
  prompt: DeviceCodePromptInfo;
  status: DeviceCodeStatus;
  result: DeviceCodeResult | null;
  error: { code: string; message: string } | null;
  startedAt: Date;
}

/**
 * Module-scoped session map. Sessions are short-lived (≤15 min, the
 * device code TTL); we don't bother with a database row. Sessions
 * are bound to a single Node process — for multi-instance deployments
 * the operator must complete the flow on the same instance that
 * served the initial /initiate call. This is acceptable because the
 * Connect button is admin-only and the flow takes <60 seconds.
 */
const SESSIONS = new Map<string, DeviceCodeSession>();

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

export async function initiateDeviceCodeFlow(
  input: InitiateDeviceCodeInput,
): Promise<InitiateDeviceCodeResult> {
  const fac = factory ?? (await defaultFactory());
  const { prompt, complete } = await fac.start({
    tenantId: input.tenantId,
    clientId: input.clientId,
    scopes: DELEGATED_SCOPES,
  });
  const sessionId = randomUUID();
  const session: DeviceCodeSession = {
    sessionId,
    organizationId: input.organizationId,
    authorizedById: input.authorizedById,
    prompt,
    status: "pending",
    result: null,
    error: null,
    startedAt: new Date(),
  };
  SESSIONS.set(sessionId, session);

  // Background-await the completion. We don't `await` here so the
  // initiate endpoint can return fast.
  void complete
    .then(async (result) => {
      session.result = result;
      session.status = "connected";
      try {
        await persistDelegatedTokens({
          organizationId: input.organizationId,
          refreshToken: result.refreshToken,
          accountUpn: result.accountUpn,
          authorizedById: input.authorizedById,
          accessTokenExpiresAt: result.expiresOn,
          scopesGranted: result.scopesGranted,
          initialAccessToken: result.accessToken,
        });
      } catch (err) {
        session.status = "error";
        session.error = {
          code: "PERSIST_FAILED",
          message: String(err),
        };
      }
    })
    .catch((err: unknown) => {
      const e = err as { errorCode?: string; message?: string };
      const code = e.errorCode ?? "DEVICE_CODE_FAILED";
      session.status = code.includes("expired_token") ? "expired" : "error";
      session.error = { code, message: e.message ?? String(err) };
    });

  return {
    sessionId,
    userCode: prompt.userCode,
    verificationUri: prompt.verificationUri,
    expiresAt: prompt.expiresOn.toISOString(),
    message: prompt.message,
  };
}

export interface PollDeviceCodeResult {
  status: DeviceCodeStatus;
  accountUpn: string | null;
  scopesGranted: string[];
  error: { code: string; message: string } | null;
}

export function pollDeviceCodeFlow(sessionId: string): PollDeviceCodeResult {
  const session = SESSIONS.get(sessionId);
  if (!session) {
    return {
      status: "error",
      accountUpn: null,
      scopesGranted: [],
      error: { code: "SESSION_NOT_FOUND", message: "Unknown sessionId" },
    };
  }
  // Garbage-collect terminal sessions after 60s so the map doesn't grow.
  if (
    (session.status === "connected" ||
      session.status === "error" ||
      session.status === "expired") &&
    Date.now() - session.startedAt.getTime() > 60_000
  ) {
    SESSIONS.delete(sessionId);
  }
  return {
    status: session.status,
    accountUpn: session.result?.accountUpn ?? null,
    scopesGranted: session.result ? [...session.result.scopesGranted] : [],
    error: session.error,
  };
}

/** Test-only — drop all in-flight sessions. */
export function _resetDeviceCodeSessions(): void {
  SESSIONS.clear();
}
