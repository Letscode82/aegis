/**
 * POST /api/review/sets/[id]/autopilot/step — approve or reject a paused
 * mutating AutoPilot step (CAP-5). Approve is the ONLY path that executes the
 * step's mutation and chain-seals it; reject skips it. Either way the run
 * resumes through its remaining read steps. Body: { stepId, action }.
 * Write grant — this is the human gate that mutates evidence.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { approveAutoPilotStep, rejectAutoPilotStep } from "@aegis/review";
import { requireActorAny } from "../../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const id = req.query.id;
  if (typeof id !== "string") return res.status(400).json({ error: "Invalid id" });

  const actor = await requireActorAny(req, res, [
    Permission.MatterLegalHoldIssue,
    Permission.PrivacyDsarFulfill,
  ]);
  if (!actor) return;

  const body = (req.body ?? {}) as { stepId?: string; action?: string };
  if (!body.stepId || (body.action !== "approve" && body.action !== "reject")) {
    return res.status(400).json({ ok: false, error: "stepId + action (approve|reject) required" });
  }

  try {
    const run =
      body.action === "approve"
        ? await approveAutoPilotStep(actor.organizationId, body.stepId, { id: actor.id, type: "USER" })
        : await rejectAutoPilotStep(actor.organizationId, body.stepId, { id: actor.id, type: "USER" });
    return res.status(200).json({ ok: true, run });
  } catch (err) {
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
