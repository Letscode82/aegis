/**
 * /api/privacy/dsar/[id]/hold-conflict — the erasure ↔ legal-hold guard.
 *   GET  — (re)check the conflict via @aegis/matter. privacy:dsar:read.
 *   POST — record an override reason. Body { reason }. privacy:dsar:fulfill.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { checkErasureHoldConflict, overrideHoldConflict } from "@aegis/privacy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const id = String(req.query.id || "");
  try {
    if (req.method === "GET") {
      assertUserCanDo(user, Permission.PrivacyDsarRead);
      const result = await checkErasureHoldConflict(user.organizationId, id, { id: user.id, type: "USER" });
      return res.status(200).json({ ok: true, conflict: result });
    }
    if (req.method === "POST") {
      assertUserCanDo(user, Permission.PrivacyDsarFulfill);
      const result = await overrideHoldConflict(user.organizationId, id, String(req.body?.reason || ""), { id: user.id, type: "USER" });
      return res.status(200).json({ ok: true, conflict: result });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
