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
  delegatedRefreshToken: Buffer | null;
  delegatedAccountUpn: string | null;
  delegatedAuthorizedAt: Date | null;
  delegatedAuthorizedById: string | null;
  delegatedTokenExpiresAt: Date | null;
  delegatedLastRefreshedAt: Date | null;
  delegatedLastRefreshError: string | null;
  delegatedScopesGranted: string[];
}

const FAKE_DB: { row: FakeRow | null } = { row: null };

function resetDb() {
  FAKE_DB.row = {
    organizationId: "org-1",
    tenantId: "tenant-x",
    clientId: "client-x",
    delegatedRefreshToken: null,
    delegatedAccountUpn: null,
    delegatedAuthorizedAt: null,
    delegatedAuthorizedById: null,
    delegatedTokenExpiresAt: null,
    delegatedLastRefreshedAt: null,
    delegatedLastRefreshError: null,
    delegatedScopesGranted: [],
  };
}

vi.mock("@aegis/db", () => {
  const VERSION_V1_PLAINTEXT = Buffer.from([0x76, 0x31, 0x70, 0x6c]);
  return {
    prisma: {
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
      user: {
        findUnique: vi.fn(async () => ({ id: "u-admin", name: "Alex Admin" })),
      },
    },
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
  _resetDeviceCodeSessions,
  initiateDeviceCodeFlow,
  pollDeviceCodeFlow,
  setDeviceCodeFactory,
} from "../src/internal/services/m365-graph-device-code";

beforeEach(() => {
  resetDb();
  setRefreshTokenExchanger(null);
  setDeviceCodeFactory(null);
  _resetDeviceCodeSessions();
});

afterEach(() => {
  setRefreshTokenExchanger(null);
  setDeviceCodeFactory(null);
});

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

describe("Device Code orchestrator", () => {
  it("transitions pending → connected on factory success", async () => {
    let resolveComplete!: (
      r: import("../src/internal/services/m365-graph-device-code").DeviceCodeResult,
    ) => void;
    const completePromise = new Promise<
      import("../src/internal/services/m365-graph-device-code").DeviceCodeResult
    >((res) => {
      resolveComplete = res;
    });
    setDeviceCodeFactory({
      async start() {
        return {
          prompt: {
            userCode: "ABCD-EFGH",
            verificationUri: "https://microsoft.com/devicelogin",
            expiresOn: new Date(Date.now() + 900_000),
            message: "Open the URL and enter the code…",
          },
          complete: completePromise,
        };
      },
    });
    const initiate = await initiateDeviceCodeFlow({
      organizationId: "org-1",
      tenantId: "tenant-x",
      clientId: "client-x",
      authorizedById: "u-admin",
    });
    expect(initiate.userCode).toBe("ABCD-EFGH");
    expect(initiate.verificationUri).toBe("https://microsoft.com/devicelogin");

    // Initial poll — pending
    const p1 = pollDeviceCodeFlow(initiate.sessionId);
    expect(p1.status).toBe("pending");

    // Resolve completion
    resolveComplete({
      accessToken: "AT-1",
      refreshToken: "RT-1",
      accountUpn: "svc@example.com",
      expiresOn: new Date(Date.now() + 3600_000),
      scopesGranted: ["eDiscovery.ReadWrite.All", "User.Read"],
    });
    // Allow microtask queue to flush the promise persistence chain.
    await new Promise((resolve) => setImmediate(resolve));

    const p2 = pollDeviceCodeFlow(initiate.sessionId);
    expect(p2.status).toBe("connected");
    expect(p2.accountUpn).toBe("svc@example.com");
    expect(p2.scopesGranted).toContain("eDiscovery.ReadWrite.All");
    // Token persisted
    expect(FAKE_DB.row!.delegatedAccountUpn).toBe("svc@example.com");
  });

  it("transitions to expired on expired_token error", async () => {
    setDeviceCodeFactory({
      async start() {
        return {
          prompt: {
            userCode: "WXYZ",
            verificationUri: "https://microsoft.com/devicelogin",
            expiresOn: new Date(Date.now() + 900_000),
            message: "",
          },
          complete: Promise.reject(
            Object.assign(new Error("expired"), {
              errorCode: "expired_token",
              message: "Device code expired",
            }),
          ),
        };
      },
    });
    const init = await initiateDeviceCodeFlow({
      organizationId: "org-1",
      tenantId: "t",
      clientId: "c",
      authorizedById: null,
    });
    await new Promise((resolve) => setImmediate(resolve));
    const p = pollDeviceCodeFlow(init.sessionId);
    expect(p.status).toBe("expired");
    expect(p.error?.code).toBe("expired_token");
  });

  it("returns SESSION_NOT_FOUND for unknown session id", () => {
    const p = pollDeviceCodeFlow("does-not-exist");
    expect(p.status).toBe("error");
    expect(p.error?.code).toBe("SESSION_NOT_FOUND");
  });
});
