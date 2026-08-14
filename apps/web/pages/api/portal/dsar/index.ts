/**
 * POST /api/portal/dsar — PUBLIC data-subject intake (no auth). A member of the
 * public files a request; we create a source="portal" DSAR and return a
 * login-less tracking link. Body { requestType, jurisdiction, requesterName,
 * requesterEmail?, description? }. The classifier/handler picks it up like any
 * internal request. Org resolved from the deployment's default context.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getCurrentOrganization } from "@aegis/db";
import { submitPortalRequest } from "@aegis/privacy";

const VALID_TYPES = new Set(["ACCESS", "CORRECTION", "ERASURE", "PORTABILITY", "OBJECT", "RESTRICT_PROCESSING"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ ok: false, error: "Method not allowed" }); }
  try {
    const b = req.body ?? {};
    if (!VALID_TYPES.has(String(b.requestType))) return res.status(400).json({ ok: false, error: "A valid requestType is required" });
    if (!String(b.requesterName || "").trim()) return res.status(400).json({ ok: false, error: "Your name is required" });
    if (!String(b.jurisdiction || "").trim()) return res.status(400).json({ ok: false, error: "A jurisdiction is required" });

    const org = await getCurrentOrganization(req, res);
    const result = await submitPortalRequest(org.id, {
      requestType: b.requestType,
      jurisdiction: String(b.jurisdiction),
      requesterName: String(b.requesterName),
      requesterEmail: b.requesterEmail ?? null,
      description: b.description ?? null,
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
