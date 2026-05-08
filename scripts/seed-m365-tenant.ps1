#!/usr/bin/env pwsh
<#
.SYNOPSIS
    AEGIS M365 dev tenant seed — orchestrator.

.DESCRIPTION
    Provisions 10 demo users, 5 SharePoint sites, and seed content
    across 4 matter narratives in the configured M365 dev tenant,
    then syncs AEGIS Postgres so Person rows match M365 UPNs.

    Idempotent: safe to re-run after interruption. Resources that
    already exist are detected and skipped.

.PARAMETER VerifyOnly
    Read-only verification pass — reports what's present and what's
    missing without making any changes to the tenant or AEGIS DB.

.PARAMETER WithDraftHolds
    During the AEGIS DB sync, also create draft Legal Holds
    pre-populated with the relevant custodians for each matter.
    Default off; pass to give counsel ready demo material.

.PARAMETER SkipMail
.PARAMETER SkipOneDrive
.PARAMETER SkipSharePoint
.PARAMETER SkipAegisSync
    Per-stage skip flags for partial re-runs while debugging.

.EXAMPLE
    $env:M365_TENANT = '6bs6wq.onmicrosoft.com'
    $env:DATABASE_URL = 'postgres://…'
    ./scripts/seed-m365-tenant.ps1

.EXAMPLE
    ./scripts/seed-m365-tenant.ps1 -VerifyOnly

.EXAMPLE
    ./scripts/seed-m365-tenant.ps1 -WithDraftHolds
#>

[CmdletBinding()]
param(
    [switch]$VerifyOnly,
    [switch]$WithDraftHolds,
    [switch]$SkipMail,
    [switch]$SkipOneDrive,
    [switch]$SkipSharePoint,
    [switch]$SkipAegisSync
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'helpers/_lib.ps1')
. (Join-Path $PSScriptRoot 'helpers/01-connect.ps1')
. (Join-Path $PSScriptRoot 'helpers/02-create-users.ps1')
. (Join-Path $PSScriptRoot 'helpers/03-assign-licenses.ps1')
. (Join-Path $PSScriptRoot 'helpers/04-create-sharepoint-sites.ps1')
. (Join-Path $PSScriptRoot 'helpers/05-seed-mailbox-content.ps1')
. (Join-Path $PSScriptRoot 'helpers/06-seed-onedrive-content.ps1')
. (Join-Path $PSScriptRoot 'helpers/07-seed-sharepoint-content.ps1')
. (Join-Path $PSScriptRoot 'helpers/08-sync-aegis-database.ps1')

# ───────────────────────────────────────────────────────────────────
# Banner
# ───────────────────────────────────────────────────────────────────

$tenant = Resolve-Tenant
Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════"
Write-Host " AEGIS M365 Dev Tenant Seed" -ForegroundColor White
Write-Host " Tenant : $tenant" -ForegroundColor Gray
Write-Host " Mode   : $(if ($VerifyOnly) { 'Verify only (no changes)' } else { 'Seed' })" -ForegroundColor Gray
Write-Host " Holds  : $(if ($WithDraftHolds) { 'Draft holds will be created' } else { 'Holds skipped' })" -ForegroundColor Gray
Write-Host "════════════════════════════════════════════════════════════════"

$state = Get-SeedState
if (-not $state.tenant) {
    $state.tenant = $tenant
    $state.startedAt = (Get-Date).ToString('o')
    Save-SeedState $state
} elseif ($state.tenant -ne $tenant) {
    Write-Fail `
        "State file tenant mismatch: state=$($state.tenant), env=$tenant." `
        ("Either reset state by running scripts/wipe-m365-tenant.ps1 -Confirm,`n" +
         "or restore the original M365_TENANT env var.")
    exit 1
}

# ───────────────────────────────────────────────────────────────────
# Pipeline
# ───────────────────────────────────────────────────────────────────

try {
    $ctx = Connect-AegisM365Graph

    $userMap = Invoke-CreateUsers -VerifyOnly:$VerifyOnly
    Invoke-AssignLicenses -UserMap $userMap -VerifyOnly:$VerifyOnly

    $siteMap = $null
    if (-not $SkipSharePoint) {
        $siteMap = Invoke-CreateSharePointSites -UserMap $userMap -VerifyOnly:$VerifyOnly
    } else {
        Write-Skip "Skipping SharePoint site provisioning (per -SkipSharePoint)"
    }

    if (-not $SkipMail) {
        Invoke-SeedMailboxContent -UserMap $userMap -VerifyOnly:$VerifyOnly
    } else {
        Write-Skip "Skipping mailbox content seeding (per -SkipMail)"
    }

    if (-not $SkipOneDrive) {
        Invoke-SeedOneDriveContent -UserMap $userMap -VerifyOnly:$VerifyOnly
    } else {
        Write-Skip "Skipping OneDrive content seeding (per -SkipOneDrive)"
    }

    if (-not $SkipSharePoint -and $siteMap) {
        Invoke-SeedSharePointContent -UserMap $userMap -SiteMap $siteMap -VerifyOnly:$VerifyOnly
    }

    if (-not $SkipAegisSync) {
        Invoke-SyncAegisDatabase -WithDraftHolds:$WithDraftHolds -VerifyOnly:$VerifyOnly
    } else {
        Write-Skip "Skipping AEGIS database sync (per -SkipAegisSync)"
    }
}
catch {
    Write-Host ""
    Write-Host "════════════════════════════════════════════════════════════════"
    Write-Host " Seed run STOPPED" -ForegroundColor Red
    Write-Host "════════════════════════════════════════════════════════════════"
    Write-Host ""
    Write-Host "Reason: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "The state file (.seed-state.json) has been preserved. Re-run"
    Write-Host "the orchestrator to continue from where it left off; idempotency"
    Write-Host "rules will skip what's already done."
    exit 1
}

# ───────────────────────────────────────────────────────────────────
# Verification report
# ───────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════"
Write-Host " Verification" -ForegroundColor White
Write-Host "════════════════════════════════════════════════════════════════"

$createdCount = 0
$initialPasswords = @()
foreach ($key in $userMap.Keys) {
    $u = $userMap[$key]
    if ($u.created) {
        $createdCount++
        $initialPasswords += [pscustomobject]@{
            UPN              = $u.upn
            DisplayName      = $u.displayName
            InitialPassword  = $u.initialPassword
        }
    }
}

if ($initialPasswords.Count -gt 0) {
    Write-Host ""
    Write-Host "INITIAL PASSWORDS (printed once — not stored anywhere):" -ForegroundColor Yellow
    Write-Host "Each user must change at first sign-in."
    Write-Host ""
    $initialPasswords | Format-Table -AutoSize | Out-String | Write-Host
    Write-Host "Save these securely now — they will not be shown again." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Demo readiness:" -ForegroundColor White
Write-Host "  • Open Entra → Users to verify the 10 users are present"
$tenantPrefix = ($tenant -split '\.')[0]
Write-Host "  • SharePoint sites at https://$tenantPrefix.sharepoint.com/sites/<slug>"
Write-Host "  • In AEGIS, navigate to a matter (e.g. m-employment-watson) and click + NEW HOLD (GUIDED)"
Write-Host "  • Step 2: 'watson' or 'samira' should match real custodians"
Write-Host "  • Step 3: auto-discovery returns Mailbox + OneDrive + sites"
Write-Host ""
Write-Host "Next-step verification: pnpm --filter @aegis/db exec tsx packages/db/scripts/m365-smoke.ts"
Write-Host ""
Write-Host "Done." -ForegroundColor Green
Write-Host ""
