/**
 * POST /api/investigations/[matterId]/suggest-custodians — candidate custodians
 * for the investigation via the M365 directory lookup (mock in dev, real Graph
 * when connected), scoped by the source text. matter:read_all.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getInvestigation, suggestInvestigationCustodians } from "@aegis/matter";
import { requireActor } from "../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }
  const matterId = req.query.matterId;
  if (typeof matterId !== "string") return res.status(400).json({ error: "Invalid matterId" });
  const actor = await requireActor(req, res, Permission.MatterReadAll);
  if (!actor) return;
  const inv = await getInvestigation(actor.organizationId, matterId);
  if (!inv) return res.status(404).json({ ok: false, error: "Not found" });
  try {
    const custodians = await suggestInvestigationCustodians(actor.organizationId, { sourceText: inv.sourceText, matterId });
    return res.status(200).json({ ok: true, custodians });
  } catch (err) {
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
