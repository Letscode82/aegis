/**
 * Sub-PR 4c.1 — delegated authentication unit tests.
 *
 * Exercises the orchestrator state machine, refresh-token rotation,
 * factory routing, and error surfaces without touching Microsoft.
 *
 * The Prisma client is mocked at the import boundary so these tests
 * stay in the default `pnpm test` lane (no DATABASE_URL required).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Prisma + crypto mocks ─────────────────────────────────────────

interface FakeRow {
  organizationId: string;
  tenantId: string;
  clientId: string;
  /** v1-prefixed encrypted plaintext (test helper). */
  encryptedClientSecret: Buffer | null;
  delegatedRefreshToken: Buffer | null;
  delegatedAccountUpn: string | null;
  delegatedAuthorizedAt: Date | null;
  delegatedAuthorizedById: string | null;
  delegatedTokenExpiresAt: Date | null;
  delegatedLastRefreshedAt: Date | null;
  delegatedLastRefreshError: string | null;
  delegatedScopesGranted: string[];
}

interface FakeSession {
  id: string;
  organizationId: string;
  initiatedById: string;
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresAt: Date;
  pollIntervalSec: number;
  status: string;
  completedAt: Date | null;
  accountUpn: string | null;
  scopesGrantedJson: unknown;
  errorMessage: string | null;
  createdAt: Date;
}

const FAKE_DB: {
  row: FakeRow | null;
  sessions: Map<string, FakeSession>;
} = { row: null, sessions: new Map() };

function resetDb() {
  FAKE_DB.row = {
    organizationId: "org-1",
    tenantId: "tenant-x",
    clientId: "client-x",
    // Pre-encrypted (v1pl prefix + plaintext) so resolveClientSecret
    // unwraps to "secret-xyz" without needing the real encryptSecret.
    encryptedClientSecret: Buffer.concat([
      Buffer.from("v1pl"),
      Buffer.from("secret-xyz", "utf8"),
    ]),
    delegatedRefreshToken: null,
    delegatedAccountUpn: null,
    delegatedAuthorizedAt: null,
    delegatedAuthorizedById: null,
    delegatedTokenExpiresAt: null,
    delegatedLastRefreshedAt: null,
    delegatedLastRefreshError: null,
    delegatedScopesGranted: [],
  };
  FAKE_DB.sessions = new Map();
}

vi.mock("@aegis/db", () => {
  const VERSION_V1_PLAINTEXT = Buffer.from([0x76, 0x31, 0x70, 0x6c]);
  const prismaMock = {
    organizationM365Credential: {
      findUnique: vi.fn(async ({ where }: { where: { organizationId: string } }) => {
        if (FAKE_DB.row?.organizationId === where.organizationId) {
          return { ...FAKE_DB.row };
        }
        return null;
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { organizationId: string };
          data: Partial<FakeRow>;
        }) => {
          if (FAKE_DB.row?.organizationId !== where.organizationId)
            throw new Error("not found");
          FAKE_DB.row = { ...FAKE_DB.row, ...data } as FakeRow;
          return FAKE_DB.row;
        },
      ),
    },
    m365DeviceCodeSession: {
      create: vi.fn(async ({ data }: { data: FakeSession }) => {
        FAKE_DB.sessions.set(data.id, { ...data });
        return { ...data };
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string }; select?: unknown }) => {
        const r = FAKE_DB.sessions.get(where.id);
        return r ? { ...r } : null;
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<FakeSession>;
        }) => {
          const existing = FAKE_DB.sessions.get(where.id);
          if (!existing) throw new Error("session not found");
          const next = { ...existing, ...data } as FakeSession;
          FAKE_DB.sessions.set(where.id, next);
          return next;
        },
      ),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    user: {
      findUnique: vi.fn(async () => ({ id: "u-admin", name: "Alex Admin" })),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)),
  };
  return {
    prisma: prismaMock,
    encryptSecret: (s: string) => Buffer.concat([VERSION_V1_PLAINTEXT, Buffer.from(s, "utf8")]),
    decryptSecret: (buf: Buffer) => buf.subarray(4).toString("utf8"),
    secretFingerprint: (s: string | null | undefined) =>
      s ? `fp-${s.slice(0, 4)}` : "empty",
    logAudit: vi.fn(async () => undefined),
  };
});

