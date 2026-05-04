/**
 * GET /api/matter/[id]/holds/[holdId]/policy
 *
 * Resolves the effective hold policy: org default merged with the
 * per-hold `customPolicyJson` snapshot (if any). Returns the
 * full ResolvedHoldPolicy plus a derived `effectiveCadenceDays`
 * value computed from the hold's jurisdictions — what the
 * jurisdiction popover shows as "the cadence that wins for this
 * hold". Cheap read; no audit row.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  effectiveCadenceDays,
  resolveEffectivePolicy,
} from "@aegis/matter";
import { prisma } from "@aegis/db";
import { requireActorAny } from "../../../../../../lib/matter-actor";

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
  const actor = await requireActorAny(req, res, [
    Permission.MatterReadAll,
    Permission.MatterReadAssigned,
    Permission.MatterLegalHoldCustodianView,
  ]);
  if (!actor) return;

  const hold = await prisma.legalHold.findFirst({
    where: { id: holdId, organizationId: actor.organizationId },
    include: { matter: { select: { jurisdiction: true } } },
  });
  if (!hold) return res.status(404).json({ error: "Hold not found" });

  const policy = await resolveEffectivePolicy(actor.organizationId, holdId);
  const effectiveJurisdictions =
    hold.jurisdictions.length > 0
      ? hold.jurisdictions
      : hold.matter.jurisdiction
        ? [hold.matter.jurisdiction]
        : [];
  return res.status(200).json({
    holdJurisdictions: effectiveJurisdictions,
    policy,
    effectiveCadenceDays: effectiveCadenceDays(policy, effectiveJurisdictions),
  });
}
