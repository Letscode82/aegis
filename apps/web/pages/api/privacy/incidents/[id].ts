/**
 * GET / PUT /api/privacy/incidents/[id]. Gated privacy:incident:respond.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { getIncident, updateIncident } from "@aegis/privacy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const id = String(req.query.id || "");
  try {
    assertUserCanDo(user, Permission.PrivacyIncidentRespond);
    if (req.method === "GET") {
      const i = await getIncident(user.organizationId, id);
      if (!i) return res.status(404).json({ ok: false, error: "Not found" });
      return res.status(200).json({ ok: true, incident: i });
    }
    if (req.method === "PUT") {
      const updated = await updateIncident(user.organizationId, id, req.body || {}, user.id);
      return res.status(200).json({ ok: true, incident: updated });
    }
    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
