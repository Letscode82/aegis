/**
 * @aegis/auth — authentication, authorization, and the canonical
 * permission model.
 *
 * Public surface (this index):
 *   - Permission                        canonical enum
 *   - ALL_PERMISSIONS                   readonly array of every Permission
 *   - SEED_ADMIN_PERMISSIONS_VERBATIM   regression check (test-only)
 *   - RoleName, ALL_ROLES,              the eight canonical roles
 *     ROLE_DISPLAY_NAMES, ROLE_DESCRIPTIONS, ROLE_PERMISSIONS
 *   - AuthUser, ResourceContext         types passed to canUserDo
 *   - hasPermission                     pure action check
 *   - canUserDo                         action + resource check
 *   - assertUserCanDo                   throwing variant for handlers
 *   - AccessDeniedError, AccessDecision
 *
 * Server-side helpers (Auth0 client + session resolution) live at
 * `@aegis/auth/server` so client bundles don't pull in node-only deps.
 *
 * React hooks live at `@aegis/auth/react`.
 */

export {
  Permission,
  ALL_PERMISSIONS,
  SEED_ADMIN_PERMISSIONS_VERBATIM,
} from "./permissions";

export {
  type RoleName,
  ALL_ROLES,
  ROLE_DISPLAY_NAMES,
  ROLE_DESCRIPTIONS,
  ROLE_PERMISSIONS,
} from "./roles";

export {
  type AuthUser,
  type ResourceContext,
  type AccessDecision,
  hasPermission,
  canUserDo,
  assertUserCanDo,
  AccessDeniedError,
} from "./can-user-do";
