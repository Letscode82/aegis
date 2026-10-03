/**
 * In-memory token store (F-8).
 *
 * The zero-infra implementation of the `TokenStore` seam — backs tests and
 * local dev where no encrypted-persistence table exists yet. The production
 * store (encrypted rows via `@aegis/db` crypto) lands in the migration-bearing
 * follow-up PR and swaps in behind the same interface; no caller changes.
 */
import type { TokenSet, TokenStore } from "./types.js";

export class InMemoryTokenStore implements TokenStore {
  private readonly map = new Map<string, TokenSet>();

  private key(organizationId: string, connectorId: string): string {
    return `${organizationId}::${connectorId}`;
  }

  async get(organizationId: string, connectorId: string): Promise<TokenSet | null> {
    return this.map.get(this.key(organizationId, connectorId)) ?? null;
  }

  async put(organizationId: string, connectorId: string, token: TokenSet): Promise<void> {
    this.map.set(this.key(organizationId, connectorId), token);
  }

  async delete(organizationId: string, connectorId: string): Promise<void> {
    this.map.delete(this.key(organizationId, connectorId));
  }
}

/**
 * Return a valid access token for (org, connector), refreshing through the
 * provider when the stored one is within the skew window. Pure orchestration
 * over the injected store + refresh fn; the caller supplies both so this stays
 * free of provider and DB imports.
 */
export async function getValidAccessToken(args: {
  organizationId: string;
  connectorId: string;
  store: TokenStore;
  refresh: (refreshToken: string) => Promise<TokenSet>;
  needsRefresh: (token: TokenSet) => boolean;
}): Promise<string | null> {
  const current = await args.store.get(args.organizationId, args.connectorId);
  if (!current) return null;
  if (!args.needsRefresh(current)) return current.accessToken;
  if (!current.refreshToken) return null;
  const next = await args.refresh(current.refreshToken);
  // Providers often omit the refresh token on refresh — keep the prior one.
  const merged: TokenSet = { ...next, refreshToken: next.refreshToken ?? current.refreshToken };
  await args.store.put(args.organizationId, args.connectorId, merged);
  return merged.accessToken;
}
