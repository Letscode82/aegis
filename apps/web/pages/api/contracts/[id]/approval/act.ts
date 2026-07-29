/**
 * POST /api/contracts/[id]/approval/act — act on the current ladder step.
 * Body { action: "approve"|"send_back"|"reject"|"cancel", comment? }.
 * Gated on contracts:approve. When the final approve completes the ladder,
 * the service auto-advances the contract IN_REVIEW → APPROVED (the gate);
 * a reject reopens it to IN_NEGOTIATION. Every action is chain-sealed.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { actOnContractApproval } from "@aegis/contracts";

const VALID = new Set(["approve", "send_back", "reject", "cancel"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const contractId = String(req.query.id || "");
  const action = String(req.body?.action || "");
  const comment = req.body?.comment != null ? String(req.body.comment) : null;
  if (!VALID.has(action)) return res.status(400).json({ ok: false, error: "Invalid approval action" });

  try {
    assertUserCanDo(user, Permission.ContractsApprove);
    const state = await actOnContractApproval(
      user.organizationId,
      contractId,
      action as never,
      { id: user.id, type: "USER" },
      comment,
    );
    return res.status(200).json({ ok: true, state });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
