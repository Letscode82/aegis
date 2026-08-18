/**
 * GET /api/review/sets/[id] — review-set detail + items + progress, for the
 * shared reviewer (legal hold + DSAR). Read gate: matter read OR DSAR read.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getReviewSetDetail } from "@aegis/review";
import { requireActorAny } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Method not allowed" }); }
  const id = req.query.id;
  if (typeof id !== "string") return res.status(400).json({ error: "Invalid id" });
  const actor = await requireActorAny(req, res, [Permission.MatterReadAll, Permission.MatterReadAssigned, Permission.MatterLegalHoldCustodianView, Permission.PrivacyDsarRead, Permission.PrivacyDsarFulfill]);
  if (!actor) return;
  const detail = await getReviewSetDetail(actor.organizationId, id);
  if (!detail) return res.status(404).json({ ok: false, error: "Not found" });
  return res.status(200).json({ ok: true, ...detail });
}
