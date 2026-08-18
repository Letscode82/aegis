/**
 * /api/privacy/dsar/[id]/review-set — the DSAR's shared review sets.
 *   GET  — list review sets committed for this DSAR. privacy:dsar:read.
 *   POST — collect the subject's data into a new shared ReviewSet (the full
 *          reviewer: AI tags, threading/families, coding, production).
 *          Body { sources?, top?, queryString? }. privacy:dsar:fulfill.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { commitDsarReviewSet } from "@aegis/privacy";
import { listReviewSets } from "@aegis/review";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const id = String(req.query.id || "");
  try {
    if (req.method === "GET") {
      assertUserCanDo(user, Permission.PrivacyDsarRead);
      const reviewSets = await listReviewSets(user.organizationId, { dataSubjectRequestId: id });
      return res.status(200).json({ ok: true, reviewSets });
    }
    if (req.method === "POST") {
      assertUserCanDo(user, Permission.PrivacyDsarFulfill);
      const b = req.body ?? {};
      const reviewSet = await commitDsarReviewSet(user.organizationId, id, { sources: b.sources, top: b.top, queryString: b.queryString }, { id: user.id, type: "USER" });
      return res.status(200).json({ ok: true, reviewSet });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
