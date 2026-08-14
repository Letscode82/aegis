/**
 * GET /api/privacy/dsar/directory?q= — live Microsoft 365 / Entra directory
 * user search, so the DSAR create form can pick a real tenant user as the data
 * subject (same Graph lookup the legal-hold custodian picker uses). Routes
 * through @aegis/matter's public surface. privacy:dsar:read.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { searchM365DirectoryUsers } from "@aegis/matter";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  try {
    assertUserCanDo(user, Permission.PrivacyDsarRead);
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const result = await searchM365DirectoryUsers(user.organizationId, { query: q });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
