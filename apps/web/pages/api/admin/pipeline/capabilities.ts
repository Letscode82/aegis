/**
 * GET /api/admin/pipeline/capabilities — pipeline planner (B1).
 *
 * Per-org engine availability snapshot (native / Tika / Purview preserve /
 * Purview process / AI review), composed from the M365, delegated eDiscovery,
 * and processing status probes. Feeds the matter pipeline planner (B2).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getOrgProcessingCapabilities } from "@aegis/matter";
import { requireActorAny } from "../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } });
  }
  const actor = await requireActorAny(req, res, [Permission.MatterReadAll, Permission.MatterReadAssigned, Permission.AdminM365Manage]);
  if (!actor) return;
  try {
    const capabilities = await getOrgProcessingCapabilities(actor.organizationId);
    return res.status(200).json({ ok: true, capabilities });
  } catch (err) {
    return res.status(500).json({ ok: false, error: { code: "CAPABILITIES_FAILED", message: String((err as Error)?.message ?? err) } });
  }
}
