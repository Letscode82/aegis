#!/usr/bin/env pwsh
<#
    03-assign-licenses.ps1 — Assign the M365 E5 SKU
    (DEVELOPERPACK_E5) to each seeded user, then poll until Microsoft
    finishes provisioning Mailbox + OneDrive.

    Idempotency:
      - Skip if user already has the SKU
      - Set UsageLocation if missing (otherwise license assignment fails)

    Fail-loud on:
      - SKU not present in tenant (operator needs a free dev pack)
      - No available licenses (quota exhausted)
      - License assignment timeout
#>

. (Join-Path $PSScriptRoot '_lib.ps1')

Import-Module Microsoft.Graph.Users -ErrorAction Stop
Import-Module Microsoft.Graph.Identity.DirectoryManagement -ErrorAction Stop
Import-Module Microsoft.Graph.Users.Actions -ErrorAction Stop

# Microsoft 365 Developer Pack E5 — what dev tenants have. The script
# falls back to common production SKUs (ENTERPRISEPACK = E3,
# SPE_E5 = M365 E5) if the dev pack is absent so this also works in
# customer test tenants.
$PreferredSkuParts = @('DEVELOPERPACK_E5', 'SPE_E5', 'ENTERPRISEPREMIUM', 'ENTERPRISEPACK')

function Invoke-AssignLicenses {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] $UserMap,
        [switch]$VerifyOnly
    )

    Write-Step "Assigning licenses"

    $allSkus = Get-MgSubscribedSku
    $sku = $null
    foreach ($preferred in $PreferredSkuParts) {
        $sku = $allSkus | Where-Object { $_.SkuPartNumber -eq $preferred } | Select-Object -First 1
        if ($sku) { break }
    }
    if (-not $sku) {
        Write-Fail `
            "No suitable SKU found in tenant. Looked for: $($PreferredSkuParts -join ', ')." `
            ("Sign up for a free Microsoft 365 Developer subscription at`n" +
             "https://developer.microsoft.com/microsoft-365/dev-program — the dev pack`n" +
             "provisions DEVELOPERPACK_E5 with 25 licenses.")
        throw "No SKU available."
    }

    $available = $sku.PrepaidUnits.Enabled - $sku.ConsumedUnits
    Write-Ok "SKU: $($sku.SkuPartNumber) — $available of $($sku.PrepaidUnits.Enabled) licenses available"

    if (-not $VerifyOnly -and $available -lt $UserMap.Keys.Count) {
        $needed = $UserMap.Keys.Count
        Write-Fail `
            "License quota too low — need $needed, only $available available." `
            ("Either: release licenses from existing users in Entra → Users → Licenses,`n" +
             "or upgrade SKU tier. The seed cannot proceed without enough licenses for all 10 users.")
        throw "License quota exhausted."
    }

    foreach ($key in $UserMap.Keys) {
        $u = $UserMap[$key]
        if (-not $u.id) {
            Write-Skip "$($u.upn) — no user id (verify-only mode), skipping license check"
            continue
        }

        $userDetail = Get-MgUser -UserId $u.id -Property "id,userPrincipalName,usageLocation,assignedLicenses"
        $hasLicense = $userDetail.AssignedLicenses | Where-Object { $_.SkuId -eq $sku.SkuId }

        if ($VerifyOnly) {
            if ($hasLicense) {
                Write-Ok "$($u.upn) — licensed"
            } else {
                Write-Warn "$($u.upn) — NOT LICENSED"
            }
            continue
        }

        if ($hasLicense) {
            Write-Skip "$($u.upn) — already licensed"
            continue
        }

        # Ensure UsageLocation is set — required before license assignment
        if (-not $userDetail.UsageLocation) {
            Update-MgUser -UserId $u.id -UsageLocation 'US'
            Write-Ok "$($u.upn) — UsageLocation set to US"
        }

        $params = @{
            AddLicenses    = @(@{ SkuId = $sku.SkuId })
            RemoveLicenses = @()
        }
        try {
            Set-MgUserLicense -UserId $u.id -BodyParameter $params | Out-Null
            Write-Ok "$($u.upn) — license assigned"
        } catch {
            Write-Fail `
                "License assignment failed for $($u.upn)." `
                ("Error: $($_.Exception.Message)`n" +
                 "Common causes: UsageLocation not set, SKU service plans incompatible with`n" +
                 "user's existing assignments, or directory replication delay (retry in 60s).")
            throw
        }
    }

    if ($VerifyOnly) { return }

    # Wait for mailbox provisioning. After Set-MgUserLicense, Microsoft
    # takes 5–15 min to provision Exchange Online. Poll the user's
    # mailFolders endpoint as a readiness signal.
    Write-Step "Waiting for mailbox provisioning"

    foreach ($key in $UserMap.Keys) {
        $u = $UserMap[$key]
        # Skip Sarah Watson (account disabled — mailbox doesn't get
        # provisioned until/unless we enable it). For our demo the
        # license is what counts; her mailbox content seeding is
        # handled by enabling-temporarily then disabling-again in
        # helper 05.
        $isDisabled = (Get-MgUser -UserId $u.id -Property 'accountEnabled').AccountEnabled -eq $false
        if ($isDisabled) {
            Write-Skip "$($u.upn) — account disabled, mailbox provisioning deferred"
            continue
        }

        Wait-For -Description "Mailbox ready: $($u.upn)" -TimeoutSeconds 900 -IntervalSeconds 20 -Predicate {
            try {
                $folders = Invoke-MgGraphRequest -Method GET -Uri "/v1.0/users/$($u.id)/mailFolders?`$top=1"
                return ($null -ne $folders -and $folders.value)
            } catch {
                return $false
            }
        }
    }

    Write-Ok "License assignment + mailbox provisioning complete."
}
