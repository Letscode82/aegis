/**
 * GET /api/contracts/[id]/negotiate — Playbook-driven Negotiate (PR D).
 *
 * Per-clause counters off the preferred → fallback → walk-away ladder,
 * trajectory across counterparty turns, and advisory human-gated flags for
 * stalled contested clauses. Reconciling the plan writes PENDING AgentDecision
 * flags (idempotent per turn), so it is gated on contracts:approve — the
 * negotiate action, not a passive read.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { getNegotiationPlan } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const contractId = String(req.query.id || "");

  try {
    assertUserCanDo(user, Permission.ContractsApprove);
    const plan = await getNegotiationPlan(user.organizationId, contractId, { id: user.id, type: "USER" });
    return res.status(200).json({ ok: true, plan });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
