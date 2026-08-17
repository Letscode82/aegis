/**
 * /api/privacy/dsar/[id]
 *   GET   — request detail. privacy:dsar:read.
 *   PATCH — update handler / relevance criteria / summary. privacy:dsar:fulfill.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { getDsarDetail, updateDsarFields, assignDsar, deleteDsarRequest } from "@aegis/privacy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const id = String(req.query.id || "");
  try {
    if (req.method === "GET") {
      assertUserCanDo(user, Permission.PrivacyDsarRead);
      const request = await getDsarDetail(user.organizationId, id);
      if (!request) return res.status(404).json({ ok: false, error: "Not found" });
      return res.status(200).json({ ok: true, request });
    }
    if (req.method === "PATCH") {
      assertUserCanDo(user, Permission.PrivacyDsarFulfill);
      const b = req.body ?? {};
      const actor = { id: user.id, type: "USER" as const };
      if (b.assignedToUserId !== undefined) {
        await assignDsar(user.organizationId, id, b.assignedToUserId || null, actor);
      }
      const request = await updateDsarFields(user.organizationId, id, {
        relevanceCriteria: b.relevanceCriteria,
        subjectSummary: b.subjectSummary,
      }, actor);
      return res.status(200).json({ ok: true, request });
    }
    if (req.method === "DELETE") {
      assertUserCanDo(user, Permission.PrivacyDsarFulfill);
      await deleteDsarRequest(user.organizationId, id, { id: user.id, type: "USER" });
      return res.status(200).json({ ok: true });
    }
    res.setHeader("Allow", "GET, PATCH, DELETE");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
