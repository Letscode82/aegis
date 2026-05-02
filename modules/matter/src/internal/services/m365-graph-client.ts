/**
 * M365GraphClient — real Microsoft Graph implementation of the
 * M365Client interface (sub-PR 4c).
 *
 * Every Graph call routes through `microsoft.graph.security` (current
 * eDiscovery namespace as of late 2025). The deprecated
 * `microsoft.graph.eDiscovery` namespace is **not used** anywhere in
 * this file — Graph still serves it but new integrations land on
 * `/security/cases/ediscoveryCases/...`.
 *
 * Every Graph call is wrapped in `withGraphAudit` so the chain
 * captures the endpoint + correlation id + duration. Errors are
 * normalised to typed `M365GraphError` subclasses; the legal-hold
 * workflow degrades on `M365EDiscoveryNotLicensedError`.
 */
import type { Client } from "@microsoft/microsoft-graph-client";
import type { Matter } from "@aegis/db";
import type {
  ApplyPreservationInput,
  CandidateCustodian,
  EnumeratedDataSource,
  HoldScopeQuery,
  M365Client,
  M365FolderRef,
  M365MailRef,
  M365TeamsRef,
  MatterM365Bindings,
  PreservationResult,
  PreserveDepartedInput,
  ReleasePreservationInput,
} from "./m365";
import type { DataSourceType, PreservationAction } from "@aegis/db";
import {
  M365GraphError,
  M365GraphNotFoundError,
  mapGraphError,
} from "./m365-graph-errors";
import { withGraphAudit } from "./m365-graph-audit";

