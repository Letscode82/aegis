/**
 * GET /api/custodian/my-holds
 *
 * Returns every active LegalHold the current authenticated user is
 * a custodian on. Used by the /custodian/holds portal home page
 * (sub-PR 4c.5, Item 19).
 *
 * Resolves the actor's Person row by Person.userId then by
 * Person.email (the latter covers seeded demo accounts where the
 * userId pointer hasn't been wired). Returns an empty list if no
 * Person record exists for the actor.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { prisma } from "@aegis/db";
import { requireActor } from "../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const actor = await requireActor(
    req,
    res,
    Permission.MatterLegalHoldCustodianView,
  );
  if (!actor) return;

  const person = await prisma.person.findFirst({
    where: {
      organizationId: actor.organizationId,
      OR: [
        { userId: actor.id },
        ...(actor.email ? [{ email: actor.email }] : []),
      ],
    },
    select: { id: true },
  });
  if (!person) return res.status(200).json([]);

  const rows = await prisma.legalHoldCustodian.findMany({
    where: {
      personId: person.id,
      legalHold: {
        organizationId: actor.organizationId,
        status: { in: ["ISSUED", "ACTIVE", "PARTIALLY_RELEASED"] },
      },
    },
    include: {
      legalHold: {
        include: {
          matter: { select: { id: true, title: true } },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  return res.status(200).json(
    rows.map((c) => ({
      holdId: c.legalHoldId,
      personId: c.personId,
      matterId: c.legalHold.matterId,
      matterTitle: c.legalHold.matter.title,
      holdTitle: c.legalHold.title,
      holdNumber: c.legalHold.holdNumber,
      scopeDescription: c.legalHold.scopeDescription,
      status: c.legalHold.status,
      acknowledgedAt: c.acknowledgedAt?.toISOString() ?? null,
      lastReAttestedAt: c.lastReAttestedAt?.toISOString() ?? null,
      nextReAttestationDueAt:
        c.nextReAttestationDueAt?.toISOString() ?? null,
      releasedAt: c.releasedAt?.toISOString() ?? null,
    })),
  );
}
