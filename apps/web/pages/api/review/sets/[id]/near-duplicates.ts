/**
 * GET /api/review/sets/[id]/near-duplicates — near-duplicate groups over the
 * collection (PROC-9), computed on the fly (MinHash). Read-only; any review read
 * grant. Optional ?threshold= (0..1, default 0.8).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getNearDuplicates } from "@aegis/review";
import { requireActorAny } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Method not allowed" }); }
  const id = req.query.id;
  if (typeof id !== "string") return res.status(400).json({ error: "Invalid id" });
  const actor = await requireActorAny(req, res, [
    Permission.MatterReadAll,
    Permission.MatterReadAssigned,
    Permission.MatterLegalHoldIssue,
    Permission.PrivacyDsarRead,
    Permission.PrivacyDsarFulfill,
  ]);
  if (!actor) return;
  const th = typeof req.query.threshold === "string" ? Number(req.query.threshold) : NaN;
  const threshold = Number.isFinite(th) && th > 0 && th <= 1 ? th : 0.8;
  try {
    const result = await getNearDuplicates(actor.organizationId, id, threshold);
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
