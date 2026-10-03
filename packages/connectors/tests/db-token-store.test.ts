import { describe, it, expect } from "vitest";
import { DbTokenStore } from "../src/db-token-store.js";
import type { ConnectorCredentialClient, ConnectorCredentialRow, SecretCrypto } from "../src/db-token-store.js";
import type { TokenSet } from "../src/types.js";

/** Reversible "crypto" so tests can assert the stored bytes were transformed. */
const fakeCrypto: SecretCrypto = {
  encryptSecret: (s) => Buffer.from(`enc:${s}`, "utf8"),
  decryptSecret: (b) => Buffer.from(b).toString("utf8").replace(/^enc:/, ""),
};

/** A one-row fake of the prisma delegate keyed by (org, connectorId). */
function fakeClient(): ConnectorCredentialClient & { rows: Map<string, ConnectorCredentialRow> } {
  const rows = new Map<string, ConnectorCredentialRow>();
  const key = (o: string, c: string) => `${o}::${c}`;
  return {
    rows,
    orgConnectorCredential: {
      async findUnique({ where }) {
        return rows.get(key(where.organizationId_connectorId.organizationId, where.organizationId_connectorId.connectorId)) ?? null;
      },
      async upsert({ where, create, update }) {
        const k = key(where.organizationId_connectorId.organizationId, where.organizationId_connectorId.connectorId);
        const data = (rows.has(k) ? update : create) as unknown as ConnectorCredentialRow;
        rows.set(k, {
          encryptedAccessToken: (data.encryptedAccessToken as Buffer) ?? null,
          encryptedRefreshToken: (data.encryptedRefreshToken as Buffer) ?? null,
          tokenExpiresAt: (data.tokenExpiresAt as Date) ?? null,
          scopesGranted: (data.scopesGranted as string) ?? null,
          tokenType: (data.tokenType as string) ?? null,
        });
        return {};
      },
      async updateMany({ where, data }) {
        const k = key(where.organizationId, where.connectorId);
        const existing = rows.get(k);
        if (!existing) return { count: 0 };
        rows.set(k, {
          ...existing,
          encryptedAccessToken: (data.encryptedAccessToken as Buffer) ?? null,
          encryptedRefreshToken: (data.encryptedRefreshToken as Buffer) ?? null,
          tokenExpiresAt: (data.tokenExpiresAt as Date) ?? null,
          tokenType: (data.tokenType as string) ?? null,
        });
        return { count: 1 };
      },
    },
  };
}

const TOKEN: TokenSet = {
  accessToken: "access-123",
  refreshToken: "refresh-456",
  expiresAt: 1_900_000_000_000,
  scope: "read write",
  tokenType: "Bearer",
};

describe("DbTokenStore", () => {
  it("encrypts on put and round-trips on get", async () => {
    const client = fakeClient();
    const store = new DbTokenStore(client, fakeCrypto);
    await store.put("org1", "docusign", TOKEN);

    // Stored bytes are encrypted, not plaintext.
    const row = client.rows.get("org1::docusign")!;
    expect(Buffer.from(row.encryptedAccessToken!).toString("utf8")).toBe("enc:access-123");

    const got = await store.get("org1", "docusign");
    expect(got).toEqual(TOKEN);
  });

  it("returns null when there is no row or no access token", async () => {
    const client = fakeClient();
    const store = new DbTokenStore(client, fakeCrypto);
    expect(await store.get("org1", "none")).toBeNull();
  });

  it("omits the refresh token when none was stored", async () => {
    const client = fakeClient();
    const store = new DbTokenStore(client, fakeCrypto);
    await store.put("org1", "research", { accessToken: "a", expiresAt: 123, });
    const got = await store.get("org1", "research");
    expect(got?.refreshToken).toBeUndefined();
    expect(got?.accessToken).toBe("a");
  });

  it("delete clears the tokens so get returns null", async () => {
    const client = fakeClient();
    const store = new DbTokenStore(client, fakeCrypto);
    await store.put("org1", "imanage", TOKEN);
    await store.delete("org1", "imanage");
    expect(await store.get("org1", "imanage")).toBeNull();
  });
});
