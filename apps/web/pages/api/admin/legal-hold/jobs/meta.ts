/**
 * GET /api/admin/legal-hold/jobs/meta
 *
 * Lightweight meta endpoint feeding the manual-jobs admin UI. Reports
 * the most recent successful run per job by inspecting the most recent
 * snapshot row (snapshot job) and the most recent
 * legal_hold.snapshot.cleanup audit row (cleanup job).
 *
 * Permission: admin:manage_users.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { prisma } from "@aegis/db";
import { requireActor } from "../../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.AdminManageUsers);
  if (!actor) return;
  const lastSnapshot = await prisma.holdDefensibilityScoreSnapshot.findFirst({
    where: { legalHold: { organizationId: actor.organizationId } },
    orderBy: { computedAt: "desc" },
    select: { computedAt: true },
  });
  const lastCleanup = await prisma.auditLog.findFirst({
    where: {
      organizationId: actor.organizationId,
      action: { in: ["legal_hold.snapshot.cleanup", "legal_hold.snapshot.weekly_cleanup"] },
    },
    orderBy: { timestamp: "desc" },
    select: { timestamp: true },
  });
  // Sub-PR 4c.1 follow-up: M365 Device Code session cleanup. Reports
  // the most recent created/completed row so the admin sees when the
  // table last got attention.
  const lastDeviceCodeSession = await prisma.m365DeviceCodeSession.findFirst({
    where: { organizationId: actor.organizationId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return res.status(200).json({
    defensibilitySnapshotLastRun: lastSnapshot?.computedAt?.toISOString() ?? null,
    snapshotCleanupLastRun: lastCleanup?.timestamp?.toISOString() ?? null,
    m365DeviceCodeLastSession: lastDeviceCodeSession?.createdAt?.toISOString() ?? null,
  });
}
