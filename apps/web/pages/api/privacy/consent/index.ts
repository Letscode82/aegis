/**
 * GET  /api/privacy/consent — list consents + summary
 * POST /api/privacy/consent — record consent { name, email?, purpose, mechanism }
 * Gated privacy:dpia:read. Chain-sealed.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { listConsents, recordConsent } from "@aegis/privacy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  try {
    assertUserCanDo(user, Permission.PrivacyDpiaRead);
    if (req.method === "GET") return res.status(200).json({ ok: true, ...(await listConsents(user.organizationId)) });
    if (req.method === "POST") {
      const b = req.body || {};
      const created = await recordConsent(user.organizationId, { name: String(b.name || ""), email: b.email, purpose: String(b.purpose || ""), mechanism: String(b.mechanism || "EXPLICIT") }, user.id);
      return res.status(200).json({ ok: true, consent: created });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
