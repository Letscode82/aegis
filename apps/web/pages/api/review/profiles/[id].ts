/**
 * /api/review/profiles/[id] — one review profile (AIR-2).
 *   GET    — detail + immutable version history.
 *   PUT    — update (bumps version, freezes a snapshot).
 *   DELETE — archive (soft; existing review-set links keep resolving).
 * Legal-hold issue OR DSAR fulfill.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getReviewProfile, updateReviewProfile, archiveReviewProfile } from "@aegis/review";
import { requireActorAny } from "../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id;
  if (typeof id !== "string") return res.status(400).json({ error: "Invalid id" });
  const actor = await requireActorAny(req, res, [Permission.MatterLegalHoldIssue, Permission.PrivacyDsarFulfill]);
  if (!actor) return;
  const owner = { id: actor.id, type: "USER" as const };

  if (req.method === "GET") {
    const profile = await getReviewProfile(actor.organizationId, id);
    if (!profile) return res.status(404).json({ ok: false, error: "Not found" });
    return res.status(200).json({ ok: true, profile });
  }
  if (req.method === "PUT") {
    try {
      const b = req.body ?? {};
      const profile = await updateReviewProfile(actor.organizationId, id, {
        name: b.name, description: b.description, criteria: b.criteria, issues: b.issues,
        promptTemplate: b.promptTemplate, modelParams: b.modelParams, thresholds: b.thresholds, changeLog: b.changeLog,
      }, owner);
      return res.status(200).json({ ok: true, profile });
    } catch (err) {
      return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
    }
  }
  if (req.method === "DELETE") {
    try {
      const profile = await archiveReviewProfile(actor.organizationId, id, owner);
      return res.status(200).json({ ok: true, profile });
    } catch (err) {
      return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
    }
  }
  res.setHeader("Allow", "GET, PUT, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
