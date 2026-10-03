/**
 * DMS connector descriptors (C-3).
 *
 * Builds the F-8 `ConnectorDescriptor` for each DMS provider and registers it
 * in a `ConnectorRegistry`, so the admin connect flow resolves a DMS provider's
 * OAuth config by id and never hard-codes an endpoint. Per-provider endpoints
 * and default scopes live here; secrets and tenant come from the caller (env /
 * per-org row), never from this module.
 */
import type { ConnectorDescriptor, ConnectorRegistry, OAuthConfig } from "@aegis/connectors";
import type { DmsProviderId } from "./types.js";

/** The per-org inputs needed to build a DMS provider's OAuth config. */
export interface DmsOAuthInput {
  clientId: string;
  /** Confidential clients only; omit for PKCE public clients. */
  clientSecret?: string;
  redirectUri: string;
  /**
   * Provider tenant/host discriminator:
   *  - iManage: the work-site host, e.g. "acme.imanage.work"
   *  - SharePoint: the Entra tenant id (or "common")
   *  - NetDocuments: ignored (global endpoints)
   */
  tenant?: string;
  /** Override the default scope set. */
  scopes?: string[];
}

/** Default OAuth scopes per provider (least-privilege for sync + search). */
export const DMS_DEFAULT_SCOPES: Record<DmsProviderId, string[]> = {
  imanage: ["user", "documents"],
  netdocuments: ["read", "edit"],
  sharepoint: ["offline_access", "Files.ReadWrite.All", "Sites.Read.All"],
};

const LABELS: Record<DmsProviderId, string> = {
  imanage: "iManage Work",
  netdocuments: "NetDocuments",
  sharepoint: "Microsoft SharePoint",
};

/** Build the authorize/token endpoints for a provider + tenant. */
export function dmsOAuthEndpoints(id: DmsProviderId, tenant?: string): { authorizeUrl: string; tokenUrl: string } {
  switch (id) {
    case "imanage": {
      const host = tenant || "cloudimanage.com";
      return {
        authorizeUrl: `https://${host}/auth/oauth2/authorize`,
        tokenUrl: `https://${host}/auth/oauth2/token`,
      };
    }
    case "netdocuments":
      return {
        authorizeUrl: "https://vault.netvoyage.com/neWeb2/OAuth.aspx",
        tokenUrl: "https://api.vault.netvoyage.com/v1/OAuth",
      };
    case "sharepoint": {
      const t = tenant || "common";
      return {
        authorizeUrl: `https://login.microsoftonline.com/${t}/oauth2/v2.0/authorize`,
        tokenUrl: `https://login.microsoftonline.com/${t}/oauth2/v2.0/token`,
      };
    }
  }
}

/** Build the F-8 OAuth config for a DMS provider. */
export function dmsOAuthConfig(id: DmsProviderId, input: DmsOAuthInput): OAuthConfig {
  const { authorizeUrl, tokenUrl } = dmsOAuthEndpoints(id, input.tenant);
  return {
    authorizeUrl,
    tokenUrl,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    redirectUri: input.redirectUri,
    scopes: input.scopes ?? DMS_DEFAULT_SCOPES[id],
    // SharePoint (Entra) requires PKCE for SPA/public clients; confidential
    // clients pass a secret. Honor PKCE whenever no secret is supplied.
    usePkce: input.clientSecret === undefined,
  };
}

/** Build a full connector descriptor for a DMS provider. */
export function dmsConnectorDescriptor(id: DmsProviderId, input: DmsOAuthInput): ConnectorDescriptor {
  return {
    id,
    label: LABELS[id],
    kind: "dms",
    oauth: dmsOAuthConfig(id, input),
  };
}

/** All DMS provider ids, in a stable order. */
export const DMS_PROVIDER_IDS: DmsProviderId[] = ["imanage", "netdocuments", "sharepoint"];

/**
 * Register every DMS connector whose OAuth inputs the caller can resolve.
 * `resolve` returns null for a provider the org hasn't configured, so only
 * connectable providers land in the registry. Returns the ids registered.
 */
export function registerDmsConnectors(
  registry: ConnectorRegistry,
  resolve: (id: DmsProviderId) => DmsOAuthInput | null,
): DmsProviderId[] {
  const registered: DmsProviderId[] = [];
  for (const id of DMS_PROVIDER_IDS) {
    if (registry.has(id)) continue;
    const input = resolve(id);
    if (!input) continue;
    registry.register(dmsConnectorDescriptor(id, input));
    registered.push(id);
  }
  return registered;
}
