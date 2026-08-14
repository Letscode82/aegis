/**
 * POST /api/matter/[id]/holds/[holdId]/collection — Hold → eDiscovery
 * collection bridge. Runs a custodian-scoped Purview content collection.
 *   { draft:true, naturalLanguage } → draft a KeyQL query (no search).
 *   { preview:true, queryString?/naturalLanguage?, sources? } → preview counts.
 * Gated on matter:legal_hold:issue.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { draftHoldCollectionQuery, previewHoldCollection, getLegalHoldById } from "@aegis/matter";
import { requireActor } from "../../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const holdId = req.query.holdId;
  if (typeof holdId !== "string") return res.status(400).json({ error: "Invalid holdId" });
  const actor = await requireActor(req, res, Permission.MatterLegalHoldIssue);
  if (!actor) return;

  const hold = await getLegalHoldById(holdId);
  if (!hold || hold.organizationId !== actor.organizationId) return res.status(404).json({ error: "Not found" });

  try {
    const b = req.body ?? {};
    if (b.draft) {
      const drafted = await draftHoldCollectionQuery(holdId, String(b.naturalLanguage || ""));
      return res.status(200).json({ ok: true, ...drafted });
    }
    const preview = await previewHoldCollection(holdId, {
      queryString: b.queryString,
      naturalLanguage: b.naturalLanguage,
      sources: b.sources,
      top: b.top,
    });
    return res.status(200).json({ ok: true, preview });
  } catch (err) {
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
