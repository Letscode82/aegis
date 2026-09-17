/**
 * GET  /api/privacy/incidents — list (with 72-hr clock)
 * POST /api/privacy/incidents — report an incident
 * Gated privacy:incident:respond. Chain-sealed.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { listIncidents, createIncident } from "@aegis/privacy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  try {
    assertUserCanDo(user, Permission.PrivacyIncidentRespond);
    if (req.method === "GET") return res.status(200).json({ ok: true, items: await listIncidents(user.organizationId) });
    if (req.method === "POST") {
      const b = req.body || {};
      const created = await createIncident(user.organizationId, { severity: String(b.severity || ""), discoveredAt: b.discoveredAt, description: b.description, affectedRecordsCount: b.affectedRecordsCount }, user.id);
      return res.status(200).json({ ok: true, incident: created });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
