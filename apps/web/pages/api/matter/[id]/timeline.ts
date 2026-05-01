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

  const entries = await prisma.matterTimeline.findMany({
    where: { matterId: id },
    include: {
      event: {
        select: {
          id: true,
          type: true,
          summary: true,
          occurredAt: true,
          actorId: true,
        },
      },
    },
    orderBy: [{ event: { occurredAt: "desc" } }],
    take: 100,
  });

  res.status(200).json(
    entries.map((e) => ({
      id: e.event.id,
      type: e.event.type,
      summary: e.event.summary,
      occurredAt: e.event.occurredAt.toISOString(),
      actorId: e.event.actorId,
    })),
  );
}
