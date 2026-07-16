/**
 * POST /api/spend/invoices/[id]/decision — approve or reject an invoice.
 *   body { action: "approve" }  → accept the engine's deterministic
 *                                  short-pay; invoice → APPROVED.
 *   body { action: "reject", reason }
 * Approve is gated spend:approve_invoice; reject on spend:reject_invoice.
 * Both fire a chain-sealed audit row inside the service.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { approveInvoice, rejectInvoice } from "@aegis/spend";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const id = String(req.query.id || "");
  const action = req.body?.action;

  try {
    if (action === "approve") {
      assertUserCanDo(user, Permission.SpendApproveInvoice);
      const result = await approveInvoice(user.organizationId, id, user.id);
      return res.status(200).json({ ok: true, ...result });
    }
    if (action === "reject") {
      assertUserCanDo(user, Permission.SpendRejectInvoice);
      await rejectInvoice(user.organizationId, id, String(req.body?.reason || ""), user.id);
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ ok: false, error: "action must be 'approve' or 'reject'" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
