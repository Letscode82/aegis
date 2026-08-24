/**
 * Hold-scoped collection → review set. The collection step is matter-specific
 * (it knows the hold's custodians + the M365 client); it maps the M365 result
 * onto the shared `@aegis/review` persistence seam. Everything after collection
 * — coding, AI review, production — lives in `@aegis/review`.
 */
import { prisma } from "@aegis/db";
import { persistReviewSet, type Actor, type ReviewSetSummary } from "@aegis/review";
import { getM365ClientForOrg } from "./m365-factory";
import { draftCollectionQuery } from "./collection-query";
import { holdCustodianEmails } from "../legal-hold/services/hold-collection";
import type { DataSubjectSourceType } from "./m365";

/**
 * Optional post-collection filters. Applied to the returned hits BEFORE
 * persistence (works identically against the mock and real Graph, no per-
 * endpoint query syntax). Date bounds are inclusive `YYYY-MM-DD`; keywords are
 * an OR-match across title / excerpt / attachment text + name.
 */
export interface CollectionFilters {
  startDate?: string | null;
  endDate?: string | null;
  keywords?: string[];
}

interface FilterableHit {
  sentAt?: string | null;
  title?: string;
  excerpt?: string | null;
  attachments?: Array<{ text?: string | null; name?: string }>;
}

/**
 * Pure hit filter. Date bounds apply only to hits that carry a `sentAt` — an
 * undated hit (a OneDrive file, a Teams message with no timestamp) is never
 * dropped on a date criterion it doesn't have, so a date window can't silently
 * discard evidence it can't date. Keyword match is case-insensitive OR.
 */
export function filterHits<T extends FilterableHit>(hits: T[], filters?: CollectionFilters): T[] {
  if (!filters) return hits;
  const start = filters.startDate ? Date.parse(`${filters.startDate}T00:00:00.000Z`) : NaN;
  const end = filters.endDate ? Date.parse(`${filters.endDate}T23:59:59.999Z`) : NaN;
  const hasStart = !Number.isNaN(start);
  const hasEnd = !Number.isNaN(end);
  const keywords = (filters.keywords ?? [])
    .map((k) => (k || "").trim().toLowerCase())
    .filter(Boolean);

  return hits.filter((h) => {
    if (hasStart || hasEnd) {
      const ts = h.sentAt ? Date.parse(h.sentAt) : NaN;
      if (!Number.isNaN(ts)) {
        if (hasStart && ts < start) return false;
        if (hasEnd && ts > end) return false;
      }
    }
    if (keywords.length > 0) {
      const hay = [
        h.title ?? "",
        h.excerpt ?? "",
        ...(h.attachments ?? []).flatMap((a) => [a.text ?? "", a.name ?? ""]),
      ]
        .join("  ")
        .toLowerCase();
      if (!keywords.some((k) => hay.includes(k))) return false;
    }
    return true;
  });
}

/** Human-readable provenance suffix for the queryString, or "" if no filters. */
export function describeFilters(filters?: CollectionFilters): string {
  if (!filters) return "";
  const parts: string[] = [];
  if (filters.startDate) parts.push(`from ${filters.startDate}`);
  if (filters.endDate) parts.push(`to ${filters.endDate}`);
  const kws = (filters.keywords ?? []).map((k) => (k || "").trim()).filter(Boolean);
  if (kws.length > 0) parts.push(`keywords: ${kws.join(", ")}`);
  return parts.length > 0 ? ` · filters: ${parts.join(" · ")}` : "";
}

export interface CommitHoldCollectionInput {
  name?: string;
  queryString?: string | null;
  naturalLanguage?: string | null;
  sources?: DataSubjectSourceType[];
  top?: number;
  filters?: CollectionFilters;
}

/** Run a hold's custodian-scoped collection and persist it as a ReviewSet. */
export async function commitHoldCollection(legalHoldId: string, input: CommitHoldCollectionInput, actor: Actor): Promise<ReviewSetSummary> {
  const hold = await prisma.legalHold.findUnique({ where: { id: legalHoldId }, select: { id: true, organizationId: true, matterId: true, title: true, holdNumber: true } });
  if (!hold) throw new Error("Hold not found");
  const emails = await holdCustodianEmails(legalHoldId);

  let queryString = (input.queryString || "").trim();
  if (!queryString) queryString = draftCollectionQuery({ naturalLanguage: input.naturalLanguage || "", custodianEmails: emails }).queryString;

  // Per-custodian enumeration (per-user endpoints honor app-only permissions;
  // the unified /search/query does not return mail/chat app-only). Mirrors
  // previewHoldCollection so commit persists exactly what preview showed.
  const client = await getM365ClientForOrg(hold.organizationId);
  const res = await client.searchForDataSubject({ identifiers: emails, sources: input.sources, top: input.top ?? 200 });
  const hits = filterHits(res.hits, input.filters);
  const name = (input.name || "").trim() || `${hold.holdNumber || hold.title} — collection`;

  return persistReviewSet(
    hold.organizationId,
    { origin: "LEGAL_HOLD", name, queryString: queryString + describeFilters(input.filters), sources: (input.sources ?? ["MAILBOX", "ONEDRIVE", "TEAMS"]) as string[], legalHoldId, matterId: hold.matterId, custodianCount: emails.length, simulated: res.simulated },
    hits,
    actor,
  );
}

export interface AdhocCollectionInput {
  name: string;
  source: "INVESTIGATION" | "ADHOC";
  /** Custodian emails / UPNs to collect. */
  identifiers: string[];
  sources?: DataSubjectSourceType[];
  top?: number;
  matterId?: string | null;
  filters?: CollectionFilters;
}

/** Hub-initiated collection (internal investigation / ad-hoc culling) — not
 *  tied to a hold or DSAR. Collects the given custodians per-user and persists
 *  a ReviewSet. Matter owns this because it owns the M365 client. */
export async function createAdhocCollection(organizationId: string, input: AdhocCollectionInput, actor: Actor): Promise<ReviewSetSummary> {
  const identifiers = [...new Set((input.identifiers || []).map((s) => (s || "").trim()).filter(Boolean))];
  if (identifiers.length === 0) throw new Error("Add at least one custodian email or UPN to collect.");
  const client = await getM365ClientForOrg(organizationId);
  const res = await client.searchForDataSubject({ identifiers, sources: input.sources, top: input.top ?? 200 });
  const hits = filterHits(res.hits, input.filters);
  return persistReviewSet(
    organizationId,
    { origin: input.source, name: (input.name || "").trim() || "Ad-hoc collection", queryString: `Custodians: ${identifiers.join(", ")}${describeFilters(input.filters)}`, sources: (input.sources ?? ["MAILBOX", "ONEDRIVE", "TEAMS"]) as string[], matterId: input.matterId ?? null, custodianCount: identifiers.length, simulated: res.simulated },
    hits,
    actor,
  );
}
