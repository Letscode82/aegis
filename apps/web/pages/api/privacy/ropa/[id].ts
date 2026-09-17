/**
 * GET / PUT / DELETE /api/privacy/ropa/[id] — one processing activity.
 * Gated privacy:dpia:read. Chain-sealed.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { getRopa, updateRopa, deleteRopa } from "@aegis/privacy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const id = String(req.query.id || "");
  try {
    assertUserCanDo(user, Permission.PrivacyDpiaRead);
    if (req.method === "GET") {
      const a = await getRopa(user.organizationId, id);
      if (!a) return res.status(404).json({ ok: false, error: "Not found" });
      return res.status(200).json({ ok: true, activity: a });
    }
    if (req.method === "PUT") {
      const updated = await updateRopa(user.organizationId, id, req.body || {}, user.id);
      return res.status(200).json({ ok: true, activity: updated });
    }
    if (req.method === "DELETE") {
      await deleteRopa(user.organizationId, id, user.id);
      return res.status(200).json({ ok: true });
    }
    res.setHeader("Allow", "GET, PUT, DELETE");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
