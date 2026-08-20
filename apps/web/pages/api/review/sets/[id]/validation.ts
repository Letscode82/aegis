/**
 * /api/review/sets/[id]/validation — AIR-4 pilot → validate → scale runs.
 *   GET  — list validation runs for this set.
 *   POST — start a validation pilot (stratified sample for human coding).
 * Legal-hold issue OR DSAR fulfill.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { listValidationRuns, startValidationPilot } from "@aegis/review";
import { requireActorAny } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id;
  if (typeof id !== "string") return res.status(400).json({ error: "Invalid id" });
  const actor = await requireActorAny(req, res, [Permission.MatterLegalHoldIssue, Permission.PrivacyDsarFulfill]);
  if (!actor) return;
  if (req.method === "GET") {
    const runs = await listValidationRuns(actor.organizationId, id);
    return res.status(200).json({ ok: true, runs });
  }
  if (req.method === "POST") {
    try {
      const b = req.body ?? {};
      const run = await startValidationPilot(actor.organizationId, id, { sampleSize: b.sampleSize, dimension: b.dimension }, { id: actor.id, type: "USER" });
      return res.status(200).json({ ok: true, run });
    } catch (err) {
      return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
    }
  }
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
