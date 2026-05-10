/**
 * M365GraphDelegatedClient — eDiscovery-only Graph client backed by
 * a delegated user token (sub-PR 4c.1).
 *
 * Microsoft's Graph eDiscovery endpoints (`/security/cases/...`) do
 * not honor application-permissions tokens. This client carries the
 * three eDiscovery methods (`applyPreservation`, `releasePreservation`,
 * `preserveDepartedMailbox`) and pulls a fresh delegated access token
 * from `m365-graph-delegated-auth` for every request.
 *
 * Methods that work fine app-only stay on `M365GraphClient`. The
 * factory in `m365-factory.ts` routes per-method.
 *
 * Audit: every Graph call still goes through `withGraphAudit`. The
 * audit metadata records `authMode: "delegated"` so defensibility
 * queries can reconstruct which auth path serviced each call.
 */
import { Client } from "@microsoft/microsoft-graph-client";
import type {
  ApplyPreservationInput,
  M365Client,
  PreservationResult,
  PreserveDepartedInput,
  ReleasePreservationInput,
} from "./m365";
import { withGraphAudit } from "./m365-graph-audit";
import { mapGraphError } from "./m365-graph-errors";
import { getFreshDelegatedAccessToken } from "./m365-graph-delegated-auth";

const APPLY_HOLD_POLL_MAX = 6;
const APPLY_HOLD_POLL_INTERVAL_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class M365GraphDelegatedClient
  implements
    Pick<
      M365Client,
      "applyPreservation" | "releasePreservation" | "preserveDepartedMailbox"
    >
{
  /**
   * Cached graph client; rebuilt only if `_resetGraphClient()` is
   * called explicitly. Token refresh happens transparently inside the
   * authProvider closure below.
   */
  private graph: Client | null = null;

  constructor(
    private readonly tenantId: string,
    private readonly organizationId: string,
  ) {}

  private getGraph(): Client {
    if (this.graph) return this.graph;
    const orgId = this.organizationId;
    this.graph = Client.initWithMiddleware({
      authProvider: {
        getAccessToken: async (): Promise<string> => {
          const { accessToken } = await getFreshDelegatedAccessToken(orgId);
          return accessToken;
        },
      },
      defaultVersion: "v1.0",
    } as unknown as Parameters<typeof Client.initWithMiddleware>[0]);
    return this.graph;
  }

  /** Force the next Graph call to rebuild the client (post-disconnect). */
  _resetGraphClient(): void {
    this.graph = null;
  }

  // ────────────────────────────────────────────────────────────────
  // applyPreservation — find/create case, add custodian, apply hold
  // ────────────────────────────────────────────────────────────────

  async applyPreservation(
    input: ApplyPreservationInput,
  ): Promise<PreservationResult> {
    const holdId = input.reasonCode.startsWith("hold:")
      ? input.reasonCode.slice(5)
      : input.reasonCode;
    const caseDisplayName = `aegis-${holdId}`;

    const caseId = await this.findOrCreateCase(caseDisplayName, holdId);
    const custodianId = await this.addCustodian(
      caseId,
      input.custodianExternalIdentifier,
    );
    const upstreamId = await this.addSource(caseId, custodianId, input);
    await this.applyHoldOnCustodian(caseId, custodianId);
    const finalStatus = await this.pollCustodianStatus(caseId, custodianId);

    return {
      ok: finalStatus === "applied" || finalStatus === "applying",
      appliedAt: new Date().toISOString(),
      upstreamReferenceId: upstreamId,
      failureReason:
        finalStatus === "failed"
          ? `Graph reported holdStatus=${finalStatus}`
          : null,
    };
  }

  private async findOrCreateCase(
    displayName: string,
    holdId: string,
  ): Promise<string> {
    return withGraphAudit(
      {
        organizationId: this.organizationId,
        endpoint: "/security/cases/ediscoveryCases",
        method: "POST",
        tenantId: this.tenantId,
        actor: null,
        actorType: "SYSTEM",
        resource: { type: "LegalHold", id: holdId },
        metadata: { authMode: "delegated" },
      },
      async () => {
        try {
          const found = (await this.getGraph()
            .api("/security/cases/ediscoveryCases")
            .filter(`displayName eq '${displayName.replace(/'/g, "''")}'`)
            .top(1)
            .get()) as { value?: Array<{ id: string }> };
          if (found.value && found.value.length > 0 && found.value[0]) {
            return found.value[0].id;
          }
          const created = (await this.getGraph()
            .api("/security/cases/ediscoveryCases")
            .post({
              displayName,
              description: `AEGIS legal hold ${holdId}`,
            })) as { id?: string };
          if (!created?.id) throw new Error("eDiscovery case create returned no id");
          return created.id;
        } catch (err) {
          throw mapGraphError(err, "/security/cases/ediscoveryCases");
        }
      },
    );
  }

  private async addCustodian(
    caseId: string,
    userExternalId: string,
  ): Promise<string> {
    return withGraphAudit(
      {
        organizationId: this.organizationId,
        endpoint: `/security/cases/ediscoveryCases/${caseId}/custodians`,
        method: "POST",
        tenantId: this.tenantId,
        actor: null,
        actorType: "SYSTEM",
        metadata: { authMode: "delegated" },
      },
      async () => {
        // Microsoft Graph eDiscovery requires `email` for the custodian.
        // The previous branching on @-presence with undefined fallbacks
        // caused silent JSON serialization failures: undefined gets
        // dropped during JSON.stringify, the body ships without `email`,
        // and Graph 400s with "Required property 'email' not found" —
        // which gets surfaced opaquely to the wizard. Fail loud upstream
        // instead.
        if (!userExternalId.includes("@")) {
          throw new Error(
            `M365 custodian identifier must be a UPN (email format), got: "${userExternalId}". ` +
              `Update the call site to resolve the custodian's email before reaching addCustodian.`,
          );
        }
        try {
          const created = (await this.getGraph()
            .api(`/security/cases/ediscoveryCases/${caseId}/custodians`)
            .post({
              email: userExternalId,
              "@odata.type": "#microsoft.graph.security.ediscoveryCustodian",
            })) as { id?: string };
          if (!created?.id) throw new Error("custodian create returned no id");
          return created.id;
        } catch (err) {
          throw mapGraphError(
            err,
            `/security/cases/ediscoveryCases/${caseId}/custodians`,
          );
        }
      },
    );
  }

  private async addSource(
    caseId: string,
    custodianId: string,
    input: ApplyPreservationInput,
  ): Promise<string | null> {
    const isUserSource =
      input.type === "EMAIL_MAILBOX" ||
      input.type === "ARCHIVED_MAILBOX" ||
      input.type === "DEPARTED_USER_MAILBOX" ||
      input.type === "ONEDRIVE";
    const path = isUserSource
      ? `/security/cases/ediscoveryCases/${caseId}/custodians/${custodianId}/userSources`
      : `/security/cases/ediscoveryCases/${caseId}/custodians/${custodianId}/siteSources`;
    return withGraphAudit(
      {
        organizationId: this.organizationId,
        endpoint: path,
        method: "POST",
        tenantId: this.tenantId,
        actor: null,
        actorType: "SYSTEM",
        metadata: { authMode: "delegated" },
      },
      async () => {
        // Defense in depth at the AEGIS↔Graph trust boundary. Part 1
        // of the Bug B fix resolves identifiers at the call site, but
        // a future caller skipping the resolver would otherwise drop
        // a stale CUID/GUID into Graph's body. Mirrors the addCustodian
        // guard from PR #42 — same fail-loud convention, same
        // upstream-of-Graph timing so withGraphAudit records the
        // typed error rather than an opaque 4xx.
        if (isUserSource && !input.dataSourceExternalIdentifier.includes("@")) {
          throw new Error(
            `M365 ${input.type} userSource identifier must be a UPN (email format), got: "${input.dataSourceExternalIdentifier}". ` +
              `Update the call site to resolve the data source's email before reaching addSource.`,
          );
        }
        if (!isUserSource && !input.dataSourceExternalIdentifier.startsWith("http")) {
          throw new Error(
            `M365 ${input.type} siteSource identifier must be an http(s) webUrl, got: "${input.dataSourceExternalIdentifier}". ` +
              `Update the data source row's externalIdentifier to a Graph-resolvable site URL.`,
          );
        }
        try {
          const body = isUserSource
            ? { email: input.dataSourceExternalIdentifier }
            : { site: { webUrl: input.dataSourceExternalIdentifier } };
          const created = (await this.getGraph()
            .api(path)
            .post(body)) as { id?: string };
          return created?.id ?? null;
        } catch (err) {
          throw mapGraphError(err, path);
        }
      },
    );
  }

  private async applyHoldOnCustodian(
    caseId: string,
    custodianId: string,
  ): Promise<void> {
    const path = `/security/cases/ediscoveryCases/${caseId}/custodians/applyHold`;
    await withGraphAudit(
      {
        organizationId: this.organizationId,
        endpoint: path,
        method: "POST",
        tenantId: this.tenantId,
        actor: null,
        actorType: "SYSTEM",
        metadata: { authMode: "delegated" },
      },
      async () => {
        try {
          await this.getGraph().api(path).post({ ids: [custodianId] });
        } catch (err) {
          throw mapGraphError(err, path);
        }
      },
    );
  }

  private async pollCustodianStatus(
    caseId: string,
    custodianId: string,
  ): Promise<string> {
    const path = `/security/cases/ediscoveryCases/${caseId}/custodians/${custodianId}`;
    let lastStatus = "applying";
    for (let i = 0; i < APPLY_HOLD_POLL_MAX; i++) {
      const status = await withGraphAudit(
        {
          organizationId: this.organizationId,
          endpoint: path,
          method: "GET",
          tenantId: this.tenantId,
          actor: null,
          actorType: "SYSTEM",
          metadata: { authMode: "delegated" },
        },
        async () => {
          try {
            const resp = (await this.getGraph().api(path).get()) as {
              status?: string;
              holdStatus?: string;
            };
            return resp.holdStatus ?? resp.status ?? "applying";
          } catch (err) {
            throw mapGraphError(err, path);
          }
        },
      );
      lastStatus = status;
      if (status === "applied" || status === "failed" || status === "partial") {
        return status;
      }
      await sleep(APPLY_HOLD_POLL_INTERVAL_MS);
    }
    return lastStatus;
  }

  // ────────────────────────────────────────────────────────────────
  // releasePreservation — find case + custodian, removeHold
  // ────────────────────────────────────────────────────────────────

  async releasePreservation(input: ReleasePreservationInput): Promise<void> {
    const holdId = input.custodianExternalIdentifier;
    const caseDisplayName = `aegis-${holdId}`;
    const found = (await this.getGraph()
      .api("/security/cases/ediscoveryCases")
      .filter(`displayName eq '${caseDisplayName.replace(/'/g, "''")}'`)
      .top(1)
      .get()) as { value?: Array<{ id: string }> };
    const caseId = found.value?.[0]?.id;
    if (!caseId) return;

    const custList = (await this.getGraph()
      .api(`/security/cases/ediscoveryCases/${caseId}/custodians`)
      .filter(`email eq '${input.custodianExternalIdentifier.replace(/'/g, "''")}'`)
      .top(1)
      .get()) as { value?: Array<{ id: string }> };
    const custodianId = custList.value?.[0]?.id;
    if (!custodianId) return;

    const path = `/security/cases/ediscoveryCases/${caseId}/custodians/removeHold`;
    await withGraphAudit(
      {
        organizationId: this.organizationId,
        endpoint: path,
        method: "POST",
        tenantId: this.tenantId,
        actor: null,
        actorType: "SYSTEM",
        metadata: { authMode: "delegated" },
      },
      async () => {
        try {
          await this.getGraph().api(path).post({ ids: [custodianId] });
        } catch (err) {
          throw mapGraphError(err, path);
        }
      },
    );
  }

  // ────────────────────────────────────────────────────────────────
  // preserveDepartedMailbox — same path with forced source type
  // ────────────────────────────────────────────────────────────────

  async preserveDepartedMailbox(
    input: PreserveDepartedInput,
  ): Promise<PreservationResult> {
    return this.applyPreservation({
      custodianExternalIdentifier: input.personExternalIdentifier,
      dataSourceExternalIdentifier: input.personExternalIdentifier,
      type: "DEPARTED_USER_MAILBOX",
      action: "LEGAL_HOLD_IN_PLACE",
      reasonCode: input.reasonCode,
    });
  }

  /** @internal */
  public _tenantId(): string {
    return this.tenantId;
  }

  /** @internal */
  public _organizationId(): string {
    return this.organizationId;
  }
}
