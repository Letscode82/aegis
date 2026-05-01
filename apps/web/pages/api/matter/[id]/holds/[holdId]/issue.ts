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
  const body = (req.body ?? {}) as {
    noticeTemplateId?: string;
    recipientCustodianPersonIds?: string[];
  };
  if (!body.noticeTemplateId || !Array.isArray(body.recipientCustodianPersonIds)) {
    return res
      .status(400)
      .json({ error: "noticeTemplateId + recipientCustodianPersonIds required" });
  }
  try {
    const updated = await issueLegalHold(
      {
        holdId,
        noticeTemplateId: body.noticeTemplateId,
        recipientCustodianPersonIds: body.recipientCustodianPersonIds,
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
