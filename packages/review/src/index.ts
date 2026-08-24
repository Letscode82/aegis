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
  parseAiTags,
  orderedAiTags,
  isConfidentResponsive,
  hasConfidentCall,
  AI_TAG_KINDS,
  type AiTagView,
} from "./ai-tags";

export {
  normalizeSubject,
  hashString,
  assignThreadingAndDedup,
  type ThreadInput,
  type ThreadAssignment,
} from "./threading";

export {
  applyThreadNearDupCull,
  applyKeywordCull,
  applySourceTypeCull,
  selectKeywordCullIds,
  selectSourceTypeCullIds,
  clearCull,
  listExclusions,
  JUNK_PATTERNS,
  type ApplyCullResult,
  type CullPassResult,
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
  materializeCaseGraph,
  getCaseKnowledgeGraph,
  type CaseDossier,
  type IssueCluster,
  type TimelineFact,
  type CaseEntity,
  type DossierKeyDoc,
  type GraphNodeStatus,
  type CaseKnowledgeGraph,
  type KGNode,
  type KGEdge,
} from "./case-graph";

export {
  proposeAgentAction,
  listAgentProposals,
  approveAgentAction,
  rejectAgentAction,
  type AgentProposalDTO,
  type AgentActionKind,
} from "./agent-actions";

export {
  startAutoPilot,
  approveAutoPilotStep,
  rejectAutoPilotStep,
  getAutoPilotRun,
  getLatestAutoPilotRun,
  planSteps,
  critique,
  TOOL_META,
  type AutoPilotTool,
  type AutoPilotRunDTO,
  type AutoPilotStepDTO,
  type PlanState,
  type PlannedStep,
  type CritiqueInput,
  type CritiqueResult,
} from "./autopilot";

export {
  getEcaFunnel,
  resolveCostModel,
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
