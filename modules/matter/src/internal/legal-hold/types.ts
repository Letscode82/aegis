/**
 * Cross-service types for the legal-hold sub-domain.
 *
 * Re-exports the Prisma-generated entity + enum types so consumer
 * code in modules/matter/api.ts and the apps/web routes can use
 * them through this single import path.
 */
import type {
  AgentDecision,
  AgentApprovalStatus,
  CustodianDataSource,
  DataSourceType,
  DepartedCustodianRetention,
  HoldNoticeIssuance,
  HoldNoticeTemplate,
  HoldTriggerEvent,
  LegalHold,
  LegalHoldCustodian,
  LegalHoldEvent,
  LegalHoldEventType,
  LegalHoldStatus,
  OrganizationHoldPolicy,
  PreservationAction,
} from "@aegis/db";

export type {
  AgentDecision,
  AgentApprovalStatus,
  CustodianDataSource,
  DataSourceType,
  DepartedCustodianRetention,
  HoldNoticeIssuance,
  HoldNoticeTemplate,
  HoldTriggerEvent,
  LegalHold,
  LegalHoldCustodian,
  LegalHoldEvent,
  LegalHoldEventType,
  LegalHoldStatus,
  OrganizationHoldPolicy,
  PreservationAction,
};

/** Caller identity. Mirrors MatterActor for consistency. */
export interface HoldActor {
  id: string;
  organizationId: string;
  email?: string;
  name?: string;
}

export interface CreateLegalHoldInput {
  matterId: string;
  title: string;
  scopeDescription: string;
  jurisdictions?: string[];
  triggerEventDescription?: string;
  triggeredAt?: Date;
  affectsDepartedCustodians?: boolean;
  privilegeFlags?: Record<string, boolean>;
  customPolicy?: ResolvedHoldPolicy;
}

export interface IssueLegalHoldInput {
  holdId: string;
  noticeTemplateId: string;
  recipientCustodianPersonIds: string[];
}

export interface ReleaseLegalHoldInput {
  holdId: string;
  releaseReason: string;
}

export interface PartiallyReleaseCustodianInput {
  holdId: string;
  personId: string;
  releaseReason: string;
}

export interface AmendHoldScopeInput {
  holdId: string;
  newScopeDescription: string;
  reason: string;
}

export interface AddHoldCustodianInput {
  holdId: string;
  personId: string;
  /** When set, immediately applies preservation to these data sources. */
  initialDataSources?: Array<{
    type: DataSourceType;
    externalIdentifier: string;
    displayLabel: string;
    preservationAction?: PreservationAction;
  }>;
}

export interface AcknowledgeHoldInput {
  holdId: string;
  personId: string;
  attestationStatement?: string;
  ip?: string;
  userAgent?: string;
}

export interface ReAttestHoldInput {
  holdId: string;
  personId: string;
  attestationStatement?: string;
}

export interface AddCustodianDataSourceInput {
  legalHoldCustodianId: string;
  type: DataSourceType;
  externalIdentifier: string;
  displayLabel: string;
  preservationAction?: PreservationAction;
  retentionPolicyConflict?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ApplyDataSourcePreservationInput {
  dataSourceId: string;
  reasonCode: string;
}

export interface ConfirmDataSourcePreservationInput {
  dataSourceId: string;
}

export interface IssueNoticeInput {
  holdId: string;
  templateId: string;
  /** Defaults to all custodians on the hold. */
  recipientCustodianPersonIds?: string[];
}

export interface CreateNoticeTemplateInput {
  name: string;
  jurisdictionKey?: string | null;
  bodyMarkdown: string;
}

export interface UpdateNoticeTemplateInput {
  templateId: string;
  bodyMarkdown: string;
}

/**
 * Resolved policy = org default merged with per-hold override.
 * `resolveEffectivePolicy(orgId, holdId)` is the only path callers
 * should use to read this; the DB shape (org policy row +
 * customPolicyJson) is intentionally not surfaced.
 */
export interface ResolvedHoldPolicy {
  attestationCadenceDays: number;
  reminderLeadTimeDays: number;
  escalationChain: Array<{
    level: number;
    afterDays: number;
    notifyRoleNames: string[];
  }>;
  jurisdictionPolicies: Record<
    string,
    { cadenceDays: number; mandatoryLanguageMd?: string }
  >;
}

/** Defensibility scorecard — deterministic in 4b; AI narrative in 4d. */
export interface HoldDefensibilityScore {
  holdId: string;
  computedAt: string;
  score: number;
  components: {
    custodianAcknowledgmentRate: ScoreComponent;
    reAttestationCurrency: ScoreComponent;
    dataSourcePreservationCoverage: ScoreComponent;
    itPreservationConfirmationRate: ScoreComponent;
    noticeTemplateIntegrity: ScoreComponent;
    auditChainIntegrity: ScoreComponent;
  };
  gaps: HoldDefensibilityGap[];
}

export interface ScoreComponent {
  /**
   * Component score in [0, 1], or `null` when the component is
   * inapplicable to the current hold state (e.g. re-attestation
   * currency when zero custodians have acknowledged yet).
   * Null components are excluded from the weighted sum AND from the
   * weight divisor — the overall score reflects only what is
   * currently measurable.
   */
  value: number | null;
  weight: number;
  gap: string | null;
  /** Hover/tooltip text when value is null, e.g. "Not yet applicable". */
  notApplicableReason?: string | null;
}

export interface HoldDefensibilityGap {
  /** Stable enum-ish key — UI maps to a label and a "fix this" CTA. */
  key:
    | "custodian-acknowledgment-pending"
    | "re-attestation-overdue"
    | "data-source-preservation-not-applied"
    | "data-source-preservation-not-confirmed"
    | "retention-policy-conflict"
    | "notice-template-drift"
    | "audit-chain-break";
  severity: "low" | "medium" | "high";
  message: string;
  count: number;
}

export interface CustodianHoldView {
  hold: LegalHold;
  custodianRow: LegalHoldCustodian;
  noticeBodyMarkdown: string;
  templateName: string;
  templateBodyHash: string;
  dataSources: CustodianDataSource[];
}