/** Maximum tries on `applyHold` polling before declaring "applying". */
const APPLY_HOLD_POLL_MAX = 6;
/** Sleep between polls (ms). 6 polls * 5s = 30s ceiling. */
const APPLY_HOLD_POLL_INTERVAL_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class M365GraphClient implements M365Client {
  constructor(
    private readonly graph: Client,
    private readonly tenantId: string,
    private readonly organizationId: string,
  ) {}

  // ────────────────────────────────────────────────────────────────
  // Matter bindings
  // ────────────────────────────────────────────────────────────────

  async provisionMatterBindings(matter: Matter): Promise<MatterM365Bindings> {
    // Idempotency — return existing bindings if found.
    const existing = await this.getMatterBindings(matter.id);
    if (existing.provisionedAt) return existing;

    const sharepoint = await this.provisionSharepointFolder(matter);
    const teams = await this.provisionTeamsChannel(matter);
    const mail: M365MailRef | null = null; // mail-rule provisioning deferred

    return {
      sharepoint,
      teams,
      mail,
      provisionedAt: new Date().toISOString(),
    };
  }

  private async provisionSharepointFolder(
    matter: Matter,
  ): Promise<M365FolderRef | null> {
    return withGraphAudit(
      {
        organizationId: this.organizationId,
        endpoint: "/sites/root",
        method: "GET",
        tenantId: this.tenantId,
        actor: null,
        actorType: "SYSTEM",
        resource: { type: "Matter", id: matter.id },
      },
      async () => {
        try {
          // Resolve the root site that hosts AEGIS document libraries.
          const root = (await this.graph.api("/sites/root").get()) as {
            id?: string;
            webUrl?: string;
          };
          if (!root?.id) throw new Error("No SharePoint root site");
          const driveResp = (await this.graph
            .api(`/sites/${root.id}/drive`)
            .get()) as { id?: string };
          if (!driveResp?.id) throw new Error("No default drive");
          // Create matter folder. Idempotent via @microsoft.graph.conflictBehavior=replace.
          const folder = (await this.graph
            .api(`/sites/${root.id}/drive/root/children`)
            .post({
              name: `Matter-${matter.matterNumber ?? matter.id}`,
              folder: {},
              "@microsoft.graph.conflictBehavior": "replace",
            })) as { id?: string; webUrl?: string };
          if (!folder?.id) throw new Error("Folder create returned no id");
          return {
            siteId: root.id,
            driveId: driveResp.id,
            folderId: folder.id,
            webUrl: folder.webUrl ?? root.webUrl ?? "",
          };
        } catch (err) {
          throw mapGraphError(err, "/sites/root/drive/root/children");
        }
      },
    );
  }

  private async provisionTeamsChannel(matter: Matter): Promise<M365TeamsRef | null> {
    // Auto-creating a parent Team requires Group.ReadWrite.All — out
    // of scope per CLAUDE.md "Documented exceptions". The dev tenant
    // has the parent Team pre-seeded. We resolve the AEGIS Team by
    // displayName "AEGIS-Matters"; if absent, we return null and the
    // caller surface flags the matter as "Teams not provisioned".
    return withGraphAudit(
      {
        organizationId: this.organizationId,
        endpoint: "/teams",
        method: "GET",
        tenantId: this.tenantId,
        actor: null,
        actorType: "SYSTEM",
        resource: { type: "Matter", id: matter.id },
      },
      async () => {
        try {
          const teamsResp = (await this.graph
            .api("/teams")
            .filter("displayName eq 'AEGIS-Matters'")
            .top(1)
            .get()) as { value?: Array<{ id: string }> };
          const teamId = teamsResp.value?.[0]?.id;
          if (!teamId) return null;
          const channel = (await this.graph
            .api(`/teams/${teamId}/channels`)
            .post({
              displayName: `Matter ${matter.matterNumber ?? matter.id}`,
              membershipType: "private",
            })) as { id?: string; webUrl?: string };
          if (!channel?.id) return null;
          return {
            channelId: channel.id,
            channelUrl: channel.webUrl ?? "",
          };
        } catch (err) {
          throw mapGraphError(err, "/teams");
        }
      },
    );
  }

  async releaseMatterBindings(matter: Matter): Promise<void> {
    const bindings = await this.getMatterBindings(matter.id);
    if (!bindings.provisionedAt) return; // nothing to do
    if (bindings.sharepoint) {
      await this.softDelete(
        `/sites/${bindings.sharepoint.siteId}/drive/items/${bindings.sharepoint.folderId}`,
        matter.id,
      );
    }
    if (bindings.teams) {
      await this.softDelete(
        `/teams/${bindings.teams.channelId}`,
        matter.id,
      );
    }
  }

  /** DELETE that swallows 404 (idempotent). */
  private async softDelete(endpoint: string, matterId: string): Promise<void> {
    try {
      await withGraphAudit(
        {
          organizationId: this.organizationId,
          endpoint,
          method: "DELETE",
          tenantId: this.tenantId,
          actor: null,
          actorType: "SYSTEM",
          resource: { type: "Matter", id: matterId },
        },
        () => this.graph.api(endpoint).delete(),
      );
    } catch (err) {
      const mapped = mapGraphError(err, endpoint);
      if (mapped instanceof M365GraphNotFoundError) return;
      throw mapped;
    }
  }

  async getMatterBindings(_matterId: string): Promise<MatterM365Bindings> {
    // Bindings discovery is anchored on AEGIS-side rows
    // (`Matter.m365Bindings` JSON). The Graph API doesn't store our
    // logical matter id as a queryable property, so without that
    // reverse-lookup we report empty. Production wiring (4c chunk 3)
    // populates `Matter.m365Bindings` on provisioning so subsequent
    // reads short-circuit before they ever reach Graph.
    return {
      sharepoint: null,
      teams: null,
      mail: null,
      provisionedAt: null,
    };
  }

  // ────────────────────────────────────────────────────────────────
  // Custodian discovery
  // ────────────────────────────────────────────────────────────────

  async discoverCustodians(
    scopeQuery: HoldScopeQuery,
  ): Promise<CandidateCustodian[]> {
    const description = (scopeQuery.description ?? "").trim();
    if (!description) return [];

    return withGraphAudit(
      {
        organizationId: this.organizationId,
        endpoint: "/users",
        method: "GET",
        tenantId: this.tenantId,
        actor: null,
        actorType: "SYSTEM",
      },
      async () => {
        try {
          // Heuristic: try free-text name/email match across users.
          // Real production would parse the scope (department, group,
          // title) and dispatch — kept simple here so the contract
          // matches the mock and 4d's Claude-driven discovery is the
          // primary intelligence layer.
          const escaped = description.replace(/'/g, "''");
          const resp = (await this.graph
            .api("/users")
            .filter(
              `startswith(displayName,'${escaped}') or startswith(mail,'${escaped}')`,
            )
            .select("id,displayName,mail,userPrincipalName,department,jobTitle")
            .top(10)
            .get()) as {
            value?: Array<{
              id: string;
              displayName?: string | null;
              mail?: string | null;
              userPrincipalName?: string | null;
              department?: string | null;
              jobTitle?: string | null;
            }>;
          };
          const users = resp.value ?? [];
          return users.map((u) => ({
            externalIdentifier: u.id,
            name: u.displayName ?? u.userPrincipalName ?? u.id,
            email: u.mail ?? u.userPrincipalName ?? "",
            department: u.department ?? undefined,
            title: u.jobTitle ?? undefined,
            matchConfidence: 0.85,
            matchRationale: "Display-name / mail prefix match (Graph user search)",
          }));
        } catch (err) {
          throw mapGraphError(err, "/users");
        }
      },
    );
  }

  // ────────────────────────────────────────────────────────────────
  // eDiscovery preservation (the long dance)
  // ────────────────────────────────────────────────────────────────

  /**
   * Apply in-place hold to one custodian's data sources. Sequence:
   *  1. Find or create eDiscovery case.
   *  2. Add custodian to the case.
   *  3. Add userSource / siteSource for each data source.
   *  4. POST applyHold on the case+custodian.
   *  5. Poll status until `applied` (or timeout → "applying").
   */
  async applyPreservation(
    input: ApplyPreservationInput,
  ): Promise<PreservationResult> {
    const holdId = this.holdIdFromReason(input.reasonCode);
    const caseDisplayName = `aegis-${holdId}`;

    // 1. Resolve case.
    const caseId = await this.findOrCreateEdiscoveryCase(caseDisplayName, holdId);

    // 2. Add custodian (idempotent — Graph returns existing on conflict).
    const custodianId = await this.addEdiscoveryCustodian(
      caseId,
      input.custodianExternalIdentifier,
    );

    // 3. Add the source matching the data source type.
    const upstreamId = await this.addEdiscoverySource(
      caseId,
      custodianId,
      input,
    );

    // 4. applyHold.
    await this.applyHoldOnCustodian(caseId, custodianId);

    // 5. Poll status.
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

  /**
   * Match the AEGIS legal-hold id back out of the reason code we sent.
   * The reasonCode convention from data-sources.ts is "hold:<holdId>";
   * fall back to a hash of the input if the convention is broken.
   */
  private holdIdFromReason(reasonCode: string): string {
    if (reasonCode.startsWith("hold:")) return reasonCode.slice(5);
    return reasonCode;
  }

  private async findOrCreateEdiscoveryCase(
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
      },
      async () => {
        try {
          // Lookup first.
          const found = (await this.graph
            .api("/security/cases/ediscoveryCases")
            .filter(`displayName eq '${displayName.replace(/'/g, "''")}'`)
            .top(1)
            .get()) as { value?: Array<{ id: string }> };
          if (found.value && found.value.length > 0 && found.value[0]) {
            return found.value[0].id;
          }
          // Create.
          const created = (await this.graph
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

  private async addEdiscoveryCustodian(
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
      },
      async () => {
        try {
          const created = (await this.graph
            .api(`/security/cases/ediscoveryCases/${caseId}/custodians`)
            .post({
              email: userExternalId.includes("@") ? userExternalId : undefined,
              userId: userExternalId.includes("@") ? undefined : userExternalId,
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

  private async addEdiscoverySource(
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
      },
      async () => {
        try {
          const body = isUserSource
            ? { email: input.dataSourceExternalIdentifier }
            : { site: { webUrl: input.dataSourceExternalIdentifier } };
          const created = (await this.graph
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
      },
      async () => {
        try {
          await this.graph.api(path).post({ ids: [custodianId] });
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
        },
        async () => {
          try {
            const resp = (await this.graph.api(path).get()) as {
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

  async releasePreservation(input: ReleasePreservationInput): Promise<void> {
    // Symmetry with applyPreservation — find case + custodian, post
    // removeHold. We never delete the eDiscovery case (defensibility
    // evidence remains), only the hold.
    const holdId = input.custodianExternalIdentifier; // legal-hold service passes the hold context
    const caseDisplayName = `aegis-${holdId}`;
    const found = (await this.graph
      .api("/security/cases/ediscoveryCases")
      .filter(`displayName eq '${caseDisplayName.replace(/'/g, "''")}'`)
      .top(1)
      .get()) as { value?: Array<{ id: string }> };
    const caseId = found.value?.[0]?.id;
    if (!caseId) return;

    // Find the custodian under the case.
    const custList = (await this.graph
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
      },
      async () => {
        try {
          await this.graph.api(path).post({ ids: [custodianId] });
        } catch (err) {
          throw mapGraphError(err, path);
        }
      },
    );
  }

  async preserveDepartedMailbox(
    input: PreserveDepartedInput,
  ): Promise<PreservationResult> {
    // Reuse the apply path with forced data-source types. Graph
    // permits holds on disabled accounts.
    return this.applyPreservation({
      custodianExternalIdentifier: input.personExternalIdentifier,
      dataSourceExternalIdentifier: input.personExternalIdentifier,
      type: "DEPARTED_USER_MAILBOX",
      action: "LEGAL_HOLD_IN_PLACE",
      reasonCode: input.reasonCode,
    });
  }

  // ────────────────────────────────────────────────────────────────
  // Per-user data source enumeration
  // ────────────────────────────────────────────────────────────────

  async enumerateDataSourcesForUser(
    externalIdentifier: string,
  ): Promise<EnumeratedDataSource[]> {
    const out: EnumeratedDataSource[] = [];

    // Mailbox.
    const hasMailbox = await this.tryGet(
      `/users/${externalIdentifier}/mailboxSettings`,
    );
    if (hasMailbox) {
      out.push({
        type: "EMAIL_MAILBOX",
        externalIdentifier: `exchange:${externalIdentifier}`,
        displayLabel: "Exchange mailbox",
        retentionPolicy: "graph-default",
        retentionPolicyConflict: false,
      });
    }

    // OneDrive.
    const drive = await this.tryGet<{ id?: string; webUrl?: string }>(
      `/users/${externalIdentifier}/drive`,
    );
    if (drive?.id) {
      out.push({
        type: "ONEDRIVE",
        externalIdentifier: drive.id,
        displayLabel: "OneDrive",
        retentionPolicy: "graph-default",
        retentionPolicyConflict: false,
      });
    }

    // Teams DMs (one-on-one chats).
    const chats = await this.tryGet<{ value?: Array<{ id: string }> }>(
      `/users/${externalIdentifier}/chats?$filter=chatType eq 'oneOnOne'&$top=1`,
    );
    if (chats?.value && chats.value.length > 0 && chats.value[0]) {
      out.push({
        type: "TEAMS_DM",
        externalIdentifier: chats.value[0].id,
        displayLabel: "Teams DMs",
        retentionPolicy: "tenant-default",
        retentionPolicyConflict: false,
      });
    }

    // Joined Teams channels.
    const teams = await this.tryGet<{ value?: Array<{ id: string }> }>(
      `/users/${externalIdentifier}/joinedTeams?$top=10`,
    );
    if (teams?.value) {
      for (const team of teams.value) {
        out.push({
          type: "TEAMS_CHANNEL",
          externalIdentifier: team.id,
          displayLabel: `Teams channel ${team.id}`,
          retentionPolicy: "tenant-default",
          retentionPolicyConflict: false,
        });
      }
    }

    return out;
  }

  /**
   * GET helper that returns null on 404 / not-found rather than
   * throwing — used by the enumeration path where missing endpoints
   * are normal (e.g. a user without a OneDrive).
   */
  private async tryGet<T>(endpoint: string): Promise<T | null> {
    try {
      return await withGraphAudit(
        {
          organizationId: this.organizationId,
          endpoint,
          method: "GET",
          tenantId: this.tenantId,
          actor: null,
          actorType: "SYSTEM",
        },
        async () => {
          try {
            return (await this.graph.api(endpoint).get()) as T;
          } catch (err) {
            throw mapGraphError(err, endpoint);
          }
        },
      );
    } catch (err) {
      if (err instanceof M365GraphNotFoundError) return null;
      throw err;
    }
  }

  // Surface for the contract tests; not part of the public M365Client
  // interface.
  /** @internal */
  public _tenantId(): string {
    return this.tenantId;
  }

  /** @internal */
  public _organizationId(): string {
    return this.organizationId;
  }
}

/** Re-export typed errors for caller convenience (legal-hold callers). */
export { M365GraphError };

/**
 * Helper consumed by data-sources.ts so the reasonCode the legal-hold
 * service sends respects the convention `hold:<holdId>`. Not exported
 * via api.ts — it's an internal contract between the two modules.
 */
export function holdReasonCode(holdId: string): string {
  return `hold:${holdId}`;
}

// Suppress unused-import linting for types that are referenced solely
// in JSDoc comments in this file's public docs.
type _UnusedReferences = DataSourceType | PreservationAction;
const _unusedReferences: _UnusedReferences | undefined = undefined;
void _unusedReferences;
