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
  extractInvestigationPlan,
  createInvestigationService,
  listInvestigationsService,
  getInvestigationService,
} from "./src/internal/services/investigation";
import { createAdhocCollection as createAdhocCollectionService } from "./src/internal/services/review-set";
import {
  suggestFactsService,
  addCaseFactService,
  listChronologyService,
  deleteCaseFactService,
} from "./src/internal/services/chronology";
import { buildInvestigationReportService } from "./src/internal/services/investigation-report";
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

// ── Investigations (INV-1) ─────────────────────────────────────────────
// An investigation is a Matter of type INVESTIGATION plus a companion
// Investigation row (source letter + AI-extracted issues + draft plan). The
// collection flow reuses createAdhocCollection(source: "INVESTIGATION").
export type {
  InvestigationDTO,
  InvestigationDraft,
  InvestigationPlan,
  InvestigationIssue,
  CustodianHint,
  CreateInvestigationInput,
} from "./src/internal/services/investigation";

/** Preview issues + a draft plan from a source letter — no persistence. */
export function previewInvestigation(sourceText: string, title?: string) {
  return extractInvestigationPlan(sourceText, title);
}
export function createInvestigation(
  input: import("./src/internal/services/investigation").CreateInvestigationInput,
  actor: MatterActor,
) {
  return createInvestigationService(input, actor);
}
export function listInvestigations(organizationId: string) {
  return listInvestigationsService(organizationId);
}
export function getInvestigation(organizationId: string, matterId: string) {
  return getInvestigationService(organizationId, matterId);
}

/** Candidate custodians for an investigation — the same M365 directory lookup
 *  the legal-hold custodian picker uses, scoped by the source text. Mock in
 *  dev; real Graph when connected. */
export async function suggestInvestigationCustodians(
  organizationId: string,
  input: { sourceText: string; matterId?: string },
) {
  const client = await resolveM365Client(organizationId);
  const candidates = await client.discoverCustodians({ description: input.sourceText, matterId: input.matterId });
  return candidates.map((c) => ({ id: c.externalIdentifier, name: c.name, email: c.email, department: c.department ?? null, title: c.title ?? null }));
}

// ── Investigation chronology (INV-3) ──────────────────────────────────
export type {
  CaseFactDTO,
  SuggestedFact,
  AddCaseFactInput,
} from "./src/internal/services/chronology";
/** Deterministic candidate facts from the matter's responsive documents. */
export function suggestInvestigationFacts(organizationId: string, matterId: string, limit?: number) {
  return suggestFactsService(organizationId, matterId, { limit });
}
export function addInvestigationFact(
  input: import("./src/internal/services/chronology").AddCaseFactInput,
  actor: MatterActor,
) {
  return addCaseFactService(input, actor);
}
export function listInvestigationChronology(organizationId: string, matterId: string) {
  return listChronologyService(organizationId, matterId);
}
export function deleteInvestigationFact(organizationId: string, factId: string, actor: MatterActor) {
  return deleteCaseFactService(organizationId, factId, actor);
}

// ── Investigation findings report (INV-4) ──────────────────────────────
export type { InvestigationReport, ReportKeyDoc } from "./src/internal/services/investigation-report";
export function buildInvestigationReport(organizationId: string, matterId: string) {
  return buildInvestigationReportService(organizationId, matterId);
}

/** INV-2 — one-click preserve + collect from an investigation. Creates a DRAFT
 *  legal hold on the investigation's matter (preservation record; custodians
 *  are added in the hold workspace) AND an INVESTIGATION collection scoped to
 *  the chosen custodians (reviewable docs immediately). Returns both so the UI
 *  can deep-link to the hold and the collection workspace. */
