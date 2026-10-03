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
export { DbTokenStore } from "./db-token-store.js";
export type { ConnectorCredentialRow, ConnectorCredentialClient, SecretCrypto } from "./db-token-store.js";

// C-4 — legal-authority research layer (caselaw / statute / EDGAR / EUR-Lex).
export type {
  LegalAuthority,
  ResearchQuery,
  ResearchHttp,
  ResearchProvider,
  ResearchProviderContext,
  ProviderStatus,
  ResearchResult,
} from "./research.js";
export {
  runResearch,
  selectProviders,
  defaultResearchProviders,
  courtListenerProvider,
  govInfoProvider,
  edgarProvider,
  eurLexProvider,
  buildSparql,
} from "./research.js";

// Microsoft 365 connector descriptors (C-1 Word add-in, C-2 Outlook triage).
export {
  OFFICE_WORD_CONNECTOR_ID,
  OUTLOOK_CONNECTOR_ID,
  OFFICE_WORD_SCOPES,
  OUTLOOK_SCOPES,
  microsoftAuthorizeUrl,
  microsoftTokenUrl,
  microsoftOAuthConfig,
  microsoftConnectorDescriptor,
  officeWordDescriptor,
  outlookDescriptor,
  type MicrosoftConnectorOptions,
} from "./office.js";
