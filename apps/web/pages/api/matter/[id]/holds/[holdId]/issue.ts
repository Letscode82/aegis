import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { IllegalHoldTransitionError, issueLegalHold } from "@aegis/matter";
import { requireActor } from "../../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const holdId = req.query.holdId;
  if (typeof holdId !== "string") return res.status(400).json({ error: "Invalid holdId" });
  const actor = await requireActor(req, res, Permission.MatterLegalHoldIssue);
  if (!actor) return;
  // Both fields are optional. The workspace "Issue Hold" button posts an empty
  // body — the hold is issued over its existing custodians with no notice, and
  // the composer sends notices separately. The guided wizard supplies both.
  const body = (req.body ?? {}) as {
    noticeTemplateId?: string;
    recipientCustodianPersonIds?: string[];
  };
  try {
    const updated = await issueLegalHold(
      {
        holdId,
        noticeTemplateId: body.noticeTemplateId,
        recipientCustodianPersonIds: Array.isArray(body.recipientCustodianPersonIds)
          ? body.recipientCustodianPersonIds
          : undefined,
      },
      actor,
    );
    return res.status(200).json({
      id: updated.id,
      holdNumber: updated.holdNumber,
      status: updated.status,
      issuedAt: updated.issuedAt?.toISOString() ?? null,
    });
  } catch (err) {
    if (err instanceof IllegalHoldTransitionError) {
      return res.status(409).json({ error: err.message });
    }
    console.error("[/api/matter/:id/holds/:holdId/issue] failed:", err);
    return res.status(500).json({ error: String(err) });
  }
}
