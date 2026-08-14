/**
 * /api/privacy/dsar/[id]/collect — Microsoft 365 / Purview collection.
 *   GET  — M365 connection status for the collection panel. privacy:dsar:read.
 *   POST — run a content search for the data subject and add hits to the
 *          review queue. Body { sources?, top? }. privacy:dsar:fulfill.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { collectFromM365, previewM365Collection, getDsarM365Status } from "@aegis/privacy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const id = String(req.query.id || "");
  try {
    if (req.method === "GET") {
      assertUserCanDo(user, Permission.PrivacyDsarRead);
      const status = await getDsarM365Status(user.organizationId);
      return res.status(200).json({ ok: true, status });
    }
    if (req.method === "POST") {
      const b = req.body ?? {};
      if (b.preview) {
        assertUserCanDo(user, Permission.PrivacyDsarRead);
        const preview = await previewM365Collection(user.organizationId, id, { sources: b.sources, top: b.top });
        return res.status(200).json({ ok: true, preview });
      }
      assertUserCanDo(user, Permission.PrivacyDsarFulfill);
      const result = await collectFromM365(user.organizationId, id, { sources: b.sources, top: b.top }, { id: user.id, type: "USER" });
      return res.status(200).json({ ok: true, ...result });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
