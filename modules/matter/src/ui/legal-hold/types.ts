/**
 * Wire-format types for the legal-hold UI components.
 *
 * Mirrors the API route response shapes one-to-one. Centralised so
 * the components and apps/web pages share a single source of truth
 * without taking a dependency on the deeper @aegis/db enum types.
 */
export type LegalHoldStatusKey =
  | "DRAFT"
  | "ISSUED"
  | "ACTIVE"
  | "PARTIALLY_RELEASED"
  | "RELEASED";

export interface HoldSummaryDTO {
  id: string;
  holdNumber: string | null;
  title: string;
  scopeDescription: string;
  jurisdictions: string[];
  status: LegalHoldStatusKey;
  triggeredAt: string | null;
  triggerEventDescription: string | null;
  issuedAt: string | null;
  releasedAt: string | null;
  affectsDepartedCustodians: boolean;
  privilegeFlags: Record<string, boolean> | null;
}

export interface HoldDetailDTO extends HoldSummaryDTO {
  matterId: string;
  releasedById: string | null;
  releaseReason: string | null;
  createdById: string;
}

export interface HoldCustodianDTO {
  id: string;
  personId: string;
  personName: string;
  personEmail: string | null;
  acknowledgedAt: string | null;
  acknowledgmentMetadata: unknown | null;
  lastReAttestedAt: string | null;
  nextReAttestationDueAt: string | null;
  releasedAt: string | null;
  departureRecordedAt: string | null;
  dataSources: HoldDataSourceDTO[];
}

export interface HoldDataSourceDTO {
  id: string;
  type: string;
  displayLabel: string;
  preservationAction: string;
  preservationAppliedAt: string | null;
  preservationConfirmedAt: string | null;
  retentionPolicyConflict: boolean;
}

export interface HoldEventDTO {
  id: string;
  type: string;
  summary: string;
  actorId: string | null;
  actorType: string;
  occurredAt: string;
  resultingAuditLogId: string | null;
}

export interface HoldNoticeIssuanceDTO {
  id: string;
  templateId: string;
  templateName: string;
  templateVersion: number;
  bodyHashAtIssuance: string;
  recipientCount: number;
  issuedAt: string;
}

export interface HoldDefensibilityScoreDTO {
  holdId: string;
  computedAt: string;
  score: number;
  components: Record<
    string,
    { value: number; weight: number; gap: string | null }
  >;
  gaps: Array<{
    key: string;
    severity: "low" | "medium" | "high";
    message: string;
    count: number;
  }>;
}

export interface HoldWorkspaceCounts {
  custodians: number;
  custodiansAcknowledged: number;
  custodiansPending: number;
  custodiansOverdue: number;
  custodiansReleased: number;
  custodiansDeparted: number;
  dataSources: number;
  dataSourcesPreserved: number;
  dataSourcesItConfirmed: number;
  dataSourcesConflict: number;
  notices: number;
  events: number;
}

export interface HoldWorkspaceSummaryDTO {
  hold: HoldDetailDTO;
  counts: HoldWorkspaceCounts;
  lastActivityAt: string | null;
  nextReminderDueAt: string | null;
  cadenceDays: number;
}
