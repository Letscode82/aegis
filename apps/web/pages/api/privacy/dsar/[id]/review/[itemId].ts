/**
 * POST /api/privacy/dsar/[id]/review/[itemId] — the human validation gate:
 * confirm or override the AI verdict + set redaction.
 * Body { decision:"CONFIRMED"|"OVERRIDDEN", finalRelevant?, redact?, redactionNote? }.
 * privacy:dsar:fulfill.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { validateReviewItem } from "@aegis/privacy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ ok: false, error: "Method not allowed" }); }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  try {
    assertUserCanDo(user, Permission.PrivacyDsarFulfill);
    const b = req.body ?? {};
    const item = await validateReviewItem(user.organizationId, String(req.query.id || ""), String(req.query.itemId || ""), {
      decision: b.decision, finalRelevant: b.finalRelevant, redact: b.redact, redactionNote: b.redactionNote ?? null,
    }, { id: user.id, type: "USER" });
    return res.status(200).json({ ok: true, item });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
