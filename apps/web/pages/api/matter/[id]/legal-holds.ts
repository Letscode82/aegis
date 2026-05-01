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
      scope: h.scope,
      status: h.status,
      reason: h.reason,
      issuedAt: h.issuedAt?.toISOString() ?? null,
      releasedAt: h.releasedAt?.toISOString() ?? null,
    })),
  );
}
