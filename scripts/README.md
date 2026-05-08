# M365 Dev Tenant Seed

Bootstraps the AEGIS dev M365 tenant with 10 realistic users, 5
SharePoint team sites, and seed content across 4 matter narratives,
then syncs the AEGIS Postgres `Person` rows so emails match M365
UPNs. After running, the AEGIS Hold Wizard's auto-discovery works
against real M365 users for any demo path.

This is **not** an AEGIS code feature. It is a one-time tenant
bootstrap you run locally with admin credentials against a dev
tenant. The orchestrator is idempotent — re-run safely; it detects
existing resources and skips.

---

## What gets seeded

| Layer | Item | Source |
|---|---|---|
| Entra | 10 users (Marcus, Priya, Lena, Thomas, Samira, Rebecca, Carlos, Alex, Sarah, Daniel) | `seed-data/users.json` |
| Licensing | M365 E5 (`DEVELOPERPACK_E5` / `SPE_E5` / `ENTERPRISEPACK` fallback) per user | hard-coded in helper 03 |
| SharePoint | 5 team sites (`/sites/legal`, `/sites/contracts`, `/sites/engineering`, `/sites/finance`, `/sites/board`) | `seed-data/sites.json` |
| Mailboxes | 23 email threads across 4 matters | `seed-data/matters/*.json` + `seed-data/emails/*.txt` |
| OneDrive | per-user files referenced by matter manifests | matter manifests + `seed-data/documents/index.json` |
| SharePoint files | matter folder structures with realistic .docx and .xlsx | matter manifests + document templates |
| AEGIS Postgres | 10 `Person` rows + 4 matters (3 new + Snowflake refreshed) + matter-party links | `scripts/seed-aegis-from-m365.ts` |

The four matters cover four demo angles:
- `m-snowflake-msa` — IP / contract dispute (litigation buyer)
- `m-employment-watson` — Wrongful termination & retaliation (litigation buyer)
- `m-acme-acquisition` — M&A diligence with privileged board memos (M&A buyer)
- `m-sec-investigation` — SEC informal inquiry (regulatory buyer)

---

## One-time setup (5 min)

1. **Install Microsoft Graph PowerShell.**
   ```powershell
   Install-Module Microsoft.Graph -Scope CurrentUser -Force
   ```

2. **Set environment variables.**
   ```powershell
   $env:M365_TENANT  = "6bs6wq.onmicrosoft.com"
   $env:DATABASE_URL = (Get-Content apps\web\.env.production |
                        Select-String 'DATABASE_URL=').Line `
                        -replace 'DATABASE_URL="' -replace '"$'
   ```

3. **Run the seed** (first run requires admin consent prompt).
   ```powershell
   ./scripts/seed-m365-tenant.ps1
   ```

   First run takes ~30 minutes:
   - 5 min — user creation + license assignment
   - 10 min — license propagation (Microsoft latency for Mailbox / OneDrive)
   - 10 min — SharePoint site creation + content seeding
   - 5 min — AEGIS database sync

   **Initial passwords are printed once at the end of the first run**
   for newly-created users. Each user must change at first sign-in.
   Save them somewhere secure; they are not stored anywhere.

---

## Re-running

The script is safe to re-run. It detects existing resources and
skips them, only acting on what's missing or drifted. If the run is
interrupted (network blip, throttle, manual cancel), just run it
again — the state file `scripts/.seed-state.json` records progress.

```powershell
./scripts/seed-m365-tenant.ps1
```

### Verify-only

Read-only pass that reports what's present and what's missing,
makes no changes:

```powershell
./scripts/seed-m365-tenant.ps1 -VerifyOnly
```

### Per-stage skips

Useful while debugging.

```powershell
# Re-run AEGIS sync only
./scripts/seed-m365-tenant.ps1 -SkipMail -SkipOneDrive -SkipSharePoint

