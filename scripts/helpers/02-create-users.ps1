#!/usr/bin/env pwsh
<#
    02-create-users.ps1 — Provision the 10 demo users in the dev tenant.

    Idempotency: filter Get-MgUser by UPN. If exists, update only
    drifted properties. Don't recreate.

    Returns: hashtable keyed by userKey containing { upn, id, displayName,
    initialPassword (only on first creation, $null on existing rows) }.
    The orchestrator collects passwords across users and prints them
    once at the end.
#>

. (Join-Path $PSScriptRoot '_lib.ps1')

Import-Module Microsoft.Graph.Users -ErrorAction Stop

function Invoke-CreateUsers {
    [CmdletBinding()]
    param(
        [switch]$VerifyOnly
    )

    Write-Step "Provisioning users"

    $users = (Get-SeedJson 'users.json').users
    $tenant = Resolve-Tenant
    $result = @{}

    foreach ($spec in $users) {
        $upn = "$($spec.upnLocalPart)@$tenant"
        $existing = $null
        try {
            $existing = Get-MgUser -UserId $upn -ErrorAction Stop
        } catch {
            $existing = $null
        }

        if ($VerifyOnly) {
            if ($existing) {
                Write-Ok "$upn — present"
            } else {
                Write-Warn "$upn — MISSING"
            }
            $result[$spec.key] = [pscustomobject]@{
                upn             = $upn
                id              = $existing?.Id
                displayName     = $spec.displayName
                initialPassword = $null
                created         = $false
            }
            continue
        }

        if ($existing) {
            # Drift-check — only patch fields that differ.
            $patches = @{}
            if ($existing.DisplayName -ne $spec.displayName) { $patches.DisplayName = $spec.displayName }
            if ($existing.GivenName -ne $spec.givenName)     { $patches.GivenName   = $spec.givenName }
            if ($existing.Surname -ne $spec.surname)         { $patches.Surname     = $spec.surname }
            if ($existing.JobTitle -ne $spec.jobTitle)       { $patches.JobTitle    = $spec.jobTitle }
            if ($existing.Department -ne $spec.department)   { $patches.Department  = $spec.department }
            if ($existing.OfficeLocation -ne $spec.officeLocation) { $patches.OfficeLocation = $spec.officeLocation }
            if ($existing.City -ne $spec.city)               { $patches.City        = $spec.city }
            if ($existing.State -ne $spec.state)             { $patches.State       = $spec.state }
            if ($existing.Country -ne $spec.country)         { $patches.Country     = $spec.country }
            if ($existing.UsageLocation -ne $spec.usageLocation) { $patches.UsageLocation = $spec.usageLocation }
            if ($existing.AccountEnabled -ne $spec.accountEnabled) { $patches.AccountEnabled = $spec.accountEnabled }

            if ($patches.Count -gt 0) {
                Update-MgUser -UserId $existing.Id -BodyParameter $patches
                Write-Ok "$upn — updated $($patches.Count) drifted field(s): $(($patches.Keys | Sort-Object) -join ', ')"
            } else {
                Write-Skip "$upn — present, no drift"
            }

            $result[$spec.key] = [pscustomobject]@{
                upn             = $upn
                id              = $existing.Id
                displayName     = $spec.displayName
                initialPassword = $null
                created         = $false
            }
            continue
        }

        # Create new user
        $password = New-SecurePassword -Length 16
        $passwordProfile = @{
            ForceChangePasswordNextSignIn = $true
            Password                      = $password
        }
        $body = @{
            AccountEnabled    = $spec.accountEnabled
            DisplayName       = $spec.displayName
            GivenName         = $spec.givenName
            Surname           = $spec.surname
            UserPrincipalName = $upn
            MailNickname      = $spec.upnLocalPart
            JobTitle          = $spec.jobTitle
            Department        = $spec.department
            OfficeLocation    = $spec.officeLocation
            City              = $spec.city
            State             = $spec.state
            Country           = $spec.country
            UsageLocation     = $spec.usageLocation
            PasswordProfile   = $passwordProfile
        }

        try {
            $created = New-MgUser -BodyParameter $body
            Write-Ok "$upn — created (id $($created.Id))"
        } catch {
            Write-Fail `
                "Failed to create user $upn." `
                ("Error: $($_.Exception.Message)`n" +
                 "Most common cause: insufficient privileges. The signed-in admin needs the User Administrator or Global Administrator role.")
            throw
        }

        $result[$spec.key] = [pscustomobject]@{
            upn             = $upn
            id              = $created.Id
            displayName     = $spec.displayName
            initialPassword = $password
            created         = $true
        }
        Set-SeedStateMark -Bucket 'users' -Key $spec.key -Value @{
            upn       = $upn
            id        = $created.Id
            createdAt = (Get-Date).ToString('o')
        }
    }

    Write-Ok "User provisioning pass complete."
    return $result
}
