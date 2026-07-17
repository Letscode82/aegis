/**
 * GET /api/intake/template?kind=NDA  (or ?key=mnda-v4.2) — the org's
 * template body for the intake agents to draft from. Any authenticated
 * user (the NDA/contract agent runs in the requester's browser); org-
 * scoped. Returns { template } or { template: null } so the agent falls
 * back to its built-in default.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getResolvedUser } from "@aegis/auth/server";
import { getTemplateByKey, getDefaultTemplateForKind } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  const key = typeof req.query.key === "string" ? req.query.key : null;
  const kind = typeof req.query.kind === "string" ? req.query.kind : null;
  const template = key
    ? await getTemplateByKey(user.organizationId, key)
    : kind
      ? await getDefaultTemplateForKind(user.organizationId, kind as never)
      : null;
  return res.status(200).json({ ok: true, template });
}
