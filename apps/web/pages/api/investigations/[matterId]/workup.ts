/**
 * POST /api/investigations/[matterId]/workup — INV-2 one-click preserve +
 * collect. Creates a DRAFT legal hold on the investigation's matter and an
 * INVESTIGATION collection scoped to the chosen custodians. matter:legal_hold:issue.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { startInvestigationWorkup } from "@aegis/matter";
import { requireActor } from "../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }
  const matterId = req.query.matterId;
  if (typeof matterId !== "string") return res.status(400).json({ error: "Invalid matterId" });
  const actor = await requireActor(req, res, Permission.MatterLegalHoldIssue);
  if (!actor) return;
  try {
    const b = req.body ?? {};
    const custodianIdentifiers = Array.isArray(b.custodianIdentifiers)
      ? b.custodianIdentifiers
      : String(b.custodianIdentifiers || "").split(/[\n,]/).map((s: string) => s.trim()).filter(Boolean);
    const result = await startInvestigationWorkup(actor, { matterId, custodianIdentifiers, jurisdictions: Array.isArray(b.jurisdictions) ? b.jurisdictions : undefined });
    return res.status(200).json({ ok: true, result });
  } catch (err) {
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
