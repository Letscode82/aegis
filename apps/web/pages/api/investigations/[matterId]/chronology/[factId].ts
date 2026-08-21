/**
 * DELETE /api/investigations/[matterId]/chronology/[factId] — remove a fact
 * from the chronology (INV-3). Chain-sealed. matter:update.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { deleteInvestigationFact } from "@aegis/matter";
import { requireActor } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "DELETE") { res.setHeader("Allow", "DELETE"); return res.status(405).json({ error: "Method not allowed" }); }
  const factId = req.query.factId;
  if (typeof factId !== "string") return res.status(400).json({ error: "Invalid factId" });
  const actor = await requireActor(req, res, Permission.MatterUpdate);
  if (!actor) return;
  try {
    await deleteInvestigationFact(actor.organizationId, factId, actor);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
