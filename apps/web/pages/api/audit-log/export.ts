import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { exportAuditDefensibilityReport } from "@aegis/db";
import { requireActor } from "../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const actor = await requireActor(req, res, Permission.AuditReadAll);
  if (!actor) return;

  const filter: Parameters<typeof exportAuditDefensibilityReport>[0] = {
    organizationId: actor.organizationId,
  };
  if (typeof req.query.fromDate === "string" && req.query.fromDate) {
    filter.fromDate = new Date(req.query.fromDate);
  }
  if (typeof req.query.toDate === "string" && req.query.toDate) {
    filter.toDate = new Date(req.query.toDate);
  }
  if (typeof req.query.resourceType === "string" && req.query.resourceType) {
    filter.resourceType = req.query.resourceType;
  }
  if (typeof req.query.resourceId === "string" && req.query.resourceId) {
    filter.resourceId = req.query.resourceId;
  }
  if (typeof req.query.actorId === "string" && req.query.actorId) {
    filter.actorId = req.query.actorId;
  }
  if (typeof req.query.action === "string" && req.query.action) {
    filter.action = req.query.action;
  }

  try {
    const { pdfBuffer } = await exportAuditDefensibilityReport(filter);
    const filename = `aegis-audit-defensibility-${actor.organizationId}-${new Date().toISOString().slice(0, 19)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`,
    );
    res.setHeader("Content-Length", pdfBuffer.length.toString());
    res.status(200).send(pdfBuffer);
  } catch (err) {
    console.error("[/api/audit-log/export] failed:", err);
    res.status(500).json({ error: String(err) });
  }
}
