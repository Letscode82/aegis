/**
 * User-management services.
 *
 * Every mutation writes an AuditLog row. The cryptographic chain
 * makes permission/role tampering after the fact detectable —
 * meta-defensibility for the platform's own access control.
 *
 * Guards
 *  - The last admin user cannot be suspended (would lock the org out
 *    of admin tooling). LastAdminProtectedError when the caller tries.
 */
import {
  Prisma,
  logAudit,
  prisma,
  type Role,
  type User,
} from "@aegis/db";
import type { RoleName } from "@aegis/auth";
import type {
  AdminActor,
  InviteUserInput,
  UserActivityRow,
  UserListFilter,
  UserListPage,
  UserStatus,
  UserSummary,
} from "../types";

export class LastAdminProtectedError extends Error {
  constructor() {
    super(
      "Cannot suspend or remove the last admin user — at least one admin must remain to manage the org.",
    );
    this.name = "LastAdminProtectedError";
  }
}

export class UserAlreadyExistsError extends Error {
  constructor(email: string) {
    super(`A user with email ${email} already exists in this organization.`);
    this.name = "UserAlreadyExistsError";
  }
}

export class UserNotFoundError extends Error {
  constructor(id: string) {
    super(`User ${id} not found in organization.`);
    this.name = "UserNotFoundError";
  }
}

function deriveStatus(u: { suspendedAt: Date | null; lastLoginAt: Date | null }): UserStatus {
  if (u.suspendedAt) return "SUSPENDED";
  if (!u.lastLoginAt) return "PENDING_INVITE";
  return "ACTIVE";
}

function toSummary(
  u: User & { role: Role | null },
): UserSummary {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    roleId: u.roleId,
    roleName: (u.role?.name ?? null) as RoleName | null,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    suspendedAt: u.suspendedAt?.toISOString() ?? null,
    status: deriveStatus(u),
    createdAt: u.createdAt.toISOString(),
  };
}

