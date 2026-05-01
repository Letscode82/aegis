/**
 * AuditLog cryptographic chain tests.
 *
 * These tests require a live Postgres reachable via DATABASE_URL with
 * the Step 4a schema + chain-trigger migrations applied. CI's
 * db-integrity job satisfies that contract; locally, run after
 * `docker compose up -d` + `pnpm --filter @aegis/db db:migrate:deploy`.
 *
 * Each suite uses a per-test organisation id so the chain we mutate
 * is isolated from the seed's chain.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  exportAuditDefensibilityReport,
  logAudit,
  verifyAuditChain,
} from "../src";

const prisma = new PrismaClient();

const GENESIS_PREV = "0".repeat(64);

async function makeOrg(prefix: string): Promise<string> {
  const org = await prisma.organization.create({
    data: { name: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
  });
  return org.id;
}

async function cleanupOrg(orgId: string): Promise<void> {
  // The AuditLog rows cascade on Organization delete, so a single
  // delete tears the org down — but the immutability trigger blocks
  // direct DELETE on AuditLog rows. Cascade delete works because the
  // trigger fires on the AuditLog DELETE issued by the cascade —
  // which IS what we want to forbid in normal operation. For test
  // teardown we use session_replication_role=replica to disable
  // triggers for the cleanup, then re-enable.
  await prisma.$executeRawUnsafe(`SET session_replication_role = replica`);
  try {
    await prisma.organization.delete({ where: { id: orgId } });
  } finally {
    await prisma.$executeRawUnsafe(`SET session_replication_role = origin`);
  }
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("AuditLog chain — happy path", () => {
  it("seals 100 sequential rows into a verifiable chain", async () => {
    const orgId = await makeOrg("test-chain-100");
    try {
      for (let i = 0; i < 100; i++) {
        await logAudit({
          organizationId: orgId,
          actorType: "SYSTEM",
          action: "test.row",
          resourceType: "TestResource",
          resourceId: `r-${i}`,
          afterJson: { i },
        });
      }
      const result = await verifyAuditChain(orgId);
      expect(result.intact).toBe(true);
      expect(result.rowsChecked).toBe(100);
      expect(result.breaks).toEqual([]);
      expect(result.tailPrevHash).toBe(GENESIS_PREV);

      const rows = await prisma.auditLog.findMany({
        where: { organizationId: orgId },
        orderBy: { chainPosition: "asc" },
      });
      expect(rows[0]?.chainPosition).toBe(1n);
      expect(rows[99]?.chainPosition).toBe(100n);
      // Each row's prevHash equals the prior row's contentHash.
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i]?.prevHash).toBe(rows[i - 1]?.contentHash);
      }
    } finally {
      await cleanupOrg(orgId);
    }
  });
});

describe("AuditLog chain — tamper detection", () => {
  it("recompute identifies a tampered row when triggers are bypassed", async () => {
    const orgId = await makeOrg("test-tamper");
    try {
      for (let i = 0; i < 10; i++) {
        await logAudit({
          organizationId: orgId,
          actorType: "SYSTEM",
          action: "test.row",
          resourceType: "TestResource",
          resourceId: `r-${i}`,
          afterJson: { i },
        });
      }
      // Tamper with row #5 by bypassing the immutability trigger
      // (simulates a privileged attacker editing the row directly).
      await prisma.$executeRawUnsafe(`SET session_replication_role = replica`);
      try {
        await prisma.auditLog.updateMany({
          where: {
            organizationId: orgId,
            chainPosition: 5,
          },
          data: { action: "test.tampered" },
        });
      } finally {
        await prisma.$executeRawUnsafe(`SET session_replication_role = origin`);
      }
      const result = await verifyAuditChain(orgId);
      expect(result.intact).toBe(false);
      // Row 5's contentHash is now wrong (tampered field), and row 6's
      // prevHash references row 5's old contentHash, so we expect breaks
      // at positions 5 and 6.
      const positions = result.breaks.map((b) => Number(b.chainPosition));
      expect(positions).toContain(5);
    } finally {
      await cleanupOrg(orgId);
    }
  });
});

describe("AuditLog immutability triggers", () => {
  it("UPDATE on AuditLog raises an exception", async () => {
    const orgId = await makeOrg("test-immutable-update");
    try {
      await logAudit({
        organizationId: orgId,
        actorType: "SYSTEM",
        action: "test.row",
        resourceType: "TestResource",
        resourceId: "r-0",
        afterJson: { i: 0 },
      });
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "AuditLog" SET "action" = 'tampered' WHERE "organizationId" = $1`,
          orgId,
        ),
      ).rejects.toThrow(/append-only/i);
    } finally {
      await cleanupOrg(orgId);
    }
  });

  it("DELETE on AuditLog raises an exception", async () => {
    const orgId = await makeOrg("test-immutable-delete");
    try {
      await logAudit({
        organizationId: orgId,
        actorType: "SYSTEM",
        action: "test.row",
        resourceType: "TestResource",
        resourceId: "r-0",
        afterJson: { i: 0 },
      });
      await expect(
        prisma.$executeRawUnsafe(
          `DELETE FROM "AuditLog" WHERE "organizationId" = $1`,
          orgId,
        ),
      ).rejects.toThrow(/append-only/i);
    } finally {
      await cleanupOrg(orgId);
    }
  });
});

describe("AuditLog defensibility export", () => {
  it("produces a non-empty PDF + JSON report with a verified seal", async () => {
    const orgId = await makeOrg("test-export");
    try {
      await logAudit({
        organizationId: orgId,
        actorType: "SYSTEM",
        action: "test.row",
        resourceType: "TestResource",
        resourceId: "r-0",
        afterJson: { i: 0 },
      });
      const { pdfBuffer, jsonReport } =
        await exportAuditDefensibilityReport({ organizationId: orgId });
      expect(pdfBuffer.byteLength).toBeGreaterThan(1000);
      // PDF magic header.
      expect(pdfBuffer.subarray(0, 4).toString()).toBe("%PDF");
      expect(jsonReport.$schema).toBe("aegis.audit.defensibility.v1");
      expect(jsonReport.chainVerification.intact).toBe(true);
      expect(jsonReport.rows).toHaveLength(1);
      const row = jsonReport.rows[0]!;
      expect(row.canonicalContent).toContain("v=1");
      expect(row.contentHash).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      await cleanupOrg(orgId);
    }
  });
});

describe("AuditLog chain — scale", () => {
  it("verifies a 10,000-row chain in under 5 seconds", async () => {
    const orgId = await makeOrg("test-scale-10k");
    try {
      // Bulk-insert through Postgres via an INSERT ... SELECT generates 10k
      // rows much faster than 10k Prisma round trips. We let the BEFORE
      // INSERT trigger fill prevHash / contentHash / chainPosition for
      // each row sequentially.
      await prisma.$executeRawUnsafe(
        `
        INSERT INTO "AuditLog"
          ("id", "organizationId", "actorType", "action", "resourceType", "resourceId", "afterJson", "schemaVersion")
        SELECT
          'ck' || lpad(g::text, 14, '0'),
          $1::text,
          'SYSTEM',
          'test.scale',
          'TestResource',
          'r-' || g::text,
          jsonb_build_object('i', g),
          1
        FROM generate_series(1, 10000) g
      `,
        orgId,
      );
      const startedAt = Date.now();
      const result = await verifyAuditChain(orgId);
      const elapsedMs = Date.now() - startedAt;
      expect(result.intact).toBe(true);
      expect(result.rowsChecked).toBe(10_000);
      expect(elapsedMs).toBeLessThan(5_000);
    } finally {
      await cleanupOrg(orgId);
    }
  }, 120_000);
});

describe("logAudit — chain-fill side effect", () => {
  it("apps cannot influence prevHash / contentHash / chainPosition", async () => {
    const orgId = await makeOrg("test-tamper-on-insert");
    try {
      // Even if an app explicitly sends bogus chain values via raw SQL,
      // the trigger overwrites them. Prisma's create() doesn't expose a
      // path for the app to set them, but a malicious raw insert would.
      await prisma.$executeRawUnsafe(
        `
        INSERT INTO "AuditLog"
          ("id", "organizationId", "actorType", "action", "resourceType", "resourceId",
           "afterJson", "prevHash", "contentHash", "chainPosition", "schemaVersion")
        VALUES (
          'evil-row',
          $1::text,
          'USER',
          'test.evil',
          'TestResource',
          'r-evil',
          '{}'::jsonb,
          $2::text,
          $3::text,
          999,
          1
        )
      `,
        orgId,
        "f".repeat(64), // bogus prevHash
        "e".repeat(64), // bogus contentHash
      );
      const inserted = await prisma.auditLog.findUnique({
        where: { id: "evil-row" },
      });
      expect(inserted).not.toBeNull();
      // Trigger should have rewritten chainPosition to 1 (genesis)
      // and prevHash to all-zeros.
      expect(inserted!.chainPosition).toBe(1n);
      expect(inserted!.prevHash).toBe(GENESIS_PREV);
      expect(inserted!.contentHash).not.toBe("e".repeat(64));
    } finally {
      await cleanupOrg(orgId);
    }
  });
});
