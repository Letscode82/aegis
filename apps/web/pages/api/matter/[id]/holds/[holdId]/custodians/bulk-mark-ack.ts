/**
 * POST /api/matter/[id]/holds/[holdId]/custodians/bulk-mark-ack
 *
 * Bulk admin-on-behalf acknowledgment. Body:
 *   { personIds: string[], reason: string, witness?: string }
 *
 * Wrapped in a $transaction — partial failure rolls all rows back
 * (4c.3 Item 6 atomicity rule). Gated by `matter:legal_hold:issue`.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { bulkMarkAcknowledged } from "@aegis/matter";
import { requireActor } from "../../../../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const holdId = req.query.holdId;
  if (typeof holdId !== "string") {
    return res.status(400).json({ error: "Invalid holdId" });
  }

  const actor = await requireActor(req, res, Permission.MatterLegalHoldIssue);
  if (!actor) return;

  const body = (req.body ?? {}) as {
    personIds?: string[];
    reason?: string;
    witness?: string;
  };
  if (!Array.isArray(body.personIds) || body.personIds.length === 0) {
    return res.status(400).json({ error: "personIds required" });
  }
  if (!body.reason || body.reason.trim().length === 0) {
    return res.status(400).json({ error: "reason required" });
  }

  try {
    const result = await bulkMarkAcknowledged(
      {
        holdId,
        personIds: body.personIds,
        reason: body.reason,
        witness: body.witness,
      },
      actor,
    );
    return res.status(200).json(result);
  } catch (err) {
    const outcomes = (err as Error & { outcomes?: unknown }).outcomes;
    console.error("[bulk-mark-ack] failed:", err);
    return res
      .status(500)
      .json({ error: String(err), outcomes: outcomes ?? null });
  }
}
