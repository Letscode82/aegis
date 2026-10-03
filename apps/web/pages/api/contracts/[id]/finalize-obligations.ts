/**
 * POST /api/contracts/[id]/finalize-obligations — CLM C-9.
 *
 * Reconcile the contract's obligation ledger to its (executed) terms: extract
 * commitments, create any not yet tracked, and assign the matter lead as
 * owner. Runs automatically on execution; this route is the manual backfill /
 * re-run for an already-executed contract. Idempotent, chain-sealed. Gated on
 * contracts:create (an obligation-writing action).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { finalizeContractObligations } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const contractId = String(req.query.id || "");

  try {
    assertUserCanDo(user, Permission.ContractsCreate);
    const result = await finalizeContractObligations(user.organizationId, contractId, { id: user.id, type: "USER" });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
