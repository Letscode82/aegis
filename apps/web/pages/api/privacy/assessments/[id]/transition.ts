/**
 * POST /api/privacy/assessments/[id]/transition  { action, note? }
 *   action: submit | approve | reject | reopen
 *
 * submit / reopen gated privacy:dpia:read; approve / reject gated
 * privacy:dpia:approve — the human sign-off gate. Chain-sealed.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { transitionAssessment } from "@aegis/privacy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const id = String(req.query.id || "");
  const action = req.body?.action;
  const note = req.body?.note ? String(req.body.note) : undefined;
  if (!["submit", "approve", "reject", "reopen"].includes(action)) {
    return res.status(400).json({ ok: false, error: "action must be submit | approve | reject | reopen" });
  }
  try {
    // Approving / rejecting is the sign-off gate; drafting transitions need read.
    assertUserCanDo(user, action === "approve" || action === "reject" ? Permission.PrivacyDpiaApprove : Permission.PrivacyDpiaRead);
    const updated = await transitionAssessment(user.organizationId, id, action, user.id, note);
    return res.status(200).json({ ok: true, assessment: updated });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
