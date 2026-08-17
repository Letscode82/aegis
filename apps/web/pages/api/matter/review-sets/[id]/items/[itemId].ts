/**
 * POST /api/matter/review-sets/[id]/items/[itemId] — code a review item
 * (responsive / privileged / redact / note). matter:legal_hold:issue.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { codeReviewItem } from "@aegis/matter";
import { requireActor } from "../../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }
  const itemId = req.query.itemId;
  if (typeof itemId !== "string") return res.status(400).json({ error: "Invalid itemId" });
  const actor = await requireActor(req, res, Permission.MatterLegalHoldIssue);
  if (!actor) return;
  try {
    const b = req.body ?? {};
    const item = await codeReviewItem(actor.organizationId, itemId, { responsive: b.responsive, privileged: b.privileged, redact: b.redact, note: b.note }, { id: actor.id, type: "USER" });
    return res.status(200).json({ ok: true, item });
  } catch (err) {
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
