/**
 * Per-clause edit (CLM Phase 6c).
 *   PATCH  /api/contracts/[id]/clauses/[clauseId] — edit fields. Body
 *          { type?, text?, risk?, deviation?, summary? }.
 *   DELETE /api/contracts/[id]/clauses/[clauseId] — remove the clause.
 * Both chain-sealed + snapshot a version. Gated on contracts:create.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { updateClause, deleteClause, type UpdateClauseInput } from "@aegis/contracts";

const RISK = new Set(["LOW", "MEDIUM", "HIGH"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const contractId = String(req.query.id || "");
  const clauseId = String(req.query.clauseId || "");

  try {
    assertUserCanDo(user, Permission.ContractsCreate);

    if (req.method === "PATCH") {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const patch: UpdateClauseInput = {};
      if ("type" in b) patch.type = String(b.type ?? "");
      if ("text" in b) patch.text = String(b.text ?? "");
      if ("summary" in b) patch.summary = b.summary ? String(b.summary) : null;
      if ("risk" in b && RISK.has(String(b.risk))) patch.risk = String(b.risk) as UpdateClauseInput["risk"];
      if ("deviation" in b) patch.deviation = Boolean(b.deviation);
      await updateClause(user.organizationId, contractId, clauseId, patch, { id: user.id, type: "USER" });
      return res.status(200).json({ ok: true });
    }

    if (req.method === "DELETE") {
      await deleteClause(user.organizationId, contractId, clauseId, { id: user.id, type: "USER" });
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "PATCH, DELETE");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
