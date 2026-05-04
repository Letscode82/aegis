/**
 * GET  /api/matter/[id]/holds/[holdId]/notices  — issuance log
 * POST /api/matter/[id]/holds/[holdId]/notices  — issue notice
 *
 * The POST body accepts both shapes:
 *   - 4b legacy: `{ templateId }` — issues against every custodian
 *     using the template's own body. Kept for backwards-compat.
 *   - 4c.3 composer: `{ templateId, editedBody?,
 *     recipientCustodianPersonIds? }` — runs through the composer
 *     service so the issuance hash reflects what was actually sent
 *     and one timeline event per recipient is recorded.
 *
 * The wizard's preview is fetched via the sibling /preview route.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { composeAndSendNotice, issueNotice } from "@aegis/matter";
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
    const body = (req.body ?? {}) as {
      templateId?: string;
      editedBody?: string;
      recipientCustodianPersonIds?: string[];
    };
    if (!body.templateId) {
      return res.status(400).json({ error: "templateId required" });
    }
    try {
      // Composer path: any non-templateId field present routes
      // through the new send service so per-recipient events are
      // recorded and the edited body's hash is honoured.
      if (body.editedBody !== undefined || body.recipientCustodianPersonIds) {
        const result = await composeAndSendNotice(
          {
            holdId,
            templateId: body.templateId,
            editedBody: body.editedBody,
            recipientCustodianPersonIds: body.recipientCustodianPersonIds,
          },
          actor,
        );
        return res.status(201).json({
          id: result.issuance.id,
          bodyHashAtIssuance: result.issuance.bodyHashAtIssuance,
          recipientCount: result.recipientCount,
          issuedAt: result.issuance.issuedAt.toISOString(),
          deliveryStubbed: result.deliveryStubbed,
        });
      }
      // Legacy 4b path — kept for backwards-compat with the simple
      // re-issue button. No per-recipient events.
      const issuance = await issueNotice(
        { holdId, templateId: body.templateId },
        actor,
      );
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
