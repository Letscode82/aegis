/**
 * GET  /api/matter/[id]/holds         — list holds on the matter
 * POST /api/matter/[id]/holds         — create a draft hold
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  IllegalHoldTransitionError,
  createLegalHold,
  listLegalHolds,
} from "@aegis/matter";
import { requireActor, requireActorAny } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const matterId = req.query.id;
  if (typeof matterId !== "string") {
    return res.status(400).json({ error: "Invalid matter id" });
  }

  if (req.method === "GET") {
    const actor = await requireActorAny(req, res, [
      Permission.MatterReadAll,
      Permission.MatterReadAssigned,
      Permission.MatterLegalHoldCustodianView,
    ]);
    if (!actor) return;
    const holds = await listLegalHolds(actor.organizationId, matterId);
    return res.status(200).json(
      holds.map((h) => ({
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
        affectsDepartedCustodians: h.affectsDepartedCustodians,
        privilegeFlags: h.privilegeFlags,
      })),
    );
  }

  if (req.method === "POST") {
    const actor = await requireActor(req, res, Permission.MatterLegalHoldIssue);
    if (!actor) return;
    const body = (req.body ?? {}) as {
      title?: string;
      scopeDescription?: string;
      jurisdictions?: string[];
      triggerEventDescription?: string;
      triggeredAt?: string;
      affectsDepartedCustodians?: boolean;
      privilegeFlags?: Record<string, boolean>;
    };
    if (!body.title?.trim() || !body.scopeDescription?.trim()) {
      return res.status(400).json({ error: "title + scopeDescription required" });
    }
    try {
      const created = await createLegalHold(
        {
          matterId,
          title: body.title.trim(),
          scopeDescription: body.scopeDescription.trim(),
          jurisdictions: body.jurisdictions,
          triggerEventDescription: body.triggerEventDescription,
          triggeredAt: body.triggeredAt ? new Date(body.triggeredAt) : undefined,
          affectsDepartedCustodians: body.affectsDepartedCustodians,
          privilegeFlags: body.privilegeFlags,
        },
        actor,
      );
      return res.status(201).json({ id: created.id, status: created.status });
    } catch (err) {
      if (err instanceof IllegalHoldTransitionError) {
        return res.status(409).json({ error: err.message });
      }
      console.error("[/api/matter/:id/holds POST] failed:", err);
      return res.status(500).json({ error: String(err) });
    }
  }

  res.setHeader("Allow", "GET,POST");
  return res.status(405).json({ error: "Method not allowed" });
}
