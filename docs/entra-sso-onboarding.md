# Entra ID SSO onboarding (W4-7)

How a client organization (e.g. DRL) signs into AEGIS with their own
Microsoft Entra ID accounts. Two phases — the pilot path is pure
configuration; the direct-federation swap stays pre-planned for when a
contract demands it.

## Phase 1 — Entra ID federation through Auth0 (pilot path, ~30 min, zero code)

Auth0 federates to Entra ID natively via an *enterprise connection*.
Users click "Log in", land on their own Microsoft login (their MFA,
their conditional-access policies), and come back with a verified
session. AEGIS code sees the exact same Auth0 session shape it already
handles.

### 1. Create the Entra app registration (client tenant, ~10 min)

Performed by the client's Entra admin (or you, with admin consent):

1. Azure Portal → Entra ID → **App registrations** → *New registration*.
   - Name: `AEGIS Legal Intake`
   - Supported account types: *Accounts in this organizational directory only*
   - Redirect URI (Web): `https://<your-auth0-domain>/login/callback`
2. **Certificates & secrets** → new client secret → copy the value.
3. **API permissions** → ensure `User.Read` (delegated) is present →
   *Grant admin consent*.
4. Note the **Application (client) ID** and **Directory (tenant) ID**.

### 2. Create the Auth0 enterprise connection (~10 min)

Auth0 Dashboard → Authentication → **Enterprise** → *Microsoft Azure AD*
→ Create:

- Microsoft Azure AD Domain: `<client-tenant>.onmicrosoft.com` (or the
  tenant ID)
- Client ID / Client Secret: from step 1
- Identity API: *Microsoft Identity Platform (v2)*
- Attributes: *Basic Profile* (email + name is all AEGIS reads)
- **Enable** the connection for the AEGIS application.
- Note the connection **name** (e.g. `drl-entra`).

Test with Auth0's *Try* button before touching AEGIS.

### 3. Configure AEGIS (~5 min, Vercel env)

| Env var | Value | Effect |
|---|---|---|
| `AUTH0_ENTERPRISE_CONNECTION` | the connection name, e.g. `drl-entra` | `/api/auth/login` sends users **straight to the client's Microsoft login** — no Auth0 picker screen. Unset = unchanged behavior. |
| `AEGIS_SSO_AUTO_PROVISION_DOMAINS` | e.g. `drreddys.com` | First login from a **verified** email on an allowed domain auto-provisions a User with the least-privilege `requester` role + linked Person, and writes a chain-sealed `auth.user.jit_provisioned` audit row. Unset = strict mode (only seeded/admin-invited emails can sign in). |

Redeploy. Staff/attorney accounts keep being managed through the Admin
→ Users surface (JIT provisions requesters only; an admin promotes
roles afterwards — every promotion already audited by the admin module).

### 4. Verify

1. Incognito → app URL → redirected to Microsoft login → sign in with a
   client-tenant account.
2. First login of an allowlisted domain: lands on the requester view
   (My Requests / New Request / Self-Service). Audit Log shows
   `auth.user.jit_provisioned`.
3. Non-allowlisted email: refused (no session resolution) — strict mode
   still owns everyone else.

## Phase 2 — Direct OIDC federation (pre-planned, when a contract demands it)

Some enterprises won't route identity through a vendor Auth0 tenant.
The swap is pre-planned in CLAUDE.md → *Future migrations → Auth:
Auth0 → enterprise-IdP federation (NextAuth.js)*:

- `Permission` / roles / `canUserDo` are SDK-agnostic — untouched.
- `getResolvedUser` is the only Auth0-importing function; it is
  reimplemented against NextAuth v5 + the client's OIDC issuer with the
  same `AuthUser` return shape — no module changes.
- The `[...auth0]` catch-all becomes `[...nextauth]`; the production
  fail-loud guard generalises to "issuer URL unset → throw".
- The W4-7 JIT provisioning + domain allowlist carry over unchanged —
  they key off the verified email, not the SDK.

Estimated at half a day of focused work; schedule against the client
contract, not speculatively.
