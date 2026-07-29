/**
 * POST /api/contracts/[id]/clauses — add a clause by hand (CLM Phase 6c).
 * Body { type, text, risk?, deviation?, summary? }. Chain-sealed + snapshots
 * a version. Gated on contracts:create.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { addClauseManual } from "@aegis/contracts";

const RISK = new Set(["LOW", "MEDIUM", "HIGH"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const contractId = String(req.query.id || "");
  const b = req.body ?? {};
  if (!String(b.type || "").trim()) return res.status(400).json({ ok: false, error: "type is required" });
  if (!String(b.text || "").trim()) return res.status(400).json({ ok: false, error: "text is required" });

  try {
    assertUserCanDo(user, Permission.ContractsCreate);
    const clause = await addClauseManual(user.organizationId, contractId, {
      type: String(b.type), text: String(b.text),
      summary: b.summary ? String(b.summary) : null,
      risk: RISK.has(String(b.risk)) ? String(b.risk) : "LOW",
      deviation: Boolean(b.deviation),
    } as never, { id: user.id, type: "USER" });
    return res.status(200).json({ ok: true, clauseId: clause.id });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
