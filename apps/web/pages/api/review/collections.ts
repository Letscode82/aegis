/**
 * GET /api/review/collections — every review-set collection across the org
 * (all sources: legal hold, DSAR, …) with coded progress + derived stage. The
 * eDiscovery hub's cross-source read. Any review-related read grants.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { listCollections } from "@aegis/review";
import { requireActorAny } from "../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Method not allowed" }); }
  const actor = await requireActorAny(req, res, [Permission.MatterReadAll, Permission.MatterReadAssigned, Permission.MatterLegalHoldCustodianView, Permission.PrivacyDsarRead, Permission.PrivacyDsarFulfill]);
  if (!actor) return;
  const collections = await listCollections(actor.organizationId);
  return res.status(200).json({ ok: true, collections });
}
