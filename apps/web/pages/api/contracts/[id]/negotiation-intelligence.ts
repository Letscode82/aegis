/**
 * GET /api/contracts/[id]/negotiation-intelligence — CLM C-8.
 *
 * Deterministic negotiation posture: every current clause matched against the
 * org clause library (accept / counter-with-approved-fallback / escalate) plus
 * a redline summary of the latest revision. No AI, no mutation. Gated on
 * contracts:read_all (same as the negotiation + clause-library reads).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { getNegotiationIntelligence } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const contractId = String(req.query.id || "");

  try {
    assertUserCanDo(user, Permission.ContractsReadAll);
    const intelligence = await getNegotiationIntelligence(user.organizationId, contractId);
    return res.status(200).json({ ok: true, intelligence });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
