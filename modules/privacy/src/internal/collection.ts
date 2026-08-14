/**
 * DSAR collection from Microsoft 365 / Purview — the "connect to your E5
 * tenant and search the data subject" step (the eDiscovery search phase,
 * scoped to one person). Reuses the Matter module's per-org M365 factory via
 * its public surface (`searchM365ForDataSubject`, `getM365ConnectionStatus`) —
 * never Matter internals. Each hit is added to the DSAR review queue
 * (DSARReviewItem), deduplicated against what's already there, so the existing
 * AI relevance review + human validation gate then takes over. Chain-sealed.
 *
 * Degrade-safe: with no tenant connected the factory returns the mock client,
 * so the demo collects representative records; when E5 credentials resolve the
 * real Microsoft Search runs. `simulated` tells the UI which happened.
 */
import { prisma, logAudit } from "@aegis/db";
import { searchM365ForDataSubject, getM365ConnectionStatus, type DataSubjectSourceType } from "@aegis/matter";
import type { Actor } from "./requests";

export interface CollectFromM365Input {
  sources?: DataSubjectSourceType[];
  top?: number;
}

export interface CollectFromM365Result {
  searched: number;
  added: number;
  duplicates: number;
  simulated: boolean;
}

/** Dedupe key for a collected record within one request (whitespace-collapsed). */
export function collectionKey(sourceSystem: string, title: string): string {
  return `${sourceSystem} ${title}`.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Run an M365 content search for the request's data subject and add the hits
 * to the review queue. Identifiers come from the requester Person (email +
 * name). Idempotent by (sourceSystem, title) so re-running doesn't duplicate.
 */
export async function collectFromM365(organizationId: string, requestId: string, input: CollectFromM365Input, actor: Actor): Promise<CollectFromM365Result> {
  const req = await prisma.dataSubjectRequest.findFirst({
    where: { id: requestId, organizationId },
    include: { requesterPerson: { select: { name: true, email: true } } },
  });
  if (!req) throw new Error("Request not found");

  const identifiers = [req.requesterPerson?.email].filter((s): s is string => !!s);
  const displayName = req.requesterPerson?.name ?? null;
  if (identifiers.length === 0 && !displayName) throw new Error("The data subject has no email or name to search on.");

  const result = await searchM365ForDataSubject(organizationId, {
    identifiers,
    displayName,
    sources: input.sources,
    top: input.top,
  });

  // Dedupe against existing review items for this request.
  const existing = await prisma.dSARReviewItem.findMany({ where: { requestId }, select: { sourceSystem: true, title: true } });
  const seen = new Set(existing.map((e) => collectionKey(e.sourceSystem, e.title)));

  let added = 0, duplicates = 0;
  const toCreate: { organizationId: string; requestId: string; sourceSystem: string; title: string; excerpt: string | null }[] = [];
  for (const h of result.hits) {
    const key = collectionKey(h.sourceSystem, h.title);
    if (seen.has(key)) { duplicates += 1; continue; }
    seen.add(key);
    toCreate.push({ organizationId, requestId, sourceSystem: h.sourceSystem, title: h.title, excerpt: h.excerpt ?? null });
    added += 1;
  }
  if (toCreate.length > 0) {
    await prisma.$transaction(toCreate.map((data) => prisma.dSARReviewItem.create({ data })));
  }

  await logAudit({
    organizationId,
    actorId: actor.id,
    actorType: actor.type ?? "USER",
    action: "privacy.dsar.m365_collected",
    resourceType: "DataSubjectRequest",
    resourceId: requestId,
    afterJson: { searched: result.hits.length, added, duplicates, simulated: result.simulated } as never,
    metadata: { source: "privacy", channel: "m365", simulated: result.simulated } as never,
  });

  return { searched: result.hits.length, added, duplicates, simulated: result.simulated };
}

/** M365 connection status for the DSAR collection panel (passthrough). */
export async function getDsarM365Status(organizationId: string) {
  return getM365ConnectionStatus(organizationId);
}
