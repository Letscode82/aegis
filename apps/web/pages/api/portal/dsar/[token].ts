/**
 * GET /api/portal/dsar/[token] — PUBLIC status view for a data-subject's
 * tracking (or delivery) token. The token IS the gate — validity + scope are
 * re-derived from the row every call. Returns the public-safe status, or 404.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { resolveDsarPortal } from "@aegis/privacy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ ok: false, error: "Method not allowed" }); }
  try {
    const view = await resolveDsarPortal(String(req.query.token || ""));
    if (!view) return res.status(404).json({ ok: false, error: "This link is invalid or has expired." });
    return res.status(200).json({ ok: true, view });
  } catch {
    return res.status(400).json({ ok: false, error: "Unable to resolve link" });
  }
}
