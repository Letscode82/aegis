/**
 * GET /api/review/sets/[id]/eca — Early Case Assessment funnel + cost estimate
 * for a collection (ECA-3). Read-only aggregation. Optional ?perDocMinutes= and
 * ?hourlyRate= override the cost model. Legal-hold issue OR DSAR fulfill (or any
 * read grant).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getEcaFunnel } from "@aegis/review";
import { requireActorAny } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Method not allowed" }); }
  const id = req.query.id;
  if (typeof id !== "string") return res.status(400).json({ error: "Invalid id" });
  const actor = await requireActorAny(req, res, [Permission.MatterReadAll, Permission.MatterReadAssigned, Permission.MatterLegalHoldIssue, Permission.PrivacyDsarRead, Permission.PrivacyDsarFulfill]);
  if (!actor) return;
  const num = (v: unknown) => (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);
  try {
    const eca = await getEcaFunnel(actor.organizationId, id, { perDocMinutes: num(req.query.perDocMinutes), hourlyRate: num(req.query.hourlyRate) });
    return res.status(200).json({ ok: true, eca });
  } catch (err) {
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
