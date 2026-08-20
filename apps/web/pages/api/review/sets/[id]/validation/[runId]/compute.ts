/**
 * POST /api/review/sets/[id]/validation/[runId]/compute — compute recall /
 * precision / overturn of the AI vs human coding on the pilot sample (AIR-4).
 * Legal-hold issue OR DSAR fulfill.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { computeValidationMetrics } from "@aegis/review";
import { requireActorAny } from "../../../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }
  const runId = req.query.runId;
  if (typeof runId !== "string") return res.status(400).json({ error: "Invalid runId" });
  const actor = await requireActorAny(req, res, [Permission.MatterLegalHoldIssue, Permission.PrivacyDsarFulfill]);
  if (!actor) return;
  try {
    const run = await computeValidationMetrics(actor.organizationId, runId, { id: actor.id, type: "USER" });
    return res.status(200).json({ ok: true, run });
  } catch (err) {
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
