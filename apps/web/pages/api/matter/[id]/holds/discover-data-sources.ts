/**
 * POST /api/matter/[id]/holds/discover-data-sources
 *
 * Hold-Wizard Step 3 helper. Given a list of custodian Person IDs,
 * runs `enumerateDataSourcesForUser` + `enumerateSharePointSitesForUser`
 * for each in parallel and returns a per-custodian shape the wizard
 * can render directly.
 *
 * Discovery is best-effort per custodian — one custodian's failure
 * (license gap, GUID resolution miss, M365 not connected) does NOT
 * abort the others; the wizard renders a "couldn't auto-discover"
 * card for that custodian and offers manual entry.
 *
 * Permission: matter:legal_hold:issue (the same gate as the
 * downstream issue-hold flow this discovery feeds).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Permission } from "@aegis/auth";
import { getM365ClientForOrg } from "@aegis/matter";
import { prisma } from "@aegis/db";
import { requireActor } from "../../../../../lib/matter-actor";

interface DiscoveryEntry {
  personId: string;
  status: "succeeded" | "failed";
  errorMessage?: string;
  externalRef: string | null;
  sources: unknown[];
  sharePointSites: unknown[];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      ok: false,
      error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" },
    });
  }
  const matterId = req.query.id;
  if (typeof matterId !== "string") {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_MATTER_ID", message: "Invalid matter id" },
    });
  }
  const actor = await requireActor(req, res, Permission.MatterLegalHoldIssue);
  if (!actor) return;
  const body = (req.body ?? {}) as {
    personIds?: string[];
    /** Free-form keywords for the SharePoint recommendation engine.
     *  Typically [matterTitle, opposingPartyName, ...scopeWords]. */
    sharePointKeywords?: string[];
  };
  if (!Array.isArray(body.personIds) || body.personIds.length === 0) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_BODY", message: "personIds required" },
    });
  }

  const persons = await prisma.person.findMany({
    where: {
      id: { in: body.personIds },
      organizationId: actor.organizationId,
    },
    select: { id: true, externalRef: true, email: true, name: true },
  });

  const m365 = await getM365ClientForOrg(actor.organizationId);
  const keywords = (body.sharePointKeywords ?? []).filter(
    (k): k is string => typeof k === "string" && k.length >= 2,
  );

  const entries = await Promise.all(
    persons.map(async (person): Promise<DiscoveryEntry> => {
      const ref = person.externalRef ?? person.email;
      if (!ref) {
        return {
          personId: person.id,
          status: "failed",
          errorMessage:
            "No M365 identity (externalRef / email) recorded for this person",
          externalRef: null,
          sources: [],
          sharePointSites: [],
        };
      }
      try {
        const [sources, sites] = await Promise.all([
          m365.enumerateDataSourcesForUser(ref),
          m365.enumerateSharePointSitesForUser({
            externalIdentifier: ref,
            recommendKeywords: keywords,
          }),
        ]);
        return {
          personId: person.id,
          status: "succeeded",
          externalRef: ref,
          sources,
          sharePointSites: sites,
        };
      } catch (err) {
        const e = err as { name?: string; message?: string };
        return {
          personId: person.id,
          status: "failed",
          errorMessage: e.message ?? String(err),
          externalRef: ref,
          sources: [],
          sharePointSites: [],
        };
      }
    }),
  );

  return res.status(200).json({ ok: true, entries });
}
