/**
 * @aegis/admin — Platform admin module (users + roles).
 *
 * The ONLY file other modules / apps can import from. All mutations
 * write AuditLog rows so the cryptographic chain catches tampering
 * with permission grants — meta-defensibility for the platform's own
 * access control.
 *
 * Permission gating
 *   - User reads + writes      Permission.AdminManageUsers
 *   - Role reads + writes      Permission.AdminManageRoles
 * The HTTP handler at apps/web/pages/api/admin/* enforces these via
 * @aegis/auth.assertUserCanDo.
 *
 * Architectural guards
 *   - admin role must always carry every Permission. Editing it via
 *     updateRolePermissions() throws AdminSupersetViolationError if
 *     the candidate set is missing any.
 *   - The last admin user cannot be suspended or demoted. Throws
 *     LastAdminProtectedError.
 */
import {
  getUserActivityService,
  getUserService,
  inviteUserService,
  listUsersService,
  reactivateUserService,
  suspendUserService,
  updateUserRoleService,
} from "./src/internal/services/users";
import {
  diffPermissions,
  getRoleService,
  listRolesService,
  updateRolePermissionsService,
} from "./src/internal/services/roles";

import type {
  AdminActor,
  InviteUserInput,
  RoleDetail,
  RoleSummary,
  UpdateRolePermissionsInput,
  UserActivityRow,
  UserListFilter,
  UserListPage,
  UserSummary,
} from "./src/internal/types";

export type {
  AdminActor,
  InviteUserInput,
  Permission,
  RoleDetail,
  RoleName,
  RoleSummary,
  UpdateRolePermissionsInput,
  UserActivityRow,
  UserListFilter,
  UserListPage,
  UserStatus,
  UserSummary,
} from "./src/internal/types";

export {
  LastAdminProtectedError,
  UserAlreadyExistsError,
  UserNotFoundError,
} from "./src/internal/services/users";
export {
  AdminSupersetViolationError,
  RoleNotFoundError,
} from "./src/internal/services/roles";

export {
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  ROLE_BADGE_COLORS,
  ROLE_DESCRIPTIONS,
  permissionLabel,
  type PermissionGroup,
} from "./src/internal/services/role-catalog";

// ── Users ──────────────────────────────────────────────────────────

export async function listUsers(
  organizationId: string,
  filter?: UserListFilter,
): Promise<UserListPage> {
  return listUsersService(organizationId, filter);
}

export async function getUser(
  id: string,
  organizationId: string,
): Promise<UserSummary> {
  return getUserService(id, organizationId);
}

export async function inviteUser(
  input: InviteUserInput,
  actor: AdminActor,
): Promise<UserSummary> {
  return inviteUserService(input, actor);
}

export async function updateUserRole(
  userId: string,
  roleId: string,
  actor: AdminActor,
): Promise<UserSummary> {
  return updateUserRoleService(userId, roleId, actor);
}

export async function suspendUser(
  userId: string,
  actor: AdminActor,
): Promise<UserSummary> {
  return suspendUserService(userId, actor);
}

export async function reactivateUser(
  userId: string,
  actor: AdminActor,
): Promise<UserSummary> {
  return reactivateUserService(userId, actor);
}

export async function getUserActivity(
  userId: string,
  organizationId: string,
  limit?: number,
): Promise<UserActivityRow[]> {
  return getUserActivityService(userId, organizationId, limit);
}

// ── Roles ──────────────────────────────────────────────────────────

export async function listRoles(
  organizationId: string,
): Promise<RoleSummary[]> {
  return listRolesService(organizationId);
}

export async function getRole(
  id: string,
  organizationId: string,
): Promise<RoleDetail> {
  return getRoleService(id, organizationId);
}

export async function updateRolePermissions(
  input: UpdateRolePermissionsInput,
  actor: AdminActor,
): Promise<RoleSummary> {
  return updateRolePermissionsService(input.roleId, input.permissions, actor);
}

// Pure helper — exported for the UI's "members affected" preview.
export { diffPermissions };
