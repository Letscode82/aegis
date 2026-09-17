/**
 * GET /api/privacy/overview — privacy program KPI roll-up across DSAR,
 * assessments, RoPA, incidents and consent. Gated privacy:dsar:read.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { getPrivacyProgramSummary } from "@aegis/privacy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ ok: false, error: "Method not allowed" }); }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  try {
    assertUserCanDo(user, Permission.PrivacyDsarRead);
    return res.status(200).json({ ok: true, summary: await getPrivacyProgramSummary(user.organizationId) });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(500).json({ ok: false, error: String((err as Error).message || err) });
  }
}
