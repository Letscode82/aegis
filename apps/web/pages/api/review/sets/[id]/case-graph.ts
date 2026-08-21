/**
 * POST /api/review/sets/[id]/case-graph — run the Case Graph (CAP-2): a DAG of
 * agents over the collection that emits a Case Dossier (theory, issue clusters,
 * timeline, entities, key docs, gaps). Read-only analysis. Legal-hold issue OR
 * DSAR fulfill (or any read).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { runCaseGraph } from "@aegis/review";
import { requireActorAny } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }
  const id = req.query.id;
  if (typeof id !== "string") return res.status(400).json({ error: "Invalid id" });
  const actor = await requireActorAny(req, res, [Permission.MatterReadAll, Permission.MatterReadAssigned, Permission.MatterLegalHoldIssue, Permission.PrivacyDsarRead, Permission.PrivacyDsarFulfill]);
  if (!actor) return;
  try {
    const dossier = await runCaseGraph(actor.organizationId, id, { id: actor.id, type: "USER" });
    return res.status(200).json({ ok: true, dossier });
  } catch (err) {
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
