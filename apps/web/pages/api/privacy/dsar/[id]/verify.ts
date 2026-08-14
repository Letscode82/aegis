/**
 * POST /api/privacy/dsar/[id]/verify — record an identity-verification outcome.
 * Body { outcome, method?, note? }. privacy:dsar:fulfill.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { recordDsarVerification } from "@aegis/privacy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ ok: false, error: "Method not allowed" }); }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  try {
    assertUserCanDo(user, Permission.PrivacyDsarFulfill);
    const b = req.body ?? {};
    const request = await recordDsarVerification(user.organizationId, String(req.query.id || ""), { outcome: b.outcome, method: b.method ?? null, note: b.note ?? null }, { id: user.id, type: "USER" });
    return res.status(200).json({ ok: true, request });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
