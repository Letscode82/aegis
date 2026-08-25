/**
 * GET /api/review/sets/[id]/clusters — ECA-2 theme clustering over a collection.
 * Deterministic TF-IDF clusters, optionally named by Claude (degrades to
 * top-terms labels). Read-only; any review read grant.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getReviewSetClusters } from "@aegis/review";
import { requireActorAny } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Method not allowed" }); }
  const id = req.query.id;
  if (typeof id !== "string") return res.status(400).json({ error: "Invalid id" });
  const actor = await requireActorAny(req, res, [
    Permission.MatterReadAll,
    Permission.MatterReadAssigned,
    Permission.MatterLegalHoldIssue,
    Permission.PrivacyDsarRead,
    Permission.PrivacyDsarFulfill,
  ]);
  if (!actor) return;
  try {
    const result = await getReviewSetClusters(actor.organizationId, id);
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
