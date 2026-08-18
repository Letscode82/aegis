/**
 * POST /api/review/sets/[id]/freeze — snapshot the set for review.
 * Legal-hold issue OR DSAR fulfill.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { freezeReviewSet } from "@aegis/review";
import { requireActorAny } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }
  const id = req.query.id;
  if (typeof id !== "string") return res.status(400).json({ error: "Invalid id" });
  const actor = await requireActorAny(req, res, [Permission.MatterLegalHoldIssue, Permission.PrivacyDsarFulfill]);
  if (!actor) return;
  try {
    const summary = await freezeReviewSet(actor.organizationId, id, { id: actor.id, type: "USER" });
    return res.status(200).json({ ok: true, summary });
  } catch (err) {
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
