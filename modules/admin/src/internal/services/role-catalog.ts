/**
 * Static role + permission catalog metadata.
 *
 * Role descriptions, role badge colours, and permission grouping
 * (matter / intake / contracts / …) live here. The canonical
 * Permission enum and ROLE_PERMISSIONS bundles are the single source
 * of truth for what exists; this module adds the labelling and
 * grouping the admin UI needs to render.
 */
import { Permission, type RoleName } from "@aegis/auth";

export const ROLE_DESCRIPTIONS: Record<RoleName, string> = {
  admin: "Platform owner. All 37 permissions including admin domain.",
  gc: "General Counsel. Full reads + most writes + audit + manage users.",
  attorney: "In-house attorney. Reads + writes within assigned matters.",
  paralegal: "Paralegals. Reads + intake/matter writes; no spend approvals.",
  legal_ops: "Legal operations. Reads + audit + budgets + governance attest.",
  requester: "Internal filer. Files intake tickets + reads own.",
  external_counsel: "Outside firm. Reads assigned matters + custodian view.",
  viewer: "Auditor / observer. All reads only.",
};

export const ROLE_BADGE_COLORS: Record<RoleName, string> = {
  admin: "#C8463D", // red
  gc: "#E8793B", // orange
  attorney: "#6B8EC4", // blue
  paralegal: "#6BA4A4", // teal
  legal_ops: "#A06C9A", // purple
  requester: "#8B93AE", // gray
  external_counsel: "#5A6380", // slate
  viewer: "#7FA780", // green
};

/**
 * Permission groupings keyed by domain. Order matters — this is the
 * order the admin UI's collapsible sections render in.
 */
export interface PermissionGroup {
  domain: string;
  description: string;
  permissions: Permission[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    domain: "Intake",
    description: "Legal intake tickets, agent recommendations, triage.",
    permissions: [
      Permission.IntakeCreateTicket,
      Permission.IntakeReadOwnTickets,
      Permission.IntakeReadAllTickets,
      Permission.IntakeApproveRecommendation,
      Permission.IntakeRejectRecommendation,
      Permission.IntakeCloseTicket,
    ],
  },
  {
    domain: "Matter",
    description: "Matter Management — incl. Legal Hold workflow.",
    permissions: [
      Permission.MatterReadAll,
      Permission.MatterReadAssigned,
      Permission.MatterCreate,
      Permission.MatterUpdate,
      Permission.MatterClose,
      Permission.MatterLegalHoldIssue,
      Permission.MatterLegalHoldRelease,
      Permission.MatterLegalHoldCustodianView,
    ],
  },
  {
    domain: "Contracts",
    description: "Contract lifecycle — drafting, approval, execution.",
    permissions: [
      Permission.ContractsReadAll,
      Permission.ContractsCreate,
      Permission.ContractsApprove,
      Permission.ContractsExecute,
    ],
  },
  {
    domain: "Spend",
    description: "Legal Spend & Counsel — invoices, budgets, vendors.",
    permissions: [
      Permission.SpendReadAll,
      Permission.SpendReadMatterBudget,
      Permission.SpendApproveInvoice,
      Permission.SpendRejectInvoice,
    ],
  },
  {
    domain: "Privacy",
    description: "Privacy & Compliance Operations — DSAR, DPIA, incidents.",
    permissions: [
      Permission.PrivacyDsarRead,
      Permission.PrivacyDsarFulfill,
      Permission.PrivacyDpiaRead,
      Permission.PrivacyDpiaApprove,
      Permission.PrivacyIncidentRespond,
    ],
  },
  {
    domain: "Knowledge",
    description: "Company Brain — knowledge entries and moderation.",
    permissions: [
      Permission.KnowledgeReadAll,
      Permission.KnowledgeContribute,
      Permission.KnowledgeModerate,
    ],
  },
  {
    domain: "Regulatory",
    description: "Regulatory Compliance — horizon-scan + obligation flagging.",
    permissions: [
      Permission.RegulatoryRead,
      Permission.RegulatoryFlagObligation,
    ],
  },
  {
    domain: "Governance",
    description: "Governance — policies, committees, attestations.",
    permissions: [
      Permission.GovernanceRead,
      Permission.GovernanceAttest,
    ],
  },
  {
    domain: "Audit",
    description: "Cryptographic audit ledger.",
    permissions: [Permission.AuditReadAll],
  },
  {
    domain: "Admin",
    description: "Platform administration — users, roles.",
    permissions: [Permission.AdminManageUsers, Permission.AdminManageRoles],
  },
];

/**
 * Human-friendly labels for individual permissions. Falls back to the
 * raw enum value if missing — every UI surface should call through
 * this helper rather than rendering the raw string.
 */
export const PERMISSION_LABELS: Partial<Record<Permission, string>> = {
  [Permission.IntakeCreateTicket]: "File a new intake ticket",
  [Permission.IntakeReadOwnTickets]: "Read tickets you filed",
  [Permission.IntakeReadAllTickets]: "Read every ticket in the org",
  [Permission.IntakeApproveRecommendation]: "Approve agent recommendations",
  [Permission.IntakeRejectRecommendation]: "Reject agent recommendations",
  [Permission.IntakeCloseTicket]: "Close intake tickets",
  [Permission.MatterReadAll]: "Read every matter",
  [Permission.MatterReadAssigned]: "Read matters where you're a party",
  [Permission.MatterCreate]: "Open a new matter",
  [Permission.MatterUpdate]: "Edit matters",
  [Permission.MatterClose]: "Close matters",
  [Permission.MatterLegalHoldIssue]: "Issue a legal hold",
  [Permission.MatterLegalHoldRelease]: "Release a legal hold",
  [Permission.MatterLegalHoldCustodianView]: "Custodian-side hold view",
  [Permission.ContractsReadAll]: "Read every contract",
  [Permission.ContractsCreate]: "Draft a contract",
  [Permission.ContractsApprove]: "Approve contracts",
  [Permission.ContractsExecute]: "Execute (sign) contracts",
  [Permission.SpendReadAll]: "Read every invoice",
  [Permission.SpendReadMatterBudget]: "Read budget on assigned matters",
  [Permission.SpendApproveInvoice]: "Approve invoices",
  [Permission.SpendRejectInvoice]: "Reject invoices",
  [Permission.PrivacyDsarRead]: "Read DSARs",
  [Permission.PrivacyDsarFulfill]: "Fulfill a DSAR",
  [Permission.PrivacyDpiaRead]: "Read DPIAs",
  [Permission.PrivacyDpiaApprove]: "Approve a DPIA",
  [Permission.PrivacyIncidentRespond]: "Respond to a privacy incident",
  [Permission.KnowledgeReadAll]: "Read all knowledge entries",
  [Permission.KnowledgeContribute]: "Contribute knowledge entries",
  [Permission.KnowledgeModerate]: "Moderate knowledge entries",
  [Permission.RegulatoryRead]: "Read regulatory items",
  [Permission.RegulatoryFlagObligation]: "Flag a new regulatory obligation",
  [Permission.GovernanceRead]: "Read governance materials",
  [Permission.GovernanceAttest]: "Attest to a policy / committee item",
  [Permission.AuditReadAll]: "Read the platform audit ledger",
  [Permission.AdminManageUsers]: "Add / remove / edit users",
  [Permission.AdminManageRoles]: "Edit role permission sets",
};

export function permissionLabel(p: Permission): string {
  return PERMISSION_LABELS[p] ?? String(p);
}
