/**
 * /api/matter/people/search — pickers in matter UI.
 *
 * Returns up to 25 Person rows in the actor's organization matching
 * a substring search across name + email. Permission-gated to
 * matter:update so only callers who can also write the team list
 * can preview pickable Persons.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { prisma } from "@aegis/db";
import { requireActor } from "../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.MatterUpdate);
  if (!actor) return;
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

  const persons = await prisma.person.findMany({
    where: {
      organizationId: actor.organizationId,
      ...(q.length > 0 && {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      }),
    },
    select: {
      id: true,
      name: true,
      email: true,
      type: true,
    },
    orderBy: [{ name: "asc" }],
    take: 25,
  });

  res.status(200).json(persons);
}
