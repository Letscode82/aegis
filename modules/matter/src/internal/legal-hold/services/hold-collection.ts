/**
 * Hold → eDiscovery collection bridge. Promotes a legal hold's custodians into
 * a scoped Purview content collection: their mailbox identifiers become the
 * `participants:` scope, an attorney's plain-language ask becomes a KeyQL query
 * (deterministic drafter — NL in, KeyQL out, edited before it fires), and the
 * search runs through the same per-org M365 factory the preservation flow uses.
 * Preview-only (counts by source) — no review-set persistence yet; that lands
 * with the eDiscovery review console.
 */
import { prisma } from "@aegis/db";
import { getM365ClientForOrg } from "../../services/m365-factory";
import { draftCollectionQuery } from "../../services/collection-query";
import type { DataSubjectSourceType, DataSubjectHit } from "../../services/m365";

export async function holdCustodianEmails(legalHoldId: string): Promise<string[]> {
  return custodianEmails(legalHoldId);
}

async function custodianEmails(legalHoldId: string): Promise<string[]> {
  const custodians = await prisma.legalHoldCustodian.findMany({ where: { legalHoldId }, select: { personId: true } });
  if (custodians.length === 0) return [];
  const persons = await prisma.person.findMany({
    where: { id: { in: custodians.map((c) => c.personId) }, email: { not: null } },
    select: { email: true },
  });
  return persons.map((p) => p.email).filter((e): e is string => !!e);
}

export interface HoldCollectionSourceBucket {
  sourceType: DataSubjectSourceType;
  total: number;
  samples: string[];
}

const SOURCE_ORDER: DataSubjectSourceType[] = ["MAILBOX", "ONEDRIVE", "TEAMS", "SHAREPOINT"];

/** Pure bucket tally by source (canonical order, up to 3 sample titles). */
export function summarizeCollectionBySource(hits: DataSubjectHit[]): HoldCollectionSourceBucket[] {
  const map = new Map<DataSubjectSourceType, HoldCollectionSourceBucket>();
  for (const h of hits) {
    let b = map.get(h.sourceType);
    if (!b) { b = { sourceType: h.sourceType, total: 0, samples: [] }; map.set(h.sourceType, b); }
    b.total += 1;
    if (b.samples.length < 3) b.samples.push(h.title);
  }
  return SOURCE_ORDER.map((t) => map.get(t)).filter((b): b is HoldCollectionSourceBucket => !!b);
}

export interface DraftHoldCollectionResult {
  queryString: string;
  rationale: string;
  custodianCount: number;
}

export async function draftHoldCollectionQuery(legalHoldId: string, naturalLanguage: string): Promise<DraftHoldCollectionResult> {
  const hold = await prisma.legalHold.findUnique({ where: { id: legalHoldId }, select: { id: true } });
  if (!hold) throw new Error("Hold not found");
  const emails = await custodianEmails(legalHoldId);
  const d = draftCollectionQuery({ naturalLanguage, custodianEmails: emails });
  return { queryString: d.queryString, rationale: d.rationale, custodianCount: emails.length };
}

export interface HoldCollectionPreview {
  queryString: string;
  total: number;
  bySource: HoldCollectionSourceBucket[];
  custodianCount: number;
  simulated: boolean;
  searchedAt: string;
}

export interface PreviewHoldCollectionInput {
  queryString?: string | null;
  naturalLanguage?: string | null;
  sources?: DataSubjectSourceType[];
  top?: number;
}

/** Run (preview) a custodian-scoped collection for a hold. */
export async function previewHoldCollection(legalHoldId: string, input: PreviewHoldCollectionInput): Promise<HoldCollectionPreview> {
  const hold = await prisma.legalHold.findUnique({ where: { id: legalHoldId }, select: { id: true, organizationId: true } });
  if (!hold) throw new Error("Hold not found");
  const emails = await custodianEmails(legalHoldId);

  let queryString = (input.queryString || "").trim();
  if (!queryString) {
    queryString = draftCollectionQuery({ naturalLanguage: input.naturalLanguage || "", custodianEmails: emails }).queryString;
  }

  // Custodian-scoped collection uses the per-user resource endpoints
  // (`/users/{id}/messages`, `/users/{id}/drive/...`) which DO honor
  // application permissions — unlike the unified `/search/query` endpoint,
  // which returns no message/chat hits app-only. Each custodian's own
  // mailbox / OneDrive IS the collection surface for a legal hold, so we
  // enumerate per custodian and let the reviewer console + AI review cull.
  const client = await getM365ClientForOrg(hold.organizationId);
  const res = await client.searchForDataSubject({ identifiers: emails, sources: input.sources, top: input.top ?? 200 });
  return {
    queryString,
    total: res.hits.length,
    bySource: summarizeCollectionBySource(res.hits),
    custodianCount: emails.length,
    simulated: res.simulated,
    searchedAt: res.searchedAt,
  };
}
