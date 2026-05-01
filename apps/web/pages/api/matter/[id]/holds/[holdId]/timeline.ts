import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { listHoldEvents } from "@aegis/matter";
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
  const events = await listHoldEvents(holdId);
  res.status(200).json(
    events.map((e) => ({
      id: e.id,
      type: e.type,
      summary: e.summary,
      actorId: e.actorId,
      actorType: e.actorType,
      occurredAt: e.occurredAt.toISOString(),
      resultingAuditLogId: e.resultingAuditLogId,
    })),
  );
}