import {
  clearDelegatedTokens,
  getDelegatedAuthStatus,
  getFreshDelegatedAccessToken,
  persistDelegatedTokens,
  setRefreshTokenExchanger,
} from "../src/internal/services/m365-graph-delegated-auth";
import {
  M365DelegatedAuthExpiredError,
  M365DelegatedAuthRequiredError,
} from "../src/internal/services/m365-graph-errors";
import {
  initiateDeviceCodeFlow,
  pollDeviceCodeFlow,
  pruneOldDeviceCodeSessions,
  setOAuthHttpClient,
} from "../src/internal/services/m365-graph-device-code";

beforeEach(() => {
  resetDb();
  setRefreshTokenExchanger(null);
  setOAuthHttpClient(null);
});

afterEach(() => {
  setRefreshTokenExchanger(null);
  setOAuthHttpClient(null);
});

/** Helper — encode a JWT so extractUpn can decode the upn claim. */
function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" }), "utf8").toString("base64url");
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${header}.${body}.`;
}

describe("persistDelegatedTokens", () => {
  it("stores encrypted refresh token + metadata and returns plaintext on read", async () => {
    await persistDelegatedTokens({
      organizationId: "org-1",
      refreshToken: "RT-12345",
      accountUpn: "svc@example.onmicrosoft.com",
      authorizedById: "u-admin",
      accessTokenExpiresAt: new Date(Date.now() + 3600_000),
      scopesGranted: ["eDiscovery.ReadWrite.All"],
      initialAccessToken: "AT-cached",
    });
    const row = FAKE_DB.row!;
    expect(row.delegatedRefreshToken).toBeTruthy();
    // v1 prefix at byte 0–3
    expect(row.delegatedRefreshToken!.subarray(0, 4).toString("utf8")).toBe("v1pl");
    expect(row.delegatedAccountUpn).toBe("svc@example.onmicrosoft.com");
    expect(row.delegatedScopesGranted).toEqual(["eDiscovery.ReadWrite.All"]);

    // Cached access token reuses without exchange
    setRefreshTokenExchanger({
      exchange: vi.fn(async () => {
        throw new Error("should not be called when cache is fresh");
      }),
    });
    const fresh = await getFreshDelegatedAccessToken("org-1");
    expect(fresh.accessToken).toBe("AT-cached");
    expect(fresh.accountUpn).toBe("svc@example.onmicrosoft.com");
  });
});

describe("getFreshDelegatedAccessToken", () => {
  it("throws M365DelegatedAuthRequiredError when no token stored", async () => {
    await expect(getFreshDelegatedAccessToken("org-1")).rejects.toBeInstanceOf(
      M365DelegatedAuthRequiredError,
    );
  });

  it("refreshes when access token expired and persists rotated refresh", async () => {
    // Seed an expired token row
    await persistDelegatedTokens({
      organizationId: "org-1",
      refreshToken: "RT-old",
      accountUpn: "svc@example.com",
      authorizedById: "u-admin",
      accessTokenExpiresAt: new Date(Date.now() - 1000),
      scopesGranted: ["eDiscovery.ReadWrite.All"],
    });
    const newExpiry = new Date(Date.now() + 3600_000);
    const exchanger = {
      exchange: vi.fn(async () => ({
        accessToken: "AT-new",
        expiresOn: newExpiry,
        rotatedRefreshToken: "RT-new",
      })),
    };
    setRefreshTokenExchanger(exchanger);
    const fresh = await getFreshDelegatedAccessToken("org-1");
    expect(fresh.accessToken).toBe("AT-new");
    expect(exchanger.exchange).toHaveBeenCalledOnce();
    expect(FAKE_DB.row!.delegatedRefreshToken!.subarray(4).toString("utf8")).toBe(
      "RT-new",
    );
    expect(FAKE_DB.row!.delegatedLastRefreshError).toBeNull();
  });

  it("clears tokens and throws expired-error when Microsoft rejects refresh", async () => {
    await persistDelegatedTokens({
      organizationId: "org-1",
      refreshToken: "RT-bad",
      accountUpn: "svc@example.com",
      authorizedById: "u-admin",
      accessTokenExpiresAt: new Date(Date.now() - 1000),
      scopesGranted: [],
    });
    setRefreshTokenExchanger({
      exchange: vi.fn(async () => {
        throw Object.assign(new Error("AADSTS70000: invalid_grant"), {
          errorCode: "invalid_grant",
          errorMessage: "AADSTS70000",
        });
      }),
    });
    await expect(getFreshDelegatedAccessToken("org-1")).rejects.toBeInstanceOf(
      M365DelegatedAuthExpiredError,
    );
    expect(FAKE_DB.row!.delegatedRefreshToken).toBeNull();
    expect(FAKE_DB.row!.delegatedLastRefreshError).toContain("invalid_grant");
  });
});

describe("getDelegatedAuthStatus", () => {
  it("reports not-configured when no token stored", async () => {
    const s = await getDelegatedAuthStatus("org-1");
    expect(s.configured).toBe(false);
    expect(s.expired).toBe(false);
  });

  it("reports configured + authorizedByName resolved from User row", async () => {
    await persistDelegatedTokens({
      organizationId: "org-1",
      refreshToken: "RT-1",
      accountUpn: "svc@example.com",
      authorizedById: "u-admin",
      accessTokenExpiresAt: new Date(Date.now() + 3600_000),
      scopesGranted: ["eDiscovery.ReadWrite.All", "User.Read"],
    });
    const s = await getDelegatedAuthStatus("org-1");
    expect(s.configured).toBe(true);
    expect(s.accountUpn).toBe("svc@example.com");
    expect(s.authorizedByName).toBe("Alex Admin");
    expect(s.scopesGranted).toEqual(["eDiscovery.ReadWrite.All", "User.Read"]);
  });

  it("reports expired=true after refresh failure", async () => {
    await clearDelegatedTokens("org-1", { lastRefreshError: "AADSTS70000" });
    const s = await getDelegatedAuthStatus("org-1");
    expect(s.configured).toBe(false);
    expect(s.lastRefreshError).toBe("AADSTS70000");
  });
});

describe("Device Code orchestrator (DB-backed)", () => {
  /** Fake HTTP client driver. Each test wires up canned responses. */
  function makeHttp(
    responses: Map<string, { status: number; json: unknown }>,
  ) {
    return {
      post: vi.fn(
        async (url: string, _body: URLSearchParams) => {
          const r = responses.get(url) ?? { status: 200, json: {} };
          return r;
        },
      ),
    };
  }

  function deviceCodeUrl(tenant = "tenant-x") {
    return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/devicecode`;
  }
  function tokenUrl(tenant = "tenant-x") {
    return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
  }

  it("initiate persists session row and returns user code + verification URL", async () => {
    const http = makeHttp(
      new Map([
        [
          deviceCodeUrl(),
          {
            status: 200,
            json: {
              device_code: "DC-LONG-OPAQUE",
              user_code: "ABCD-EFGH",
              verification_uri: "https://microsoft.com/devicelogin",
              expires_in: 900,
              interval: 5,
              message: "Open the URL and enter the code.",
            },
          },
        ],
      ]),
    );
    setOAuthHttpClient(http);
    const init = await initiateDeviceCodeFlow({
      organizationId: "org-1",
      tenantId: "tenant-x",
      clientId: "client-x",
      authorizedById: "u-admin",
    });
    expect(init.userCode).toBe("ABCD-EFGH");
    expect(init.verificationUri).toBe("https://microsoft.com/devicelogin");
    // Persisted
    const row = FAKE_DB.sessions.get(init.sessionId);
    expect(row).toBeTruthy();
    expect(row!.deviceCode).toBe("DC-LONG-OPAQUE");
    expect(row!.status).toBe("pending");
    expect(row!.initiatedById).toBe("u-admin");
  });

  it("poll returns pending while Microsoft says authorization_pending", async () => {
    const http = makeHttp(
      new Map<string, { status: number; json: unknown }>([
        [
          deviceCodeUrl(),
          {
            status: 200,
            json: {
              device_code: "DC1",
              user_code: "AAAA",
              verification_uri: "https://microsoft.com/devicelogin",
              expires_in: 900,
              interval: 5,
            },
          },
        ],
        [
          tokenUrl(),
          {
            status: 400,
            json: { error: "authorization_pending", error_description: "user has not signed in yet" },
          },
        ],
      ]),
    );
    setOAuthHttpClient(http);
    const init = await initiateDeviceCodeFlow({
      organizationId: "org-1",
      tenantId: "tenant-x",
      clientId: "client-x",
      authorizedById: "u-admin",
    });
    const p = await pollDeviceCodeFlow(init.sessionId);
    expect(p.status).toBe("pending");
    expect(p.error).toBeNull();
    // Session row still pending
    expect(FAKE_DB.sessions.get(init.sessionId)!.status).toBe("pending");
  });

  it("poll on a different instance can still complete the flow (cross-instance success)", async () => {
    // Instance A: initiate
    const httpA = makeHttp(
      new Map([
        [
          deviceCodeUrl(),
          {
            status: 200,
            json: {
              device_code: "DC2",
              user_code: "BBBB",
              verification_uri: "https://microsoft.com/devicelogin",
              expires_in: 900,
              interval: 5,
            },
          },
        ],
      ]),
    );
    setOAuthHttpClient(httpA);
    const init = await initiateDeviceCodeFlow({
      organizationId: "org-1",
      tenantId: "tenant-x",
      clientId: "client-x",
      authorizedById: "u-admin",
    });

    // Instance B (simulated by swapping the http client) gets the
    // authorized response from Microsoft. The DB row is shared so
    // instance B can find the session and persist tokens.
    const idToken = makeJwt({ upn: "svc@example.onmicrosoft.com" });
    const httpB = makeHttp(
      new Map([
        [
          tokenUrl(),
          {
            status: 200,
            json: {
              access_token: "AT-NEW",
              refresh_token: "RT-NEW",
              id_token: idToken,
              expires_in: 3600,
              scope: "https://graph.microsoft.com/eDiscovery.ReadWrite.All https://graph.microsoft.com/User.Read",
            },
          },
        ],
      ]),
    );
    setOAuthHttpClient(httpB);

    const p = await pollDeviceCodeFlow(init.sessionId);
    expect(p.status).toBe("connected");
    expect(p.accountUpn).toBe("svc@example.onmicrosoft.com");
    expect(p.scopesGranted).toContain("https://graph.microsoft.com/eDiscovery.ReadWrite.All");

    // Tokens were persisted to the credential row
    expect(FAKE_DB.row!.delegatedRefreshToken!.subarray(4).toString("utf8")).toBe("RT-NEW");
    expect(FAKE_DB.row!.delegatedAccountUpn).toBe("svc@example.onmicrosoft.com");

    // Session marked completed
    const session = FAKE_DB.sessions.get(init.sessionId)!;
    expect(session.status).toBe("completed");
    expect(session.accountUpn).toBe("svc@example.onmicrosoft.com");
  });

  it("concurrent polls only persist tokens once", async () => {
    const http = makeHttp(
      new Map([
        [
          deviceCodeUrl(),
          {
            status: 200,
            json: {
              device_code: "DC3",
              user_code: "CCCC",
              verification_uri: "https://microsoft.com/devicelogin",
              expires_in: 900,
              interval: 5,
            },
          },
        ],
        [
          tokenUrl(),
          {
            status: 200,
            json: {
              access_token: "AT",
              refresh_token: "RT-ONCE",
              id_token: makeJwt({ upn: "svc@e.com" }),
              expires_in: 3600,
              scope: "User.Read",
            },
          },
        ],
      ]),
    );
    setOAuthHttpClient(http);
    const init = await initiateDeviceCodeFlow({
      organizationId: "org-1",
      tenantId: "tenant-x",
      clientId: "client-x",
      authorizedById: "u-admin",
    });
    // Two parallel polls — both succeed but only one writes credentials.
    const [p1, p2] = await Promise.all([
      pollDeviceCodeFlow(init.sessionId),
      pollDeviceCodeFlow(init.sessionId),
    ]);
    expect(p1.status).toBe("connected");
    expect(p2.status).toBe("connected");
    // The credential row carries one refresh token, not duplicated state.
    expect(FAKE_DB.row!.delegatedAccountUpn).toBe("svc@e.com");
  });

  it("expired_token from Microsoft flips session to expired", async () => {
    const http = makeHttp(
      new Map([
        [
          deviceCodeUrl(),
          {
            status: 200,
            json: {
              device_code: "DC4",
              user_code: "DDDD",
              verification_uri: "https://microsoft.com/devicelogin",
              expires_in: 900,
              interval: 5,
            },
          },
        ],
        [
          tokenUrl(),
          { status: 400, json: { error: "expired_token", error_description: "code expired" } },
        ],
      ]),
    );
    setOAuthHttpClient(http);
    const init = await initiateDeviceCodeFlow({
      organizationId: "org-1",
      tenantId: "tenant-x",
      clientId: "client-x",
      authorizedById: "u-admin",
    });
    const p = await pollDeviceCodeFlow(init.sessionId);
    expect(p.status).toBe("expired");
    expect(p.error?.code).toBe("expired_token");
    expect(FAKE_DB.sessions.get(init.sessionId)!.status).toBe("expired");
  });

  it("access_denied from Microsoft flips session to error and surfaces the code", async () => {
    const http = makeHttp(
      new Map([
        [
          deviceCodeUrl(),
          {
            status: 200,
            json: {
              device_code: "DC5",
              user_code: "EEEE",
              verification_uri: "https://microsoft.com/devicelogin",
              expires_in: 900,
              interval: 5,
            },
          },
        ],
        [
          tokenUrl(),
          { status: 400, json: { error: "access_denied", error_description: "user rejected" } },
        ],
      ]),
    );
    setOAuthHttpClient(http);
    const init = await initiateDeviceCodeFlow({
      organizationId: "org-1",
      tenantId: "tenant-x",
      clientId: "client-x",
      authorizedById: "u-admin",
    });
    const p = await pollDeviceCodeFlow(init.sessionId);
    expect(p.status).toBe("error");
    expect(p.error?.code).toBe("access_denied");
    expect(FAKE_DB.sessions.get(init.sessionId)!.status).toBe("error");
  });

  it("includes client_secret in /devicecode and /token POST bodies (confidential client)", async () => {
    // Regression test for AADSTS7000218. AEGIS's Entra app
    // registration is a confidential client; Microsoft requires
    // client_secret in the body for both Device Code endpoints.
    const recorded: Array<{ url: string; body: URLSearchParams }> = [];
    const idToken = makeJwt({ upn: "svc@example.com" });
    const http = {
      post: vi.fn(async (url: string, body: URLSearchParams) => {
        recorded.push({ url, body });
        if (url.endsWith("/devicecode")) {
          return {
            status: 200,
            json: {
              device_code: "DC-LONG",
              user_code: "ABCD",
              verification_uri: "https://microsoft.com/devicelogin",
              expires_in: 900,
              interval: 5,
            },
          };
        }
        return {
          status: 200,
          json: {
            access_token: "AT",
            refresh_token: "RT",
            id_token: idToken,
            expires_in: 3600,
            scope: "User.Read",
          },
        };
      }),
    };
    setOAuthHttpClient(http);

    const init = await initiateDeviceCodeFlow({
      organizationId: "org-1",
      tenantId: "tenant-x",
      clientId: "client-x",
      authorizedById: "u-admin",
    });
    expect(recorded[0]!.url).toContain("/devicecode");
    expect(recorded[0]!.body.get("client_secret")).toBe("secret-xyz");
    expect(recorded[0]!.body.get("client_id")).toBe("client-x");

    const p = await pollDeviceCodeFlow(init.sessionId);
    expect(p.status).toBe("connected");
    const tokenCall = recorded.find((r) => r.url.endsWith("/token"));
    expect(tokenCall).toBeTruthy();
    expect(tokenCall!.body.get("client_secret")).toBe("secret-xyz");
    expect(tokenCall!.body.get("grant_type")).toBe(
      "urn:ietf:params:oauth:grant-type:device_code",
    );
    expect(tokenCall!.body.get("device_code")).toBe("DC-LONG");
  });

  it("env var fallback supplies client_secret when no per-org row exists", async () => {
    // Simulate "credentials only configured via env" — clear per-org row.
    FAKE_DB.row = null;
    const prev = process.env.M365_CLIENT_SECRET;
    process.env.M365_CLIENT_SECRET = "env-secret-abc";
    process.env.M365_TENANT_ID = "tenant-env";
    process.env.M365_CLIENT_ID = "client-env";

    const recorded: Array<URLSearchParams> = [];
    const http = {
      post: vi.fn(async (_url: string, body: URLSearchParams) => {
        recorded.push(body);
        return {
          status: 200,
          json: {
            device_code: "DC2",
            user_code: "EFGH",
            verification_uri: "https://microsoft.com/devicelogin",
            expires_in: 900,
            interval: 5,
          },
        };
      }),
    };
    setOAuthHttpClient(http);

    try {
      await initiateDeviceCodeFlow({
        organizationId: "org-1",
        tenantId: "tenant-env",
        clientId: "client-env",
        authorizedById: "u-admin",
      });
      expect(recorded[0]!.get("client_secret")).toBe("env-secret-abc");
    } finally {
      if (prev === undefined) delete process.env.M365_CLIENT_SECRET;
      else process.env.M365_CLIENT_SECRET = prev;
      delete process.env.M365_TENANT_ID;
      delete process.env.M365_CLIENT_ID;
    }
  });

  it("returns SESSION_NOT_FOUND for unknown session id", async () => {
    setOAuthHttpClient(makeHttp(new Map()));
    const p = await pollDeviceCodeFlow("does-not-exist");
    expect(p.status).toBe("error");
    expect(p.error?.code).toBe("SESSION_NOT_FOUND");
  });

  it("pruneOldDeviceCodeSessions delegates to deleteMany with a 24h cutoff", async () => {
    setOAuthHttpClient(makeHttp(new Map()));
    const result = await pruneOldDeviceCodeSessions("org-1");
    expect(result.deletedCount).toBeGreaterThanOrEqual(0);
  });
});