export async function listUsersService(
  organizationId: string,
  filter: UserListFilter | undefined,
): Promise<UserListPage> {
  const page = Math.max(1, filter?.page ?? 1);
  const pageSize = Math.max(1, Math.min(200, filter?.pageSize ?? 50));

  const where: Prisma.UserWhereInput = { organizationId };
  if (filter?.roleId) where.roleId = filter.roleId;
  if (filter?.status === "SUSPENDED") {
    where.suspendedAt = { not: null };
  } else if (filter?.status === "PENDING_INVITE") {
    where.suspendedAt = null;
    where.lastLoginAt = null;
  } else if (filter?.status === "ACTIVE") {
    where.suspendedAt = null;
    where.lastLoginAt = { not: null };
  }
  if (filter?.search?.trim()) {
    const q = filter.search.trim();
    where.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { role: true },
      orderBy: [{ createdAt: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    rows: rows.map(toSummary),
    total,
    page,
    pageSize,
  };
}

export async function getUserService(
  id: string,
  organizationId: string,
): Promise<UserSummary> {
  const u = await prisma.user.findFirst({
    where: { id, organizationId },
    include: { role: true },
  });
  if (!u) throw new UserNotFoundError(id);
  return toSummary(u);
}

export async function inviteUserService(
  input: InviteUserInput,
  actor: AdminActor,
): Promise<UserSummary> {
  const email = input.email.trim().toLowerCase();
  if (!email) throw new Error("email is required");
  const role = await prisma.role.findFirst({
    where: { id: input.roleId, organizationId: actor.organizationId },
  });
  if (!role) throw new Error(`Role ${input.roleId} not found in organization`);

  const existing = await prisma.user.findUnique({
    where: {
      organizationId_email: {
        organizationId: actor.organizationId,
        email,
      },
    },
  });
  if (existing) throw new UserAlreadyExistsError(email);

  const created = await prisma.user.create({
    data: {
      organizationId: actor.organizationId,
      email,
      name: input.name.trim() || email,
      roleId: input.roleId,
    },
    include: { role: true },
  });

  await logAudit({
    organizationId: actor.organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "user.invited",
    resourceType: "User",
    resourceId: created.id,
    afterJson: {
      email: created.email,
      name: created.name,
      roleId: created.roleId,
      roleName: created.role?.name ?? null,
    },
    metadata: { source: "admin-ui" },
  });

  return toSummary(created);
}

export async function updateUserRoleService(
  userId: string,
  newRoleId: string,
  actor: AdminActor,
): Promise<UserSummary> {
  const before = await prisma.user.findFirst({
    where: { id: userId, organizationId: actor.organizationId },
    include: { role: true },
  });
  if (!before) throw new UserNotFoundError(userId);

  const newRole = await prisma.role.findFirst({
    where: { id: newRoleId, organizationId: actor.organizationId },
  });
  if (!newRole) throw new Error(`Role ${newRoleId} not found in organization`);

  // Last-admin guard — if the user being demoted is the only admin, refuse.
  if (before.role?.name === "admin" && newRole.name !== "admin") {
    await assertNotLastAdmin(actor.organizationId, userId);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { roleId: newRoleId },
    include: { role: true },
  });

  await logAudit({
    organizationId: actor.organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "user.role.changed",
    resourceType: "User",
    resourceId: userId,
    beforeJson: {
      roleId: before.roleId,
      roleName: before.role?.name ?? null,
    },
    afterJson: {
      roleId: updated.roleId,
      roleName: updated.role?.name ?? null,
    },
    metadata: { source: "admin-ui" },
  });

  return toSummary(updated);
}

async function assertNotLastAdmin(
  organizationId: string,
  excludeUserId: string,
): Promise<void> {
  const otherAdmins = await prisma.user.count({
    where: {
      organizationId,
      suspendedAt: null,
      role: { name: "admin" },
      id: { not: excludeUserId },
    },
  });
  if (otherAdmins === 0) throw new LastAdminProtectedError();
}

export async function suspendUserService(
  userId: string,
  actor: AdminActor,
): Promise<UserSummary> {
  const before = await prisma.user.findFirst({
    where: { id: userId, organizationId: actor.organizationId },
    include: { role: true },
  });
  if (!before) throw new UserNotFoundError(userId);
  if (before.suspendedAt) return toSummary(before);

  if (before.role?.name === "admin") {
    await assertNotLastAdmin(actor.organizationId, userId);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { suspendedAt: new Date() },
    include: { role: true },
  });

  await logAudit({
    organizationId: actor.organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "user.suspended",
    resourceType: "User",
    resourceId: userId,
    beforeJson: { suspendedAt: null, roleName: before.role?.name ?? null },
    afterJson: { suspendedAt: updated.suspendedAt?.toISOString() ?? null },
    metadata: { source: "admin-ui" },
  });

  return toSummary(updated);
}

export async function reactivateUserService(
  userId: string,
  actor: AdminActor,
): Promise<UserSummary> {
  const before = await prisma.user.findFirst({
    where: { id: userId, organizationId: actor.organizationId },
    include: { role: true },
  });
  if (!before) throw new UserNotFoundError(userId);
  if (!before.suspendedAt) return toSummary(before);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { suspendedAt: null },
    include: { role: true },
  });

  await logAudit({
    organizationId: actor.organizationId,
    actorId: actor.id,
    actorType: "USER",
    action: "user.reactivated",
    resourceType: "User",
    resourceId: userId,
    beforeJson: {
      suspendedAt: before.suspendedAt.toISOString(),
    },
    afterJson: { suspendedAt: null },
    metadata: { source: "admin-ui" },
  });

  return toSummary(updated);
}

export async function getUserActivityService(
  userId: string,
  organizationId: string,
  limit = 50,
): Promise<UserActivityRow[]> {
  const u = await prisma.user.findFirst({
    where: { id: userId, organizationId },
    select: { id: true },
  });
  if (!u) throw new UserNotFoundError(userId);

  const rows = await prisma.auditLog.findMany({
    where: { organizationId, actorId: userId },
    orderBy: [{ chainPosition: "desc" }],
    take: Math.max(1, Math.min(500, limit)),
  });

  return rows.map((r) => ({
    id: r.id,
    chainPosition: r.chainPosition.toString(),
    timestamp: r.timestamp.toISOString(),
    action: r.action,
    resourceType: r.resourceType,
    resourceId: r.resourceId,
  }));
}
