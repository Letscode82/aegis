/**
 * Role-management services.
 *
 * Permission updates write a before/after AuditLog row so the
 * cryptographic chain catches any tampering with permission grants —
 * meta-defensibility for the platform's own access control.
 *
 * Guards
 *  - The admin role must always carry every Permission. Removing
 *    any from admin throws AdminSupersetViolationError. (The
 *    @aegis/auth module-load assertion in roles.ts catches the
 *    static seed-time version of this; this guard catches the
 *    runtime "edit via the UI" path.)
 */
import {
  Prisma,
  logAudit,
  prisma,
} from "@aegis/db";
import { ALL_PERMISSIONS, Permission, type RoleName } from "@aegis/auth";
import type { AdminActor, RoleDetail, RoleSummary, UserSummary } from "../types";
import { ROLE_DESCRIPTIONS } from "./role-catalog";

export class AdminSupersetViolationError extends Error {
  public readonly missing: Permission[];
  constructor(missing: Permission[]) {
    super(
      `The admin role must carry every Permission. Missing: ${missing.join(", ")}`,
    );
    this.name = "AdminSupersetViolationError";
    this.missing = missing;
  }
}

export class RoleNotFoundError extends Error {
  constructor(id: string) {
    super(`Role ${id} not found in organization.`);
    this.name = "RoleNotFoundError";
  }
}

function permissionsFromJson(value: Prisma.JsonValue): Permission[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is Permission => typeof v === "string") as Permission[];
}

function deriveStatus(u: { suspendedAt: Date | null; lastLoginAt: Date | null }) {
  if (u.suspendedAt) return "SUSPENDED" as const;
  if (!u.lastLoginAt) return "PENDING_INVITE" as const;
  return "ACTIVE" as const;
}

export async function listRolesService(
  organizationId: string,
): Promise<RoleSummary[]> {
  const roles = await prisma.role.findMany({
    where: { organizationId },
    include: { _count: { select: { users: true } } },
    orderBy: [{ name: "asc" }],
  });
  return roles.map((r) => {
    const permissions = permissionsFromJson(r.permissions);
    return {
      id: r.id,
      name: r.name as RoleName,
      description:
        ROLE_DESCRIPTIONS[r.name as RoleName] ??
        "Custom role.",
      permissions,
      permissionCount: permissions.length,
      memberCount: r._count.users,
    };
  });
}

export async function getRoleService(
  id: string,
  organizationId: string,
): Promise<RoleDetail> {
  const role = await prisma.role.findFirst({
    where: { id, organizationId },
    include: {
      _count: { select: { users: true } },
      users: {
        include: { role: true },
        orderBy: [{ name: "asc" }],
      },
    },
  });
  if (!role) throw new RoleNotFoundError(id);
  const permissions = permissionsFromJson(role.permissions);

  const members: UserSummary[] = role.users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    roleId: u.roleId,
    roleName: (u.role?.name ?? null) as RoleName | null,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    suspendedAt: u.suspendedAt?.toISOString() ?? null,
    status: deriveStatus(u),
    createdAt: u.createdAt.toISOString(),
  }));

  return {
    id: role.id,
    name: role.name as RoleName,
    description:
      ROLE_DESCRIPTIONS[role.name as RoleName] ?? "Custom role.",
    permissions,
    permissionCount: permissions.length,
    memberCount: role._count.users,
    members,
  };
}

export async function updateRolePermissionsService(
  roleId: string,
  permissions: Permission[],
  actor: AdminActor,
): Promise<RoleSummary> {
  const role = await prisma.role.findFirst({
    where: { id: roleId, organizationId: actor.organizationId },
  });
  if (!role) throw new RoleNotFoundError(roleId);

  // Admin role superset invariant — match the module-load guard in
  // @aegis/auth.roles. The static guard catches seed-time drift; this
  // catches "I'll just toggle one off in the admin UI".
  if (role.name === "admin") {
    const required = new Set<string>(ALL_PERMISSIONS);
    const provided = new Set<string>(permissions);
    const missing = Array.from(required).filter((p) => !provided.has(p));
    if (missing.length > 0) {
      throw new AdminSupersetViolationError(missing as Permission[]);
    }
  }

  // De-dupe + drop unknown values to keep the JSON tidy.
  const knownSet = new Set<string>(ALL_PERMISSIONS);
  const cleaned = Array.from(new Set(permissions.filter((p) => knownSet.has(p))));

  const before = permissionsFromJson(role.permissions).sort();
  const after = [...cleaned].sort();

  const updated = await prisma.role.update({
    where: { id: roleId },
    data: { permissions: cleaned },
    include: { _count: { select: { users: true } } },
  });

  await logAudit({
    organizationId: actor.organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "role.permissions.updated",
    resourceType: "Role",
    resourceId: roleId,
    beforeJson: { name: role.name, permissions: before },
    afterJson: { name: updated.name, permissions: after },
    metadata: {
      source: "admin-ui",
      added: after.filter((p) => !before.includes(p)),
      removed: before.filter((p) => !after.includes(p)),
    },
  });

  return {
    id: updated.id,
    name: updated.name as RoleName,
    description:
      ROLE_DESCRIPTIONS[updated.name as RoleName] ?? "Custom role.",
    permissions: cleaned,
    permissionCount: cleaned.length,
    memberCount: updated._count.users,
  };
}

/**
 * Pure helper — given a role's current permission set and a candidate
 * new set, returns the diff suitable for the UI's "removing X will
 * affect N members" preview. Pure so it can be unit-tested without
 * the DB.
 */
export function diffPermissions(
  before: Permission[],
  after: Permission[],
): { added: Permission[]; removed: Permission[] } {
  const beforeSet = new Set<string>(before);
  const afterSet = new Set<string>(after);
  return {
    added: after.filter((p) => !beforeSet.has(p)),
    removed: before.filter((p) => !afterSet.has(p)),
  };
}
