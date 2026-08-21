/**
 * @aegis/review — shared eDiscovery / review-set engine.
 *
 * Persistence (`persistReviewSet`), reads/criteria, multi-dimension coding,
 * email threading + near-dup + families, AI review orchestration, and Bates
 * production. Consuming modules (matter → legal hold, privacy → DSAR) supply
 * their own collection and attach it here.
 */
export {
  persistReviewSet,
  listReviewSets,
  listCollections,
  deriveStage,
  getReviewSetSummary,
  setReviewSetCriteria,
  type CollectionSummary,
  type CollectionStage,
  type Actor,
  type ReviewIssue,
  type ReviewCollectedItem,
  type PersistReviewSetInput,
  type ReviewSetSummary,
  type ListReviewSetsFilter,
} from "./reviewset";

export {
  getReviewSetDetail,
  codeReviewItem,
  freezeReviewSet,
  produceReviewSet,
  buildProductionManifest,
  type ReviewSetDetail,
  type ReviewSetItemDTO,
  type CodeReviewItemInput,
  type ProduceReviewSetResult,
  type ProductionManifest,
  type ProductionItem,
  type PrivilegeLogEntry,
} from "./coding";

export {
  runAiReviewOnReviewSet,
  type RunReviewSetAiInput,
  type RunReviewSetAiResult,
} from "./ai";

export {
  normalizeSubject,
  hashString,
  assignThreadingAndDedup,
  type ThreadInput,
  type ThreadAssignment,
} from "./threading";

export {
  applyThreadNearDupCull,
  clearCull,
  listExclusions,
  type ApplyCullResult,
  type ExclusionEntry,
} from "./cull";

export {
  createReviewBatch,
  listReviewBatches,
  assignReviewBatch,
  submitBatchForQc,
  resolveItemQc,
  completeReviewBatch,
  type ReviewBatchDTO,
  type CreateReviewBatchInput,
  type BatchStatus,
} from "./batching";

export {
  createReviewProfile,
  updateReviewProfile,
  listReviewProfiles,
  getReviewProfile,
  archiveReviewProfile,
  applyProfileToReviewSet,
  draftProfileCriteria,
  type ReviewProfileSummary,
  type ReviewProfileDetail,
  type ReviewProfileVersionSummary,
  type ReviewProfileModelParams,
  type ReviewProfileThresholds,
  type UpsertReviewProfileInput,
  type DraftProfileRequest,
} from "./profile";

export {
  buildCaseBrief,
  answerCaseQuestion,
  type CaseBrief,
  type CopilotAnswer,
  type CopilotCitation,
  type CopilotSuggestion,
  type AnswerInput,
} from "./copilot";

export {
  runCaseGraph,
  type CaseDossier,
  type IssueCluster,
  type TimelineFact,
  type CaseEntity,
  type DossierKeyDoc,
  type GraphNodeStatus,
} from "./case-graph";

export {
  getEcaFunnel,
  type EcaFunnel,
  type EcaFunnelStage,
  type EcaBreakdownRow,
  type EcaEstimate,
  type EcaCostModel,
} from "./eca";

export {
  startValidationPilot,
  computeValidationMetrics,
  applyAtScale,
  listValidationRuns,
  type ValidationRunSummary,
  type ValidationMetricsDTO,
  type ValidationDimension,
  type StartPilotInput,
  type ApplyAtScaleResult,
} from "./validation";
