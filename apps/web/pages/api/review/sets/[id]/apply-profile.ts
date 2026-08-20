/**
 * POST /api/review/sets/[id]/apply-profile — adopt a review profile onto this
 * set (AIR-2). Seeds the set's criteria + issue codes from the profile version
 * and records the provenance link. Legal-hold issue OR DSAR fulfill.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { applyProfileToReviewSet } from "@aegis/review";
import { requireActorAny } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }
  const id = req.query.id;
  if (typeof id !== "string") return res.status(400).json({ error: "Invalid id" });
  const actor = await requireActorAny(req, res, [Permission.MatterLegalHoldIssue, Permission.PrivacyDsarFulfill]);
  if (!actor) return;
  const b = req.body ?? {};
  const profileId = String(b.profileId || "").trim();
  if (!profileId) return res.status(400).json({ ok: false, error: "profileId is required" });
  try {
    const result = await applyProfileToReviewSet(actor.organizationId, id, profileId, { id: actor.id, type: "USER" });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
