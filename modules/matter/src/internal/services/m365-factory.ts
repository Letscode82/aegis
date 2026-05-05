/**
 * M365 client factory (sub-PR 4c, extended in 4c.1).
 *
 * Resolution order — see CLAUDE.md "Architectural Foundations:
 * M365 integration as auditable, replaceable, and degradable":
 *
 *   1. OrganizationM365Credential row exists for the org → real
 *      M365GraphClient against the row's tenant.
 *   2. M365_TENANT_ID + M365_CLIENT_ID + M365_CLIENT_SECRET env
 *      vars all set → real M365GraphClient against the env tenant.
 *   3. Otherwise → MockM365Client. Local dev without creds and CI
 *      land here.
 *
 * The production guard in m365-graph-auth.ts crashes the build at
 * module-load if env vars are partially set.
 *
 * 4c.1 — eDiscovery delegated routing. Microsoft's Graph eDiscovery
 * endpoints don't honor application-permissions tokens, so the
 * factory routes the three eDiscovery methods (`applyPreservation`,
 * `releasePreservation`, `preserveDepartedMailbox`) through
 * `M365GraphDelegatedClient` when delegated auth is configured.
 *
 * Behaviour matrix:
 *
 *                        prod, app-only ✓, delegated ✓ → app-only client + delegated client (per-method)
 *                        prod, app-only ✓, delegated ✗ → app-only client; eDiscovery throws M365DelegatedAuthRequiredError
 *                        prod, app-only ✗              → MockM365Client (env-var path failed module-load guard if partial)
 *                        dev,  app-only ✓, delegated ✗ → app-only client + mock fallback for eDiscovery
 *                        dev,  app-only ✗              → MockM365Client
 */
import {
  M365Client,
  MockM365Client,
} from "./m365";
import { M365GraphClient } from "./m365-graph-client";
import { M365GraphDelegatedClient } from "./m365-graph-delegated-client";
import { getGraphClientForOrg } from "./m365-graph-auth";
import { prisma } from "@aegis/db";
import { M365DelegatedAuthRequiredError } from "./m365-graph-errors";
import type {
  ApplyPreservationInput,
  PreservationResult,
  PreserveDepartedInput,
  ReleasePreservationInput,
} from "./m365";

const MOCK_FALLBACK = new MockM365Client();

/**
 * Routed client — composes app-only and delegated implementations.
 * Methods that work fine app-only delegate to the app-only client;
 * the three eDiscovery methods route to the delegated client (or
 * fall back to the mock in dev when delegated auth is unconfigured).
 */
class RoutedM365Client implements M365Client {
  constructor(
    private readonly appOnly: M365GraphClient,
    private readonly delegated: M365GraphDelegatedClient | null,
    private readonly organizationId: string,
    private readonly mockFallback: MockM365Client,
    private readonly devModeFallback: boolean,
  ) {}

  // ── App-only methods — pass through to M365GraphClient ─────────

  provisionMatterBindings(matter: Parameters<M365Client["provisionMatterBindings"]>[0]) {
    return this.appOnly.provisionMatterBindings(matter);
  }
  releaseMatterBindings(matter: Parameters<M365Client["releaseMatterBindings"]>[0]) {
    return this.appOnly.releaseMatterBindings(matter);
  }
  getMatterBindings(matterId: string) {
    return this.appOnly.getMatterBindings(matterId);
  }
  discoverCustodians(scopeQuery: Parameters<M365Client["discoverCustodians"]>[0]) {
    return this.appOnly.discoverCustodians(scopeQuery);
  }
  enumerateDataSourcesForUser(externalIdentifier: string) {
    return this.appOnly.enumerateDataSourcesForUser(externalIdentifier);
  }

  // ── Delegated methods — eDiscovery surface ──────────────────────

  async applyPreservation(
    input: ApplyPreservationInput,
  ): Promise<PreservationResult> {
    if (this.delegated) return this.delegated.applyPreservation(input);
    if (this.devModeFallback) return this.mockFallback.applyPreservation(input);
    throw this.requireError("applyPreservation");
  }

  async releasePreservation(input: ReleasePreservationInput): Promise<void> {
    if (this.delegated) return this.delegated.releasePreservation(input);
    if (this.devModeFallback) return this.mockFallback.releasePreservation(input);
    throw this.requireError("releasePreservation");
  }

  async preserveDepartedMailbox(
    input: PreserveDepartedInput,
  ): Promise<PreservationResult> {
    if (this.delegated) return this.delegated.preserveDepartedMailbox(input);
    if (this.devModeFallback)
      return this.mockFallback.preserveDepartedMailbox(input);
    throw this.requireError("preserveDepartedMailbox");
  }

  private requireError(method: string): M365DelegatedAuthRequiredError {
    return new M365DelegatedAuthRequiredError(
      `eDiscovery operation "${method}" requires delegated authorization. ` +
        `Org ${this.organizationId} has no stored refresh token. ` +
        `An admin must connect the eDiscovery service account at /admin/m365 ` +
        `(Device Code flow) before this operation can proceed in production.`,
    );
  }
}

/**
 * Returns the configured M365Client for the given org. Falls back
 * to the shared MockM365Client when no app-only credentials resolve.
 *
 * Per-method routing happens inside `RoutedM365Client`. Callers
 * (legal-hold services, matter-create flow) treat the return value
 * as opaque — the interface from m365.ts is the only contract.
 */
export async function getM365ClientForOrg(
  organizationId: string,
): Promise<M365Client> {
  const resolved = await getGraphClientForOrg(organizationId);
  if (!resolved) return MOCK_FALLBACK;

  const appOnly = new M365GraphClient(
    resolved.client,
    resolved.tenantId,
    organizationId,
  );

  const credRow = await prisma.organizationM365Credential
    .findUnique({ where: { organizationId } })
    .catch(() => null);
  const hasDelegated = !!credRow?.delegatedRefreshToken;

  const delegated = hasDelegated
    ? new M365GraphDelegatedClient(resolved.tenantId, organizationId)
    : null;

  return new RoutedM365Client(
    appOnly,
    delegated,
    organizationId,
    MOCK_FALLBACK,
    process.env.NODE_ENV !== "production",
  );
}

/**
 * Synchronous, org-agnostic accessor preserved for 4a callers
 * (matter-bind provisioning paths that haven't migrated to the
 * org-scoped factory yet). Always returns the mock — the real
 * factory needs an org id to resolve credentials.
 *
 * New callers in 4c+ should use `getM365ClientForOrg(orgId)`.
 */
export function getM365Client(): M365Client {
  return MOCK_FALLBACK;
}
