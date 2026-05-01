/**
 * GET  /api/matter/[id]/holds/[holdId]   — hold detail
 * PATCH /api/matter/[id]/holds/[holdId]  — amend scope
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { amendHoldScope, getLegalHoldById } from "@aegis/matter";
import { requireActor, requireActorAny } from "../../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const holdId = req.query.holdId;
  if (typeof holdId !== "string") {
    return res.status(400).json({ error: "Invalid holdId" });
  }

  if (req.method === "GET") {
    const actor = await requireActorAny(req, res, [
      Permission.MatterReadAll,
      Permission.MatterReadAssigned,
      Permission.MatterLegalHoldCustodianView,
    ]);
    if (!actor) return;
    const h = await getLegalHoldById(holdId);
    if (!h || h.organizationId !== actor.organizationId) {
      return res.status(404).json({ error: "Not found" });
    }
    return res.status(200).json({
      id: h.id,
      holdNumber: h.holdNumber,
      title: h.title,
      scopeDescription: h.scopeDescription,
      jurisdictions: h.jurisdictions,
      status: h.status,
      triggeredAt: h.triggeredAt?.toISOString() ?? null,
      triggerEventDescription: h.triggerEventDescription,
      issuedAt: h.issuedAt?.toISOString() ?? null,
      releasedAt: h.releasedAt?.toISOString() ?? null,
      releasedById: h.releasedById,
      releaseReason: h.releaseReason,
      privilegeFlags: h.privilegeFlags,
      affectsDepartedCustodians: h.affectsDepartedCustodians,
      matterId: h.matterId,
      createdById: h.createdById,
      customPolicyJson: h.customPolicyJson,
    });
  }

  if (req.method === "PATCH") {
    const actor = await requireActor(req, res, Permission.MatterLegalHoldIssue);
    if (!actor) return;
    const body = (req.body ?? {}) as {
      newScopeDescription?: string;
      reason?: string;
    };
    if (!body.newScopeDescription || !body.reason) {
      return res.status(400).json({ error: "newScopeDescription + reason required" });
    }
    try {
      const updated = await amendHoldScope(
        { holdId, newScopeDescription: body.newScopeDescription, reason: body.reason },
        actor,
      );
      return res.status(200).json({ id: updated.id, status: updated.status });
    } catch (err) {
      console.error("[/api/matter/:id/holds/:holdId PATCH] failed:", err);
      return res.status(500).json({ error: String(err) });
    }
  }

  res.setHeader("Allow", "GET,PATCH");
  return res.status(405).json({ error: "Method not allowed" });
}
