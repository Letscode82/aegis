/**
 * POST /api/review/sets/[id]/produce — assemble a Bates production + privilege
 * log from a frozen, fully-coded set. Legal-hold issue OR DSAR fulfill.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { produceReviewSet } from "@aegis/review";
import { requireActorAny } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }
  const id = req.query.id;
  if (typeof id !== "string") return res.status(400).json({ error: "Invalid id" });
  const actor = await requireActorAny(req, res, [Permission.MatterLegalHoldIssue, Permission.PrivacyDsarFulfill]);
  if (!actor) return;
  try {
    const result = await produceReviewSet(actor.organizationId, id, { batesPrefix: req.body?.batesPrefix }, { id: actor.id, type: "USER" });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
