import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { prisma } from "@aegis/db";
import { requireActorAny } from "../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const id = req.query.id;
  if (typeof id !== "string") {
    return res.status(400).json({ error: "Invalid id" });
  }
  // Matter-scoped audit view is available to anyone who can read the matter;
  // org-wide audit view stays gated to AuditReadAll on /api/audit-log.
  const actor = await requireActorAny(req, res, [
    Permission.MatterReadAll,
    Permission.MatterReadAssigned,
  ]);
  if (!actor) return;
  const matter = await prisma.matter.findFirst({
    where: { id, organizationId: actor.organizationId },
    select: { id: true },
  });
  if (!matter) return res.status(404).json({ error: "Not found" });

  const entries = await prisma.auditLog.findMany({
    where: {
      organizationId: actor.organizationId,
      resourceType: "Matter",
      resourceId: id,
    },
    orderBy: [{ chainPosition: "desc" }],
    take: 100,
  });
  res.status(200).json(
    entries.map((e) => ({
      chainPosition: e.chainPosition.toString(),
      timestamp: e.timestamp.toISOString(),
      action: e.action,
      contentHash: e.contentHash,
      prevHash: e.prevHash,
      actorId: e.actorId,
      actorType: e.actorType,
    })),
  );
}
