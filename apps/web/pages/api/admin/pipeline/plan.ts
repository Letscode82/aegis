/**
 * GET /api/admin/pipeline/plan[?volume=&residency=&cost=&prefer=]
 *
 * Org-level pipeline plan (B3 panel data): capabilities (B1) + resolved plan
 * (B2) with no specific matter. Read-only.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getOrgProcessingCapabilities, resolveMatterPipelinePlan, type PipelinePlanHints } from "@aegis/matter";
import { requireActorAny } from "../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
    return res.status(200).json({ ok: true, capabilities, plan });
  } catch (err) {
    return res.status(500).json({ ok: false, error: { code: "PLAN_FAILED", message: String((err as Error)?.message ?? err) } });
  }
}
