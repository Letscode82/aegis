/**
 * GET  /api/matter/[id]/artifacts — list AI-generated drafts saved to the
 *      matter (Document rows, ownerType=MATTER). Gated matter:read_all.
 * POST /api/matter/[id]/artifacts — save an artifact { name, content,
 *      sourcePrompt? }. Gated matter:update. Chain-sealed.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { listMatterArtifacts, createMatterArtifact } from "@aegis/matter";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const matterId = String(req.query.id || "");
  try {
    if (req.method === "GET") {
      assertUserCanDo(user, Permission.MatterReadAll);
      return res.status(200).json({ ok: true, items: await listMatterArtifacts(user.organizationId, matterId) });
    }
    if (req.method === "POST") {
      assertUserCanDo(user, Permission.MatterUpdate);
      const b = req.body || {};
      const r = await createMatterArtifact(user.organizationId, matterId, { name: b.name, content: b.content, sourcePrompt: b.sourcePrompt }, user.id);
      return res.status(200).json({ ok: true, ...r });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
