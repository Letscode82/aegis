/**
 * GET  /api/privacy/processors — list
 * POST /api/privacy/processors — create/update (upsert; pass id to update)
 * Gated privacy:dpia:read. Chain-sealed.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { listProcessors, upsertProcessor } from "@aegis/privacy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  try {
    assertUserCanDo(user, Permission.PrivacyDpiaRead);
    if (req.method === "GET") return res.status(200).json({ ok: true, items: await listProcessors(user.organizationId) });
    if (req.method === "POST") {
      const b = req.body || {};
      const r = await upsertProcessor(user.organizationId, b.id ? String(b.id) : null, b, user.id);
      return res.status(200).json({ ok: true, ...r });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
