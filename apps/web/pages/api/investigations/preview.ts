/**
 * POST /api/investigations/preview — extract issue codes + a draft plan from a
 * source letter (deterministic; no persistence). The investigator reviews and
 * edits before committing. matter:create.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { previewInvestigation } from "@aegis/matter";
import { requireActor } from "../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }
  const actor = await requireActor(req, res, Permission.MatterCreate);
  if (!actor) return;
  const b = req.body ?? {};
  const sourceText = String(b.sourceText || "").trim();
  if (!sourceText) return res.status(400).json({ ok: false, error: "sourceText is required" });
  const draft = previewInvestigation(sourceText, typeof b.title === "string" ? b.title : undefined);
  return res.status(200).json({ ok: true, draft });
}
