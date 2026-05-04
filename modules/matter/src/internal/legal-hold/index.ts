/**
 * Legal Hold sub-domain — internal barrel.
 *
 * Re-exported from `modules/matter/api.ts`. Direct deep-imports from
 * other modules are blocked by ESLint `no-restricted-paths`.
 */

// Lifecycle
export {
  amendHoldScopeService,
  createLegalHoldService,
  IllegalHoldTransitionError,
  issueLegalHoldService,
  partiallyReleaseCustodianService,
  releaseLegalHoldService,
} from "./services/lifecycle";

// Trigger
export {
  getHoldTriggerEventService,
  recordHoldTriggerService,
  updateHoldTriggerService,
  type TriggerEventDTO,
  type UpdateHoldTriggerInput,
} from "./services/trigger";

// Custodians
export {
  acknowledgeHoldService,
  addHoldCustodianService,
  CustodianAlreadyAcknowledgedError,
  markCustodianDepartedService,
  reAttestHoldService,
  removeHoldCustodianService,
} from "./services/custodians";

// Data sources
export {
  addCustodianDataSourceService,
  applyDataSourcePreservationService,
  confirmDataSourcePreservationService,
} from "./services/data-sources";

// Notice templates
export {
  createNoticeTemplateService,
  issueNoticeService,
  pickTemplateForJurisdiction,
  updateNoticeTemplateService,
} from "./services/notice-template";

// Bulk operations on custodians (4c.3, Item 6)
export {
  bulkMarkAcknowledgedService,
  bulkReleaseCustodiansService,
  bulkSendReminderService,
  type BulkMarkAcknowledgedInput,
  type BulkReleaseInput,
  type BulkSendReminderInput,
  type BulkOutcomeRow,
  type BulkResult,
} from "./services/bulk";

// Admin-on-behalf acknowledgment (4c.3, Item 2)
export {
  markCustodianAcknowledgedByAdminService,
  type MarkAcknowledgedInput,
} from "./services/acknowledgment";

// Notice viewer drill-in (4c.3, Item 7)
export {
  getNoticeIssuanceForViewerService,
  type NoticeIssuanceForViewer,
} from "./services/notice-viewer";

// Notice composer (4c.3)
export {
  composeAndSendNoticeService,
  getNoticeComposerPreviewService,
  renderTemplate,
  type ComposerPreviewInput,
  type ComposerPreviewResult,
  type ComposeAndSendInput,
  type ComposeAndSendResult,
  type NoticeComposerVariables,
} from "./services/notice-composer";

// Policy
export {
  effectiveCadenceDays,
  getOrgHoldPolicy,
  HoldPolicyResolutionError,
  resolveEffectivePolicy,
  updateOrgHoldPolicy,
} from "./services/policy";

// Reminders + escalation (helpers; pg-boss handlers register elsewhere)
export {
  effectiveCadenceForHold,
  listDueReminders,
  type DueReminder,
} from "./services/reminders";
export { decideEscalation, type EscalationDecision } from "./services/escalation";

// Defensibility
export { getHoldDefensibilityScoreService } from "./services/defensibility";
export {
  exportHoldDefensibilityService,
  type HoldDefensibilityExport,
} from "./services/export";

// Reads
export {
  getCustodianHoldViewService,
  getHoldWorkspaceSummaryService,
  getLegalHoldByIdService,
  listHoldEventsService,
  listLegalHoldsService,
  type HoldWorkspaceSummary,
} from "./services/reads";

// Actor resolution (timeline + audit + notice "issued by")
export {
  actorKey,
  resolveActorsService,
  type ActorKind,
  type ResolvedActor,
} from "./services/actor-resolver";

// Errors / sentinels
export { AgentDecisionPendingError } from "./services/timeline";

// AI mock client (sunset 4d)
export { getHoldAIClient, MockHoldAIClient, type HoldAIClient, type HoldAIRecommendation } from "./services/ai-mock";

// Type re-exports from the cross-service types module
export type {
  AcknowledgeHoldInput,
  AddCustodianDataSourceInput,
  AddHoldCustodianInput,
  AgentApprovalStatus,
  AgentDecision,
  AmendHoldScopeInput,
  ApplyDataSourcePreservationInput,
  ConfirmDataSourcePreservationInput,
  CreateLegalHoldInput,
  CreateNoticeTemplateInput,
  CustodianDataSource,
  CustodianHoldView,
  DataSourceType,
  DepartedCustodianRetention,
  HoldActor,
  HoldDefensibilityGap,
  HoldDefensibilityScore,
  HoldNoticeIssuance,
  HoldNoticeTemplate,
  HoldTriggerEvent,
  IssueLegalHoldInput,
  IssueNoticeInput,
  LegalHold,
  LegalHoldCustodian,
  LegalHoldEvent,
  LegalHoldEventType,
  LegalHoldStatus,
  OrganizationHoldPolicy,
  PartiallyReleaseCustodianInput,
  PreservationAction,
  ReAttestHoldInput,
  ReleaseLegalHoldInput,
  ResolvedHoldPolicy,
  ScoreComponent,
  UpdateNoticeTemplateInput,
} from "./types";
