/**
 * @aegis/privacy — Privacy & Compliance Operations (module #10).
 *
 * PUBLIC SURFACE. The only file other modules and the app may import from.
 * Internal services + UI live under `src/internal` / `src/ui` and are private
 * (module-isolation rule).
 *
 * PRIV-1 ships DSAR case handling end-to-end: centralized request management,
 * identity verification, ROPA-seeded personal-data inventory, AI-assisted
 * relevance review with a human validation gate (the aiR analog), the
 * erasure ↔ legal-hold conflict guard (the "one brain" join into Matter),
 * response assembly + login-less delivery, a self-service data-subject portal,
 * an operations dashboard, an SLA breach sweep, and a chain-sealed
 * defensibility export. ROPA / consent / incidents extend this same module
 * in later PRs — never a 12th module.
 */

// Lifecycle
export {
  createDsarRequest,
  listDsarRequests,
  getDsarDetail,
  assignDsar,
  updateDsarFields,
  transitionDsar,
  extendDsarDeadline,
  DsarErasureHoldConflictError,
  type Actor,
  type CreateDsarInput,
  type ListDsarFilters,
  type DsarSummaryDTO,
  type DsarDetailDTO,
  type TransitionDsarInput,
  type UpdateDsarFieldsInput,
} from "./src/internal/requests";

// State machine (shared with the UI stepper)
export {
  DSAR_STAGES,
  TERMINAL_STATUSES,
  isTerminal,
  allowedTransitions,
  canTransition,
  assertTransition,
  stageIndex,
  IllegalDsarTransitionError,
  type DsarStageMeta,
} from "./src/internal/state-machine";

// SLA math
export {
  statutoryWindow,
  computeSlaDeadline,
  computeExtendedDeadline,
  slaState,
  type StatutoryWindow,
  type SlaState,
  type SlaUrgency,
} from "./src/internal/sla";

// Identity verification
export { recordDsarVerification, type RecordVerificationInput } from "./src/internal/verification";

// Personal-data inventory
export {
  listDataLocations,
  addDataLocation,
  updateDataLocation,
  seedInventoryFromRopa,
  discoverM365DataLocations,
  mapEnumeratedSource,
  type DataLocationDTO,
  type AddDataLocationInput,
  type UpdateDataLocationInput,
  type SeedInventoryResult,
  type DiscoverM365Result,
} from "./src/internal/data-inventory";

// AI relevance review
export {
  listReviewItems,
  addReviewItems,
  runRelevanceReview,
  validateReviewItem,
  summarizeReview,
  type ReviewItemDTO,
  type AddReviewItemInput,
  type RelevanceReviewResult,
  type ValidateReviewItemInput,
  type ReviewProgress,
} from "./src/internal/review";

// M365 / Purview collection (connect to your E5 tenant + search the subject)
export {
  collectFromM365,
  previewM365Collection,
  draftDsarCollectionQuery,
  getDsarM365Status,
  collectionKey,
  summarizeHits,
  ALL_SOURCE_TYPES,
  type CollectFromM365Input,
  type CollectFromM365Result,
  type CollectionPreview,
  type SourceBucket,
  type DraftDsarQueryResult,
} from "./src/internal/collection";

// Deterministic relevance scorer (pure)
export { scoreRelevanceDeterministic, verdictFromScore, tokenize, type RelevanceInput, type RelevanceResult } from "./src/internal/relevance";

// Erasure ↔ legal-hold conflict guard
export { checkErasureHoldConflict, overrideHoldConflict, type HoldConflictResult } from "./src/internal/hold-guard";

// Response assembly + delivery
export {
  assembleResponsePackage,
  buildResponsePackage,
  deliverDsar,
  DsarDeliveryBlockedError,
  type ResponsePackage,
  type ResponsePackageItem,
  type DeliverDsarInput,
  type DeliverDsarResult,
} from "./src/internal/delivery";

// Self-service portal
export {
  mintDsarAccessToken,
  resolveDsarPortal,
  submitPortalRequest,
  type PortalView,
  type SubmitPortalRequestInput,
} from "./src/internal/portal";

// Operations dashboard
export { getDsarDashboard, aggregateDashboard, type DsarDashboard, type DashboardRow } from "./src/internal/dashboard";

// SLA breach sweep (cron)
export { evaluateDsarSlaBreaches, runAllOrgDsarSlaSweeps, type DsarSlaSweepResult, type AllOrgDsarSweepResult } from "./src/internal/worker";

// Review validation (recall/precision/overturn vs human decisions)
export { getDsarValidation, type DsarValidation } from "./src/internal/validation";

// Defensibility export
export { getDsarDefensibilityExport, type DsarDefensibilityExport } from "./src/internal/export";
