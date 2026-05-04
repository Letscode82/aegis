/**
 * GET — discover candidate data sources for the given custodian via
 *       the M365 client (real Graph when creds resolve, mock
 *       fallback otherwise). Used by the DataSourceAddDialog's
 *       "auto-discover" mode.
 *
 * Read-only; no audit row is written until the user actually adds
 * one of the discovered sources via POST /data-sources.
 *
 * Gated by `matter:legal_hold:issue` since discovery results inform
 * a mutation about to happen.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getM365ClientForOrg } from "@aegis/matter";
import { prisma } from "@aegis/db";
import { requireActor } from "../../../../../../../../lib/matter-actor";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const holdId = req.query.holdId;
  const personId = req.query.personId;
  if (typeof holdId !== "string" || typeof personId !== "string") {
    return res.status(400).json({ error: "Invalid params" });
  }

  const actor = await requireActor(req, res, Permission.MatterLegalHoldIssue);
  if (!actor) return;

  const lhc = await prisma.legalHoldCustodian.findUnique({
    where: { legalHoldId_personId: { legalHoldId: holdId, personId } },
    include: {
      person: { select: { externalRef: true, email: true, name: true } },
      legalHold: { select: { organizationId: true } },
    },
  });
  if (!lhc || lhc.legalHold.organizationId !== actor.organizationId) {
    return res.status(404).json({ error: "Custodian not found" });
  }

  const externalRef = lhc.person.externalRef ?? lhc.person.email ?? "";
  if (!externalRef) {
    return res.status(200).json([]);
  }

  try {
    const client = await getM365ClientForOrg(actor.organizationId);
    const sources = await client.enumerateDataSourcesForUser(externalRef);
    return res.status(200).json(
      sources.map((s) => ({
        type: s.type,
        externalIdentifier: s.externalIdentifier,
        displayLabel: s.displayLabel,
        retentionPolicy: s.retentionPolicy ?? null,
        retentionPolicyConflict: s.retentionPolicyConflict,
      })),
    );
  } catch (err) {
    console.error("[discover] failed:", err);
    return res.status(500).json({ error: String(err) });
  }
}
