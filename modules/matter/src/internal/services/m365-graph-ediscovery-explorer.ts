/**
 * PROC-7b (increment 1) — Purview eDiscovery explorer.
 *
 * A read-only diagnostic over the delegated eDiscovery API. It walks
 * cases → (custodians, searches, reviewSets) → a best-effort review-set item
 * probe, and returns the raw-ish shapes so we can map Purview's processed
 * output into AEGIS `ReviewSetItem`s (the actual read-back is increment 2).
 *
 * Read-only: no case/hold/search is created or mutated. Every Graph call is
 * still chain-sealed via `withGraphAudit` (marked `diagnostic: true`). Uses the
 * same delegated token path as `M365GraphDelegatedClient`.
 */
import { Client } from "@microsoft/microsoft-graph-client";
import { withGraphAudit } from "./m365-graph-audit";
import { mapGraphError } from "./m365-graph-errors";
import { getFreshDelegatedAccessToken } from "./m365-graph-delegated-auth";
import { resolveCredentialsForOrg } from "./m365-graph-auth";

type GraphObject = Record<string, unknown>;
interface GraphCollection { value?: GraphObject[] }

export interface EdiscoveryCaseSummary {
  id: string;
  displayName: string | null;
  status: string | null;
  createdDateTime: string | null;
}
export interface EdiscoveryReviewSetSummary {
  id: string;
  displayName: string | null;
  createdDateTime: string | null;
}
export interface EdiscoveryExplore {
  cases: EdiscoveryCaseSummary[];
  case: {
    id: string;
    displayName: string | null;
    custodians: GraphObject[];
    searches: GraphObject[];
    reviewSets: EdiscoveryReviewSetSummary[];
    error: string | null;
  } | null;
  /** Best-effort probe of a review set's items — the shape PROC-7b maps from. */
  reviewSet: {
    id: string;
    itemsSample: unknown;
    itemsError: string | null;
  } | null;
}

function delegatedGraph(organizationId: string): Client {
  return Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async (): Promise<string> => {
        const { accessToken } = await getFreshDelegatedAccessToken(organizationId);
        return accessToken;
      },
    },
    defaultVersion: "v1.0",
  } as unknown as Parameters<typeof Client.initWithMiddleware>[0]);
}

const str = (o: GraphObject, k: string): string | null =>
  typeof o[k] === "string" ? (o[k] as string) : null;

export async function exploreEdiscovery(
  organizationId: string,
  opts: { caseId?: string; reviewSetId?: string } = {},
): Promise<EdiscoveryExplore> {
  const creds = await resolveCredentialsForOrg(organizationId);
  const tenantId = creds?.tenantId ?? null;
  const graph = delegatedGraph(organizationId);

  const audited = <T>(endpoint: string, fn: () => Promise<T>): Promise<T> =>
    withGraphAudit(
      {
        organizationId,
        endpoint,
        method: "GET",
        tenantId,
        actor: null,
        actorType: "SYSTEM",
        resource: { type: "LegalHold", id: "ediscovery-explore" },
        metadata: { authMode: "delegated", diagnostic: true },
      },
      fn,
    );

  // 1. List cases.
  const casesRes = await audited("/security/cases/ediscoveryCases", async () => {
    try {
      return (await graph
        .api("/security/cases/ediscoveryCases")
        .top(50)
        .get()) as GraphCollection;
    } catch (err) {
      throw mapGraphError(err, "/security/cases/ediscoveryCases");
    }
  });
  const cases: EdiscoveryCaseSummary[] = (casesRes.value ?? []).map((c) => ({
    id: String(c.id ?? ""),
    displayName: str(c, "displayName"),
    status: str(c, "status"),
    createdDateTime: str(c, "createdDateTime"),
  }));

  const caseId = opts.caseId ?? cases[0]?.id;
  if (!caseId) return { cases, case: null, reviewSet: null };

  // 2. Case detail — custodians, searches, review sets (each best-effort).
  const base = `/security/cases/ediscoveryCases/${caseId}`;
  const listValue = async (endpoint: string): Promise<GraphObject[]> => {
    try {
      const r = await audited(endpoint, () => graph.api(endpoint).get() as Promise<GraphCollection>);
      return r.value ?? [];
    } catch (err) {
      return [{ error: String((err as Error)?.message ?? err) }];
    }
  };
  const custodians = await listValue(`${base}/custodians`);
  const searches = await listValue(`${base}/searches`);
  const reviewSetsRaw = await listValue(`${base}/reviewSets`);
  const reviewSets: EdiscoveryReviewSetSummary[] = reviewSetsRaw
    .filter((rs) => typeof rs.id === "string")
    .map((rs) => ({
      id: String(rs.id),
      displayName: str(rs, "displayName"),
      createdDateTime: str(rs, "createdDateTime"),
    }));

  const caseDetail: EdiscoveryExplore["case"] = {
    id: caseId,
    displayName: cases.find((c) => c.id === caseId)?.displayName ?? null,
    custodians,
    searches,
    reviewSets,
    error: null,
  };

  // 3. Best-effort review-set item probe — this is the shape PROC-7b needs to
  //    map processed text/metadata from. v1.0 has no simple items list, so we
  //    probe the query surface and capture whatever comes back (or the error).
  const reviewSetId = opts.reviewSetId ?? reviewSets[0]?.id;
  let reviewSet: EdiscoveryExplore["reviewSet"] = null;
  if (reviewSetId) {
    const endpoint = `${base}/reviewSets/${reviewSetId}/queries`;
    let itemsSample: unknown = null;
    let itemsError: string | null = null;
    try {
      itemsSample = await audited(endpoint, () => graph.api(endpoint).top(5).get());
    } catch (err) {
      itemsError = String((err as Error)?.message ?? err);
    }
    reviewSet = { id: reviewSetId, itemsSample, itemsError };
  }

  return { cases, case: caseDetail, reviewSet };
}
