import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getLegalHoldsForMatter } from "@aegis/matter";
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
  const holds = await getLegalHoldsForMatter(id);
  res.status(200).json(
    holds.map((h) => ({
      id: h.id,
      holdNumber: h.holdNumber,
      title: h.title,
      // Field renamed in 4b: `scope` -> `scopeDescription`. UI keeps
      // the old key on the wire for now so the placeholder card can
      // stay backward-compatible until the new HoldListTab lands.
      scope: h.scopeDescription,
      status: h.status,
      reason: h.triggerEventDescription,
      jurisdictions: h.jurisdictions,
      issuedAt: h.issuedAt?.toISOString() ?? null,
      releasedAt: h.releasedAt?.toISOString() ?? null,
    })),
  );
}
