/**
 * GET /api/spend/invoices/[id] — invoice detail, scrubbed by the review
 * engine (line items + flags + proposed short-pay). Gated spend:read_all.
 * POST — run + persist the review (flags onto the line items).
 * Both permission-gated; the POST also fires a chain-sealed audit row.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { getInvoiceDetail, runAndPersistReview } from "@aegis/spend";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const id = String(req.query.id || "");
  if (!id) return res.status(400).json({ ok: false, error: "invoice id required" });

  if (req.method === "GET") {
    try {
      assertUserCanDo(user, Permission.SpendReadAll);
    } catch (err) {
      if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
      throw err;
    }
    const invoice = await getInvoiceDetail(user.organizationId, id);
    if (!invoice) return res.status(404).json({ ok: false, error: "Invoice not found" });
    return res.status(200).json({ ok: true, invoice });
  }

  if (req.method === "POST") {
    try {
      assertUserCanDo(user, Permission.SpendReadAll);
    } catch (err) {
      if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
      throw err;
    }
    const review = await runAndPersistReview(user.organizationId, id, user.id);
    return res.status(200).json({ ok: true, review });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
