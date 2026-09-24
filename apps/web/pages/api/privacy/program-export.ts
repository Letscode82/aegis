/**
 * GET /api/privacy/program-export — program-wide privacy defensibility
 * export: the program summary + a deterministic posture score and attention
 * list, as a self-contained JSON report. Gated privacy:dpia:read.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { getCurrentOrganization } from "@aegis/db";
import { getPrivacyProgramSummary, buildPrivacyProgramExport } from "@aegis/privacy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ ok: false, error: "Method not allowed" }); }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  try {
    assertUserCanDo(user, Permission.PrivacyDpiaRead);
    const org = await getCurrentOrganization(req, res);
    const summary = await getPrivacyProgramSummary(user.organizationId);
    const report = buildPrivacyProgramExport(summary, { organization: org?.name || "Organization" });
    return res.status(200).json({ ok: true, report });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
