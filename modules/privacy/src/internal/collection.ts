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
import { searchM365ForDataSubject, searchM365Content, getM365ConnectionStatus, draftCollectionQuery, type DataSubjectSourceType } from "@aegis/matter";
import { persistReviewSet, type ReviewSetSummary } from "@aegis/review";
import type { Actor } from "./requests";

export interface CollectFromM365Input {
  sources?: DataSubjectSourceType[];
  top?: number;
  /** Optional attorney-supplied KQL/KeyQL override — widens beyond the
   *  identity search (the "advanced collection" scope). */
  queryString?: string | null;
}

/**
 * Resolve the search for a request: an attorney KQL override runs a scoped
 * content collection; otherwise the subject's identifiers drive the sweep.
 */
async function runSearch(
  organizationId: string,
  subject: { identifiers: string[]; displayName: string | null },
  input: CollectFromM365Input,
) {
  const qs = (input.queryString || "").trim();
  if (qs) return searchM365Content(organizationId, { queryString: qs, sources: input.sources, top: input.top });
  return searchM365ForDataSubject(organizationId, { identifiers: subject.identifiers, displayName: subject.displayName, sources: input.sources, top: input.top });
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

export const ALL_SOURCE_TYPES: DataSubjectSourceType[] = ["MAILBOX", "ONEDRIVE", "TEAMS", "SHAREPOINT"];

interface HitLike { sourceType: DataSubjectSourceType; sourceSystem: string; title: string; excerpt?: string | null }

export interface SourceBucket {
  sourceType: DataSubjectSourceType;
  total: number;
  fresh: number; // not already in the review queue
  samples: string[];
}

export interface CollectionPreview {
  total: number;
  fresh: number;
  duplicates: number;
  bySource: SourceBucket[];
  simulated: boolean;
  searchedAt: string;
}

/**
 * Pure "Collect & Cull" tally — buckets hits by source and marks how many are
 * new vs. already in the queue, so the reviewer can preview before committing.
 */
export function summarizeHits(hits: HitLike[], existingKeys: Set<string>, simulated: boolean, searchedAt: string): CollectionPreview {
  const buckets = new Map<DataSubjectSourceType, SourceBucket>();
  let fresh = 0;
  const seen = new Set(existingKeys);
  for (const h of hits) {
    let b = buckets.get(h.sourceType);
    if (!b) { b = { sourceType: h.sourceType, total: 0, fresh: 0, samples: [] }; buckets.set(h.sourceType, b); }
    b.total += 1;
    const key = collectionKey(h.sourceSystem, h.title);
    const isNew = !seen.has(key);
    if (isNew) { seen.add(key); b.fresh += 1; fresh += 1; }
    if (b.samples.length < 3) b.samples.push(h.title);
  }
  return {
    total: hits.length,
    fresh,
    duplicates: hits.length - fresh,
    bySource: ALL_SOURCE_TYPES.map((t) => buckets.get(t)).filter((b): b is SourceBucket => !!b),
    simulated,
    searchedAt,
  };
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
  if (identifiers.length === 0 && !displayName && !(input.queryString || "").trim()) throw new Error("The data subject has no email or name to search on.");

  const result = await runSearch(organizationId, { identifiers, displayName }, input);

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

/**
 * Commit the subject's collection into a shared `ReviewSet` (origin DSAR) so it
 * can be worked in the platform's full reviewer — the same engine legal hold
 * uses (multi-dimension AI tags, threading/families, coding, production). This
 * complements the lightweight DSARReviewItem relevance queue; the review set is
 * the "one review engine across the platform" surface for DSAR.
 */
export async function commitDsarReviewSet(organizationId: string, requestId: string, input: CollectFromM365Input, actor: Actor): Promise<ReviewSetSummary> {
  const req = await prisma.dataSubjectRequest.findFirst({
    where: { id: requestId, organizationId },
    include: { requesterPerson: { select: { name: true, email: true } } },
  });
  if (!req) throw new Error("Request not found");

  const identifiers = [req.requesterPerson?.email].filter((s): s is string => !!s);
  const displayName = req.requesterPerson?.name ?? null;
  if (identifiers.length === 0 && !displayName && !(input.queryString || "").trim()) throw new Error("The data subject has no email or name to search on.");

  const result = await runSearch(organizationId, { identifiers, displayName }, input);
  const subjectLabel = displayName ?? identifiers[0] ?? "subject";
  const name = `DSAR — ${subjectLabel} collection`;
  const queryString = (input.queryString || "").trim() || `Data subject: ${subjectLabel}`;

  return persistReviewSet(
    organizationId,
    { origin: "DSAR", name, queryString, sources: (input.sources ?? ALL_SOURCE_TYPES) as string[], dataSubjectRequestId: requestId, custodianCount: 1, simulated: result.simulated },
    result.hits,
    actor,
  );
}

/**
 * Preview a collection without writing — runs the M365 search for the selected
 * sources and returns per-source counts (total + how many are new), so the
 * reviewer can cull before committing to the review queue.
 */
export async function previewM365Collection(organizationId: string, requestId: string, input: CollectFromM365Input): Promise<CollectionPreview> {
  const req = await prisma.dataSubjectRequest.findFirst({
    where: { id: requestId, organizationId },
    include: { requesterPerson: { select: { name: true, email: true } } },
  });
  if (!req) throw new Error("Request not found");
  const identifiers = [req.requesterPerson?.email].filter((s): s is string => !!s);
  const displayName = req.requesterPerson?.name ?? null;
  if (identifiers.length === 0 && !displayName && !(input.queryString || "").trim()) throw new Error("The data subject has no email or name to search on.");

  const result = await runSearch(organizationId, { identifiers, displayName }, input);
  const existing = await prisma.dSARReviewItem.findMany({ where: { requestId }, select: { sourceSystem: true, title: true } });
  const keys = new Set(existing.map((e) => collectionKey(e.sourceSystem, e.title)));
  return summarizeHits(result.hits, keys, result.simulated, result.searchedAt);
}

export interface DraftDsarQueryResult {
  queryString: string;
  rationale: string;
}

/**
 * Draft a KQL/KeyQL collection query for a DSAR from a plain-language ask,
 * seeded with the data subject's email as a participant scope. Deterministic
 * (the matter drafter); the attorney edits before running.
 */
export async function draftDsarCollectionQuery(organizationId: string, requestId: string, naturalLanguage: string): Promise<DraftDsarQueryResult> {
  const req = await prisma.dataSubjectRequest.findFirst({ where: { id: requestId, organizationId }, include: { requesterPerson: { select: { email: true } } } });
  if (!req) throw new Error("Request not found");
  const email = req.requesterPerson?.email ?? null;
  const drafted = draftCollectionQuery({ naturalLanguage, custodianEmails: email ? [email] : [] });
  return { queryString: drafted.queryString, rationale: drafted.rationale };
}

/** M365 connection status for the DSAR collection panel (passthrough). */
export async function getDsarM365Status(organizationId: string) {
  return getM365ConnectionStatus(organizationId);
}
