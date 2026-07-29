/**
 * POST /api/contracts/[id]/status — advance a contract through its CLM
 * lifecycle (state-machine guarded). Body { status }. Gated on
 * contracts:approve — moving a contract's lifecycle state is an approval-
 * grade action. Illegal transitions (per contract-state-machine) return
 * 409; the service chain-seals the transition and stamps the lifecycle
 * timestamps.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { transitionContractStatus, IllegalContractTransitionError } from "@aegis/contracts";

const VALID = new Set([
  "DRAFT",
  "IN_REVIEW",
  "IN_NEGOTIATION",
  "APPROVED",
  "EXECUTED",
  "ACTIVE",
  "EXPIRED",
  "TERMINATED",
]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const contractId = String(req.query.id || "");
  const status = String(req.body?.status || "");
  if (!VALID.has(status)) return res.status(400).json({ ok: false, error: "Invalid contract status" });

  try {
    assertUserCanDo(user, Permission.ContractsApprove);
    const updated = await transitionContractStatus(user.organizationId, contractId, status as never, {
      id: user.id,
      type: "USER",
    });
    return res.status(200).json({ ok: true, status: updated.status });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    if (err instanceof IllegalContractTransitionError)
      return res.status(409).json({ ok: false, error: err.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
