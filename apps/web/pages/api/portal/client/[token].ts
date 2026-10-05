/**
 * GET /api/portal/client/[token] — PUBLIC client portal (no auth).
 *
 * C-10. The raw token is the gate: it resolves server-side to a scoped,
 * read-only view of the matters the client Person is a party to. Any
 * invalid / revoked / expired token returns 404 (never leaks which). No
 * session, no `requireActor` — same posture as /api/portal/dsar/[token].
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { resolveClientPortalService } from "@aegis/matter";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  try {
    const view = await resolveClientPortalService(String(req.query.token || ""));
    if (!view) return res.status(404).json({ ok: false, error: "This link is invalid or has expired." });
    return res.status(200).json({ ok: true, view });
  } catch {
    return res.status(400).json({ ok: false, error: "Unable to resolve link" });
  }
}
