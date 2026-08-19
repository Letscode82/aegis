/**
 * POST /api/review/items/[itemId]/qc — second-level QC decision on one item.
 * Body { approve: boolean }. Legal-hold issue OR DSAR fulfill.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { resolveItemQc } from "@aegis/review";
import { requireActorAny } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }
  const itemId = req.query.itemId;
  if (typeof itemId !== "string") return res.status(400).json({ error: "Invalid itemId" });
  const actor = await requireActorAny(req, res, [Permission.MatterLegalHoldIssue, Permission.PrivacyDsarFulfill]);
  if (!actor) return;
  try {
    const result = await resolveItemQc(actor.organizationId, itemId, !!(req.body ?? {}).approve, { id: actor.id, type: "USER" });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
