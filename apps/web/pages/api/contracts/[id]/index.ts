/**
 * GET /api/contracts/[id] — one contract with its extracted clauses and
 * its obligations (the shared Obligation entity, sourceType=CONTRACT).
 * Gated on contracts:read_all.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { getContractDetail } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  try {
    assertUserCanDo(user, Permission.ContractsReadAll);
  } catch (err) {
    if (err instanceof AccessDeniedError)
      return res.status(403).json({ ok: false, error: err.decision.message });
    throw err;
  }
  const contract = await getContractDetail(user.organizationId, String(req.query.id || ""));
  if (!contract) return res.status(404).json({ ok: false, error: "Contract not found" });
  return res.status(200).json({ ok: true, contract });
}
