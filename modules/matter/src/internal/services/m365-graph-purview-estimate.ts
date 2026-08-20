/**
 * Purview eDiscovery (Premium) collection estimate (CW-2). Creates/reuses an
 * eDiscovery case, adds a search scoped to the custodians + a KQL content query,
 * kicks the search estimate, and reads back tenant-wide statistics (item count,
 * size, mailbox/site coverage). Shared by the app-only and delegated clients —
 * the Graph shape is the same; only the auth differs (delegated is preferred
 * because `/security/cases/*` is honored there in production).
 *
 * Every call is wrapped in `withGraphAudit` so the estimate is chain-sealed.
 * The estimate is asynchronous on Microsoft's side: on first read it may still
 * be RUNNING — the caller polls again. Full export → download → ingest (turning
 * the estimate into reviewable items) is the next step, validated on a tenant.
 */
import type { Client } from "@microsoft/microsoft-graph-client";
import { withGraphAudit } from "./m365-graph-audit";
import { mapGraphError } from "./m365-graph-errors";
import type { PurviewCollectionInput, PurviewCollectionEstimate } from "./m365";

interface EstimateCtx {
  graph: Client;
  organizationId: string;
  tenantId: string;
  authMode: "app-only" | "delegated";
}

export async function estimatePurviewCollectionViaGraph(ctx: EstimateCtx, input: PurviewCollectionInput): Promise<PurviewCollectionEstimate> {
  const custodians = [...new Set((input.custodianIdentifiers || []).map((s) => (s || "").trim()).filter(Boolean))];
  const displayName = (input.displayName || `AEGIS collection ${custodians[0] ?? "adhoc"}`).slice(0, 120);
  const audit = { organizationId: ctx.organizationId, tenantId: ctx.tenantId, actor: null, actorType: "SYSTEM" as const, metadata: { authMode: ctx.authMode } };

  return withGraphAudit(
    { ...audit, endpoint: "/security/cases/ediscoveryCases/searches/estimateStatistics", method: "POST" },
    async (): Promise<PurviewCollectionEstimate> => {
      try {
        // 1. Case (reuse by display name).
        const found = (await ctx.graph.api("/security/cases/ediscoveryCases").filter(`displayName eq '${displayName.replace(/'/g, "''")}'`).top(1).get()) as { value?: Array<{ id: string }> };
        const caseId = found.value?.[0]?.id
          ?? ((await ctx.graph.api("/security/cases/ediscoveryCases").post({ displayName, description: "AEGIS eDiscovery collection estimate" })) as { id?: string }).id
          ?? null;
        if (!caseId) throw new Error("eDiscovery case create returned no id");

        // 2. Search scoped to custodians + KQL.
        const contentQuery = (input.queryString || "").trim() || custodians.map((c) => `participants:"${c}"`).join(" OR ");
        const created = (await ctx.graph.api(`/security/cases/ediscoveryCases/${caseId}/searches`).post({
          displayName: `${displayName} — ${new Date().toISOString().slice(0, 10)}`,
          contentQuery,
          dataSourceScopes: "allTenantMailboxes,allTenantSites",
        })) as { id?: string };
        const searchId = created?.id ?? null;
        if (!searchId) throw new Error("eDiscovery search create returned no id");

        // 3. Kick the estimate + read the last estimate operation (async).
        await ctx.graph.api(`/security/cases/ediscoveryCases/${caseId}/searches/${searchId}/estimateStatistics`).post({});
        const op = (await ctx.graph.api(`/security/cases/ediscoveryCases/${caseId}/searches/${searchId}/lastEstimateStatisticsOperation`).get().catch(() => null)) as
          | { status?: string; indexedItemCount?: number; indexedItemsSize?: number; mailboxCount?: number; siteCount?: number }
          | null;

        const done = op && (op.status === "succeeded" || op.status === "completedWithErrors");
        return {
          caseId, searchId,
          estimatedItems: op?.indexedItemCount ?? 0,
          estimatedSizeBytes: op?.indexedItemsSize ?? 0,
          mailboxCount: op?.mailboxCount ?? 0,
          siteCount: op?.siteCount ?? 0,
          status: done ? "COMPLETE" : "RUNNING",
          simulated: false,
        };
      } catch (err) {
        throw mapGraphError(err, "/security/cases/ediscoveryCases/searches/estimateStatistics");
      }
    },
  );
}
