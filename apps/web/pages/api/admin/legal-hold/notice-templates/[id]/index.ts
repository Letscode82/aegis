/**
 * GET /api/admin/legal-hold/notice-templates/[id]
 *     Read one notice template scoped to the actor's org.
 *
 * PUT /api/admin/legal-hold/notice-templates/[id]
 *     Update notice template body.
 *     Body: { bodyMarkdown }
 *
 * Sub-PR 4c.1 — disambiguates from /api/admin/legal-hold/templates
 * (which is for hold scope templates, an unrelated entity).
 *
 * Permission: admin:legal_hold:templates_manage.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  getNoticeTemplateById,
  updateNoticeTemplate,
} from "@aegis/matter";
import { requireActor } from "../../../../../../lib/matter-actor";

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
    const tpl = await getNoticeTemplateById(actor.organizationId, id);
    if (!tpl) return res.status(404).json({ error: "Not found" });
    return res.status(200).json(tpl);
  }

  if (req.method === "PUT") {
    const body = (req.body ?? {}) as { bodyMarkdown?: string };
    if (!body.bodyMarkdown) {
      return res.status(400).json({ error: "bodyMarkdown required" });
    }
    try {
      const updated = await updateNoticeTemplate(
        { templateId: id, bodyMarkdown: body.bodyMarkdown },
        { id: actor.id, organizationId: actor.organizationId },
      );
      return res.status(200).json(updated);
    } catch (err) {
      console.error("[notice-template PUT] failed:", err);
      return res
        .status(500)
        .json({ error: String((err as Error)?.message ?? err) });
    }
  }

  res.setHeader("Allow", "GET,PUT");
  return res.status(405).json({ error: "Method not allowed" });
}
