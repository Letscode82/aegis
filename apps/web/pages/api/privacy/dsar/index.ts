/**
 * /api/privacy/dsar
 *   GET  — list DSARs (?status=&requestType=&mine=1&overdue=1). privacy:dsar:read.
 *   POST — create a DSAR. privacy:dsar:fulfill. Chain-sealed in the service.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { listDsarRequests, createDsarRequest } from "@aegis/privacy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  try {
    if (req.method === "GET") {
      assertUserCanDo(user, Permission.PrivacyDsarRead);
      const q = req.query;
      const requests = await listDsarRequests(user.organizationId, {
        status: typeof q.status === "string" ? (q.status as never) : undefined,
        requestType: typeof q.requestType === "string" ? (q.requestType as never) : undefined,
        assignedToUserId: q.mine === "1" ? user.id : (typeof q.assignedToUserId === "string" ? q.assignedToUserId : undefined),
        overdueOnly: q.overdue === "1",
      });
      return res.status(200).json({ ok: true, requests });
    }
    if (req.method === "POST") {
      assertUserCanDo(user, Permission.PrivacyDsarFulfill);
      const b = req.body ?? {};
      const created = await createDsarRequest(user.organizationId, {
        requestType: b.requestType,
        jurisdiction: String(b.jurisdiction ?? ""),
        requesterPersonId: b.requesterPersonId ?? null,
        requesterName: b.requesterName ?? null,
        requesterEmail: b.requesterEmail ?? null,
        relevanceCriteria: b.relevanceCriteria ?? null,
        subjectSummary: b.subjectSummary ?? null,
        assignedToUserId: b.assignedToUserId ?? null,
        source: "internal",
      }, { id: user.id, type: "USER" });
      return res.status(200).json({ ok: true, request: created });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
