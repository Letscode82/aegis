/**
 * GET /api/intake/my-work — the caller's personal work inbox (W1-1,
 * issue #103): my assigned tickets, batons I hold, my open tasks,
 * agent recommendations awaiting my review. Self-scoped by
 * construction, so gated on the lowest intake permission.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { withRequestLog } from "@aegis/observability";
import { Permission } from "@aegis/auth";
import { getMyWork } from "@aegis/intake/my-work";
import { requireActor } from "../../../lib/matter-actor";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.IntakeReadOwnTickets);
  if (!actor) return;
  const work = await getMyWork(actor.organizationId, actor.id);
  return res.status(200).json({ ok: true, ...work });
}

// W4-5 — structured request log + slow-request flag + last-resort catch.
export default withRequestLog(handler, "/api/intake/my-work");
