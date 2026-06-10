/**
 * GET /api/intake/sla-ops — executive SLA Operations summary (queue
 * health, attorney workload, routing-rule effectiveness). Pure read
 * aggregation; gated on intake:read_all_tickets.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getSlaOperationsSummary } from "@aegis/intake/sla";
import { requireActor } from "../../../lib/matter-actor";

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
    const summary = await getSlaOperationsSummary(actor.organizationId);
    return res.status(200).json(summary);
  } catch (err) {
    console.error("[/api/intake/sla-ops] failed:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
