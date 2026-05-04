/**
 * GET    /api/admin/legal-hold/templates/[id] — read one template.
 * PUT    /api/admin/legal-hold/templates/[id] — update.
 * DELETE /api/admin/legal-hold/templates/[id] — delete.
 *
 * All gated by `admin:legal_hold:templates_manage`.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  deleteHoldScopeTemplate,
  getHoldScopeTemplate,
  updateHoldScopeTemplate,
} from "@aegis/matter";
import { requireActor } from "../../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const id = req.query.id;
  if (typeof id !== "string") {
    return res.status(400).json({ error: "Invalid id" });
  }
  const actor = await requireActor(
    req,
    res,
    Permission.AdminLegalHoldTemplatesManage,
  );
  if (!actor) return;

  if (req.method === "GET") {
    const t = await getHoldScopeTemplate(actor.organizationId, id);
    if (!t) return res.status(404).json({ error: "Not found" });
    return res.status(200).json(t);
  }

  if (req.method === "PUT") {
    const body = (req.body ?? {}) as {
      name?: string;
      description?: string | null;
      scopeMarkdown?: string;
      defaultJurisdictions?: string[];
    };
    try {
      const updated = await updateHoldScopeTemplate(
        {
          templateId: id,
          name: body.name,
          description: body.description,
          scopeMarkdown: body.scopeMarkdown,
          defaultJurisdictions: body.defaultJurisdictions,
        },
        actor,
      );
      return res.status(200).json(updated);
    } catch (err) {
      console.error("[scope-template PUT] failed:", err);
      return res.status(500).json({ error: String(err) });
    }
  }

  if (req.method === "DELETE") {
    try {
      await deleteHoldScopeTemplate(actor.organizationId, id, actor);
      return res.status(204).end();
    } catch (err) {
      console.error("[scope-template DELETE] failed:", err);
      return res.status(500).json({ error: String(err) });
    }
  }

  res.setHeader("Allow", "GET,PUT,DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
