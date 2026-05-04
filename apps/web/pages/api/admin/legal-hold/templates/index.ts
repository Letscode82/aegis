/**
 * GET  /api/admin/legal-hold/templates  — list scope templates.
 * POST /api/admin/legal-hold/templates  — create.
 *
 * Body for POST:
 *   { name, scopeMarkdown, description?, defaultJurisdictions? }
 *
 * Gated by `admin:legal_hold:templates_manage` (sub-PR 4c.4).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  createHoldScopeTemplate,
  listHoldScopeTemplates,
} from "@aegis/matter";
import { requireActor } from "../../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") {
    const actor = await requireActor(
      req,
      res,
      Permission.AdminLegalHoldTemplatesManage,
    );
    if (!actor) return;
    const rows = await listHoldScopeTemplates(actor.organizationId);
    return res.status(200).json(rows);
  }

  if (req.method === "POST") {
    const actor = await requireActor(
      req,
      res,
      Permission.AdminLegalHoldTemplatesManage,
    );
    if (!actor) return;
    const body = (req.body ?? {}) as {
      name?: string;
      scopeMarkdown?: string;
      description?: string;
      defaultJurisdictions?: string[];
    };
    if (!body.name || !body.scopeMarkdown) {
      return res
        .status(400)
        .json({ error: "name + scopeMarkdown required" });
    }
    try {
      const created = await createHoldScopeTemplate(
        {
          name: body.name,
          scopeMarkdown: body.scopeMarkdown,
          description: body.description,
          defaultJurisdictions: body.defaultJurisdictions ?? [],
        },
        actor,
      );
      return res.status(201).json(created);
    } catch (err) {
      console.error("[scope-templates POST] failed:", err);
      return res.status(500).json({ error: String(err) });
    }
  }

  res.setHeader("Allow", "GET,POST");
  return res.status(405).json({ error: "Method not allowed" });
}
