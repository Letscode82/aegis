/**
 * GET  /api/admin/legal-hold/notice-templates/[id]/versions
 *      List version history (newest first).
 * POST /api/admin/legal-hold/notice-templates/[id]/versions
 *      Save a new version. Body: { bodyMarkdown, changeLog? }
 *
 * Sub-PR 4c.1 — re-housed from /templates/[id]/versions (which lived
 * alongside scope-template routes) to a dedicated path.
 *
 * Both gated by `admin:legal_hold:templates_manage`.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import {
  listTemplateVersions,
  saveTemplateVersion,
} from "@aegis/matter";
import { requireActor } from "../../../../../../../lib/matter-actor";

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
    try {
      const rows = await listTemplateVersions(id, actor);
      return res.status(200).json(rows);
    } catch (err) {
      return res.status(404).json({ error: String(err) });
    }
  }

  if (req.method === "POST") {
    const body = (req.body ?? {}) as {
      bodyMarkdown?: string;
      changeLog?: string;
    };
    if (!body.bodyMarkdown) {
      return res.status(400).json({ error: "bodyMarkdown required" });
    }
    try {
      const result = await saveTemplateVersion(
        {
          templateId: id,
          bodyMarkdown: body.bodyMarkdown,
          changeLog: body.changeLog,
        },
        actor,
      );
      return res.status(201).json(result);
    } catch (err) {
      console.error("[notice-template-versions POST] failed:", err);
      return res
        .status(500)
        .json({ error: String((err as Error)?.message ?? err) });
    }
  }

  res.setHeader("Allow", "GET,POST");
  return res.status(405).json({ error: "Method not allowed" });
}
