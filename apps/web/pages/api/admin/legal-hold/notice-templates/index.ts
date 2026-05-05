/**
 * GET  /api/admin/legal-hold/notice-templates
 *      List notice templates for the actor's org.
 *
 * POST /api/admin/legal-hold/notice-templates
 *      Create a new template. Body: { name, bodyMarkdown, jurisdictionKey? }
 *
 * Sub-PR 4c.1 — fixes the gap where the NoticeTemplateEditor (4c.5)
 * had no list-page entry point.
 *
 * Permission: admin:legal_hold:templates_manage.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { createNoticeTemplate, listNoticeTemplates } from "@aegis/matter";
import { requireActor } from "../../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const actor = await requireActor(
    req,
    res,
    Permission.AdminLegalHoldTemplatesManage,
  );
  if (!actor) return;

  if (req.method === "GET") {
    const rows = await listNoticeTemplates(actor.organizationId);
    return res.status(200).json(rows);
  }

  if (req.method === "POST") {
    const body = (req.body ?? {}) as {
      name?: string;
      bodyMarkdown?: string;
      jurisdictionKey?: string | null;
    };
    if (!body.name || !body.bodyMarkdown) {
      return res
        .status(400)
        .json({ error: "name + bodyMarkdown required" });
    }
    try {
      const created = await createNoticeTemplate(
        {
          name: body.name,
          bodyMarkdown: body.bodyMarkdown,
          jurisdictionKey: body.jurisdictionKey ?? null,
        },
        { id: actor.id, organizationId: actor.organizationId },
      );
      return res.status(201).json(created);
    } catch (err) {
      console.error("[notice-templates POST] failed:", err);
      return res
        .status(500)
        .json({ error: String((err as Error)?.message ?? err) });
    }
  }

  res.setHeader("Allow", "GET,POST");
  return res.status(405).json({ error: "Method not allowed" });
}
