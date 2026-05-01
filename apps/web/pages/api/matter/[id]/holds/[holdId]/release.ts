import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  IllegalHoldTransitionError,
  partiallyReleaseCustodian,
  releaseLegalHold,
} from "@aegis/matter";
import { requireActor } from "../../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const holdId = req.query.holdId;
  if (typeof holdId !== "string") return res.status(400).json({ error: "Invalid holdId" });
  const actor = await requireActor(req, res, Permission.MatterLegalHoldRelease);
  if (!actor) return;
  const body = (req.body ?? {}) as {
    releaseReason?: string;
    /** When set, releases just this custodian (partial release). */
    custodianPersonId?: string;
  };
  if (!body.releaseReason) {
    return res.status(400).json({ error: "releaseReason required" });
  }
  try {
    if (body.custodianPersonId) {
      await partiallyReleaseCustodian(
        {
          holdId,
          personId: body.custodianPersonId,
          releaseReason: body.releaseReason,
        },
        actor,
      );
      return res.status(200).json({ partial: true });
    }
    const updated = await releaseLegalHold(
      { holdId, releaseReason: body.releaseReason },
      actor,
    );
    return res.status(200).json({
      id: updated.id,
      status: updated.status,
      releasedAt: updated.releasedAt?.toISOString() ?? null,
    });
  } catch (err) {
    if (err instanceof IllegalHoldTransitionError) {
      return res.status(409).json({ error: err.message });
    }
    console.error("[/api/matter/:id/holds/:holdId/release] failed:", err);
    return res.status(500).json({ error: String(err) });
  }
}
