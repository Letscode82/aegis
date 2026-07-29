/**
 * @aegis/contracts — Contract Lifecycle Management (CLM).
 *
 * PUBLIC SURFACE. The only file other modules and the app may import
 * from. Internal read/mutation services and UI live under `src/internal`
 * / `src/ui` and are private (module-isolation rule).
 *
 * Scope (one of the 11 locked modules — see docs/contracts-module-plan.md):
 * the system of record for contracts. Firm/counterparty = `Counterparty`,
 * signatories = `Person`, the paper = `Document`, commitments = the SHARED
 * `Obligation` entity (sourceType = CONTRACT), approval flow = the reused
 * workflow ladder. Never a `ContractParty` table.
 *
 * CTR-1 ships the repository (reads), obligation management, and clause
 * persistence — all chain-sealed. CTR-2 wires the intake CLM ladder to
 * spawn a Contract and runs the shared contract agent to extract clauses
 * + obligations, feeding Company Brain.
 */
// Deterministic clause-derived contract risk score (Phase 3c).
export {
  scoreContractClauses,
  bandForScore,
  type ClauseRiskScore,
  type RiskScoreDriver,
  type RiskBand,
} from "./src/internal/risk-score";

export {
  getContractsOverview,
  getContractDetail,
  listObligations,
  listCounterpartiesForPicker,
  type CounterpartyOption,
  type ContractsOverview,
  type ContractSummary,
  type ContractDetail,
  type ContractClauseDTO,
  type ContractObligationDTO,
  type ObligationRow,
  type ObligationQueue,
  type ObligationFilter,
} from "./src/internal/reads";

// Obligation lifecycle state machine (Phase 2) — the guard + allowed
// transitions the obligation routes and dashboard use.
export {
  canTransitionObligation,
  assertObligationTransition,
  allowedObligationTransitions,
  IllegalObligationTransitionError,
} from "./src/internal/obligation-state-machine";

// Obligation reminder / escalation engine (Phase 2c) — the pg-boss-ready
// overdue → BREACHED sweep + its escalation-tier helper.
export {
  evaluateObligationBreaches,
  escalationTierForOverdue,
  type ObligationBreachResult,
  type EscalationTier,
} from "./src/internal/obligation-jobs";

export {
  getContractAlerts,
  type ContractAlerts,
  type ContractAlert,
  type AlertKind,
  type AlertSeverity,
} from "./src/internal/alerts";

export {
  listClauseLibrary,
  getClauseLibraryByType,
  getContractPlaybookText,
  upsertClauseLibraryEntry,
  deleteClauseLibraryEntry,
  type ClauseLibraryEntryDTO,
  type UpsertClauseLibraryInput,
} from "./src/internal/clause-library";

export {
  listTemplates,
  getTemplateByKey,
  getDefaultTemplateForKind,
  upsertTemplate,
  deleteTemplate,
  type TemplateDTO,
  type UpsertTemplateInput,
} from "./src/internal/templates";

export {
  snapshotContractVersion,
  listContractVersions,
  diffContractVersions,
  diffClauseSets,
  diffCounts,
  type ContractVersionSummary,
  type ContractVersionDetail,
  type ContractDiff,
  type ClauseChange,
  type SnapshotClause,
} from "./src/internal/versions";

// Contract editing (Phase 5c) — metadata patch + scope/draft body editor.
export {
  updateContract,
  updateContractDraft,
  type UpdateContractInput,
  type UpdateDraftResult,
} from "./src/internal/edit";

// Execution & signatures (Phase 5d) — record signatures; both sides + APPROVED
// auto-executes.
export {
  getContractSignatures,
  recordSignature,
  removeSignature,
  type SignatureState,
  type SignatureDTO,
  type RecordSignatureInput,
} from "./src/internal/signatures";

export {
  createContract,
  transitionContractStatus,
  updateContractStatus,
  addClause,
  createObligation,
  updateObligationStatus,
  completeObligation,
  type CreateContractInput,
  type CreateClauseInput,
  type CreateObligationInput,
} from "./src/internal/service";

// CLM lifecycle state machine (Phase 1) — the guard + allowed-transitions
// helper the routes and UI use.
export {
  canTransitionContract,
  assertContractTransition,
  allowedContractTransitions,
  IllegalContractTransitionError,
} from "./src/internal/contract-state-machine";

export {
  extractContractKnowledge,
  type ExtractedKnowledge,
  type ExtractedClause,
  type ExtractedObligation,
} from "./src/internal/extract";

export {
  spawnContractFromIntake,
  extractAndPersistContractKnowledge,
  type SpawnContractFromIntakeInput,
  type SpawnContractResult,
  type ContractExtractionResult,
} from "./src/internal/intake-spawn";

// Contract authoring — draft-from-template (Phase 4a). The originate-inside-
// Contracts entry point, parallel to intake-spawn.
export {
  authorContractFromTemplate,
  renderTemplateBody,
  type AuthorContractInput,
  type AuthorContractResult,
} from "./src/internal/author";

// Turn-based negotiation (Phase 4b). Applying a counterparty turn re-extracts
// the draft into a new COUNTERPARTY version; turns derive from that history.
export {
  getNegotiationState,
  applyCounterpartyTurn,
  type NegotiationState,
  type NegotiationTurnSummary,
  type ApplyTurnResult,
} from "./src/internal/negotiation";

// AI clause remediation (Phase 5b) — suggest a fix for a deviating clause
// from playbook + agreeable precedent + AI, human-gated via AgentDecision.
export {
  suggestClauseRemediation,
  resolveClauseRemediation,
  getClauseRemediation,
  buildRemediationPrompt,
  type ClauseRemediationDTO,
  type RemediationOption,
  type RemediationBasis,
  type RemediationStatus,
} from "./src/internal/clause-remediation";

// Live re-extraction on amendment (Phase 3a) — re-runs the deterministic
// extractor over amended text, replaces the clause set, and snapshots a new
// EXTRACTION version so the redline shows exactly what the amendment changed.
export {
  reExtractContractClauses,
  type ReExtractResult,
} from "./src/internal/reextract";

// AI change-narrative on a version redline (Phase 3b) — the first live
// @aegis/ai call in Contracts, human-gated through the AgentDecision
// lifecycle. Generate writes a PENDING decision; approve/reject is the only
// path off PENDING and is chain-sealed.
export {
  generateChangeNarrative,
  resolveChangeNarrative,
  getChangeNarrative,
  // pure helpers (unit-tested)
  summarizeDiff,
  assessRisk,
  deterministicNarrative,
  buildNarrativePrompt,
  type ChangeNarrativeDTO,
  type NarrativeRisk,
  type NarrativeStatus,
  type DiffSummary,
} from "./src/internal/narrative";

// Counterparty contacts (Phase 5a) — create the COUNTERPARTY_CONTACT Person
// the review round-trip invites.
export {
  createCounterpartyContact,
  type CounterpartyContactDTO,
  type CreateCounterpartyContactInput,
} from "./src/internal/contacts";

export {
  mintContractReviewToken,
  resolveContractReviewToken,
  recordReviewConsent,
  submitReviewResponse,
  revokeContractReviewToken,
  getContractReviewActivity,
  // pure helpers (also unit-tested)
  decisionToAction,
  isFinalDecision,
  tokenUsable,
  hashToken,
  generateRawToken,
  reviewUrl,
  type ReviewDecision,
  type MintedReviewToken,
  type ReviewTokenContext,
  type ReviewActivity,
  type ReviewActivityEvent,
} from "./src/internal/review-token";
