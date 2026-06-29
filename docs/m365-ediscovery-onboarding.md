# AEGIS M365 eDiscovery Setup (Customer Onboarding)

3 steps, 15 minutes total.

## Background — why a service account is required

Microsoft's Graph eDiscovery endpoints (`/security/cases/...`) do not
honor application-permissions tokens (confirmed via Microsoft Q&A,
late 2025 / early 2026). They require a **delegated** user token —
i.e., a token issued to a real Entra ID user identity. Every legal-
tech incumbent (Mitratech, Relativity, Exterro) handles this by
creating a dedicated M365 service account whose only job is to
authorize eDiscovery operations.

AEGIS follows the same pattern. The service account authorizes once
via OAuth Device Code; AEGIS stores the encrypted refresh token and
auto-refreshes the access token in the background.

The five non-eDiscovery Graph methods (custodian discovery, data-
source enumeration, SharePoint provisioning, etc.) continue to use
app-only credentials — they don't have the same gap.

## Step 1: Create dedicated M365 service account

In your M365 admin center (https://admin.microsoft.com → Users):

- Create a new user: `aegis-svc@<your-tenant>.onmicrosoft.com`
  (the precise email doesn't matter; pick a name your auditors will
  recognize as a service account).
- Assign an **M365 E5 license** — eDiscovery Premium is gated on E5.
- Set a strong password and store it in your password manager.
- Disable MFA for this user OR configure a service-account-friendly
  flow (app password). The Device Code flow doesn't carry interactive
  MFA prompts; if MFA is required by Conditional Access, the
  authorization will fail.

Naming convention: prefix with `aegis-svc-` so the audit trail in
Purview clearly attributes eDiscovery operations to AEGIS.

## Step 2: Assign Purview roles

In https://purview.microsoft.com → Settings → Roles & scopes → Role
groups:

- Add `aegis-svc@…` to the **eDiscovery Manager** role group.
- Promote to **eDiscovery Case Administrator** via PowerShell:

  ```powershell
  Connect-IPPSSession
  Add-eDiscoveryCaseAdmin -User <service-account-object-id>
  ```

This propagation may take **30–60 minutes** to reach Microsoft Graph.
Don't be surprised if Step 3 fails immediately after Step 2 with a
`Forbidden` error — give it an hour and retry.

For SharePoint sources, additionally grant **SharePoint
Administrator** in https://admin.microsoft.com → Roles → Role
assignments. This is needed for siteSource preservation.

## Step 3: Connect AEGIS

> **Operator pre-flight (post-deploy only):** sub-PR 4c.1 added a
> new `admin:m365:manage` permission. Existing admin role rows in
> tenants seeded before the deploy carry the older 38-permission
> bundle and won't have the new permission until the seed re-runs.
> The `/admin/m365` read views (status cards) tolerate this — they
> accept `admin:m365:manage` OR `admin:manage_users` — but the
> Connect / Test / Disconnect buttons require `admin:m365:manage`.
> Run `pnpm db:migrate:deploy && pnpm db:seed` against the
> production database after deploying. The seed is idempotent and
> rewrites `Role.permissions` for every canonical role; no data is
> lost.

In AEGIS:

1. Navigate to **Admin → M365 Integration** (`/admin/m365`).
2. Confirm the upper "Microsoft 365 connection" card shows
   `MODE: REAL GRAPH` and `STATUS: CONNECTED` (this requires app-only
   credentials to already be configured — that's a separate one-time
   setup).
3. In the lower **eDiscovery delegated authorization** card, click
   **Connect eDiscovery (Device Code)**.
4. A modal appears with a 4-character user code (e.g. `ABCD-EFGH`)
   and a verification URL. Click **Copy code**.
5. Open the verification URL (https://microsoft.com/devicelogin) in a
   new browser tab.
6. Paste the code, then sign in as
   `aegis-svc@<your-tenant>.onmicrosoft.com`.
7. Approve the eDiscovery permission scopes when prompted.
8. Return to the AEGIS tab. The modal auto-closes within 5–30 seconds
   after Microsoft issues tokens. The card now shows **CONNECTED**
   with the service account UPN, authorized-by, and token expiry.
9. Click **Test eDiscovery** to confirm the round-trip works. A toast
   appears: "eDiscovery API reachable — N case(s)".

That's it. AEGIS now pushes legal holds into Microsoft Purview as
real eDiscovery cases. Verify by opening
https://purview.microsoft.com → eDiscovery → Cases — AEGIS-issued
holds appear as `aegis-<holdId>` cases.

## Token refresh

AEGIS auto-refreshes the eDiscovery access token in the background
using the stored refresh token. Refresh happens transparently:

- Access tokens last ~1 hour.
- AEGIS refreshes 60 seconds before expiry.
- Refresh tokens are typically valid for 90 days; Microsoft rotates
  them on every refresh, and AEGIS persists each rotation.

No manual action is required during normal operation.

## When the connection breaks

Several events invalidate the stored token:

- Service account password rotated.
- MFA enrolment forced on the service account.
- Token revoked in Entra ID admin center.
- Refresh-token TTL exceeded (90 days of inactivity).

When this happens, AEGIS surfaces a banner in `/admin/m365`:

> ❌ **Authorization expired** — Active eDiscovery operations will
> fail until re-authorized. [Re-authorize Now]

eDiscovery operations will throw `M365DelegatedAuthExpiredError` with
the Microsoft AADSTS code in the audit ledger so defensibility
queries can reconstruct the gap. To restore service, click
**Re-authorize Now** and run the Device Code flow again with the
same service account.

## Per-org isolation

Each AEGIS organization holds its own service-account refresh token
in `OrganizationM365Credential.delegatedRefreshToken`. There is no
cross-tenant token sharing. If a customer cancels their AEGIS
subscription, the operator should revoke the service account in
Entra ID; the stored refresh token in AEGIS becomes useless
immediately.

## Security notes

- The refresh token is encrypted at rest using AEGIS's v1 prefix
  encryption helper. **Pre-production note:** as documented in
  `CLAUDE.md`, the v1 implementation is plaintext; KMS-backed
  envelope encryption ships before first paying customer (no
  interface change for callers).
- Every Graph call made on behalf of the service account writes a
  chain-sealed audit row tagged with `authMode: "delegated"` so
  defensibility queries can reconstruct exactly which auth path
  serviced each request.
- The Device Code flow is short-lived (15-minute TTL on the user
  code). Sessions persist in `M365DeviceCodeSession` so the flow
  works across multi-instance deployments — initiate on Lambda A,
  poll across A/B/C, complete on whichever instance happens to
  receive the authorized response from Microsoft. Tokens are
  written to `OrganizationM365Credential` in the same transaction
  that flips the session row to `completed`, so concurrent polls
  can't double-write.
- Old session rows accumulate slowly (one per Connect attempt).
  The admin "Legal Hold maintenance jobs" page exposes a manual
  cleanup trigger (`POST /api/admin/jobs/m365-device-code-cleanup`)
  that prunes anything older than 24 hours. Each row is < 1 KB so
  this is opportunistic — skipping the cleanup doesn't hurt.

## Intake email channel (P4b) — extra scopes + polling

The same delegated service account also powers the **intake email
channel** (P4b): AEGIS polls a shared mailbox and turns each message into
an `IntakeTicket` on the same pipeline as the form / webhook.

- **Extra delegated scopes.** `DELEGATED_SCOPES` now also requests
  `Mail.Read` and `Mail.Send`. A tenant that connected the service
  account *before* this change must **re-authorize** (Device Code) at
  `/admin/m365` so the refreshed token carries the mail scopes —
  otherwise the poll returns HTTP 403.
- **Configure a mailbox.** `POST /api/admin/intake/mailboxes`
  `{ "address": "legal-intake@contoso.com" }` (gated on
  `admin:m365:manage`). List with `GET`, enable/disable with
  `PUT /api/admin/intake/mailboxes/{id}`, remove with `DELETE`.
- **Poll.** `POST /api/admin/intake/mailboxes/poll` (`{}` = all enabled,
  or `{ "mailboxId": "…" }` for one). pg-boss-ready — point a scheduler
  (Vercel Cron / GitHub Actions) at it on a cadence until a worker
  runtime hosts the schedule directly. `lastReceivedAt` is the delta
  watermark, so re-polling never double-creates tickets.
- Every Graph mail read/send is audited (`m365.graph.call`,
  `authMode: "delegated"`), and each created ticket writes the usual
  `intake.ticket.created` chain row.
- **Outbound replies** are available via `sendDelegatedMail` (threaded
  with In-Reply-To); wiring an auto-acknowledgement reply is a small
  follow-up on top of this.

### Email hardening (idempotency, auth, auto-ack)

- **Webhook auth is fail-closed in production.** `POST /api/intake/email-webhook`
  requires `AEGIS_EMAIL_WEBHOOK_SECRET` (constant-time compare). With
  `NODE_ENV=production` and no secret set, it returns 503 rather than
  running open. Dev (unset) stays open for curl.
- **Idempotent ingest.** Both the webhook (`messageId`) and the poller
  (`internetMessageId`) dedupe on `IntakeTicket.externalMessageId`, so a
  webhook retry or Graph replay resolves to the existing ticket — no
  duplicate.
- **Outbound auto-acknowledgement (opt-in).** Set `autoAckEnabled` on a
  mailbox (`POST /api/admin/intake/mailboxes {address, autoAckEnabled:true}`
  or `PUT .../[id] {autoAckEnabled:true}`) and the poller sends a threaded
  reply (In-Reply-To) to each new sender via `sendDelegatedMail`,
  referencing the ticket id. Best-effort — a send failure never fails the
  poll. Off by default.
