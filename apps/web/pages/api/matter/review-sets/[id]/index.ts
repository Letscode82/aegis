/**
 * GET /api/matter/review-sets/[id] — review-set detail + items + progress, for
 * the reviewer console. matter:read_all (or assigned / custodian view).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getReviewSetDetail } from "@aegis/matter";
import { requireActorAny } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Method not allowed" }); }
  const id = req.query.id;
  if (typeof id !== "string") return res.status(400).json({ error: "Invalid id" });
  const actor = await requireActorAny(req, res, [Permission.MatterReadAll, Permission.MatterReadAssigned, Permission.MatterLegalHoldCustodianView]);
  if (!actor) return;
  const detail = await getReviewSetDetail(actor.organizationId, id);
  if (!detail) return res.status(404).json({ ok: false, error: "Not found" });
  return res.status(200).json({ ok: true, ...detail });
}
