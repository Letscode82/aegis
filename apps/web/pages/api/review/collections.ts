/**
 * /api/review/collections — the eDiscovery hub's cross-source collections.
 *   GET  — every review-set collection across the org (all sources) with coded
 *          progress + derived stage. Any review-related read grants.
 *   POST — start a hub-initiated collection (internal investigation / ad-hoc
 *          culling) from a custodian list. matter:legal_hold:issue.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { listCollections } from "@aegis/review";
import { createAdhocCollection } from "@aegis/matter";
import { requireActor, requireActorAny } from "../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const actor = await requireActorAny(req, res, [Permission.MatterReadAll, Permission.MatterReadAssigned, Permission.MatterLegalHoldCustodianView, Permission.PrivacyDsarRead, Permission.PrivacyDsarFulfill]);
    if (!actor) return;
    const collections = await listCollections(actor.organizationId);
    return res.status(200).json({ ok: true, collections });
  }
  if (req.method === "POST") {
    const actor = await requireActor(req, res, Permission.MatterLegalHoldIssue);
    if (!actor) return;
    try {
      const b = req.body ?? {};
      const identifiers = Array.isArray(b.identifiers) ? b.identifiers : String(b.identifiers || "").split(/[\n,]/);
      const source = b.source === "INVESTIGATION" ? "INVESTIGATION" : "ADHOC";
      const reviewSet = await createAdhocCollection(actor.organizationId, { name: b.name, source, identifiers, sources: b.sources, top: b.top, matterId: b.matterId }, { id: actor.id, type: "USER" });
      return res.status(200).json({ ok: true, reviewSet });
    } catch (err) {
      return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
    }
  }
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
