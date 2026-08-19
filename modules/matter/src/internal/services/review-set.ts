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

export interface CommitHoldCollectionInput {
  name?: string;
  queryString?: string | null;
  naturalLanguage?: string | null;
  sources?: DataSubjectSourceType[];
  top?: number;
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
  const name = (input.name || "").trim() || `${hold.holdNumber || hold.title} — collection`;

  return persistReviewSet(
    hold.organizationId,
    { origin: "LEGAL_HOLD", name, queryString, sources: (input.sources ?? ["MAILBOX", "ONEDRIVE", "TEAMS"]) as string[], legalHoldId, matterId: hold.matterId, custodianCount: emails.length, simulated: res.simulated },
    res.hits,
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
}

/** Hub-initiated collection (internal investigation / ad-hoc culling) — not
 *  tied to a hold or DSAR. Collects the given custodians per-user and persists
 *  a ReviewSet. Matter owns this because it owns the M365 client. */
export async function createAdhocCollection(organizationId: string, input: AdhocCollectionInput, actor: Actor): Promise<ReviewSetSummary> {
  const identifiers = [...new Set((input.identifiers || []).map((s) => (s || "").trim()).filter(Boolean))];
  if (identifiers.length === 0) throw new Error("Add at least one custodian email or UPN to collect.");
  const client = await getM365ClientForOrg(organizationId);
  const res = await client.searchForDataSubject({ identifiers, sources: input.sources, top: input.top ?? 200 });
  return persistReviewSet(
    organizationId,
    { origin: input.source, name: (input.name || "").trim() || "Ad-hoc collection", queryString: `Custodians: ${identifiers.join(", ")}`, sources: (input.sources ?? ["MAILBOX", "ONEDRIVE", "TEAMS"]) as string[], matterId: input.matterId ?? null, custodianCount: identifiers.length, simulated: res.simulated },
    res.hits,
    actor,
  );
}
