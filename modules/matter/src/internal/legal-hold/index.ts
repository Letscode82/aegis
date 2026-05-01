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
export { recordHoldTriggerService } from "./services/trigger";

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
  getLegalHoldByIdService,
  listHoldEventsService,
  listLegalHoldsService,
} from "./services/reads";

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
