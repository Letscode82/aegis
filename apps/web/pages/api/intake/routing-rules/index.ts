/**
 * GET /api/intake/routing-rules — the org's routing rules for the
 * Smart Routing tab and the SLA Operations effectiveness panel.
 * Read-gated on intake:read_all_tickets.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { listRoutingRules } from "@aegis/intake/routing";
import { requireActor } from "../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.IntakeReadAllTickets);
  if (!actor) return;
  try {
    const rules = await listRoutingRules(actor.organizationId);
    return res.status(200).json({ rules });
  } catch (err) {
    console.error("[/api/intake/routing-rules] failed:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