# Skip AEGIS sync (just the M365 side)
./scripts/seed-m365-tenant.ps1 -SkipAegisSync
```

### With draft holds

Creates one DRAFT `LegalHold` per matter pre-populated with the
matter's custodians, so counsel has immediate demo material instead
of starting from scratch each time.

```powershell
./scripts/seed-m365-tenant.ps1 -WithDraftHolds
```

---

## Wipe (start fresh)

```powershell
./scripts/wipe-m365-tenant.ps1 -Confirm
```

Without `-Confirm` the script does a dry run — it reports what it
would delete but takes no action.

What the wipe does:
- Deletes the 10 users (Microsoft soft-deletes for 30 days; recover
  from Entra → Deleted users if needed)
- Deletes the 5 M365 groups + their connected SharePoint sites
- Flips `metadata.wiped = true` on the corresponding AEGIS `Person`
  rows (preserves matter-party history)
- Clears `scripts/.seed-state.json`

For a hard delete of AEGIS rows (drops `Person` + `MatterParty` +
`LegalHoldCustodian` rows that reference the seeded users):

```powershell
./scripts/wipe-m365-tenant.ps1 -Confirm -WithAegisHardDelete
```

---

## Required Graph scopes

The orchestrator's first stage (helper `01-connect.ps1`) requests:

```
User.ReadWrite.All
Directory.ReadWrite.All
Sites.FullControl.All
Sites.Manage.All
Group.ReadWrite.All
Mail.Send
Mail.ReadWrite
Files.ReadWrite.All
LicenseAssignment.ReadWrite.All
Organization.Read.All
```

If the operator's account doesn't have admin consent for any of
these, the script fails loud at connect time with the exact list of
missing scopes and a remediation pointer. No partial-state runs.

---

## After seeding — try the wizard

In AEGIS:

1. Navigate to a matter (e.g. `m-employment-watson`).
2. Click `+ NEW HOLD (GUIDED)`.
3. Step 2 — search "watson" or "samira"; the real M365 custodians appear.
4. Step 3 — click "Auto-discover data sources"; mailbox + OneDrive +
   the Engineering SharePoint site appear with item counts.
5. Step 5 — `ISSUE HOLD`. Purview eDiscovery case appears with the
   real custodians' data sources locked.

For an end-to-end smoke test of the M365 client integration:

```bash
pnpm --filter @aegis/db exec tsx packages/db/scripts/m365-smoke.ts
```

---

## Layout

```
scripts/
├── seed-m365-tenant.ps1          Main orchestrator
├── wipe-m365-tenant.ps1          Teardown
├── seed-aegis-from-m365.ts       AEGIS Postgres sync (TypeScript)
├── README.md                     This file
├── .seed-state.json              Run state — gitignored, generated
├── seed-data/
│   ├── users.json                10 user specs
│   ├── sites.json                5 SharePoint site specs
│   ├── matters/                  4 matter manifests
│   ├── emails/                   Email body templates (.txt)
│   └── documents/index.json      Document body templates
└── helpers/
    ├── _lib.ps1                  Shared utilities (logging, JSON, state)
    ├── _docgen.ps1               .docx / .xlsx generation
    ├── 01-connect.ps1            Graph auth + scope verification
    ├── 02-create-users.ps1       Entra user provisioning
    ├── 03-assign-licenses.ps1    SKU assignment + mailbox wait
    ├── 04-create-sharepoint-sites.ps1
    ├── 05-seed-mailbox-content.ps1
    ├── 06-seed-onedrive-content.ps1
    ├── 07-seed-sharepoint-content.ps1
    └── 08-sync-aegis-database.ps1   Shells out to the TS helper
```

---

## Idempotency rules at a glance

| Resource | Detection key | On exists |
|---|---|---|
| User | UPN | Patch only drifted properties |
| License | SKU id on user's `assignedLicenses` | Skip |
| `UsageLocation` | User property | Set if missing |
| Group / SharePoint site | mailNickname `aegis-seed-<slug>` | Skip create; ensure owners + members |
| Email | `(matterId, emailId)` in `.seed-state.json` | Skip |
| OneDrive file | filename in user drive root | Skip if present |
| SharePoint file | full path in site drive | Skip if present (folders auto-created) |
| AEGIS Person | `(orgId, email)` | Update drifted fields |
| Matter | `id` | Update lead/jurisdiction; preserve title/desc |
| MatterParty | `(matterId, personId, role)` | Skip |

The `.seed-state.json` file is the only mutable artifact in the
scripts tree. It is regenerated by re-runs and removed by the wipe
script. It is git-ignored.

---

## Why a PowerShell + TypeScript split?

PowerShell handles every M365 operation. The Microsoft Graph
PowerShell SDK is the most stable surface for tenant operations —
it has the deepest cmdlet coverage, handles auth caching, and is
what every Microsoft KB article assumes. Using it in PowerShell
means we don't reinvent any of that.

TypeScript handles AEGIS Postgres because that is the language the
existing `@aegis/db` package and Prisma client are in. Running
Prisma operations from PowerShell would mean shelling out anyway;
this way the AEGIS sync gets full type-checking against the real
schema and reuses the existing `@prisma/client` build.

The handoff is a single shell-out at helper 08; both halves are
run from the same orchestrator with consistent verification output.

---

## Troubleshooting

**"License assignment failed: ... 0 of N licenses available"**
The dev pack ships with 25 E5 licenses. If a previous tenant has
consumed them, release some via Entra → Users → Licenses, or sign
up for a fresh dev tenant at developer.microsoft.com/microsoft-365.

**"Email send failed: ... mailbox not yet provisioned"**
Microsoft takes 5–15 minutes to provision Exchange Online and
OneDrive after a license assignment. The orchestrator polls for
mailbox readiness before sending, but if you skip stage 03 (e.g.
with `-SkipMail` followed by a re-run), you may hit this. Wait a
few minutes and re-run — idempotency will pick up where it stopped.

**"Connected, but the following Graph scopes were NOT granted"**
The signed-in account does not have admin consent for one or more
of the required scopes. Either re-consent during the prompt or
pre-consent in Entra → App registrations → Microsoft Graph
PowerShell → API permissions → Grant admin consent.

**"State file tenant mismatch"**
`scripts/.seed-state.json` was created against a different tenant
than `M365_TENANT` resolves to now. Either restore the original env
var or run the wipe script with `-Confirm` to clear state.

**"Organization 'AEGIS Demo Corp' not found"**
The base AEGIS seed has not run. Run `pnpm --filter @aegis/db
db:seed` first; this M365 seed extends the demo dataset rather than
creating it from scratch.
