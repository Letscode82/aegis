/**
 * AI clause remediation (CLM Phase 5b).
 *
 * GET  /api/contracts/[id]/clauses/[clauseId]/remediation
 *   Read the current remediation suggestion for a clause (or null). Gated
 *   contracts:read_all.
 * POST /api/contracts/[id]/clauses/[clauseId]/remediation
 *   Generate (or refresh) a suggestion — writes a PENDING AgentDecision (an
 *   advisory rec, applied only on accept). Gated contracts:read_all.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { suggestClauseRemediation, getClauseRemediation } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const contractId = String(req.query.id || "");
  const clauseId = String(req.query.clauseId || "");

  try {
    assertUserCanDo(user, Permission.ContractsReadAll);
    if (req.method === "GET") {
      const remediation = await getClauseRemediation(user.organizationId, clauseId);
      return res.status(200).json({ ok: true, remediation });
    }
    if (req.method === "POST") {
      const remediation = await suggestClauseRemediation(user.organizationId, contractId, clauseId, { id: user.id, type: "USER" });
      return res.status(200).json({ ok: true, remediation });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
