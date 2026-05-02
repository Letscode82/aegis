/**
 * M365 client factory (sub-PR 4c).
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
 */
import {
  M365Client,
  MockM365Client,
} from "./m365";
import { M365GraphClient } from "./m365-graph-client";
import { getGraphClientForOrg } from "./m365-graph-auth";

const MOCK_FALLBACK = new MockM365Client();

/**
 * Returns the configured M365Client for the given org. Falls back
 * to the shared MockM365Client when no credentials resolve. Callers
 * (legal-hold services, matter-create flow) treat the return value
 * as opaque — the interface from m365.ts is the only contract.
 *
 * `getM365Client(orgId)` is async because credential resolution
 * touches the database. The earlier 4a `getM365Client()` (no args)
 * is preserved as a sync alias that returns the mock — used by the
 * 4a m365-mock-extensions path until a caller migrates.
 */
export async function getM365ClientForOrg(
  organizationId: string,
): Promise<M365Client> {
  const resolved = await getGraphClientForOrg(organizationId);
  if (!resolved) return MOCK_FALLBACK;
  return new M365GraphClient(resolved.client, resolved.tenantId, organizationId);
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
