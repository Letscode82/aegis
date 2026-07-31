/**
 * POST /api/admin/jobs/renewal-notice-sweep
 *
 * Auto-creates a RENEWAL_NOTICE obligation for every auto-renew contract whose
 * non-renewal notice deadline is approaching (within horizon) and not yet
 * decided/sent, so the deadline lands in the shared obligation ledger + alerts.
 * Idempotent — contracts that already have an open RENEWAL_NOTICE obligation are
 * skipped.
 *
 * Same pg-boss-ready trigger pattern as the obligation-breach sweep (see
 * CLAUDE.md Documented exceptions): manual admin button or external scheduler
 * today; `pg-boss.schedule()` calls `ensureRenewalNoticeObligations(orgId)`
 * directly when the worker runtime ships.
 *
 * Gated by `admin:manage_users`.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { ensureRenewalNoticeObligations } from "@aegis/contracts";
import { requireActor } from "../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.AdminManageUsers);
  if (!actor) return;
  try {
    const horizonDays = Number(req.body?.horizonDays);
    const result = await ensureRenewalNoticeObligations(
      actor.organizationId,
      Number.isFinite(horizonDays) && horizonDays > 0 ? { horizonDays } : {},
    );
    return res.status(200).json(result);
  } catch (err) {
    console.error("[jobs/renewal-notice-sweep] failed:", err);
    return res.status(500).json({ error: String(err) });
  }
}
