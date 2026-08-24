/**
 * GET /api/review/validation/dashboard — org-wide AI Validation dashboard
 * (AIR-6 read half). Pure read aggregation over ReviewValidationRun: every
 * scored run grouped by the profile it ran under, with recall / precision / F1 /
 * overturn averages + a chronological drift trend. Any review read grant.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getValidationDashboard } from "@aegis/review";
import { requireActorAny } from "../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Method not allowed" }); }
  const actor = await requireActorAny(req, res, [
    Permission.MatterReadAll,
    Permission.MatterLegalHoldIssue,
    Permission.PrivacyDsarRead,
    Permission.PrivacyDsarFulfill,
  ]);
  if (!actor) return;
  try {
    const dashboard = await getValidationDashboard(actor.organizationId);
    return res.status(200).json({ ok: true, dashboard });
  } catch (err) {
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
