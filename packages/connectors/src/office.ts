/**
 * Microsoft 365 connector descriptors (C-1 / C-2).
 *
 * The first concrete providers on the F-8 framework: the Word add-in
 * (`office-word`) and the Outlook email-triage integration (`outlook`). Both
 * ride Microsoft's delegated OAuth2 authorization-code flow against the v2.0
 * endpoints — the same `login.microsoftonline.com/{tenant}/oauth2/v2.0/*`
 * shape the matter module's eDiscovery delegated auth uses — so AEGIS persists
 * one refreshable token per (org, connector) through the shared `TokenStore`
 * seam and never re-implements OAuth per surface.
 *
 * Pure config — no env reads, no secrets resolved here. The composition root
 * (apps/web) supplies `clientId` / `clientSecret` / `tenant` / `redirectUri`
 * from its environment and registers the resulting descriptor.
 */
import type { ConnectorDescriptor, ConnectorKind, OAuthConfig } from "./types.js";

/** Registry id of the Word add-in connector. */
export const OFFICE_WORD_CONNECTOR_ID = "office-word";
/** Registry id of the Outlook email-triage connector (consumed by C-2). */
export const OUTLOOK_CONNECTOR_ID = "outlook";

/** Microsoft identity platform v2.0 authorize endpoint for a tenant. */
export function microsoftAuthorizeUrl(tenant: string): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize`;
}

/** Microsoft identity platform v2.0 token endpoint for a tenant. */
export function microsoftTokenUrl(tenant: string): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`;
}

/**
 * Delegated Graph scopes for the Word add-in. `User.Read` identifies the
 * signed-in author; `Files.ReadWrite` lets AEGIS pull the active document and
 * write a redline back through Graph for the offline / email-it path;
 * `offline_access` yields the refresh token the token store persists.
 */
export const OFFICE_WORD_SCOPES = Object.freeze([
  "openid",
  "profile",
  "offline_access",
  "https://graph.microsoft.com/User.Read",
  "https://graph.microsoft.com/Files.ReadWrite",
]);

/**
 * Delegated Graph scopes for the Outlook triage connector (C-2). `Mail.Read`
 * polls the shared intake mailbox; `Mail.Send` posts the triage acknowledgement
 * reply. Mirrors the matter module's delegated scope set.
 */
export const OUTLOOK_SCOPES = Object.freeze([
  "openid",
  "profile",
  "offline_access",
  "https://graph.microsoft.com/User.Read",
  "https://graph.microsoft.com/Mail.Read",
  "https://graph.microsoft.com/Mail.Send",
]);

export interface MicrosoftConnectorOptions {
  id: string;
  label: string;
  kind: ConnectorKind;
  clientId: string;
  /** Omit for a public (PKCE) client; present for a confidential web app. */
  clientSecret?: string;
  /** Azure AD tenant id, or "organizations" / "common". */
  tenant: string;
  /** AEGIS OAuth callback for this connector. */
  redirectUri: string;
  scopes: readonly string[];
}

/** Build a Microsoft (Azure AD v2.0) OAuth config for a connector. */
export function microsoftOAuthConfig(opts: MicrosoftConnectorOptions): OAuthConfig {
  return {
    authorizeUrl: microsoftAuthorizeUrl(opts.tenant),
    tokenUrl: microsoftTokenUrl(opts.tenant),
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    redirectUri: opts.redirectUri,
    scopes: [...opts.scopes],
    // Confidential web app (client secret) → standard auth-code; public client
    // (no secret) → PKCE.
    usePkce: !opts.clientSecret,
  };
}

/** Build the full connector descriptor for a Microsoft 365 surface. */
export function microsoftConnectorDescriptor(opts: MicrosoftConnectorOptions): ConnectorDescriptor {
  return { id: opts.id, label: opts.label, kind: opts.kind, oauth: microsoftOAuthConfig(opts) };
}

/** The Word add-in connector descriptor (C-1). */
export function officeWordDescriptor(opts: {
  clientId: string;
  clientSecret?: string;
  tenant: string;
  redirectUri: string;
}): ConnectorDescriptor {
  return microsoftConnectorDescriptor({
    id: OFFICE_WORD_CONNECTOR_ID,
    label: "Microsoft Word (add-in)",
    kind: "other" satisfies ConnectorKind,
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    tenant: opts.tenant,
    redirectUri: opts.redirectUri,
    scopes: OFFICE_WORD_SCOPES,
  });
}

/** The Outlook email-triage connector descriptor (consumed by C-2). */
export function outlookDescriptor(opts: {
  clientId: string;
  clientSecret?: string;
  tenant: string;
  redirectUri: string;
}): ConnectorDescriptor {
  return microsoftConnectorDescriptor({
    id: OUTLOOK_CONNECTOR_ID,
    label: "Microsoft Outlook (email triage)",
    kind: "email" satisfies ConnectorKind,
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    tenant: opts.tenant,
    redirectUri: opts.redirectUri,
    scopes: OUTLOOK_SCOPES,
  });
}
