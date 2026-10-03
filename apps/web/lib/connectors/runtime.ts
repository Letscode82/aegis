/**
 * Connector runtime wiring (C-1 / F-8) — the composition root for the shared
 * `@aegis/connectors` framework.
 *
 * `@aegis/connectors` is dependency-free: it declares the OAuth flow, the
 * registry, and the `TokenStore` seam, but takes no dependency on `@aegis/db`
 * or `fetch`. This module supplies those: the real prisma singleton + the
 * `@aegis/db` crypto pair back the production `DbTokenStore`, global `fetch`
 * backs the OAuth transport, and the environment supplies the Microsoft
 * client credentials. Every connector surface (C-1 Word, C-2 Outlook) resolves
 * its descriptor and token store through here.
 */
import type { NextApiRequest } from "next";
import { prisma, encryptSecret, decryptSecret } from "@aegis/db";
import {
  DbTokenStore,
  ConnectorRegistry,
  officeWordDescriptor,
  outlookDescriptor,
  OFFICE_WORD_CONNECTOR_ID,
  OUTLOOK_CONNECTOR_ID,
  type ConnectorCredentialClient,
  type ConnectorDescriptor,
  type OAuthHttp,
} from "@aegis/connectors";

/** Connectors wired today: C-1 Word add-in + C-2 Outlook email triage. */
export const WIRED_CONNECTOR_IDS = [OFFICE_WORD_CONNECTOR_ID, OUTLOOK_CONNECTOR_ID] as const;

/** Resolved Microsoft (Azure AD) app credentials, or null when unconfigured. */
export interface MicrosoftEnv {
  tenant: string;
  clientId: string;
  clientSecret?: string;
}

export function microsoftEnv(): MicrosoftEnv | null {
  const clientId = process.env.M365_CLIENT_ID;
  if (!clientId) return null;
  return {
    tenant: process.env.M365_TENANT_ID || "organizations",
    clientId,
    clientSecret: process.env.M365_CLIENT_SECRET || undefined,
  };
}

/** True when the Microsoft app credentials needed to run the OAuth flow are set. */
export function isConnectorConfigured(): boolean {
  return microsoftEnv() !== null;
}

/**
 * The token store is a process-wide singleton: the prisma client structurally
 * satisfies the narrow `ConnectorCredentialClient` the store needs, and the
 * `@aegis/db` crypto pair is synchronous (v1 dev / v2 AES; prod requires
 * `AEGIS_ENCRYPTION_KEY`).
 */
let _store: DbTokenStore | null = null;
export function getTokenStore(): DbTokenStore {
  if (!_store) {
    _store = new DbTokenStore(prisma as unknown as ConnectorCredentialClient, { encryptSecret, decryptSecret });
  }
  return _store;
}

/** The OAuth token-endpoint transport (global fetch, shaped for the framework). */
export const oauthFetch: OAuthHttp = async (url, init) => {
  const res = await fetch(url, { method: init.method, headers: init.headers, body: init.body });
  return { status: res.status, json: () => res.json(), text: () => res.text() };
};

/** The public base URL AEGIS is reached at, for building OAuth redirect URIs. */
export function publicBaseUrl(req: NextApiRequest): string {
  const override = process.env.AEGIS_PUBLIC_BASE_URL;
  if (override) return override.replace(/\/+$/, "");
  const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0] || "https";
  const host = (req.headers["x-forwarded-host"] as string | undefined) || req.headers.host || "localhost:5173";
  return `${proto}://${host}`;
}

/** The OAuth callback URI for a connector (must match the Azure AD app registration). */
export function redirectUriFor(req: NextApiRequest, connectorId: string): string {
  return `${publicBaseUrl(req)}/api/connectors/${encodeURIComponent(connectorId)}/callback`;
}

/**
 * Build the descriptor for a connector id using env credentials + the given
 * redirect URI. Returns null for an unknown id or when credentials are absent.
 */
export function buildDescriptor(connectorId: string, redirectUri: string): ConnectorDescriptor | null {
  const env = microsoftEnv();
  if (!env) return null;
  const opts = { clientId: env.clientId, clientSecret: env.clientSecret, tenant: env.tenant, redirectUri };
  switch (connectorId) {
    case OFFICE_WORD_CONNECTOR_ID:
      return officeWordDescriptor(opts);
    case OUTLOOK_CONNECTOR_ID:
      return outlookDescriptor(opts);
    default:
      return null;
  }
}

/**
 * Registry of the connectors' static metadata (id / label / kind) for the admin
 * listing. Built with a placeholder redirect — the live flow uses
 * `buildDescriptor` with the per-request redirect.
 */
let _registry: ConnectorRegistry | null = null;
export function connectorRegistry(): ConnectorRegistry {
  if (!_registry) {
    const reg = new ConnectorRegistry();
    const env = microsoftEnv();
    if (env) {
      for (const id of WIRED_CONNECTOR_IDS) {
        const d = buildDescriptor(id, `about:blank#${id}`);
        if (d) reg.register(d);
      }
    }
    _registry = reg;
  }
  return _registry;
}

/** The connectors' metadata for the admin UI (no secrets, no live redirect). */
export function connectorMeta(): Array<{ id: string; label: string; kind: string }> {
  return connectorRegistry()
    .list()
    .map((c) => ({ id: c.id, label: c.label, kind: c.kind }));
}
