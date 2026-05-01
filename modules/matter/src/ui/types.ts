/**
 * UI-side types — narrow versions of the API DTOs that fit React props.
 * Server-rendered values are serialised through fetch(), so dates land
 * as ISO strings and bigints as decimal strings on the wire.
 */
import type {
  MatterStatus,
  MatterType,
  MatterPartyRole,
  MatterTaskStatus,
} from "@aegis/db";

export type { MatterStatus, MatterType, MatterPartyRole, MatterTaskStatus };

export interface MatterDTO {
  id: string;
  matterNumber: string | null;
  title: string;
  type: MatterType;
  status: MatterStatus;
  description: string | null;
  jurisdiction: string | null;
  estimatedValue: number | null;
  estimatedDurationDays: number | null;
  counterpartyId: string | null;
  parentMatterId: string | null;
  leadAttorneyId: string | null;
  openedAt: string;
  closedAt: string | null;
  closeoutChecklistJson: ChecklistItemDTO[];
}

export interface ChecklistItemDTO {
  key: string;
  label: string;
  required: boolean;
  completed?: boolean;
  completedAt?: string;
  completedBy?: string;
}

export interface MatterPartyDTO {
  id: string;
  matterId: string;
  personId: string;
  personName?: string;
  role: MatterPartyRole;
  addedAt: string;
}

export interface MatterTaskDTO {
  id: string;
  matterId: string;
  title: string;
  description: string | null;
  assigneeId: string | null;
  assigneeName?: string;
  dueDate: string | null;
  status: MatterTaskStatus;
  source: string;
  closeoutKey: string | null;
  dependsOnTaskId: string | null;
  completedAt: string | null;
  completedBy: string | null;
}

export interface TimelineEntryDTO {
  id: string;
  type: string;
  summary: string;
  occurredAt: string;
  actorId: string | null;
  actorName?: string;
}

export interface DashboardStatsDTO {
  totalDraft: number;
  totalOpen: number;
  totalActive: number;
  totalStayed: number;
  totalClosed: number;
  totalArchived: number;
  byStatus: Array<{ status: MatterStatus; count: number }>;
  byType: Array<{ type: MatterType; count: number }>;
  ageBuckets: Array<{ label: string; count: number }>;
  exposureSum: number;
  spentToDateSum: number;
}

export interface AuditLogDTO {
  id: string;
  chainPosition: string;
  timestamp: string;
  action: string;
  actorId: string | null;
  actorType: string;
  resourceType: string;
  resourceId: string;
  contentHash: string;
  prevHash: string;
  beforeJson: unknown;
  afterJson: unknown;
}

export interface ChainVerificationDTO {
  intact: boolean;
  rowsChecked: number;
  breaks: Array<{
    chainPosition: string;
    rowId: string;
    reason: string;
    details: string;
  }>;
  headHash: string | null;
  tailPrevHash: string | null;
  schemaVersion: number;
  verifiedAt: string;
  elapsedMs: number;
}
