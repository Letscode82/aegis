/**
 * /api/investigations — INV-1 investigations surface.
 *   GET  — list the org's investigations. matter:read_all.
 *   POST — open an investigation (creates the backing Matter + companion row).
 *          matter:create.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { listInvestigations, createInvestigation } from "@aegis/matter";
import { requireActor } from "../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const actor = await requireActor(req, res, Permission.MatterReadAll);
    if (!actor) return;
    const investigations = await listInvestigations(actor.organizationId);
    return res.status(200).json({ ok: true, investigations });
  }
  if (req.method === "POST") {
    const actor = await requireActor(req, res, Permission.MatterCreate);
    if (!actor) return;
    try {
      const b = req.body ?? {};
      const investigation = await createInvestigation({ title: b.title, sourceText: b.sourceText, jurisdiction: b.jurisdiction }, actor);
      return res.status(200).json({ ok: true, investigation });
    } catch (err) {
      return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
    }
  }
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
