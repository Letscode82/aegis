/**
 * GET /api/matter/[id]/holds/[holdId]/issue-status
 *
 * Snapshot of the issuance state — derived from persisted side
 * effects (LegalHold.status, custodian count, per-source
 * preservationStatus, notice issuance recipients). Used by the
 * wizard's ProgressPanel as a fallback when the SSE stream drops:
 * the panel polls this every 1s and re-renders, no panic UI.
 *
 * Permission: matter:legal_hold:issue OR matter:read_all (read
 * permission accepted because the snapshot is derivable from data
 * the user can already see in the workspace).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getIssueStatusSnapshot } from "@aegis/matter";
import { requireActorAny } from "../../../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      ok: false,
      error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" },
    });
  }
  const holdId = req.query.holdId;
  if (typeof holdId !== "string") {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_HOLD_ID", message: "Invalid holdId" },
    });
  }
  const actor = await requireActorAny(req, res, [
    Permission.MatterLegalHoldIssue,
    Permission.MatterReadAll,
  ]);
  if (!actor) return;
  try {
    const snapshot = await getIssueStatusSnapshot(holdId, actor.organizationId);
    return res.status(200).json({ ok: true, ...snapshot });
  } catch (err) {
    return res.status(404).json({
      ok: false,
      error: {
        code: "HOLD_NOT_FOUND",
        message: (err as Error).message ?? String(err),
      },
    });
  }
}
