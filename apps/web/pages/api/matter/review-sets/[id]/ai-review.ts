/**
 * POST /api/matter/review-sets/[id]/ai-review — run the shared AI-review engine
 * over the set's items (multi-dimension tags + routing; deterministic screen
 * until 4d). Body { criteria?, issues?, dimensions?, pendingOnly? }.
 * matter:legal_hold:issue.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { runAiReviewOnReviewSet } from "@aegis/matter";
import { requireActor } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }
  const id = req.query.id;
  if (typeof id !== "string") return res.status(400).json({ error: "Invalid id" });
  const actor = await requireActor(req, res, Permission.MatterLegalHoldIssue);
  if (!actor) return;
  try {
    const b = req.body ?? {};
    const result = await runAiReviewOnReviewSet(actor.organizationId, id, { criteria: b.criteria, issues: b.issues, dimensions: b.dimensions, pendingOnly: b.pendingOnly }, { id: actor.id, type: "USER" });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
