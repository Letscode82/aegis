/**
 * M365GraphClient — real Microsoft Graph implementation of the
 * M365Client interface (sub-PR 4c).
 *
 * The interface signatures are locked from 4a + 4b. This file
 * implements every method against the current
 * `microsoft.graph.security` eDiscovery subnamespace plus the
 * standard Sites / Teams / Users / Drives endpoints.
 *
 * Every Graph call is wrapped in `withGraphAudit` so the chain
 * captures the endpoint, method, status, correlation id, and
 * duration. Errors are normalised to typed `M365GraphError`
 * subclasses (see m365-graph-errors.ts).
 *
 * Sub-PR 4c chunk 1: constructor + interface wiring. The 8 method
 * bodies are skeletons that delegate to `notImplemented()` so
 * typecheck stays green; chunk 2 fills them in. The mock continues
 * to handle calls in CI / no-creds environments.
 */
import type { Client } from "@microsoft/microsoft-graph-client";
import type { Matter } from "@aegis/db";
import type {
  ApplyPreservationInput,
  CandidateCustodian,
  EnumeratedDataSource,
  HoldScopeQuery,
  M365Client,
  MatterM365Bindings,
  PreservationResult,
  PreserveDepartedInput,
  ReleasePreservationInput,
} from "./m365";
import {
  M365EDiscoveryNotLicensedError,
  M365GraphError,
  mapGraphError,
} from "./m365-graph-errors";
import { withGraphAudit } from "./m365-graph-audit";

export class M365GraphClient implements M365Client {
  constructor(
    private readonly graph: Client,
    private readonly tenantId: string,
    private readonly organizationId: string,
  ) {}

  // ── Matter bindings (Sites + Teams) ─────────────────────────────

  async provisionMatterBindings(matter: Matter): Promise<MatterM365Bindings> {
    return notImplemented("provisionMatterBindings", this, matter);
  }

  async releaseMatterBindings(matter: Matter): Promise<void> {
    await notImplemented("releaseMatterBindings", this, matter);
  }

  async getMatterBindings(matterId: string): Promise<MatterM365Bindings> {
    return notImplemented("getMatterBindings", this, matterId);
  }

  // ── Custodian discovery (Users + Groups + Manager chain) ────────

  async discoverCustodians(
    scopeQuery: HoldScopeQuery,
  ): Promise<CandidateCustodian[]> {
    return notImplemented("discoverCustodians", this, scopeQuery);
  }

  // ── eDiscovery preservation ─────────────────────────────────────

  async applyPreservation(
    input: ApplyPreservationInput,
  ): Promise<PreservationResult> {
    return notImplemented("applyPreservation", this, input);
  }

  async releasePreservation(input: ReleasePreservationInput): Promise<void> {
    await notImplemented("releasePreservation", this, input);
  }

  async preserveDepartedMailbox(
    input: PreserveDepartedInput,
  ): Promise<PreservationResult> {
    return notImplemented("preserveDepartedMailbox", this, input);
  }

  // ── Per-user data source enumeration ────────────────────────────

  async enumerateDataSourcesForUser(
    externalIdentifier: string,
  ): Promise<EnumeratedDataSource[]> {
    return notImplemented(
      "enumerateDataSourcesForUser",
      this,
      externalIdentifier,
    );
  }

  // ── Helpers shared across method bodies (chunk 2) ───────────────

  /** Look up an existing eDiscovery case by AEGIS displayName. */
  protected async findEdiscoveryCase(holdId: string): Promise<{ id: string } | null> {
    const displayName = `aegis-${holdId}`;
    return withGraphAudit(
      {
        organizationId: this.organizationId,
        endpoint: "/security/cases/ediscoveryCases",
        method: "GET",
        tenantId: this.tenantId,
        actor: null,
        actorType: "SYSTEM",
      },
      async () => {
        try {
          const res = await this.graph
            .api("/security/cases/ediscoveryCases")
            .filter(`displayName eq '${displayName.replace(/'/g, "''")}'`)
            .top(1)
            .get();
          const value = (res as { value?: Array<{ id: string }> }).value;
          return value && value.length > 0 ? { id: value[0]!.id } : null;
        } catch (err) {
          throw mapGraphError(err, "/security/cases/ediscoveryCases");
        }
      },
    );
  }

  /**
   * Tag the per-call thrown error so callers above (legal-hold
   * services + the contract tests) can distinguish license-absent
   * from auth-broken from generic.
   */
  protected normaliseError(err: unknown, endpoint: string | null): M365GraphError {
    return mapGraphError(err, endpoint);
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

/**
 * Internal helper used by chunk-1 method skeletons. When a caller
 * hits one of these in a real-Graph environment, we surface a
 * recognisable error rather than silently returning empty data —
 * the legal-hold service will catch the typed
 * `M365EDiscoveryNotLicensedError` and degrade gracefully, but a
 * `notImplemented` flagging an unfilled chunk is louder than a
 * 501 from Graph.
 */
async function notImplemented(
  method: string,
  _client: M365GraphClient,
  _arg: unknown,
): Promise<never> {
  throw new M365EDiscoveryNotLicensedError(
    `M365GraphClient.${method} not yet implemented in this build (4c chunk 1). ` +
      `The mock continues to handle this call until chunk 2 lands.`,
    { endpoint: null, statusCode: null },
  );
}
