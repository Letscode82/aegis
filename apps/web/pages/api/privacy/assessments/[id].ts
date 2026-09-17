/**
 * GET    /api/privacy/assessments/[id] — one assessment (with template)
 * PUT    /api/privacy/assessments/[id] — update answers / mitigations / meta (recomputes risk)
 * DELETE /api/privacy/assessments/[id] — delete (not if APPROVED)
 *
 * Gated privacy:dpia:read (approval is the gate, on /transition). Chain-sealed.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { getAssessment, updateAssessment, deleteAssessment } from "@aegis/privacy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const id = String(req.query.id || "");
  try {
    assertUserCanDo(user, Permission.PrivacyDpiaRead);
    if (req.method === "GET") {
      const a = await getAssessment(user.organizationId, id);
      if (!a) return res.status(404).json({ ok: false, error: "Assessment not found" });
      return res.status(200).json({ ok: true, assessment: a });
    }
    if (req.method === "PUT") {
      const b = req.body || {};
      const updated = await updateAssessment(user.organizationId, id, {
        title: b.title, subject: b.subject, assignedToUserId: b.assignedToUserId,
        processingActivityId: b.processingActivityId,
        answers: Array.isArray(b.answers) ? b.answers : undefined,
        mitigations: Array.isArray(b.mitigations) ? b.mitigations : undefined,
      }, user.id);
      return res.status(200).json({ ok: true, assessment: updated });
    }
    if (req.method === "DELETE") {
      await deleteAssessment(user.organizationId, id, user.id);
      return res.status(200).json({ ok: true });
    }
    res.setHeader("Allow", "GET, PUT, DELETE");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
