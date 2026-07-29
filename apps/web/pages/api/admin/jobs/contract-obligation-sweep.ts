/**
 * POST /api/admin/jobs/contract-obligation-sweep
 *
 * Runs the obligation-breach sweep for the actor's org: every overdue
 * OPEN/IN_PROGRESS contract obligation flips to BREACHED with a
 * `contract.obligation.auto_breached` SYSTEM detection row (days-overdue +
 * escalation tier) and the guarded, chain-sealed status transition.
 * Idempotent — breached obligations leave the scan population.
 *
 * Same pg-boss-ready trigger pattern as intake-sla-scan / the defensibility
 * jobs (see CLAUDE.md Documented exceptions): manual admin button or
 * external scheduler today; `pg-boss.schedule()` calls
 * `evaluateObligationBreaches(orgId)` directly when the worker runtime ships.
 *
 * Gated by `admin:manage_users` (tier-1 admin permission).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { evaluateObligationBreaches } from "@aegis/contracts";
import { requireActor } from "../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.AdminManageUsers);
  if (!actor) return;
  try {
    const result = await evaluateObligationBreaches(actor.organizationId);
    return res.status(200).json(result);
  } catch (err) {
    console.error("[jobs/contract-obligation-sweep] failed:", err);
    return res.status(500).json({ error: String(err) });
  }
}
