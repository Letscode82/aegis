/**
 * GET /api/ai-ops/summary
 *
 * Read-only aggregator for the dashboard's "AI Operations" section.
 * Returns three views of the intake AI loop (activity feed, scorecard,
 * pending-review queue) in one round-trip so the dashboard fetches a
 * single payload.
 *
 * Authorization: caller must hold either `audit:read_all` (GCs see the
 * full ledger by role) OR `intake:read_all_tickets` (legal-ops staff
 * who manage the inbox). Either grant is sufficient.
 *
 * This handler adds no mutations and writes no audit rows — the
 * AuditLog chain is unchanged by it.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { withRequestLog } from "@aegis/observability";
import { Permission } from "@aegis/auth";
import { getAIOperationsSummary } from "@aegis/intake/ai-ops";
import { requireActorAny } from "../../../lib/matter-actor";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const actor = await requireActorAny(req, res, [
    Permission.IntakeReadAllTickets,
    Permission.AuditReadAll,
  ]);
  if (!actor) return;

  try {
    const summary = await getAIOperationsSummary(actor.organizationId);
    res.status(200).json(summary);
  } catch (err) {
    console.error("[/api/ai-ops/summary] failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
}

// W4-5 — structured request log + slow-request flag + last-resort catch.
export default withRequestLog(handler, "/api/ai-ops/summary");
