/**
 * /api/contracts/[id]/assessment — the review position summary.
 *   GET  — deterministic assessment (instant, offline-safe).
 *   POST — AI deep read of the full contract text (robust to any template),
 *          degrades to deterministic if the model is unavailable.
 * Advisory only; read permission (contracts:read_all).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { assessContractDeterministic, assessContractWithAI } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const contractId = String(req.query.id || "");

  try {
    assertUserCanDo(user, Permission.ContractsReadAll);
    if (req.method === "GET") {
      const assessment = await assessContractDeterministic(user.organizationId, contractId);
      return res.status(200).json({ ok: true, assessment });
    }
    if (req.method === "POST") {
      const assessment = await assessContractWithAI(user.organizationId, contractId);
      return res.status(200).json({ ok: true, assessment });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
