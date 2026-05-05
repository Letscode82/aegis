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
export { AdminM365Status } from "./admin-m365-status";

// Legal Hold core (sub-PR 4b)
export {
  HoldListTab,
  HoldDetailPage,
  HoldCreateForm,
  CustodianAttestationView,
  DefensibilityBadge,
  JurisdictionPills,
  StatusPill,
  defensibilityColor,
} from "./legal-hold";

// Legal Hold admin surfaces (sub-PR 4c.4)
export { HoldPolicyEditor } from "./legal-hold/HoldPolicyEditor";
export { HoldScopeTemplatesAdmin } from "./legal-hold/HoldScopeTemplatesAdmin";
export { NoticeTemplateEditor } from "./legal-hold/NoticeTemplateEditor";
export { CustodianPortalHome } from "./legal-hold/CustodianPortalHome";

// Legal Hold maintenance jobs admin (sub-PR 4c.1)
export { JobsAdmin } from "./legal-hold/JobsAdmin";

// Notice template admin list (sub-PR 4c.1)
export { NoticeTemplatesAdmin } from "./legal-hold/NoticeTemplatesAdmin";

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

export type {
  HoldSummaryDTO,
  HoldDetailDTO,
  HoldCustodianDTO,
  HoldDataSourceDTO,
  HoldEventDTO,
  HoldNoticeIssuanceDTO,
  HoldDefensibilityScoreDTO,
  LegalHoldStatusKey,
} from "./legal-hold";
