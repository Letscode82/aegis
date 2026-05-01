/**
 * @aegis/matter — public API surface.
 *
 * The ONLY file other modules can import from. Internal services live
 * under `src/internal/**` and ESLint blocks any cross-module import
 * that targets them. UI components are exposed through the secondary
 * "@aegis/matter/ui" entry — also for composition-root + sibling-module
 * use, never for their internal logic.
 *
 * Functions in this surface are the contract Steps 5/6/4b/4c/4d build
 * on. Adding a function here is a deliberate widening of the public
 * boundary; renaming/removing one is a breaking change to every
 * consumer (Intake, Spend, apps/web, future modules).
 *
 * Conservative AI governance — every state-changing function takes a
 * MatterActor and writes an AuditLog entry through the chain-sealed
 * helper (see internal/services/timeline.ts).
 */
import {
  createMatterService,
  getMatterByIdService,
  listMattersService,
  updateMatterService,
} from "./src/internal/services/matter";
import {
  closeMatterService,
  transitionMatterStatusService,
} from "./src/internal/services/status";
import {
  addMatterPartyService,
  removeMatterPartyService,
} from "./src/internal/services/party";
import {
  completeMatterTaskService,
  createMatterTaskService,
  getMatterTasksService,
} from "./src/internal/services/task";
import {
  findSimilarMattersService,
  getMattersByCounterpartyService,
  getMatterCostBasisService,
  linkTicketToMatterService,
  getLegalHoldsForMatterService,
} from "./src/internal/services/cross-module";
import {
  getMatterDashboardStatsService,
  getMattersByAttorneyReportService,
  getWorkloadReportService,
} from "./src/internal/services/reporting";

import type {
  CreateMatterInput,
  CreateTaskInput,
  CloseoutData,
  Matter,
  MatterActor,
  MatterFilter,
  MatterMatch,
  MatterPage,
  MatterParty,
  MatterPartyRole,
  MatterStatus,
  MatterTask,
  MatterCostBasis,
  AttorneyWorkloadReport,
  DashboardStats,
  ReportPeriod,
  UpdateMatterInput,
  WorkloadReport,
  LegalHold,
} from "./src/internal/types";

// ── Type re-exports ────────────────────────────────────────────────

export type {
  CreateMatterInput,
  CreateTaskInput,
  CloseoutData,
  Matter,
  MatterActor,
  MatterFilter,
  MatterMatch,
  MatterPage,
  MatterParty,
  MatterPartyRole,
  MatterStatus,
  MatterTask,
  MatterTaskStatus,
  MatterType,
  MatterCostBasis,
  MatterTypeConfig,
  MatterFieldTemplate,
  MatterFieldType,
  AttorneyWorkloadReport,
  DashboardStats,
  ReportPeriod,
  UpdateMatterInput,
  WorkloadReport,
  LegalHold,
  CloseoutChecklistItem,
} from "./src/internal/types";

export {
  IllegalMatterTransitionError,
  allowedTransitions,
  canTransition,
} from "./src/internal/services/state-machine";
export { CloseoutChecklistIncompleteError } from "./src/internal/services/closeout";
export { TaskDependencyNotMetError } from "./src/internal/services/task";

// ── CRUD ───────────────────────────────────────────────────────────

export async function getMatterById(id: string): Promise<Matter | null> {
  return getMatterByIdService(id);
}

export async function listMattersByOrganization(
  orgId: string,
  filter?: MatterFilter,
): Promise<MatterPage<Matter>> {
  return listMattersService(orgId, filter);
}

export async function createMatter(
  input: CreateMatterInput,
  actor: MatterActor,
): Promise<Matter> {
  return createMatterService(input, actor);
}

export async function updateMatter(
  id: string,
  input: UpdateMatterInput,
  actor: MatterActor,
): Promise<Matter> {
  return updateMatterService(id, input, actor);
}

export async function transitionMatterStatus(
  id: string,
  newStatus: MatterStatus,
  actor: MatterActor,
  reason?: string,
): Promise<Matter> {
  return transitionMatterStatusService(id, newStatus, actor, reason);
}

export async function closeMatter(
  id: string,
  actor: MatterActor,
  closeoutData: CloseoutData,
): Promise<Matter> {
  return closeMatterService(id, actor, closeoutData);
}

// ── Cross-module integration ───────────────────────────────────────

export async function findSimilarMatters(
  query: string,
  limit?: number,
): Promise<MatterMatch[]> {
  return findSimilarMattersService(query, limit);
}

export async function linkTicketToMatter(
  matterId: string,
  ticketId: string,
  actor: MatterActor,
): Promise<void> {
  return linkTicketToMatterService(matterId, ticketId, actor);
}

