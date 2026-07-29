/**
 * POST /api/contracts/[id]/extract — re-extract clause intelligence from
 * amended contract text (CLM Phase 3a, "contract intelligence, live").
 *
 * Body { text }. Re-runs the deterministic extractor over the amended text,
 * replaces the ContractClause set, and snapshots a new EXTRACTION version so
 * the existing version redline shows exactly what the amendment changed,
 * clause by clause, against the playbook. Obligations are deliberately NOT
 * re-derived — they carry human-set owners / due dates / lifecycle status.
 *
 * Gated on contracts:create — authoring / amending contract content is a
 * create-grade action (the same permission the intake spawn path holds).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { reExtractContractClauses } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const contractId = String(req.query.id || "");
  const text = String(req.body?.text || "");
  if (!text.trim()) return res.status(400).json({ ok: false, error: "No contract text provided to extract from" });

  try {
    assertUserCanDo(user, Permission.ContractsCreate);
    const result = await reExtractContractClauses(user.organizationId, contractId, text, {
      id: user.id,
      type: "USER",
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
