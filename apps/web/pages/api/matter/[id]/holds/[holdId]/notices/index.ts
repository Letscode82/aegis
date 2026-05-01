/**
 * GET  /api/matter/[id]/holds/[holdId]/notices  — issuance log
 * POST /api/matter/[id]/holds/[holdId]/notices  — re-issue notice
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { issueNotice } from "@aegis/matter";
import { prisma } from "@aegis/db";
import { requireActor, requireActorAny } from "../../../../../../../lib/matter-actor";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const holdId = req.query.holdId;
  if (typeof holdId !== "string") return res.status(400).json({ error: "Invalid holdId" });

  if (req.method === "GET") {
    const actor = await requireActorAny(req, res, [
      Permission.MatterReadAll,
      Permission.MatterReadAssigned,
      Permission.MatterLegalHoldCustodianView,
    ]);
    if (!actor) return;
    const rows = await prisma.holdNoticeIssuance.findMany({
      where: {
        legalHoldId: holdId,
        legalHold: { organizationId: actor.organizationId },
      },
      include: { template: { select: { name: true } } },
      orderBy: [{ issuedAt: "desc" }],
    });
    return res.status(200).json(
      rows.map((r) => ({
        id: r.id,
        templateId: r.templateId,
        templateName: r.template.name,
        templateVersion: r.templateVersion,
        bodyHashAtIssuance: r.bodyHashAtIssuance,
        recipientCount: r.recipientCount,
        issuedAt: r.issuedAt.toISOString(),
      })),
    );
  }

  if (req.method === "POST") {
    const actor = await requireActor(req, res, Permission.MatterLegalHoldIssue);
    if (!actor) return;
    const body = (req.body ?? {}) as { templateId?: string };
    if (!body.templateId) return res.status(400).json({ error: "templateId required" });
    try {
      const issuance = await issueNotice({ holdId, templateId: body.templateId }, actor);
      return res.status(201).json({
        id: issuance.id,
        bodyHashAtIssuance: issuance.bodyHashAtIssuance,
        recipientCount: issuance.recipientCount,
        issuedAt: issuance.issuedAt.toISOString(),
      });
    } catch (err) {
      console.error("[notices POST] failed:", err);
      return res.status(500).json({ error: String(err) });
    }
  }

  res.setHeader("Allow", "GET,POST");
  return res.status(405).json({ error: "Method not allowed" });
}
