/**
 * E-signature connector descriptors (C-5).
 *
 * Builds the F-8 `ConnectorDescriptor` for each signing provider and registers
 * it in a `ConnectorRegistry`, so the admin connect flow resolves a provider's
 * OAuth config by id and never hard-codes an endpoint. Secrets and the account
 * base-URI come from the caller (env / per-org row), never from this module.
 */
import type { ConnectorDescriptor, ConnectorRegistry, OAuthConfig } from "@aegis/connectors";
import type { ESignatureProviderId } from "./types.js";

export interface ESignatureOAuthInput {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  /** Use the provider's demo/sandbox auth host instead of production. */
  sandbox?: boolean;
  scopes?: string[];
}

/** Default OAuth scopes per provider (least-privilege for send + status + download). */
export const ESIGNATURE_DEFAULT_SCOPES: Record<ESignatureProviderId, string[]> = {
  docusign: ["signature", "impersonation"],
  adobesign: ["agreement_write", "agreement_read", "agreement_send"],
};

const LABELS: Record<ESignatureProviderId, string> = {
  docusign: "DocuSign",
  adobesign: "Adobe Acrobat Sign",
};

/** Authorize/token endpoints for a provider (production or sandbox). */
export function esignatureOAuthEndpoints(
  id: ESignatureProviderId,
  sandbox = false,
): { authorizeUrl: string; tokenUrl: string } {
  switch (id) {
    case "docusign": {
      const host = sandbox ? "account-d.docusign.com" : "account.docusign.com";
      return {
        authorizeUrl: `https://${host}/oauth/auth`,
        tokenUrl: `https://${host}/oauth/token`,
      };
    }
    case "adobesign": {
      // Shard is resolved per-account after consent; the global secure host
      // accepts the initial authorization-code exchange.
      const host = sandbox ? "secure.na1.adobesign.com" : "secure.adobesign.com";
      return {
        authorizeUrl: `https://${host}/public/oauth/v2`,
        tokenUrl: `https://${host}/oauth/v2/token`,
      };
    }
  }
}

export function esignatureOAuthConfig(id: ESignatureProviderId, input: ESignatureOAuthInput): OAuthConfig {
  const { authorizeUrl, tokenUrl } = esignatureOAuthEndpoints(id, input.sandbox);
  return {
    authorizeUrl,
    tokenUrl,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    redirectUri: input.redirectUri,
    scopes: input.scopes ?? ESIGNATURE_DEFAULT_SCOPES[id],
    usePkce: input.clientSecret === undefined,
  };
}

export function esignatureConnectorDescriptor(
  id: ESignatureProviderId,
  input: ESignatureOAuthInput,
): ConnectorDescriptor {
  return {
    id,
    label: LABELS[id],
    kind: "esignature",
    oauth: esignatureOAuthConfig(id, input),
  };
}

export const ESIGNATURE_PROVIDER_IDS: ESignatureProviderId[] = ["docusign", "adobesign"];

/**
 * Register every e-signature connector whose OAuth inputs the caller can
 * resolve. `resolve` returns null for a provider the org hasn't configured.
 * Returns the ids registered.
 */
export function registerESignatureConnectors(
  registry: ConnectorRegistry,
  resolve: (id: ESignatureProviderId) => ESignatureOAuthInput | null,
): ESignatureProviderId[] {
  const registered: ESignatureProviderId[] = [];
  for (const id of ESIGNATURE_PROVIDER_IDS) {
    if (registry.has(id)) continue;
    const input = resolve(id);
    if (!input) continue;
    registry.register(esignatureConnectorDescriptor(id, input));
    registered.push(id);
  }
  return registered;
}
