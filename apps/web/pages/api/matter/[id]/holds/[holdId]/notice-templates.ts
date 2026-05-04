/**
 * GET /api/matter/[id]/holds/[holdId]/notice-templates
 *
 * Lists active HoldNoticeTemplate rows for the actor's organisation.
 * The hold's matter jurisdictions are returned alongside so the UI
 * can rank jurisdiction-matched templates first in the wizard's
 * step 1 dropdown.
 *
 * Gated by `matter:legal_hold:issue` — same permission that issues
 * the notice itself, since template selection drives the audit
 * record.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { prisma } from "@aegis/db";
import { requireActor } from "../../../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const holdId = req.query.holdId;
  if (typeof holdId !== "string") {
    return res.status(400).json({ error: "Invalid holdId" });
  }

  const actor = await requireActor(req, res, Permission.MatterLegalHoldIssue);
  if (!actor) return;

  const hold = await prisma.legalHold.findFirst({
    where: { id: holdId, organizationId: actor.organizationId },
    include: { matter: { select: { jurisdiction: true } } },
  });
  if (!hold) return res.status(404).json({ error: "Hold not found" });

  const templates = await prisma.holdNoticeTemplate.findMany({
    where: { organizationId: actor.organizationId, isActive: true },
    orderBy: [{ name: "asc" }, { version: "desc" }],
  });

  // Prefer the hold's own jurisdictions[] (authoritative for legal
  // hold scope); fall back to the matter's single jurisdiction.
  const matterJurisdictions =
    hold.jurisdictions.length > 0
      ? hold.jurisdictions
      : hold.matter.jurisdiction
        ? [hold.matter.jurisdiction]
        : [];

  return res.status(200).json({
    matterJurisdictions,
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      version: t.version,
      jurisdictionKey: t.jurisdictionKey,
      bodyHash: t.bodyHash,
      updatedAt: t.updatedAt.toISOString(),
    })),
  });
}
