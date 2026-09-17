/**
 * POST /api/spend/invoices/[id]/judgment — the SP-4 AI billing-judge gate.
 *   body { action: "propose" }                          → run AI over judgment
 *                                                          flags → PENDING decision
 *   body { action: "approve", decisionId }              → accept recommended short-pay
 *   body { action: "approve_override", decisionId, overrides:[{lineId,reduction}] }
 *   body { action: "reject", decisionId }               → decline (no reduction)
 *
 * Conservative-AI: the model only proposes; the reduction reaches the invoice
 * only when a reviewer approves the AgentDecision here, and it's applied at
 * invoice-approval time. Gated on spend:approve_invoice.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { proposeInvoiceJudgment, resolveInvoiceJudgment } from "@aegis/spend";

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
    assertUserCanDo(user, Permission.SpendApproveInvoice);
    if (action === "propose") {
      const decision = await proposeInvoiceJudgment(user.organizationId, id, user.id);
      return res.status(200).json({ ok: true, decision });
    }
    if (action === "approve" || action === "approve_override" || action === "reject") {
      const decisionId = String(req.body?.decisionId || "");
      if (!decisionId) return res.status(400).json({ ok: false, error: "decisionId is required" });
      const overrides = Array.isArray(req.body?.overrides) ? req.body.overrides : undefined;
      const decision = await resolveInvoiceJudgment(user.organizationId, id, decisionId, action, user.id, overrides);
      return res.status(200).json({ ok: true, decision });
    }
    return res.status(400).json({ ok: false, error: "action must be propose | approve | approve_override | reject" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
