/**
 * POST /api/contracts/[id]/narrative/[decisionId]/resolve
 *   body { action: "approve" | "reject" }
 *
 * The human gate (CLM Phase 3b). Approve/reject is the ONLY path off a
 * PENDING AgentDecision; the verdict is immutable afterward. The service
 * writes a chain-sealed AuditLog row and links it back onto the decision.
 *
 * Gated on contracts:approve — accepting an AI-generated artifact into the
 * record is an approval-grade action. Resolving an already-resolved decision
 * returns 409.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { resolveChangeNarrative } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const contractId = String(req.query.id || "");
  const decisionId = String(req.query.decisionId || "");
  const action = String(req.body?.action || "");
  if (action !== "approve" && action !== "reject")
    return res.status(400).json({ ok: false, error: "action must be 'approve' or 'reject'" });

  try {
    assertUserCanDo(user, Permission.ContractsApprove);
    const narrative = await resolveChangeNarrative(user.organizationId, contractId, decisionId, action, {
      id: user.id,
      type: "USER",
    });
    return res.status(200).json({ ok: true, narrative });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    const msg = String((err as Error).message || err);
    if (/already been resolved/.test(msg)) return res.status(409).json({ ok: false, error: msg });
    return res.status(400).json({ ok: false, error: msg });
  }
}
