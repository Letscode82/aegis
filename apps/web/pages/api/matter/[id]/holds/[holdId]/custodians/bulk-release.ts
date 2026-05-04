/**
 * POST /api/matter/[id]/holds/[holdId]/custodians/bulk-release
 *
 * Bulk per-custodian release. Body:
 *   { personIds: string[], releaseReason: string }
 *
 * Wrapped in a $transaction. Gated by `matter:legal_hold:release`.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { bulkReleaseCustodians } from "@aegis/matter";
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

  const actor = await requireActor(
    req,
    res,
    Permission.MatterLegalHoldRelease,
  );
  if (!actor) return;

  const body = (req.body ?? {}) as {
    personIds?: string[];
    releaseReason?: string;
  };
  if (!Array.isArray(body.personIds) || body.personIds.length === 0) {
    return res.status(400).json({ error: "personIds required" });
  }
  if (!body.releaseReason || body.releaseReason.trim().length === 0) {
    return res.status(400).json({ error: "releaseReason required" });
  }

  try {
    const result = await bulkReleaseCustodians(
      {
        holdId,
        personIds: body.personIds,
        releaseReason: body.releaseReason,
      },
      actor,
    );
    return res.status(200).json(result);
  } catch (err) {
    const outcomes = (err as Error & { outcomes?: unknown }).outcomes;
    console.error("[bulk-release] failed:", err);
    return res
      .status(500)
      .json({ error: String(err), outcomes: outcomes ?? null });
  }
}
