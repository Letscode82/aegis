/**
 * POST /api/review/profiles/draft — "✨ Draft with AI" (AIR-2). Turns a
 * plain-language description into a suggested criteria + issue codes the
 * attorney edits before saving. Deterministic (4d-freeze-safe); does not
 * persist. Legal-hold issue OR DSAR fulfill.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { draftProfileCriteria } from "@aegis/review";
import { requireActorAny } from "../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }
  const actor = await requireActorAny(req, res, [Permission.MatterLegalHoldIssue, Permission.PrivacyDsarFulfill]);
  if (!actor) return;
  const b = req.body ?? {};
  const description = String(b.description || "").trim();
  if (!description) return res.status(400).json({ ok: false, error: "description is required" });
  const draft = draftProfileCriteria({ description, context: typeof b.context === "string" ? b.context : undefined });
  return res.status(200).json({ ok: true, draft });
}
