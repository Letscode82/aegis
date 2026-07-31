/**
 * POST /api/contracts/[id]/renewal/decision — record the GC's renewal decision.
 * Body { decision: "RENEW"|"RENEGOTIATE"|"NON_RENEWAL", reason?, termMonths? }.
 * RENEW rolls expiry forward a term + increments renewalCount; the others
 * record intent. Chain-sealed. Gated on contracts:approve (extends the contract).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { recordRenewalDecision } from "@aegis/contracts";

const VALID = new Set(["RENEW", "RENEGOTIATE", "NON_RENEWAL"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  const contractId = String(req.query.id || "");
  const decision = String(req.body?.decision || "");
  if (!VALID.has(decision)) return res.status(400).json({ ok: false, error: "Invalid renewal decision" });
  const reason = req.body?.reason != null ? String(req.body.reason) : null;
  const termMonths =
    req.body?.termMonths != null && Number.isFinite(Number(req.body.termMonths))
      ? Number(req.body.termMonths)
      : null;

  try {
    assertUserCanDo(user, Permission.ContractsApprove);
    const contract = await recordRenewalDecision(
      user.organizationId,
      contractId,
      { decision: decision as "RENEW" | "RENEGOTIATE" | "NON_RENEWAL", reason, termMonths },
      { id: user.id, type: "USER" },
    );
    return res.status(200).json({ ok: true, contract });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
