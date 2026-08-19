/**
 * /api/review/sets/[id]/batches — review batches for a set.
 *   GET  — list batches + progress. POST — create a batch (assign items).
 * Legal-hold issue OR DSAR fulfill.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { listReviewBatches, createReviewBatch } from "@aegis/review";
import { requireActorAny } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id;
  if (typeof id !== "string") return res.status(400).json({ error: "Invalid id" });
  const actor = await requireActorAny(req, res, [Permission.MatterLegalHoldIssue, Permission.PrivacyDsarFulfill]);
  if (!actor) return;
  try {
    if (req.method === "GET") {
      const batches = await listReviewBatches(actor.organizationId, id);
      return res.status(200).json({ ok: true, batches });
    }
    if (req.method === "POST") {
      const b = req.body ?? {};
      const batch = await createReviewBatch(actor.organizationId, id, { name: b.name, itemIds: b.itemIds, autoSize: b.autoSize, assignedToUserId: b.assignedToUserId }, { id: actor.id, type: "USER" });
      return res.status(200).json({ ok: true, batch });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
