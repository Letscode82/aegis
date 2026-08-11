/**
 * POST /api/contracts/[id]/amend — open an amendment on a locked, in-force
 * contract. Snapshots the signed version, unlocks by moving to IN_NEGOTIATION,
 * and chain-seals the intent. The caller then edits terms and re-runs approval
 * + signature, which re-seals a fresh integrity baseline. Gated contracts:approve.
 * Body { reason? }.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { openContractAmendment, ContractNotAmendableError } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const contractId = String(req.query.id || "");
  const reason = typeof req.body?.reason === "string" ? req.body.reason : null;

  try {
    assertUserCanDo(user, Permission.ContractsApprove);
    const contract = await openContractAmendment(user.organizationId, contractId, reason, { id: user.id, type: "USER" });
    return res.status(200).json({ ok: true, status: contract.status });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    if (err instanceof ContractNotAmendableError) return res.status(409).json({ ok: false, error: err.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
