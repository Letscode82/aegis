/**
 * @aegis/esignature — e-signature (C-5).
 *
 * Connects OneLegal to the signing provider a legal department uses to execute
 * contracts (DocuSign, Adobe Acrobat Sign) through the shared F-8 OAuth
 * framework (`@aegis/connectors`). The Contracts module drives it to move a
 * `Contract` from APPROVED → EXECUTED, chain-sealing each step.
 *
 * Three layers, each independently testable:
 *   - `ESignatureProvider` seam + `HttpESignatureProvider` (real REST over F-8
 *     tokens) + `MockESignatureProvider` (zero-infra dev / CI, with lifecycle
 *     drivers that stand in for provider webhooks).
 *   - A pure, normalized envelope state machine (`envelope.ts`) — the Contracts
 *     execution gate depends on `isCompleted`, so its transitions are
 *     load-bearing.
 *   - Connector descriptors that register each provider's OAuth config in the
 *     F-8 registry.
 *
 * Like `@aegis/email`, this package is dependency-light and DB-free: callers
 * record the envelope outcome on the audit ledger and flip the contract state.
 * The production token store is `@aegis/connectors.DbTokenStore`, wired at the
 * app composition root; this package only asks for a resolved access token.
 */
export type {
  ESignatureProviderId,
  EnvelopeStatusValue,
  SignatureRecipient,
  EnvelopeDocument,
  CreateEnvelopeRequest,
  RecipientStatus,
  EnvelopeRef,
  EnvelopeStatus,
  SignedDocument,
  ESignatureProvider,
} from "./types.js";

export {
  TERMINAL_STATUSES,
  isTerminal,
  isCompleted,
  canTransition,
  assertTransition,
  normalizeStatus,
  validateCreateRequest,
  summarizeEnvelope,
  IllegalEnvelopeTransitionError,
  type EnvelopeSummary,
} from "./envelope.js";

export {
  ESIGNATURE_DEFAULT_SCOPES,
  ESIGNATURE_PROVIDER_IDS,
  esignatureOAuthEndpoints,
  esignatureOAuthConfig,
  esignatureConnectorDescriptor,
  registerESignatureConnectors,
  type ESignatureOAuthInput,
} from "./descriptors.js";

export { MockESignatureProvider } from "./mock-provider.js";

export {
  HttpESignatureProvider,
  ESignatureHttpError,
  docusignDialect,
  adobeSignDialect,
  type ESignatureDialect,
  type ESignRequest,
  type ESignFetch,
  type HttpESignatureProviderOptions,
} from "./http-provider.js";
