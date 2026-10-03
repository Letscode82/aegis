/**
 * Connector framework types (F-8).
 *
 * A connector is an external system AEGIS reaches on behalf of an org through
 * OAuth2 — a document store (iManage, NetDocuments, SharePoint), an e-signature
 * provider (DocuSign, Adobe), or a legal-research source. Every connector shares
 * the same auth shape, the same token-store seam, and the same registry so the
 * surfaces that consume them (C-1/C-3/C-4/C-5) never re-implement OAuth.
 *
 * This module is pure types — no runtime, no dependencies.
 */

/** The categories of external system a connector can front. */
export type ConnectorKind = "dms" | "esignature" | "research" | "email" | "other";

/** Per-provider OAuth2 configuration (authorization-code flow). */
export interface OAuthConfig {
  /** Provider authorize endpoint (where the user grants consent). */
  authorizeUrl: string;
  /** Provider token endpoint (code→token and refresh exchanges). */
  tokenUrl: string;
  clientId: string;
  /** Omitted for public clients using PKCE. */
  clientSecret?: string;
  /** Redirect back into AEGIS after consent. */
  redirectUri: string;
  /** Scopes requested at authorize time. */
  scopes: string[];
  /** Use PKCE (public clients / providers that require it). */
  usePkce?: boolean;
}

/** A resolved OAuth token set, normalized across providers. */
export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  /** Absolute expiry as epoch milliseconds (derived from `expires_in`). */
  expiresAt: number;
  /** Space-delimited scopes the provider actually granted, if returned. */
  scope?: string;
  tokenType?: string;
}

/**
 * Pluggable HTTP seam for the token endpoint. Mirrors the pattern the M365
 * device-code service uses so callers can inject a stub in tests and the real
 * `fetch` in production.
 */
export type OAuthHttp = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string },
) => Promise<{ status: number; json: () => Promise<unknown>; text: () => Promise<string> }>;

/** A connector's static descriptor, held in the registry. */
export interface ConnectorDescriptor {
  /** Stable id, e.g. "docusign", "imanage". */
  id: string;
  /** Human label for the admin UI. */
  label: string;
  kind: ConnectorKind;
  /** Build the OAuth config for a given org (secrets resolved by the caller). */
  oauth: OAuthConfig;
}

/** Lifecycle state of one org's connection to a connector. */
export type ConnectionStatus = "not_connected" | "connected" | "expired" | "error";

/**
 * Persistence seam for encrypted tokens. The real implementation (a later,
 * migration-bearing PR) stores tokens encrypted via `@aegis/db` crypto keyed by
 * (organizationId, connectorId); the in-memory implementation backs tests and
 * zero-infra dev.
 */
export interface TokenStore {
  get(organizationId: string, connectorId: string): Promise<TokenSet | null>;
  put(organizationId: string, connectorId: string, token: TokenSet): Promise<void>;
  delete(organizationId: string, connectorId: string): Promise<void>;
}
