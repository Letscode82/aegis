/**
 * Admin module — DB-backed guard tests.
 *
 * Verifies the runtime guards in @aegis/admin require a live DB:
 *   - LastAdminProtectedError on suspending the only admin
 *   - LastAdminProtectedError on demoting the only admin
 *   - AdminSupersetViolationError when reducing the admin role
 *   - permission-update writes a chain-sealed AuditLog row with
 *     before/after permissions
 *
 * Runs via `pnpm --filter @aegis/admin run test:db` in CI's
 * db-integrity job alongside the audit-chain integration suite.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@aegis/db";
import { ALL_PERMISSIONS, Permission, ROLE_PERMISSIONS } from "@aegis/auth";
import {
  AdminSupersetViolationError,
  LastAdminProtectedError,
  suspendUser,
  updateRolePermissions,
  updateUserRole,
} from "../api";

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function makeOrg(prefix: string) {
  const org = await prisma.organization.create({
    data: { name: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
  });
  const adminRole = await prisma.role.create({
    data: {
      organizationId: org.id,
      name: "admin",
      permissions: ROLE_PERMISSIONS.admin as unknown as object,
    },
  });
  const attorneyRole = await prisma.role.create({
    data: {
      organizationId: org.id,
      name: "attorney",
      permissions: ROLE_PERMISSIONS.attorney as unknown as object,
    },
  });
  return { org, adminRole, attorneyRole };
}

async function cleanupOrg(orgId: string) {
  // The cascade delete crosses AuditLog whose immutability triggers
  // would otherwise refuse it — tests bypass via session_replication_role.
  await prisma.$executeRawUnsafe(`SET session_replication_role = replica`);
  try {
    await prisma.organization.delete({ where: { id: orgId } });
  } finally {
    await prisma.$executeRawUnsafe(`SET session_replication_role = origin`);
  }
}

describe("LastAdminProtectedError — suspend", () => {
  it("refuses to suspend the only admin user", async () => {
    const { org, adminRole } = await makeOrg("admin-last-suspend");
    try {
      const admin = await prisma.user.create({
        data: {
          organizationId: org.id,
          email: "alone@admin.test",
          name: "Alone Admin",
          roleId: adminRole.id,
        },
      });
      await expect(
        suspendUser(admin.id, {
          id: admin.id,
          organizationId: org.id,
          email: admin.email,
          name: admin.name,
        }),
      ).rejects.toBeInstanceOf(LastAdminProtectedError);
    } finally {
      await cleanupOrg(org.id);
    }
  });

  it("permits suspending an admin if another admin remains", async () => {
    const { org, adminRole } = await makeOrg("admin-last-ok");
    try {
      const a1 = await prisma.user.create({
        data: {
          organizationId: org.id,
          email: "a1@admin.test",
          name: "A1",
          roleId: adminRole.id,
        },
      });
      const a2 = await prisma.user.create({
        data: {
          organizationId: org.id,
          email: "a2@admin.test",
          name: "A2",
          roleId: adminRole.id,
        },
      });
      const updated = await suspendUser(a2.id, {
        id: a1.id,
        organizationId: org.id,
        email: a1.email,
        name: a1.name,
      });
      expect(updated.status).toBe("SUSPENDED");
    } finally {
      await cleanupOrg(org.id);
    }
  });
});

describe("LastAdminProtectedError — demote", () => {
  it("refuses to demote the only admin user via updateUserRole", async () => {
    const { org, adminRole, attorneyRole } = await makeOrg("admin-last-demote");
    try {
      const admin = await prisma.user.create({
        data: {
          organizationId: org.id,
          email: "alone2@admin.test",
          name: "Alone Admin 2",
          roleId: adminRole.id,
        },
      });
      await expect(
        updateUserRole(admin.id, attorneyRole.id, {
          id: admin.id,
          organizationId: org.id,
          email: admin.email,
          name: admin.name,
        }),
      ).rejects.toBeInstanceOf(LastAdminProtectedError);
    } finally {
      await cleanupOrg(org.id);
    }
  });
});

describe("AdminSupersetViolationError", () => {
  it("rejects reducing the admin role below ALL_PERMISSIONS", async () => {
    const { org, adminRole } = await makeOrg("admin-superset");
    try {
      const reduced = ALL_PERMISSIONS.filter(
        (p) => p !== Permission.AdminManageRoles,
      );
      await expect(
        updateRolePermissions(
          { roleId: adminRole.id, permissions: reduced as Permission[] },
          { id: "test", organizationId: org.id, email: "t@t" },
        ),
      ).rejects.toBeInstanceOf(AdminSupersetViolationError);
    } finally {
      await cleanupOrg(org.id);
    }
  });

  it("permits no-op writes that include every permission", async () => {
    const { org, adminRole } = await makeOrg("admin-superset-noop");
    try {
      const result = await updateRolePermissions(
        {
          roleId: adminRole.id,
          permissions: ALL_PERMISSIONS as Permission[],
        },
        { id: "test", organizationId: org.id, email: "t@t" },
      );
      expect(result.permissions.length).toBe(ALL_PERMISSIONS.length);
    } finally {
      await cleanupOrg(org.id);
    }
  });
});

describe("role.permissions.updated AuditLog row", () => {
  it("writes a chain-sealed row with before/after diffs", async () => {
    const { org, attorneyRole } = await makeOrg("admin-audit");
    try {
      const before = ROLE_PERMISSIONS.attorney as unknown as Permission[];
      // Drop one permission and add audit:read_all so before/after both shift.
      const after = before
        .filter((p) => p !== Permission.MatterUpdate)
        .concat(Permission.AuditReadAll);
      await updateRolePermissions(
        { roleId: attorneyRole.id, permissions: after },
        { id: "actor-1", organizationId: org.id, email: "a@a" },
      );

      const row = await prisma.auditLog.findFirst({
        where: {
          organizationId: org.id,
          action: "role.permissions.updated",
          resourceId: attorneyRole.id,
        },
        orderBy: { chainPosition: "desc" },
      });
      expect(row).not.toBeNull();
      expect(row!.contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(row!.chainPosition).toBeGreaterThan(0n);
      const meta = row!.metadata as { added: string[]; removed: string[] };
      expect(meta.removed).toContain(Permission.MatterUpdate);
      expect(meta.added).toContain(Permission.AuditReadAll);
    } finally {
      await cleanupOrg(org.id);
    }
  });
});
