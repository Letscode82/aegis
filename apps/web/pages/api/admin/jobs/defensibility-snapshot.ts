/**
 * POST /api/admin/jobs/defensibility-snapshot
 *
 * Runs the daily snapshot pass for the actor's org. Idempotent
 * within the same UTC day. Triggered by:
 *   - manual admin button (in admin tooling), or
 *   - external scheduler (Vercel Cron / GitHub Actions / pg-boss
 *     worker once that ships) hitting this endpoint.
 *
 * Pg-boss worker runtime isn't yet wired in this repo (see
 * CLAUDE.md Documented exceptions). The service shape is
 * pg-boss-ready: when the runtime lands, the worker calls
 * `runDailySnapshotPass(orgId)` directly and this route stays as
 * the manual / cron fallback trigger.
 *
 * Gated by `admin:manage_users` (tier-1 admin permission).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { runDailySnapshotPass } from "@aegis/matter";
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
    const result = await runDailySnapshotPass(actor.organizationId);
    return res.status(200).json(result);
  } catch (err) {
    console.error("[jobs/defensibility-snapshot] failed:", err);
    return res.status(500).json({ error: String(err) });
  }
}
