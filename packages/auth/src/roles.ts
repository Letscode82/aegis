/**
 * The eight canonical AEGIS roles and their permission sets.
 *
 * Roles are org-scoped strings persisted in `Role.name` (per the schema's
 * unique constraint on (organizationId, name)). The mapping below is the
 * default permission set; the seed inserts these on first run, and an
 * admin can extend any role's permissions through the role-management
 * UI in a later step.
 *
 * "Default" here means: the minimum bundle that makes the role's stated
 * job possible. Real-world tenants may dial up specific people via
 * additional permissions on the Role record — this catalog is the
 * starting point, not a ceiling.
 */

import { Permission } from "./permissions";

export type RoleName =
  | "admin"
  | "gc"
  | "attorney"
  | "paralegal"
  | "legal_ops"
  | "requester"
  | "external_counsel"
  | "viewer";

export const ALL_ROLES: readonly RoleName[] = Object.freeze([
  "admin",
  "gc",
  "attorney",
  "paralegal",
  "legal_ops",
  "requester",
  "external_counsel",
  "viewer",
]);

/** Display labels — surface in role pickers + the Cockpit "from" column. */
export const ROLE_DISPLAY_NAMES: Readonly<Record<RoleName, string>> =
  Object.freeze({
    admin: "Admin",
    gc: "General Counsel",
    attorney: "Attorney",
    paralegal: "Paralegal",
    legal_ops: "Legal Operations",
    requester: "Requester",
    external_counsel: "External Counsel",
    viewer: "Viewer",
  });

/** Short role descriptions — used in role-management UI tooltips. */
export const ROLE_DESCRIPTIONS: Readonly<Record<RoleName, string>> =
  Object.freeze({
    admin: "Full platform access including user/role management.",
    gc: "Senior decision-maker. All read + most writes + escalation authority.",
    attorney: "Attorney scoped to assigned matters; full intake/contracts/spend authority within scope.",
    paralegal: "Read everything in the org; write to intake/matter; no spend approvals.",
    legal_ops: "Workflow + budget management. Read everything, manage operations.",
    requester: "Files tickets and reads their own. No other writes.",
    external_counsel: "Outside counsel — read assigned matters, submit invoices.",
    viewer: "Read-only across the whole org.",
  });

// Permission bundles, defined separately so they can be composed.
const READ_ALL_BUNDLE: readonly Permission[] = [
  Permission.IntakeReadAllTickets,
  Permission.MatterReadAll,
  Permission.ContractsReadAll,
  Permission.SpendReadAll,
  Permission.SpendReadMatterBudget,
  Permission.PrivacyDsarRead,
  Permission.PrivacyDpiaRead,
  Permission.KnowledgeReadAll,
  Permission.RegulatoryRead,
  Permission.GovernanceRead,
];

const ATTORNEY_WRITE_BUNDLE: readonly Permission[] = [
  Permission.IntakeApproveRecommendation,
  Permission.IntakeRejectRecommendation,
  Permission.IntakeCloseTicket,
  Permission.MatterCreate,
  Permission.MatterUpdate,
  Permission.MatterClose,
  Permission.MatterLegalHoldIssue,
  Permission.MatterLegalHoldRelease,
  Permission.ContractsCreate,
  Permission.ContractsApprove,
  Permission.SpendApproveInvoice,
  Permission.SpendRejectInvoice,
  Permission.PrivacyDsarFulfill,
];

/**
 * Default permission set per role.
 *
 * `admin` MUST contain every Permission — the seed `db:seed` writes the
 * admin role's permission JSON from this exact array. The runtime
 * assertion in permissions.ts cross-checks the seed strings, so any
 * future renames trip both gates.
 */
export const ROLE_PERMISSIONS: Readonly<
  Record<RoleName, readonly Permission[]>
> = Object.freeze({
  admin: Object.freeze([
    // Spread every Permission — admin is the superuser bundle.
    ...Object.values(Permission),
  ]),

  gc: Object.freeze([
    ...READ_ALL_BUNDLE,
    ...ATTORNEY_WRITE_BUNDLE,
    Permission.MatterLegalHoldCustodianView,
    Permission.PrivacyDpiaApprove,
    Permission.PrivacyIncidentRespond,
    Permission.GovernanceAttest,
    Permission.RegulatoryFlagObligation,
    Permission.AuditReadAll,
    Permission.AdminManageUsers,
  ]),

  attorney: Object.freeze([
    Permission.IntakeReadAllTickets,
    Permission.IntakeReadOwnTickets,
    Permission.MatterReadAssigned,
    Permission.ContractsReadAll,
    Permission.SpendReadMatterBudget,
    Permission.PrivacyDsarRead,
    Permission.KnowledgeReadAll,
    Permission.RegulatoryRead,
    Permission.GovernanceRead,
    ...ATTORNEY_WRITE_BUNDLE,
    Permission.MatterLegalHoldCustodianView,
  ]),

  paralegal: Object.freeze([
    ...READ_ALL_BUNDLE,
    Permission.IntakeCreateTicket,
    Permission.IntakeApproveRecommendation,
    Permission.IntakeRejectRecommendation,
    Permission.IntakeCloseTicket,
    Permission.MatterCreate,
    Permission.MatterUpdate,
    Permission.MatterLegalHoldCustodianView,
    Permission.KnowledgeContribute,
  ]),

  legal_ops: Object.freeze([
    ...READ_ALL_BUNDLE,
    Permission.IntakeCloseTicket,
    Permission.AuditReadAll,
    // Budgets / workflows — reuse spend approval as the stand-in
    // until the workflow package ships its own Permissions.
    Permission.SpendReadMatterBudget,
    Permission.KnowledgeContribute,
    Permission.GovernanceAttest,
  ]),

  requester: Object.freeze([
    Permission.IntakeCreateTicket,
    Permission.IntakeReadOwnTickets,
  ]),

  external_counsel: Object.freeze([
    Permission.MatterReadAssigned,
    Permission.MatterLegalHoldCustodianView,
    Permission.SpendReadMatterBudget,
  ]),

  viewer: Object.freeze([...READ_ALL_BUNDLE]),
});

// Sanity gate: admin must be the full permission set.
{
  const adminCount = ROLE_PERMISSIONS.admin.length;
  const allCount = Object.values(Permission).length;
  if (adminCount !== allCount) {
    throw new Error(
      `[@aegis/auth] admin role must include every Permission. ` +
        `Found ${adminCount}, expected ${allCount}.`,
    );
  }
}
