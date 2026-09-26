/**
 * GET /api/one-legal/targets?kind=matter — options for a tool that acts on an
 * existing resource (OL-2). Powers the console's target picker (e.g. choosing
 * which matter a legal hold attaches to). Read-only, permission-gated.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { listMattersByOrganization } from "@aegis/matter";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    const kind = String(req.query.kind || "matter");
    if (kind === "matter") {
      assertUserCanDo(user, Permission.MatterReadAll);
      const page = await listMattersByOrganization(user.organizationId, {});
      const items = (page.rows || []).map((m) => ({ id: m.id, label: `${m.matterNumber ? m.matterNumber + " · " : ""}${m.title}` }));
      return res.status(200).json({ ok: true, items });
    }
    return res.status(400).json({ ok: false, error: `Unknown target kind: ${kind}` });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
