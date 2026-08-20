/**
 * /api/review/profiles — reusable, versioned review instructions (AIR-2).
 *   GET  — list org profiles (optionally include archived). Legal-hold issue OR
 *          DSAR fulfill.
 *   POST — create a profile (freezes version 1). Same gate.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { listReviewProfiles, createReviewProfile } from "@aegis/review";
import { requireActorAny } from "../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const actor = await requireActorAny(req, res, [Permission.MatterLegalHoldIssue, Permission.PrivacyDsarFulfill]);
  if (!actor) return;
  if (req.method === "GET") {
    const profiles = await listReviewProfiles(actor.organizationId, { includeArchived: req.query.archived === "1" });
    return res.status(200).json({ ok: true, profiles });
  }
  if (req.method === "POST") {
    try {
      const b = req.body ?? {};
      const profile = await createReviewProfile(actor.organizationId, {
        name: b.name, description: b.description, criteria: b.criteria, issues: b.issues,
        promptTemplate: b.promptTemplate, modelParams: b.modelParams, thresholds: b.thresholds, changeLog: b.changeLog,
      }, { id: actor.id, type: "USER" });
      return res.status(200).json({ ok: true, profile });
    } catch (err) {
      return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
    }
  }
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
