/**
 * GET /api/matter/[id]/holds/[holdId]/snapshots
 *
 * Returns the defensibility-score time-series for one hold. Query
 * params:
 *   ?limit=30                 — cap the result count (sparkline)
 *   ?since=2026-01-01         — ISO date lower bound (trend modal)
 *   ?until=2026-05-01         — ISO date upper bound
 *
 * Read-only; no audit row. Matter-read triple grants.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { listHoldSnapshots } from "@aegis/matter";
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
    select: { id: true },
  });
  if (!hold) return res.status(404).json({ error: "Hold not found" });

  const limitRaw = req.query.limit;
  const sinceRaw = req.query.since;
  const untilRaw = req.query.until;
  const limit =
    typeof limitRaw === "string"
      ? Math.max(1, Math.min(1000, parseInt(limitRaw, 10) || 30))
      : undefined;
  const since =
    typeof sinceRaw === "string" ? new Date(sinceRaw) : undefined;
  const until =
    typeof untilRaw === "string" ? new Date(untilRaw) : undefined;

  const rows = await listHoldSnapshots(holdId, { limit, since, until });
  return res.status(200).json(rows);
}
