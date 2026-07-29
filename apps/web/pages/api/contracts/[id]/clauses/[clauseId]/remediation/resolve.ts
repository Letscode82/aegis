/**
 * POST /api/contracts/[id]/clauses/[clauseId]/remediation/resolve
 *   body { decisionId, action: "approve" | "reject", chosenText? }
 *
 * The human gate (CLM Phase 5b). Approve APPLIES the replacement to the
 * clause (optionally an operator-chosen option via chosenText), marks it
 * non-deviating, downgrades risk, and snapshots a new version. The verdict
 * is immutable afterward. Gated on contracts:approve (accepting an AI edit
 * into the contract record is approval-grade). 409 on already-resolved.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { resolveClauseRemediation } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const contractId = String(req.query.id || "");
  const decisionId = String(req.body?.decisionId || "");
  const action = String(req.body?.action || "");
  if (!decisionId) return res.status(400).json({ ok: false, error: "decisionId is required" });
  if (action !== "approve" && action !== "reject")
    return res.status(400).json({ ok: false, error: "action must be 'approve' or 'reject'" });

  try {
    assertUserCanDo(user, Permission.ContractsApprove);
    const remediation = await resolveClauseRemediation(
      user.organizationId, contractId, decisionId, action, { id: user.id, type: "USER" },
      { chosenText: req.body?.chosenText ?? null },
    );
    return res.status(200).json({ ok: true, remediation });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    const msg = String((err as Error).message || err);
    if (/already been resolved/.test(msg)) return res.status(409).json({ ok: false, error: msg });
    return res.status(400).json({ ok: false, error: msg });
  }
}