export async function getMattersByCounterparty(
  counterpartyId: string,
): Promise<Matter[]> {
  return getMattersByCounterpartyService(counterpartyId);
}

export async function getMatterCostBasis(
  matterId: string,
): Promise<MatterCostBasis> {
  return getMatterCostBasisService(matterId);
}

export async function getLegalHoldsForMatter(
  matterId: string,
): Promise<LegalHold[]> {
  return getLegalHoldsForMatterService(matterId);
}

// ── Team management ────────────────────────────────────────────────

export async function addMatterParty(
  matterId: string,
  personId: string,
  role: MatterPartyRole,
  actor: MatterActor,
): Promise<MatterParty> {
  return addMatterPartyService(matterId, personId, role, actor);
}

export async function removeMatterParty(
  matterId: string,
  personId: string,
  actor: MatterActor,
): Promise<void> {
  return removeMatterPartyService(matterId, personId, actor);
}

// ── Tasks ──────────────────────────────────────────────────────────

export async function createMatterTask(
  matterId: string,
  task: CreateTaskInput,
  actor: MatterActor,
): Promise<MatterTask> {
  return createMatterTaskService(matterId, task, actor);
}

export async function completeMatterTask(
  taskId: string,
  actor: MatterActor,
): Promise<MatterTask> {
  return completeMatterTaskService(taskId, actor);
}

export async function getMatterTasks(matterId: string): Promise<MatterTask[]> {
  return getMatterTasksService(matterId);
}

// ── Reporting ──────────────────────────────────────────────────────

export async function getMatterDashboardStats(
  orgId: string,
): Promise<DashboardStats> {
  return getMatterDashboardStatsService(orgId);
}

export async function getMattersByAttorneyReport(
  orgId: string,
  period: ReportPeriod,
): Promise<AttorneyWorkloadReport> {
  return getMattersByAttorneyReportService(orgId, period);
}

export async function getWorkloadReport(
  orgId: string,
): Promise<WorkloadReport> {
  return getWorkloadReportService(orgId);
}

// ── Legal Hold (sub-PR 4b) ─────────────────────────────────────────

import * as LegalHoldServices from "./src/internal/legal-hold";

export type {
  AcknowledgeHoldInput,
  AddCustodianDataSourceInput,
  AddHoldCustodianInput,
  AmendHoldScopeInput,
  ApplyDataSourcePreservationInput,
  ConfirmDataSourcePreservationInput,
  CreateLegalHoldInput,
  CreateNoticeTemplateInput,
  CustodianDataSource,
  CustodianHoldView,
  DataSourceType,
  HoldActor,
  HoldDefensibilityExport,
  HoldDefensibilityGap,
  HoldDefensibilityScore,
  HoldNoticeIssuance,
  HoldNoticeTemplate,
  HoldTriggerEvent,
  IssueLegalHoldInput,
  IssueNoticeInput,
  LegalHoldCustodian,
  LegalHoldEvent,
  LegalHoldEventType,
  OrganizationHoldPolicy,
  PartiallyReleaseCustodianInput,
  PreservationAction,
  ReAttestHoldInput,
  ReleaseLegalHoldInput,
  ResolvedHoldPolicy,
  ScoreComponent,
  UpdateNoticeTemplateInput,
} from "./src/internal/legal-hold";

export {
  AgentDecisionPendingError,
  CustodianAlreadyAcknowledgedError,
  HoldPolicyResolutionError,
  IllegalHoldTransitionError,
} from "./src/internal/legal-hold";

// Lifecycle
export async function createLegalHold(
  input: import("./src/internal/legal-hold").CreateLegalHoldInput,
  actor: import("./src/internal/legal-hold").HoldActor,
) {
  return LegalHoldServices.createLegalHoldService(input, actor);
}
export async function issueLegalHold(
  input: import("./src/internal/legal-hold").IssueLegalHoldInput,
  actor: import("./src/internal/legal-hold").HoldActor,
) {
  return LegalHoldServices.issueLegalHoldService(input, actor);
}
export async function releaseLegalHold(
  input: import("./src/internal/legal-hold").ReleaseLegalHoldInput,
  actor: import("./src/internal/legal-hold").HoldActor,
) {
  return LegalHoldServices.releaseLegalHoldService(input, actor);
}
export async function partiallyReleaseCustodian(
  input: import("./src/internal/legal-hold").PartiallyReleaseCustodianInput,
  actor: import("./src/internal/legal-hold").HoldActor,
) {
  return LegalHoldServices.partiallyReleaseCustodianService(input, actor);
}
export async function amendHoldScope(
  input: import("./src/internal/legal-hold").AmendHoldScopeInput,
  actor: import("./src/internal/legal-hold").HoldActor,
) {
  return LegalHoldServices.amendHoldScopeService(input, actor);
}

