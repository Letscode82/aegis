/**
 * GET /api/intelligence/risk-graph — the cross-entity risk relationship
 * graph (real nodes + edges + insights). Read aggregation over shared
 * entities; gated on any org-wide read into the domains it spans.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { requireActorAny } from "../../../lib/matter-actor";
import { getRiskGraph } from "../../../lib/risk-graph";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const actor = await requireActorAny(req, res, [
    Permission.MatterReadAll,
    Permission.ContractsReadAll,
    Permission.AuditReadAll,
  ]);
  if (!actor) return; // 401/403 already written

  const graph = await getRiskGraph(actor.organizationId);
  return res.status(200).json({ ok: true, graph });
}
