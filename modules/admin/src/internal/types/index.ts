/**
 * Public input / output types for @aegis/admin.
 *
 * Status is derived rather than persisted: `suspendedAt != null` →
 * SUSPENDED, `lastLoginAt == null` → PENDING_INVITE, else ACTIVE.
 * The User table stores the raw timestamps; the API resolves status
 * server-side so the UI never has to recompute this rule.
 */
import type { Permission, RoleName } from "@aegis/auth";

export type { Permission, RoleName } from "@aegis/auth";

export type UserStatus = "ACTIVE" | "SUSPENDED" | "PENDING_INVITE";

export interface AdminActor {
  id: string;
  organizationId: string;
  email?: string;
  name?: string;
}

export interface UserSummary {
  id: string;
  email: string;
  name: string;
  roleId: string | null;
  roleName: RoleName | null;
  lastLoginAt: string | null;
  suspendedAt: string | null;
  status: UserStatus;
  createdAt: string;
}

export interface UserListFilter {
  roleId?: string;
  status?: UserStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface UserListPage {
  rows: UserSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface InviteUserInput {
  email: string;
  name: string;
  roleId: string;
}

export interface RoleSummary {
  id: string;
  name: RoleName;
  /** One-line description; sourced from a static map keyed on canonical role name. */
  description: string;
  permissions: Permission[];
  permissionCount: number;
  memberCount: number;
}

export interface RoleDetail extends RoleSummary {
  members: UserSummary[];
}

export interface PermissionImpact {
  permission: Permission;
  /** Members who would lose this permission if it's removed from the role. */
  affectedUserCount: number;
}

export interface UpdateRolePermissionsInput {
  roleId: string;
  permissions: Permission[];
}

export interface UserActivityRow {
  id: string;
  chainPosition: string;
  timestamp: string;
  action: string;
  resourceType: string;
  resourceId: string;
}
