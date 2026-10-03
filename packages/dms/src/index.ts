/**
 * @aegis/dms — Document Management System sync (C-3).
 *
 * Connects AEGIS to the external DMS a legal department already runs as its
 * system of record (iManage, NetDocuments, SharePoint) through the shared F-8
 * OAuth framework (`@aegis/connectors`), and reconciles its documents against
 * the shared `Document` entity so "one brain" sees the firm's real paper.
 *
 * Three layers, each independently testable:
 *   - `DmsProvider` seam + `HttpDmsProvider` (real REST over F-8 tokens) +
 *     `MockDmsProvider` (zero-infra dev / CI).
 *   - A pure, deterministic reconciliation planner (`planSync`) that flags
 *     two-sided edits as conflicts instead of clobbering either side.
 *   - Connector descriptors that register each provider's OAuth config in the
 *     F-8 registry.
 *
 * Like `@aegis/email`, this package is dependency-light and DB-free: callers
 * apply the plan (writing `Document` rows) and chain-seal each action on the
 * audit ledger. The production token store is `@aegis/connectors.DbTokenStore`,
 * wired at the app composition root; this package only asks for a resolved
 * access token.
 */
export type {
  DmsProviderId,
  DmsFolderRef,
  DmsDocument,
  DmsDownload,
  DmsUpload,
  DmsListOptions,
  DmsListResult,
  DmsProvider,
} from "./types.js";

export {
  planSync,
  isMutatingAction,
  type SyncLink,
  type SyncAction,
  type ConflictReason,
  type SyncPlan,
  type PlanSyncInput,
} from "./sync.js";

export {
  DMS_DEFAULT_SCOPES,
  DMS_PROVIDER_IDS,
  dmsOAuthEndpoints,
  dmsOAuthConfig,
  dmsConnectorDescriptor,
  registerDmsConnectors,
  type DmsOAuthInput,
} from "./descriptors.js";

export { MockDmsProvider, type MockDmsSeed } from "./mock-provider.js";

export {
  HttpDmsProvider,
  DmsHttpError,
  sharePointDialect,
  imanageDialect,
  netDocumentsDialect,
  type DmsDialect,
  type DmsRequest,
  type DmsFetch,
  type HttpDmsProviderOptions,
} from "./http-provider.js";
