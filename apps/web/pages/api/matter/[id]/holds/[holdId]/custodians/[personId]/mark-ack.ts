/**
 * POST /api/matter/[id]/holds/[holdId]/custodians/[personId]/mark-ack
 *
 * Admin-on-behalf acknowledgment (4c.3 Item 2). Used when a
 * custodian acknowledges off-line (phone, in person, paper) and
 * legal ops needs to record the ack.
 *
 * Body: { reason: string, witness?: string }
 *
 * Distinguished from custodian self-service (`/acknowledge` route)
 * by:
 *   - permission gate: `matter:legal_hold:issue` (admin privilege),
 *     not `matter:legal_hold:custodian_view` (custodian self).
 *   - audit action: `matter.legal_hold.custodian.acknowledged_by_admin`.
 *   - acknowledgmentMetadata.source = "admin_marked".
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  CustodianAlreadyAcknowledgedError,
  markCustodianAcknowledgedByAdmin,
} from "@aegis/matter";
import { requireActor } from "../../../../../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const holdId = req.query.holdId;
  const personId = req.query.personId;
  if (typeof holdId !== "string" || typeof personId !== "string") {
    return res.status(400).json({ error: "Invalid params" });
  }

  const actor = await requireActor(req, res, Permission.MatterLegalHoldIssue);
  if (!actor) return;

  const body = (req.body ?? {}) as {
    reason?: string;
    witness?: string;
  };
  if (!body.reason || body.reason.trim().length === 0) {
    return res.status(400).json({ error: "reason is required" });
  }

  try {
    const updated = await markCustodianAcknowledgedByAdmin(
      {
        holdId,
        personId,
        reason: body.reason,
        witness: body.witness,
        ip:
          typeof req.headers["x-forwarded-for"] === "string"
            ? (req.headers["x-forwarded-for"] as string).split(",")[0]
            : undefined,
        userAgent:
          typeof req.headers["user-agent"] === "string"
            ? (req.headers["user-agent"] as string)
            : undefined,
      },
      actor,
    );
    return res.status(200).json({
      id: updated.id,
      acknowledgedAt: updated.acknowledgedAt?.toISOString() ?? null,
    });
  } catch (err) {
    if (err instanceof CustodianAlreadyAcknowledgedError) {
      return res.status(409).json({ error: err.message });
    }
    console.error("[mark-ack] failed:", err);
    return res.status(500).json({ error: String(err) });
  }
}
