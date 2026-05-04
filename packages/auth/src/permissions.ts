/**
 * Canonical permission catalog for AEGIS.
 *
 * The single source of truth for what a user can do. Every gated UI
 * affordance and every server-side mutation calls `canUserDo()` (or its
 * equivalent) using a value from this enum. Modules do NOT define their
 * own permission strings — they pick from this list.
 *
 * Stable contract:
 *   - Enum values are exact strings persisted in `Role.permissions` JSON.
 *     Renaming a value is a breaking change against the seeded admin
 *     role and any production tenant. Add new values; never repurpose
 *     existing ones.
 *   - The 20 strings the Step 2 seed admin role carries MUST appear here
 *     verbatim. The carryover audit confirmed each one maps to an enum
 *     value below. Renaming any of those would silently break demo seed
 *     idempotency on next run.
 *
 * Naming convention:
 *   <module>:<verb>[_<scope>]
 *   examples:
 *     intake:create_ticket
 *     matter:legal_hold:issue
 *     spend:approve_invoice
 *     admin:manage_users
 */

export enum Permission {
  // ── Intake ─────────────────────────────────────────────────────────
  IntakeCreateTicket           = "intake:create_ticket",
  IntakeReadOwnTickets         = "intake:read_own_tickets",
  IntakeReadAllTickets         = "intake:read_all_tickets",
  IntakeApproveRecommendation  = "intake:approve_recommendation",
  IntakeRejectRecommendation   = "intake:reject_recommendation",
  IntakeCloseTicket            = "intake:close_ticket",

  // ── Matter Management ──────────────────────────────────────────────
  MatterReadAll                = "matter:read_all",
  MatterReadAssigned           = "matter:read_assigned",
  MatterCreate                 = "matter:create",
  MatterUpdate                 = "matter:update",
  MatterClose                  = "matter:close",
  MatterLegalHoldIssue         = "matter:legal_hold:issue",
  MatterLegalHoldRelease       = "matter:legal_hold:release",
  MatterLegalHoldCustodianView = "matter:legal_hold:custodian_view",

  // ── Contracts (module ships in a later step) ───────────────────────
  ContractsReadAll             = "contracts:read_all",
  ContractsCreate              = "contracts:create",
  ContractsApprove             = "contracts:approve",
  ContractsExecute             = "contracts:execute",

  // ── Spend & Counsel ────────────────────────────────────────────────
  SpendReadAll                 = "spend:read_all",
  SpendReadMatterBudget        = "spend:read_matter_budget",
  SpendApproveInvoice          = "spend:approve_invoice",
  SpendRejectInvoice           = "spend:reject_invoice",

  // ── Privacy & Compliance Operations ────────────────────────────────
  PrivacyDsarRead              = "privacy:dsar:read",
  PrivacyDsarFulfill           = "privacy:dsar:fulfill",
  PrivacyDpiaRead              = "privacy:dpia:read",
  PrivacyDpiaApprove           = "privacy:dpia:approve",
  PrivacyIncidentRespond       = "privacy:incident:respond",

  // ── Knowledge Management (module ships in a later step) ────────────
  KnowledgeReadAll             = "knowledge:read_all",
  KnowledgeContribute          = "knowledge:contribute",
  KnowledgeModerate            = "knowledge:moderate",

  // ── Regulatory Compliance ──────────────────────────────────────────
  RegulatoryRead               = "regulatory:read",
  RegulatoryFlagObligation     = "regulatory:flag_obligation",

  // ── Governance ─────────────────────────────────────────────────────
  GovernanceRead               = "governance:read",
  GovernanceAttest             = "governance:attest",

  // ── Audit ──────────────────────────────────────────────────────────
  AuditReadAll                 = "audit:read_all",

  // ── Admin ──────────────────────────────────────────────────────────
  AdminManageUsers             = "admin:manage_users",
  AdminManageRoles             = "admin:manage_roles",
  /** Sub-PR 4c.4: hold-scope template CRUD. */
  AdminLegalHoldTemplatesManage = "admin:legal_hold:templates_manage",
}

/** Every permission value as a flat string array. Used by the seed and
 *  by tests to assert role coverage. */
export const ALL_PERMISSIONS: readonly Permission[] = Object.freeze(
  Object.values(Permission),
);

/**
 * The 20 permission strings the Step 2 demo seed admin role carries.
 * Kept here for the test suite to assert verbatim alignment; nothing
 * else should import this — it's a regression check, not a role.
 */
export const SEED_ADMIN_PERMISSIONS_VERBATIM: readonly string[] = Object.freeze([
  "intake:create_ticket",
  "intake:read_all_tickets",
  "intake:approve_recommendation",
  "intake:reject_recommendation",
  "intake:close_ticket",
  "matter:read_all",
  "matter:create",
  "matter:update",
  "matter:close",
  "matter:legal_hold:issue",
  "matter:legal_hold:release",
  "matter:legal_hold:custodian_view",
  "spend:read_all",
  "spend:approve_invoice",
  "spend:reject_invoice",
  "privacy:dsar:read",
  "privacy:dsar:fulfill",
  "audit:read_all",
  "admin:manage_users",
  "admin:manage_roles",
]);

// Fail at module load time if the canonical enum drifts from the seed
// strings. Any future edit that renames a seed string surfaces here.
{
  const enumValues = new Set<string>(Object.values(Permission));
  for (const seed of SEED_ADMIN_PERMISSIONS_VERBATIM) {
    if (!enumValues.has(seed)) {
      throw new Error(
        `[@aegis/auth] Permission enum is missing the seed admin permission "${seed}". ` +
          `The Step 2 demo seed depends on this exact string. ` +
          `Add it to Permission rather than renaming.`,
      );
    }
  }
}
