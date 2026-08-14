/**
 * /api/privacy/dsar/[id]/review — the AI relevance review queue.
 *   GET  — list review items. privacy:dsar:read.
 *   POST — add collected items (body { items:[{sourceSystem,title,excerpt}] }).
 *          privacy:dsar:fulfill.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { listReviewItems, addReviewItems } from "@aegis/privacy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const id = String(req.query.id || "");
  try {
    if (req.method === "GET") {
      assertUserCanDo(user, Permission.PrivacyDsarRead);
      return res.status(200).json({ ok: true, items: await listReviewItems(user.organizationId, id) });
    }
    if (req.method === "POST") {
      assertUserCanDo(user, Permission.PrivacyDsarFulfill);
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      const created = await addReviewItems(user.organizationId, id, items, { id: user.id, type: "USER" });
      return res.status(200).json({ ok: true, items: created });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
