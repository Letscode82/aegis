/**
 * @aegis/connectors — shared connector / OAuth framework (F-8).
 *
 * The provider-agnostic base for AEGIS's external integrations: one OAuth2
 * authorization-code implementation, a connector registry, and a token-store
 * seam. DMS sync (C-3), e-signature (C-5), and legal-authority research (C-4)
 * build on this rather than each wiring their own OAuth.
 *
 * This first slice is runtime-dependency-free and migration-free; the encrypted
 * token persistence (backed by `@aegis/db`) and per-provider descriptors arrive
 * in follow-up PRs behind these same interfaces.
 */
export type {
  ConnectorKind,
  ConnectorDescriptor,
  ConnectionStatus,
  OAuthConfig,
  OAuthHttp,
  TokenSet,
  TokenStore,
} from "./types.js";

export {
  DEFAULT_SKEW_MS,
  buildAuthorizeUrl,
  parseTokenResponse,
  exchangeCodeForToken,
  refreshAccessToken,
  tokenExpiresInMs,
  isTokenExpired,
  needsRefresh,
} from "./oauth.js";

export { ConnectorRegistry, connectorRegistry } from "./registry.js";
export { InMemoryTokenStore, getValidAccessToken } from "./token-store.js";
