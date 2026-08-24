# Go-live on real Microsoft 365 (per-tenant setup)

A repeatable ~20-minute checklist to point AEGIS at a real M365 tenant (yours or
a client's) so collection, review, the Case Graph, and legal-hold preservation
run on live data. Everything degrades gracefully if a step is skipped — the app
never breaks.

> **What lives where.** Only the **M365 app-only credentials** (tenant id /
> client id / client secret) can be set from the app UI (`/admin/m365`) — they're
> stored per-org, encrypted at rest. Everything else is an infrastructure secret
> and must be a Vercel environment variable: `AEGIS_ENCRYPTION_KEY`,
> `ANTHROPIC_API_KEY`, the `AUTH0_*` set, `DATABASE_URL`, `SEED_ADMIN_*`. Those
> deliberately do **not** live on a page.

---

## 0. Environment variables (Vercel → Settings → Environment Variables)

| Var | Needed for | Notes |
|---|---|---|
| `DATABASE_URL` | everything | Neon **pooled** connection string |
| `AUTH0_SECRET`, `AUTH0_BASE_URL`, `AUTH0_ISSUER_BASE_URL`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET` | login | production guard throws if `AUTH0_SECRET` unset |
| `AEGIS_ENCRYPTION_KEY` | storing M365 secrets + delegated tokens | **32 bytes**, base64 or hex. Generate: `openssl rand -base64 32` (or the PowerShell snippet below). **Keep it permanently** — losing it makes stored secrets unreadable (just re-enter them). |
| `M365_TENANT_ID` / `M365_CLIENT_ID` / `M365_CLIENT_SECRET` | app-only collection (fallback path) | Optional if you set per-org creds in the UI instead. |
| `ANTHROPIC_API_KEY` | live Claude in Copilot + Case Graph theory | Optional — without it those run the deterministic engine. Set `ANTHROPIC_MODEL` to pin a model. |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_NAME` | the admin's real login | Must match the Auth0 login email/name. |

Generate the encryption key (Windows PowerShell):
```powershell
$b = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
[Convert]::ToBase64String($b)
```

**After adding/changing any env var, Redeploy** (Deployments → latest → ⋯ →
Redeploy) — new vars only reach a fresh deployment.

---

## 1. Azure app registration (Entra ID → App registrations)

Create (or reuse) an app registration and grant + **admin-consent** these
**Application** Microsoft Graph permissions:

- `User.Read.All`, `Directory.Read.All` — custodian/directory discovery
- `Mail.Read` — mailbox collection (`Mail.ReadWrite`, `Mail.Send` only if you run the tenant seeder)
- `Files.Read.All`, `Sites.Read.All` — OneDrive/SharePoint collection (`.ReadWrite.All` for the seeder)
- `Organization.Read.All` — the "Verify now" round-trip
- `eDiscovery.ReadWrite.All` (Application **and** Delegated) — Purview preservation

Create a **client secret** and copy its **Value** (not the Secret ID).

---

## 2. Point AEGIS at the tenant (from the app — no redeploy)

1. Open `https://<your-app>/admin/m365`, log in as the admin.
2. **Microsoft 365 connection** card → **Set credentials** → enter **Tenant id**,
   **Client (application) id**, **Client secret (value)** → **Save & verify**.
   - The secret is encrypted at rest (AES-256-GCM) via `AEGIS_ENCRYPTION_KEY`.
   - On success the card shows **REAL GRAPH** + the verify round-trip time + tenant.
3. (Alternative) instead of the UI, set `M365_TENANT_ID` / `M365_CLIENT_ID` /
   `M365_CLIENT_SECRET` as Vercel env vars and redeploy — either path works;
   the per-org row wins when both are present.

**Verify:** the card shows `MODE: REAL GRAPH`, `SOURCE: Per-organization
credentials row`, and a recent **Last verified** time. Real collection is now on.

---

## 3. Seed tenant content (so collection returns hits)

Empty mailboxes = 0 hits. Seed story content (needs the ReadWrite app perms):
```powershell
cd <repo>
$env:AEGIS_M365_CLIENT_SECRET = "<client secret VALUE>"
.\scripts\seed-m365-tenant.ps1 -Tenant <tenant>.onmicrosoft.com          # mail + OneDrive + SharePoint
# or, verify only first:
.\scripts\seed-m365-tenant.ps1 -Tenant <tenant>.onmicrosoft.com -VerifyOnly
```
Idempotent — safe to re-run. Provisions demo users + SharePoint sites and seeds
the matter narratives (incl. the trade-secret investigation).

---

## 4. Delegated eDiscovery (only for real Purview preservation)

Collection / review / Case Graph do **not** need this. Do it only to make the
legal-hold *apply* step preserve in Purview.

1. **Service identity:** a real Entra user with an **E5** license (eDiscovery
   Premium is E5-gated). A dedicated `aegis-svc@<tenant>` is cleaner for
   production; any admin user works for a demo.
2. **Purview roles** (https://purview.microsoft.com, signed into **this tenant**,
   as a Global/Compliance admin): Settings → Roles & scopes → Role groups →
   **eDiscovery Manager** → add the service account. (Portal membership is
   sufficient; the `Add-eDiscoveryCaseAdmin` cmdlet needs the
   ExchangeOnlineManagement module and is optional.) Propagation: 30–60 min.
3. **Connect in AEGIS:** `/admin/m365` → eDiscovery card → **Connect** (or
   **Re-authorize**) → Device Code → sign in **as the service account** in a
   private window → approve. AEGIS stores the encrypted refresh token.
4. **Confirm:** click **Test eDiscovery** → expect **"eDiscovery API reachable"**.

If a custodian lacks eDiscovery Premium, AEGIS degrades to a vault-copy
preservation and records the gap on the defensibility scorecard — not an error.

---

## 5. End-to-end smoke (5 min)

1. `/admin/m365` → **Verify now** = OK, **Test eDiscovery** = reachable.
2. Investigations → open one → **Suggest custodians** → **Preserve & collect** on a
   seeded custodian → **Open collection**. Documents appear (no "simulated" flag).
3. Collection workspace: **ECA** funnel populates → **Review** shows real docs →
   **Validate** pilot → **Copilot** (Ask / Case Graph / Map) answers with citations.
4. Issue a **legal hold** → per-source badges move to **ON_HOLD** (real Purview).
5. Admin → **Audit Log** → **Verify chain** = intact.

---

## Switching to a new client — the short list

1. New Vercel env: fresh `AEGIS_ENCRYPTION_KEY`, `ANTHROPIC_API_KEY`, `AUTH0_*`,
   `DATABASE_URL`, `SEED_ADMIN_*` → redeploy → `prisma migrate deploy` + `db:seed`.
2. `/admin/m365` → **Set credentials** with the client's tenant/client/secret →
   Save & verify.
3. Seed the client tenant (`seed-m365-tenant.ps1`) — or point at their real data.
4. Grant the delegated account **eDiscovery Manager** in the client's Purview →
   `/admin/m365` → Re-authorize → Test.

That's the whole switch: one UI form for M365 creds, the rest is env + one seed.
