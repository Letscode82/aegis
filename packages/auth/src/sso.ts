/**
 * Per-tenant SSO federation helpers (C-6).
 *
 * Each customer org federates to its own IdP, described by an
 * `OrganizationSsoConnection` row. These pure functions do the two
 * decisions that don't need a database: given a verified email, which
 * tenant connection owns it (home-realm discovery), and which role a
 * first-login user from that connection should be provisioned into.
 *
 * Kept SDK- and DB-agnostic so they unit-test without Postgres or Auth0,
 * and so the future NextAuth direct-federation swap reuses them unchanged.
 */
import { ALL_ROLES, type RoleName } from "./roles";

/** The connection fields the resolver needs (a subset of the DB row). */
export interface SsoConnectionRecord {
  organizationId: string;
  connectionName: string;
  emailDomains: string[];
  defaultRoleName: string;
  jitProvisioning: boolean;
  enabled: boolean;
}

/** Lower-case + strip a leading `@` and surrounding space from a domain. */
export function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^@/, "");
}

/** Extract the lower-cased domain from an email, or null if malformed. */
export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).trim().toLowerCase();
}

/**
 * Find the enabled connection whose `emailDomains` include this email's
 * domain (home-realm discovery). Returns null when no enabled connection
 * matches. Deterministic: if two enabled connections claim the same
 * domain (a misconfiguration), the first in input order wins.
 */
export function matchConnectionByEmail<T extends SsoConnectionRecord>(
  email: string,
  connections: readonly T[],
): T | null {
  const domain = emailDomain(email);
  if (!domain) return null;
  for (const c of connections) {
    if (!c.enabled) continue;
    if (c.emailDomains.some((d) => normalizeDomain(d) === domain)) return c;
  }
  return null;
}

/** Default role for a JIT-provisioned SSO user when none is configured. */
export const SSO_DEFAULT_ROLE: RoleName = "requester";

/**
 * The role a first-login user from this connection should land in. Falls
 * back to `requester` (least privilege) when the configured value isn't a
 * canonical role — a stale or hand-edited row can never silently grant a
 * broader role than intended.
 */
export function resolveSsoRoleName(connection: SsoConnectionRecord): RoleName {
  const configured = connection.defaultRoleName;
  return (ALL_ROLES as readonly string[]).includes(configured)
    ? (configured as RoleName)
    : SSO_DEFAULT_ROLE;
}
