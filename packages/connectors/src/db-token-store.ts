/**
 * Database-backed token store (F-8).
 *
 * The production implementation of the `TokenStore` seam: OAuth tokens
 * persisted per (organization, connectorId) in `OrgConnectorCredential`,
 * encrypted at rest. Dependencies are injected — a `prisma`-shaped client and
 * the `@aegis/db` crypto pair — so this package stays dependency-free and the
 * store is unit-testable with a fake client. `apps/web` wires the real prisma
 * singleton and `encryptSecret` / `decryptSecret`.
 */
import type { TokenSet, TokenStore } from "./types.js";

/** The subset of a `Bytes` column we read back. */
type StoredBytes = Buffer | Uint8Array;

/** One credential row, narrowed to the fields the store reads. */
export interface ConnectorCredentialRow {
  encryptedAccessToken: StoredBytes | null;
  encryptedRefreshToken: StoredBytes | null;
  tokenExpiresAt: Date | null;
  scopesGranted: string | null;
  tokenType: string | null;
}

/** The `prisma`-shaped surface the store needs (structural, not the real client). */
export interface ConnectorCredentialClient {
  orgConnectorCredential: {
    findUnique(args: {
      where: { organizationId_connectorId: { organizationId: string; connectorId: string } };
    }): Promise<ConnectorCredentialRow | null>;
    upsert(args: {
      where: { organizationId_connectorId: { organizationId: string; connectorId: string } };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }): Promise<unknown>;
    updateMany(args: {
      where: { organizationId: string; connectorId: string };
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
}

/** The `@aegis/db` crypto pair, injected so the package takes no hard dependency. */
export interface SecretCrypto {
  encryptSecret(plaintext: string): Buffer;
  decryptSecret(stored: StoredBytes): string;
}

export class DbTokenStore implements TokenStore {
  constructor(
    private readonly prisma: ConnectorCredentialClient,
    private readonly crypto: SecretCrypto,
  ) {}

  async get(organizationId: string, connectorId: string): Promise<TokenSet | null> {
    const row = await this.prisma.orgConnectorCredential.findUnique({
      where: { organizationId_connectorId: { organizationId, connectorId } },
    });
    if (!row || !row.encryptedAccessToken || !row.tokenExpiresAt) return null;
    return {
      accessToken: this.crypto.decryptSecret(row.encryptedAccessToken),
      refreshToken: row.encryptedRefreshToken ? this.crypto.decryptSecret(row.encryptedRefreshToken) : undefined,
      expiresAt: row.tokenExpiresAt.getTime(),
      scope: row.scopesGranted ?? undefined,
      tokenType: row.tokenType ?? undefined,
    };
  }

  async put(organizationId: string, connectorId: string, token: TokenSet): Promise<void> {
    const encryptedAccessToken = this.crypto.encryptSecret(token.accessToken);
    const encryptedRefreshToken = token.refreshToken ? this.crypto.encryptSecret(token.refreshToken) : null;
    const tokenExpiresAt = new Date(token.expiresAt);
    const common = {
      status: "connected",
      encryptedAccessToken,
      encryptedRefreshToken,
      tokenExpiresAt,
      tokenType: token.tokenType ?? null,
      scopesGranted: token.scope ?? null,
      lastRefreshedAt: new Date(),
      lastError: null,
    };
    await this.prisma.orgConnectorCredential.upsert({
      where: { organizationId_connectorId: { organizationId, connectorId } },
      create: { organizationId, connectorId, ...common },
      update: common,
    });
  }

  /** Clear the stored tokens and mark the connection disconnected (the row is kept for audit). */
  async delete(organizationId: string, connectorId: string): Promise<void> {
    await this.prisma.orgConnectorCredential.updateMany({
      where: { organizationId, connectorId },
      data: {
        status: "not_connected",
        encryptedAccessToken: null,
        encryptedRefreshToken: null,
        tokenExpiresAt: null,
        tokenType: null,
      },
    });
  }
}
