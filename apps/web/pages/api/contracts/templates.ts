/**
 * Template store admin (Templates DB).
 *   GET    — list templates (active; ?all=1 includes inactive; ?kind=NDA). contracts:read_all.
 *   POST   — upsert a template (on org+key). contracts:approve.
 *   DELETE — remove a template. body { id }. contracts:approve.
 * Mutations chain-sealed inside the service.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission, assertUserCanDo, AccessDeniedError } from "@aegis/auth";
import { getResolvedUser } from "@aegis/auth/server";
import { listTemplates, upsertTemplate, deleteTemplate } from "@aegis/contracts";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getResolvedUser(req, res);
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated" });

  try {
    if (req.method === "GET") {
      assertUserCanDo(user, Permission.ContractsReadAll);
      const kind = typeof req.query.kind === "string" ? (req.query.kind as never) : undefined;
      const templates = await listTemplates(user.organizationId, { kind, includeInactive: req.query.all === "1" });
      return res.status(200).json({ ok: true, templates });
    }
    if (req.method === "POST") {
      assertUserCanDo(user, Permission.ContractsApprove);
      const t = await upsertTemplate(user.organizationId, req.body || {}, { id: user.id, type: "USER" });
      return res.status(200).json({ ok: true, template: t });
    }
    if (req.method === "DELETE") {
      assertUserCanDo(user, Permission.ContractsApprove);
      const id = String(req.body?.id || "");
      if (!id) return res.status(400).json({ ok: false, error: "id is required" });
      await deleteTemplate(user.organizationId, id, { id: user.id, type: "USER" });
      return res.status(200).json({ ok: true });
    }
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    if (err instanceof AccessDeniedError) return res.status(403).json({ ok: false, error: err.decision.message });
    return res.status(400).json({ ok: false, error: String((err as Error).message || err) });
  }
}
