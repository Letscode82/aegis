/**
 * GET /api/ai-ops/exec-summary — C-14 (exec-analytics depth).
 *
 * Read-only executive aggregator. Where /api/ai-ops/summary reports the AI
 * loop's performance, this reports the legal-intake operation's posture for
 * a GC-level view: queue health, throughput / backlog delta, per-attorney
 * open load, and routing-rule effectiveness.
 *
 * Authorization: identical to /api/ai-ops/summary — caller must hold either
 * `audit:read_all` (GCs, by role) OR `intake:read_all_tickets` (legal-ops
 * staff). Either grant is sufficient.
 *
 * Adds no mutations and writes no audit rows — the AuditLog chain is
 * unchanged by it.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { withRequestLog } from "@aegis/observability";
import { Permission } from "@aegis/auth";
import { getExecutiveOperationsSummary } from "@aegis/intake/ai-ops/exec-summary";
import { requireActorAny } from "../../../lib/matter-actor";

async function handler(req: NextApiRequest, res: NextApiResponse) {
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
    const summary = await getExecutiveOperationsSummary(actor.organizationId);
    res.status(200).json(summary);
  } catch (err) {
    console.error("[/api/ai-ops/exec-summary] failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
}

export default withRequestLog(handler, "/api/ai-ops/exec-summary");
