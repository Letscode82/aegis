/**
 * POST /api/privacy/dsar/[id]/transition — advance the request's lifecycle.
 * Body { toStatus, reason? }. privacy:dsar:fulfill. Guards + audit in service.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { transitionDsar, DsarErasureHoldConflictError } from "@aegis/privacy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ ok: false, error: "Method not allowed" }); }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  try {
    assertUserCanDo(user, Permission.PrivacyDsarFulfill);
    const b = req.body ?? {};
    const request = await transitionDsar(user.organizationId, String(req.query.id || ""), { toStatus: b.toStatus, reason: b.reason ?? null }, { id: user.id, type: "USER" });
    return res.status(200).json({ ok: true, request });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    if (err instanceof DsarErasureHoldConflictError) return res.status(409).json({ ok: false, error: err.message, code: "HOLD_CONFLICT" });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
