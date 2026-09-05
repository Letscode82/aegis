/**
 * GET /api/admin/m365/ediscovery/inspect-export
 *   ?caseId=...[&operationId=...][&which=reports|items][&maxBytes=...]
 *
 * PROC-7b (increment 2b) — download a Purview export package (with the
 * delegated bearer token) and reveal its zip entry layout + CSV load-file
 * schema. Defaults to the small Reports zip. Requires admin:m365:manage.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { inspectExportPackage, probeExportDownload } from "@aegis/matter";
import { requireActorAny } from "../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } });
  }
  const actor = await requireActorAny(req, res, [Permission.AdminM365Manage]);
  if (!actor) return;

  const caseId = typeof req.query.caseId === "string" ? req.query.caseId : "";
  if (!caseId) return res.status(400).json({ ok: false, error: { code: "MISSING_PARAMS", message: "caseId is required" } });
  const operationId = typeof req.query.operationId === "string" ? req.query.operationId : undefined;
  const which = req.query.which === "items" ? "items" : "reports";
  const maxDownloadBytes = typeof req.query.maxBytes === "string" && !Number.isNaN(Number(req.query.maxBytes)) ? Number(req.query.maxBytes) : undefined;

  try {
    if (req.query.probe === "1") {
      const probe = await probeExportDownload(actor.organizationId, caseId, { operationId, which });
      return res.status(200).json({ ok: true, probe });
    }
    const result = await inspectExportPackage(actor.organizationId, caseId, { operationId, which, maxDownloadBytes });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    return res.status(502).json({ ok: false, error: { code: "EXPORT_INSPECT_FAILED", message: String((err as Error)?.message ?? err) } });
  }
}
