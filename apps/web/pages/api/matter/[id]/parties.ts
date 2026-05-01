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

  // Ensure the matter belongs to the actor's org.
  const matter = await prisma.matter.findFirst({
    where: { id, organizationId: actor.organizationId },
    select: { id: true },
  });
  if (!matter) return res.status(404).json({ error: "Not found" });

  const parties = await prisma.matterParty.findMany({
    where: { matterId: id },
    include: { person: { select: { id: true, name: true } } },
    orderBy: [{ role: "asc" }, { addedAt: "asc" }],
  });

  res.status(200).json(
    parties.map((p) => ({
      id: p.id,
      matterId: p.matterId,
      personId: p.personId,
      personName: p.person.name,
      role: p.role,
      addedAt: p.addedAt.toISOString(),
    })),
  );
}
