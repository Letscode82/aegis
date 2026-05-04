/**
 * GET  — list one custodian's data sources (already covered by the
 *        custodians list endpoint that sideloads `dataSources`, but
 *        we expose a focused read for the per-custodian add dialog).
 * POST — add a data source. Body:
 *          { type: DataSourceType, externalIdentifier: string,
 *            displayLabel: string,
 *            preservationAction?: PreservationAction,
 *            retentionPolicyConflict?: boolean,
 *            metadata?: object }
 *
 * Add gated by `matter:legal_hold:issue` (mutates hold roster);
 * read inherits the standard matter-read triple.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { addCustodianDataSource } from "@aegis/matter";
import { prisma } from "@aegis/db";
import {
  requireActor,
  requireActorAny,
} from "../../../../../../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const holdId = req.query.holdId;
  const personId = req.query.personId;
  if (typeof holdId !== "string" || typeof personId !== "string") {
    return res.status(400).json({ error: "Invalid params" });
  }

  if (req.method === "GET") {
    const actor = await requireActorAny(req, res, [
      Permission.MatterReadAll,
      Permission.MatterReadAssigned,
      Permission.MatterLegalHoldCustodianView,
    ]);
    if (!actor) return;
    const lhc = await prisma.legalHoldCustodian.findUnique({
      where: { legalHoldId_personId: { legalHoldId: holdId, personId } },
      include: {
        dataSources: { orderBy: [{ createdAt: "asc" }] },
        legalHold: { select: { organizationId: true } },
      },
    });
    if (!lhc || lhc.legalHold.organizationId !== actor.organizationId) {
      return res.status(404).json({ error: "Not found" });
    }
    return res.status(200).json(
      lhc.dataSources.map((d) => ({
        id: d.id,
        type: d.type,
        externalIdentifier: d.externalIdentifier,
        displayLabel: d.displayLabel,
        preservationAction: d.preservationAction,
        preservationAppliedAt: d.preservationAppliedAt?.toISOString() ?? null,
        preservationConfirmedAt:
          d.preservationConfirmedAt?.toISOString() ?? null,
        retentionPolicyConflict: d.retentionPolicyConflict,
      })),
    );
  }

  if (req.method === "POST") {
    const actor = await requireActor(
      req,
      res,
      Permission.MatterLegalHoldIssue,
    );
    if (!actor) return;
    const body = (req.body ?? {}) as {
      type?: string;
      externalIdentifier?: string;
      displayLabel?: string;
      preservationAction?: string;
      retentionPolicyConflict?: boolean;
      metadata?: Record<string, unknown>;
    };
    if (!body.type || !body.displayLabel) {
      return res
        .status(400)
        .json({ error: "type + displayLabel required" });
    }

    const lhc = await prisma.legalHoldCustodian.findUnique({
      where: { legalHoldId_personId: { legalHoldId: holdId, personId } },
      select: { id: true, legalHold: { select: { organizationId: true } } },
    });
    if (!lhc || lhc.legalHold.organizationId !== actor.organizationId) {
      return res.status(404).json({ error: "Custodian not found" });
    }

    try {
      const created = await addCustodianDataSource(
        {
          legalHoldCustodianId: lhc.id,
          type: body.type as never,
          externalIdentifier: body.externalIdentifier ?? "",
          displayLabel: body.displayLabel,
          preservationAction: body.preservationAction as never,
          retentionPolicyConflict: body.retentionPolicyConflict,
          metadata: body.metadata,
        },
        actor,
      );
      return res.status(201).json({
        id: created.id,
        type: created.type,
        displayLabel: created.displayLabel,
        preservationAction: created.preservationAction,
      });
    } catch (err) {
      console.error("[data-sources POST] failed:", err);
      return res.status(500).json({ error: String(err) });
    }
  }

  res.setHeader("Allow", "GET,POST");
  return res.status(405).json({ error: "Method not allowed" });
}
