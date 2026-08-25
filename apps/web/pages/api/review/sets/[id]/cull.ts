/**
 * /api/review/sets/[id]/cull — the Cull stage's persisted culls.
 *   GET  — the exclusion log. POST { action: "apply" | "clear" }.
 * Legal-hold issue OR DSAR fulfill.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { applyThreadNearDupCull, applyKeywordCull, applySourceTypeCull, applyDateWindowCull, clearCull, listExclusions } from "@aegis/review";
import { requireActorAny } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id;
  if (typeof id !== "string") return res.status(400).json({ error: "Invalid id" });
  const actor = await requireActorAny(req, res, [Permission.MatterLegalHoldIssue, Permission.PrivacyDsarFulfill]);
  if (!actor) return;
  try {
    if (req.method === "GET") {
      const exclusions = await listExclusions(actor.organizationId, id);
      return res.status(200).json({ ok: true, exclusions });
    }
    if (req.method === "POST") {
      const body = req.body ?? {};
      const action = body.action;
      const who = { id: actor.id, type: "USER" as const };
      let result;
      if (action === "clear") {
        result = await clearCull(actor.organizationId, id, who);
      } else if (action === "keyword") {
        const patterns = Array.isArray(body.patterns)
          ? body.patterns
          : String(body.patterns || "").split(/[\n,]/).map((s: string) => s.trim()).filter(Boolean);
        result = await applyKeywordCull(actor.organizationId, id, patterns, who);
      } else if (action === "source") {
        const sourceTypes = Array.isArray(body.sourceTypes) ? body.sourceTypes : [];
        result = await applySourceTypeCull(actor.organizationId, id, sourceTypes, who);
      } else if (action === "date") {
        result = await applyDateWindowCull(actor.organizationId, id, { before: body.before || null, after: body.after || null }, who);
      } else {
        result = await applyThreadNearDupCull(actor.organizationId, id, who);
      }
      return res.status(200).json({ ok: true, ...result });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
