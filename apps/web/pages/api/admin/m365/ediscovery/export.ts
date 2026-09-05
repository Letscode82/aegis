/**
 * Purview review-set export (PROC-7b increment 2a).
 *
 *   POST /api/admin/m365/ediscovery/export
 *     body: { caseId, reviewSetId, exportOptions?, exportStructure?, outputName? }
 *     → triggers an export job, returns the newest export operation.
 *
 *   GET  /api/admin/m365/ediscovery/export?caseId=...[&operationId=...]
 *     → polls the export operation (by id, or the newest for the case):
 *       status / percentProgress / files[] (fileName + downloadUrl + size).
 *
 * Requires admin:m365:manage. The POST is a genuine mutation (creates an
 * export job in Purview); the GET is read-only.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { startReviewSetExport, getReviewSetExportStatus, listCaseOperations } from "@aegis/matter";
import { requireActorAny } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const actor = await requireActorAny(req, res, [Permission.AdminM365Manage]);
  if (!actor) return;

  try {
    if (req.method === "POST") {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const caseId = typeof body.caseId === "string" ? body.caseId : "";
      const reviewSetId = typeof body.reviewSetId === "string" ? body.reviewSetId : "";
      if (!caseId || !reviewSetId) {
        return res.status(400).json({ ok: false, error: { code: "MISSING_PARAMS", message: "caseId and reviewSetId are required" } });
      }
      const result = await startReviewSetExport(actor.organizationId, caseId, reviewSetId, {
        outputName: typeof body.outputName === "string" ? body.outputName : undefined,
        description: typeof body.description === "string" ? body.description : undefined,
        exportOptions: typeof body.exportOptions === "string" ? body.exportOptions : undefined,
        exportStructure: typeof body.exportStructure === "string" ? body.exportStructure : undefined,
      });
      return res.status(200).json({ ok: true, ...result });
    }

    if (req.method === "GET") {
      const caseId = typeof req.query.caseId === "string" ? req.query.caseId : "";
      const operationId = typeof req.query.operationId === "string" ? req.query.operationId : undefined;
      if (!caseId) {
        return res.status(400).json({ ok: false, error: { code: "MISSING_PARAMS", message: "caseId is required" } });
      }
      const operation = await getReviewSetExportStatus(actor.organizationId, caseId, operationId);
      // Also dump all case operations (unfiltered) so we can see the real
      // export operation shape when `operation` comes back null.
      const operations = await listCaseOperations(actor.organizationId, caseId).catch(() => []);
      return res.status(200).json({ ok: true, operation, operations });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } });
  } catch (err) {
    return res.status(502).json({ ok: false, error: { code: "EDISCOVERY_EXPORT_FAILED", message: String((err as Error)?.message ?? err) } });
  }
}
