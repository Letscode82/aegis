import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getHoldWorkspaceSummary } from "@aegis/matter";
import { requireActorAny } from "../../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const holdId = req.query.holdId;
  if (typeof holdId !== "string") return res.status(400).json({ error: "Invalid holdId" });
  const actor = await requireActorAny(req, res, [
    Permission.MatterReadAll,
    Permission.MatterReadAssigned,
    Permission.MatterLegalHoldCustodianView,
  ]);
  if (!actor) return;

  const summary = await getHoldWorkspaceSummary(holdId);
  if (!summary || summary.hold.organizationId !== actor.organizationId) {
    return res.status(404).json({ error: "Not found" });
  }
  const { hold, counts, lastActivityAt, nextReminderDueAt, cadenceDays } = summary;
  return res.status(200).json({
    hold: {
      id: hold.id,
      holdNumber: hold.holdNumber,
      title: hold.title,
      scopeDescription: hold.scopeDescription,
      jurisdictions: hold.jurisdictions,
      status: hold.status,
      triggeredAt: hold.triggeredAt?.toISOString() ?? null,
      triggerEventDescription: hold.triggerEventDescription,
      issuedAt: hold.issuedAt?.toISOString() ?? null,
      releasedAt: hold.releasedAt?.toISOString() ?? null,
      privilegeFlags: hold.privilegeFlags,
      affectsDepartedCustodians: hold.affectsDepartedCustodians,
      matterId: hold.matterId,
      releasedById: hold.releasedById,
      releaseReason: hold.releaseReason,
      createdById: hold.createdById,
    },
    counts,
    lastActivityAt,
    nextReminderDueAt,
    cadenceDays,
  });
}
