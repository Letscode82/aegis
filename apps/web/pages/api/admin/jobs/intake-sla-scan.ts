/**
 * POST /api/admin/jobs/intake-sla-scan
 *
 * Runs the server-side SLA breach scan for the actor's org:
 * escalates every open ticket past its SLA (status → ESCALATED) and
 * writes `intake.ticket.sla_breached` + `intake.ticket.auto_escalated`
 * audit rows per breach. Idempotent — escalated tickets leave the
 * scan population.
 *
 * Same pg-boss-ready trigger pattern as the defensibility jobs (see
 * CLAUDE.md Documented exceptions): manual admin button or external
 * scheduler today; `pg-boss.schedule()` calls
 * `evaluateSlaBreaches(orgId)` directly when the worker runtime
 * ships.
 *
 * Gated by `admin:manage_users` (tier-1 admin permission).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { evaluateSlaBreaches } from "@aegis/intake/sla";
import { requireActor } from "../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.AdminManageUsers);
  if (!actor) return;
  try {
    const result = await evaluateSlaBreaches(actor.organizationId);
    return res.status(200).json(result);
  } catch (err) {
    console.error("[jobs/intake-sla-scan] failed:", err);
    return res.status(500).json({ error: String(err) });
  }
}
