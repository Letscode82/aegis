/**
 * POST /api/review/batches/[batchId] — batch actions.
 *   { action: "assign", assignedToUserId } | "submit-qc" | "complete"
 * Legal-hold issue OR DSAR fulfill.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { assignReviewBatch, submitBatchForQc, completeReviewBatch } from "@aegis/review";
import { requireActorAny } from "../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }
  const batchId = req.query.batchId;
  if (typeof batchId !== "string") return res.status(400).json({ error: "Invalid batchId" });
  const actor = await requireActorAny(req, res, [Permission.MatterLegalHoldIssue, Permission.PrivacyDsarFulfill]);
  if (!actor) return;
  try {
    const b = req.body ?? {};
    const who = { id: actor.id, type: "USER" as const };
    let batch;
    if (b.action === "assign") batch = await assignReviewBatch(actor.organizationId, batchId, b.assignedToUserId ?? null, who);
    else if (b.action === "submit-qc") batch = await submitBatchForQc(actor.organizationId, batchId, who);
    else if (b.action === "complete") batch = await completeReviewBatch(actor.organizationId, batchId, who);
    else return res.status(400).json({ ok: false, error: "Unknown action" });
    return res.status(200).json({ ok: true, batch });
  } catch (err) {
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
