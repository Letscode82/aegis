/**
 * GET /api/privacy/dsar/[id]/validation — recall/precision/overturn of the AI
 * relevance pass vs. the human decisions on this request. privacy:dsar:read.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { getDsarValidation } from "@aegis/privacy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ ok: false, error: "Method not allowed" }); }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  try {
    assertUserCanDo(user, Permission.PrivacyDsarRead);
    const validation = await getDsarValidation(user.organizationId, String(req.query.id || ""));
    return res.status(200).json({ ok: true, validation });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
