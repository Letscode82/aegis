/**
 * POST /api/contracts/[id]/obligations/[obligationId] — transition a
 * contract obligation's status (OPEN → IN_PROGRESS → MET, or BREACHED /
 * WAIVED). Body { status }. Managing obligations is a contract write, so
 * it's gated on contracts:create (the CLM author permission). The service
 * chain-seals the transition.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { updateObligationStatus } from "@aegis/contracts";

const VALID = new Set(["OPEN", "IN_PROGRESS", "MET", "BREACHED", "WAIVED"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const obligationId = String(req.query.obligationId || "");
  const status = String(req.body?.status || "");
  if (!VALID.has(status)) return res.status(400).json({ ok: false, error: "Invalid obligation status" });

  try {
    assertUserCanDo(user, Permission.ContractsCreate);
    const updated = await updateObligationStatus(user.organizationId, obligationId, status as never, {
      id: user.id,
      type: "USER",
    });
    return res.status(200).json({ ok: true, status: updated.status });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
