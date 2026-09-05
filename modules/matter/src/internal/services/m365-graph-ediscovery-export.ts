/**
 * PROC-7b (increment 2a) — Purview review-set export: trigger + poll.
 *
 * Reading Purview's *processed text* back out is export-based: there is no
 * synchronous "give me the item text" call. The flow is:
 *   1. POST …/reviewSets/{id}/export        (async — creates an export job)
 *   2. poll …/operations/{id}               (notStarted → running → succeeded)
 *   3. read exportFileMetadata[]            (fileName + downloadUrl + size)
 *   4. download + parse the package         ← increment 2b
 *
 * This module ships steps 1–3 so we can observe the real operation + output
 * shapes from a live tenant (and so you can see the latency / limitations of
 * keeping Purview processing in-app). The download + load-file parse + mapping
 * into ReviewSetItem is increment 2b, built against what this reveals.
 *
 * Delegated auth + chain-sealed audit, same posture as the explorer. The
 * export POST is a genuine mutation (it creates an export job in Purview).
 */
import { Client } from "@microsoft/microsoft-graph-client";
import { withGraphAudit } from "./m365-graph-audit";
import { mapGraphError } from "./m365-graph-errors";
import { getFreshDelegatedAccessToken } from "./m365-graph-delegated-auth";
import { resolveCredentialsForOrg } from "./m365-graph-auth";

type GraphObject = Record<string, unknown>;
interface GraphCollection { value?: GraphObject[] }

export interface ExportFileMeta {
  fileName: string | null;
  downloadUrl: string | null;
  size: number | null;
}
export interface ExportOperation {
  id: string;
  odataType: string | null;
  status: string | null;
  percentProgress: number | null;
  createdDateTime: string | null;
  outputName: string | null;
  files: ExportFileMeta[];
  /** The raw operation object — kept while we finalise the 2b mapping. */
  raw: unknown;
}
export interface StartExportResult {
  posted: boolean;
  /** The newest export operation visible right after POST (may lag a moment). */
  operation: ExportOperation | null;
}
export interface ReviewSetExportOptions {
  outputName?: string;
  description?: string;
  /** ediscoveryExportOptions flags, e.g. "text,fileInfo,tags". Passed through verbatim. */
  exportOptions?: string;
  /** "none" | "directory" | "pst". Passed through verbatim. */
  exportStructure?: string;
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
const num = (v: unknown): number | null =>
  typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : null;

function toExportOperation(o: GraphObject): ExportOperation {
  const filesRaw = Array.isArray(o.exportFileMetadata) ? (o.exportFileMetadata as GraphObject[]) : [];
  return {
    id: String(o.id ?? ""),
    odataType: str(o, "@odata.type"),
    status: str(o, "status"),
    percentProgress: num(o.percentProgress),
    createdDateTime: str(o, "createdDateTime"),
    outputName: str(o, "outputName"),
    files: filesRaw.map((f) => ({ fileName: str(f, "fileName"), downloadUrl: str(f, "downloadUrl"), size: num(f.size) })),
    raw: o,
  };
}

function isExportOp(o: GraphObject): boolean {
  return String(o["@odata.type"] ?? "").toLowerCase().includes("export");
}

async function audited<T>(organizationId: string, tenantId: string | null, endpoint: string, method: string, fn: () => Promise<T>): Promise<T> {
  return withGraphAudit(
    {
      organizationId,
      endpoint,
      method,
      tenantId,
      actor: null,
      actorType: "SYSTEM",
      resource: { type: "LegalHold", id: "ediscovery-export" },
      metadata: { authMode: "delegated" },
    },
    fn,
  );
}

async function findNewestExportOperation(
  graph: Client,
  organizationId: string,
  tenantId: string | null,
  caseId: string,
): Promise<ExportOperation | null> {
  const endpoint = `/security/cases/ediscoveryCases/${caseId}/operations`;
  const res = await audited(organizationId, tenantId, endpoint, "GET", async () => {
    try {
      return (await graph.api(endpoint).get()) as GraphCollection;
    } catch (err) {
      throw mapGraphError(err, endpoint);
    }
  });
  const ops = (res.value ?? []).filter(isExportOp).map(toExportOperation);
  ops.sort((a, b) => (b.createdDateTime ?? "").localeCompare(a.createdDateTime ?? ""));
  return ops[0] ?? null;
}

/** Step 1: trigger a review-set export, then surface the newest export operation. */
export async function startReviewSetExport(
  organizationId: string,
  caseId: string,
  reviewSetId: string,
  opts: ReviewSetExportOptions = {},
): Promise<StartExportResult> {
  const creds = await resolveCredentialsForOrg(organizationId);
  const tenantId = creds?.tenantId ?? null;
  const graph = delegatedGraph(organizationId);

  const endpoint = `/security/cases/ediscoveryCases/${caseId}/reviewSets/${reviewSetId}/export`;
  const body: GraphObject = {
    outputName: opts.outputName ?? `aegis-export-${Date.now()}`,
    description: opts.description ?? "AEGIS Purview processing read-back test",
  };
  if (opts.exportOptions) body.exportOptions = opts.exportOptions;
  if (opts.exportStructure) body.exportStructure = opts.exportStructure;

  await audited(organizationId, tenantId, endpoint, "POST", async () => {
    try {
      // 202 Accepted — the SDK resolves with an empty body; the operation is
      // discovered via the operations collection below.
      return await graph.api(endpoint).post(body);
    } catch (err) {
      throw mapGraphError(err, endpoint);
    }
  });

  const operation = await findNewestExportOperation(graph, organizationId, tenantId, caseId);
  return { posted: true, operation };
}

/** Steps 2–3: poll an export operation (by id, or the newest one for the case). */
export async function getReviewSetExportStatus(
  organizationId: string,
  caseId: string,
  operationId?: string,
): Promise<ExportOperation | null> {
  const creds = await resolveCredentialsForOrg(organizationId);
  const tenantId = creds?.tenantId ?? null;
  const graph = delegatedGraph(organizationId);

  if (!operationId) {
    return findNewestExportOperation(graph, organizationId, tenantId, caseId);
  }
  const endpoint = `/security/cases/ediscoveryCases/${caseId}/operations/${operationId}`;
  const res = await audited(organizationId, tenantId, endpoint, "GET", async () => {
    try {
      return (await graph.api(endpoint).get()) as GraphObject;
    } catch (err) {
      throw mapGraphError(err, endpoint);
    }
  });
  return toExportOperation(res);
}
