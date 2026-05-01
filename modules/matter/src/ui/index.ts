/**
 * @aegis/matter/ui — public UI surface.
 *
 * apps/web pages compose these components; sibling modules (Intake)
 * may consume them through this entry point but must not deep-import
 * the implementation files.
 */
export { MatterDashboard } from "./matter-dashboard";
export { MatterListView } from "./matter-list-view";
export { MatterDetailView } from "./matter-detail-view";
export { MatterCreateForm } from "./matter-create-form";
export { LegalHoldPanel } from "./legal-hold-panel";
export { AuditLogView } from "./audit-log-view";

export type {
  MatterDTO,
  MatterPartyDTO,
  MatterTaskDTO,
  TimelineEntryDTO,
  ChecklistItemDTO,
  DashboardStatsDTO,
  AuditLogDTO,
  ChainVerificationDTO,
} from "./types";
