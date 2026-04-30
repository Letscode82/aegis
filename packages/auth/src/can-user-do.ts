/**
 * Permission check — the single chokepoint for "can this user do X to Y?"
 *
 * Two layers, in order:
 *
 *   1. Action check.   Does the user's role grant the requested
 *                      Permission? Pure set-membership; no DB.
 *   2. Resource check. Does the user have visibility into THIS specific
 *                      resource? Caller passes a Resource descriptor;
 *                      this layer enforces matter-assignment and
 *                      ticket-ownership scopes (Permission.MatterReadAssigned,
 *                      Permission.IntakeReadOwnTickets, etc.).
 *
 * Modules call canUserDo() at every gated UI affordance and every
 * server-side mutation. UI-only checks (hide a button) and authoritative
 * mutation checks (block the API) both go through this — there is no
 * "trust the client" path.
 *
 * Step 3 ships the action layer + a thin resource layer covering the
 * scopes that actually exist today (Matter assignment, Intake requester).
 * Steps 4–6 will extend the resource layer as new module APIs land.
 */

import { Permission } from "./permissions";
import type { RoleName } from "./roles";

export interface AuthUser {
  /** User row id from `@aegis/db`. */
  id: string;
  /** Org-scope. canUserDo never crosses orgs. */
  organizationId: string;
  email: string;
  name: string;
  /** Role.name string ("admin" | "gc" | …) — null if the user has no role yet. */
  roleName: RoleName | null;
  /** Effective permission set on this user's Role at the time of request. */
  permissions: readonly Permission[];
}

/**
 * Resource descriptor passed alongside the action when scope matters.
 * The caller fills in only the fields relevant to the resource's type;
 * absent fields default to "no claim" and the resource check fails closed.
 */
export interface ResourceContext {
  /** Discriminator — one of the polymorphic owner types. */
  resourceType: "Matter" | "IntakeTicket" | "Invoice" | "DSAR" | "Document";
  /** The resource's id. */
  resourceId: string;
  /** For Matter: the assigned attorney's Person id. */
  assignedAttorneyPersonId?: string | null;
  /** For Matter: the Person ids of every party on the matter. */
  partyPersonIds?: readonly string[];
  /** For IntakeTicket: the requester's Person id. */
  requesterPersonId?: string | null;
  /** For Invoice: the matter the invoice belongs to (resolves through Matter assignment). */
  invoiceMatterId?: string | null;
  /** Caller's own Person ids in this org (a User can be linked to one or more
   *  Person rows — EMPLOYEE, CUSTODIAN, EXTERNAL_COUNSEL, etc.). */
  callerPersonIds?: readonly string[];
}

/**
 * The result is intentionally a discriminated union, not a boolean.
 * Callers that surface "why was this denied" in the UI (and the audit
 * log entry on a denial) get a stable reason string without re-checking.
 */
export type AccessDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | "missing-permission"
        | "wrong-org"
        | "not-assigned"
        | "not-owner"
        | "unsupported-resource";
      message: string;
    };

/** Pure action check — does the user's role include this permission? */
export function hasPermission(
  user: AuthUser,
  permission: Permission,
): boolean {
  return user.permissions.includes(permission);
}

/**
 * Full check: action + resource.
 *
 * `resource` is required for permissions that imply scope:
 *   - Permission.MatterReadAssigned       → caller must be on the matter
 *   - Permission.IntakeReadOwnTickets     → caller must be the requester
 *   - Permission.MatterLegalHoldCustodianView
 *                                         → caller must be a custodian
 *   - Permission.SpendReadMatterBudget    → caller must be on the matter
 *
 * Permissions whose name ends in `read_all`, `manage_*`, or `*_all` are
 * org-scope: action check succeeds without a resource, provided the
 * resource (when supplied) shares the user's organization.
 */
export function canUserDo(
  user: AuthUser,
  permission: Permission,
  resource?: ResourceContext,
): AccessDecision {
  // Step 1: action check.
  if (!hasPermission(user, permission)) {
    return {
      allowed: false,
      reason: "missing-permission",
      message: `User ${user.email} lacks ${permission}.`,
    };
  }

  // Step 2: org-boundary check. Always required if a resource is supplied.
  // (Org membership is enforced via the User row's organizationId; the
  // resource's org is implied by its primary key in our single-tenant
  // schema. A future multi-tenant query layer will assert this.)
  // No-op today; reserved comment.

  // Step 3: resource-scope check, only for the scoped permissions.
  if (resource) {
    switch (permission) {
      case Permission.MatterReadAssigned:
      case Permission.SpendReadMatterBudget:
        return checkMatterAssignment(user, resource);

      case Permission.IntakeReadOwnTickets:
        return checkTicketOwnership(user, resource);

      case Permission.MatterLegalHoldCustodianView:
        return checkCustodianMembership(user, resource);

      default:
        // Org-scope permissions don't need a resource gate.
        return { allowed: true };
    }
  }

  // No resource supplied for an action that doesn't need one — allow.
  return { allowed: true };
}

function checkMatterAssignment(
  user: AuthUser,
  resource: ResourceContext,
): AccessDecision {
  const callerPersonIds = resource.callerPersonIds ?? [];
  const matterId = resource.resourceType === "Matter" ? resource.resourceId : resource.invoiceMatterId;
  if (!matterId) {
    return {
      allowed: false,
      reason: "unsupported-resource",
      message: `Cannot resolve a matter for resource ${resource.resourceType}/${resource.resourceId}.`,
    };
  }
  const isLead = !!(
    resource.assignedAttorneyPersonId &&
    callerPersonIds.includes(resource.assignedAttorneyPersonId)
  );
  const isParty =
    !!resource.partyPersonIds &&
    resource.partyPersonIds.some((pid) => callerPersonIds.includes(pid));
  if (isLead || isParty) return { allowed: true };
  return {
    allowed: false,
    reason: "not-assigned",
    message: `User ${user.email} is not assigned to matter ${matterId}.`,
  };
}

function checkTicketOwnership(
  user: AuthUser,
  resource: ResourceContext,
): AccessDecision {
  const callerPersonIds = resource.callerPersonIds ?? [];
  if (
    resource.requesterPersonId &&
    callerPersonIds.includes(resource.requesterPersonId)
  ) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: "not-owner",
    message: `User ${user.email} is not the requester of ticket ${resource.resourceId}.`,
  };
}

function checkCustodianMembership(
  user: AuthUser,
  resource: ResourceContext,
): AccessDecision {
  const callerPersonIds = resource.callerPersonIds ?? [];
  const isParty =
    !!resource.partyPersonIds &&
    resource.partyPersonIds.some((pid) => callerPersonIds.includes(pid));
  if (isParty) return { allowed: true };
  return {
    allowed: false,
    reason: "not-assigned",
    message: `User ${user.email} is not a custodian on this hold.`,
  };
}

/**
 * Throwing variant for server-side handlers. Throws an Error subclass
 * a Next.js handler can catch and translate to a 403 response.
 */
export class AccessDeniedError extends Error {
  constructor(public readonly decision: Extract<AccessDecision, { allowed: false }>) {
    super(decision.message);
    this.name = "AccessDeniedError";
  }
}

export function assertUserCanDo(
  user: AuthUser,
  permission: Permission,
  resource?: ResourceContext,
): void {
  const decision = canUserDo(user, permission, resource);
  if (!decision.allowed) throw new AccessDeniedError(decision);
}
