/**
 * GET /api/investigations/[matterId]/report — the investigation findings report
 * (INV-4): summary + issues + chronology + key docs + gaps + recommendations,
 * with a Markdown rendering. Read-only. matter:read_all.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { buildInvestigationReport } from "@aegis/matter";
import { requireActor } from "../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Method not allowed" }); }
  const matterId = req.query.matterId;
  if (typeof matterId !== "string") return res.status(400).json({ error: "Invalid matterId" });
  const actor = await requireActor(req, res, Permission.MatterReadAll);
  if (!actor) return;
  try {
    const report = await buildInvestigationReport(actor.organizationId, matterId);
    return res.status(200).json({ ok: true, report });
  } catch (err) {
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
