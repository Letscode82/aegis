/**
 * GET /api/intake/agent-metrics?days=7
 *
 * Per-agent health (produced / accept-rate / avg-confidence / degraded-
 * rate) over a rolling window, for the Agents settings panel. Pure read
 * aggregation; gated on intake:read_all_tickets.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getAgentMetrics } from "@aegis/intake/agent-metrics";
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
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 7));
  try {
    const result = await getAgentMetrics(actor.organizationId, days);
    return res.status(200).json(result);
  } catch (err) {
    console.error("[/api/intake/agent-metrics] failed:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}