export async function startInvestigationWorkup(
  actor: MatterActor,
  input: {
    matterId: string;
    custodianIdentifiers: string[];
    jurisdictions?: string[];
    filters?: import("./src/internal/services/review-set").CollectionFilters;
  },
): Promise<{ holdId: string; holdStatus: string; reviewSetId: string; reviewSetName: string; itemCount: number; simulated: boolean }> {
  const inv = await getInvestigationService(actor.organizationId, input.matterId);
  if (!inv) throw new Error("Investigation not found");
  const scope = inv.plan?.scopeSuggestion ?? `Preserve all data related to ${inv.matterTitle}.`;

  const hold = await createLegalHold(
    { matterId: input.matterId, title: `${inv.matterTitle} — Preservation`, scopeDescription: scope, jurisdictions: input.jurisdictions ?? [] },
    actor,
  );

  const identifiers = [...new Set((input.custodianIdentifiers || []).map((s) => (s || "").trim()).filter(Boolean))];
  const reviewSet = await createAdhocCollectionService(
    actor.organizationId,
    { name: `${inv.matterTitle} — Collection`, source: "INVESTIGATION", identifiers, matterId: input.matterId, filters: input.filters },
    { id: actor.id, type: "USER" },
  );

  return {
    holdId: hold.id, holdStatus: hold.status,
    reviewSetId: reviewSet.id, reviewSetName: reviewSet.name, itemCount: reviewSet.itemCount, simulated: reviewSet.simulated,
  };
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
import { getM365ClientForOrg as resolveM365Client } from "./src/internal/services/m365-factory";
import { getM365ConnectionStatus as resolveM365Status } from "./src/internal/services/m365-graph-auth";

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
export async function getHoldTriggerEvent(
  holdId: string,
  organizationId: string,
) {
  return LegalHoldServices.getHoldTriggerEventService(holdId, organizationId);
}
export async function updateHoldTrigger(
  input: import("./src/internal/legal-hold").UpdateHoldTriggerInput,
  actor: import("./src/internal/legal-hold").HoldActor,
) {
  return LegalHoldServices.updateHoldTriggerService(input, actor);
}
export type {
  TriggerEventDTO,
  UpdateHoldTriggerInput,
} from "./src/internal/legal-hold";

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
export async function listNoticeTemplates(organizationId: string) {
  return LegalHoldServices.listNoticeTemplatesService(organizationId);
}
export async function getNoticeTemplateById(
  organizationId: string,
  templateId: string,
) {
  return LegalHoldServices.getNoticeTemplateByIdService(
    organizationId,
    templateId,
  );
}
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
export { effectiveCadenceDays } from "./src/internal/legal-hold";
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
/** Active preservation obligations on one person — the cross-module check the
 *  Privacy module's DSAR erasure-conflict guard calls. */
export async function listActiveHoldsForPerson(organizationId: string, personId: string) {
  return LegalHoldServices.listActiveHoldsForPersonService(organizationId, personId);
}
export type { ActiveHoldForPerson } from "./src/internal/legal-hold/services/reads";
export async function getHoldWorkspaceSummary(holdId: string) {
  return LegalHoldServices.getHoldWorkspaceSummaryService(holdId);
}
export async function getHoldDefensibilityScore(holdId: string) {
  return LegalHoldServices.getHoldDefensibilityScoreService(holdId);
}
export async function exportHoldDefensibility(holdId: string) {
  return LegalHoldServices.exportHoldDefensibilityService(holdId);
}

// Notice template version history (4c.5, Item 17)
export async function listTemplateVersions(
  templateId: string,
  actor: { id: string; organizationId: string },
) {
  return LegalHoldServices.listTemplateVersionsService(templateId, actor);
}
export async function saveTemplateVersion(
  input: import("./src/internal/legal-hold").SaveTemplateVersionInput,
  actor: { id: string; organizationId: string },
) {
  return LegalHoldServices.saveTemplateVersionService(input, actor);
}
export async function getTemplateVersionByNumber(
  templateId: string,
  version: number,
  actor: { id: string; organizationId: string },
) {
  return LegalHoldServices.getTemplateVersionByNumberService(
    templateId,
    version,
    actor,
  );
}
export type {
  SaveTemplateVersionInput,
  VersionDTO as TemplateVersionDTO,
} from "./src/internal/legal-hold";

// Saved views (4c.5, Item 16)
export async function listSavedViews(
  actor: { id: string; organizationId: string },
  scope: import("@aegis/db").SavedViewScope,
) {
  return LegalHoldServices.listSavedViewsService(actor, scope);
}
export async function createSavedView(
  input: import("./src/internal/legal-hold").CreateSavedViewInput,
  actor: { id: string; organizationId: string },
) {
  return LegalHoldServices.createSavedViewService(input, actor);
}
export async function updateSavedView(
  input: import("./src/internal/legal-hold").UpdateSavedViewInput,
  actor: { id: string; organizationId: string },
) {
  return LegalHoldServices.updateSavedViewService(input, actor);
}
export async function deleteSavedView(
  viewId: string,
  actor: { id: string; organizationId: string },
) {
  return LegalHoldServices.deleteSavedViewService(viewId, actor);
}
export type {
  CreateSavedViewInput,
  SavedViewDTO,
  UpdateSavedViewInput,
} from "./src/internal/legal-hold";

// Defensibility snapshots (4c.5, Item 15)
export async function recordDefensibilitySnapshot(holdId: string) {
  return LegalHoldServices.recordDefensibilitySnapshotService(holdId);
}
export async function listHoldSnapshots(
  holdId: string,
  opts?: import("./src/internal/legal-hold").ListSnapshotsOptions,
) {
  return LegalHoldServices.listHoldSnapshotsService(holdId, opts);
}
export async function pruneOldSnapshots(organizationId: string) {
  return LegalHoldServices.pruneOldSnapshotsService(organizationId);
}
export async function runDailySnapshotPass(organizationId: string) {
  return LegalHoldServices.runDailySnapshotPass(organizationId);
}
export async function runWeeklyCleanupPass(organizationId: string) {
  return LegalHoldServices.runWeeklyCleanupPass(organizationId);
}
export type {
  DailySnapshotPassResult,
  HoldSnapshotDTO,
  ListSnapshotsOptions,
} from "./src/internal/legal-hold";

// Bulk operations on custodians (4c.3, Item 6)
export async function bulkMarkAcknowledged(
  input: import("./src/internal/legal-hold").BulkMarkAcknowledgedInput,
  actor: import("./src/internal/legal-hold").HoldActor,
) {
  return LegalHoldServices.bulkMarkAcknowledgedService(input, actor);
}
export async function bulkReleaseCustodians(
  input: import("./src/internal/legal-hold").BulkReleaseInput,
  actor: import("./src/internal/legal-hold").HoldActor,
) {
  return LegalHoldServices.bulkReleaseCustodiansService(input, actor);
}
export async function bulkSendReminder(
  input: import("./src/internal/legal-hold").BulkSendReminderInput,
  actor: import("./src/internal/legal-hold").HoldActor,
) {
  return LegalHoldServices.bulkSendReminderService(input, actor);
}
export type {
  BulkMarkAcknowledgedInput,
  BulkReleaseInput,
  BulkSendReminderInput,
  BulkOutcomeRow,
  BulkResult,
} from "./src/internal/legal-hold";

// Admin-on-behalf acknowledgment (4c.3, Item 2)
export async function markCustodianAcknowledgedByAdmin(
  input: import("./src/internal/legal-hold").MarkAcknowledgedInput,
  actor: import("./src/internal/legal-hold").HoldActor,
) {
  return LegalHoldServices.markCustodianAcknowledgedByAdminService(
    input,
    actor,
  );
}
export type { MarkAcknowledgedInput } from "./src/internal/legal-hold";

// Notice viewer drill-in (4c.3, Item 7)
export async function getNoticeIssuanceForViewer(
  holdId: string,
  issuanceId: string,
  actor: import("./src/internal/legal-hold").HoldActor,
) {
  return LegalHoldServices.getNoticeIssuanceForViewerService(
    holdId,
    issuanceId,
    actor,
  );
}
export type { NoticeIssuanceForViewer } from "./src/internal/legal-hold";

// Hold scope templates (4c.4, Item 12)
export async function listHoldScopeTemplates(organizationId: string) {
  return LegalHoldServices.listHoldScopeTemplatesService(organizationId);
}
export async function getHoldScopeTemplate(
  organizationId: string,
  templateId: string,
) {
  return LegalHoldServices.getHoldScopeTemplateService(
    organizationId,
    templateId,
  );
}
export async function createHoldScopeTemplate(
  input: import("./src/internal/legal-hold").CreateHoldScopeTemplateInput,
  actor: { id: string; organizationId: string },
) {
  return LegalHoldServices.createHoldScopeTemplateService(input, actor);
}
export async function updateHoldScopeTemplate(
  input: import("./src/internal/legal-hold").UpdateHoldScopeTemplateInput,
  actor: { id: string; organizationId: string },
) {
  return LegalHoldServices.updateHoldScopeTemplateService(input, actor);
}
export async function deleteHoldScopeTemplate(
  organizationId: string,
  templateId: string,
  actor: { id: string; organizationId: string },
) {
  return LegalHoldServices.deleteHoldScopeTemplateService(
    organizationId,
    templateId,
    actor,
  );
}
export type {
  CreateHoldScopeTemplateInput,
  HoldScopeTemplateDTO,
  UpdateHoldScopeTemplateInput,
} from "./src/internal/legal-hold";

// Notice composer (4c.3)
export async function getNoticeComposerPreview(
  input: import("./src/internal/legal-hold").ComposerPreviewInput,
  actor: import("./src/internal/legal-hold").HoldActor,
) {
  return LegalHoldServices.getNoticeComposerPreviewService(input, actor);
}
export async function composeAndSendNotice(
  input: import("./src/internal/legal-hold").ComposeAndSendInput,
  actor: import("./src/internal/legal-hold").HoldActor,
) {
  return LegalHoldServices.composeAndSendNoticeService(input, actor);
}
export { renderTemplate } from "./src/internal/legal-hold";
export type {
  ComposerPreviewInput,
  ComposerPreviewResult,
  ComposeAndSendInput,
  ComposeAndSendResult,
  NoticeComposerVariables,
} from "./src/internal/legal-hold";

// Actor resolution for timelines, audit views, and notice "issued by".
export async function resolveActors(
  organizationId: string,
  inputs: Array<{ actorId: string | null; actorType: string }>,
) {
  return LegalHoldServices.resolveActorsService(organizationId, inputs);
}
export { actorKey } from "./src/internal/legal-hold";
export type {
  ActorKind,
  ResolvedActor,
} from "./src/internal/legal-hold";

// AI mock client (sunset 4d)
export { getHoldAIClient } from "./src/internal/legal-hold";

// Hold → eDiscovery collection bridge (custodian-scoped Purview collection)
export async function draftHoldCollectionQuery(holdId: string, naturalLanguage: string) {
  return LegalHoldServices.draftHoldCollectionQuery(holdId, naturalLanguage);
}
export async function previewHoldCollection(
  holdId: string,
  input: LegalHoldServices.PreviewHoldCollectionInput,
) {
  return LegalHoldServices.previewHoldCollection(holdId, input);
}
export type {
  HoldCollectionPreview,
  HoldCollectionSourceBucket,
  DraftHoldCollectionResult,
  PreviewHoldCollectionInput,
} from "./src/internal/legal-hold";

// Hold-scoped collection → review set (matter-specific collection step) +
// hub-initiated ad-hoc / investigation collections.
export {
  commitHoldCollection,
  createAdhocCollection,
  filterHits,
  describeFilters,
  type CommitHoldCollectionInput,
  type AdhocCollectionInput,
  type CollectionFilters,
} from "./src/internal/services/review-set";

// Shared review engine (@aegis/review) — persistence, reads, coding, AI review,
// and production. Re-exported so matter's existing routes keep importing from
// `@aegis/matter`; privacy (DSAR) and future modules consume `@aegis/review`
// directly.
export {
  listReviewSets,
  getReviewSetSummary,
  setReviewSetCriteria,
  runAiReviewOnReviewSet,
  getReviewSetDetail,
  codeReviewItem,
  freezeReviewSet,
  produceReviewSet,
  buildProductionManifest,
  type ReviewSetSummary,
  type ReviewIssue,
  type ListReviewSetsFilter,
  type RunReviewSetAiInput,
  type RunReviewSetAiResult,
  type ReviewSetDetail,
  type ReviewSetItemDTO,
  type CodeReviewItemInput,
  type ProduceReviewSetResult,
  type ProductionManifest,
  type ProductionItem,
  type PrivilegeLogEntry,
} from "@aegis/review";

// ── M365 connection management (sub-PR 4c) ─────────────────────────

export {
  getM365ConnectionStatus,
  rotateOrgM365Secret,
  upsertOrgM365Credentials,
  verifyM365Credentials,
  type UpsertCredentialsInput,
} from "./src/internal/services/m365-graph-auth";

export {
  M365DelegatedAuthExpiredError,
  M365DelegatedAuthRequiredError,
  M365EDiscoveryNotLicensedError,
  M365GraphAuthError,
  M365GraphError,
  M365GraphNotFoundError,
  M365TenantUnreachableError,
  M365ThrottleExceededError,
} from "./src/internal/services/m365-graph-errors";

// ── M365 delegated authentication (sub-PR 4c.1) ───────────────────

export {
  clearDelegatedTokens,
  getDelegatedAuthStatus,
  getFreshDelegatedAccessToken,
  setRefreshTokenExchanger,
  type DelegatedAuthStatus,
  type RefreshTokenExchanger,
} from "./src/internal/services/m365-graph-delegated-auth";

export {
  initiateDeviceCodeFlow,
  pollDeviceCodeFlow,
  pruneOldDeviceCodeSessions,
  setOAuthHttpClient,
  type InitiateDeviceCodeInput,
  type InitiateDeviceCodeResult,
  type OAuthHttpClient,
  type PollDeviceCodeResult,
} from "./src/internal/services/m365-graph-device-code";

export type {
  M365ConnectionStatus,
  M365VerifyResult,
} from "./src/internal/services/m365-graph-types";

export { getM365ClientForOrg } from "./src/internal/services/m365-factory";

// DSAR collection — Purview/Graph content search for a data subject, routed
// through the same per-org factory the legal-hold flow uses. The Privacy
// module calls this (never the internals) to populate its review queue.
export async function searchM365ForDataSubject(
  organizationId: string,
  input: import("./src/internal/services/m365").DataSubjectSearchInput,
) {
  const client = await resolveM365Client(organizationId);
  return client.searchForDataSubject(input);
}
export type {
  ContentSearchInput,
  DataSubjectSearchInput,
  DataSubjectSearchResult,
  DataSubjectHit,
  DataSubjectSourceType,
} from "./src/internal/services/m365";

// Per-user M365 data-source enumeration — the same Graph lookup legal hold's
// custodian data-source discovery uses, exposed so Privacy's DSAR data
// inventory can enumerate the data subject's real mailbox / OneDrive / Teams.
export async function enumerateM365DataSourcesForUser(
  organizationId: string,
  externalIdentifier: string,
) {
  const client = await resolveM365Client(organizationId);
  return client.enumerateDataSourcesForUser(externalIdentifier);
}

// Scoped content collection — the shared eDiscovery/DSAR primitive. Run a
// KQL/KeyQL query across the tenant through the same per-org factory.
export async function searchM365Content(
  organizationId: string,
  input: import("./src/internal/services/m365").ContentSearchInput,
) {
  const client = await resolveM365Client(organizationId);
  return client.searchContent(input);
}

// Purview eDiscovery (Premium) tenant-scale collection estimate — the
// enterprise-scale seam (CW-2). Creates/reuses an eDiscovery case, adds a
// custodian-scoped search + KQL, and reads back the tenant-wide item/size/
// mailbox/site statistics without pulling every message per-user. Routed
// through the same per-org factory (delegated preferred; mock in dev).
export async function estimatePurviewCollection(
  organizationId: string,
  input: import("./src/internal/services/m365").PurviewCollectionInput,
) {
  const client = await resolveM365Client(organizationId);
  return client.estimatePurviewCollection(input);
}
export type {
  PurviewCollectionInput,
  PurviewCollectionEstimate,
} from "./src/internal/services/m365";

// NL → KQL/KeyQL query drafting (deterministic; attorney edits before firing).
export {
  draftCollectionQuery,
  buildKql,
  extractKeywords,
  type DraftCollectionQueryInput,
  type DraftedCollectionQuery,
} from "./src/internal/services/collection-query";

// Live M365 / Entra directory user search — the same Graph `/users` lookup the
// legal-hold custodian picker uses, exposed so other modules (Privacy's DSAR
// data-subject picker) can select a real tenant user. Reuses discoverCustodians.
export interface M365DirectoryUser {
  id: string;
  name: string;
  email: string;
  department: string | null;
  title: string | null;
}
export async function searchM365DirectoryUsers(
  organizationId: string,
  input: { query: string; matterId?: string },
): Promise<{ users: M365DirectoryUser[]; simulated: boolean }> {
  const query = (input.query || "").trim();
  if (!query) return { users: [], simulated: true };
  const client = await resolveM365Client(organizationId);
  const [candidates, status] = await Promise.all([
    client.discoverCustodians({ description: query, matterId: input.matterId }),
    resolveM365Status(organizationId).catch(() => ({ mode: "mock" as const })),
  ]);
  // Real mode: discoverCustodians already applied a Graph startswith filter on
  // the query. Mock mode: returns a representative roster so the picker demos.
  const users = candidates.map((c) => ({ id: c.externalIdentifier, name: c.name, email: c.email, department: c.department ?? null, title: c.title ?? null }));
  return { users, simulated: status.mode !== "real" };
}

// ── Processing engine (PROC-1) ─────────────────────────────────────
export {
  getProcessingEngineForOrg,
  getProcessingStatusForOrg,
  nativeProcessingEngine,
  NativeJsEngine,
  summarizeExceptions,
  type ProcessingEngine,
  type ProcessingExtractInput,
  type ProcessingResult,
  type ProcessingException,
  type ProcessingMode,
  type ProcessingStatus,
} from "./src/internal/services/processing";

// ── Pipeline planner (B1/B2): capability detection + per-matter plan ─
export {
  getOrgProcessingCapabilities,
  deriveEngines,
  type OrgProcessingCapabilities,
  type PipelineEngines,
} from "./src/internal/services/pipeline-capabilities";
export {
  resolveMatterPipelinePlan,
  ENGINE_ECONOMICS,
  type MatterPipelinePlan,
  type PlanStage,
  type PipelinePlanHints,
  type PipelineStageKey,
  type PipelineEngineChoice,
  type EngineEconomics,
} from "./src/internal/services/pipeline-plan";

// ── Archive ingest (PROC-6): ZIP + MBOX → review set ───────────────
export {
  ingestArchive,
  parseMbox,
  MAX_ARCHIVE_BYTES,
  MAX_BLOB_ARCHIVE_BYTES,
  type IngestArchiveInput,
  type ParsedEmail,
} from "./src/internal/services/archive-ingest";
export { mapLimit, extractConcurrency } from "./src/internal/services/map-limit";
export { benchmarkExtraction, type BenchmarkResult } from "./src/internal/services/benchmark";

// ── Purview eDiscovery explorer (PROC-7b increment 1) ──────────────
export {
  exploreEdiscovery,
  type EdiscoveryExplore,
  type EdiscoveryCaseSummary,
  type EdiscoveryReviewSetSummary,
} from "./src/internal/services/m365-graph-ediscovery-explorer";

// ── Purview review-set export: trigger + poll (PROC-7b increment 2a) ─
export {
  startReviewSetExport,
  getReviewSetExportStatus,
  listCaseOperations,
  type ExportOperation,
  type ExportFileMeta,
  type StartExportResult,
  type ReviewSetExportOptions,
  type CaseOperationSummary,
} from "./src/internal/services/m365-graph-ediscovery-export";
export {
  inspectExportPackage,
  probeExportDownload,
  type ExportPackageInspection,
  type ExportZipEntry,
  type ExportDownloadProbe,
} from "./src/internal/services/m365-graph-ediscovery-download";

// ── M365 mailbox access (Intake P4b) ──────────────────────────────
// Intake reaches Graph mail through these (never its own client).
export {
  pollDelegatedMailbox,
  sendDelegatedMail,
  type InboundGraphMessage,
  type SendMailInput,
  type PollMailboxOptions,
  type GraphHttp,
} from "./src/internal/services/m365-graph-mail";

export type {
  EnumeratedDataSource,
  EnumerateSharePointSitesInput,
  SharePointSiteCandidate,
} from "./src/internal/services/m365";

// Wizard / progress orchestration (sub-PR 4d.0)
export async function issueHoldWithProgressGen(
  input: import("./src/internal/legal-hold").IssueWithProgressInput,
  actor: import("./src/internal/legal-hold").HoldActor,
) {
  return LegalHoldServices.issueHoldWithProgress(input, actor);
}
export async function getIssueStatusSnapshot(
  holdId: string,
  organizationId: string,
) {
  return LegalHoldServices.getIssueStatusSnapshot(holdId, organizationId);
}
export {
  DataSourceNotInErrorStateError,
} from "./src/internal/legal-hold";
export async function retryDataSourcePreservation(
  input: import("./src/internal/legal-hold").RetryDataSourceInput,
  actor: import("./src/internal/legal-hold").HoldActor,
) {
  return LegalHoldServices.retryDataSourcePreservationService(input, actor);
}
export type {
  IssueProgressEvent,
  IssueStatusSnapshot,
  IssueWithProgressInput,
  RetryDataSourceInput,
} from "./src/internal/legal-hold";
