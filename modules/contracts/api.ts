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
// Live contract approval ladder (CTR-8) — drives the shared @aegis/workflow
// `clm_contract_approval` governance ladder and gates IN_REVIEW → APPROVED.
export {
  submitContractForApproval,
  getContractApprovalState,
  actOnContractApproval,
  runContractApprovalAgent,
  type ContractApprovalStateDTO,
  type ApprovalStepDTO,
  type ApprovalStepFindingsDTO,
  type ContractApprovalActor,
} from "./src/internal/approval";

// Deterministic clause-derived contract risk score (Phase 3c).
export {
  scoreContractClauses,
  bandForScore,
  type ClauseRiskScore,
  type RiskScoreDriver,
  type RiskBand,
} from "./src/internal/risk-score";

// Renewals command center (Obligations & Renewals, Phase 1) — auto-renewal-trap
// prevention: the renewal pipeline, the GC's explicit decision, notice
// tracking, and the auto-created notice-obligation sweep.
export {
  getRenewalPipeline,
  recordRenewalDecision,
  markRenewalNoticeSent,
  ensureRenewalNoticeObligations,
  classifyRenewalUrgency,
  inferRenewalTermMonths,
  RENEWAL_URGENCY_RANK,
  type RenewalPipeline,
  type RenewalPipelineRow,
  type RenewalUrgency,
  type RenewalUrgencyInput,
  type RenewalUrgencyResult,
  type RecordRenewalDecisionInput,
  type EnsureNoticeObligationsResult,
} from "./src/internal/renewals";

// Recurrence math for recurring obligations (Phase 1) — the next-cycle
// computation the obligation completion path uses.
export {
  nextOccurrence,
  parseRecurrence,
  recurrenceLabel,
  type ParsedRecurrence,
  type RecurrenceFreq,
} from "./src/internal/recurrence";

// Key-dates calendar + ICS export (Obligations & Renewals, Phase 2).
export {
  getKeyDates,
  buildKeyDatesICS,
  escapeICSText,
  type KeyDate,
  type KeyDateKind,
  type KeyDateSeverity,
  type KeyDatesResult,
} from "./src/internal/key-dates";

// Contract Word (.docx) generation (CTR-11) — a real downloadable document.
export { generateContractDocx } from "./src/internal/document";

// Third-party paper review workflow (CTR-12) — intake inbound counterparty
// paper straight into the governance review + signing ladder.
export {
  reviewThirdPartyContract,
  type ReviewThirdPartyInput,
  type ReviewThirdPartyResult,
} from "./src/internal/third-party";

// Contract execution guide (CTR-17) — a live "what to do next to execute" checklist.
export {
  getContractGuide,
  type ContractGuide,
  type GuideStep,
  type GuideStepState,
} from "./src/internal/contract-guide";

// Native e-signature (CTR-15) — tokenised signing links, real signing ceremony,
// content-hash-bound signatures, auto-execute on completion.
export {
  requestSignature,
  resolveSignatureRequest,
  submitSignature,
  declineSignature,
  listSignatureRequests,
  revokeSignatureRequest,
  type SignatureRequestInput,
  type SignatureRequestDTO,
  type MintedSignatureRequest,
  type SigningContext,
} from "./src/internal/signature-request";

// AI contract drafting (CTR-14) — draft a full contract from a plain-language
// brief; degrades to a deterministic skeleton offline.
export {
  draftContractWithAI,
  type AiDraftInput,
  type AiDraftResult,
} from "./src/internal/ai-draft";

// Third-party review assessment (CTR-13) — "what to sign / which clauses are we
// not comfortable with", deterministic baseline + robust AI deep read.
export {
  assessContractDeterministic,
  assessContractWithAI,
  type ContractAssessmentDTO,
  type AssessmentIssue,
  type AssessmentVerdict,
  type ClausePosition,
} from "./src/internal/assessment";

// Contract collaboration / comments (CTR-10) — threaded business ↔ legal
// (INTERNAL) and internal ↔ counterparty (SHARED) discussion.
export {
  addContractComment,
  addExternalContractComment,
  listContractComments,
  setContractCommentResolved,
  type ContractCommentDTO,
  type CommentVisibility,
  type CommentAudience,
  type AddCommentInput,
} from "./src/internal/comments";

// Contract amendments (CTR-9b) — the sanctioned path to change locked terms.
export {
  openContractAmendment,
  ContractNotAmendableError,
  AMENDABLE_STATUSES,
} from "./src/internal/amendments";

// Proactive digest (Phase 3) — one push-ready summary of the week's actions.
export {
  getContractDigest,
  summarizeDigest,
  type ContractDigest,
  type DigestCounts,
  type DigestItem,
} from "./src/internal/digest";

// Contract integrity / tamper-evidence (CTR-9) — executed-contract lock +
// terms fingerprint + portfolio integrity monitor.
export {
  computeContractTermsHash,
  contractTermsCanonical,
  checkContractIntegrity,
  getContractIntegrityReport,
  sealContractTerms,
  ContractLockedError,
  MATERIAL_TERM_FIELDS,
  LOCKED_STATUSES,
  type ContractTermsInput,
  type IntegrityStatus,
  type ContractIntegrityResult,
  type ContractIntegrityReport,
  type ContractIntegrityReportRow,
} from "./src/internal/integrity";

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
  seedSampleTemplates,
  SAMPLE_CONTRACT_TEMPLATES,
  type SampleTemplateSpec,
} from "./src/internal/sample-templates";

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

// Word-level track-changes diff (CTR-16) — intra-clause insertions/deletions.
export {
  diffWords,
  wordDiffStats,
  type WordDiffSegment,
  type WordDiffType,
} from "./src/internal/word-diff";

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
  updateObligationDetails,
  deleteObligation,
  completeObligation,
  type CreateContractInput,
  type CreateClauseInput,
  type CreateObligationInput,
  type UpdateObligationDetailsInput,
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

// Human-owned clause editing (Phase 6c) — add / edit / delete clauses by hand.
export {
  addClauseManual,
  updateClause,
  deleteClause,
  type ManualClauseInput,
  type UpdateClauseInput,
} from "./src/internal/clause-edit";

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
  submitReviewComment,
  listReviewComments,
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
