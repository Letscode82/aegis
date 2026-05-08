#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Tear down everything seeded by seed-m365-tenant.ps1.

.DESCRIPTION
    Removes the 10 demo users (Microsoft soft-deletes for 30 days),
    deletes the 5 M365 groups + their connected SharePoint sites,
    and clears the seed-state file.

    Does NOT delete the AEGIS Person rows by default — instead the
    TS counterpart is invoked which flips a `wiped` flag on the
    rows so matter relationships are preserved if you want to
    re-run the seed and keep the existing matter-to-person edges.

.PARAMETER Confirm
    Required. Without this switch the script reports what it would
    do but takes no action. Wiping the tenant is destructive; the
    Confirm gate is intentional.

.PARAMETER WithAegisHardDelete
    If set, the AEGIS sync deletes the seeded Person rows and any
    matter-party rows that reference them. Default: keep rows,
    flip metadata flag.

.EXAMPLE
    ./scripts/wipe-m365-tenant.ps1 -Confirm

.EXAMPLE
    ./scripts/wipe-m365-tenant.ps1 -Confirm -WithAegisHardDelete
#>

[CmdletBinding()]
param(
    [switch]$Confirm,
    [switch]$WithAegisHardDelete
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'helpers/_lib.ps1')
. (Join-Path $PSScriptRoot 'helpers/01-connect.ps1')

Import-Module Microsoft.Graph.Users -ErrorAction Stop
Import-Module Microsoft.Graph.Groups -ErrorAction Stop

$tenant = Resolve-Tenant

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════"
Write-Host " AEGIS M365 Dev Tenant Teardown" -ForegroundColor White
Write-Host " Tenant : $tenant" -ForegroundColor Gray
Write-Host " Mode   : $(if ($Confirm) { 'CONFIRMED — will delete' } else { 'Dry run — pass -Confirm to delete' })" -ForegroundColor $(if ($Confirm) { 'Yellow' } else { 'Gray' })
Write-Host "════════════════════════════════════════════════════════════════"
Write-Host ""

if (-not $Confirm) {
    Write-Host "Pass -Confirm to actually wipe the seeded resources." -ForegroundColor Yellow
    Write-Host "Below is what the script would delete:" -ForegroundColor Yellow
    Write-Host ""
}

# Reuse the connect helper but deduplicate the welcome
Connect-AegisM365Graph | Out-Null

# ───────────────────────────────────────────────────────────────────
# Users
# ───────────────────────────────────────────────────────────────────

Write-Step "Removing seeded users"
$users = (Get-SeedJson 'users.json').users
foreach ($spec in $users) {
    $upn = "$($spec.upnLocalPart)@$tenant"
    $existing = $null
    try { $existing = Get-MgUser -UserId $upn -ErrorAction Stop } catch {}
    if (-not $existing) {
        Write-Skip "$upn — already absent"
        continue
    }
    if (-not $Confirm) {
        Write-Warn "$upn — would delete (id $($existing.Id))"
        continue
    }
    Remove-MgUser -UserId $existing.Id
    Write-Ok "$upn — deleted (Microsoft soft-delete: 30-day restore window via Entra)"
}

# ───────────────────────────────────────────────────────────────────
# Groups + connected SharePoint sites
# ───────────────────────────────────────────────────────────────────

Write-Step "Removing seeded SharePoint sites (via M365 groups)"
$sites = (Get-SeedJson 'sites.json').sites
foreach ($spec in $sites) {
    $mailNickname = "aegis-seed-$($spec.urlSlug)"
    $existing = Get-MgGroup -Filter "mailNickname eq '$mailNickname'" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $existing) {
        Write-Skip "/sites/$($spec.urlSlug) — already absent"
        continue
    }
    if (-not $Confirm) {
        Write-Warn "/sites/$($spec.urlSlug) — would delete (group id $($existing.Id))"
        continue
    }
    Remove-MgGroup -GroupId $existing.Id
    Write-Ok "/sites/$($spec.urlSlug) — group + connected site deletion initiated"
}

# ───────────────────────────────────────────────────────────────────
# AEGIS DB
# ───────────────────────────────────────────────────────────────────

if ($Confirm) {
    Write-Step "Marking AEGIS Person rows as wiped"
    if (-not $env:DATABASE_URL) {
        Write-Warn "DATABASE_URL not set — skipping AEGIS sync. Person rows remain in DB tagged with seedBatch."
    } else {
        $repoRoot = Split-Path -Parent $PSScriptRoot
        Push-Location $repoRoot
        try {
            $args = @('--filter', '@aegis/db', 'exec', 'tsx', (Join-Path $PSScriptRoot 'seed-aegis-from-m365.ts'), '--wipe')
            if ($WithAegisHardDelete) { $args += '--hard-delete' }
            & pnpm @args
            if ($LASTEXITCODE -ne 0) {
                Write-Warn "AEGIS wipe finished with non-zero exit — check output above."
            } else {
                Write-Ok "AEGIS person rows updated"
            }
        } finally {
            Pop-Location
        }
    }

    if (Test-Path $Script:StateFile) {
        Remove-Item $Script:StateFile
        Write-Ok "State file cleared"
    }
}

Write-Host ""
Write-Host "Done." -ForegroundColor Green
if (-not $Confirm) {
    Write-Host "(no changes were made — re-run with -Confirm to actually wipe)" -ForegroundColor Yellow
}
Write-Host ""
