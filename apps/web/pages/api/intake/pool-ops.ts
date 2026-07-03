/**
 * GET /api/intake/pool-ops?days=30
 *
 * W2-3 — read-only aggregator for the Pool Ops dashboard: per-tier
 * utilization, overflow pressure, throughput, and complexity mix.
 *
 * Authorization mirrors /api/ai-ops/summary: `intake:read_all_tickets`
 * (legal-ops staff) OR `audit:read_all` (GCs) — either grant is
 * sufficient. No mutations, no audit writes.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { withRequestLog } from "@aegis/observability";
import { Permission } from "@aegis/auth";
import { getPoolOpsSummary } from "@aegis/intake/pool-ops";
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

  const raw = Number(req.query.days);
  const days = Number.isFinite(raw) ? Math.min(Math.max(Math.round(raw), 7), 90) : 30;

  try {
    const summary = await getPoolOpsSummary(actor.organizationId, days);
    res.status(200).json(summary);
  } catch (err) {
    console.error("[/api/intake/pool-ops] failed:", err);
    res.status(500).json({ error: "Internal error" });
  }
}

// W4-5 — structured request log + slow-request flag + last-resort catch.
export default withRequestLog(handler, "/api/intake/pool-ops");
