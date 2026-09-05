/**
 * GET /api/matter/[id]/pipeline-plan[?volume=large&residency=in-tenant&cost=min-cost&prefer=purview]
 *
 * Pipeline planner (B2). Resolves the per-stage engine plan (Collect / Preserve
 * / Process / Review) for this matter from the org's capabilities + optional
 * hints. Read-only.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getOrgProcessingCapabilities, resolveMatterPipelinePlan, type PipelinePlanHints } from "@aegis/matter";
import { requireActorAny } from "../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id;
  if (typeof id !== "string") return res.status(400).json({ ok: false, error: { code: "INVALID_ID", message: "Invalid matter id" } });
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } });
  }
  const actor = await requireActorAny(req, res, [Permission.MatterReadAll, Permission.MatterReadAssigned, Permission.AdminM365Manage]);
  if (!actor) return;

  const hints: PipelinePlanHints = {
    estimatedVolume: req.query.volume === "large" ? "large" : req.query.volume === "small" ? "small" : undefined,
    residency: req.query.residency === "in-tenant" ? "in-tenant" : req.query.residency === "any" ? "any" : undefined,
    costPreference: req.query.cost === "min-cost" ? "min-cost" : req.query.cost === "max-fidelity" ? "max-fidelity" : undefined,
    clientPrefersPurview: req.query.prefer === "purview",
  };

  try {
    const capabilities = await getOrgProcessingCapabilities(actor.organizationId);
    const plan = resolveMatterPipelinePlan(capabilities, hints);
    return res.status(200).json({ ok: true, matterId: id, capabilities, plan });
  } catch (err) {
    return res.status(500).json({ ok: false, error: { code: "PLAN_FAILED", message: String((err as Error)?.message ?? err) } });
  }
}
