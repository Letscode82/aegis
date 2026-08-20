/**
 * /api/investigations/[matterId]/chronology — INV-3 case chronology.
 *   GET  — the ordered fact timeline. matter:read_all.
 *   POST — add a fact (human-confirmed). matter:update.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { listInvestigationChronology, addInvestigationFact } from "@aegis/matter";
import { requireActor } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const matterId = req.query.matterId;
  if (typeof matterId !== "string") return res.status(400).json({ error: "Invalid matterId" });
  if (req.method === "GET") {
    const actor = await requireActor(req, res, Permission.MatterReadAll);
    if (!actor) return;
    const facts = await listInvestigationChronology(actor.organizationId, matterId);
    return res.status(200).json({ ok: true, facts });
  }
  if (req.method === "POST") {
    const actor = await requireActor(req, res, Permission.MatterUpdate);
    if (!actor) return;
    try {
      const b = req.body ?? {};
      const fact = await addInvestigationFact({ matterId, reviewSetItemId: b.reviewSetItemId, occurredOn: b.occurredOn, label: b.label, detail: b.detail, issueKeys: b.issueKeys, sourceQuote: b.sourceQuote }, actor);
      return res.status(200).json({ ok: true, fact });
    } catch (err) {
      return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
    }
  }
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
