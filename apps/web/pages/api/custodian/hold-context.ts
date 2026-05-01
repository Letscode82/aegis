/**
 * /api/custodian/hold-context?holdId=...
 *
 * Returns { matterId, personId } for the resolved current user's
 * custodian row on the requested hold. 404 if the user is not on
 * the hold's custodian list. Used by /custodian/holds/[holdId]/
 * acknowledge to seed CustodianAttestationView.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { prisma } from "@aegis/db";
import { requireActor } from "../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const holdId = typeof req.query.holdId === "string" ? req.query.holdId : null;
  if (!holdId) return res.status(400).json({ error: "holdId required" });

  const actor = await requireActor(req, res, Permission.MatterLegalHoldCustodianView);
  if (!actor) return;

  // Find a Person row for the current user — the user's email maps to
  // a Person via Person.email or Person.userId.
  const person = await prisma.person.findFirst({
    where: {
      organizationId: actor.organizationId,
      OR: [{ userId: actor.id }, ...(actor.email ? [{ email: actor.email }] : [])],
    },
    select: { id: true },
  });
  if (!person) return res.status(404).json({ error: "No Person record for current user" });

  const custodian = await prisma.legalHoldCustodian.findFirst({
    where: {
      legalHoldId: holdId,
      personId: person.id,
      legalHold: { organizationId: actor.organizationId },
    },
    select: { legalHold: { select: { matterId: true } }, personId: true },
  });
  if (!custodian) return res.status(404).json({ error: "Not a custodian on this hold" });

  return res.status(200).json({
    matterId: custodian.legalHold.matterId,
    personId: custodian.personId,
  });
}
