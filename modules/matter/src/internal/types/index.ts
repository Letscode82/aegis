/**
 * Public-facing input / output types for @aegis/matter.
 *
 * These re-export from @aegis/db where the underlying entity already
 * exists, and define module-specific input shapes for the API surface.
 * Anything exported from `api.ts` is built out of these.
 */
import type { MatterStatus, MatterType } from "@aegis/db";

export type {
  Matter,
  MatterParty,
  MatterTask,
  MatterTypeConfig,
  MatterFieldTemplate,
  LegalHold,
  MatterStatus,
  MatterType,
  MatterTaskStatus,
  MatterPartyRole,
  MatterFieldType,
} from "@aegis/db";

/**
 * Caller identity for every state-changing matter API. Built from the
 * resolved user (Auth0 session OR dev fallback). Modules pass this
 * through; the matter API writes audit rows attributing to it.
 */
export interface MatterActor {
  id: string;
  organizationId: string;
  email?: string;
  name?: string;
}

export interface CreateMatterInput {
  title: string;
  type: MatterType;
  description?: string;
  jurisdiction?: string;
  /** Numeric value in matter's reporting currency (USD by default). */
  estimatedValue?: number;
  estimatedDurationDays?: number;
  counterpartyId?: string;
  parentMatterId?: string;
  /** Type-specific custom field values, keyed to MatterFieldTemplate.fieldKey. */
  customFields?: Record<string, unknown>;
  /** Optional lead attorney to assign at create time. */
  leadAttorneyPersonId?: string;
  /** When set, links the new matter to the originating intake ticket. */
  intakeTicketId?: string;
  /** Initial status (default: DRAFT). Drafts skip the numbering assignment. */
  initialStatus?: Extract<MatterStatus, "DRAFT" | "OPEN">;
}

export interface UpdateMatterInput {
  title?: string;
  description?: string | null;
  jurisdiction?: string | null;
  estimatedValue?: number | null;
  estimatedDurationDays?: number | null;
  counterpartyId?: string | null;
  parentMatterId?: string | null;
  customFields?: Record<string, unknown>;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  assigneePersonId?: string;
  dueDate?: Date;
  /** "manual" by default; set to "closeout" / "frcp:..." for derived tasks. */
  source?: string;
  /** When set, completing the task ticks the same key on the closeout checklist. */
  closeoutKey?: string;
  dependsOnTaskId?: string;
}

export interface CloseoutData {
  /** Free-text closure note included in audit log + matter timeline. */
  closureNote?: string;
}

export interface MatterFilter {
  status?: MatterStatus | MatterStatus[];
  type?: MatterType | MatterType[];
  leadAttorneyPersonId?: string;
  counterpartyId?: string;
  searchQuery?: string;
  page?: number;
  pageSize?: number;
}

export interface MatterPage<T> {
  rows: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface MatterMatch {
  matterId: string;
  matterNumber: string | null;
  title: string;
  type: MatterType;
  status: MatterStatus;
  /** 0–1, higher is more similar. Mocked-keyword in 4a; real AI in 4d. */
  similarityScore: number;
  /** Human-readable reason, surfaced in the UI ("Title overlap on 'Snowflake MSA'"). */
  reason: string;
}

export interface MatterCostBasis {
  matterId: string;
  budgetAllocated: number;
  spentToDate: number;
  /** When mocked (4a) this is "stub"; once Spend is wired it becomes "spend-api". */
  source: "stub" | "spend-api";
  currency: "USD";
}

export interface DashboardAgeBucket {
  label: string;
  count: number;
}

export interface DashboardStats {
  totalDraft: number;
  totalOpen: number;
  totalActive: number;
  totalStayed: number;
  totalClosed: number;
  totalArchived: number;
  byType: Array<{ type: MatterType; count: number }>;
  byStatus: Array<{ status: MatterStatus; count: number }>;
  ageBuckets: DashboardAgeBucket[];
  exposureSum: number;
  spentToDateSum: number;
}

export interface ReportPeriod {
  fromDate?: Date;
  toDate?: Date;
}

export interface AttorneyWorkloadRow {
  personId: string;
  personName: string;
  draftCount: number;
  openCount: number;
  activeCount: number;
  closedCount: number;
  totalEstimatedValue: number;
}

export interface AttorneyWorkloadReport {
  generatedAt: Date;
  period: ReportPeriod;
  rows: AttorneyWorkloadRow[];
}

export interface WorkloadReportRow {
  personId: string;
  personName: string;
  activeCount: number;
  /** Capacity band derived from active matter count. */
  capacityBand: "under" | "normal" | "over";
}

export interface WorkloadReport {
  generatedAt: Date;
  rows: WorkloadReportRow[];
}

/**
 * Closeout checklist item shape stored on Matter.closeoutChecklistJson and
 * sourced from MatterTypeConfig.closeoutChecklist. Items are { key, label,
 * required, completed, completedAt, completedBy }.
 */
export interface CloseoutChecklistItem {
  key: string;
  label: string;
  required: boolean;
  completed?: boolean;
  completedAt?: string;
  completedBy?: string;
}
