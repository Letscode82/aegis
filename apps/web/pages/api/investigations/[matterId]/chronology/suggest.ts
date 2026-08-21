/**
 * POST /api/investigations/[matterId]/chronology/suggest — deterministic
 * candidate facts from the matter's responsive documents (INV-3). No
 * persistence; the reviewer confirms each before it enters the record.
 * matter:read_all.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { suggestInvestigationFacts } from "@aegis/matter";
import { requireActor } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }
  const matterId = req.query.matterId;
  if (typeof matterId !== "string") return res.status(400).json({ error: "Invalid matterId" });
  const actor = await requireActor(req, res, Permission.MatterReadAll);
  if (!actor) return;
  const b = req.body ?? {};
  const suggestions = await suggestInvestigationFacts(actor.organizationId, matterId, typeof b.limit === "number" ? b.limit : undefined);
  return res.status(200).json({ ok: true, suggestions });
}
