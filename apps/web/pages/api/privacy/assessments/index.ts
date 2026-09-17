/**
 * GET  /api/privacy/assessments[?type=&status=&templates=1] — list (or templates)
 * POST /api/privacy/assessments  { type, title?, subject?, processingActivityId? } — create DRAFT
 *
 * Read gated privacy:dpia:read; create gated privacy:dpia:read (approval is the
 * real gate, on the transition route). Chain-sealed in the service.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { listAssessments, createAssessment, getAssessmentTemplates } from "@aegis/privacy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  try {
    assertUserCanDo(user, Permission.PrivacyDpiaRead);
    if (req.method === "GET") {
      if (req.query.templates) return res.status(200).json({ ok: true, templates: getAssessmentTemplates() });
      const items = await listAssessments(user.organizationId, {
        type: typeof req.query.type === "string" ? req.query.type : undefined,
        status: typeof req.query.status === "string" ? req.query.status : undefined,
      });
      return res.status(200).json({ ok: true, items });
    }
    if (req.method === "POST") {
      const b = req.body || {};
      if (!b.type) return res.status(400).json({ ok: false, error: "type is required" });
      const created = await createAssessment(user.organizationId, {
        type: String(b.type), title: b.title ? String(b.title) : undefined,
        subject: b.subject ? String(b.subject) : undefined,
        processingActivityId: b.processingActivityId ? String(b.processingActivityId) : undefined,
      }, user.id);
      return res.status(200).json({ ok: true, assessment: created });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
