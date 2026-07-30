/**
 * POST /api/contracts/[id]/approval/run-agent — (re-)run the AI Risk Review
 * rung of the approval ladder. Produces advisory findings (deterministic
 * clause-derived risk read); it never advances the ladder — a human still
 * approves the step. Gated on contracts:approve, matching the act surface.
 * No-op unless a ladder is running with a PENDING AGENT task at its step.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { runContractApprovalAgent } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const contractId = String(req.query.id || "");

  try {
    assertUserCanDo(user, Permission.ContractsApprove);
    const state = await runContractApprovalAgent(user.organizationId, contractId);
    return res.status(200).json({ ok: true, state });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
