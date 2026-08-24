/**
 * /api/review/sets/[id]/autopilot — Case AutoPilot (CAP-5).
 *   GET  — the latest run for this collection (the panel polls this).
 *   POST — start a run from a directive. Plans the steps and advances through
 *          the read steps up to the first gate; mutating steps pause for
 *          approval (see ./autopilot/step).
 * Read grant lists; start needs a write grant (it queues evidence-touching
 * mutations behind the human gate).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getLatestAutoPilotRun, startAutoPilot } from "@aegis/review";
import { requireActorAny } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id;
  if (typeof id !== "string") return res.status(400).json({ error: "Invalid id" });

  if (req.method === "GET") {
    const actor = await requireActorAny(req, res, [
      Permission.MatterReadAll,
      Permission.MatterLegalHoldIssue,
      Permission.PrivacyDsarRead,
      Permission.PrivacyDsarFulfill,
    ]);
    if (!actor) return;
    const run = await getLatestAutoPilotRun(actor.organizationId, id);
    return res.status(200).json({ ok: true, run });
  }

  if (req.method === "POST") {
    const actor = await requireActorAny(req, res, [
      Permission.MatterLegalHoldIssue,
      Permission.PrivacyDsarFulfill,
    ]);
    if (!actor) return;
    try {
      const directive = String((req.body ?? {}).directive ?? "");
      const run = await startAutoPilot(actor.organizationId, id, directive, {
        id: actor.id,
        type: "USER",
      });
      return res.status(200).json({ ok: true, run });
    } catch (err) {
      return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