// Trigger
export async function recordHoldTrigger(
  holdId: string,
  eventDescription: string,
  occurredAt: Date,
  actor: import("./src/internal/legal-hold").HoldActor,
) {
  return LegalHoldServices.recordHoldTriggerService(
    holdId,
    eventDescription,
    occurredAt,
    actor,
  );
}

// Custodians
export async function addHoldCustodian(
  input: import("./src/internal/legal-hold").AddHoldCustodianInput,
  actor: import("./src/internal/legal-hold").HoldActor,
) {
  return LegalHoldServices.addHoldCustodianService(input, actor);
}
export async function removeHoldCustodian(
  holdId: string,
  personId: string,
  actor: import("./src/internal/legal-hold").HoldActor,
) {
  return LegalHoldServices.removeHoldCustodianService(holdId, personId, actor);
}
export async function acknowledgeHold(
  input: import("./src/internal/legal-hold").AcknowledgeHoldInput,
  actor: import("./src/internal/legal-hold").HoldActor,
) {
  return LegalHoldServices.acknowledgeHoldService(input, actor);
}
export async function reAttestHold(
  input: import("./src/internal/legal-hold").ReAttestHoldInput,
  actor: import("./src/internal/legal-hold").HoldActor,
) {
  return LegalHoldServices.reAttestHoldService(input, actor);
}
export async function markCustodianDeparted(
  holdId: string,
  personId: string,
  actor: import("./src/internal/legal-hold").HoldActor,
  notes?: string,
) {
  return LegalHoldServices.markCustodianDepartedService(
    holdId,
    personId,
    actor,
    notes,
  );
}

// Data sources
export async function addCustodianDataSource(
  input: import("./src/internal/legal-hold").AddCustodianDataSourceInput,
  actor: import("./src/internal/legal-hold").HoldActor,
) {
  return LegalHoldServices.addCustodianDataSourceService(input, actor);
}
export async function applyDataSourcePreservation(
  input: import("./src/internal/legal-hold").ApplyDataSourcePreservationInput,
  actor: import("./src/internal/legal-hold").HoldActor,
) {
  return LegalHoldServices.applyDataSourcePreservationService(input, actor);
}
export async function confirmDataSourcePreservation(
  input: import("./src/internal/legal-hold").ConfirmDataSourcePreservationInput,
  actor: import("./src/internal/legal-hold").HoldActor,
) {
  return LegalHoldServices.confirmDataSourcePreservationService(input, actor);
}

// Notice templates
export async function createNoticeTemplate(
  input: import("./src/internal/legal-hold").CreateNoticeTemplateInput,
  actor: import("./src/internal/legal-hold").HoldActor,
) {
  return LegalHoldServices.createNoticeTemplateService(input, actor);
}
export async function updateNoticeTemplate(
  input: import("./src/internal/legal-hold").UpdateNoticeTemplateInput,
  actor: import("./src/internal/legal-hold").HoldActor,
) {
  return LegalHoldServices.updateNoticeTemplateService(input, actor);
}
export async function issueNotice(
  input: import("./src/internal/legal-hold").IssueNoticeInput,
  actor: import("./src/internal/legal-hold").HoldActor,
) {
  return LegalHoldServices.issueNoticeService(input, actor);
}

// Policy
export async function getOrgHoldPolicy(organizationId: string) {
  return LegalHoldServices.getOrgHoldPolicy(organizationId);
}
export async function updateOrgHoldPolicy(
  organizationId: string,
  policy: Partial<import("./src/internal/legal-hold").ResolvedHoldPolicy>,
) {
  return LegalHoldServices.updateOrgHoldPolicy(organizationId, policy);
}
export async function resolveEffectivePolicy(
  organizationId: string,
  holdId?: string,
) {
  return LegalHoldServices.resolveEffectivePolicy(organizationId, holdId);
}

// Reads
export async function listLegalHolds(
  organizationId: string,
  matterId?: string,
) {
  return LegalHoldServices.listLegalHoldsService(organizationId, matterId);
}
export async function getLegalHoldById(holdId: string) {
  return LegalHoldServices.getLegalHoldByIdService(holdId);
}
export async function listHoldEvents(holdId: string, limit?: number) {
  return LegalHoldServices.listHoldEventsService(holdId, limit);
}
export async function getCustodianHoldView(holdId: string, personId: string) {
  return LegalHoldServices.getCustodianHoldViewService(holdId, personId);
}
export async function getHoldDefensibilityScore(holdId: string) {
  return LegalHoldServices.getHoldDefensibilityScoreService(holdId);
}
export async function exportHoldDefensibility(holdId: string) {
  return LegalHoldServices.exportHoldDefensibilityService(holdId);
}

// AI mock client (sunset 4d)
export { getHoldAIClient } from "./src/internal/legal-hold";
