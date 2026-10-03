# Per-tenant SSO / SAML federation (C-6)

Each customer org federates to its own identity provider (Microsoft Entra
ID, Okta, Ping, …). Today Auth0 brokers the connection; the AEGIS side is
structured so the broker can later be swapped for direct NextAuth SAML/OIDC
per tenant (see CLAUDE.md → *Future migrations → Auth*) without moving the
config model or the resolver.

## The model

`OrganizationSsoConnection` — one row per org:

| Field | Purpose |
|---|---|
| `organizationId` | the tenant this connection belongs to (unique) |
| `displayName` | IdP label shown in admin + on the login hint |
| `protocol` | `OIDC` or `SAML` — the tenant's IdP kind |
| `connectionName` | the Auth0 connection that brokers this IdP; login routes to it |
| `emailDomains[]` | domains that map to this org (home-realm discovery + JIT) |
| `defaultRoleName` | role first-login users are provisioned into (canonical `RoleName`; invalid → `requester`) |
| `jitProvisioning` | whether unknown verified users from these domains are provisioned |
| `enabled` | master switch |

## How a login flows

1. A login page collects the user's email and calls
   `GET /api/auth/sso-hint?email=…`. If a domain matches an enabled
   connection it returns `{ sso: true, connection, loginUrl }`.
2. The page redirects to `loginUrl`
   (`/api/auth/login?connection=<name>`), which sends the user straight
   to their tenant IdP (via the Auth0 connection). No `?connection=` →
   `AUTH0_ENTERPRISE_CONNECTION` env (single-tenant) → Auth0's own
   universal-login / HRD.
3. On callback, `getResolvedUser` resolves the verified email. If the user
   doesn't exist yet and the email's domain matches an enabled connection
   with `jitProvisioning`, they're provisioned **into that connection's org
   with its default role** — a chain-sealed `auth.user.jit_provisioned`
   audit row records it. If no connection matches, the legacy
   `AEGIS_SSO_AUTO_PROVISION_DOMAINS` env allowlist is the fallback
   (first org, `requester`); otherwise the session is refused (strict).

## Admin

`GET | PUT | DELETE /api/admin/sso/connections` manages the caller org's
connection (gated `admin:manage_users`; every mutation writes a chain-sealed
`auth.sso.connection.{created,updated,deleted}` audit row). `PUT` body:

```json
{
  "displayName": "Acme — Entra ID",
  "protocol": "OIDC",
  "connectionName": "acme-entra",
  "emailDomains": ["acme.com", "acme.co.uk"],
  "defaultRoleName": "attorney",
  "jitProvisioning": true,
  "enabled": true
}
```

## Setting up a tenant (Auth0 broker, today)

1. In the Auth0 tenant, create the enterprise connection for the customer's
   IdP (Entra ID / Okta SAML or OIDC) and note its **connection name**.
2. `PUT /api/admin/sso/connections` for the customer org with that
   connection name, their email domains, and the default role.
3. Give the customer the login entry point; `/api/auth/sso-hint` routes
   their users to the right IdP by email domain.

## Guarantees preserved

- Dev mode (no `AUTH0_*`) still runs as the seeded admin, zero-config.
- The production fail-loud guard (`NODE_ENV=production` + no `AUTH0_SECRET`
  → throw at import) is unchanged.
- `defaultRoleName` can never silently grant more than configured — a
  non-canonical value resolves to least-privilege `requester`.
