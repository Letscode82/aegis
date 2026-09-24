/**
 * GET /api/matter/[id]/spend — the matter's cross-module spend view (Spend #6):
 * budget-vs-actual + approved-invoice totals (getMatterSpendSummary) and the
 * full per-matter invoice list (listMatterInvoices), both from @aegis/spend.
 * Gated matter:read_all OR spend:read_matter_budget.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getMatterSpendSummary, listMatterInvoices } from "@aegis/spend";
import { requireActorAny } from "../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Method not allowed" }); }
  const id = req.query.id;
  if (typeof id !== "string") return res.status(400).json({ error: "Invalid id" });
  const actor = await requireActorAny(req, res, [Permission.MatterReadAll, Permission.SpendReadMatterBudget]);
  if (!actor) return;
  try {
    const [summary, invoices] = await Promise.all([
      getMatterSpendSummary(actor.organizationId, id),
      listMatterInvoices(actor.organizationId, id),
    ]);
    return res.status(200).json({ ok: true, summary, invoices });
  } catch (err) {
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
